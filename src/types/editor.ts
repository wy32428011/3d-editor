import type { ModelSourceUnit, UnitInferenceConfidence, UnitInferenceMethod } from "../editor/modelUnits";

/** 编辑器当前工具模式，对应 Unity Scene 视图常用操作。 */
export type EditorTool = "select" | "move" | "rotate" | "scale";

/** 可通过工具栏或资产面板创建的基础对象类型。 */
export type PrimitiveKind = "cube" | "sphere" | "cylinder" | "ground" | "light";

/** POI 库提供的基础点位组件类型。 */
export type PoiKind = "marker" | "info" | "warning" | "camera" | "device" | "label";

/** 场景层级树中的节点类别。 */
export type SceneNodeKind = "Mesh" | "Transform" | "Light" | "Camera" | "POI" | "CAD" | "Helper" | "Group";

/** 三维向量快照，用于 React 面板和 Babylon 对象之间传值。 */
export interface Vector3Snapshot {
  x: number;
  y: number;
  z: number;
}

/** Color3 快照，使用 0-1 线性分量保存 Babylon Color3 风格颜色。 */
export interface Color3Snapshot {
  r: number;
  g: number;
  b: number;
}

/** 模型包动态参数的可序列化值。 */
export type DynamicParameterValue = number | string | boolean | Color3Snapshot;

/** 当前支持从 TypeScript 装饰器静态解析出的参数控件类型。 */
export type DynamicInspectorFieldKind = "number" | "color3" | "string" | "boolean";

/** 模型包脚本中暴露给属性面板的动态字段定义。 */
export interface DynamicInspectorField {
  id: string;
  key: string;
  label: string;
  kind: DynamicInspectorFieldKind;
  defaultValue: DynamicParameterValue;
  min?: number;
  max?: number;
  step?: number;
  sourceFile: string;
  sourceDecorator: "visibleAsNumber" | "visibleAsColor3" | "visibleAsString" | "visibleAsBoolean";
  order: number;
}

/** 模型脚本数据驱动运动组使用的轴向。 */
export type ModelDataDrivenAxis = "x" | "y" | "z";

/** 模型脚本声明的设备匹配默认值，不包含网络连接配置。 */
export interface ModelDataDrivenDeviceDefinition {
  defaultAssetCode?: string;
  deviceIdField?: string;
  assetCodeField?: string;
  interpolationMs?: number;
}

/** 模型脚本声明的单个运动组，描述 payload 字段、运动轴向和参与节点。 */
export interface ModelDataDrivenMotionGroupDefinition {
  fields: string[];
  axis: ModelDataDrivenAxis;
  nodes: string[];
  fallbackPattern?: string;
}

/** Stacker 等模型用于本地模拟预览的非持久化数据范围。 */
export interface ModelDataDrivenSimulationDefinition {
  intervalMs?: number;
  travelRange?: number;
  liftBase?: number;
  liftRange?: number;
  forkRange?: number;
  forkSideRange?: number;
}

/** 模型脚本导出的数据驱动语义定义；场景级连接仍保存到 sceneDataDriven。 */
export interface ModelDataDrivenDefinition {
  device?: ModelDataDrivenDeviceDefinition;
  motion?: Record<string, ModelDataDrivenMotionGroupDefinition>;
  fixedNodes?: string[];
  simulation?: ModelDataDrivenSimulationDefinition;
}

/** 模型包中文件在导入协议中的角色。 */
export type ModelPackageFileRole = "primaryModel" | "modelDependency" | "script" | "meta" | "texture" | "other";

/** 项目内已经持久化的模型包文件。 */
export interface ModelPackageProjectFile {
  relativePath: string;
  projectFile: string;
  role: ModelPackageFileRole;
  size: number;
  lastModified?: number;
}

/** 文件夹模型包导入后保存到 AssetRecord 中的稳定 manifest。 */
export interface ModelPackageManifest {
  version: 1;
  packageId: string;
  displayName: string;
  rootDirectoryName: string;
  primaryModelFile: string;
  /** 用于静态解析属性栏动态参数的脚本文件。 */
  scriptFile?: string;
  /** 用于实时驱动模型几何和阵列的运行脚本文件。 */
  runtimeScriptFile?: string;
  /** 运行脚本中的运行类名，默认兼容 ParametricModelRuntimeComponent。 */
  runtimeClassName?: string;
  /** 模型脚本声明的设备绑定和运动语义，网络连接仍由场景级配置提供。 */
  dataDriven?: ModelDataDrivenDefinition;
  metaFile?: string;
  meta?: unknown;
  files: ModelPackageProjectFile[];
  dynamicFields: DynamicInspectorField[];
  warnings: string[];
  importedAt: number;
}

/** 选中模型包实例时属性面板使用的动态参数快照。 */
export interface DynamicParameterSnapshot {
  packageId: string;
  assetId: string;
  displayName: string;
  fields: DynamicInspectorField[];
  values: Record<string, DynamicParameterValue>;
  /** 最近一次运行脚本编译或应用失败的提示；为空时表示运行正常或未运行。 */
  runtimeWarning?: string;
}

/** 属性面板提交的单个动态参数更新。 */
export interface DynamicParameterUpdate {
  packageId?: string;
  key: string;
  value: DynamicParameterValue;
}

/** MeshVertexModifyComponent 的可编辑参数快照，当前先持久化配置，不直接修改网格顶点。 */
export interface MeshVertexModifySnapshot {
  showLegA: boolean;
  showLegB: boolean;
  rollerSkin: boolean;
  sideGuard: boolean;
  mainColor?: string;
  heightA: number;
  heightB: number;
  curveWidth: number;
  radius: number;
  curveAngle: number;
  rollerDensity: number;
}

/** 选中对象的业务资产信息，assetCode 与文件资产 ID 分离。 */
export interface AssetInfoSnapshot {
  assetCode: string;
  sourceFile?: string;
}

/** 当前选中对象的可编辑属性快照。 */
export interface TransformSnapshot {
  id: number;
  name: string;
  kind: SceneNodeKind;
  position: Vector3Snapshot;
  /** 节点世界包围盒尺寸，单位为米；无可渲染网格时为空。 */
  dimensions?: Vector3Snapshot;
  rotation: Vector3Snapshot;
  scaling: Vector3Snapshot;
  visible: boolean;
  materialColor?: string;
  /** CAD 图纸整体显示透明度，1 表示保留原始线条不额外变淡。 */
  cadOpacity?: number;
  /** 当前节点自身是否被锁定，解锁按钮只修改该字段。 */
  selfLocked: boolean;
  /** 当前节点是否因自身或父级锁定而处于只读状态。 */
  locked: boolean;
  /** 当前节点是否继承了父级 group 的锁定。 */
  lockedByAncestor: boolean;
  meshVertexModify: MeshVertexModifySnapshot;
  assetInfo: AssetInfoSnapshot;
  /** 文件夹模型包提供的动态参数面板数据；没有模型包时为空。 */
  dynamicParameters?: DynamicParameterSnapshot;
}

/** 属性面板向 Babylon 场景提交的部分更新。 */
export interface TransformUpdate {
  name?: string;
  position?: Vector3Snapshot;
  rotation?: Vector3Snapshot;
  scaling?: Vector3Snapshot;
  visible?: boolean;
  materialColor?: string;
  /** 更新 CAD 图纸整体显示透明度，仅 CAD 根节点生效。 */
  cadOpacity?: number;
  meshVertexModify?: Partial<MeshVertexModifySnapshot>;
  assetInfo?: Partial<Pick<AssetInfoSnapshot, "assetCode">>;
  /** 更新文件夹模型包实例的单个动态参数，并实时触发本地运行脚本应用到模型。 */
  dynamicParameter?: DynamicParameterUpdate;
}

/** 场景相机属性快照，当前只暴露编辑视口可视距离。 */
export interface SceneCameraSnapshot {
  visibleDistance: number;
}

/** 场景编辑器设置快照，保存到场景 metadata，供重新打开场景后恢复。 */
export interface SceneEditorSettingsSnapshot {
  zoomSensitivity: number;
  moveSensitivity: number;
  rotateSensitivity: number;
}

/** 场景环境属性快照，使用标准 #rrggbb 色值。 */
export interface SceneEnvironmentSnapshot {
  backgroundColor: string;
}

/** 场景数据源类型；浏览器端 MQTT 只支持通过 WebSocket 承载的 broker。 */
export type SceneDataSourceType = "none" | "websocket" | "mqtt";

/** 场景级数据驱动组件配置，负责保存连接参数并在预览模式驱动场景模型。 */
export interface SceneDataDrivenSnapshot {
  dataDrivenMode: string;
  defaultGenerator: string;
  devicePropertyInitialization: string;
  robotArmDriveMode: string;
  boxLineGenerator: string;
  size: number;
  /** 是否在预览模式启用数据订阅。 */
  dataConnectionEnabled: boolean;
  /** 数据源类型，MQTT 需要填写 ws:// 或 wss:// broker 地址。 */
  dataSourceType: SceneDataSourceType;
  /** WebSocket 服务或 MQTT over WebSocket broker 地址。 */
  dataEndpoint: string;
  /** WebSocket 订阅通道或 MQTT topic。 */
  dataChannel: string;
  /** 数据包中用于匹配模型实例的设备字段名。 */
  deviceIdField: string;
  /** 场景对象 metadata.editor.assetInfo 中用于匹配的字段名。 */
  assetCodeField: string;
  /** 数据包内业务 payload 的可选点路径，留空时直接读取根对象。 */
  payloadPath: string;
  /** 模型运动插值时长，0 表示收到数据后立即跳转。 */
  interpolationMs: number;
  /** 凭证配置引用，不在场景文件内保存真实密钥。 */
  credentialProfileId: string;
}

/** 右侧属性面板的场景级快照。 */
export interface SceneInspectorSnapshot {
  name: string;
  camera: SceneCameraSnapshot;
  editorSettings: SceneEditorSettingsSnapshot;
  environment: SceneEnvironmentSnapshot;
  dataDriven: SceneDataDrivenSnapshot;
}

/** 右侧属性面板提交的场景级更新。 */
export interface SceneInspectorUpdate {
  name?: string;
  camera?: Partial<SceneCameraSnapshot>;
  editorSettings?: Partial<SceneEditorSettingsSnapshot>;
  environment?: Partial<SceneEnvironmentSnapshot>;
  dataDriven?: Partial<SceneDataDrivenSnapshot>;
}

/** 右侧属性面板当前目标，严格区分对象属性和场景属性。 */
export type InspectorTarget =
  | { type: "node"; node: TransformSnapshot }
  | { type: "scene"; scene: SceneInspectorSnapshot };

/** 场景数据驱动组件默认值，与截图中的默认配置保持一致。 */
export const DEFAULT_SCENE_DATA_DRIVEN: SceneDataDrivenSnapshot = {
  dataDrivenMode: "RuntimeDataDrivenZD",
  defaultGenerator: "注塑托盘（实体）",
  devicePropertyInitialization: "不初始化",
  robotArmDriveMode: "全部新能源库",
  boxLineGenerator: "",
  size: 0,
  dataConnectionEnabled: false,
  dataSourceType: "none",
  dataEndpoint: "",
  dataChannel: "",
  deviceIdField: "deviceId",
  assetCodeField: "assetCode",
  payloadPath: "",
  interpolationMs: 200,
  credentialProfileId: ""
};

/** 场景编辑器设置默认值，沿用截图中三项灵敏度的初始数值。 */
export const DEFAULT_SCENE_EDITOR_SETTINGS: SceneEditorSettingsSnapshot = {
  zoomSensitivity: 10,
  moveSensitivity: 10,
  rotateSensitivity: 10
};

/** 层级面板展示的扁平化节点数据。 */
export interface SceneNodeSummary {
  id: number;
  parentId?: number;
  name: string;
  kind: SceneNodeKind;
  depth: number;
  selected: boolean;
  visible: boolean;
  hasChildren: boolean;
  childCount: number;
  /** 当前节点自身是否被锁定，解锁按钮只修改该字段。 */
  selfLocked: boolean;
  /** 当前节点是否因自身或父级锁定而处于只读状态。 */
  locked: boolean;
  /** 当前节点是否继承了父级 group 的锁定。 */
  lockedByAncestor: boolean;
}

/** 资产浏览器中的资源记录。 */
export interface AssetRecord {
  id: string;
  name: string;
  type: "model" | "texture" | "primitive" | "scene";
  sizeLabel: string;
  createdAt: number;
  /** 项目目录内持久化资产文件的相对路径，重新打开项目时用于恢复 File 缓存。 */
  projectFile?: string;
  /** 同批导入的项目内源文件列表，包含 glTF/OBJ 依赖的 bin、mtl 和贴图等文件。 */
  projectFiles?: string[];
  /** 当前浏览器会话是否还持有原始文件，可用于从资产区拖入视口。 */
  sourceAvailable?: boolean;
  /** 模型源单位，导入实例会统一归一到米制场景。 */
  sourceUnit?: ModelSourceUnit;
  /** 从源单位转换到米的缩放比例，后续拖入同一资产时会稳定复用。 */
  unitScaleToMeters?: number;
  /** 单位决策来源，用于区分自动推断、资产元数据或旧记录。 */
  unitInferenceMethod?: UnitInferenceMethod;
  /** 自动推断置信度，低置信度资产后续可提供人工覆盖。 */
  unitInferenceConfidence?: UnitInferenceConfidence;
  /** 单位归一化 metadata 版本，防止保存/恢复后重复缩放。 */
  unitNormalizationVersion?: number;
  /** 归一化前模型世界包围盒最大边长。 */
  rawMaxDimension?: number;
  /** 归一化后模型世界包围盒最大边长，单位为米。 */
  normalizedMaxDimension?: number;
  /** 文件夹模型包 manifest；用于重新实例化模型包和恢复动态参数面板。 */
  modelPackage?: ModelPackageManifest;
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
  onSelectionChange: (target: InspectorTarget) => void;
  onAssetsChange: (assets: AssetRecord[]) => void;
  onStatsChange: (stats: EditorStats) => void;
}
