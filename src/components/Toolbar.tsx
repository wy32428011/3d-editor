import {
  Box,
  Bug,
  Circle,
  Cylinder,
  Gauge,
  Grid3X3,
  Lightbulb,
  MousePointer2,
  Move3D,
  Rotate3D,
  Save,
  Scaling,
  Upload
} from "lucide-react";
import { useRef } from "react";
import type { EditorStats, EditorTool, PrimitiveKind } from "../types/editor";

interface ToolbarProps {
  tool: EditorTool;
  performanceMode: boolean;
  stats: EditorStats;
  onToolChange: (tool: EditorTool) => void;
  onAddPrimitive: (kind: PrimitiveKind) => void;
  onImportFiles: (files: FileList) => void;
  onSave: () => void;
  saveDisabled?: boolean;
  onToggleInspector: () => void;
  onTogglePerformance: () => void;
}

const toolButtons: Array<{ tool: EditorTool; label: string; icon: typeof MousePointer2 }> = [
  { tool: "select", label: "选择", icon: MousePointer2 },
  { tool: "move", label: "移动", icon: Move3D },
  { tool: "rotate", label: "旋转", icon: Rotate3D },
  { tool: "scale", label: "缩放", icon: Scaling }
];

const primitiveButtons: Array<{ kind: PrimitiveKind; label: string; icon: typeof Box }> = [
  { kind: "cube", label: "立方体", icon: Box },
  { kind: "sphere", label: "球体", icon: Circle },
  { kind: "cylinder", label: "圆柱体", icon: Cylinder },
  { kind: "ground", label: "地面", icon: Grid3X3 },
  { kind: "light", label: "点光源", icon: Lightbulb }
];

/** 顶部工具栏负责工具切换、基础对象创建、导入、保存和调试入口。 */
export function Toolbar({
  tool,
  performanceMode,
  stats,
  onToolChange,
  onAddPrimitive,
  onImportFiles,
  onSave,
  saveDisabled = false,
  onToggleInspector,
  onTogglePerformance
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** 打开隐藏文件选择器，复用拖拽导入同一套逻辑。 */
  const openFilePicker = () => {
    inputRef.current?.click();
  };

  /** 处理本地文件选择结果，并清空 input 以便重复选择同名文件。 */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      onImportFiles(event.target.files);
      event.target.value = "";
    }
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">B</span>
        <span>Babylon 3D Editor</span>
      </div>

      <div className="toolbar-group" aria-label="工具">
        {toolButtons.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.tool}
              className={`icon-button ${tool === item.tool ? "is-active" : ""}`}
              title={item.label}
              type="button"
              onClick={() => onToolChange(item.tool)}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </div>

      <div className="toolbar-group" aria-label="创建">
        {primitiveButtons.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.kind} className="icon-button" title={item.label} type="button" onClick={() => onAddPrimitive(item.kind)}>
              <Icon size={18} />
            </button>
          );
        })}
      </div>

      <div className="toolbar-group" aria-label="文件">
        <button className="icon-button" title="导入资源" type="button" onClick={openFilePicker}>
          <Upload size={18} />
        </button>
        <button className="icon-button" title={saveDisabled ? "场景读取完成后才能保存" : "保存场景"} type="button" disabled={saveDisabled} onClick={onSave}>
          <Save size={18} />
        </button>
        <button className="icon-button" title="Babylon Inspector" type="button" onClick={onToggleInspector}>
          <Bug size={18} />
        </button>
        <button
          className={`icon-button ${performanceMode ? "is-active" : ""}`}
          title="性能预览"
          type="button"
          onClick={onTogglePerformance}
        >
          <Gauge size={18} />
        </button>
      </div>

      <div className="stats-strip" aria-label="状态">
        <span>{stats.fps} FPS</span>
        <span>{stats.meshes} Mesh</span>
        <span>{stats.vertices.toLocaleString()} Vtx</span>
      </div>

      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        multiple
        accept=".glb,.gltf,.babylon,.obj,.stl,.png,.jpg,.jpeg,.webp,.ktx,.ktx2"
        onChange={handleFileChange}
      />
    </header>
  );
}
