import {
  Box,
  Bug,
  Circle,
  Cuboid,
  Cylinder,
  FileAxis3d,
  Gauge,
  Grid3X3,
  Lightbulb,
  Map,
  MousePointer2,
  Move3D,
  Package,
  Play,
  RadioTower,
  Rocket,
  Rotate3D,
  Save,
  Scaling,
  Square,
  Undo2,
  Upload,
  type LucideIcon
} from "lucide-react";
import { useRef } from "react";
import type { EditorStats, EditorTool, PrimitiveKind } from "../types/editor";

interface ToolbarProps {
  tool: EditorTool;
  performanceMode: boolean;
  previewMode: boolean;
  overheadMode: boolean;
  stats: EditorStats;
  onToolChange: (tool: EditorTool) => void;
  onAddPrimitive: (kind: PrimitiveKind) => void;
  onImportFiles: (files: FileList) => void;
  onImportCadDrawing: (files: FileList | File[]) => void;
  onImportModelPackage: () => void;
  onOpenDataSourceConfig: () => void;
  dataSourceConfigDisabled?: boolean;
  dataSourceConfigDisabledReason?: string;
  onUndo: () => void;
  undoDisabled?: boolean;
  undoDisabledReason?: string;
  onSave: () => void;
  saveDisabled?: boolean;
  saveDisabledReason?: string;
  onPublish: () => void;
  publishDisabled?: boolean;
  publishDisabledReason?: string;
  cadImportDisabled?: boolean;
  cadImportDisabledReason?: string;
  onToggleInspector: () => void;
  onTogglePerformance: () => void;
  onTogglePreview: () => void;
  onToggleOverheadMode: () => void;
}

const toolButtons: Array<{ tool: EditorTool; label: string; icon: typeof MousePointer2 }> = [
  { tool: "select", label: "选择", icon: MousePointer2 },
  { tool: "move", label: "移动", icon: Move3D },
  { tool: "rotate", label: "旋转", icon: Rotate3D },
  { tool: "scale", label: "缩放", icon: Scaling }
];

const primitiveButtons: Array<{ kind: PrimitiveKind; label: string; icon: LucideIcon }> = [
  { kind: "cube", label: "立方体", icon: Box },
  { kind: "locatorWireCube", label: "定位线框立方体", icon: Cuboid },
  { kind: "sphere", label: "球体", icon: Circle },
  { kind: "cylinder", label: "圆柱体", icon: Cylinder },
  { kind: "ground", label: "地面", icon: Grid3X3 },
  { kind: "light", label: "点光源", icon: Lightbulb }
];

/** 压缩 GPU 名称，避免长 renderer 字符串撑开工具栏。 */
function formatGpuRendererLabel(stats: EditorStats): string {
  if (stats.contextLost) {
    return "WebGL 丢失";
  }

  const renderer = stats.gpuRenderer
    .replace(/^ANGLE\s*\(/i, "")
    .replace(/\s+Direct3D.*$/i, "")
    .replace(/\s+D3D.*$/i, "")
    .trim();
  if (!renderer || renderer === "未知渲染器") {
    return stats.gpuVendor;
  }
  return renderer.length > 24 ? `${renderer.slice(0, 24)}...` : renderer;
}

/** 拼装 GPU 诊断提示，便于确认是否跑在硬件 GPU、高清模式和当前渲染分辨率。 */
function formatGpuRendererTitle(stats: EditorStats, performanceMode: boolean): string {
  return [
    `GPU Vendor: ${stats.gpuVendor}`,
    `GPU Renderer: ${stats.gpuRenderer}`,
    `Quality: ${performanceMode ? "performance preview" : "4K high quality"}`,
    `Render Size: ${stats.renderWidth}x${stats.renderHeight}`,
    `Hardware Scaling: ${stats.hardwareScalingLevel}`,
    `Context: ${stats.contextLost ? "lost" : "ok"}`
  ].join("\n");
}

/** 顶部工具栏负责工具切换、基础对象创建、导入、保存和调试入口。 */
export function Toolbar({
  tool,
  performanceMode,
  previewMode,
  overheadMode,
  stats,
  onToolChange,
  onAddPrimitive,
  onImportFiles,
  onImportCadDrawing,
  onImportModelPackage,
  onOpenDataSourceConfig,
  dataSourceConfigDisabled = false,
  dataSourceConfigDisabledReason,
  onUndo,
  undoDisabled = false,
  undoDisabledReason,
  onSave,
  saveDisabled = false,
  saveDisabledReason,
  onPublish,
  publishDisabled = false,
  publishDisabledReason,
  cadImportDisabled = false,
  cadImportDisabledReason,
  onToggleInspector,
  onTogglePerformance,
  onTogglePreview,
  onToggleOverheadMode
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cadInputRef = useRef<HTMLInputElement>(null);

  /** 打开隐藏文件选择器，复用拖拽导入同一套逻辑。 */
  const openFilePicker = () => {
    inputRef.current?.click();
  };

  /** 打开 CAD 图纸选择器，CAD 会直接生成贴地矢量线。 */
  const openCadFilePicker = () => {
    if (cadImportDisabled) {
      return;
    }

    cadInputRef.current?.click();
  };

  /** 处理本地文件选择结果，并清空 input 以便重复选择同名文件。 */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      onImportFiles(event.target.files);
      event.target.value = "";
    }
  };

  /** 处理 CAD 图纸选择结果，并清空 input 以便重复选择同名文件。 */
  const handleCadFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      onImportCadDrawing(event.target.files);
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
        <button
          className="icon-button"
          title={undoDisabled ? undoDisabledReason ?? "暂无可撤销的场景布局操作" : "撤销场景布局（Ctrl+Z）"}
          type="button"
          disabled={undoDisabled}
          onClick={onUndo}
        >
          <Undo2 size={18} />
        </button>
        <button className="icon-button" title="导入资源" type="button" onClick={openFilePicker}>
          <Upload size={18} />
        </button>
        <button
          className="icon-button"
          title={cadImportDisabled ? cadImportDisabledReason ?? "CAD 图纸正在导入，请等待完成" : "导入 CAD 图纸"}
          type="button"
          disabled={cadImportDisabled}
          onClick={openCadFilePicker}
        >
          <FileAxis3d size={18} />
        </button>
        <button className="icon-button" title="导入模型包文件夹" type="button" onClick={onImportModelPackage}>
          <Package size={18} />
        </button>
        <button
          className="icon-button"
          title={saveDisabled ? saveDisabledReason ?? "当前状态下不能保存场景" : "保存场景"}
          type="button"
          disabled={saveDisabled}
          onClick={onSave}
        >
          <Save size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="发布场景"
          title={publishDisabled ? publishDisabledReason ?? "当前状态下不能发布场景" : "发布场景"}
          type="button"
          disabled={publishDisabled}
          onClick={onPublish}
        >
          <Rocket size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="统一数据源配置"
          title={dataSourceConfigDisabled ? dataSourceConfigDisabledReason ?? "场景准备完成后才能配置数据源" : "统一配置 MQTT / Socket 地址"}
          type="button"
          disabled={dataSourceConfigDisabled}
          onClick={onOpenDataSourceConfig}
        >
          <RadioTower size={18} />
        </button>
        <button
          className={`icon-button ${previewMode ? "is-active" : ""}`}
          title={previewMode ? "停止预览" : "预览完整场景和动画"}
          type="button"
          onClick={onTogglePreview}
        >
          {previewMode ? <Square size={18} /> : <Play size={18} />}
        </button>
        <button
          className={`icon-button ${overheadMode ? "is-active" : ""}`}
          title={overheadMode ? "退出正顶俯瞰模式" : "正顶俯瞰模式"}
          type="button"
          onClick={onToggleOverheadMode}
        >
          <Map size={18} />
        </button>
        <button className="icon-button" title="Babylon Inspector" type="button" onClick={onToggleInspector}>
          <Bug size={18} />
        </button>
        <button
          className={`icon-button ${performanceMode ? "is-active" : ""}`}
          title={performanceMode ? "退出性能预览，恢复高清 4K" : "性能预览（降低清晰度）"}
          type="button"
          onClick={onTogglePerformance}
        >
          <Gauge size={18} />
        </button>
      </div>

      <div className="stats-strip" aria-label="状态">
        <span>{stats.fps} FPS</span>
        <span>{stats.meshes} Mesh</span>
        <span>{stats.drawCalls} Draw</span>
        <span>{stats.vertices.toLocaleString()} Vtx</span>
        <span title={formatGpuRendererTitle(stats, performanceMode)}>{formatGpuRendererLabel(stats)}</span>
        <span title={`渲染分辨率 ${stats.renderWidth}x${stats.renderHeight}`}>{performanceMode ? "Perf" : "4K"} {stats.hardwareScalingLevel}x</span>
      </div>

      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        multiple
        accept=".glb,.gltf,.babylon,.obj,.stl,.bin,.mtl,.png,.jpg,.jpeg,.webp,.ktx,.ktx2"
        onChange={handleFileChange}
      />
      <input
        ref={cadInputRef}
        className="hidden-input"
        type="file"
        multiple
        accept=".dxf,.dwg,.png,.jpg,.jpeg,.webp"
        disabled={cadImportDisabled}
        onChange={handleCadFileChange}
      />
    </header>
  );
}
