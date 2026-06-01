import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? "";
const rendererDist = path.join(__dirname, "../dist");
const preloadPath = path.join(__dirname, "preload.js");
const projectMetaDir = ".babylon-editor";
const projectManifestName = "project.json";
const appStateName = "app-state.json";
const sceneBackupDirName = ".backups";
const maxSceneBackupsPerScene = 10;

let mainWindow: BrowserWindow | null = null;

interface RecentProjectRecord {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: string;
}

interface SceneRecord {
  id: string;
  name: string;
  file: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectManifest {
  version: 1;
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  activeSceneId: string;
  scenes: SceneRecord[];
}

interface ProjectSceneFile {
  version: 1;
  scene: SceneRecord;
  babylonScene: unknown | null;
}

interface ProjectScenePayload {
  project: ProjectManifest;
  scene: SceneRecord;
  babylonScene: unknown | null;
}

interface AppStateFile {
  version: 1;
  recentProjects: RecentProjectRecord[];
}

/** 判断未知值是否为普通对象，便于安全读取磁盘 JSON 字段。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 从 Node 文件系统异常中提取错误码，用来区分缺失和真实损坏。 */
function getNodeErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

/** 判断文件系统错误是否代表路径不存在。 */
function isMissingPathError(error: unknown): boolean {
  return getNodeErrorCode(error) === "ENOENT";
}

/** 把异常转成面向用户的简短文本，保留底层错误线索。 */
function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 创建主编辑器窗口，并按开发/生产环境加载不同渲染入口。 */
async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "Babylon 3D Editor",
    backgroundColor: "#111312",
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (isDevelopment) {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isLocalFile = url.startsWith("file://");
    const isDevServer = isDevelopment && url.startsWith(rendererUrl);
    if (!isLocalFile && !isDevServer) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (isDevelopment) {
    await mainWindow.loadURL(rendererUrl);
    return;
  }

  await mainWindow.loadFile(path.join(rendererDist, "index.html"));
}

/** 获取应用状态文件路径，最近项目列表统一存在 userData 中。 */
function getAppStatePath(): string {
  return path.join(app.getPath("userData"), appStateName);
}

/** 读取最近项目状态，文件缺失时返回空列表。 */
async function readAppState(): Promise<AppStateFile> {
  try {
    const content = await fs.readFile(getAppStatePath(), "utf-8");
    const parsed = JSON.parse(content) as AppStateFile;
    return {
      version: 1,
      recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects : []
    };
  } catch {
    return { version: 1, recentProjects: [] };
  }
}

/** 写入最近项目状态，保证 userData 目录存在。 */
async function writeAppState(state: AppStateFile): Promise<void> {
  await fs.mkdir(path.dirname(getAppStatePath()), { recursive: true });
  await fs.writeFile(getAppStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

/** 清理名称中的路径非法字符，避免新建项目或场景时生成不可用文件名。 */
function sanitizeName(input: string, fallback: string): string {
  const value = input.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ");
  return value || fallback;
}

/** 将展示名称转换为稳定文件名片段。 */
function toFileSlug(input: string, fallback: string): string {
  const slug = sanitizeName(input, fallback).replace(/\s+/g, "-").replace(/-+/g, "-");
  return slug || fallback;
}

/** 返回项目清单文件路径。 */
function getProjectManifestPath(projectPath: string): string {
  return path.join(projectPath, projectMetaDir, projectManifestName);
}

/** 返回场景文件绝对路径。 */
function getScenePath(projectPath: string, scene: SceneRecord): string {
  return path.join(projectPath, scene.file);
}

/** 判断指定路径是否存在，非缺失类错误继续抛出给调用方处理。 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}

/** 判断 JSON 场景记录是否具备可恢复的核心字段。 */
function isSceneRecord(value: unknown): value is SceneRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.file === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

/** 使用磁盘文件信息补齐场景记录，兼容旧文件缺少 scene 元数据的情况。 */
function createSceneRecordFromFile(fileName: string, parsed: unknown, modifiedAt: Date): SceneRecord {
  const scene = isRecord(parsed) && isSceneRecord(parsed.scene) ? parsed.scene : null;
  const timestamp = modifiedAt.toISOString();
  return {
    id: scene?.id ?? randomUUID(),
    name: sanitizeName(scene?.name ?? path.basename(fileName, ".scene.json"), "Recovered Scene"),
    file: path.join("scenes", fileName).replace(/\\/g, "/"),
    createdAt: scene?.createdAt ?? timestamp,
    updatedAt: scene?.updatedAt ?? timestamp
  };
}

/** 扫描 scenes 目录中的场景文件，用于修复丢失或脱钩的项目清单记录。 */
async function scanSceneRecordsFromDisk(projectPath: string): Promise<SceneRecord[]> {
  const scenesDir = path.join(projectPath, "scenes");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(scenesDir);
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }

  const sceneRecords = await Promise.all(
    entries
      .filter((fileName) => fileName.endsWith(".scene.json"))
      .map(async (fileName) => {
        try {
          const scenePath = path.join(scenesDir, fileName);
          const [content, stats] = await Promise.all([fs.readFile(scenePath, "utf-8"), fs.stat(scenePath)]);
          const parsed = JSON.parse(content) as unknown;
          return createSceneRecordFromFile(fileName, parsed, stats.mtime);
        } catch {
          return null;
        }
      })
  );

  return sceneRecords
    .filter((scene): scene is SceneRecord => scene !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/** 把磁盘上存在但清单遗漏的场景重新挂回项目，避免旧场景文件变成孤岛。 */
async function restoreSceneRecordsFromDisk(manifest: ProjectManifest): Promise<ProjectManifest> {
  const diskScenes = await scanSceneRecordsFromDisk(manifest.path);
  const existingKeys = new Set(manifest.scenes.flatMap((scene) => [scene.id, scene.file.toLowerCase()]));
  const recoveredScenes = diskScenes.filter((scene) => !existingKeys.has(scene.id) && !existingKeys.has(scene.file.toLowerCase()));
  const scenes = [...manifest.scenes, ...recoveredScenes];
  const activeSceneId = scenes.some((scene) => scene.id === manifest.activeSceneId) ? manifest.activeSceneId : scenes[0]?.id ?? "";

  return {
    ...manifest,
    activeSceneId,
    scenes,
    updatedAt: recoveredScenes.length > 0 ? new Date().toISOString() : manifest.updatedAt
  };
}

/** 读取项目清单并归一化项目路径，同时恢复磁盘上未登记的场景文件。 */
async function readProjectManifest(projectPath: string): Promise<ProjectManifest> {
  const manifestPath = getProjectManifestPath(projectPath);
  const content = await fs.readFile(manifestPath, "utf-8");
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("项目清单格式无效。");
  }

  const now = new Date().toISOString();
  const normalizedManifest: ProjectManifest = {
    version: 1,
    id: typeof parsed.id === "string" ? parsed.id : randomUUID(),
    name: sanitizeName(typeof parsed.name === "string" ? parsed.name : path.basename(projectPath), "Babylon Project"),
    path: projectPath,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : now,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : now,
    activeSceneId: typeof parsed.activeSceneId === "string" ? parsed.activeSceneId : "",
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes.filter(isSceneRecord) : []
  };
  return restoreSceneRecordsFromDisk(normalizedManifest);
}

/** 写入项目清单，项目自身元数据固定放在 .babylon-editor 目录。 */
async function writeProjectManifest(manifest: ProjectManifest): Promise<void> {
  await fs.mkdir(path.dirname(getProjectManifestPath(manifest.path)), { recursive: true });
  await fs.writeFile(getProjectManifestPath(manifest.path), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

/** 把项目加入最近列表，自动去重并限制数量。 */
async function rememberProject(manifest: ProjectManifest): Promise<void> {
  const state = await readAppState();
  const recent: RecentProjectRecord = {
    id: manifest.id,
    name: manifest.name,
    path: manifest.path,
    lastOpenedAt: new Date().toISOString()
  };
  state.recentProjects = [recent, ...state.recentProjects.filter((item) => item.path !== manifest.path)].slice(0, 12);
  await writeAppState(state);
}

/** 创建场景记录和对应场景文件。 */
async function createSceneFile(projectPath: string, name: string): Promise<SceneRecord> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const scene: SceneRecord = {
    id,
    name: sanitizeName(name, "New Scene"),
    file: path.join("scenes", `${toFileSlug(name, "scene")}-${id.slice(0, 8)}.scene.json`).replace(/\\/g, "/"),
    createdAt: now,
    updatedAt: now
  };
  const sceneFile: ProjectSceneFile = {
    version: 1,
    scene,
    babylonScene: null
  };
  await fs.mkdir(path.dirname(getScenePath(projectPath, scene)), { recursive: true });
  await fs.writeFile(getScenePath(projectPath, scene), `${JSON.stringify(sceneFile, null, 2)}\n`, "utf-8");
  return scene;
}

/** 读取单个场景文件，并以项目清单中的路径为准修正场景记录。 */
async function readSceneFile(projectPath: string, scene: SceneRecord): Promise<ProjectSceneFile> {
  const content = await fs.readFile(getScenePath(projectPath, scene), "utf-8");
  const parsed = JSON.parse(content) as ProjectSceneFile;
  const fileScene = parsed.scene?.id === scene.id ? parsed.scene : scene;
  return {
    version: 1,
    scene: {
      ...scene,
      ...fileScene,
      file: scene.file
    },
    babylonScene: parsed.babylonScene ?? null
  };
}

/** 在指定目录初始化一个项目，必要时创建默认场景。 */
async function initializeProject(projectPath: string, name: string): Promise<ProjectManifest> {
  await fs.mkdir(projectPath, { recursive: true });
  if (await pathExists(getProjectManifestPath(projectPath))) {
    throw new Error("目标目录已经存在项目清单，为避免覆盖旧场景，请改用打开项目。");
  }

  const now = new Date().toISOString();
  const scene = await createSceneFile(projectPath, "Main Scene");
  const manifest: ProjectManifest = {
    version: 1,
    id: randomUUID(),
    name: sanitizeName(name, path.basename(projectPath) || "Babylon Project"),
    path: projectPath,
    createdAt: now,
    updatedAt: now,
    activeSceneId: scene.id,
    scenes: [scene]
  };
  await writeProjectManifest(manifest);
  return manifest;
}

/** 从只有场景文件但缺少清单的目录恢复项目入口。 */
async function recoverProjectFromSceneFiles(projectPath: string, name: string): Promise<ProjectManifest | null> {
  const scenes = await scanSceneRecordsFromDisk(projectPath);
  if (scenes.length === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const manifest: ProjectManifest = {
    version: 1,
    id: randomUUID(),
    name: sanitizeName(name, path.basename(projectPath) || "Babylon Project"),
    path: projectPath,
    createdAt: scenes[0]?.createdAt ?? now,
    updatedAt: now,
    activeSceneId: scenes[0]?.id ?? "",
    scenes
  };
  await writeProjectManifest(manifest);
  return manifest;
}

/** 打开项目目录；仅在项目清单明确不存在时才初始化或从场景文件恢复。 */
async function openProjectDirectory(projectPath: string): Promise<ProjectManifest> {
  const manifestPath = getProjectManifestPath(projectPath);
  if (await pathExists(manifestPath)) {
    try {
      const manifest = await readProjectManifest(projectPath);
      await writeProjectManifest(manifest);
      await rememberProject(manifest);
      return manifest;
    } catch (error) {
      throw new Error(`项目清单已存在但无法读取，已停止自动初始化以保护旧场景。请检查 ${manifestPath}。${formatUnknownError(error)}`);
    }
  }

  const recoveredManifest = await recoverProjectFromSceneFiles(projectPath, path.basename(projectPath));
  const manifest = recoveredManifest ?? (await initializeProject(projectPath, path.basename(projectPath)));
  await rememberProject(manifest);
  return manifest;
}

/** 将 ISO 时间转换成适合文件名的备份时间戳。 */
function toBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** 清理超出数量限制的旧场景备份，避免项目目录无限增长。 */
async function pruneSceneBackups(backupDir: string, filePrefix: string): Promise<void> {
  const entries = await fs.readdir(backupDir).catch((error: unknown) => {
    if (isMissingPathError(error)) {
      return [] as string[];
    }
    throw error;
  });
  const backupFiles = await Promise.all(
    entries
      .filter((fileName) => fileName.startsWith(filePrefix) && fileName.endsWith(".scene.json"))
      .map(async (fileName) => {
        const backupPath = path.join(backupDir, fileName);
        const stats = await fs.stat(backupPath);
        return { backupPath, modifiedMs: stats.mtimeMs };
      })
  );

  await Promise.all(
    backupFiles
      .sort((left, right) => right.modifiedMs - left.modifiedMs)
      .slice(maxSceneBackupsPerScene)
      .map(async ({ backupPath }) => {
        await fs.unlink(backupPath).catch((error: unknown) => {
          if (!isMissingPathError(error)) {
            throw error;
          }
        });
      })
  );
}

/** 保存覆盖前复制旧场景文件，为误保存或加载失败后的恢复留出回退点。 */
async function backupSceneFile(projectPath: string, scene: SceneRecord): Promise<void> {
  const scenePath = getScenePath(projectPath, scene);
  if (!(await pathExists(scenePath))) {
    return;
  }

  const sceneBaseName = path.basename(scene.file, ".scene.json");
  const backupDir = path.join(path.dirname(scenePath), sceneBackupDirName);
  const backupPath = path.join(backupDir, `${sceneBaseName}-${toBackupTimestamp(new Date())}.scene.json`);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(scenePath, backupPath);
  await pruneSceneBackups(backupDir, `${sceneBaseName}-`);
}

/** 注册项目制应用需要的 IPC，渲染端只能调用受控方法。 */
function registerProjectIpc(): void {
  ipcMain.handle("projects:listRecent", async () => {
    const state = await readAppState();
    const checked = await Promise.all(
      state.recentProjects.map(async (item) => ({
        ...item,
        exists: await fs.access(getProjectManifestPath(item.path)).then(() => true).catch(() => false)
      }))
    );
    return checked;
  });

  ipcMain.handle("projects:create", async (_event, rawName: string) => {
    const projectName = sanitizeName(rawName, "Babylon Project");
    const options: OpenDialogOptions = {
      title: "选择新项目保存位置",
      defaultPath: path.join(os.homedir(), "Documents"),
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const projectPath = path.join(result.filePaths[0], projectName);
    const manifest = await initializeProject(projectPath, projectName);
    await rememberProject(manifest);
    return manifest;
  });

  ipcMain.handle("projects:open", async () => {
    const options: OpenDialogOptions = {
      title: "打开项目目录",
      defaultPath: path.join(os.homedir(), "Documents"),
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    return openProjectDirectory(result.filePaths[0]);
  });

  ipcMain.handle("projects:openRecent", async (_event, projectPath: string) => {
    return openProjectDirectory(projectPath);
  });

  ipcMain.handle("projects:loadScene", async (_event, projectPath: string, sceneId: string): Promise<ProjectScenePayload> => {
    const manifest = await readProjectManifest(projectPath);
    const scene = manifest.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      throw new Error("场景不存在，无法加载。");
    }

    const sceneFile = await readSceneFile(projectPath, scene);
    manifest.scenes = manifest.scenes.map((item) => (item.id === sceneId ? sceneFile.scene : item));
    manifest.activeSceneId = sceneId;
    manifest.updatedAt = new Date().toISOString();
    await writeProjectManifest(manifest);
    await rememberProject(manifest);
    return {
      project: manifest,
      scene: sceneFile.scene,
      babylonScene: sceneFile.babylonScene
    };
  });

  ipcMain.handle("projects:createScene", async (_event, projectPath: string, rawName: string) => {
    const manifest = await readProjectManifest(projectPath);
    const scene = await createSceneFile(projectPath, sanitizeName(rawName, "New Scene"));
    manifest.scenes = [...manifest.scenes, scene];
    manifest.activeSceneId = scene.id;
    manifest.updatedAt = new Date().toISOString();
    await writeProjectManifest(manifest);
    await rememberProject(manifest);
    return manifest;
  });

  ipcMain.handle("projects:saveScene", async (_event, projectPath: string, sceneId: string, babylonScene: unknown) => {
    const manifest = await readProjectManifest(projectPath);
    const scene = manifest.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      throw new Error("场景不存在，无法保存。");
    }

    const updatedScene = { ...scene, updatedAt: new Date().toISOString() };
    const sceneFile: ProjectSceneFile = {
      version: 1,
      scene: updatedScene,
      babylonScene
    };
    await backupSceneFile(projectPath, scene);
    await fs.writeFile(getScenePath(projectPath, updatedScene), `${JSON.stringify(sceneFile, null, 2)}\n`, "utf-8");
    manifest.scenes = manifest.scenes.map((item) => (item.id === sceneId ? updatedScene : item));
    manifest.activeSceneId = sceneId;
    manifest.updatedAt = updatedScene.updatedAt;
    await writeProjectManifest(manifest);
    await rememberProject(manifest);
    return manifest;
  });
}

/** 注册 Electron 生命周期，兼容 Windows/Linux 退出和 macOS 激活行为。 */
function registerAppLifecycle(): void {
  app.whenReady().then(async () => {
    registerProjectIpc();
    await createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

/** 保证桌面端只打开一个编辑器实例，避免资源导入状态分裂。 */
function enforceSingleInstance(): void {
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });
}

enforceSingleInstance();
registerAppLifecycle();
