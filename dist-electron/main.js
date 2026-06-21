import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? "";
const openDevToolsByDefault = process.env.ELECTRON_OPEN_DEVTOOLS === "1";
const rendererDist = path.join(__dirname, "../dist");
const preloadPath = path.join(__dirname, "preload.js");
const projectMetaDir = ".babylon-editor";
const projectManifestName = "project.json";
const projectAssetsDirName = "assets";
const projectAssetSourceDirName = "source";
const appStateName = "app-state.json";
const sceneBackupDirName = ".backups";
const maxSceneBackupsPerScene = 10;
const modelPackageMaxFiles = 200;
const modelPackageMaxTextFileBytes = 2 * 1024 * 1024;
const modelPackageMaxReturnedTextBytes = 8 * 1024 * 1024;
const modelPackageMaxTotalBytes = 1024 * 1024 * 1024;
const modelPackagePendingReplacementTtlMs = 30 * 60 * 1000;
const publishLogTailMaxChars = 128 * 1024;
const cadReferenceMaxImageBytes = 512 * 1024 * 1024;
const cadReferenceImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const projectAssetCopyAllowedExtensions = new Set([
    ".babylon",
    ".bin",
    ".dxf",
    ".dwg",
    ".glb",
    ".gltf",
    ".jpg",
    ".jpeg",
    ".ktx",
    ".ktx2",
    ".mtl",
    ".obj",
    ".png",
    ".stl",
    ".webp"
]);
const modelPackageAllowedExtensions = new Set([
    ".glb",
    ".gltf",
    ".bin",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".ktx",
    ".ktx2",
    ".ts",
    ".json",
    ".js"
]);
let mainWindow = null;
const pendingModelPackageReplacements = new Map();
const authorizedProjectPaths = new Set();
const authorizedModelPackageSourceRoots = new Set();
const sceneMutationQueues = new Map();
let publishBuildPromise = null;
/** 尽早向 Chromium 申请高性能 GPU，避免混合显卡或黑名单策略落到低功耗/软件渲染路径。 */
function configureGpuAcceleration() {
    app.commandLine.appendSwitch("ignore-gpu-blocklist");
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    app.commandLine.appendSwitch("enable-zero-copy");
    app.commandLine.appendSwitch("force_high_performance_gpu");
    if (process.platform === "win32") {
        app.commandLine.appendSwitch("use-angle", "d3d11");
    }
}
/** 判断未知值是否为普通对象，便于安全读取磁盘 JSON 字段。 */
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
/** 从 Node 文件系统异常中提取错误码，用来区分缺失和真实损坏。 */
function getNodeErrorCode(error) {
    return isRecord(error) && typeof error.code === "string" ? error.code : null;
}
/** 判断文件系统错误是否代表路径不存在。 */
function isMissingPathError(error) {
    return getNodeErrorCode(error) === "ENOENT";
}
/** 把异常转成面向用户的简短文本，保留底层错误线索。 */
function formatUnknownError(error) {
    return error instanceof Error ? error.message : String(error);
}
/** 根据图片扩展名返回 MIME，供渲染端 Blob URL 正确加载。 */
function getImageMimeType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".jpg" || extension === ".jpeg") {
        return "image/jpeg";
    }
    if (extension === ".webp") {
        return "image/webp";
    }
    if (extension === ".png") {
        return "image/png";
    }
    return "application/octet-stream";
}
/** 判断目标路径是否位于给定根目录内，防止 CAD 参照路径越界读取。 */
function isPathInsideDirectory(targetPath, directoryPath) {
    const relative = path.relative(directoryPath, targetPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
/** 只允许 Electron 打开常见安全外链协议，避免自定义协议被误触发。 */
function isSafeExternalUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
    }
    catch {
        return false;
    }
}
/** 判断导航目标是否仍属于当前应用入口。 */
function isAllowedAppNavigation(url) {
    if (isDevelopment) {
        return url.startsWith(rendererUrl);
    }
    try {
        const targetPath = fileURLToPath(url);
        return path.resolve(targetPath) === path.resolve(path.join(rendererDist, "index.html"));
    }
    catch {
        return false;
    }
}
/** 创建主编辑器窗口，并按开发/生产环境加载不同渲染入口。 */
async function createMainWindow() {
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
            webSecurity: true,
            backgroundThrottling: false
        }
    });
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
        if (isDevelopment && openDevToolsByDefault) {
            mainWindow?.webContents.openDevTools({ mode: "detach" });
        }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            void shell.openExternal(url);
        }
        return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (isAllowedAppNavigation(url)) {
            return;
        }
        event.preventDefault();
        if (isSafeExternalUrl(url)) {
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
function getAppStatePath() {
    return path.join(app.getPath("userData"), appStateName);
}
/** 读取最近项目状态，文件缺失时返回空列表。 */
async function readAppState() {
    try {
        const content = await fs.readFile(getAppStatePath(), "utf-8");
        const parsed = JSON.parse(content);
        return {
            version: 1,
            recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects : []
        };
    }
    catch {
        return { version: 1, recentProjects: [] };
    }
}
/** 写入最近项目状态，保证 userData 目录存在。 */
async function writeAppState(state) {
    await fs.mkdir(path.dirname(getAppStatePath()), { recursive: true });
    await fs.writeFile(getAppStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}
/** 清理名称中的路径非法字符，避免新建项目或场景时生成不可用文件名。 */
function sanitizeName(input, fallback) {
    const value = input.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").replace(/\s+/g, " ");
    return value || fallback;
}
/** 将展示名称转换为稳定文件名片段。 */
function toFileSlug(input, fallback) {
    const slug = sanitizeName(input, fallback).replace(/\s+/g, "-").replace(/-+/g, "-");
    return slug || fallback;
}
/** 规范化项目路径，用作主进程内部授权表的键。 */
function normalizeProjectPath(projectPath) {
    return path.resolve(projectPath).toLowerCase();
}
/** 串行化同一项目同一场景的磁盘写入，避免重命名和保存并发覆盖场景文件。 */
async function runSerializedSceneMutation(projectPath, sceneId, operation) {
    const queueKey = `${normalizeProjectPath(projectPath)}:${sceneId}`;
    const previous = sceneMutationQueues.get(queueKey) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const next = run.then(() => undefined, () => undefined);
    sceneMutationQueues.set(queueKey, next);
    try {
        return await run;
    }
    finally {
        if (sceneMutationQueues.get(queueKey) === next) {
            sceneMutationQueues.delete(queueKey);
        }
    }
}
/** 记录由用户选择或最近项目列表授权过的项目路径。 */
function authorizeProjectPath(projectPath) {
    authorizedProjectPaths.add(normalizeProjectPath(projectPath));
}
/** 限制 renderer 只能操作主进程已授权的项目目录。 */
function assertAuthorizedProjectPath(projectPath) {
    if (!authorizedProjectPaths.has(normalizeProjectPath(projectPath))) {
        throw new Error("项目路径未授权，请先通过启动页打开项目。");
    }
}
/** 规范化模型包源目录，并拒绝空路径、NUL 字符、非目录和根目录符号链接。 */
async function normalizeModelPackageSourceRoot(sourceRoot) {
    const trimmed = sourceRoot.trim();
    if (!trimmed || trimmed.includes("\0")) {
        throw new Error("模型包源目录路径无效。");
    }
    const resolved = path.resolve(trimmed);
    const stats = await fs.lstat(resolved);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new Error("模型包源目录必须是普通文件夹。");
    }
    return fs.realpath(resolved);
}
/** 记录用户本会话通过系统目录选择器授权过的模型包源目录。 */
async function authorizeModelPackageSourceRoot(sourceRoot) {
    const normalized = await normalizeModelPackageSourceRoot(sourceRoot);
    authorizedModelPackageSourceRoots.add(normalizeProjectPath(normalized));
    return normalized;
}
/** 仅允许本会话已授权的模型包源目录被 renderer 静默复用。 */
async function getAuthorizedModelPackageSourceRoot(sourceRoot) {
    try {
        const normalized = await normalizeModelPackageSourceRoot(sourceRoot);
        return authorizedModelPackageSourceRoots.has(normalizeProjectPath(normalized)) ? normalized : null;
    }
    catch {
        return null;
    }
}
/** 返回项目清单文件路径。 */
function getProjectManifestPath(projectPath) {
    return path.join(projectPath, projectMetaDir, projectManifestName);
}
/** 返回场景文件绝对路径，并限制场景只能位于项目 scenes 目录内。 */
function getScenePath(projectPath, scene) {
    if (path.isAbsolute(scene.file) || scene.file.includes("\0") || !scene.file.endsWith(".scene.json")) {
        throw new Error("场景文件路径无效。");
    }
    const scenesRoot = path.resolve(projectPath, "scenes");
    const scenePath = resolveProjectRelativePath(projectPath, scene.file);
    if (scenePath !== scenesRoot && !scenePath.startsWith(`${scenesRoot}${path.sep}`)) {
        throw new Error("场景文件只能位于 scenes 目录内。");
    }
    return scenePath;
}
/** 返回经过 symlink 防护的场景文件路径。 */
async function getSafeScenePath(projectPath, scene) {
    const scenePath = getScenePath(projectPath, scene);
    await assertNoSymlinkInExistingPath(path.join(projectPath, "scenes"), scenePath);
    return scenePath;
}
/** 确认项目相对路径解析后仍在项目目录内部，避免 IPC 路径越界。 */
function resolveProjectRelativePath(projectPath, relativePath) {
    const projectRoot = path.resolve(projectPath);
    const targetPath = path.resolve(projectRoot, relativePath);
    if (targetPath !== projectRoot && !targetPath.startsWith(`${projectRoot}${path.sep}`)) {
        throw new Error("项目路径越界，已拒绝访问。");
    }
    return targetPath;
}
/** 返回项目资产文件路径，并限制资产只能位于 assets 目录内。 */
function getProjectAssetPath(projectPath, projectFile) {
    const assetRoot = path.resolve(projectPath, projectAssetsDirName);
    const assetPath = resolveProjectRelativePath(projectPath, projectFile);
    if (assetPath !== assetRoot && !assetPath.startsWith(`${assetRoot}${path.sep}`)) {
        throw new Error("项目资产只能保存在 assets 目录内。");
    }
    return assetPath;
}
/** 检查已存在的路径层级中没有符号链接，避免项目资产读写经 symlink 逃逸。 */
async function assertNoSymlinkInExistingPath(rootPath, targetPath) {
    const root = path.resolve(rootPath);
    const target = path.resolve(targetPath);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        throw new Error("路径越界，已拒绝访问。");
    }
    try {
        const rootStats = await fs.lstat(root);
        if (rootStats.isSymbolicLink()) {
            throw new Error("项目资产路径包含符号链接，已拒绝访问。");
        }
    }
    catch (error) {
        if (!isMissingPathError(error)) {
            throw error;
        }
    }
    const relativeParts = path.relative(root, target).split(path.sep).filter(Boolean);
    let current = root;
    for (const part of relativeParts) {
        current = path.join(current, part);
        try {
            const stats = await fs.lstat(current);
            if (stats.isSymbolicLink()) {
                throw new Error("项目资产路径包含符号链接，已拒绝访问。");
            }
        }
        catch (error) {
            if (isMissingPathError(error)) {
                return;
            }
            throw error;
        }
    }
}
/** 把 IPC 传入的二进制数据转成 Buffer，避免用 base64 复制大模型内容。 */
function toBuffer(data) {
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data);
    }
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    throw new Error("资产文件数据格式无效。");
}
/** 从 Buffer 中切出精确 ArrayBuffer，避免返回底层池化缓冲区的多余字节。 */
function toExactArrayBuffer(buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(buffer);
    return arrayBuffer;
}
/** 判断指定路径是否存在，非缺失类错误继续抛出给调用方处理。 */
async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    }
    catch (error) {
        if (isMissingPathError(error)) {
            return false;
        }
        throw error;
    }
}
/** 判断 JSON 场景记录是否具备可恢复的核心字段。 */
function isSceneRecord(value) {
    return (isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.file === "string" &&
        typeof value.createdAt === "string" &&
        typeof value.updatedAt === "string");
}
/** 使用磁盘文件信息补齐场景记录，兼容旧文件缺少 scene 元数据的情况。 */
function createSceneRecordFromFile(fileName, parsed, modifiedAt) {
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
async function scanSceneRecordsFromDisk(projectPath) {
    const scenesDir = path.join(projectPath, "scenes");
    let entries = [];
    try {
        entries = await fs.readdir(scenesDir);
    }
    catch (error) {
        if (isMissingPathError(error)) {
            return [];
        }
        throw error;
    }
    const sceneRecords = await Promise.all(entries
        .filter((fileName) => fileName.endsWith(".scene.json"))
        .map(async (fileName) => {
        try {
            const scenePath = path.join(scenesDir, fileName);
            const [content, stats] = await Promise.all([fs.readFile(scenePath, "utf-8"), fs.stat(scenePath)]);
            const parsed = JSON.parse(content);
            return createSceneRecordFromFile(fileName, parsed, stats.mtime);
        }
        catch {
            return null;
        }
    }));
    return sceneRecords
        .filter((scene) => scene !== null)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
/** 把磁盘上存在但清单遗漏的场景重新挂回项目，避免旧场景文件变成孤岛。 */
async function restoreSceneRecordsFromDisk(manifest) {
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
async function readProjectManifest(projectPath) {
    const manifestPath = getProjectManifestPath(projectPath);
    const content = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!isRecord(parsed)) {
        throw new Error("项目清单格式无效。");
    }
    const now = new Date().toISOString();
    const normalizedManifest = {
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
async function writeProjectManifest(manifest) {
    await fs.mkdir(path.dirname(getProjectManifestPath(manifest.path)), { recursive: true });
    await fs.writeFile(getProjectManifestPath(manifest.path), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}
/** 把项目加入最近列表，自动去重并限制数量。 */
async function rememberProject(manifest) {
    authorizeProjectPath(manifest.path);
    const state = await readAppState();
    const recent = {
        id: manifest.id,
        name: manifest.name,
        path: manifest.path,
        lastOpenedAt: new Date().toISOString()
    };
    state.recentProjects = [recent, ...state.recentProjects.filter((item) => item.path !== manifest.path)].slice(0, 12);
    await writeAppState(state);
}
/** 创建场景记录和对应场景文件。 */
async function createSceneFile(projectPath, name) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const scene = {
        id,
        name: sanitizeName(name, "New Scene"),
        file: path.join("scenes", `${toFileSlug(name, "scene")}-${id.slice(0, 8)}.scene.json`).replace(/\\/g, "/"),
        createdAt: now,
        updatedAt: now
    };
    const sceneFile = {
        version: 1,
        scene,
        babylonScene: null
    };
    const scenePath = await getSafeScenePath(projectPath, scene);
    await fs.mkdir(path.dirname(scenePath), { recursive: true });
    await fs.writeFile(scenePath, `${JSON.stringify(sceneFile, null, 2)}\n`, "utf-8");
    return scene;
}
/** 读取单个场景文件，并以项目清单中的路径为准修正场景记录。 */
async function readSceneFile(projectPath, scene) {
    const content = await fs.readFile(await getSafeScenePath(projectPath, scene), "utf-8");
    const parsed = JSON.parse(content);
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
async function initializeProject(projectPath, name) {
    await fs.mkdir(projectPath, { recursive: true });
    if (await pathExists(getProjectManifestPath(projectPath))) {
        throw new Error("目标目录已经存在项目清单，为避免覆盖旧场景，请改用打开项目。");
    }
    const now = new Date().toISOString();
    const scene = await createSceneFile(projectPath, "Main Scene");
    const manifest = {
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
async function recoverProjectFromSceneFiles(projectPath, name) {
    const scenes = await scanSceneRecordsFromDisk(projectPath);
    if (scenes.length === 0) {
        return null;
    }
    const now = new Date().toISOString();
    const manifest = {
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
async function openProjectDirectory(projectPath) {
    const manifestPath = getProjectManifestPath(projectPath);
    if (await pathExists(manifestPath)) {
        try {
            const manifest = await readProjectManifest(projectPath);
            await writeProjectManifest(manifest);
            await rememberProject(manifest);
            return manifest;
        }
        catch (error) {
            throw new Error(`项目清单已存在但无法读取，已停止自动初始化以保护旧场景。请检查 ${manifestPath}。${formatUnknownError(error)}`);
        }
    }
    const recoveredManifest = await recoverProjectFromSceneFiles(projectPath, path.basename(projectPath));
    const manifest = recoveredManifest ?? (await initializeProject(projectPath, path.basename(projectPath)));
    await rememberProject(manifest);
    return manifest;
}
/** 将 ISO 时间转换成适合文件名的备份时间戳。 */
function toBackupTimestamp(date) {
    return date.toISOString().replace(/[:.]/g, "-");
}
/** 清理超出数量限制的旧场景备份，避免项目目录无限增长。 */
async function pruneSceneBackups(backupDir, filePrefix) {
    const entries = await fs.readdir(backupDir).catch((error) => {
        if (isMissingPathError(error)) {
            return [];
        }
        throw error;
    });
    const backupFiles = await Promise.all(entries
        .filter((fileName) => fileName.startsWith(filePrefix) && fileName.endsWith(".scene.json"))
        .map(async (fileName) => {
        const backupPath = path.join(backupDir, fileName);
        const stats = await fs.stat(backupPath);
        return { backupPath, modifiedMs: stats.mtimeMs };
    }));
    await Promise.all(backupFiles
        .sort((left, right) => right.modifiedMs - left.modifiedMs)
        .slice(maxSceneBackupsPerScene)
        .map(async ({ backupPath }) => {
        await fs.unlink(backupPath).catch((error) => {
            if (!isMissingPathError(error)) {
                throw error;
            }
        });
    }));
}
/** 保存覆盖前复制旧场景文件，为误保存或加载失败后的恢复留出回退点。 */
async function backupSceneFile(projectPath, scene) {
    const scenePath = await getSafeScenePath(projectPath, scene);
    if (!(await pathExists(scenePath))) {
        return;
    }
    const sceneBaseName = path.basename(scene.file, ".scene.json");
    const backupDir = path.join(path.dirname(scenePath), sceneBackupDirName);
    const backupPath = path.join(backupDir, `${sceneBaseName}-${toBackupTimestamp(new Date())}.scene.json`);
    await assertNoSymlinkInExistingPath(path.join(projectPath, "scenes"), backupPath);
    await fs.mkdir(backupDir, { recursive: true });
    await fs.copyFile(scenePath, backupPath);
    await pruneSceneBackups(backupDir, `${sceneBaseName}-`);
}
/** 生成项目资产相对路径，保证二进制写入和本地文件复制使用同一目录规则。 */
function getProjectAssetProjectFile(assetId, fileName) {
    const safeAssetId = toFileSlug(assetId, "asset");
    const safeName = sanitizeName(path.basename(fileName), "asset");
    return path
        .join(projectAssetsDirName, projectAssetSourceDirName, safeAssetId, safeName)
        .replace(/\\/g, "/");
}
/** 把渲染端导入的资产文件保存到项目 assets/source 目录，并返回项目相对路径。 */
async function saveProjectAssetFile(projectPath, assetId, fileName, data) {
    await readProjectManifest(projectPath);
    const projectFile = getProjectAssetProjectFile(assetId, fileName);
    const assetPath = getProjectAssetPath(projectPath, projectFile);
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), assetPath);
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.writeFile(assetPath, toBuffer(data));
    return projectFile;
}
/** 从用户选择的本地文件按路径复制到项目资产目录，避免大文件在渲染进程中额外常驻一份 ArrayBuffer。 */
async function saveProjectAssetFileFromPath(projectPath, assetId, sourcePath, fileName) {
    await readProjectManifest(projectPath);
    if (!sourcePath || sourcePath.includes("\0") || !path.isAbsolute(sourcePath)) {
        throw new Error("本地资产源文件路径无效。");
    }
    if (!projectAssetCopyAllowedExtensions.has(path.extname(fileName).toLowerCase())) {
        throw new Error("该类型文件不允许通过本地路径复制到项目资产。");
    }
    const sourceStats = await fs.stat(sourcePath);
    if (!sourceStats.isFile()) {
        throw new Error("本地资产源路径不是文件。");
    }
    const projectFile = getProjectAssetProjectFile(assetId, fileName);
    const assetPath = getProjectAssetPath(projectPath, projectFile);
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), assetPath);
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.copyFile(sourcePath, assetPath);
    return projectFile;
}
/** 读取项目内持久化资产文件，供渲染端重新构造 File 并继续实例化。 */
async function loadProjectAssetFile(projectPath, projectFile) {
    await readProjectManifest(projectPath);
    const assetPath = getProjectAssetPath(projectPath, projectFile);
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), assetPath);
    const [buffer, stats] = await Promise.all([fs.readFile(assetPath), fs.stat(assetPath)]);
    return {
        data: toExactArrayBuffer(buffer),
        lastModified: stats.mtimeMs
    };
}
/** 批量读取项目资产文件，先校验长度再返回数据，避免损坏 CAD 侧车触发渲染进程 OOM。 */
async function loadProjectAssetFiles(projectPath, requests) {
    await readProjectManifest(projectPath);
    const results = [];
    for (const request of requests) {
        if (!request || typeof request.projectFile !== "string") {
            results.push({
                projectFile: "",
                error: "项目资产批量读取请求无效。"
            });
            continue;
        }
        const { projectFile, expectedByteLength } = request;
        try {
            if (expectedByteLength !== undefined &&
                (!Number.isFinite(expectedByteLength) || expectedByteLength < 0 || !Number.isInteger(expectedByteLength))) {
                throw new Error("项目资产期望字节数无效。");
            }
            const assetPath = getProjectAssetPath(projectPath, projectFile);
            await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), assetPath);
            const stats = await fs.stat(assetPath);
            if (expectedByteLength !== undefined && stats.size !== expectedByteLength) {
                results.push({
                    projectFile,
                    error: `项目资产长度异常：期望 ${expectedByteLength} 字节，实际 ${stats.size} 字节。`
                });
                continue;
            }
            const buffer = await fs.readFile(assetPath);
            results.push({
                projectFile,
                data: toExactArrayBuffer(buffer),
                lastModified: stats.mtimeMs
            });
        }
        catch (error) {
            results.push({
                projectFile,
                error: formatUnknownError(error)
            });
        }
    }
    return results;
}
/** 读取 DXF 同目录下的外部图片参照，限制路径范围和文件大小，避免暴露通用文件读取能力。 */
async function readLocalReferenceFile(baseFilePath, referencePath) {
    if (!baseFilePath || !referencePath || referencePath.includes("\0")) {
        return null;
    }
    const basePath = path.resolve(baseFilePath);
    const baseExtension = path.extname(basePath).toLowerCase();
    if (baseExtension !== ".dxf" && baseExtension !== ".dwg") {
        return null;
    }
    try {
        const baseStats = await fs.stat(basePath);
        if (!baseStats.isFile()) {
            return null;
        }
    }
    catch (error) {
        if (!isMissingPathError(error)) {
            console.warn(`CAD 图纸路径校验失败：${basePath}`, error);
        }
        return null;
    }
    const baseDirectory = path.dirname(basePath);
    const baseRealPath = await fs.realpath(baseDirectory);
    const rawCandidate = path.isAbsolute(referencePath) ? path.resolve(referencePath) : path.resolve(baseDirectory, referencePath);
    const fallbackCandidate = path.resolve(baseDirectory, path.basename(referencePath));
    const candidates = [...new Set([rawCandidate, fallbackCandidate])];
    for (const candidate of candidates) {
        const extension = path.extname(candidate).toLowerCase();
        if (!cadReferenceImageExtensions.has(extension)) {
            continue;
        }
        try {
            const realPath = await fs.realpath(candidate);
            if (!isPathInsideDirectory(realPath, baseRealPath)) {
                continue;
            }
            const stats = await fs.stat(realPath);
            if (!stats.isFile() || stats.size > cadReferenceMaxImageBytes) {
                continue;
            }
            const buffer = await fs.readFile(realPath);
            return {
                data: toExactArrayBuffer(buffer),
                fileName: path.basename(realPath),
                lastModified: stats.mtimeMs,
                mimeType: getImageMimeType(realPath)
            };
        }
        catch (error) {
            if (!isMissingPathError(error)) {
                console.warn(`CAD 外部图片参照读取失败：${candidate}`, error);
            }
        }
    }
    return null;
}
/** 判断模型包文件扩展名是否允许复制到项目资产目录。 */
function isModelPackageAllowedFile(filePath) {
    return modelPackageAllowedExtensions.has(path.extname(filePath).toLowerCase());
}
/** 判断模型包中的文本文件是否需要返回内容给渲染端解析。 */
function isModelPackageTextFile(relativePath) {
    const lowerName = path.basename(relativePath).toLowerCase();
    return path.extname(relativePath).toLowerCase() === ".ts" || lowerName === "meta.json" || lowerName === "meta.js";
}
/** 按文件扩展名和主模型路径推断模型包文件角色。 */
function getModelPackageFileRole(relativePath, primaryModelFile) {
    const extension = path.extname(relativePath).toLowerCase();
    const lowerName = path.basename(relativePath).toLowerCase();
    if (relativePath === primaryModelFile) {
        return "primaryModel";
    }
    if (extension === ".glb" || extension === ".gltf" || extension === ".bin") {
        return "modelDependency";
    }
    if (extension === ".ts") {
        return "script";
    }
    if (lowerName === "meta.json" || lowerName === "meta.js") {
        return "meta";
    }
    if ([".png", ".jpg", ".jpeg", ".webp", ".ktx", ".ktx2"].includes(extension)) {
        return "texture";
    }
    return "other";
}
/** 校验模型包包号只能作为 assets/source 下的一级目录名使用。 */
function isSafeModelPackagePackageId(packageId) {
    return /^[a-z0-9][a-z0-9._-]*$/i.test(packageId) && packageId !== "." && packageId !== "..";
}
/** 从用户选择的模型包目录名生成安全 packageId，避免中文或特殊字符目录名触发资产目录校验。 */
function createModelPackagePackageId(sourceRoot) {
    const rawSlug = toFileSlug(path.basename(sourceRoot), "model-package");
    const asciiSlug = rawSlug
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/-+/g, "-")
        .replace(/^[^a-z0-9]+/i, "")
        .replace(/[^a-z0-9]+$/i, "")
        .toLowerCase();
    const safeSlug = asciiSlug || "model-package";
    return `${Date.now()}-${safeSlug}`;
}
/** 递归读取模型包目录，拒绝符号链接并限制文件数量。 */
async function readModelPackageDirectory(sourceRoot) {
    const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (entry.isSymbolicLink()) {
            throw new Error(`模型包不支持符号链接：${entry.name}`);
        }
        const entryPath = path.join(sourceRoot, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await readModelPackageDirectory(entryPath)));
            continue;
        }
        if (entry.isFile()) {
            files.push(entryPath);
        }
    }
    if (files.length > modelPackageMaxFiles) {
        throw new Error(`模型包文件数量超过 ${modelPackageMaxFiles} 个，请精简后再导入。`);
    }
    return files;
}
/** 复制模型包内单个文件到项目 assets/source/<packageId> 下，并返回项目相对路径。 */
async function copyModelPackageFileToProject(projectPath, packageId, sourceRoot, absoluteFilePath, targetPackageDirectory) {
    if (!isSafeModelPackagePackageId(packageId)) {
        throw new Error("模型包 packageId 不是安全的目录名。");
    }
    const relativePath = path.relative(sourceRoot, absoluteFilePath).replace(/\\/g, "/");
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
        throw new Error(`模型包文件路径不安全：${relativePath}`);
    }
    if (!isModelPackageAllowedFile(relativePath)) {
        throw new Error(`模型包包含不支持的文件类型：${relativePath}`);
    }
    const sourceStats = await fs.lstat(absoluteFilePath);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
        throw new Error(`模型包文件不是普通文件：${relativePath}`);
    }
    const projectFile = path
        .join(projectAssetsDirName, projectAssetSourceDirName, packageId, relativePath)
        .replace(/\\/g, "/");
    const assetPath = targetPackageDirectory ? path.join(targetPackageDirectory, relativePath) : getProjectAssetPath(projectPath, projectFile);
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), assetPath);
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.copyFile(absoluteFilePath, assetPath);
    const stats = await fs.stat(assetPath);
    return {
        relativePath,
        projectFile,
        size: stats.size,
        lastModified: stats.mtimeMs
    };
}
/** 返回模型包在项目 assets/source 下的最终目录，并限制 packageId 只能定位到一级目录。 */
function getModelPackageProjectDirectory(projectPath, packageId) {
    if (!isSafeModelPackagePackageId(packageId)) {
        throw new Error("模型包 packageId 不是安全的目录名。");
    }
    return getProjectAssetPath(projectPath, path.join(projectAssetsDirName, projectAssetSourceDirName, packageId));
}
/** 为替换模型包创建临时目录，复制全部成功后再交换到正式目录。 */
async function createModelPackageStagingDirectory(projectPath, packageId) {
    const packageDirectory = getModelPackageProjectDirectory(projectPath, packageId);
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), packageDirectory);
    await fs.mkdir(path.dirname(packageDirectory), { recursive: true });
    const stagingDirectory = `${packageDirectory}.tmp-${randomUUID()}`;
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), stagingDirectory);
    await fs.rm(stagingDirectory, { recursive: true, force: true });
    await fs.mkdir(stagingDirectory, { recursive: true });
    return stagingDirectory;
}
/** 把 staging 中的文件路径转换成项目资产相对路径，供渲染端在确认前读取新包内容。 */
function getModelPackageStagingProjectFile(projectPath, stagingDirectory, relativePath) {
    const stagingFile = path.join(stagingDirectory, relativePath);
    const projectFile = path.relative(projectPath, stagingFile).replace(/\\/g, "/");
    getProjectAssetPath(projectPath, projectFile);
    return projectFile;
}
/** 登记待确认的模型包替换，renderer 验证成功后才能激活并最终提交。 */
function registerPendingModelPackageReplacement(projectPath, packageId, stagingDirectory) {
    cleanupExpiredPendingModelPackageReplacements();
    const pendingToken = randomUUID();
    pendingModelPackageReplacements.set(pendingToken, {
        projectPath: path.resolve(projectPath),
        packageId,
        stagingDirectory,
        state: "staged",
        createdAt: Date.now()
    });
    return pendingToken;
}
/** 清理过期且尚未激活的模型包 staging 目录，避免取消导入后长期残留临时包。 */
function cleanupExpiredPendingModelPackageReplacements() {
    const now = Date.now();
    for (const [token, pending] of pendingModelPackageReplacements) {
        if (now - pending.createdAt <= modelPackagePendingReplacementTtlMs || pending.state === "activated") {
            continue;
        }
        pendingModelPackageReplacements.delete(token);
        void fs.rm(pending.stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
}
/** 读取并校验待确认替换请求，避免 renderer 伪造 packageId 或跨项目提交。 */
function getPendingModelPackageReplacement(projectPath, request) {
    const pendingToken = typeof request?.pendingToken === "string" ? request.pendingToken : "";
    const packageId = typeof request?.packageId === "string" ? request.packageId : "";
    if (!pendingToken || !packageId || !isSafeModelPackagePackageId(packageId)) {
        throw new Error("模型包替换提交请求无效。");
    }
    const pending = pendingModelPackageReplacements.get(pendingToken);
    if (!pending) {
        throw new Error("模型包替换请求已失效，请重新导入。");
    }
    if (pending.packageId !== packageId || path.resolve(pending.projectPath) !== path.resolve(projectPath)) {
        throw new Error("模型包替换请求和当前项目不匹配。");
    }
    return [pendingToken, pending];
}
/** 将 staging 目录切换为正式模型包目录，但保留旧目录备份，等待 renderer 替换场景成功后再最终确认。 */
async function activatePendingModelPackageReplacement(projectPath, request) {
    await readProjectManifest(projectPath);
    const [, pending] = getPendingModelPackageReplacement(projectPath, request);
    if (pending.state !== "staged") {
        return;
    }
    const packageDirectory = getModelPackageProjectDirectory(projectPath, pending.packageId);
    const backupDirectory = `${packageDirectory}.bak-${randomUUID()}`;
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), packageDirectory);
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), pending.stagingDirectory);
    await fs.mkdir(path.dirname(packageDirectory), { recursive: true });
    let movedExistingToBackup = false;
    try {
        try {
            await fs.rename(packageDirectory, backupDirectory);
            movedExistingToBackup = true;
            pending.backupDirectory = backupDirectory;
        }
        catch (error) {
            if (!isMissingPathError(error)) {
                throw error;
            }
        }
        await fs.rename(pending.stagingDirectory, packageDirectory);
        pending.state = "activated";
    }
    catch (error) {
        if (movedExistingToBackup) {
            await fs.rm(packageDirectory, { recursive: true, force: true }).catch(() => undefined);
            await fs.rename(backupDirectory, packageDirectory).catch(() => undefined);
            pending.backupDirectory = undefined;
        }
        throw error;
    }
}
/** 最终确认模型包替换，删除旧目录备份并释放 pending token。 */
async function finalizePendingModelPackageReplacement(projectPath, request) {
    await readProjectManifest(projectPath);
    const [pendingToken, pending] = getPendingModelPackageReplacement(projectPath, request);
    if (pending.backupDirectory) {
        await fs.rm(pending.backupDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    pendingModelPackageReplacements.delete(pendingToken);
}
/** 回滚未完成的模型包替换；未激活时删除 staging，已激活时恢复旧正式目录。 */
async function rollbackPendingModelPackageReplacement(projectPath, request) {
    await readProjectManifest(projectPath);
    const [pendingToken, pending] = getPendingModelPackageReplacement(projectPath, request);
    pendingModelPackageReplacements.delete(pendingToken);
    if (pending.state === "staged") {
        await fs.rm(pending.stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
        return;
    }
    const packageDirectory = getModelPackageProjectDirectory(projectPath, pending.packageId);
    await assertNoSymlinkInExistingPath(path.join(projectPath, projectAssetsDirName), packageDirectory);
    await fs.rm(packageDirectory, { recursive: true, force: true }).catch(() => undefined);
    if (pending.backupDirectory) {
        await fs.rename(pending.backupDirectory, packageDirectory);
    }
}
/** 从 renderer 提供的资产清单中提取可用于同包替换匹配的安全字段。 */
function readKnownModelPackages(request) {
    const value = isRecord(request) ? request : {};
    const packages = Array.isArray(value.knownPackages) ? value.knownPackages : [];
    return packages.slice(0, modelPackageMaxFiles).flatMap((item) => {
        const record = isRecord(item) ? item : {};
        const assetId = typeof record.assetId === "string" ? record.assetId : "";
        const packageId = typeof record.packageId === "string" ? record.packageId : "";
        const rootDirectoryName = typeof record.rootDirectoryName === "string" ? record.rootDirectoryName : "";
        if (!assetId || !packageId || !rootDirectoryName || !isSafeModelPackagePackageId(packageId)) {
            return [];
        }
        return [
            {
                assetId,
                packageId,
                rootDirectoryName,
                sourceRoot: typeof record.sourceRoot === "string" ? record.sourceRoot : undefined
            }
        ];
    });
}
/** 按 sourceRoot 优先、目录名兜底匹配已有模型包资产。 */
async function findModelPackageReplacement(sourceRoot, knownPackages) {
    const normalizedSourceRootKey = normalizeProjectPath(sourceRoot);
    for (const knownPackage of knownPackages) {
        if (!knownPackage.sourceRoot) {
            continue;
        }
        try {
            const knownSourceRoot = await normalizeModelPackageSourceRoot(knownPackage.sourceRoot);
            if (normalizeProjectPath(knownSourceRoot) === normalizedSourceRootKey) {
                return {
                    assetId: knownPackage.assetId,
                    packageId: knownPackage.packageId,
                    matchRule: "sourceRoot"
                };
            }
        }
        catch {
            // 历史 sourceRoot 失效时跳过路径匹配，后续仍可按目录名兜底。
        }
    }
    const selectedDirectoryName = path.basename(sourceRoot).toLowerCase();
    const directoryMatches = knownPackages.filter((knownPackage) => knownPackage.rootDirectoryName.toLowerCase() === selectedDirectoryName);
    const directoryMatch = directoryMatches.length === 1 ? directoryMatches[0] : undefined;
    return directoryMatch
        ? {
            assetId: directoryMatch.assetId,
            packageId: directoryMatch.packageId,
            matchRule: "rootDirectoryName"
        }
        : undefined;
}
/** 扫描、校验并复制文件夹模型包，返回渲染端构建 manifest 所需的轻量信息。 */
async function importModelPackageDirectory(projectPath, sourceRoot, replacement) {
    await readProjectManifest(projectPath);
    const absoluteFiles = await readModelPackageDirectory(sourceRoot);
    const relativeFiles = absoluteFiles.map((file) => path.relative(sourceRoot, file).replace(/\\/g, "/")).sort((left, right) => left.localeCompare(right));
    const allowedFiles = relativeFiles.filter(isModelPackageAllowedFile);
    const warnings = relativeFiles
        .filter((file) => !isModelPackageAllowedFile(file))
        .map((file) => `已忽略不支持的模型包文件：${file}`);
    let totalBytes = 0;
    for (const relativePath of allowedFiles) {
        const stats = await fs.stat(path.join(sourceRoot, relativePath));
        totalBytes += stats.size;
        if (totalBytes > modelPackageMaxTotalBytes) {
            throw new Error("模型包总大小超过 1GB，请精简后再导入。");
        }
    }
    const glbFiles = allowedFiles.filter((file) => path.extname(file).toLowerCase() === ".glb");
    const tsFiles = allowedFiles.filter((file) => path.extname(file).toLowerCase() === ".ts");
    const metaFiles = allowedFiles.filter((file) => ["meta.json", "meta.js"].includes(path.basename(file).toLowerCase()));
    if (glbFiles.length === 0) {
        throw new Error("模型包必须包含至少一个 .glb 文件。");
    }
    if (glbFiles.length > 1) {
        throw new Error("模型包包含多个 .glb 文件，当前版本需要包内只有一个主 GLB。");
    }
    if (tsFiles.length === 0) {
        throw new Error("模型包必须包含至少一个 .ts 参数脚本。");
    }
    if (tsFiles.length > 1) {
        warnings.push("模型包包含多个 .ts 脚本，已全部复制；属性栏会优先按 meta.json 或 .params.ts 解析参数脚本。");
    }
    if (metaFiles.length === 0) {
        throw new Error("模型包必须包含 meta.json 或 meta.js。");
    }
    if (metaFiles.length > 1) {
        warnings.push(`模型包包含多个 meta 文件，当前版本使用 ${metaFiles.includes("meta.json") ? "meta.json" : metaFiles[0]}。`);
    }
    const primaryModelFile = glbFiles[0];
    const scriptFile = tsFiles[0];
    const metaFile = metaFiles.includes("meta.json") ? "meta.json" : metaFiles[0];
    const packageId = replacement?.packageId ?? createModelPackagePackageId(sourceRoot);
    if (!isSafeModelPackagePackageId(packageId)) {
        throw new Error("模型包 packageId 不是安全的目录名。");
    }
    const projectFiles = [];
    const textFiles = {};
    let returnedTextBytes = 0;
    const stagingDirectory = replacement ? await createModelPackageStagingDirectory(projectPath, packageId) : undefined;
    let pendingToken;
    try {
        for (const relativePath of allowedFiles) {
            const copied = await copyModelPackageFileToProject(projectPath, packageId, sourceRoot, path.join(sourceRoot, relativePath), stagingDirectory);
            projectFiles.push({
                ...copied,
                stagingProjectFile: stagingDirectory ? getModelPackageStagingProjectFile(projectPath, stagingDirectory, copied.relativePath) : undefined,
                role: getModelPackageFileRole(copied.relativePath, primaryModelFile)
            });
            if (isModelPackageTextFile(relativePath)) {
                if (copied.size > modelPackageMaxTextFileBytes) {
                    warnings.push(`${relativePath} 超过 2MB，已复制但未返回文本内容。`);
                    continue;
                }
                if (returnedTextBytes + copied.size > modelPackageMaxReturnedTextBytes) {
                    warnings.push(`${relativePath} 会超过模型包文本返回上限，已复制但未返回文本内容。`);
                    continue;
                }
                const textFilePath = stagingDirectory
                    ? path.join(stagingDirectory, relativePath)
                    : getProjectAssetPath(projectPath, copied.projectFile);
                const text = await fs.readFile(textFilePath, "utf-8");
                returnedTextBytes += Buffer.byteLength(text, "utf-8");
                textFiles[relativePath] = text;
            }
        }
        pendingToken = stagingDirectory ? registerPendingModelPackageReplacement(projectPath, packageId, stagingDirectory) : undefined;
    }
    catch (error) {
        if (stagingDirectory) {
            await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
        }
        throw error;
    }
    if (metaFile.toLowerCase() === "meta.js") {
        warnings.push("meta.js 已复制到项目中，但当前版本不会执行 JavaScript 元数据文件。");
    }
    return {
        packageId,
        displayName: path.basename(sourceRoot),
        rootDirectoryName: path.basename(sourceRoot),
        sourceRoot,
        primaryModelFile,
        scriptFile,
        metaFile,
        projectFiles,
        textFiles,
        warnings,
        replacement: replacement
            ? {
                ...replacement,
                pendingToken
            }
            : undefined
    };
}
/** 刷新已导入模型包的脚本和 meta 文本，不替换 GLB 几何资产。 */
async function refreshModelPackageTextFiles(projectPath, sourceRoot, request) {
    await readProjectManifest(projectPath);
    if (!isSafeModelPackagePackageId(request.packageId)) {
        throw new Error("模型包刷新请求缺少合法 packageId。");
    }
    const absoluteFiles = await readModelPackageDirectory(sourceRoot);
    const relativeFiles = absoluteFiles.map((file) => path.relative(sourceRoot, file).replace(/\\/g, "/")).sort((left, right) => left.localeCompare(right));
    const textRelativeFiles = relativeFiles.filter((file) => isModelPackageAllowedFile(file) && isModelPackageTextFile(file));
    const ignoredFiles = relativeFiles.filter((file) => isModelPackageAllowedFile(file) && !isModelPackageTextFile(file));
    const warnings = [
        ...relativeFiles
            .filter((file) => !isModelPackageAllowedFile(file))
            .map((file) => `已忽略不支持的模型包文件：${file}`),
        ...ignoredFiles.map((file) => `刷新模型包只更新脚本和 meta，已保留项目内现有模型文件：${file}`)
    ];
    const tsFiles = textRelativeFiles.filter((file) => path.extname(file).toLowerCase() === ".ts");
    const metaFiles = textRelativeFiles.filter((file) => ["meta.json", "meta.js"].includes(path.basename(file).toLowerCase()));
    if (tsFiles.length === 0) {
        throw new Error("源模型包缺少 .ts 脚本，无法刷新旧实例。");
    }
    if (metaFiles.length === 0) {
        throw new Error("源模型包缺少 meta.json 或 meta.js，无法刷新旧实例。");
    }
    if (metaFiles.length > 1) {
        warnings.push(`源模型包包含多个 meta 文件，当前版本使用 ${metaFiles.includes("meta.json") ? "meta.json" : metaFiles[0]}。`);
    }
    let returnedTextBytes = 0;
    for (const relativePath of textRelativeFiles) {
        const stats = await fs.stat(path.join(sourceRoot, relativePath));
        if (stats.size > modelPackageMaxTextFileBytes) {
            throw new Error(`${relativePath} 超过 2MB，无法安全刷新模型包脚本。`);
        }
        returnedTextBytes += stats.size;
        if (returnedTextBytes > modelPackageMaxReturnedTextBytes) {
            throw new Error("模型包脚本和 meta 文本总量超过 8MB，无法安全刷新旧实例。");
        }
    }
    const projectFiles = [];
    const textFiles = {};
    for (const relativePath of textRelativeFiles) {
        const copied = await copyModelPackageFileToProject(projectPath, request.packageId, sourceRoot, path.join(sourceRoot, relativePath));
        const role = getModelPackageFileRole(copied.relativePath, "");
        projectFiles.push({ ...copied, role });
        const text = await fs.readFile(getProjectAssetPath(projectPath, copied.projectFile), "utf-8");
        textFiles[relativePath] = text;
    }
    const metaFile = metaFiles.includes("meta.json") ? "meta.json" : metaFiles[0];
    if (metaFile.toLowerCase() === "meta.js") {
        warnings.push("meta.js 已复制到项目中，但当前版本不会执行 JavaScript 元数据文件。");
    }
    return {
        packageId: request.packageId,
        rootDirectoryName: path.basename(sourceRoot),
        sourceRoot,
        metaFile,
        projectFiles,
        textFiles,
        warnings
    };
}
/** 返回源码项目根目录，发布构建只能在受信的应用根目录执行。 */
function getAppRootPath() {
    return path.resolve(__dirname, "..");
}
/** 追加构建日志尾部，避免长日志在主进程内无限累积。 */
function appendPublishLogTail(current, chunk) {
    const next = current + chunk.toString();
    return next.length > publishLogTailMaxChars ? next.slice(-publishLogTailMaxChars) : next;
}
/** 格式化 npm build 失败原因，并附带有限长度的最近日志。 */
function formatPublishBuildFailure(code, signal, logTail) {
    const reason = code === null ? `发布构建被中断${signal ? `（${signal}）` : ""}` : `发布构建失败，npm run build 退出码 ${code}`;
    const trimmedLog = logTail.trim();
    return trimmedLog ? `${reason}。\n最近日志：\n${trimmedLog}` : `${reason}。`;
}
/** 返回固定发布命令；Windows 通过 cmd.exe 启动 npm.cmd，规避 Node 直接 spawn .cmd 的 EINVAL。 */
function getPublishBuildCommand() {
    if (process.platform === "win32") {
        return {
            command: "cmd.exe",
            args: ["/d", "/s", "/c", "npm.cmd", "run", "build"]
        };
    }
    return {
        command: "npm",
        args: ["run", "build"]
    };
}
/** 执行固定的 npm run build，不允许渲染进程传入命令、参数或目录。 */
function runNpmBuild() {
    return new Promise((resolve, reject) => {
        const buildCommand = getPublishBuildCommand();
        let child;
        try {
            child = spawn(buildCommand.command, buildCommand.args, {
                cwd: getAppRootPath(),
                shell: false,
                windowsHide: true
            });
        }
        catch (error) {
            reject(new Error(`启动发布构建失败：${formatUnknownError(error)}`));
            return;
        }
        let logTail = "";
        let settled = false;
        child.stdout?.on("data", (chunk) => {
            logTail = appendPublishLogTail(logTail, chunk);
        });
        child.stderr?.on("data", (chunk) => {
            logTail = appendPublishLogTail(logTail, chunk);
        });
        child.on("error", (error) => {
            if (settled) {
                return;
            }
            settled = true;
            reject(new Error(`启动发布构建失败：${formatUnknownError(error)}`));
        });
        child.on("close", (code, signal) => {
            if (settled) {
                return;
            }
            settled = true;
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(formatPublishBuildFailure(code, signal, logTail)));
        });
    });
}
/** 校验 dist 目录存在，避免构建失败或产物缺失时误打开旧目录。 */
async function assertRendererDistExists() {
    try {
        const stat = await fs.stat(rendererDist);
        if (!stat.isDirectory()) {
            throw new Error("dist 路径不是目录。");
        }
    }
    catch (error) {
        if (error instanceof Error && error.message === "dist 路径不是目录。") {
            throw error;
        }
        throw new Error(`发布构建完成后未找到 dist 目录：${formatUnknownError(error)}`);
    }
}
/** 执行发布构建并打开 dist 目录，同一时间只允许一个发布流程运行。 */
async function buildAndOpenDist() {
    if (publishBuildPromise) {
        throw new Error("发布构建正在进行，请稍后。");
    }
    publishBuildPromise = (async () => {
        await runNpmBuild();
        await assertRendererDistExists();
        const openError = await shell.openPath(rendererDist);
        if (openError) {
            throw new Error(`发布构建成功，但打开 dist 目录失败：${openError}`);
        }
        return { distPath: rendererDist };
    })();
    try {
        return await publishBuildPromise;
    }
    finally {
        publishBuildPromise = null;
    }
}
/** 注册发布 IPC，渲染进程只能触发固定发布流程。 */
function registerPublishIpc() {
    ipcMain.handle("publish:buildAndOpenDist", async () => buildAndOpenDist());
}
/** 注册项目制应用需要的 IPC，渲染端只能调用受控方法。 */
function registerProjectIpc() {
    ipcMain.handle("projects:listRecent", async () => {
        const state = await readAppState();
        const checked = await Promise.all(state.recentProjects.map(async (item) => ({
            ...item,
            exists: await fs.access(getProjectManifestPath(item.path)).then(() => true).catch(() => false)
        })));
        return checked;
    });
    ipcMain.handle("projects:create", async (_event, rawName) => {
        const projectName = sanitizeName(rawName, "Babylon Project");
        const options = {
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
        const options = {
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
    ipcMain.handle("projects:openRecent", async (_event, projectPath) => {
        const state = await readAppState();
        const knownProject = state.recentProjects.some((item) => normalizeProjectPath(item.path) === normalizeProjectPath(projectPath));
        if (!knownProject) {
            throw new Error("最近项目路径未授权，请通过“打开项目”重新选择目录。");
        }
        return openProjectDirectory(projectPath);
    });
    ipcMain.handle("projects:loadScene", async (_event, projectPath, sceneId) => {
        assertAuthorizedProjectPath(projectPath);
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
    ipcMain.handle("projects:createScene", async (_event, projectPath, rawName) => {
        assertAuthorizedProjectPath(projectPath);
        const manifest = await readProjectManifest(projectPath);
        const scene = await createSceneFile(projectPath, sanitizeName(rawName, "New Scene"));
        manifest.scenes = [...manifest.scenes, scene];
        manifest.activeSceneId = scene.id;
        manifest.updatedAt = new Date().toISOString();
        await writeProjectManifest(manifest);
        await rememberProject(manifest);
        return manifest;
    });
    ipcMain.handle("projects:renameScene", async (_event, projectPath, sceneId, rawName) => {
        assertAuthorizedProjectPath(projectPath);
        return runSerializedSceneMutation(projectPath, sceneId, async () => {
            const manifest = await readProjectManifest(projectPath);
            const scene = manifest.scenes.find((item) => item.id === sceneId);
            if (!scene) {
                throw new Error("场景不存在，无法重命名。");
            }
            const nextName = sanitizeName(rawName, scene.name);
            const updatedAt = new Date().toISOString();
            const sceneFile = await readSceneFile(projectPath, scene);
            const updatedScene = {
                ...sceneFile.scene,
                id: scene.id,
                name: nextName,
                file: scene.file,
                updatedAt
            };
            const updatedSceneFile = {
                ...sceneFile,
                scene: updatedScene
            };
            await fs.writeFile(await getSafeScenePath(projectPath, scene), `${JSON.stringify(updatedSceneFile, null, 2)}\n`, "utf-8");
            manifest.scenes = manifest.scenes.map((item) => (item.id === sceneId ? updatedScene : item));
            manifest.updatedAt = updatedAt;
            await writeProjectManifest(manifest);
            await rememberProject(manifest);
            return manifest;
        });
    });
    ipcMain.handle("projects:saveScene", async (_event, projectPath, sceneId, babylonScene) => {
        assertAuthorizedProjectPath(projectPath);
        return runSerializedSceneMutation(projectPath, sceneId, async () => {
            const manifest = await readProjectManifest(projectPath);
            const scene = manifest.scenes.find((item) => item.id === sceneId);
            if (!scene) {
                throw new Error("场景不存在，无法保存。");
            }
            const updatedScene = { ...scene, updatedAt: new Date().toISOString() };
            const sceneFile = {
                version: 1,
                scene: updatedScene,
                babylonScene
            };
            await backupSceneFile(projectPath, scene);
            await fs.writeFile(await getSafeScenePath(projectPath, updatedScene), `${JSON.stringify(sceneFile, null, 2)}\n`, "utf-8");
            manifest.scenes = manifest.scenes.map((item) => (item.id === sceneId ? updatedScene : item));
            manifest.activeSceneId = sceneId;
            manifest.updatedAt = updatedScene.updatedAt;
            await writeProjectManifest(manifest);
            await rememberProject(manifest);
            return manifest;
        });
    });
    ipcMain.handle("projects:saveAssetFile", async (_event, projectPath, assetId, fileName, data) => {
        assertAuthorizedProjectPath(projectPath);
        return saveProjectAssetFile(projectPath, assetId, fileName, data);
    });
    ipcMain.handle("projects:saveAssetFileFromPath", async (_event, projectPath, assetId, sourcePath, fileName) => {
        assertAuthorizedProjectPath(projectPath);
        return saveProjectAssetFileFromPath(projectPath, assetId, sourcePath, fileName);
    });
    ipcMain.handle("projects:loadAssetFile", async (_event, projectPath, projectFile) => {
        assertAuthorizedProjectPath(projectPath);
        return loadProjectAssetFile(projectPath, projectFile);
    });
    ipcMain.handle("projects:loadAssetFiles", async (_event, projectPath, requests) => {
        assertAuthorizedProjectPath(projectPath);
        if (!Array.isArray(requests)) {
            throw new Error("项目资产批量读取请求必须是数组。");
        }
        return loadProjectAssetFiles(projectPath, requests);
    });
    ipcMain.handle("files:readLocalReference", async (_event, baseFilePath, referencePath) => readLocalReferenceFile(baseFilePath, referencePath));
    ipcMain.handle("projects:importModelPackage", async (_event, projectPath, request) => {
        assertAuthorizedProjectPath(projectPath);
        const options = {
            title: "选择模型包文件夹",
            defaultPath: path.join(os.homedir(), "Documents"),
            properties: ["openDirectory"]
        };
        const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
        if (result.canceled || !result.filePaths[0]) {
            return null;
        }
        const sourceRoot = await authorizeModelPackageSourceRoot(result.filePaths[0]);
        const replacement = await findModelPackageReplacement(sourceRoot, readKnownModelPackages(request));
        return importModelPackageDirectory(projectPath, sourceRoot, replacement);
    });
    ipcMain.handle("projects:activateModelPackageReplacement", async (_event, projectPath, request) => {
        assertAuthorizedProjectPath(projectPath);
        return activatePendingModelPackageReplacement(projectPath, request);
    });
    ipcMain.handle("projects:finalizeModelPackageReplacement", async (_event, projectPath, request) => {
        assertAuthorizedProjectPath(projectPath);
        return finalizePendingModelPackageReplacement(projectPath, request);
    });
    ipcMain.handle("projects:rollbackModelPackageReplacement", async (_event, projectPath, request) => {
        assertAuthorizedProjectPath(projectPath);
        return rollbackPendingModelPackageReplacement(projectPath, request);
    });
    ipcMain.handle("projects:refreshModelPackage", async (_event, projectPath, request) => {
        assertAuthorizedProjectPath(projectPath);
        const safeRequest = (isRecord(request) ? request : {});
        const requestedSourceRoot = typeof safeRequest.sourceRoot === "string" && safeRequest.sourceRoot.trim() ? safeRequest.sourceRoot.trim() : "";
        const authorizedSourceRoot = requestedSourceRoot ? await getAuthorizedModelPackageSourceRoot(requestedSourceRoot) : null;
        if (authorizedSourceRoot) {
            return refreshModelPackageTextFiles(projectPath, authorizedSourceRoot, safeRequest);
        }
        const options = {
            title: "选择要刷新的模型包文件夹",
            defaultPath: path.join(os.homedir(), "Documents"),
            properties: ["openDirectory"]
        };
        const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
        if (result.canceled || !result.filePaths[0]) {
            return null;
        }
        const sourceRoot = await authorizeModelPackageSourceRoot(result.filePaths[0]);
        return refreshModelPackageTextFiles(projectPath, sourceRoot, safeRequest);
    });
}
/** 注册 Electron 生命周期，兼容 Windows/Linux 退出和 macOS 激活行为。 */
function registerAppLifecycle() {
    app.whenReady().then(async () => {
        registerProjectIpc();
        registerPublishIpc();
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
function enforceSingleInstance() {
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
configureGpuAcceleration();
enforceSingleInstance();
registerAppLifecycle();
//# sourceMappingURL=main.js.map