/** 编辑器当前工具模式，对应 Unity Scene 视图常用操作。 */
export type EditorTool = "select" | "move" | "rotate" | "scale";

/** 可通过工具栏或资产面板创建的基础对象类型。 */
export type PrimitiveKind = "cube" | "sphere" | "cylinder" | "ground" | "light";

/** 场景层级树中的节点类别。 */
export type SceneNodeKind = "Mesh" | "Transform" | "Light" | "Camera" | "Helper";

/** 三维向量快照，用于 React 面板和 Babylon 对象之间传值。 */
export interface Vector3Snapshot {
  x: number;
  y: number;
  z: number;
}

/** 当前选中对象的可编辑属性快照。 */
export interface TransformSnapshot {
  id: number;
  name: string;
  kind: SceneNodeKind;
  position: Vector3Snapshot;
  rotation: Vector3Snapshot;
  scaling: Vector3Snapshot;
  visible: boolean;
  materialColor?: string;
}

/** 属性面板向 Babylon 场景提交的部分更新。 */
export interface TransformUpdate {
  name?: string;
  position?: Vector3Snapshot;
  rotation?: Vector3Snapshot;
  scaling?: Vector3Snapshot;
  visible?: boolean;
  materialColor?: string;
}

/** 层级面板展示的扁平化节点数据。 */
export interface SceneNodeSummary {
  id: number;
  name: string;
  kind: SceneNodeKind;
  depth: number;
  selected: boolean;
  visible: boolean;
  childCount: number;
}

/** 资产浏览器中的资源记录。 */
export interface AssetRecord {
  id: string;
  name: string;
  type: "model" | "texture" | "primitive" | "scene";
  sizeLabel: string;
  createdAt: number;
}

/** 视口底部状态栏展示的运行指标。 */
export interface EditorStats {
  fps: number;
  meshes: number;
  activeMeshes: number;
  vertices: number;
  drawCalls: number;
}

/** Babylon 引擎向 React 外层同步状态的回调集合。 */
export interface EditorEngineCallbacks {
  onSceneGraphChange: (nodes: SceneNodeSummary[]) => void;
  onSelectionChange: (selection: TransformSnapshot | null) => void;
  onAssetsChange: (assets: AssetRecord[]) => void;
  onStatsChange: (stats: EditorStats) => void;
}
