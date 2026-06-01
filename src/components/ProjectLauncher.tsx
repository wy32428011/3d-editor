import { Clock, FolderOpen, FolderPlus, Plus } from "lucide-react";
import { useState } from "react";

interface ProjectLauncherProps {
  recentProjects: RecentProjectRecord[];
  error: string | null;
  onCreateProject: (name: string) => Promise<void>;
  onOpenProject: () => Promise<void>;
  onOpenRecentProject: (projectPath: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

/** 项目启动页负责展示最近项目，并提供创建和打开项目入口。 */
export function ProjectLauncher({
  recentProjects,
  error,
  onCreateProject,
  onOpenProject,
  onOpenRecentProject,
  onRefresh
}: ProjectLauncherProps) {
  const [projectName, setProjectName] = useState("My Babylon Project");
  const [busy, setBusy] = useState(false);

  /** 包装异步操作，避免重复点击造成多个文件对话框。 */
  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="project-launcher">
      <section className="launcher-panel">
        <div className="launcher-heading">
          <span className="brand-mark">B</span>
          <div>
            <h1>Babylon 3D Editor</h1>
            <p>项目工作台</p>
          </div>
        </div>

        <div className="launcher-actions">
          <label className="field launcher-field">
            <span>项目名称</span>
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          </label>

          <button
            className="command-button"
            disabled={busy}
            type="button"
            onClick={() => runAction(() => onCreateProject(projectName))}
          >
            <FolderPlus size={18} />
            <span>创建项目</span>
          </button>

          <button className="command-button" disabled={busy} type="button" onClick={() => runAction(onOpenProject)}>
            <FolderOpen size={18} />
            <span>打开项目</span>
          </button>

          <button className="icon-text-button" disabled={busy} type="button" onClick={() => runAction(onRefresh)}>
            <Clock size={16} />
            <span>刷新最近项目</span>
          </button>
        </div>

        {error && <div className="launcher-error">{error}</div>}
      </section>

      <section className="recent-panel">
        <div className="panel-title">最近项目</div>
        <div className="recent-list">
          {recentProjects.length === 0 && <div className="empty-state">暂无最近项目</div>}
          {recentProjects.map((project) => (
            <button
              key={project.path}
              className={`recent-row ${project.exists === false ? "is-missing" : ""}`}
              disabled={busy || project.exists === false}
              type="button"
              onClick={() => runAction(() => onOpenRecentProject(project.path))}
            >
              <Plus size={15} />
              <span className="recent-name">{project.name}</span>
              <span className="recent-path">{project.path}</span>
              <time>{new Date(project.lastOpenedAt).toLocaleString()}</time>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
