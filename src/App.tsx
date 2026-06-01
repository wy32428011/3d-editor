import { useCallback, useEffect, useMemo, useState } from "react";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AssetBrowser } from "./components/AssetBrowser";
import { HierarchyPanel } from "./components/HierarchyPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { ProjectLauncher } from "./components/ProjectLauncher";
import { Toolbar } from "./components/Toolbar";
import { ViewportCanvas } from "./components/ViewportCanvas";
import type { BabylonEditorEngine } from "./engine/BabylonEditorEngine";
import type {
  AssetRecord,
  EditorEngineCallbacks,
  EditorStats,
  EditorTool,
  PrimitiveKind,
  SceneNodeSummary,
  TransformSnapshot,
  TransformUpdate
} from "./types/editor";

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

/** 编辑器根组件，负责连接 React 面板状态和 Babylon 引擎实例。 */
export function App() {
  const [engine, setEngine] = useState<BabylonEditorEngine | null>(null);
  const [engineSceneId, setEngineSceneId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("move");
  const [nodes, setNodes] = useState<SceneNodeSummary[]>([]);
  const [selection, setSelection] = useState<TransformSnapshot | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [stats, setStats] = useState<EditorStats>(initialStats);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProjectRecord[]>([]);
  const [activeProject, setActiveProject] = useState<DesktopProjectRecord | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneLoadFailed, setSceneLoadFailed] = useState(false);
  const [sceneDialogOpen, setSceneDialogOpen] = useState(false);
  const [sceneName, setSceneName] = useState("New Scene");

  const activeScene = activeProject?.scenes.find((scene) => scene.id === activeSceneId) ?? activeProject?.scenes[0] ?? null;
  const projectSaveBlocked = Boolean(activeProject && (sceneLoading || sceneLoadFailed));

  const callbacks: EditorEngineCallbacks = useMemo(
    () => ({
      onSceneGraphChange: setNodes,
      onSelectionChange: setSelection,
      onAssetsChange: setAssets,
      onStatsChange: setStats
    }),
    []
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

  /** 激活项目并同步默认场景选择。 */
  const activateProject = useCallback((project: DesktopProjectRecord | null) => {
    setActiveProject(project);
    setActiveSceneId(project?.activeSceneId ?? project?.scenes[0]?.id ?? null);
    setProjectError(null);
    setSceneLoadFailed(false);
  }, []);

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

  /** 缓存 Babylon 引擎实例，并记录它对应的场景，避免异步加载写入旧视口。 */
  const handleEngineReady = useCallback(
    (nextEngine: BabylonEditorEngine | null) => {
      setEngine(nextEngine);
      setEngineSceneId(nextEngine ? activeSceneId : null);
    },
    [activeSceneId]
  );

  useEffect(() => {
    if (!activeProject || !activeScene || !engine || engineSceneId !== activeScene.id || !window.electronApp?.projects) {
      return;
    }

    let cancelled = false;
    setSceneLoading(true);
    setSceneLoadFailed(false);
    window.electronApp.projects
      .loadScene(activeProject.path, activeScene.id)
      .then(async (payload) => {
        if (cancelled) {
          return;
        }

        setActiveProject(payload.project);
        if (payload.babylonScene) {
          await engine.loadSerializedScene(payload.babylonScene);
        }
        if (!cancelled) {
          setProjectError(null);
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
    };
  }, [activeProject?.path, activeScene?.id, engine, engineSceneId]);

  /** 从工具栏创建基础对象，默认落在世界原点附近。 */
  const handleAddPrimitive = useCallback(
    (kind: PrimitiveKind) => {
      engine?.addPrimitive(kind, new Vector3(0, 0, 0));
    },
    [engine]
  );

  /** 从工具栏导入文件，默认放在世界原点。 */
  const handleImportFiles = useCallback(
    (files: FileList) => {
      void engine?.importFiles(files, new Vector3(0, 0, 0));
    },
    [engine]
  );

  /** 从层级面板选中指定节点。 */
  const handleSelectNode = useCallback(
    (id: number) => {
      engine?.selectById(id);
    },
    [engine]
  );

  /** 删除当前选中的场景对象，支持导入模型和基础对象。 */
  const handleDeleteSelected = useCallback(() => {
    engine?.deleteSelected();
  }, [engine]);

  useEffect(() => {
    /** 响应 Delete/Backspace 快捷键，并避开输入框内的文本编辑场景。 */
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (isTyping || !selection || !engine || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }

      event.preventDefault();
      engine.deleteSelected();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [engine, selection]);

  /** 从属性面板提交对象变换或材质更新。 */
  const handleInspectorChange = useCallback(
    (update: TransformUpdate) => {
      engine?.updateSelected(update);
    },
    [engine]
  );

  /** 保存当前 Babylon 场景，项目场景读取失败时禁止覆盖磁盘文件。 */
  const handleSave = useCallback(async () => {
    if (!engine) {
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

    if (activeProject && activeScene && window.electronApp?.projects) {
      try {
        const project = await window.electronApp.projects.saveScene(activeProject.path, activeScene.id, engine.serializeScene());
        setActiveProject(project);
        setActiveSceneId(activeScene.id);
        await refreshRecentProjects();
        return;
      } catch (error) {
        setProjectError(getErrorMessage(error, "保存场景到项目失败。"));
      }
    }

    engine.saveScene();
  }, [activeProject, activeScene, engine, refreshRecentProjects, sceneLoadFailed, sceneLoading]);

  /** 打开 Babylon 官方 Inspector 作为高级调试面板。 */
  const handleToggleInspector = useCallback(() => {
    void engine?.toggleInspector();
  }, [engine]);

  /** 切换性能预览模式，并交给 Babylon 引擎调整渲染策略。 */
  const handleTogglePerformance = useCallback(() => {
    setPerformanceMode((value) => !value);
  }, []);

  /** 创建新场景并立即切换到该场景。 */
  const handleCreateScene = useCallback(async () => {
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
  }, [activeProject, refreshRecentProjects, sceneName]);

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
    <div className="editor-root">
      <Toolbar
        tool={tool}
        performanceMode={performanceMode}
        stats={stats}
        onToolChange={setTool}
        onAddPrimitive={handleAddPrimitive}
        onImportFiles={handleImportFiles}
        onSave={handleSave}
        saveDisabled={projectSaveBlocked}
        onToggleInspector={handleToggleInspector}
        onTogglePerformance={handleTogglePerformance}
      />

      <div className="project-strip">
        <div className="project-identity">
          <strong>{activeProject.name}</strong>
          <span>{activeProject.path}</span>
        </div>
        <label className="scene-switcher">
          <span>场景</span>
          <select value={activeScene?.id ?? ""} onChange={(event) => setActiveSceneId(event.target.value)}>
            {activeProject.scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-text-button" type="button" onClick={() => setSceneDialogOpen(true)}>
          新建场景
        </button>
        <button className="icon-text-button danger-button" type="button" disabled={!selection} onClick={handleDeleteSelected}>
          删除选中
        </button>
        {sceneLoading && <span className="scene-status">读取场景中</span>}
        {projectError && <span className="scene-status scene-error">{projectError}</span>}
        <button className="icon-text-button" type="button" onClick={() => activateProject(null)}>
          返回项目
        </button>
      </div>

      <div className="workspace">
        <HierarchyPanel nodes={nodes} onSelect={handleSelectNode} />
        <ViewportCanvas
          key={activeScene?.id ?? "empty-scene"}
          callbacks={callbacks}
          tool={tool}
          performanceMode={performanceMode}
          onEngineReady={handleEngineReady}
        />
        <InspectorPanel selection={selection} onChange={handleInspectorChange} />
        <AssetBrowser assets={assets} onImportFiles={handleImportFiles} />
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
              <button className="command-button" type="button" onClick={() => void handleCreateScene()}>
                创建
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
