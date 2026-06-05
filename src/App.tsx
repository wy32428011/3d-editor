import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AssetBrowser } from "./components/AssetBrowser";
import { HierarchyPanel } from "./components/HierarchyPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { ProjectLauncher } from "./components/ProjectLauncher";
import { Toolbar } from "./components/Toolbar";
import { ViewportCanvas } from "./components/ViewportCanvas";
import type { CadDxfLineProgress } from "./editor/cadDxf";
import { parseModelPackageDataDriven } from "./editor/modelPackageDataDriven";
import { parseModelPackageDecorators } from "./editor/modelPackageDecorators";
import { DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS } from "./editor/modelPackageRuntime";
import { DEFAULT_SCENE_ENVIRONMENT_COLOR, type BabylonEditorEngine } from "./engine/BabylonEditorEngine";
import { DEFAULT_SCENE_DATA_DRIVEN } from "./types/editor";
import type {
  AssetRecord,
  EditorEngineCallbacks,
  EditorStats,
  EditorTool,
  InspectorTarget,
  ModelDataDrivenDefinition,
  ModelPackageManifest,
  ModelPackageProjectFile,
  PrimitiveKind,
  SceneDataDrivenSnapshot,
  SceneInspectorUpdate,
  SceneNodeSummary,
  TransformUpdate
} from "./types/editor";

interface PersistedProjectAssetFiles {
  projectFiles: Map<File, string>;
  failedFiles: Set<File>;
}

interface ModelPackageRuntimeScriptSelection {
  scriptFile?: string;
  className: string;
}

const initialStats: EditorStats = {
  fps: 0,
  meshes: 0,
  activeMeshes: 0,
  vertices: 0,
  drawCalls: 0
};

/** 统一提取异常消息，兼容 Babylon 以字符串抛错的情况。 */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

/** 根据文件名推断基础 MIME，供从项目资产恢复 File 对象时使用。 */
function getProjectAssetMimeType(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".babylon": "application/json",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".ktx": "image/ktx",
    ".ktx2": "image/ktx2",
    ".obj": "model/obj",
    ".png": "image/png",
    ".stl": "model/stl",
    ".webp": "image/webp"
  };
  return mimeTypes[extension] ?? "application/octet-stream";
}

/** 生成与 Babylon 引擎一致的资产编号，便于项目资产文件和资产记录互相定位。 */
function getFileAssetId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/** 为 CAD 二进制线段侧车文件生成独立资产目录，避免和原 DXF 源文件混放。 */
function createCadLineAssetId(file: File): string {
  const randomId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `cad-lines-${file.name}-${file.size}-${file.lastModified}-${randomId}`;
}

/** 格式化进度计数，CAD 大图纸常见百万级线段，必须保持可读。 */
function formatCadProgressCount(value: number | undefined): string {
  return Math.max(0, Math.trunc(value ?? 0)).toLocaleString("zh-CN");
}

/** 计算当前 CAD 阶段的百分比，未知总量时返回 null 让 UI 显示不确定进度。 */
function getCadImportProgressPercent(progress: CadDxfLineProgress | null): number | null {
  if (!progress) {
    return null;
  }

  if (progress.phase === "done") {
    return 100;
  }

  if (progress.phase === "reading" && progress.totalBytes && progress.totalBytes > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.loadedBytes ?? 0) / progress.totalBytes) * 100));
  }

  if (progress.phase === "emitting" && progress.totalSegments && progress.totalSegments > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.emittedSegments) / progress.totalSegments) * 100));
  }

  if (progress.phase === "persisting" && progress.chunkCount && progress.chunkCount > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.persistedChunks ?? 0) / progress.chunkCount) * 100));
  }

  if (progress.phase === "restoring" && progress.chunkCount && progress.chunkCount > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.restoredChunks ?? 0) / progress.chunkCount) * 100));
  }

  return null;
}

/** 生成 CAD 导入或恢复状态文本，不把进度写入错误提示。 */
function getCadImportProgressText(progress: CadDxfLineProgress): string {
  const percent = getCadImportProgressPercent(progress);
  const percentText = percent === null ? "" : ` · ${Math.round(percent)}%`;
  switch (progress.phase) {
    case "reading":
      return `CAD 导入中 · 读取文件${percentText}`;
    case "measuring":
      return `CAD 导入中 · 测量图纸 · 已解析 ${formatCadProgressCount(progress.parsedEntities)} 个实体 · 已发现 ${formatCadProgressCount(progress.emittedSegments)} 条线段`;
    case "emitting":
      return `CAD 导入中 · 输出线段 · ${formatCadProgressCount(progress.emittedSegments)} / ${formatCadProgressCount(progress.totalSegments)} 条${percentText}`;
    case "rendering":
      return `CAD 导入中 · 创建网格 · 已创建 ${formatCadProgressCount(progress.chunkCount)} 个分块 · ${formatCadProgressCount(progress.emittedSegments)} 条线段`;
    case "persisting":
      return `CAD 导入中 · 保存分块 · ${formatCadProgressCount(progress.persistedChunks)} / ${formatCadProgressCount(progress.chunkCount)} 个${percentText}`;
    case "restoring":
      return `CAD 恢复中 · ${formatCadProgressCount(progress.restoredChunks)} / ${formatCadProgressCount(progress.chunkCount)} 个分块 · 已创建 ${formatCadProgressCount(progress.renderedChunks)} 个网格${percentText}`;
    case "done":
      return "CAD 图纸导入完成";
    default:
      return progress.message ?? "CAD 图纸导入中";
  }
}

/** 从项目相对路径中取回文件名，恢复 glTF/OBJ 依赖时必须保留原始文件名。 */
function getProjectFileName(projectFile: string): string {
  return projectFile.split(/[\\/]/).pop() || "asset";
}

/** 合并主源文件和同批依赖文件路径，避免场景元数据中重复记录。 */
function getAssetProjectFiles(asset: AssetRecord): string[] {
  return [...new Set([asset.projectFile, ...(asset.projectFiles ?? [])].filter((file): file is string => Boolean(file)))];
}

/** 将 Electron 返回的模型包文件记录转换成编辑器 manifest 文件记录。 */
function mapModelPackageFiles(files: DesktopModelPackageProjectFile[]): ModelPackageProjectFile[] {
  return files.map((file) => ({
    relativePath: file.relativePath,
    projectFile: file.projectFile,
    role: file.role,
    size: file.size,
    lastModified: file.lastModified
  }));
}

/** 安全解析 meta.json；meta.js 当前只复制保存，不执行。 */
function parseModelPackageMeta(metaFile: string | undefined, textFiles: Record<string, string>, warnings: string[]): unknown {
  if (!metaFile || !metaFile.toLowerCase().endsWith(".json")) {
    return undefined;
  }

  const text = textFiles[metaFile];
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    warnings.push(`${metaFile} 不是合法 JSON，已忽略 meta 内容。`);
    return undefined;
  }
}

/** 将未知 JSON 值安全收敛为普通对象，避免损坏 meta 影响模型包导入。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** 根据模型包内部相对路径构建规范化索引，用于兼容 ./ 和 Windows 反斜杠。 */
function createModelPackageRelativePathMap(paths: string[]): Map<string, string> {
  return new Map(paths.map((file) => [normalizeModelPackageRelativePath(file), file]));
}

/** 从 meta.json 中读取参数脚本文件名，当前优先兼容 parameterScripts[0].scriptFilename。 */
function getMetaParameterScriptFile(meta: unknown, textFiles: Record<string, string>, warnings: string[]): string | undefined {
  const parameterScripts = asRecord(meta).parameterScripts;
  if (!Array.isArray(parameterScripts)) {
    return undefined;
  }

  const textFileMap = createModelPackageRelativePathMap(Object.keys(textFiles));
  for (const script of parameterScripts) {
    const scriptFile = asRecord(script).scriptFilename;
    if (typeof scriptFile !== "string" || scriptFile.trim().length === 0) {
      continue;
    }

    const matchedFile = textFileMap.get(normalizeModelPackageRelativePath(scriptFile));
    if (matchedFile) {
      return matchedFile;
    }

    warnings.push(`meta.json 声明的参数脚本 ${scriptFile} 不在模型包文本文件中，已继续查找下一个参数脚本。`);
  }

  return undefined;
}

/** 从 meta.json 中读取运行脚本文件名和类名，默认兼容 ParametricModelRuntimeComponent。 */
function getMetaRuntimeScript(
  meta: unknown,
  availableFiles: string[],
  fallbackScriptFile: string | undefined,
  warnings: string[]
): ModelPackageRuntimeScriptSelection {
  const animationScripts = asRecord(meta).animationScripts;
  const fileMap = createModelPackageRelativePathMap(availableFiles);
  if (Array.isArray(animationScripts)) {
    for (const script of animationScripts) {
      const scriptRecord = asRecord(script);
      const scriptFile = scriptRecord.scriptFilename;
      const className =
        typeof scriptRecord.className === "string" && scriptRecord.className.trim().length > 0
          ? scriptRecord.className.trim()
          : DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS;
      if (typeof scriptFile !== "string" || scriptFile.trim().length === 0) {
        continue;
      }

      const matchedFile = fileMap.get(normalizeModelPackageRelativePath(scriptFile));
      if (matchedFile) {
        return { scriptFile: matchedFile, className };
      }

      warnings.push(`meta.json 声明的运行脚本 ${scriptFile} 不在模型包文件中，已继续查找下一个运行脚本。`);
    }
  }

  return {
    scriptFile: fallbackScriptFile,
    className: DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS
  };
}

/** 规范化模型包内部相对路径，兼容 meta 中的 ./ 前缀和 Windows 反斜杠。 */
function normalizeModelPackageRelativePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

/** 选择用于右侧属性栏解析的参数脚本，避免多个 .ts 时误选运行脚本。 */
function chooseModelPackageParameterScriptFile(
  meta: unknown,
  textFiles: Record<string, string>,
  fallbackScriptFile: string | undefined,
  warnings: string[]
): string | undefined {
  const metaScriptFile = getMetaParameterScriptFile(meta, textFiles, warnings);
  if (metaScriptFile) {
    return metaScriptFile;
  }

  const tsFiles = Object.keys(textFiles)
    .filter((file) => file.toLowerCase().endsWith(".ts"))
    .sort((left, right) => left.localeCompare(right));
  const paramsFiles = tsFiles.filter((file) => file.toLowerCase().endsWith(".params.ts"));
  if (paramsFiles.length > 0) {
    if (paramsFiles.length > 1) {
      warnings.push(`模型包包含多个 .params.ts 参数脚本，当前版本使用 ${paramsFiles[0]}。`);
    }
    return paramsFiles[0];
  }

  if (fallbackScriptFile && textFiles[fallbackScriptFile] !== undefined) {
    return fallbackScriptFile;
  }

  if (tsFiles.length === 1) {
    return tsFiles[0];
  }

  warnings.push("模型包包含多个 .ts 脚本，但未找到 meta.json 声明的有效参数脚本或 .params.ts 文件，已跳过动态参数解析。");
  return undefined;
}

/** 从模型包脚本中读取 dataDriven 语义定义，场景级连接配置仍由 Inspector 保存。 */
function parseModelPackageDataDrivenFromScripts(
  textFiles: Record<string, string>,
  preferredFiles: Array<string | undefined>,
  warnings: string[]
): ModelDataDrivenDefinition | undefined {
  const textFileMap = createModelPackageRelativePathMap(Object.keys(textFiles));
  const scriptFiles = [
    ...preferredFiles,
    ...Object.keys(textFiles)
      .filter((file) => file.toLowerCase().endsWith(".ts"))
      .sort((left, right) => left.localeCompare(right))
  ];
  const visited = new Set<string>();

  for (const scriptFile of scriptFiles) {
    if (!scriptFile) {
      continue;
    }

    const matchedFile = textFileMap.get(normalizeModelPackageRelativePath(scriptFile));
    if (!matchedFile || visited.has(matchedFile)) {
      continue;
    }
    visited.add(matchedFile);

    const parsed = parseModelPackageDataDriven(textFiles[matchedFile] ?? "", matchedFile);
    warnings.push(...parsed.warnings);
    if (parsed.definition) {
      return parsed.definition;
    }
  }

  return undefined;
}

/** 从项目资产目录轻量恢复模型包脚本文本，避免打开项目时强制加载大 GLB。 */
async function restoreModelPackageScriptTextsFromProject(projectPath: string, targetEngine: BabylonEditorEngine): Promise<string[]> {
  if (!window.electronApp?.projects.loadAssetFile) {
    return [];
  }

  const warnings: string[] = [];
  const decoder = new TextDecoder("utf-8");
  for (const asset of targetEngine.getAssetsSnapshot()) {
    const manifest = asset.modelPackage;
    if (!manifest) {
      continue;
    }

    const scriptFiles = manifest.files.filter((file) => file.role === "script");
    const requiredPaths = new Set(
      [manifest.scriptFile, manifest.runtimeScriptFile, ...scriptFiles.map((file) => file.relativePath)].filter(
        (file): file is string => Boolean(file)
      )
    );
    const scriptFileMap = createModelPackageRelativePathMap(scriptFiles.map((file) => file.relativePath));
    const texts: Record<string, string> = {};

    for (const requiredPath of requiredPaths) {
      const matchedRelativePath = scriptFileMap.get(normalizeModelPackageRelativePath(requiredPath));
      const projectFileRecord = scriptFiles.find((file) => file.relativePath === matchedRelativePath);
      if (!projectFileRecord) {
        warnings.push(`模型包 ${manifest.displayName} 缺少脚本文件记录：${requiredPath}`);
        continue;
      }

      try {
        const payload = await window.electronApp.projects.loadAssetFile(projectPath, projectFileRecord.projectFile);
        texts[projectFileRecord.relativePath] = decoder.decode(payload.data);
      } catch (error) {
        warnings.push(getErrorMessage(error, `模型包 ${manifest.displayName} 脚本 ${projectFileRecord.relativePath} 读取失败。`));
      }
    }

    if (Object.keys(texts).length > 0) {
      targetEngine.registerModelPackageScriptTexts(manifest.packageId, texts);
    }
  }

  return warnings;
}

/** 编辑器根组件，负责连接 React 面板状态和 Babylon 引擎实例。 */
export function App() {
  const [engine, setEngine] = useState<BabylonEditorEngine | null>(null);
  const [engineSceneId, setEngineSceneId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("move");
  const [nodes, setNodes] = useState<SceneNodeSummary[]>([]);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [stats, setStats] = useState<EditorStats>(initialStats);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProjectRecord[]>([]);
  const [activeProject, setActiveProject] = useState<DesktopProjectRecord | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectErrorExpanded, setProjectErrorExpanded] = useState(false);
  const [cadImportProgress, setCadImportProgress] = useState<CadDxfLineProgress | null>(null);
  const [cadImportActive, setCadImportActive] = useState(false);
  const [cadRestoreProgress, setCadRestoreProgress] = useState<CadDxfLineProgress | null>(null);
  const [cadRestoreActive, setCadRestoreActive] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneLoadFailed, setSceneLoadFailed] = useState(false);
  const [sceneDialogOpen, setSceneDialogOpen] = useState(false);
  const [sceneName, setSceneName] = useState("New Scene");
  const [sceneEnvironmentColor, setSceneEnvironmentColor] = useState(DEFAULT_SCENE_ENVIRONMENT_COLOR);
  const [sceneDataDriven, setSceneDataDriven] = useState<SceneDataDrivenSnapshot>(DEFAULT_SCENE_DATA_DRIVEN);

  const activeScene = activeProject?.scenes.find((scene) => scene.id === activeSceneId) ?? activeProject?.scenes[0] ?? null;
  const activeSceneRef = useRef<{ projectPath: string | null; sceneId: string | null }>({ projectPath: null, sceneId: null });
  const sceneRenameRequestRef = useRef(0);
  const cadImportRequestRef = useRef(0);
  const cadImportActiveRef = useRef(false);
  const cadRestoreRequestRef = useRef(0);
  const cadRestoreActiveRef = useRef(false);
  const cadRestoreWarningRef = useRef<string | null>(null);
  const selectedNode = inspectorTarget?.type === "node" ? inspectorTarget.node : null;
  const panelInspectorTarget = useMemo<InspectorTarget | null>(() => {
    if (!inspectorTarget) {
      return null;
    }

    if (inspectorTarget.type === "scene") {
      return {
        type: "scene",
        scene: {
          ...inspectorTarget.scene,
          name: activeScene?.name ?? inspectorTarget.scene.name,
          dataDriven: sceneDataDriven
        }
      };
    }

    return inspectorTarget;
  }, [activeScene?.name, inspectorTarget, sceneDataDriven]);
  const projectSaveBlocked = Boolean(activeProject && (sceneLoading || sceneLoadFailed || previewMode || cadImportActive || cadRestoreActive));
  const saveDisabledReason = cadImportActive
    ? "CAD 图纸导入完成后才能保存场景"
    : cadRestoreActive
    ? "CAD 图纸恢复完成后才能保存场景"
    : previewMode
    ? "停止预览后才能保存场景"
    : sceneLoading
      ? "场景读取完成后才能保存"
      : sceneLoadFailed
        ? "当前场景加载失败，已阻止保存"
        : undefined;

  /** 选区切换到场景属性时，同步缓存场景级配置，供对象属性面板继续显示统一数据源。 */
  const handleSelectionChange = useCallback((target: InspectorTarget) => {
    setInspectorTarget(target);
    if (target.type === "scene") {
      setSceneEnvironmentColor(target.scene.environment.backgroundColor);
      setSceneDataDriven(target.scene.dataDriven);
    }
  }, []);

  const callbacks: EditorEngineCallbacks = useMemo(
    () => ({
      onSceneGraphChange: setNodes,
      onSelectionChange: handleSelectionChange,
      onAssetsChange: setAssets,
      onStatsChange: setStats
    }),
    [handleSelectionChange]
  );

  /** 刷新 Electron 保存的最近项目列表。 */
  const refreshRecentProjects = useCallback(async () => {
    if (!window.electronApp?.projects) {
      setProjectError("当前不在 Electron 桌面环境，项目文件功能不可用。");
      return;
    }

    const projects = await window.electronApp.projects.listRecent();
    setRecentProjects(projects);
  }, []);

  useEffect(() => {
    void refreshRecentProjects();
  }, [refreshRecentProjects]);

  useEffect(() => {
    setProjectErrorExpanded(false);
  }, [projectError]);

  /** 激活项目并同步默认场景选择。 */
  const activateProject = useCallback((project: DesktopProjectRecord | null) => {
    const nextSceneId = project?.activeSceneId ?? project?.scenes[0]?.id ?? null;
    setPreviewMode(false);
    activeSceneRef.current = { projectPath: project?.path ?? null, sceneId: nextSceneId };
    setActiveProject(project);
    setActiveSceneId(nextSceneId);
    setProjectError(null);
    setCadImportProgress(null);
    setCadImportActive(false);
    setCadRestoreProgress(null);
    setCadRestoreActive(false);
    cadImportActiveRef.current = false;
    cadRestoreActiveRef.current = false;
    cadRestoreWarningRef.current = null;
    cadImportRequestRef.current += 1;
    cadRestoreRequestRef.current += 1;
    setSceneLoadFailed(false);
  }, []);

  /** 保存当前项目和场景上下文，异步 IPC 返回时用它避免旧响应覆盖新界面。 */
  useEffect(() => {
    activeSceneRef.current = { projectPath: activeProject?.path ?? null, sceneId: activeScene?.id ?? null };
  }, [activeProject?.path, activeScene?.id]);

  /** 切换项目场景，先同步 ref 再触发 React 状态更新，避免重命名响应竞态。 */
  const handleSceneSelectChange = useCallback(
    (sceneId: string) => {
      if (cadImportActiveRef.current) {
        setProjectError("CAD 图纸正在导入，请等待导入完成后再切换场景。");
        return;
      }

      engine?.cancelCadRestore();
      cadRestoreActiveRef.current = false;
      cadRestoreWarningRef.current = null;
      setCadRestoreActive(false);
      setCadRestoreProgress(null);
      cadRestoreRequestRef.current += 1;
      activeSceneRef.current = { projectPath: activeProject?.path ?? null, sceneId };
      setActiveSceneId(sceneId);
    },
    [activeProject?.path, engine]
  );

  /** 切换项目场景时退出预览，避免旧场景动画状态泄漏到新场景。 */
  useEffect(() => {
    setPreviewMode(false);
  }, [activeProject?.path, activeSceneId]);

  /** 创建新项目，实际目录选择由 Electron 主进程文件对话框完成。 */
  const handleCreateProject = useCallback(
    async (name: string) => {
      try {
        const project = await window.electronApp?.projects.create(name);
        if (project) {
          activateProject(project);
          await refreshRecentProjects();
        }
      } catch (error) {
        setProjectError(getErrorMessage(error, "创建项目失败。"));
      }
    },
    [activateProject, refreshRecentProjects]
  );

  /** 打开本地项目目录。 */
  const handleOpenProject = useCallback(async () => {
    try {
      const project = await window.electronApp?.projects.open();
      if (project) {
        activateProject(project);
        await refreshRecentProjects();
      }
    } catch (error) {
      setProjectError(getErrorMessage(error, "打开项目失败。"));
    }
  }, [activateProject, refreshRecentProjects]);

  /** 从最近项目列表打开项目。 */
  const handleOpenRecentProject = useCallback(
    async (projectPath: string) => {
      try {
        const project = await window.electronApp?.projects.openRecent(projectPath);
        if (project) {
          activateProject(project);
          await refreshRecentProjects();
        }
      } catch (error) {
        setProjectError(getErrorMessage(error, "打开最近项目失败。"));
        await refreshRecentProjects();
      }
    },
    [activateProject, refreshRecentProjects]
  );

  /** 缓存 Babylon 引擎实例，并记录它对应的场景；引擎释放时同步清空旧 UI 快照。 */
  const handleEngineReady = useCallback(
    (nextEngine: BabylonEditorEngine | null) => {
      const sceneSnapshot = nextEngine?.getSceneInspectorSnapshot();
      setEngine(nextEngine);
      setEngineSceneId(nextEngine ? activeSceneId : null);
      setSceneEnvironmentColor(sceneSnapshot?.environment.backgroundColor ?? DEFAULT_SCENE_ENVIRONMENT_COLOR);
      setSceneDataDriven(sceneSnapshot?.dataDriven ?? DEFAULT_SCENE_DATA_DRIVEN);
      if (!nextEngine) {
        setInspectorTarget(null);
        setNodes([]);
        setAssets([]);
        setStats(initialStats);
      }
    },
    [activeSceneId]
  );

  useEffect(() => {
    if (!activeProject || !activeScene || !engine || engineSceneId !== activeScene.id || !window.electronApp?.projects) {
      return;
    }

    const projectsApi = window.electronApp.projects;
    let cancelled = false;
    const restoreRequestId = cadRestoreRequestRef.current + 1;
    cadRestoreRequestRef.current = restoreRequestId;
    cadRestoreActiveRef.current = false;
    cadRestoreWarningRef.current = null;
    setCadRestoreActive(false);
    setCadRestoreProgress(null);
    setSceneLoading(true);
    setSceneLoadFailed(false);
    projectsApi
      .loadScene(activeProject.path, activeScene.id)
      .then(async (payload) => {
        if (cancelled) {
          return;
        }

        setActiveProject(payload.project);
        if (!cancelled) {
          setProjectError(null);
        }
        if (payload.babylonScene) {
          await engine.loadSerializedScene(payload.babylonScene, {
            loadCadLineChunks: projectsApi.loadAssetFiles
              ? async (requests) => {
                  const results = await projectsApi.loadAssetFiles!(
                    activeProject.path,
                    requests.map((request) => ({
                      projectFile: request.projectFile,
                      expectedByteLength: request.expectedByteLength
                    }))
                  );
                  return results.map((result) => ({
                    projectFile: result.projectFile,
                    data: result.data,
                    lastModified: result.lastModified,
                    error: result.error
                  }));
                }
              : undefined,
            loadCadLineChunk: async (projectFile) => {
              if (!window.electronApp?.projects.loadAssetFile) {
                throw new Error("当前运行环境不支持读取 CAD 线段侧车文件。");
              }

              const assetPayload = await projectsApi.loadAssetFile(activeProject.path, projectFile);
              return assetPayload.data;
            },
            onCadRestoreProgress: (progress) => {
              if (cancelled || cadRestoreRequestRef.current !== restoreRequestId) {
                return;
              }

              if (progress.phase === "done") {
                cadRestoreActiveRef.current = false;
                setCadRestoreActive(false);
                setCadRestoreProgress(null);
                let cadRestoreWarning: string | null = null;
                if ((progress.skippedChunks ?? 0) > 0) {
                  cadRestoreWarning = `CAD 图纸恢复完成，但有 ${formatCadProgressCount(progress.skippedChunks)} 个线段分块缺失或损坏，已跳过。`;
                } else if (progress.message?.includes("失败")) {
                  cadRestoreWarning = progress.message;
                }

                cadRestoreWarningRef.current = cadRestoreWarning;
                if (cadRestoreWarning) {
                  setProjectError(cadRestoreWarning);
                }
                return;
              }

              cadRestoreActiveRef.current = true;
              setCadRestoreActive(true);
              setCadRestoreProgress(progress);
            }
          });
          const runtimeWarnings = await restoreModelPackageScriptTextsFromProject(activeProject.path, engine);
          if (!cancelled) {
            engine.initializeModelPackageRuntimesForScene();
            const warnings = [...runtimeWarnings];
            if (cadRestoreWarningRef.current) {
              warnings.push(cadRestoreWarningRef.current);
            }
            setProjectError(warnings.length > 0 ? warnings.join("；") : null);
          }
        }
        if (!cancelled) {
          const sceneSnapshot = engine.getSceneInspectorSnapshot();
          setSceneEnvironmentColor(sceneSnapshot.environment.backgroundColor);
          setSceneDataDriven(sceneSnapshot.dataDriven);
        }
        if (!cancelled) {
          setSceneLoadFailed(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectError(getErrorMessage(error, "加载场景失败。"));
          setSceneLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSceneLoading(false);
        }
      });

    return () => {
      cancelled = true;
      engine.cancelCadRestore();
      if (cadRestoreRequestRef.current === restoreRequestId) {
        cadRestoreRequestRef.current += 1;
        cadRestoreActiveRef.current = false;
        setCadRestoreActive(false);
        setCadRestoreProgress(null);
      }
    };
  }, [activeProject?.path, activeScene?.id, engine, engineSceneId]);

  /** 从工具栏创建基础对象，默认落在世界原点附近。 */
  const handleAddPrimitive = useCallback(
    (kind: PrimitiveKind) => {
      engine?.addPrimitive(kind, new Vector3(0, 0, 0));
    },
    [engine]
  );

  /** 层级面板的新建按钮创建逻辑分组，供模型拖入后批量管理。 */
  const handleCreateHierarchyNode = useCallback(() => {
    engine?.createGroup();
  }, [engine]);

  /** 把导入文件复制进项目资产目录，返回 File 对象到项目相对路径的映射。 */
  const persistProjectAssetFiles = useCallback(
    async (files: FileList | File[]): Promise<PersistedProjectAssetFiles> => {
      const projectFiles = new Map<File, string>();
      const failedFiles = new Set<File>();
      if (!activeProject || !window.electronApp?.projects.saveAssetFile) {
        return { projectFiles, failedFiles };
      }

      for (const file of Array.from(files)) {
        try {
          const sourcePath = window.electronApp.files?.getPath?.(file);
          const projectFile =
            sourcePath && window.electronApp.projects.saveAssetFileFromPath
              ? await window.electronApp.projects.saveAssetFileFromPath(activeProject.path, getFileAssetId(file), sourcePath, file.name)
              : await window.electronApp.projects.saveAssetFile(activeProject.path, getFileAssetId(file), file.name, await file.arrayBuffer());
          projectFiles.set(file, projectFile);
        } catch (error) {
          failedFiles.add(file);
          setProjectError(getErrorMessage(error, `资产 ${file.name} 写入项目目录失败。`));
        }
      }

      return { projectFiles, failedFiles };
    },
    [activeProject]
  );

  /** 从项目资产目录读取一组项目相对文件，并恢复为浏览器 File 对象。 */
  const loadProjectAssetFiles = useCallback(
    async (projectFiles: string[], mainProjectFile?: string, mainFileName?: string): Promise<File[]> => {
      if (!activeProject || !window.electronApp?.projects.loadAssetFile) {
        throw new Error("当前运行环境不支持读取项目资产文件。");
      }

      const files: File[] = [];
      for (const projectFile of projectFiles) {
        const payload = await window.electronApp.projects.loadAssetFile(activeProject.path, projectFile);
        const fileName = projectFile === mainProjectFile && mainFileName ? mainFileName : getProjectFileName(projectFile);
        files.push(
          new File([payload.data], fileName, {
            type: getProjectAssetMimeType(fileName),
            lastModified: payload.lastModified
          })
        );
      }

      return files;
    },
    [activeProject]
  );

  /** 按需从项目资产目录恢复单个资产文件，避免打开项目时一次性加载大模型。 */
  const ensureProjectAssetFile = useCallback(
    async (assetId: string, targetEngine: BabylonEditorEngine): Promise<boolean> => {
      const asset = targetEngine.getAssetsSnapshot().find((item) => item.id === assetId);
      if (!asset) {
        setProjectError("资产记录不存在，请刷新项目后重试。");
        return false;
      }

      if (asset.sourceAvailable === true) {
        return true;
      }

      const projectFiles = getAssetProjectFiles(asset);
      if (projectFiles.length === 0) {
        return true;
      }

      if (!activeProject || !window.electronApp?.projects.loadAssetFile) {
        return true;
      }

      try {
        const primaryModelFileName = asset.modelPackage?.primaryModelFile.split(/[\\/]/).pop();
        const files = await loadProjectAssetFiles(projectFiles, asset.projectFile, primaryModelFileName ?? asset.name);
        targetEngine.restoreAssetFiles(new Map([[assetId, files]]));
        return true;
      } catch (error) {
        setProjectError(getErrorMessage(error, `资产 ${asset.name} 源文件读取失败，将尝试使用当前场景模板。`));
        return true;
      }
    },
    [activeProject, loadProjectAssetFiles]
  );

  /** 从工具栏或资产面板导入文件时先快照文件，再持久化并登记资产等待用户拖入视口。 */
  const handleImportFiles = useCallback(
    async (files: FileList) => {
      if (!engine) {
        return;
      }

      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }

      const persisted = await persistProjectAssetFiles(fileArray);
      if (activeProject && persisted.failedFiles.size > 0) {
        setProjectError("部分资产文件写入项目目录失败，已先作为当前会话资产登记；重新打开项目后未成功写入的文件需要重新导入。");
      } else {
        setProjectError(null);
      }

      engine.registerAssetFiles(fileArray, persisted.projectFiles);
    },
    [activeProject, engine, persistProjectAssetFiles]
  );

  /** 导入文件夹模型包，解析 TypeScript 装饰器生成动态参数面板。 */
  const handleImportModelPackage = useCallback(async () => {
    if (!activeProject) {
      setProjectError("请先打开或创建项目，再导入模型包。");
      return;
    }

    if (!window.electronApp?.projects.importModelPackage) {
      setProjectError("当前运行环境不支持文件夹模型包导入。");
      return;
    }

    if (!engine) {
      setProjectError("3D 引擎尚未准备好，请稍后再导入模型包。");
      return;
    }

    try {
      const result = await window.electronApp.projects.importModelPackage(activeProject.path);
      if (!result) {
        return;
      }

      const projectFilePaths = result.projectFiles.map((file) => file.projectFile);
      const files = await loadProjectAssetFiles(projectFilePaths);
      const warnings = [...result.warnings];
      const meta = parseModelPackageMeta(result.metaFile, result.textFiles, warnings);
      const scriptFile = chooseModelPackageParameterScriptFile(meta, result.textFiles, result.scriptFile, warnings);
      const runtimeScript = getMetaRuntimeScript(
        meta,
        result.projectFiles.map((file) => file.relativePath),
        scriptFile ?? result.scriptFile,
        warnings
      );
      const scriptText = scriptFile ? result.textFiles[scriptFile] ?? "" : "";
      const parsed = parseModelPackageDecorators(scriptText, scriptFile ?? "");
      warnings.push(...parsed.warnings);
      const dataDriven = parseModelPackageDataDrivenFromScripts(
        result.textFiles,
        [runtimeScript.scriptFile, scriptFile, result.scriptFile],
        warnings
      );
      const manifest: ModelPackageManifest = {
        version: 1,
        packageId: result.packageId,
        displayName: result.displayName,
        rootDirectoryName: result.rootDirectoryName,
        primaryModelFile: result.primaryModelFile,
        scriptFile,
        runtimeScriptFile: runtimeScript.scriptFile,
        runtimeClassName: runtimeScript.className,
        dataDriven,
        metaFile: result.metaFile,
        meta,
        files: mapModelPackageFiles(result.projectFiles),
        dynamicFields: parsed.fields,
        warnings,
        importedAt: Date.now()
      };

      engine.registerModelPackageScriptTexts(result.packageId, result.textFiles);
      await engine.importModelPackage(files, new Vector3(0, 0, 0), manifest);
      setProjectError(warnings.length > 0 ? warnings.join("；") : null);
    } catch (error) {
      setProjectError(getErrorMessage(error, "导入模型包失败。"));
    }
  }, [activeProject, engine, loadProjectAssetFiles]);

  /** 从工具栏或拖拽导入 CAD 图纸，允许同批选择图片参照文件。 */
  const handleImportCadDrawing = useCallback(
    async (input: FileList | File[]) => {
      if (cadImportActiveRef.current) {
        return;
      }

      if (cadRestoreActiveRef.current) {
        setProjectError("CAD 图纸正在恢复，请等待恢复完成后再导入新的 CAD 图纸。");
        return;
      }

      if (!engine) {
        setProjectError("3D 引擎尚未准备好，请稍后再导入 CAD 图纸。");
        return;
      }

      const files = Array.from(input);
      const cadFile = files.find((file) => /\.(dxf|dwg)$/i.test(file.name));
      if (!cadFile) {
        setProjectError("请选择 .dxf 格式的 CAD 图纸；如图纸包含外部图片，请同时选择图片文件。");
        return;
      }

      const importRequestId = cadImportRequestRef.current + 1;
      cadImportRequestRef.current = importRequestId;
      cadImportActiveRef.current = true;
      setCadImportActive(true);
      setCadImportProgress({
        phase: "reading",
        parsedEntities: 0,
        emittedSegments: 0,
        loadedBytes: 0,
        totalBytes: cadFile.size,
        message: "准备导入 CAD 图纸"
      });
      setProjectError(null);

      try {
        const sourcePath = window.electronApp?.files?.getPath?.(cadFile);
        const canPersistCadLines = Boolean(activeProject && window.electronApp?.projects.saveAssetFile);
        if (canPersistCadLines) {
          const persisted = await persistProjectAssetFiles(files);
          if (persisted.failedFiles.size > 0) {
            setProjectError("CAD 源文件写入项目目录失败，本次导入已取消，请修复项目目录权限后重试。");
            return;
          }
        }

        const cadLineAssetId = createCadLineAssetId(cadFile);
        let lastProgressAt = 0;
        let lastProgressPhase: CadDxfLineProgress["phase"] | null = null;
        let lastProgressPercent: number | null = null;
        const result = await engine.importCadDrawing(cadFile, {
          relatedFiles: files,
          sourcePath,
          onProgress: (progress) => {
            if (cadImportRequestRef.current !== importRequestId || !cadImportActiveRef.current) {
              return;
            }

            const now = performance.now();
            const percent = getCadImportProgressPercent(progress);
            const phaseChanged = progress.phase !== lastProgressPhase;
            const percentChanged = percent !== null && (lastProgressPercent === null || Math.abs(percent - lastProgressPercent) >= 1);
            if (!phaseChanged && !percentChanged && now - lastProgressAt < 500) {
              return;
            }

            lastProgressAt = now;
            lastProgressPhase = progress.phase;
            lastProgressPercent = percent;
            setCadImportProgress(progress);
          },
          persistLineChunk:
            activeProject && window.electronApp?.projects.saveAssetFile
              ? (fileName, data) => window.electronApp!.projects.saveAssetFile(activeProject.path, cadLineAssetId, fileName, data)
              : undefined
        });
        setProjectError(
          result.warnings.length > 0
            ? `CAD 图纸已导入，但有提示：${result.warnings.join("；")}`
            : null
        );
      } catch (error) {
        setProjectError(getErrorMessage(error, "导入 CAD 图纸失败。"));
      } finally {
        if (cadImportRequestRef.current === importRequestId) {
          cadImportActiveRef.current = false;
          setCadImportActive(false);
          setCadImportProgress(null);
        }
      }
    },
    [activeProject, engine, persistProjectAssetFiles]
  );

  /** 外部文件直接拖入视口时，保持原有立即入场景语义，同时同步写入项目资产库。 */
  const handleDropFiles = useCallback(
    async (files: FileList, position: Vector3, targetEngine: BabylonEditorEngine) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }

      if (fileArray.some((file) => /\.(dxf|dwg)$/i.test(file.name))) {
        await handleImportCadDrawing(fileArray);
        return;
      }

      const persisted = await persistProjectAssetFiles(fileArray);
      if (activeProject && persisted.failedFiles.size > 0) {
        setProjectError("资产文件写入项目目录失败，本次拖入未添加到场景，请修复后重新导入。");
        return;
      }

      await targetEngine.importFiles(fileArray, position, persisted.projectFiles);
    },
    [activeProject, handleImportCadDrawing, persistProjectAssetFiles]
  );

  /** 从资产库拖入模型时，必要时先按项目相对路径恢复源文件，再实例化到视口。 */
  const handleDropAsset = useCallback(
    async (assetId: string, position: Vector3, targetEngine: BabylonEditorEngine) => {
      if (!(await ensureProjectAssetFile(assetId, targetEngine))) {
        return;
      }

      const instantiated = await targetEngine.instantiateAsset(assetId, position);
      if (!instantiated) {
        const asset = targetEngine.getAssetsSnapshot().find((item) => item.id === assetId);
        setProjectError(`资产 ${asset?.name ?? assetId} 缺少项目内源文件或当前场景模板，请重新导入该资产。`);
        return;
      }

      setProjectError(null);
    },
    [ensureProjectAssetFile]
  );

  /** 从层级面板选中指定节点。 */
  const handleSelectNode = useCallback(
    (id: number) => {
      engine?.selectById(id);
    },
    [engine]
  );

  /** 从层级面板双击节点时，快速把视角定位到该对象。 */
  const handleFocusNode = useCallback(
    (id: number) => {
      engine?.focusById(id);
    },
    [engine]
  );

  /** 从层级面板切换场景节点显隐状态。 */
  const handleToggleNodeVisibility = useCallback(
    (id: number, visible: boolean) => {
      engine?.setNodeVisibilityById(id, visible);
    },
    [engine]
  );

  /** 从层级面板切换节点锁定状态，锁定后保留树中查看和解锁能力。 */
  const handleToggleNodeLock = useCallback(
    (id: number, locked: boolean) => {
      engine?.setNodeLockedById(id, locked);
    },
    [engine]
  );

  /** 从层级面板拖拽节点到目标分组；目标为空时移回根级。 */
  const handleMoveNodeToGroup = useCallback(
    (id: number, groupId: number | null) => {
      engine?.moveNodeToGroup(id, groupId);
    },
    [engine]
  );

  /** 删除当前选中的场景对象，支持导入模型和基础对象。 */
  const handleDeleteSelected = useCallback(() => {
    engine?.deleteSelected();
  }, [engine]);

  useEffect(() => {
    /** 响应场景快捷键，并避开输入框内的文本编辑场景。 */
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (isTyping || event.defaultPrevented || !engine || event.repeat) {
        return;
      }

      const normalizedKey = event.key.toLowerCase();
      const isPlainSystemShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
      if (isPlainSystemShortcut && normalizedKey === "c") {
        if (engine.copySelected()) {
          event.preventDefault();
        }
        return;
      }

      if (isPlainSystemShortcut && normalizedKey === "v") {
        if (engine.pasteClipboard()) {
          event.preventDefault();
        }
        return;
      }

      if (!selectedNode || selectedNode.locked || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }

      event.preventDefault();
      engine.deleteSelected();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [engine, selectedNode]);

  /** 从属性面板按当前快照节点 ID 提交对象变换、材质或 metadata 更新，避免引擎选中状态短暂失配。 */
  const handleInspectorChange = useCallback(
    (update: TransformUpdate) => {
      if (!engine || !selectedNode) {
        return;
      }

      const targetId = selectedNode.id;
      const nextSelection = engine.updateNodeById(targetId, update);
      setInspectorTarget((current) => {
        if (current?.type !== "node" || current.node.id !== targetId) {
          return current;
        }

        return nextSelection ? { type: "node", node: nextSelection } : current;
      });
    },
    [engine, selectedNode]
  );

  /** 保存当前 Babylon 场景，项目场景读取失败时禁止覆盖磁盘文件。 */
  const handleSave = useCallback(async () => {
    if (!engine) {
      return;
    }

    if (previewMode) {
      setProjectError("预览模式正在播放场景，为避免把动画中间帧写入文件，请先停止预览再保存。");
      return;
    }

    if (activeProject && sceneLoading) {
      setProjectError("场景仍在读取中，为避免覆盖旧文件，已暂时阻止保存。");
      return;
    }

    if (activeProject && sceneLoadFailed) {
      setProjectError("当前场景上次加载失败，为避免把空场景覆盖到磁盘，已阻止保存。请重新打开项目或切换场景。");
      return;
    }

    if (activeProject && cadImportActiveRef.current) {
      setProjectError("CAD 图纸仍在导入中，为避免保存半成品图纸，请等待导入完成后再保存。");
      return;
    }

    if (activeProject && cadRestoreActiveRef.current) {
      setProjectError("CAD 图纸仍在恢复中，为避免保存不完整线段，请等待恢复完成后再保存。");
      return;
    }

    if (activeProject && activeScene && window.electronApp?.projects) {
      const projectPath = activeProject.path;
      const sceneId = activeScene.id;
      try {
        const project = await window.electronApp.projects.saveScene(projectPath, sceneId, engine.serializeScene());
        const currentContext = activeSceneRef.current;
        if (currentContext.projectPath === projectPath) {
          setActiveProject(project);
        }
        if (currentContext.projectPath === projectPath && currentContext.sceneId === sceneId) {
          setActiveSceneId(sceneId);
        }
        await refreshRecentProjects();
        return;
      } catch (error) {
        const currentContext = activeSceneRef.current;
        if (currentContext.projectPath !== projectPath || currentContext.sceneId !== sceneId) {
          return;
        }

        setProjectError(getErrorMessage(error, "保存场景到项目失败。"));
      }
    }

    engine.saveScene();
  }, [activeProject, activeScene, engine, previewMode, refreshRecentProjects, sceneLoadFailed, sceneLoading]);

  /** 打开 Babylon 官方 Inspector 作为高级调试面板。 */
  const handleToggleInspector = useCallback(() => {
    void engine?.toggleInspector();
  }, [engine]);

  /** 切换性能预览模式，并交给 Babylon 引擎调整渲染策略。 */
  const handleTogglePerformance = useCallback(() => {
    setPerformanceMode((value) => !value);
  }, []);

  /** 更新当前场景环境背景色，色值会写入 Babylon 场景并随保存恢复。 */
  const handleSceneEnvironmentColorChange = useCallback(
    (color: string) => {
      const normalizedColor = engine?.setSceneEnvironmentColor(color) ?? DEFAULT_SCENE_ENVIRONMENT_COLOR;
      setSceneEnvironmentColor(normalizedColor);
      setInspectorTarget((current) => {
        if (current?.type !== "scene") {
          return current;
        }

        return {
          type: "scene",
          scene: {
            ...current.scene,
            environment: {
              ...current.scene.environment,
              backgroundColor: normalizedColor
            }
          }
        };
      });
    },
    [engine]
  );

  /** 从对象属性面板更新场景级数据源配置，保持选中模型不被强制切回场景属性。 */
  const handleSceneDataDrivenChange = useCallback(
    (dataDriven: Partial<SceneDataDrivenSnapshot>) => {
      if (!engine) {
        return;
      }

      const nextSceneSnapshot = engine.updateSceneInspector({ dataDriven });
      const namedSceneSnapshot = {
        ...nextSceneSnapshot,
        name: activeScene?.name ?? nextSceneSnapshot.name
      };
      setSceneEnvironmentColor(namedSceneSnapshot.environment.backgroundColor);
      setSceneDataDriven(namedSceneSnapshot.dataDriven);
      setInspectorTarget((current) => {
        if (current?.type !== "scene") {
          return current;
        }

        return { type: "scene", scene: namedSceneSnapshot };
      });
    },
    [activeScene?.name, engine]
  );

  /** 启动 Stacker 内置模拟预览，不依赖外部 MQTT/WebSocket 数据源。 */
  const handleStartStackerDemoPreview = useCallback(
    (nodeId: number) => {
      if (!engine) {
        return;
      }

      const nextSelection = engine.startStackerDemoPreviewForNode(nodeId);
      if (!nextSelection) {
        setProjectError("当前选择不可启动 Stacker 模拟，请选中拖入场景的 Stacker 模型并确认未锁定。");
        return;
      }

      engine.setPreviewMode(true);
      setProjectError(null);
      const nextSceneSnapshot = engine.getSceneInspectorSnapshot();
      setSceneEnvironmentColor(nextSceneSnapshot.environment.backgroundColor);
      setSceneDataDriven(nextSceneSnapshot.dataDriven);
      setInspectorTarget((current) => {
        if (current?.type !== "node") {
          return current;
        }

        return nextSelection ? { type: "node", node: nextSelection } : current;
      });
      setPreviewMode(true);
    },
    [engine]
  );

  /** 从右侧场景属性面板提交场景配置，按字段分发到项目清单或 Babylon 场景 metadata。 */
  const handleSceneInspectorChange = useCallback(
    async (update: SceneInspectorUpdate) => {
      if (!engine) {
        return;
      }

      let nextSceneSnapshot = engine.updateSceneInspector(update);
      if (update.name !== undefined) {
        const nextName = update.name.trim();
        if (!nextName) {
          setProjectError("场景名称不能为空。");
        } else if (activeProject && activeScene && window.electronApp?.projects) {
          const projectPath = activeProject.path;
          const sceneId = activeScene.id;
          const requestId = ++sceneRenameRequestRef.current;
          try {
            const project = await window.electronApp.projects.renameScene(projectPath, sceneId, nextName);
            const currentContext = activeSceneRef.current;
            const stillSameProject = currentContext.projectPath === projectPath;
            const stillSameScene = stillSameProject && currentContext.sceneId === sceneId && sceneRenameRequestRef.current === requestId;

            if (stillSameProject) {
              setActiveProject(project);
            }
            await refreshRecentProjects();
            if (!stillSameScene) {
              return;
            }

            setActiveSceneId(sceneId);
            setProjectError(null);
            const renamedScene = project.scenes.find((scene) => scene.id === sceneId);
            nextSceneSnapshot = {
              ...nextSceneSnapshot,
              name: renamedScene?.name ?? nextName
            };
          } catch (error) {
            const currentContext = activeSceneRef.current;
            if (currentContext.projectPath === projectPath && currentContext.sceneId === sceneId) {
              setProjectError(getErrorMessage(error, "重命名场景失败。"));
            }
            return;
          }
        } else {
          nextSceneSnapshot = {
            ...nextSceneSnapshot,
            name: nextName
          };
        }
      } else {
        nextSceneSnapshot = {
          ...nextSceneSnapshot,
          name: activeScene?.name ?? nextSceneSnapshot.name
        };
      }

      setSceneEnvironmentColor(nextSceneSnapshot.environment.backgroundColor);
      setSceneDataDriven(nextSceneSnapshot.dataDriven);
      setInspectorTarget({ type: "scene", scene: nextSceneSnapshot });
    },
    [activeProject, activeScene, engine, refreshRecentProjects]
  );

  /** 从右侧场景属性面板初始化当前场景，执行前要求用户确认以避免误清空。 */
  const handleInitializeScene = useCallback(() => {
    if (!engine) {
      return;
    }

    if (!window.confirm("场景初始化会清空当前场景中的可编辑对象并重建默认工作台，是否继续？")) {
      return;
    }

    const nextSceneSnapshot = engine.initializeEditableScene();
    setSceneEnvironmentColor(nextSceneSnapshot.environment.backgroundColor);
    setSceneDataDriven(nextSceneSnapshot.dataDriven);
    setInspectorTarget({
      type: "scene",
      scene: {
        ...nextSceneSnapshot,
        name: activeScene?.name ?? nextSceneSnapshot.name
      }
    });
  }, [activeScene?.name, engine]);

  /** 切换场景预览模式，交给 Babylon 引擎取景完整场景并播放动画。 */
  const handleTogglePreview = useCallback(() => {
    setPreviewMode((value) => !value);
  }, []);

  /** 创建新场景并立即切换到该场景。 */
  const handleCreateScene = useCallback(async () => {
    if (cadImportActiveRef.current) {
      setProjectError("CAD 图纸正在导入，请等待导入完成后再新建场景。");
      return;
    }

    if (cadRestoreActiveRef.current) {
      engine?.cancelCadRestore();
      cadRestoreActiveRef.current = false;
      cadRestoreWarningRef.current = null;
      setCadRestoreActive(false);
      setCadRestoreProgress(null);
      cadRestoreRequestRef.current += 1;
    }

    if (!activeProject || !sceneName.trim()) {
      return;
    }

    try {
      const project = await window.electronApp?.projects.createScene(activeProject.path, sceneName);
      if (project) {
        setActiveProject(project);
        setActiveSceneId(project.activeSceneId);
        setSceneName("New Scene");
        setSceneDialogOpen(false);
        await refreshRecentProjects();
      }
    } catch (error) {
      setProjectError(getErrorMessage(error, "创建场景失败。"));
    }
  }, [activeProject, engine, refreshRecentProjects, sceneName]);

  const activeCadProgress = cadImportProgress ?? cadRestoreProgress;
  const cadImportPercent = getCadImportProgressPercent(activeCadProgress);
  const cadImportText = activeCadProgress ? getCadImportProgressText(activeCadProgress) : null;
  const cadBusy = cadImportActive || cadRestoreActive;
  const cadImportNavigationTitle = cadImportActive ? "CAD 图纸正在导入，请等待完成" : undefined;
  const cadImportDisabledReason = cadImportActive
    ? "CAD 图纸正在导入，请等待完成"
    : cadRestoreActive
    ? "CAD 图纸正在恢复，请等待完成后再导入新的 CAD 图纸"
    : undefined;

  if (!activeProject) {
    return (
      <ProjectLauncher
        recentProjects={recentProjects}
        error={projectError}
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
        onOpenRecentProject={handleOpenRecentProject}
        onRefresh={refreshRecentProjects}
      />
    );
  }

  return (
    <div className="editor-root" aria-busy={cadBusy}>
      <Toolbar
        tool={tool}
        performanceMode={performanceMode}
        previewMode={previewMode}
        stats={stats}
        onToolChange={setTool}
        onAddPrimitive={handleAddPrimitive}
        onImportFiles={handleImportFiles}
        onImportCadDrawing={handleImportCadDrawing}
        onImportModelPackage={handleImportModelPackage}
        onSave={handleSave}
        saveDisabled={projectSaveBlocked}
        saveDisabledReason={saveDisabledReason}
        cadImportDisabled={cadBusy}
        cadImportDisabledReason={cadImportDisabledReason}
        onToggleInspector={handleToggleInspector}
        onTogglePerformance={handleTogglePerformance}
        onTogglePreview={handleTogglePreview}
      />

      <div className="project-strip">
        <div className="project-identity">
          <strong>{activeProject.name}</strong>
          <span>{activeProject.path}</span>
        </div>
        <label className="scene-switcher">
          <span>场景</span>
          <select
            value={activeScene?.id ?? ""}
            title={cadImportNavigationTitle}
            disabled={cadImportActive}
            onChange={(event) => handleSceneSelectChange(event.target.value)}
          >
            {activeProject.scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </label>
        <label className="scene-environment-control" title="场景环境背景色">
          <span>环境</span>
          <input
            aria-label="场景环境背景色"
            type="color"
            value={sceneEnvironmentColor}
            onChange={(event) => handleSceneEnvironmentColorChange(event.target.value)}
          />
        </label>
        <button
          className="icon-text-button"
          type="button"
          title={cadImportNavigationTitle}
          disabled={cadImportActive}
          onClick={() => setSceneDialogOpen(true)}
        >
          新建场景
        </button>
        <button className="icon-text-button danger-button" type="button" disabled={!selectedNode || selectedNode.locked} onClick={handleDeleteSelected}>
          删除选中
        </button>
        {activeCadProgress && cadImportText && (
          <div className="cad-import-progress" title={cadImportText}>
            <span className="cad-import-progress-text">{cadImportText}</span>
            <div
              className={`cad-import-progress-track ${cadImportPercent === null ? "is-indeterminate" : ""}`}
              role="progressbar"
              aria-label={activeCadProgress.phase === "restoring" ? "CAD 恢复进度" : "CAD 导入进度"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={cadImportPercent === null ? undefined : Math.round(cadImportPercent)}
            >
              <span className="cad-import-progress-fill" style={cadImportPercent === null ? undefined : { width: `${cadImportPercent}%` }} />
            </div>
          </div>
        )}
        {sceneLoading && <span className="scene-status">读取场景中</span>}
        {projectError && (
          <>
            <button
              className="scene-status scene-error scene-error-button"
              type="button"
              title={projectError}
              aria-expanded={projectErrorExpanded}
              aria-controls="scene-error-popover"
              onClick={() => setProjectErrorExpanded((expanded) => !expanded)}
            >
              {projectError}
            </button>
            {projectErrorExpanded && (
              <div className="scene-error-popover" id="scene-error-popover" role="alert">
                <div className="scene-error-popover-body">{projectError}</div>
                <button className="scene-error-popover-close" type="button" onClick={() => setProjectErrorExpanded(false)}>
                  关闭
                </button>
              </div>
            )}
          </>
        )}
        <button
          className="icon-text-button"
          type="button"
          title={cadImportNavigationTitle}
          disabled={cadImportActive}
          onClick={() => activateProject(null)}
        >
          返回项目
        </button>
      </div>

      <div className="workspace">
        <HierarchyPanel
          title={activeProject.name}
          nodes={nodes}
          onSelect={handleSelectNode}
          onFocus={handleFocusNode}
          onCreateNode={handleCreateHierarchyNode}
          onToggleVisibility={handleToggleNodeVisibility}
          onToggleLock={handleToggleNodeLock}
          onMoveNodeToGroup={handleMoveNodeToGroup}
        />
        <ViewportCanvas
          key={activeScene?.id ?? "empty-scene"}
          callbacks={callbacks}
          tool={tool}
          performanceMode={performanceMode}
          previewMode={previewMode}
          onEngineReady={handleEngineReady}
          onDropAsset={handleDropAsset}
          onDropFiles={handleDropFiles}
        />
        <InspectorPanel
          target={panelInspectorTarget}
          sceneDataDriven={sceneDataDriven}
          onNodeChange={handleInspectorChange}
          onSceneChange={handleSceneInspectorChange}
          onSceneDataDrivenChange={handleSceneDataDrivenChange}
          onStartStackerDemoPreview={handleStartStackerDemoPreview}
          onSceneInitialize={handleInitializeScene}
          onImportCadDrawing={handleImportCadDrawing}
          cadImportDisabled={cadImportActive}
          cadImportDisabledReason="CAD 图纸正在导入，请等待完成"
        />
        <AssetBrowser assets={assets} onImportFiles={handleImportFiles} onImportModelPackage={handleImportModelPackage} />
      </div>

      {sceneDialogOpen && (
        <div className="modal-backdrop">
          <section className="modal-panel">
            <div className="panel-title">新建场景</div>
            <label className="field">
              <span>场景名称</span>
              <input value={sceneName} onChange={(event) => setSceneName(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button className="icon-text-button" type="button" onClick={() => setSceneDialogOpen(false)}>
                取消
              </button>
              <button
                className="command-button"
                type="button"
                title={cadImportNavigationTitle}
                disabled={cadImportActive}
                onClick={() => void handleCreateScene()}
              >
                创建
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
