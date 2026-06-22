import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Loading/Plugins/babylonFileLoader";
import "@babylonjs/core/Materials/imageProcessingConfiguration";
import "@babylonjs/core/Meshes/groundMesh";
import "@babylonjs/core/Animations/animatable";
import "@babylonjs/loaders/glTF";
import "@babylonjs/loaders/OBJ";
import "@babylonjs/loaders/STL";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import type { ICameraInput } from "@babylonjs/core/Cameras/cameraInputsManager";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { SelectionOutlineLayer } from "@babylonjs/core/Layers/selectionOutlineLayer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { CreatePolygon } from "@babylonjs/core/Meshes/Builders/polygonBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Node } from "@babylonjs/core/node";
import { ImportMeshAsync, LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { SceneSerializer } from "@babylonjs/core/Misc/sceneSerializer";
import { FilesInputStore } from "@babylonjs/core/Misc/filesInputStore";
import { Scene } from "@babylonjs/core/scene";
import type { Animatable } from "@babylonjs/core/Animations/animatable";
import type { Animation } from "@babylonjs/core/Animations/animation";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import earcut from "earcut";
import { applySnapshotVector, formatBytes, snapshotVector } from "../editor/math";
import {
  createDefaultPoiConfig,
  getPoiCatalogItem,
  normalizePoiConfig,
  normalizePoiKind,
  type PoiCatalogItem
} from "../editor/poiCatalog";
import {
  compileModelPackageRuntime,
  DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS,
  invokeModelPackageRuntimeLifecycle,
  type ModelPackageRuntimeInstance
} from "../editor/modelPackageRuntimeCompiler";
import {
  SceneDataDrivenRuntime,
  type SceneDataDrivenDropTarget,
  type SceneDataDrivenRootMotionFields,
  type SceneDataDrivenTarget,
  type RuntimeCargoBoxRequest
} from "../editor/sceneDataDrivenRuntime";
import { SceneBusinessRuntime } from "../editor/sceneBusinessRuntime";
import {
  parseCadDxfLineStream,
  type CadDxfBounds,
  type CadDxfFill,
  type CadDxfImagePrimitive,
  type CadDxfLineChunk,
  type CadDxfLineChunkStyle,
  type CadDxfLineProgress,
  type CadDxfParseResult,
  type CadDxfPointPrimitive,
  type CadDxfPolyline,
  type CadDxfPrimitive,
  type CadDxfText,
  type CadDxfWipeoutPrimitive,
  type CadLineImportSummary
} from "../editor/cadDxf";
import {
  createModelUnitMetadata,
  getPersistedModelUnitMetadata,
  inferModelUnitFromBounds,
  isNormalizedModelUnitMetadata,
  MODEL_UNIT_NORMALIZATION_VERSION,
  type ModelUnitMetadata
} from "../editor/modelUnits";
import {
  DEFAULT_BOX_SIZE_METERS,
  DEFAULT_CYLINDER_DIAMETER_METERS,
  DEFAULT_CYLINDER_HEIGHT_METERS,
  DEFAULT_GROUND_SIZE_METERS,
  DEFAULT_LIGHT_HEIGHT_METERS,
  DEFAULT_SPHERE_DIAMETER_METERS,
  EDITOR_GRID_CELL_SIZE_METERS,
  EDITOR_GRID_SIZE_METERS,
  SCENE_UNIT_IN_METERS
} from "../editor/units";
import {
  DEFAULT_LOCATOR_ANIMATION_CONNECTION,
  DEFAULT_LOCATOR_DIMENSIONS,
  DEFAULT_SCENE_DATA_DRIVEN,
  DEFAULT_SCENE_EDITOR_SETTINGS
} from "../types/editor";
import type {
  AssetInfoSnapshot,
  AssetLibraryFocusTarget,
  AssetRecord,
  DynamicInspectorField,
  DynamicParameterSnapshot,
  DynamicParameterUpdate,
  DynamicParameterValue,
  EditorEngineCallbacks,
  EditorStats,
  EditorTool,
  MeshVertexModifySnapshot,
  LocatorAnimationConnectionSnapshot,
  LocatorAnimationConnectionUpdate,
  LocatorDimensionsSnapshot,
  LocatorDimensionsUpdate,
  ModelArrayAxis,
  ModelArrayOptions,
  ModelArrayResult,
  ModelDataDrivenDefinition,
  ModelPackageManifest,
  ModelPackageProjectFile,
  PoiConfigSnapshot,
  PoiKind,
  PrimitiveKind,
  RenderQualityMode,
  SceneDataDrivenSnapshot,
  SceneDataSourceType,
  SceneEditorSettingsSnapshot,
  SceneInspectorSnapshot,
  SceneInspectorUpdate,
  SceneNodeKind,
  SceneNodeSummary,
  TransformSnapshot,
  TransformUpdate
} from "../types/editor";

const HELPER_FLAG = "isEditorHelper";
const ROOT_FLAG = "isEditorRoot";
const DROP_SURFACE_FLAG = "isEditorDropSurface";
const CLONE_SOURCE_TOKEN_KEY = "__editorCloneSourceToken";
const GROUP_NODE_TYPE = "group";
const STACKER_DEMO_DEVICE_ID = "DDJ2";
const STACKER_DEMO_ENDPOINT = "ws://127.0.0.1:18083/stacker";
const STACKER_DEMO_TOPIC = `dt/factory/logistics/stacker/${STACKER_DEMO_DEVICE_ID}/twindatadriven/joint`;
export const DEFAULT_SCENE_ENVIRONMENT_COLOR = "#26312d";
const GRID_RENDER_ELEVATION_METERS = 0.015;
const EDITOR_LENGTH_UNIT = "meter";
const IMPORTED_MODEL_UNIT_POLICY = "imported-model-coordinates-are-meters";
const TARGET_HIGH_QUALITY_RENDER_PIXELS = 3840 * 2160;
const TARGET_BALANCED_RENDER_PIXELS = 2560 * 1440;
const MAX_HIGH_QUALITY_RENDER_SCALE = 4;
const PERFORMANCE_MODE_MIN_HARDWARE_SCALING_LEVEL = 1.25;
const HARDWARE_SCALING_LEVEL_EPSILON = 0.01;
const ADAPTIVE_RENDER_QUALITY_DROP_FPS = 50;
const ADAPTIVE_RENDER_QUALITY_FAST_DROP_FPS = 35;
const ADAPTIVE_RENDER_QUALITY_RECOVER_FPS = 57;
const ADAPTIVE_RENDER_QUALITY_SAMPLE_MS = 1000;
const ADAPTIVE_RENDER_QUALITY_RECOVER_SAMPLES = 3;
const ADAPTIVE_RENDER_QUALITY_STEP = 0.12;
const ADAPTIVE_RENDER_QUALITY_FAST_STEP = 0.28;
const ADAPTIVE_RENDER_QUALITY_MAX_HARDWARE_SCALING_LEVEL = 2;
const ADAPTIVE_GRID_FLASH_THROTTLE_MS = 120;
const EDITOR_STATS_INTERVAL_MS = 1000;
const LARGE_SCENE_EFFECT_MESH_THRESHOLD = 1200;
const LARGE_SCENE_EFFECT_VERTEX_THRESHOLD = 500000;
const LOW_FPS_EFFECT_REDUCTION_THRESHOLD = 50;
const LARGE_SCENE_EFFECT_ACTIVE_MESH_THRESHOLD = 900;
const LARGE_SCENE_EFFECT_DRAW_CALL_THRESHOLD = 1200;
const SELECTION_OUTLINE_COLOR = "#63d7ff";
const SELECTION_OUTLINE_THICKNESS = 1.8;
const SELECTION_OUTLINE_TEXTURE_RATIO = 0.5;
const CAD_LINE_CHUNK_PERSIST_CONCURRENCY = 2;
const SCENE_UNDO_HISTORY_LIMIT = 20;
const SCENE_UNDO_MAX_MESHES = 1200;
const SCENE_UNDO_MAX_VERTICES = 500000;
const SCENE_UNDO_MAX_SERIALIZED_BYTES = 16 * 1024 * 1024;
const IMPORTED_MODEL_NORMALIZED_UNIT_POLICY = "imported-model-source-units-normalized-to-meters";
const GRID_MAJOR_LINE_EVERY_CELLS = 5;
const MAX_GRID_LINE_COUNT_PER_AXIS = 160;
const GRID_CAMERA_RADIUS_COVERAGE_FACTOR = 12;
const GRID_VIEWPORT_PADDING_FACTOR = 0.9;
const GRID_RECENTER_THRESHOLD_CELLS = 8;
const GRID_RESIZE_HYSTERESIS = 0.35;
const GRID_FLASH_PERIOD_MS = 1200;
const MIN_LOCATOR_DIMENSION_METERS = 0.01;
const GRID_FLASH_MIN_VISIBILITY = 0.32;
const GRID_FLASH_MAX_VISIBILITY = 1;
const GRID_FLASH_PULSE_ELEVATION_OFFSET_METERS = 0.026;
const GRID_FLASH_SWEEP_ELEVATION_OFFSET_METERS = 0.018;
const GRID_GLOW_TEXTURE_RATIO = 0.35;
const GRID_GLOW_BLUR_KERNEL_SIZE = 28;
const GRID_GLOW_MIN_INTENSITY = 0.08;
const GRID_GLOW_MAX_INTENSITY = 0.68;
const GRID_GLOW_EMISSIVE_MIN_STRENGTH = 0.55;
const GRID_GLOW_EMISSIVE_MAX_STRENGTH = 1.85;
const MAX_MODEL_PACKAGE_RUNTIME_GENERATED_NODES = 5000;
const MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON = 0.000001;
const MAX_MODEL_ARRAY_CLONE_COUNT = 50;
const MODEL_ARRAY_MIN_AUTO_STEP_METERS = 0.000001;
const MAX_MODEL_ARRAY_SPACING_METERS = 100000;
const SHELF_MODEL_KEY = "shelf";
const SHELF_ARRAY_SHARED_SUPPORT_NODE_NAMES = ["Box004", "Box001", "Box002", "Box003", "node5", "node7", "node9", "node11"];
const SHELF_ARRAY_RUNTIME_NAME_SUFFIX_PATTERN = /_(?:shelf_layer|shelf_column|double_deep).*$/i;
const OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES = ["GT1", "GT2", "GT3", "GT4", "GT5", "GT6", "GT7", "GT8", "GT9", "GT10"];
const OPAQUE_ROLLER_CONVEYOR_FRONT_SUPPORT_NODE_NAMES = ["A16", "A7", "A3", "A5", "A17"];
const OPAQUE_ROLLER_CONVEYOR_REAR_SUPPORT_NODE_NAMES = ["A18", "A19", "A4", "A2", "A6"];
// 图片规则：左侧黄色固定区作为 length 起点，不随长梁伸长移动。
const OPAQUE_ROLLER_CONVEYOR_LENGTH_FIXED_START_NODE_NAMES = ["A16", "A17", "A7", "A5", "A3", "A9", "A13"];
// 图片规则：红色区域只拉伸长梁右侧顶点，长梁节点自身不整体平移。
const OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES = ["A10", "A11"];
// 图片规则：右侧黄色尾端组件随 length 尾端平移，但不参与后支架显隐开关。
const OPAQUE_ROLLER_CONVEYOR_LENGTH_TAIL_EXTENSION_NODE_NAMES = ["A12", "A14"];
const OPAQUE_ROLLER_CONVEYOR_LENGTH_TAIL_FOLLOW_NODE_NAMES = [
  ...OPAQUE_ROLLER_CONVEYOR_REAR_SUPPORT_NODE_NAMES,
  ...OPAQUE_ROLLER_CONVEYOR_LENGTH_TAIL_EXTENSION_NODE_NAMES
];
const OPAQUE_ROLLER_CONVEYOR_WIDTH_SCALE_NODE_NAMES = ["A1", "A2", "A3", "A21"];
const OPAQUE_ROLLER_CONVEYOR_HEIGHT_SCALE_NODE_NAMES = ["A4", "A5", "A6", "A7"];
const OPAQUE_ROLLER_CONVEYOR_GROUND_NODE_NAMES = ["A16", "A17", "A18", "A19"];
const OPAQUE_ROLLER_CONVEYOR_BOTTOM_FIXED_NODE_NAMES = ["A2", "A3", ...OPAQUE_ROLLER_CONVEYOR_GROUND_NODE_NAMES];
const OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME = "Box003";
const OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME = "DJ";
// 图片红框规则：链条机主体长条和导轨按顶点 Z 延展，固定局部 -Z 起点，禁止根节点整体拉伸。
const OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES = [
  OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME,
  "Rail_01_M001",
  "Rail_02_M001",
  "ZJ",
  "ZJ01"
];
const OPAQUE_CHAIN_CONVEYOR_TAIL_FOLLOW_NODE_NAMES = ["Box004"];
// 图片目标规则：链条机改宽时只拉主体横梁跨度，两侧导轨、支架和尾端附件作为刚体外移。
const OPAQUE_CHAIN_CONVEYOR_WIDTH_GEOMETRY_NODE_NAMES = [OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME];
const OPAQUE_CHAIN_CONVEYOR_WIDTH_FOLLOW_NODE_NAMES = [
  "Rail_01_M001",
  "Rail_02_M001",
  "ZJ",
  "ZJ01",
  "Box004"
];
const OPAQUE_CHAIN_CONVEYOR_BASELINE_REQUIRED_NODE_NAMES = [
  ...OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES,
  ...OPAQUE_CHAIN_CONVEYOR_TAIL_FOLLOW_NODE_NAMES,
  OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME
];
const OPAQUE_CHAIN_CONVEYOR_REQUIRED_NODE_NAMES = [
  OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME,
  "Rail_01_M001",
  "Rail_02_M001",
  OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME
];
const OPAQUE_CHAIN_CONVEYOR_BASELINE_VERSION = 2;
const OPAQUE_CHAIN_CONVEYOR_EXTENSION_REASON = "chainLengthExtension";
const OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_HALF_WIDTH_RATIO = 0.24;
const OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_MOTOR_WIDTH_RATIO = 0.72;
const OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_HALF_DEPTH_RATIO = 0.24;
const OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_MOTOR_DEPTH_RATIO = 2.4;
// GLB 会因法线/材质拆出同坐标顶点，组件拆分前先按坐标焊接到物理零件粒度。
const OPAQUE_CHAIN_CONVEYOR_COMPONENT_WELD_PRECISION = 100000;
const CAD_LINE_ELEVATION_METERS = GRID_RENDER_ELEVATION_METERS + 0.045;
const CAD_LINE_CHUNK_SEGMENTS = 32000;
const CAD_LINE_PACK_MAX_BYTES = 20 * 1024 * 1024;
const PROJECT_TEXTURE_SIDECAR_VERSION = 1;
const PROJECT_TEXTURE_SIDECAR_MIN_BYTES = 1;
const CAD_RESTORE_MESH_SEGMENTS = 32000;
const CAD_RESTORE_BATCH_CHUNKS = 48;
const CAD_RESTORE_YIELD_MESHES = 8;
const CAD_FILL_ELEVATION_METERS = CAD_LINE_ELEVATION_METERS - 0.012;
const CAD_IMAGE_ELEVATION_METERS = CAD_FILL_ELEVATION_METERS - 0.01;
const CAD_WIPEOUT_ELEVATION_METERS = CAD_FILL_ELEVATION_METERS + 0.006;
const CAD_TEXT_ELEVATION_METERS = CAD_LINE_ELEVATION_METERS + 0.018;
const CAD_POINT_MARKER_SIZE_METERS = 0.28;
const CAD_TEXT_TEXTURE_MAX_SIZE = 2048;
const IGNORED_CAD_IMAGE_EXTENSIONS = new Set([".bmp"]);
const COORDINATE_AXIS_LENGTH_METERS = 3.2;
const COORDINATE_AXIS_HEAD_LENGTH_METERS = 0.42;
const COORDINATE_AXIS_HEAD_WIDTH_METERS = 0.22;
const COORDINATE_AXIS_LABEL_OFFSET_METERS = 0.52;
const COORDINATE_AXIS_LABEL_SIZE_METERS = 0.48;
const COORDINATE_AXIS_LABEL_TEXTURE_SIZE = 128;
const COORDINATE_AXIS_GROUND_LIFT_METERS = 0.06;
const DEFAULT_CAMERA_RADIUS_METERS = 28;
const CAMERA_PAN_SPEED_REFERENCE_RADIUS_METERS = DEFAULT_CAMERA_RADIUS_METERS;
const MIN_CAMERA_PAN_SPEED_SCALE = 1;
const MAX_CAMERA_PAN_SPEED_SCALE = 3000;
const MIN_FRAMED_CAMERA_RADIUS_METERS = 8;
const CAMERA_FRAME_MARGIN = 1.45;
const DEFAULT_CAMERA_FAR_CLIP_METERS = 10000;
const MAX_CAMERA_FAR_CLIP_METERS = 1000000;
const DEFAULT_CAMERA_WHEEL_PRECISION = 45;
const CAMERA_WHEEL_PIXEL_NORMALIZE = 40;
const DEFAULT_CAMERA_PANNING_SENSIBILITY = 55;
const DEFAULT_CAMERA_ROTATION_SENSIBILITY = 1000;
const MIN_CAMERA_INPUT_SENSIBILITY = 1;
const MAX_CAMERA_INPUT_SENSIBILITY = 100000;
const CAMERA_POINTER_PAN_PIXEL_SCALE = 20;
const CAMERA_POINTER_DOLLY_PIXEL_SCALE = 8;
const CAMERA_POINTER_DRAG_THRESHOLD = 6;
const CAMERA_NAVIGATION_SHIFT_MULTIPLIER = 3;
const CAMERA_MIN_BETA = 0.01;
const CAMERA_MAX_BETA = Math.PI - CAMERA_MIN_BETA;
const OVERHEAD_CAMERA_BETA = CAMERA_MIN_BETA;
const LEFT_MOUSE_BUTTON = 0;
const MIDDLE_MOUSE_BUTTON = 1;
const RIGHT_MOUSE_BUTTON = 2;

/** 提取引擎内部异步错误消息，避免跨 worker/IPC 的非 Error 异常丢失上下文。 */
function getEngineErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}
const POI_STEM_HEIGHT_METERS = 1.35;
const POI_STEM_DIAMETER_METERS = 0.045;
const POI_BASE_DIAMETER_METERS = 0.42;
const POI_HEAD_SIZE_METERS = 0.42;
const POI_LABEL_WIDTH_METERS = 1.08;
const POI_LABEL_HEIGHT_METERS = 0.34;
const POI_LABEL_TEXTURE_WIDTH = 384;
const POI_LABEL_TEXTURE_HEIGHT = 128;
const DEFAULT_MESH_VERTEX_MODIFY: MeshVertexModifySnapshot = {
  showLegA: true,
  showLegB: true,
  rollerSkin: true,
  sideGuard: true,
  heightA: 0.3616738,
  heightB: 0.3616731,
  curveWidth: 1.185945,
  radius: 1,
  curveAngle: 90,
  rollerDensity: 0.5
};

/** POI 模板直接复用 catalog 条目，保证 UI 和三维创建语义一致。 */
type PoiDefinition = PoiCatalogItem;

/** 节点世界包围盒信息，用于导入落点、相机取景和自适应网格。 */
interface NodeWorldBounds {
  minimum: Vector3;
  maximum: Vector3;
  center: Vector3;
  size: Vector3;
  maxDimension: number;
}

/** 模型导入后的单位信息，用于把来源单位和归一比例写入节点元数据。 */
interface MetricModelMetadataOptions {
  sourceFile?: string;
  sourceUnit?: string;
  unitScaleToMeters?: number;
  modelUnitPolicy?: string;
  unitNormalization?: ModelUnitMetadata;
}

/** 导入阶段一定包含单位归一化记录，便于资产登记稳定复用。 */
interface ImportedModelMetricMetadataOptions extends MetricModelMetadataOptions {
  unitNormalization: ModelUnitMetadata;
}

/** CAD 导入时的图片依赖上下文，优先同批 File，其次 Electron 受控读取 DXF 同目录引用。 */
interface CadDrawingImportOptions {
  relatedFiles?: File[];
  sourcePath?: string;
  persistLineChunk?: (fileName: string, data: ArrayBuffer) => Promise<string>;
  onProgress?: (progress: CadDxfLineProgress) => void;
}

/** 项目保存时用于把运行时贴图写成场景侧车文件。 */
interface ProjectSceneSerializeOptions {
  persistExternalTexture?: (fileName: string, data: ArrayBuffer) => Promise<string>;
}

/** 项目场景贴图侧车清单，真实图片文件位于项目 assets/source 目录。 */
interface ProjectExternalTextureManifest {
  version: number;
  files: ProjectExternalTextureFile[];
}

/** 单张外部化贴图的项目内文件记录。 */
interface ProjectExternalTextureFile {
  textureUniqueId: number;
  fileName: string;
  projectFile: string;
  byteLength: number;
  mimeType: string;
  sourceName?: string;
  sourceUrl?: string;
}

/** 加载项目场景时用于批量读回贴图侧车文件。 */
interface ProjectExternalTextureLoadRequest {
  projectFile: string;
  fileName: string;
  expectedByteLength?: number;
  mimeType?: string;
}

/** 项目贴图侧车批量读取结果。 */
interface ProjectExternalTextureLoadResult {
  projectFile: string;
  fileName: string;
  data?: ArrayBuffer;
  lastModified?: number;
  error?: string;
}

/** 保存阶段从运行时贴图提取出的待持久化二进制。 */
interface ProjectExternalTextureCandidate {
  texture: Texture;
  fileName: string;
  data: ArrayBuffer;
  byteLength: number;
  mimeType: string;
  sourceName?: string;
  sourceUrl?: string;
}

/** 单张序列化贴图上的项目侧车诊断元数据。 */
interface ProjectTextureNodeMetadata {
  textureUniqueId?: number;
  projectFile: string;
  fileName: string;
  byteLength: number;
  mimeType: string;
}

/** 加载项目场景时用于恢复 CAD 侧车线段文件和贴图侧车文件。 */
interface SerializedSceneLoadOptions {
  loadCadLineChunk?: (projectFile: string) => Promise<ArrayBuffer>;
  loadCadLineChunks?: (requests: CadLineChunkLoadRequest[]) => Promise<CadLineChunkLoadResult[]>;
  loadExternalTextures?: (requests: ProjectExternalTextureLoadRequest[]) => Promise<ProjectExternalTextureLoadResult[]>;
  onCadRestoreProgress?: (progress: CadDxfLineProgress) => void;
  preserveEditorCamera?: boolean;
  preserveAssetFileCache?: boolean;
  resetUndoHistory?: boolean;
}

/** CAD 侧车 chunk manifest，只保存小型索引信息，真实线段在 .cadlines.bin 中。 */
interface CadLineChunkManifest {
  chunkId: string;
  fileName: string;
  projectFile?: string;
  packFile?: string;
  packProjectFile?: string;
  byteOffset?: number;
  byteLength?: number;
  packByteLength?: number;
  style: CadDxfLineChunkStyle;
  segmentCount: number;
  bounds: CadDxfBounds;
}

interface CadLineChunkLoadRequest {
  projectFile: string;
  expectedByteLength?: number;
}

interface CadLineChunkLoadResult {
  projectFile: string;
  data?: ArrayBuffer;
  lastModified?: number;
  error?: string;
}

/** CAD 根节点 metadata 中保存的侧车 chunk 清单。 */
interface CadChunkManifestMetadata {
  version: number;
  sourceFile?: string;
  sourcePath?: string;
  bounds?: CadDxfBounds;
  rawBounds?: CadDxfBounds;
  unit?: unknown;
  segmentCount?: number;
  chunkSegmentLimit?: number;
  chunks: CadLineChunkManifest[];
}

interface CadDxfWorkerStartMessage {
  type: "start";
  fileName: string;
  text: string;
  sourcePath?: string;
  projectMode?: boolean;
}

interface CadDxfWorkerChunkMessage {
  type: "chunk";
  chunkId: string;
  style: CadDxfLineChunkStyle;
  segmentCount: number;
  positionsBuffer: ArrayBuffer;
  bounds: CadDxfBounds;
}

interface CadDxfWorkerProgressMessage {
  type: "progress";
  progress: CadDxfLineProgress;
}

interface CadDxfWorkerDoneMessage {
  type: "done";
  summary: CadLineImportSummary;
}

interface CadDxfWorkerErrorMessage {
  type: "error";
  message: string;
  detail?: string;
}

type CadDxfWorkerMessage =
  | CadDxfWorkerChunkMessage
  | CadDxfWorkerProgressMessage
  | CadDxfWorkerDoneMessage
  | CadDxfWorkerErrorMessage;

/** 已解析为浏览器可加载 URL 的 CAD 图片参照。 */
interface CadResolvedImageSource {
  url: string;
  fileName: string;
  source: "batch" | "local";
  revoke: () => void;
}

/** 保存后的 CAD 图片引用恢复上下文，只依赖原始 DXF 文件路径和 IMAGE metadata。 */
interface CadImageRestoreContext {
  sourcePath?: string;
}

/** CAD 图片加载上下文，集中记录临时 URL 以便失败时释放。 */
interface CadImageRenderContext {
  sourcePath?: string;
  relatedFiles: File[];
  objectUrls: string[];
}

/** CAD 线段分块写入器，按样式复用 typed array，避免为超大图纸创建 Vector3/Color4 对象数组。 */
interface CadLineChunkBuilder {
  layer: string;
  colorHex: string;
  alpha: number;
  color: Color3;
  positions: Float32Array;
  indices: Uint16Array;
  positionOffset: number;
  indexOffset: number;
  vertexIndex: number;
  segmentCount: number;
  chunkIndex: number;
}

interface CadRestoreChunkTask {
  root: TransformNode;
  chunk: CadLineChunkManifest;
}

interface CadRestoreMergedLineBuilder {
  root: TransformNode;
  style: CadDxfLineChunkStyle;
  chunkIds: string[];
  positions: Float32Array;
  offset: number;
  segmentCount: number;
  meshIndex: number;
}

/** 预览模式进入前的编辑相机状态，用于退出预览时恢复用户视角。 */
interface PreviewCameraSnapshot {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
  minZ: number;
  maxZ: number;
  lowerRadiusLimit: number | null;
  upperRadiusLimit: number | null;
}

type EditorCameraPointerAction = "orbit" | "pan" | "dolly" | "look";

interface EditorCameraPointerState {
  pointerId: number;
  action: EditorCameraPointerAction;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  navigationStarted: boolean;
}

interface EditorCameraPointerNavigationOptions {
  onNavigationStart?: (action: EditorCameraPointerAction) => void;
  onNavigationEnd?: (action: EditorCameraPointerAction, moved: boolean) => void;
  getLockedBeta?: () => number | null;
}

/** 根据 ArcRotateCamera 当前配置计算一次沿视线方向移动的距离。 */
function getEditorCameraDollyDistance(camera: ArcRotateCamera, wheelDelta: number): number {
  const cameraRadius = Number.isFinite(camera.radius) ? Math.abs(camera.radius) : DEFAULT_CAMERA_RADIUS_METERS;
  const radiusScale = Math.max(1, cameraRadius);
  const precision = Math.max(MIN_CAMERA_INPUT_SENSIBILITY, Math.abs(camera.wheelPrecision || DEFAULT_CAMERA_WHEEL_PRECISION));
  return (wheelDelta * radiusScale) / (precision * CAMERA_WHEEL_PIXEL_NORMALIZE);
}

/** 沿当前视线整体平移相机和目标点，保留可穿过模型的编辑观察体验。 */
function moveEditorCameraAlongView(camera: ArcRotateCamera, distance: number): void {
  const direction = camera.getForwardRay(1).direction.normalize();
  const worldDelta = direction.scale(distance);
  translateEditorCamera(camera, worldDelta);
}

/** 关闭 ArcRotateCamera 的惯性偏移，让自定义鼠标输入保持 Unity 式即时响应。 */
function clearEditorCameraInertia(camera: ArcRotateCamera): void {
  camera.inertialAlphaOffset = 0;
  camera.inertialBetaOffset = 0;
  camera.inertialRadiusOffset = 0;
  camera.inertialPanningX = 0;
  camera.inertialPanningY = 0;
}

/** 平移 ArcRotateCamera 的观察中心，同时恢复球坐标参数，避免 target 变化被反解成转向。 */
function translateEditorCamera(camera: ArcRotateCamera, worldDelta: Vector3): void {
  const alpha = camera.alpha;
  const beta = camera.beta;
  const radius = camera.radius;
  clearEditorCameraInertia(camera);
  camera.target.addInPlace(worldDelta);
  camera.position.addInPlace(worldDelta);
  camera.alpha = alpha;
  camera.beta = beta;
  camera.radius = radius;
}

/** 关闭 Babylon 9 ArcRotateCameraMovement 的默认输入映射，避免绕过自定义 Unity 鼠标输入。 */
function disableEditorCameraDefaultMovementInputs(camera: ArcRotateCamera): void {
  camera.movement.input.inputMap = [];
}

/** 编辑相机滚轮输入：沿当前视线整体移动相机，允许直接穿过模型。 */
class EditorCameraWheelDollyInput implements ICameraInput<ArcRotateCamera> {
  public camera!: ArcRotateCamera;
  public wheelPrecision = DEFAULT_CAMERA_WHEEL_PRECISION;
  public wheelDeltaPercentage = 0;
  public zoomToMouseLocation = false;
  private noPreventDefault = false;
  private attached = false;
  private readonly handleWheelEvent = (event: WheelEvent) => this.handleWheel(event);

  /** 绑定承载 Babylon 的 canvas，滚轮只在视口内生效。 */
  public constructor(private readonly canvas: HTMLCanvasElement) {}

  /** 返回 Babylon 输入类名，便于调试输入管理器状态。 */
  public getClassName(): string {
    return "EditorCameraWheelDollyInput";
  }

  /** 复用 mousewheel 简名，让 camera.wheelPrecision 继续作用到本输入。 */
  public getSimpleName(): string {
    return "mousewheel";
  }

  /** 监听原生 wheel 事件，使用非 passive 监听以保留 preventDefault 能力。 */
  public attachControl(noPreventDefault?: boolean): void {
    this.noPreventDefault = Boolean(noPreventDefault);
    if (this.attached) {
      return;
    }
    this.attached = true;
    this.canvas.addEventListener("wheel", this.handleWheelEvent, { passive: false });
  }

  /** 解绑 wheel 事件，避免视口销毁后残留监听。 */
  public detachControl(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    this.canvas.removeEventListener("wheel", this.handleWheelEvent);
  }

  /** 本输入即时处理滚轮，不需要逐帧惯性检查。 */
  public checkInputs(): void {
    return;
  }

  /** 将滚轮动作转换为视线方向位移，并保持原有浏览器默认行为策略。 */
  private handleWheel(event: WheelEvent): void {
    const wheelDelta = this.normalizeWheelDelta(event);
    if (!Number.isFinite(wheelDelta) || wheelDelta === 0) {
      return;
    }

    // 滚轮已被编辑相机消费，始终阻止浏览器/Electron 触发页面滚动或缩放。
    event.preventDefault();

    const speedMultiplier = event.shiftKey ? CAMERA_NAVIGATION_SHIFT_MULTIPLIER : 1;
    const distance = this.getDollyDistance(wheelDelta * speedMultiplier);
    if (distance === 0) {
      return;
    }

    this.moveCameraAlongView(distance);
  }

  /** 统一像素、行和页滚动单位，避免不同设备滚轮速度差异过大。 */
  private normalizeWheelDelta(event: WheelEvent): number {
    const modeScale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? CAMERA_WHEEL_PIXEL_NORMALIZE
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? Math.max(this.canvas.clientHeight, CAMERA_WHEEL_PIXEL_NORMALIZE)
          : 1;
    return -event.deltaY * modeScale;
  }

  /** 按当前轨道半径和缩放灵敏度计算视线方向移动距离。 */
  private getDollyDistance(wheelDelta: number): number {
    return getEditorCameraDollyDistance(this.camera, wheelDelta);
  }

  /** 平移相机目标点并克隆当前 alpha/beta/radius，从而让相机整体前进或后退。 */
  private moveCameraAlongView(distance: number): void {
    moveEditorCameraAlongView(this.camera, distance);
  }
}

/** Unity Scene View 风格鼠标输入：Alt+左键环绕、中键平移、Alt+右键缩放、右键观察。 */
class EditorCameraUnityPointerInput implements ICameraInput<ArcRotateCamera> {
  public camera!: ArcRotateCamera;
  public angularSensibilityX = DEFAULT_CAMERA_ROTATION_SENSIBILITY;
  public angularSensibilityY = DEFAULT_CAMERA_ROTATION_SENSIBILITY;
  public panningSensibility = DEFAULT_CAMERA_PANNING_SENSIBILITY;
  private noPreventDefault = false;
  private attached = false;
  private activePointer: EditorCameraPointerState | null = null;
  private readonly pointerEventOptions: AddEventListenerOptions = { capture: true };
  private readonly handlePointerDownEvent = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly handlePointerMoveEvent = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly handlePointerUpEvent = (event: PointerEvent) => this.handlePointerUp(event);
  private readonly handleLostFocusEvent = () => this.endActiveNavigation();

  /** 绑定 canvas 和导航回调，输入本身不依赖 React 状态。 */
  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: EditorCameraPointerNavigationOptions = {}
  ) {}

  /** 返回 Babylon 输入类名，便于调试输入管理器状态。 */
  public getClassName(): string {
    return "EditorCameraUnityPointerInput";
  }

  /** 复用 pointers 简名，让 ArcRotateCamera 的兼容灵敏度 setter 继续作用到本输入。 */
  public getSimpleName(): string {
    return "pointers";
  }

  /** 监听指针事件，并通过 pointer capture 保证拖出画布后仍能收到释放事件。 */
  public attachControl(noPreventDefault?: boolean): void {
    this.noPreventDefault = Boolean(noPreventDefault);
    if (this.attached) {
      return;
    }

    this.attached = true;
    this.canvas.addEventListener("pointerdown", this.handlePointerDownEvent, this.pointerEventOptions);
    this.canvas.addEventListener("pointermove", this.handlePointerMoveEvent, this.pointerEventOptions);
    this.canvas.addEventListener("pointerup", this.handlePointerUpEvent, this.pointerEventOptions);
    this.canvas.addEventListener("pointercancel", this.handlePointerUpEvent, this.pointerEventOptions);
    window.addEventListener("blur", this.handleLostFocusEvent);
  }

  /** 解绑所有事件并结束可能未释放的拖拽状态。 */
  public detachControl(): void {
    if (!this.attached) {
      return;
    }

    this.endActiveNavigation();
    this.attached = false;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDownEvent, this.pointerEventOptions);
    this.canvas.removeEventListener("pointermove", this.handlePointerMoveEvent, this.pointerEventOptions);
    this.canvas.removeEventListener("pointerup", this.handlePointerUpEvent, this.pointerEventOptions);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUpEvent, this.pointerEventOptions);
    window.removeEventListener("blur", this.handleLostFocusEvent);
  }

  /** 本输入直接修改相机状态，不需要逐帧累积。 */
  public checkInputs(): void {
    return;
  }

  /** 根据 Unity Scene View 鼠标语义开始一次导航操作。 */
  private handlePointerDown(event: PointerEvent): void {
    const action = this.resolveAction(event);
    if (!action) {
      return;
    }

    this.endActiveNavigation();
    this.activePointer = {
      pointerId: event.pointerId,
      action,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      navigationStarted: action !== "look"
    };
    this.trySetPointerCapture(event.pointerId);
    if (this.activePointer.navigationStarted) {
      this.options.onNavigationStart?.(action);
    }
    this.preventDefaultForNavigationStart(event, action);
  }

  /** 把指针位移转换为环绕、平移、缩放或右键观察。 */
  private handlePointerMove(event: PointerEvent): void {
    const pointer = this.activePointer;
    if (!pointer || event.pointerId !== pointer.pointerId) {
      return;
    }

    const totalDistance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (!pointer.moved && totalDistance > CAMERA_POINTER_DRAG_THRESHOLD) {
      pointer.moved = true;
      this.ensureNavigationStarted(pointer);
    }

    if (pointer.action === "look" && !pointer.moved) {
      return;
    }

    const deltaX = event.clientX - pointer.lastX;
    const deltaY = event.clientY - pointer.lastY;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    const speedMultiplier = this.getPointerSpeedMultiplier(event);
    if (pointer.action === "orbit") {
      this.orbitAroundTarget(deltaX, deltaY, speedMultiplier);
    } else if (pointer.action === "pan") {
      this.panCamera(deltaX, deltaY, speedMultiplier);
    } else if (pointer.action === "dolly") {
      this.dollyCamera(deltaY, speedMultiplier);
    } else {
      this.lookAroundFromCurrentPosition(deltaX, deltaY, speedMultiplier);
    }

    this.preventDefaultForActiveNavigation(event, pointer.action);
  }

  /** 指针释放后清理导航状态。 */
  private handlePointerUp(event: PointerEvent): void {
    const pointer = this.activePointer;
    if (!pointer || event.pointerId !== pointer.pointerId) {
      return;
    }

    this.releasePointerCapture(event.pointerId);
    this.endActiveNavigation();
    this.preventDefaultForActiveNavigation(event, pointer.action);
  }

  /** 按鼠标键和 Alt 修饰键解析 Unity Scene View 的导航动作。 */
  private resolveAction(event: PointerEvent): EditorCameraPointerAction | null {
    if (event.button === LEFT_MOUSE_BUTTON && event.altKey) {
      return "orbit";
    }

    if (event.button === MIDDLE_MOUSE_BUTTON) {
      return "pan";
    }

    if (event.button === RIGHT_MOUSE_BUTTON && event.altKey) {
      return "dolly";
    }

    if (event.button === RIGHT_MOUSE_BUTTON) {
      return "look";
    }

    return null;
  }

  /** Alt+左键围绕当前 target 环绕，裸左键保留给选择和 Gizmo。 */
  private orbitAroundTarget(deltaX: number, deltaY: number, speedMultiplier: number): void {
    this.rotateCameraAngles(deltaX, deltaY, speedMultiplier);
  }

  /** 中键拖拽沿屏幕平面平移视口，比例随当前观察半径缩放。 */
  private panCamera(deltaX: number, deltaY: number, speedMultiplier: number): void {
    const scale = this.getPanDistancePerPixel() * speedMultiplier;
    if (scale === 0) {
      return;
    }

    const right = this.getCameraRightDirection();
    const up = this.getCameraUpDirection(right);
    const worldDelta = right.scale(-deltaX * scale).add(up.scale(deltaY * scale));
    this.moveCameraTarget(worldDelta);
  }

  /** Alt+右键上下拖拽复用滚轮 dolly 算法，保持可穿模缩放语义一致。 */
  private dollyCamera(deltaY: number, speedMultiplier: number): void {
    const distance = getEditorCameraDollyDistance(this.camera, -deltaY * CAMERA_POINTER_DOLLY_PIXEL_SCALE * speedMultiplier);
    if (distance !== 0) {
      moveEditorCameraAlongView(this.camera, distance);
    }
  }

  /** 右键拖拽以相机当前位置为轴观察四周，保留右键单击菜单。 */
  private lookAroundFromCurrentPosition(deltaX: number, deltaY: number, speedMultiplier: number): void {
    const cameraPosition = this.camera.position.clone();
    this.rotateCameraAngles(deltaX, deltaY, speedMultiplier);
    const orbitOffset = this.getOrbitOffsetFromAngles();
    const nextTarget = cameraPosition.subtract(orbitOffset);
    this.camera.setTarget(nextTarget, false, true, false);
  }

  /** 按相机旋转灵敏度更新 alpha/beta，并夹紧 beta 避免翻转。 */
  private rotateCameraAngles(deltaX: number, deltaY: number, speedMultiplier: number): void {
    clearEditorCameraInertia(this.camera);
    const sensitivityX = Math.max(MIN_CAMERA_INPUT_SENSIBILITY, Math.abs(this.angularSensibilityX || DEFAULT_CAMERA_ROTATION_SENSIBILITY));
    const sensitivityY = Math.max(MIN_CAMERA_INPUT_SENSIBILITY, Math.abs(this.angularSensibilityY || DEFAULT_CAMERA_ROTATION_SENSIBILITY));
    const lockedBeta = this.options.getLockedBeta?.() ?? null;
    this.camera.alpha += (-deltaX * speedMultiplier) / sensitivityX;
    this.camera.beta =
      lockedBeta ?? Math.min(CAMERA_MAX_BETA, Math.max(CAMERA_MIN_BETA, this.camera.beta + (-deltaY * speedMultiplier) / sensitivityY));
  }

  /** Unity Scene View 中按住 Shift 会加快鼠标导航速度。 */
  private getPointerSpeedMultiplier(event: PointerEvent): number {
    return event.shiftKey ? CAMERA_NAVIGATION_SHIFT_MULTIPLIER : 1;
  }

  /** 计算当前半径下每像素平移的世界距离。 */
  private getPanDistancePerPixel(): number {
    const radius = Number.isFinite(this.camera.radius) ? Math.max(1, Math.abs(this.camera.radius)) : DEFAULT_CAMERA_RADIUS_METERS;
    const sensitivity = Math.max(MIN_CAMERA_INPUT_SENSIBILITY, Math.abs(this.panningSensibility || DEFAULT_CAMERA_PANNING_SENSIBILITY));
    const panSpeed = Math.max(MIN_CAMERA_PAN_SPEED_SCALE, this.camera.movement.panSpeed || MIN_CAMERA_PAN_SPEED_SCALE);
    return (radius * panSpeed) / (sensitivity * CAMERA_POINTER_PAN_PIXEL_SCALE);
  }

  /** 计算屏幕右方向；极端俯仰时回退到世界 X 轴。 */
  private getCameraRightDirection(): Vector3 {
    const forward = this.camera.getForwardRay(1).direction.normalize();
    const right = Vector3.Cross(forward, this.camera.upVector);
    return right.lengthSquared() > 0.000001 ? right.normalize() : new Vector3(1, 0, 0);
  }

  /** 根据右方向和视线方向计算屏幕上方向。 */
  private getCameraUpDirection(right: Vector3): Vector3 {
    const forward = this.camera.getForwardRay(1).direction.normalize();
    const up = Vector3.Cross(right, forward);
    return up.lengthSquared() > 0.000001 ? up.normalize() : new Vector3(0, 1, 0);
  }

  /** 平移 target 并克隆当前角度和半径，使相机位置同步平移。 */
  private moveCameraTarget(worldDelta: Vector3): void {
    if (worldDelta.lengthSquared() <= 0.000000001) {
      return;
    }

    translateEditorCamera(this.camera, worldDelta);
  }

  /** 使用 Babylon ArcRotateCamera 的默认球坐标公式得到当前位置相对 target 的偏移。 */
  private getOrbitOffsetFromAngles(): Vector3 {
    const radius = Number.isFinite(this.camera.radius) ? Math.max(0.0001, Math.abs(this.camera.radius)) : DEFAULT_CAMERA_RADIUS_METERS;
    const cosAlpha = Math.cos(this.camera.alpha);
    const sinAlpha = Math.sin(this.camera.alpha);
    const cosBeta = Math.cos(this.camera.beta);
    const sinBeta = Math.sin(this.camera.beta) || 0.0001;
    return new Vector3(radius * cosAlpha * sinBeta, radius * cosBeta, radius * sinAlpha * sinBeta);
  }

  /** 在浏览器允许时捕获指针，减少拖出 canvas 导致状态丢失的概率。 */
  private trySetPointerCapture(pointerId: number): void {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      return;
    }
  }

  /** 释放指针捕获；释放失败通常表示浏览器已经自动清理。 */
  private releasePointerCapture(pointerId: number): void {
    try {
      if (this.canvas.hasPointerCapture(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      return;
    }
  }

  /** 结束当前导航并通知引擎恢复拾取。 */
  private endActiveNavigation(): void {
    const pointer = this.activePointer;
    if (!pointer) {
      return;
    }

    this.releasePointerCapture(pointer.pointerId);
    this.activePointer = null;
    if (pointer.navigationStarted) {
      this.options.onNavigationEnd?.(pointer.action, pointer.moved);
    }
  }

  /** 右键观察超过拖拽阈值后才真正进入相机导航，避免普通右键轻微抖动误杀菜单。 */
  private ensureNavigationStarted(pointer: EditorCameraPointerState): void {
    if (pointer.navigationStarted) {
      return;
    }

    pointer.navigationStarted = true;
    this.options.onNavigationStart?.(pointer.action);
  }

  /** 按 Babylon attachControl 的 noPreventDefault 约定阻止浏览器默认拖拽行为。 */
  private preventDefault(event: PointerEvent): void {
    if (!this.noPreventDefault) {
      event.preventDefault();
    }
  }

  /** 中键和 Alt 导航没有编辑菜单语义，需要强制屏蔽浏览器自动滚动和系统菜单。 */
  private preventDefaultForNavigationStart(event: PointerEvent, action: EditorCameraPointerAction): void {
    if (action === "look") {
      return;
    }

    this.suppressNavigationEvent(event);
  }

  /** Alt 和中键导航优先级高于 Gizmo，需要阻止后续 Babylon 指针处理抢占。 */
  private preventDefaultForActiveNavigation(event: PointerEvent, action: EditorCameraPointerAction): void {
    if (action === "look") {
      this.preventDefault(event);
      return;
    }

    this.suppressNavigationEvent(event);
  }

  /** 拦截当前 DOM 事件，确保 Unity 导航不会同时触发 Babylon 默认 movement 或 Gizmo 拖拽。 */
  private suppressNavigationEvent(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
}

/** 预览模式启动的 AnimationGroup 快照，用于停止预览时回到初始姿态。 */
interface PreviewAnimationGroupSnapshot {
  group: AnimationGroup;
  from: number;
  to: number;
  speedRatio: number;
  loopAnimation: boolean;
}

/** 直接挂在节点上的动画运行记录，兼容没有 AnimationGroup 的旧场景。 */
interface PreviewDirectAnimationSnapshot {
  animatable: Animatable;
  from: number;
}

/** 模型包运行器实例句柄，用 uniqueId 绑定场景根节点，便于保存前批量停用。 */
interface ModelPackageRuntimeHandle {
  root: TransformNode;
  packageId: string;
  scriptFile: string;
  className: string;
  instance: ModelPackageRuntimeInstance;
  started: boolean;
}

/** 模型包运行脚本生命周期调用前后的用户可编辑状态快照。 */
interface ModelPackageEditableStateSnapshot {
  name: string;
  position: Vector3;
  rotation: Vector3;
  rotationQuaternion: Quaternion | null;
  /** 用户通过编辑器设置的根缩放，不包含运行脚本按参数计算出的尺寸缩放。 */
  scaling: Vector3;
  /** 运行脚本上一次应用在根节点上的参数化缩放，用于和用户缩放相乘恢复最终视口效果。 */
  parametricRootScaling: Vector3;
  modelPackageInstance: Record<string, unknown>;
  values: Record<string, DynamicParameterValue>;
}

/** 控制模型包运行器停止时如何处理根节点上的参数化缩放。 */
interface ModelPackageRuntimeStopOptions {
  /** 保存场景时保留参数化缩放元数据，避免重新加载后把参数缩放误认为用户缩放。 */
  preserveParametricRootScaling?: boolean;
}

/** 模型包 runtime 执行期临时写入的 metadata 标记，生命周期结束后必须恢复。 */
interface ModelPackageRuntimeTemporaryMetadataFlag {
  node: TransformNode;
  hadGeneratedFlag: boolean;
  generatedFlagValue: unknown;
}

/** 当前 opaque 辊道机 GLB 的节点基线，用于参数变化时恢复后再做部件级调整。 */
interface OpaqueRollerConveyorNodeBaseline {
  position: Vector3;
  scaling: Vector3;
  rotation: Vector3;
  rotationQuaternion: Quaternion | null;
  enabled?: boolean;
  center: Vector3;
  size: Vector3;
  /** 当前 GLB 的长梁 pivot 离几何中心很远，长度调整必须基于原始顶点而不是节点 scaling。 */
  positionVertices?: number[];
}

/** opaque 辊道机整体基线尺寸，坐标均为模型根节点本地坐标。 */
interface OpaqueRollerConveyorBaseline {
  nodes: Map<string, OpaqueRollerConveyorNodeBaseline>;
  minimum: Vector3;
  maximum: Vector3;
  size: Vector3;
  rollerBaseWidth: number;
  rollerMarginStart: number;
  rollerMarginEnd: number;
}

/** opaque 辊道机在根节点本地轴上的有效区间。 */
interface OpaqueRollerConveyorAxisRange {
  start: number;
  end: number;
}

/** opaque 辊道机长梁尾端参考点，用于让右端组件跟随真实长梁尾端而不是固定增量方向。 */
interface OpaqueRollerConveyorLengthTailReference {
  baselineTailX: number;
  currentTailX: number;
}

/** 链条机红框长度几何基线，顶点数组使用对应 Mesh 的局部坐标。 */
interface OpaqueChainConveyorLengthGeometryBaseline {
  center: Vector3;
  size: Vector3;
  /** 红框主体和长梁类节点只改顶点 Z 坐标，避免 TransformNode 非均匀缩放破坏截面形状。 */
  positionVertices?: number[];
}

/** 链条机命名节点下真实可变形 Mesh 的基线，兼容 Rail 节点是空包装 TransformNode 的 GLB。 */
interface OpaqueChainConveyorLengthMeshBaseline extends OpaqueChainConveyorLengthGeometryBaseline {
  path: string;
  positionVertices: number[];
}

/** 当前 opaque 链条机 GLB 的节点基线，用于从固定 -Z 起点重新应用长度。 */
interface OpaqueChainConveyorNodeBaseline extends OpaqueChainConveyorLengthGeometryBaseline {
  position: Vector3;
  scaling: Vector3;
  rotation: Vector3;
  rotationQuaternion: Quaternion | null;
  enabled?: boolean;
  lengthMeshBaselines?: OpaqueChainConveyorLengthMeshBaseline[];
}

/** opaque 链条机整体基线尺寸，坐标均为模型根节点本地坐标。 */
interface OpaqueChainConveyorBaseline {
  nodes: Map<string, OpaqueChainConveyorNodeBaseline>;
  minimum: Vector3;
  maximum: Vector3;
  size: Vector3;
}

/** 链条机 Box003 内部的连通几何块，用于区分可伸长长梁和必须保持形状的横梁/支撑脚。 */
interface OpaqueChainConveyorMeshComponent {
  vertexIndices: number[];
  minimum: Vector3;
  maximum: Vector3;
  center: Vector3;
  size: Vector3;
}

/** 模型包实例替换前保留的根级编辑状态，确保重载 GLB 后不丢用户场景布置。 */
interface ModelPackageInstanceReplacementSnapshot {
  root: TransformNode;
  parent: Node | null;
  editorMetadata: Record<string, unknown>;
  editableState: ModelPackageEditableStateSnapshot;
  visible: boolean;
  selected: boolean;
  primarySelected: boolean;
}

/** 已创建但尚未提交的模型包实例替换节点。 */
interface PreparedModelPackageReplacement {
  snapshot: ModelPackageInstanceReplacementSnapshot;
  replacementRoot: TransformNode;
}

/** 替换模型包时临时导入的新模板层级，包含 Babylon 自动挂到 scene 的动画组。 */
interface ModelPackageReplacementTemplate {
  root: TransformNode;
  unitMetadata: ModelUnitMetadata;
  animationGroups: AnimationGroup[];
}

/** 场景布局撤销快照，保存为序列化后的纯数据，避免持有 Babylon 节点引用。 */
interface SceneUndoSnapshot {
  label: string;
  serializedScene: Record<string, unknown>;
  byteLength: number;
  createdAt: number;
}

/** 当前会话中的资产文件缓存，用于撤销重载场景后保留可继续拖入的源文件。 */
interface AssetFileCacheSnapshot {
  assetFiles: Map<string, File>;
  assetDependencyFiles: Map<string, File[]>;
}

/** 临时写入源节点 metadata 的克隆映射标记，克隆完成后会立即恢复。 */
interface CloneSourceTokenSnapshot {
  node: Node;
  hadToken: boolean;
  previousToken: unknown;
}

/** 一次克隆操作的源节点标记结果，用于建立稳定的源-副本映射。 */
interface CloneSourceTokenMarkResult {
  sourceByToken: Map<string, Node>;
  snapshots: CloneSourceTokenSnapshot[];
}

/** 缓存场景规模统计，避免状态栏刷新时频繁全量遍历高模场景。 */
interface SceneContentStatsCache {
  meshCount: number;
  vertexCount: number;
}

/** 管理 Babylon.js 运行时、编辑器交互、资产导入与场景序列化。 */
export class BabylonEditorEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: EditorEngineCallbacks;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly editorCamera: ArcRotateCamera;
  private readonly gizmoManager: GizmoManager;
  private readonly selectionOutlineLayer: SelectionOutlineLayer;
  private readonly gridGlowLayer: GlowLayer;
  private readonly assets: AssetRecord[] = [];
  private readonly assetFiles = new Map<string, File>();
  private readonly assetDependencyFiles = new Map<string, File[]>();
  private readonly modelPackageScriptTexts = new Map<string, Map<string, string>>();
  private readonly modelPackageRuntimeHandles = new Map<number, ModelPackageRuntimeHandle>();
  private readonly cloneSourceNodeMaps = new WeakMap<TransformNode, WeakMap<Node, Node>>();
  private readonly sceneDataDrivenRuntime: SceneDataDrivenRuntime;
  private readonly sceneBusinessRuntime: SceneBusinessRuntime;
  private readonly sceneInstrumentation: SceneInstrumentation;
  private readonly localImportFileKeys = new Set<string>();
  private selectedNodeIds = new Set<number>();
  private selectedNode: TransformNode | null = null;
  private currentTool: EditorTool = "move";
  private renderQualityMode: RenderQualityMode = "lossless";
  private adaptiveHardwareScalingLevel: number | null = null;
  private adaptiveRenderQualityActive = false;
  private adaptiveQualityStamp = 0;
  private adaptiveQualityRecoverSamples = 0;
  private webglContextLost = false;
  private gpuVendor = "未知 GPU";
  private gpuRenderer = "未知渲染器";
  private previewMode = false;
  private overheadMode = false;
  private pendingStackerDemoSimulation = false;
  private stackerDemoSimulationActive = false;
  private previewCameraSnapshot: PreviewCameraSnapshot | null = null;
  private previewAnimationGroupSnapshots: PreviewAnimationGroupSnapshot[] = [];
  private previewDirectAnimationSnapshots: PreviewDirectAnimationSnapshot[] = [];
  private clipboardTemplateNode: TransformNode | null = null;
  private clipboardBaseName = "";
  private clipboardPasteCount = 0;
  private readonly clipboardPasteOffset = new Vector3(0.5, 0, 0.5);
  private cloneTokenSeed = 1;
  private readonly sceneUndoStack: SceneUndoSnapshot[] = [];
  private sceneUndoRestoring = false;
  private sceneContentStatsCache: SceneContentStatsCache | null = null;
  private scenePoiNodesCache: TransformNode[] | null = null;
  private editableRuntimeRootsCache: TransformNode[] | null = null;
  private dataDrivenTargetsCache: SceneDataDrivenTarget[] | null = null;
  private dataDrivenDropTargetsCache: SceneDataDrivenDropTarget[] | null = null;
  private statsStamp = 0;
  private dataDrivenSelectionSyncStamp = 0;
  private primitiveSeed = 1;
  private poiSeed = 1;
  private transformSyncFrame = 0;
  private transformGizmoDragging = false;
  private cameraNavigationActive = false;
  private lastCameraNavigationEndTime = 0;
  private gridCoverageSizeMeters = EDITOR_GRID_SIZE_METERS;
  private gridCellSizeMeters = EDITOR_GRID_CELL_SIZE_METERS;
  private gridCenter = Vector3.Zero();
  private readonly gridHelperMeshes: AbstractMesh[] = [];
  private readonly gridVisualMeshes: AbstractMesh[] = [];
  private readonly gridFlashPulseMeshes: AbstractMesh[] = [];
  private readonly gridFlashSweepMeshes: AbstractMesh[] = [];
  private readonly gridGlowMeshes: Mesh[] = [];
  private readonly gridGlowColors = new Map<number, Color3>();
  private gridGlowPulse = 0;
  private gridVisible = true;
  private gridBreathingEffectEnabled = true;
  private gridFlashStamp = 0;
  private gridStaticVisibilityApplied = false;
  private readonly observedTransformGizmos = new WeakSet<object>();
  private readonly handleResize = () => this.resize();
  private readonly handleWebglContextLost = (event: Event) => {
    event.preventDefault();
    this.webglContextLost = true;
    this.callbacks.onStatsChange(this.collectStats());
  };
  private readonly handleWebglContextRestored = () => {
    this.webglContextLost = false;
    this.captureGpuRendererInfo();
    this.resize();
    this.callbacks.onStatsChange(this.collectStats());
  };
  private cadRestoreGeneration = 0;

  /** 初始化渲染引擎、默认场景和所有编辑器输入绑定。 */
  public constructor(canvas: HTMLCanvasElement, callbacks: EditorEngineCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.engine = new Engine(canvas, true, {
      adaptToDeviceRatio: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      stencil: false
    });
    this.scene = new Scene(this.engine);
    this.sceneInstrumentation = new SceneInstrumentation(this.scene);
    this.captureGpuRendererInfo();
    this.bindWebglContextLifecycle();
    this.applyRenderQuality();

    this.editorCamera = this.createEditorCamera();
    this.applySceneEnvironmentColor(DEFAULT_SCENE_ENVIRONMENT_COLOR, false);
    this.gizmoManager = new GizmoManager(this.scene);
    this.selectionOutlineLayer = new SelectionOutlineLayer("EditorSelectionOutline", this.scene, {
      mainTextureRatio: SELECTION_OUTLINE_TEXTURE_RATIO,
      mainTextureSamples: 1,
      useDepthOcclusion: false
    });
    this.selectionOutlineLayer.outlineColor = Color3.FromHexString(SELECTION_OUTLINE_COLOR);
    this.selectionOutlineLayer.outlineThickness = SELECTION_OUTLINE_THICKNESS;
    this.gridGlowLayer = this.createGridGlowLayer();

    this.configureGizmos();
    this.sceneDataDrivenRuntime = new SceneDataDrivenRuntime({
      scene: this.scene,
      getConfig: () => this.createSceneInspectorSnapshot().dataDriven,
      getTargets: () => this.createSceneDataDrivenTargets(),
      getDropTargets: () => this.createSceneDataDrivenDropTargets(),
      createRuntimeCargoBox: (request) => this.createRuntimeCargoBox(request),
      disposeRuntimeNode: (node) => {
        node.dispose(false, true);
        this.markScenePerformanceCachesDirty();
      },
      onTargetsChanged: (roots, now) => this.handleSceneDataDrivenTargetsChanged(roots, now),
      onConnectionStatusChanged: (status) => this.callbacks.onDataConnectionStatusChange(status)
    });
    this.sceneBusinessRuntime = new SceneBusinessRuntime({
      scene: this.scene,
      camera: this.editorCamera,
      getConfig: () => this.createSceneInspectorSnapshot().dataDriven,
      getPoiNodes: () => this.getScenePoiNodes(),
      getPoiConfig: (node) => this.getNodePoiConfig(node),
      getEditableRoots: () => this.getEditableRuntimeRoots(),
      getAssets: () => this.getAssetsSnapshot(),
      onPoiChanged: (nodes, now) => this.handleSceneBusinessPoiChanged(nodes, now)
    });
    this.createDefaultScene();
    this.sceneBusinessRuntime.start();
    this.bindPointerSelection();
    this.bindStatsLoop();
    this.bindResize();
    this.engine.runRenderLoop(() => {
      const now = performance.now();
      this.updateSceneDataDrivenRuntime(now);
      this.updateSceneBusinessRuntime(now);
      this.updateAdaptiveRenderQuality(now);
      this.syncPointerMovePickingMode();
      if (this.shouldUpdateDynamicGridForFrame()) {
        this.updateDynamicGridForCamera();
      }
      this.updateGridFlash();
      this.syncEditorCameraPanSpeed();
      this.scene.render();
    });
    this.refreshSceneGraph();
    this.emitSelectionSnapshot();
  }

  /** 释放 Babylon 资源，避免切换页面后遗留 WebGL 上下文。 */
  public dispose(): void {
    this.cancelCadRestore();
    if (this.transformSyncFrame) {
      window.cancelAnimationFrame(this.transformSyncFrame);
      this.transformSyncFrame = 0;
    }
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("webglcontextlost", this.handleWebglContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleWebglContextRestored);
    this.sceneBusinessRuntime.dispose();
    this.sceneDataDrivenRuntime.stop(false);
    this.stopAllModelPackageRuntimes(false);
    this.disposeClipboardTemplate();
    this.clearRegisteredLocalImportFiles();
    this.selectionOutlineLayer.clearSelection();
    this.clearGridGlowMeshes();
    this.sceneInstrumentation.dispose();
    this.gridGlowLayer.dispose();
    this.selectionOutlineLayer.dispose();
    this.gizmoManager.dispose();
    this.editorCamera.detachControl();
    this.scene.dispose();
    this.engine.dispose();
  }

  /** 递增 CAD 恢复代号，让正在后台运行的旧恢复任务在下一次检查时退出。 */
  public cancelCadRestore(): void {
    this.cadRestoreGeneration += 1;
  }

  /** 同步画布 CSS 尺寸和 WebGL 后备缓冲，避免布局变化后视口变黑或取景错位。 */
  public resize(): void {
    this.applyRenderQuality();
    this.engine.resize();
    this.updateDynamicGridForCamera();
    this.scene.render();
  }

  /** 切换编辑工具，并同步 Gizmo 的启用状态。 */
  public setTool(tool: EditorTool): void {
    this.currentTool = tool;
    this.syncGizmoMode();
  }

  /** 当前是否有可撤销的场景布局变更。 */
  public canUndoSceneLayout(): boolean {
    return this.sceneUndoStack.length > 0 && !this.previewMode && !this.sceneUndoRestoring;
  }

  /** 撤销最近一次场景布局变更，恢复对象层级、变换、显隐、锁定和材质等可序列化状态。 */
  public async undoSceneLayout(): Promise<boolean> {
    if (!this.canUndoSceneLayout()) {
      return false;
    }

    const snapshot = this.sceneUndoStack.pop();
    if (!snapshot) {
      return false;
    }

    this.sceneUndoRestoring = true;
    try {
      await this.loadSerializedScene(snapshot.serializedScene, {
        preserveEditorCamera: true,
        preserveAssetFileCache: true,
        resetUndoHistory: false
      });
      this.scene.render();
      return true;
    } catch {
      this.sceneUndoStack.push(snapshot);
      return false;
    } finally {
      this.sceneUndoRestoring = false;
    }
  }

  /** 在执行布局变更前压入场景快照，失败或超大场景会跳过而不阻断编辑操作。 */
  private recordSceneUndoSnapshot(label: string, options: { coalesceMs?: number } = {}): boolean {
    if (this.previewMode || this.sceneUndoRestoring || !this.isSceneUndoSnapshotAllowed()) {
      return false;
    }

    const now = performance.now();
    const latestSnapshot = this.sceneUndoStack[this.sceneUndoStack.length - 1];
    if (options.coalesceMs && latestSnapshot?.label === label && now - latestSnapshot.createdAt <= options.coalesceMs) {
      return true;
    }

    const cameraSnapshot = this.captureEditorCameraSnapshot();
    let serialized: Record<string, unknown>;
    try {
      serialized = this.createUndoSerializedScene();
    } catch {
      this.restoreEditorCameraSnapshot(cameraSnapshot);
      return false;
    }

    this.restoreEditorCameraSnapshot(cameraSnapshot);
    const byteLength = this.estimateSerializedSceneByteLength(serialized);
    if (byteLength > SCENE_UNDO_MAX_SERIALIZED_BYTES) {
      return false;
    }

    this.sceneUndoStack.push({
      label,
      serializedScene: serialized,
      byteLength,
      createdAt: now
    });
    if (this.sceneUndoStack.length > SCENE_UNDO_HISTORY_LIMIT) {
      this.sceneUndoStack.splice(0, this.sceneUndoStack.length - SCENE_UNDO_HISTORY_LIMIT);
    }
    return true;
  }

  /** 撤销快照只面向轻量布局编辑，避免在超大 CAD 或高模场景里占用过多内存。 */
  private isSceneUndoSnapshotAllowed(): boolean {
    const meshes = this.scene.meshes.filter((mesh) => !mesh.metadata?.[HELPER_FLAG]);
    if (meshes.length > SCENE_UNDO_MAX_MESHES) {
      return false;
    }

    const vertices = meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0);
    return vertices <= SCENE_UNDO_MAX_VERTICES;
  }

  /** 生成撤销用序列化场景，保留资产 metadata，但不会写项目侧车文件。 */
  private createUndoSerializedScene(): Record<string, unknown> {
    const serialized = this.serializeScene() as Record<string, unknown>;
    return this.createLoadableSerializedScene(serialized);
  }

  /** 估算快照大小，优先使用 Blob.size，缺失时退回字符串长度。 */
  private estimateSerializedSceneByteLength(serializedScene: Record<string, unknown>): number {
    const text = JSON.stringify(serializedScene);
    try {
      return new Blob([text]).size;
    } catch {
      return text.length;
    }
  }

  /** 清空撤销栈，通常用于加载新场景后避免撤销回旧项目。 */
  private clearSceneUndoHistory(): void {
    this.sceneUndoStack.splice(0, this.sceneUndoStack.length);
  }

  /** 切换渲染画质模式，并同步 WebGL 后备缓冲与辅助效果策略。 */
  public setRenderQualityMode(mode: RenderQualityMode): void {
    if (this.renderQualityMode === mode) {
      return;
    }

    this.renderQualityMode = mode;
    this.resetAdaptiveRenderQuality();
    this.applyRenderQuality();
    this.syncPointerMovePickingMode();
    this.callbacks.onStatsChange(this.collectStats());
  }

  /** 显式显示或隐藏工作网格；透明拖放平面保持可用，避免隐藏网格后资源无法落点。 */
  public setGridVisible(enabled: boolean): void {
    if (this.gridVisible === enabled) {
      return;
    }

    this.gridVisible = enabled;
    this.applyGridVisibilityState();
    if (enabled) {
      this.updateDynamicGridForCamera();
    }
    this.scene.render();
  }

  /** 显式开关工作网格呼吸效果，呼吸不再跟随画质或降载模式自动变化。 */
  public setGridBreathingEffectEnabled(enabled: boolean): void {
    if (this.gridBreathingEffectEnabled === enabled) {
      return;
    }

    this.gridBreathingEffectEnabled = enabled;
    this.gridFlashStamp = 0;
    this.applyGridVisibilityState();
    this.scene.render();
  }

  /** 开关正顶俯瞰模式；开启后只锁定俯仰角，主动旋转、平移和缩放仍可用。 */
  public setOverheadMode(enabled: boolean): void {
    if (this.overheadMode === enabled) {
      return;
    }

    this.overheadMode = enabled;
    this.clearEditorCameraInertia();
    if (enabled) {
      this.applyCameraPitchLock();
    } else {
      this.attachEditorCameraControl();
    }
    this.scene.render();
  }

  /** 按当前模式应用 WebGL 后备缓冲缩放；默认走接近 4K 的高清策略。 */
  private applyRenderQuality(): void {
    if (this.webglContextLost) {
      return;
    }

    const nextLevel = this.getTargetHardwareScalingLevel();
    const currentLevel = this.engine.getHardwareScalingLevel();
    if (!Number.isFinite(currentLevel) || Math.abs(currentLevel - nextLevel) > HARDWARE_SCALING_LEVEL_EPSILON) {
      this.engine.setHardwareScalingLevel(nextLevel);
    }
  }

  /** 读取当前目标后备缓冲缩放，自动质量模式只会在高清基线之上降采样。 */
  private getTargetHardwareScalingLevel(): number {
    if (this.renderQualityMode === "performance") {
      return this.calculatePerformanceHardwareScalingLevel();
    }

    if (this.renderQualityMode === "balanced") {
      return this.calculateBalancedHardwareScalingLevel();
    }

    const highQualityLevel = this.calculateHighQualityHardwareScalingLevel();
    if (this.renderQualityMode !== "auto" || this.adaptiveHardwareScalingLevel === null) {
      return highQualityLevel;
    }

    return Math.max(highQualityLevel, this.adaptiveHardwareScalingLevel);
  }

  /** 计算高清模式的硬件缩放值：低于 4K 的视口自动超采样，避免默认画面发糊。 */
  private calculateHighQualityHardwareScalingLevel(): number {
    const cssWidth = Math.max(1, this.canvas.clientWidth || this.canvas.width || this.engine.getRenderWidth(true) || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || this.canvas.height || this.engine.getRenderHeight(true) || 1);
    const cssPixels = cssWidth * cssHeight;
    const targetRenderScale = Math.sqrt(TARGET_HIGH_QUALITY_RENDER_PIXELS / cssPixels);
    const renderScale = Math.min(MAX_HIGH_QUALITY_RENDER_SCALE, Math.max(1, targetRenderScale));
    return 1 / renderScale;
  }

  /** 计算均衡模式缩放值，把大窗口限制到约 1440p 目标像素，小窗口保持原生清晰度。 */
  private calculateBalancedHardwareScalingLevel(): number {
    const cssWidth = Math.max(1, this.canvas.clientWidth || this.canvas.width || this.engine.getRenderWidth(true) || 1);
    const cssHeight = Math.max(1, this.canvas.clientHeight || this.canvas.height || this.engine.getRenderHeight(true) || 1);
    const cssPixels = cssWidth * cssHeight;
    const targetRenderScale = Math.sqrt(TARGET_BALANCED_RENDER_PIXELS / cssPixels);
    return targetRenderScale < 1 ? 1 / targetRenderScale : 1;
  }

  /** 计算流畅模式的硬件缩放值，保留用户主动降画质换帧率的能力。 */
  private calculatePerformanceHardwareScalingLevel(): number {
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    return Math.max(PERFORMANCE_MODE_MIN_HARDWARE_SCALING_LEVEL, devicePixelRatio);
  }

  /** 根据实时 FPS 自动降低或恢复渲染后备缓冲；只有自动模式允许降低无损高清基线。 */
  private updateAdaptiveRenderQuality(now: number): void {
    if (!this.isAutoRenderQualityMode() || this.webglContextLost || now - this.adaptiveQualityStamp < ADAPTIVE_RENDER_QUALITY_SAMPLE_MS) {
      return;
    }

    this.adaptiveQualityStamp = now;
    const fps = this.engine.getFps();
    if (!Number.isFinite(fps) || fps <= 0) {
      return;
    }

    const highQualityLevel = this.calculateHighQualityHardwareScalingLevel();
    if (this.adaptiveHardwareScalingLevel !== null && this.adaptiveHardwareScalingLevel < highQualityLevel) {
      this.adaptiveHardwareScalingLevel = highQualityLevel;
    }

    if (fps < ADAPTIVE_RENDER_QUALITY_DROP_FPS) {
      const currentLevel = this.adaptiveHardwareScalingLevel ?? this.engine.getHardwareScalingLevel() ?? highQualityLevel;
      const step = fps < ADAPTIVE_RENDER_QUALITY_FAST_DROP_FPS ? ADAPTIVE_RENDER_QUALITY_FAST_STEP : ADAPTIVE_RENDER_QUALITY_STEP;
      const nextLevel = Math.min(
        Math.max(highQualityLevel, ADAPTIVE_RENDER_QUALITY_MAX_HARDWARE_SCALING_LEVEL),
        Math.max(highQualityLevel, currentLevel + step)
      );
      this.adaptiveQualityRecoverSamples = 0;
      if (Math.abs(nextLevel - currentLevel) > HARDWARE_SCALING_LEVEL_EPSILON) {
        this.adaptiveHardwareScalingLevel = Number(nextLevel.toFixed(2));
        this.adaptiveRenderQualityActive = true;
        this.applyRenderQuality();
        this.syncPointerMovePickingMode();
      }
      return;
    }

    if (this.adaptiveHardwareScalingLevel === null || fps < ADAPTIVE_RENDER_QUALITY_RECOVER_FPS) {
      this.adaptiveQualityRecoverSamples = 0;
      return;
    }

    this.adaptiveQualityRecoverSamples += 1;
    if (this.adaptiveQualityRecoverSamples < ADAPTIVE_RENDER_QUALITY_RECOVER_SAMPLES) {
      return;
    }

    this.adaptiveQualityRecoverSamples = 0;
    const nextLevel = Math.max(highQualityLevel, this.adaptiveHardwareScalingLevel - ADAPTIVE_RENDER_QUALITY_STEP);
    if (Math.abs(nextLevel - highQualityLevel) <= HARDWARE_SCALING_LEVEL_EPSILON) {
      this.adaptiveHardwareScalingLevel = null;
      this.adaptiveRenderQualityActive = false;
    } else {
      this.adaptiveHardwareScalingLevel = Number(nextLevel.toFixed(2));
      this.adaptiveRenderQualityActive = true;
    }
    this.applyRenderQuality();
    this.syncPointerMovePickingMode();
  }

  /** 重置自动质量状态，用户显式切换画质时重新从高清基线评估。 */
  private resetAdaptiveRenderQuality(): void {
    this.adaptiveHardwareScalingLevel = null;
    this.adaptiveRenderQualityActive = false;
    this.adaptiveQualityStamp = 0;
    this.adaptiveQualityRecoverSamples = 0;
    this.syncPointerMovePickingMode();
  }

  /** 高负载时暂停指针移动拾取，点击、右键和拖放仍走显式拾取以保留核心编辑能力。 */
  private syncPointerMovePickingMode(): void {
    this.scene.skipPointerMovePicking = this.shouldReduceEditorVisualEffects();
  }

  /** 判断当前是否允许运行时自动降低分辨率。 */
  private isAutoRenderQualityMode(): boolean {
    return this.renderQualityMode === "auto";
  }

  /** 读取当前场景环境背景色，供 React 项目条色块和项目加载后同步显示。 */
  public getSceneEnvironmentColor(): string {
    return this.color4ToHex(this.scene.clearColor, DEFAULT_SCENE_ENVIRONMENT_COLOR);
  }

  /** 更新场景环境背景色，并同步影响环境基色与保存元数据。 */
  public setSceneEnvironmentColor(colorHex: string): string {
    const normalizedColor = this.normalizeHexColor(colorHex) ?? DEFAULT_SCENE_ENVIRONMENT_COLOR;
    this.applySceneEnvironmentColor(normalizedColor);
    return normalizedColor;
  }

  /** 读取右侧属性面板使用的场景级快照。 */
  public getSceneInspectorSnapshot(): SceneInspectorSnapshot {
    return this.createSceneInspectorSnapshot();
  }

  /** 更新场景级属性，并把配置写入场景 metadata 以便保存和重开恢复。 */
  public updateSceneInspector(update: SceneInspectorUpdate): SceneInspectorSnapshot {
    const current = this.createSceneInspectorSnapshot();
    const environment = {
      ...current.environment,
      ...update.environment
    };
    const camera = {
      ...current.camera,
      ...update.camera
    };
    const editorSettings = {
      ...current.editorSettings,
      ...update.editorSettings
    };
    const dataDriven = {
      ...current.dataDriven,
      ...update.dataDriven
    };

    this.applySceneEnvironmentColor(environment.backgroundColor, false);
    this.applySceneCameraSettings(camera);
    this.applySceneEditorSettings(editorSettings);
    this.scene.metadata = this.withMetricSceneMetadata(this.scene.metadata, {
      sceneEnvironment: environment,
      sceneCamera: camera,
      sceneEditorSettings: editorSettings,
      sceneDataDriven: dataDriven
    });
    if (update.dataDriven && this.previewMode) {
      if (this.stackerDemoSimulationActive) {
        this.sceneDataDrivenRuntime.startStackerDemoSimulation(this.createStackerDemoDataDrivenSnapshot());
      } else {
        this.pendingStackerDemoSimulation = false;
        this.sceneDataDrivenRuntime.restart();
      }
    }
    if (update.dataDriven) {
      this.sceneBusinessRuntime.restart();
    }
    this.scene.render();
    this.emitSelectionSnapshot();
    return this.createSceneInspectorSnapshot();
  }

  /** 清空当前可编辑内容并重建默认工作对象，保留编辑器 helper 和项目保存保护逻辑。 */
  public initializeEditableScene(): SceneInspectorSnapshot {
    if (this.previewMode) {
      this.exitPreviewMode();
    }

    this.recordSceneUndoSnapshot("初始化场景");
    this.clearEditableScene(false);
    this.createPrimitive("cube", new Vector3(-1.8, 0.5, 0));
    this.createPrimitive("sphere", new Vector3(1.8, 0.75, 0));
    const ground = this.createPrimitive("ground", new Vector3(0, 0, 0));
    ground.name = "工作地面";
    this.resetEditorCameraOverview();
    this.selectNode(null);
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
    return this.createSceneInspectorSnapshot();
  }

  /** 开关场景预览模式：自动取景完整场景，并播放当前场景中的动画。 */
  public setPreviewMode(enabled: boolean): void {
    if (this.previewMode === enabled) {
      return;
    }

    if (enabled) {
      this.enterPreviewMode();
      return;
    }

    this.exitPreviewMode();
  }

  /** 为指定模型启动 Stacker 本地模拟预览；模拟源只存在于预览运行态，不新增场景文件字段。 */
  public startStackerDemoPreviewForNode(id: number): TransformSnapshot | null {
    const node = this.findTransformNodeByUniqueId(id);
    if (!node || node.metadata?.[HELPER_FLAG]) {
      return null;
    }

    const targetRoot = this.findSceneDataDrivenRootForNode(node);
    if (!targetRoot || this.isNodeLocked(targetRoot) || this.isEditorGroup(targetRoot) || this.isCadDrawingNode(targetRoot)) {
      return null;
    }

    const stackerTarget = {
      root: targetRoot,
      matchFields: this.createSceneDataDrivenMatchFields(targetRoot),
      dataDriven: this.getModelDataDrivenDefinition(targetRoot)
    };
    if (!this.sceneDataDrivenRuntime.canDriveStackerTarget(stackerTarget)) {
      return null;
    }

    const demoDeviceId = this.getNodeAssetInfo(targetRoot).assetCode.trim() || STACKER_DEMO_DEVICE_ID;
    this.updateNodeAssetInfo(targetRoot, { assetCode: demoDeviceId });
    const demoConfig = this.createStackerDemoDataDrivenSnapshot(targetRoot);
    this.scene.metadata = this.withMetricSceneMetadata(this.scene.metadata, {
      sceneDataDriven: demoConfig
    });
    if (this.previewMode) {
      this.sceneDataDrivenRuntime.startStackerDemoSimulation(demoConfig);
      this.stackerDemoSimulationActive = true;
    } else {
      this.pendingStackerDemoSimulation = true;
    }

    this.refreshNodeWorldMatrices(targetRoot);
    const snapshot = this.createTransformSnapshot(targetRoot);
    this.scene.render();
    this.emitSelectionSnapshot();
    return snapshot;
  }

  /** 进入预览模式时保存编辑视角、隐藏编辑辅助交互，并播放动画。 */
  private enterPreviewMode(): void {
    this.previewMode = true;
    this.previewCameraSnapshot = this.capturePreviewCameraSnapshot();
    this.applyHighlight(null);
    this.syncGizmoMode();
    this.frameEditableSceneInView(this.selectedNode);
    this.clearEditorCameraInertia();
    this.attachEditorCameraControl();
    this.startPreviewAnimations();
    if (this.pendingStackerDemoSimulation) {
      this.sceneDataDrivenRuntime.startStackerDemoSimulation(this.createStackerDemoDataDrivenSnapshot());
      this.pendingStackerDemoSimulation = false;
      this.stackerDemoSimulationActive = true;
    } else {
      this.stackerDemoSimulationActive = false;
      this.sceneDataDrivenRuntime.start();
    }
    this.scene.render();
  }

  /** 退出预览模式时停止动画，并恢复进入预览前的编辑视角与选择辅助。 */
  private exitPreviewMode(): void {
    this.pendingStackerDemoSimulation = false;
    this.stackerDemoSimulationActive = false;
    this.sceneDataDrivenRuntime.stop(true);
    this.sceneBusinessRuntime.stop(true);
    this.sceneBusinessRuntime.start();
    this.stopPreviewAnimations();
    this.restorePreviewCameraSnapshot();
    this.previewMode = false;
    this.applyHighlight();
    this.syncGizmoMode();
    this.scene.render();
  }

  /** 推进场景数据驱动插值，并在必要时同步选中面板快照。 */
  private updateSceneDataDrivenRuntime(now: number): void {
    const changedRoots = this.sceneDataDrivenRuntime.update(now);
    if (changedRoots.length === 0) {
      return;
    }

    this.handleSceneDataDrivenTargetsChanged(changedRoots, now);
  }

  /** 推进 POI 业务运行态，并在必要时同步属性面板快照。 */
  private updateSceneBusinessRuntime(now: number): void {
    const changedNodes = this.sceneBusinessRuntime.update(now);
    if (changedNodes.length === 0) {
      return;
    }

    this.handleSceneBusinessPoiChanged(changedNodes, now);
  }

  /** 处理数据驱动导致的模型姿态变化，集中刷新世界矩阵和属性面板快照。 */
  private handleSceneDataDrivenTargetsChanged(roots: TransformNode[], now: number): void {
    const uniqueRoots = [...new Map(roots.map((root) => [root.uniqueId, root])).values()];
    uniqueRoots.forEach((root) => this.refreshNodeWorldMatrices(root));
    if (!this.selectedNode || now - this.dataDrivenSelectionSyncStamp < 160) {
      return;
    }

    if (uniqueRoots.some((root) => this.isSelectedNodeUnderRoot(root))) {
      this.dataDrivenSelectionSyncStamp = now;
      this.emitSelectionSnapshot();
    }
  }

  /** 处理 POI 运行态导致的可视变化，避免高频刷新 React 面板。 */
  private handleSceneBusinessPoiChanged(nodes: TransformNode[], now: number): void {
    const uniqueNodes = [...new Map(nodes.map((node) => [node.uniqueId, node])).values()];
    uniqueNodes.forEach((node) => this.refreshNodeWorldMatrices(node));
    if (!this.selectedNode || now - this.dataDrivenSelectionSyncStamp < 160) {
      return;
    }

    if (uniqueNodes.some((node) => node.uniqueId === this.selectedNode?.uniqueId)) {
      this.dataDrivenSelectionSyncStamp = now;
      this.emitSelectionSnapshot();
    }
  }

  /** 生成 Stacker demo 使用的场景级连接配置；用于面板展示，真实模拟源仍是预览态临时连接。 */
  private createStackerDemoDataDrivenSnapshot(root?: TransformNode): SceneDataDrivenSnapshot {
    const current = this.createSceneInspectorSnapshot().dataDriven;
    const dataDriven = root ? this.getModelDataDrivenDefinition(root) : undefined;
    const device = dataDriven?.device;
    return {
      ...current,
      dataConnectionEnabled: true,
      dataSourceType: "websocket",
      dataEndpoint: STACKER_DEMO_ENDPOINT,
      dataChannel: STACKER_DEMO_TOPIC,
      deviceIdField: device?.deviceIdField?.trim() || current.deviceIdField || "deviceId",
      assetCodeField: device?.assetCodeField?.trim() || current.assetCodeField || "assetCode",
      payloadPath: "",
      interpolationMs: device?.interpolationMs ?? current.interpolationMs ?? 200,
      credentialProfileId: ""
    };
  }

  /** 找到节点所属的数据驱动根节点，确保模型子节点触发 demo 时也写到可匹配的根节点。 */
  private findSceneDataDrivenRootForNode(node: TransformNode): TransformNode | null {
    return (
      this.createSceneDataDrivenTargets().find((target) => node === target.root || node.isDescendantOf?.(target.root))?.root ??
      node
    );
  }

  /** 收集当前场景中可由外部数据匹配的模型根节点。 */
  private createSceneDataDrivenTargets(): SceneDataDrivenTarget[] {
    if (this.dataDrivenTargetsCache) {
      return this.dataDrivenTargetsCache;
    }

    const targets = new Map<number, SceneDataDrivenTarget>();
    const visit = (node: Node): void => {
      if (node.metadata?.[HELPER_FLAG]) {
        return;
      }

      if (node instanceof TransformNode && this.isLocatorWireCubeNode(node) && this.isSceneGraphDisplayNode(node)) {
        const locatorTarget = this.createLocatorSceneDataDrivenTarget(node);
        if (locatorTarget) {
          targets.set(node.uniqueId, locatorTarget);
        }
        return;
      }

      if (
        node instanceof TransformNode &&
        !this.isEditorGroup(node) &&
        !this.isPoiNode(node) &&
        !this.isLocatorWireCubeNode(node) &&
        this.isSceneGraphDisplayNode(node)
      ) {
        targets.set(node.uniqueId, {
          root: node,
          matchFields: this.createSceneDataDrivenMatchFields(node),
          dataDriven: this.getModelDataDrivenDefinition(node)
        });
        return;
      }

      this.getVisibleChildren(node).forEach(visit);
    };

    this.scene.rootNodes.forEach(visit);
    this.dataDrivenTargetsCache = [...targets.values()];
    return this.dataDrivenTargetsCache;
  }

  /** 收集可作为 Stacker 放货目标的定位框；只要求填写资产编号，不要求启用动画连接。 */
  private createSceneDataDrivenDropTargets(): SceneDataDrivenDropTarget[] {
    if (this.dataDrivenDropTargetsCache) {
      return this.dataDrivenDropTargetsCache;
    }

    const targets = new Map<number, SceneDataDrivenDropTarget>();
    const visit = (node: Node): void => {
      if (node.metadata?.[HELPER_FLAG]) {
        return;
      }

      if (node instanceof TransformNode && this.isLocatorWireCubeNode(node) && this.isSceneGraphDisplayNode(node)) {
        const dropTarget = this.createLocatorSceneDataDrivenDropTarget(node);
        if (dropTarget) {
          targets.set(node.uniqueId, dropTarget);
        }
        return;
      }

      this.getVisibleChildren(node).forEach(visit);
    };

    this.scene.rootNodes.forEach(visit);
    this.dataDrivenDropTargetsCache = [...targets.values()];
    return this.dataDrivenDropTargetsCache;
  }

  /** 将定位框资产编号转换成放货目标匹配字段。 */
  private createLocatorSceneDataDrivenDropTarget(root: TransformNode): SceneDataDrivenDropTarget | null {
    const connection = this.getLocatorAnimationConnection(root);
    const assetCode = this.getLocatorDropTargetAssetCode(root, connection);
    if (!assetCode) {
      return null;
    }

    const assetCodeField = connection.assetCodeField.trim() || DEFAULT_LOCATOR_ANIMATION_CONNECTION.assetCodeField;
    return {
      root,
      matchFields: {
        [assetCodeField]: assetCode,
        assetCode,
        locatorAssetCode: assetCode,
        name: root.name,
        uniqueId: String(root.uniqueId)
      }
    };
  }

  /** 读取定位框放货目标编号；优先使用通用资产编号，旧场景兜底兼容动画连接里的绑定设备。 */
  private getLocatorDropTargetAssetCode(root: TransformNode, connection: LocatorAnimationConnectionSnapshot): string {
    const assetCode = this.getNodeAssetInfo(root).assetCode.trim();
    if (assetCode) {
      return assetCode;
    }

    return connection.assetCode.trim();
  }

  /** 定位框只有显式启用并配置设备号时才作为数据驱动接收端，避免视觉参考框被误驱动。 */
  private createLocatorSceneDataDrivenTarget(root: TransformNode): SceneDataDrivenTarget | null {
    const connection = this.getLocatorAnimationConnection(root);
    const assetCode = connection.assetCode.trim();
    if (!connection.enabled || !assetCode) {
      return null;
    }

    const assetCodeField = connection.assetCodeField.trim() || DEFAULT_LOCATOR_ANIMATION_CONNECTION.assetCodeField;
    const deviceIdField = connection.deviceIdField.trim() || DEFAULT_LOCATOR_ANIMATION_CONNECTION.deviceIdField;
    const matchFields = {
      [assetCodeField]: assetCode,
      assetCode,
      locatorAssetCode: assetCode
    };

    return {
      root,
      matchFields,
      requiresDeviceMatch: true,
      dataDriven: {
        device: {
          defaultAssetCode: assetCode,
          deviceIdField,
          assetCodeField,
          interpolationMs: connection.interpolationMs
        }
      },
      rootMotionFields: this.createLocatorRootMotionFields(connection)
    };
  }

  /** 将定位框配置转换为运行态根节点位姿字段，空字段表示该轴不接收数据。 */
  private createLocatorRootMotionFields(connection: LocatorAnimationConnectionSnapshot): SceneDataDrivenRootMotionFields {
    return {
      positionX: this.createLocatorMotionFieldCandidates(connection.positionXField),
      positionY: this.createLocatorMotionFieldCandidates(connection.positionYField),
      positionZ: this.createLocatorMotionFieldCandidates(connection.positionZField),
      rotationY: this.createLocatorMotionFieldCandidates(connection.rotationYField),
      interpolationMs: connection.interpolationMs
    };
  }

  /** 规范化定位框单个运动字段，避免空字符串在运行态误匹配。 */
  private createLocatorMotionFieldCandidates(field: string): string[] {
    const normalized = field.trim();
    return normalized ? [normalized] : [];
  }

  /** 收集当前场景中的 POI 根节点，运行态只消费这些轻量业务组件。 */
  private getScenePoiNodes(): TransformNode[] {
    if (this.scenePoiNodesCache) {
      return this.scenePoiNodesCache;
    }

    const nodes = new Map<number, TransformNode>();
    [...this.scene.rootNodes, ...this.scene.transformNodes, ...this.scene.meshes].forEach((node) => {
      if (node instanceof TransformNode && !node.metadata?.[HELPER_FLAG] && this.isPoiNode(node)) {
        nodes.set(node.uniqueId, node);
      }
    });
    this.scenePoiNodesCache = [...nodes.values()];
    return this.scenePoiNodesCache;
  }

  /** 收集运行态可绑定的业务根节点，排除 POI 自身和临时生成节点。 */
  private getEditableRuntimeRoots(): TransformNode[] {
    if (this.editableRuntimeRootsCache) {
      return this.editableRuntimeRootsCache;
    }

    const nodes = new Map<number, TransformNode>();
    [...this.scene.rootNodes, ...this.scene.transformNodes, ...this.scene.meshes].forEach((node) => {
      if (
        node instanceof TransformNode &&
        !node.metadata?.[HELPER_FLAG] &&
        !node.metadata?.isPoiRuntimeGenerated &&
        !this.isPoiNode(node) &&
        !this.isLocatorWireCubeNode(node) &&
        this.isSceneGraphDisplayNode(node)
      ) {
        nodes.set(node.uniqueId, node);
      }
    });
    this.editableRuntimeRootsCache = [...nodes.values()];
    return this.editableRuntimeRootsCache;
  }

  /** 从节点 metadata 和模型包动态参数中生成数据驱动匹配字段。 */
  private createSceneDataDrivenMatchFields(root: TransformNode): Record<string, string> {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const assetInfo = this.asMetadataObject(editorMetadata.assetInfo);
    const modelPackageInstance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    const modelPackageValues = this.asMetadataObject(modelPackageInstance.values);
    const sourceFile = this.getNodeSourceFileName(root) ?? "";
    const fields: Record<string, string> = {
      name: root.name,
      uniqueId: String(root.uniqueId),
      sourceFile,
      sourceFileStem: this.getFileStem(sourceFile),
      packageId: this.metadataValueToMatchString(modelPackageInstance.packageId) ?? "",
      assetId: this.metadataValueToMatchString(modelPackageInstance.assetId) ?? ""
    };

    this.copyMetadataMatchFields(fields, assetInfo);
    this.copyMetadataMatchFields(fields, modelPackageValues);
    return fields;
  }

  /** 把 metadata 中的基础标量复制为可匹配字符串。 */
  private copyMetadataMatchFields(target: Record<string, string>, source: Record<string, unknown>): void {
    Object.entries(source).forEach(([key, value]) => {
      const matchValue = this.metadataValueToMatchString(value);
      if (matchValue !== undefined) {
        target[key] = matchValue;
      }
    });
  }

  /** 将 metadata 标量值转换为匹配字符串，复杂对象不参与设备匹配。 */
  private metadataValueToMatchString(value: unknown): string | undefined {
    if (typeof value === "string") {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "boolean") {
      return String(value);
    }

    return undefined;
  }

  /** 取路径叶子文件名，供资源库反向定位和设备匹配字段复用。 */
  private getFileName(fileName: string): string {
    return fileName.split(/[\\/]/).pop() ?? fileName;
  }

  /** 从源文件名中提取无扩展名标识，便于 payload 用 Stacker 这类名称匹配。 */
  private getFileStem(fileName: string): string {
    const leafName = this.getFileName(fileName);
    const dotIndex = leafName.lastIndexOf(".");
    return dotIndex > 0 ? leafName.slice(0, dotIndex) : leafName;
  }

  /** 判断当前选中节点是否属于某个被数据驱动更新的根节点。 */
  private isSelectedNodeUnderRoot(root: TransformNode): boolean {
    return Boolean(this.selectedNode && (this.selectedNode === root || this.selectedNode.isDescendantOf?.(root)));
  }

  /** 记录 ArcRotateCamera 的关键取景参数，避免预览取景破坏用户编辑视角。 */
  private capturePreviewCameraSnapshot(): PreviewCameraSnapshot {
    return this.captureEditorCameraSnapshot();
  }

  /** 捕获编辑相机关键参数，供预览和撤销恢复后保留用户当前视角。 */
  private captureEditorCameraSnapshot(): PreviewCameraSnapshot {
    return {
      alpha: this.editorCamera.alpha,
      beta: this.editorCamera.beta,
      radius: this.editorCamera.radius,
      target: this.editorCamera.target.clone(),
      minZ: this.editorCamera.minZ,
      maxZ: this.editorCamera.maxZ,
      lowerRadiusLimit: this.editorCamera.lowerRadiusLimit,
      upperRadiusLimit: this.editorCamera.upperRadiusLimit
    };
  }

  /** 恢复进入预览前的相机状态，缺少快照时保持当前视角。 */
  private restorePreviewCameraSnapshot(): void {
    if (!this.previewCameraSnapshot) {
      return;
    }

    this.restoreEditorCameraSnapshot(this.previewCameraSnapshot);
    this.previewCameraSnapshot = null;
  }

  /** 恢复编辑相机状态，避免场景内容恢复时把用户视角一起回滚。 */
  private restoreEditorCameraSnapshot(snapshot: PreviewCameraSnapshot): void {
    this.editorCamera.alpha = snapshot.alpha;
    this.editorCamera.beta = snapshot.beta;
    this.editorCamera.radius = snapshot.radius;
    this.editorCamera.target.copyFrom(snapshot.target);
    this.editorCamera.minZ = snapshot.minZ;
    this.editorCamera.maxZ = snapshot.maxZ;
    this.editorCamera.lowerRadiusLimit = snapshot.lowerRadiusLimit;
    this.editorCamera.upperRadiusLimit = snapshot.upperRadiusLimit;
    this.attachEditorCameraControl();
  }

  /** 播放当前场景内的 AnimationGroup，旧场景没有分组时回退播放节点直接动画。 */
  private startPreviewAnimations(): void {
    this.previewAnimationGroupSnapshots = [];
    this.previewDirectAnimationSnapshots = [];

    const animationGroups = this.scene.animationGroups.filter((group) => this.isPreviewAnimationGroupUsable(group));
    animationGroups.forEach((group) => {
      this.previewAnimationGroupSnapshots.push({
        group,
        from: group.from,
        to: group.to,
        speedRatio: group.speedRatio,
        loopAnimation: group.loopAnimation
      });
      group.stop(true);
      group.reset();
      group.start(true, group.speedRatio || 1, group.from, group.to);
    });

    if (this.previewAnimationGroupSnapshots.length > 0) {
      return;
    }

    this.startDirectPreviewAnimations();
  }

  /** AnimationGroup 的目标仍在当前场景中时才参与预览，避免播放已清理场景的旧动画。 */
  private isPreviewAnimationGroupUsable(group: AnimationGroup): boolean {
    return group.targetedAnimations.some((targetedAnimation) => {
      const target = targetedAnimation.target as {
        metadata?: Record<string, unknown>;
        isDisposed?: () => boolean;
        getScene?: () => Scene;
      } | null;
      if (!target || target.metadata?.[HELPER_FLAG]) {
        return false;
      }

      if (typeof target.isDisposed === "function" && target.isDisposed()) {
        return false;
      }

      return typeof target.getScene !== "function" || target.getScene() === this.scene;
    });
  }

  /** 播放直接挂在节点上的动画，兼容没有 AnimationGroup 的旧 .babylon 场景。 */
  private startDirectPreviewAnimations(): void {
    const seenNodes = new Set<number>();
    const candidates: Node[] = [
      ...this.scene.transformNodes,
      ...this.scene.meshes,
      ...this.scene.lights,
      ...this.scene.cameras
    ];
    const nodes = candidates.filter((node) => {
      if (node.metadata?.[HELPER_FLAG] || seenNodes.has(node.uniqueId)) {
        return false;
      }

      seenNodes.add(node.uniqueId);
      return node.animations.length > 0;
    });

    nodes.forEach((node) => {
      const frameRange = this.getAnimationFrameRange(node.animations);
      if (!frameRange) {
        return;
      }

      const animatable = this.scene.beginDirectAnimation(node, node.animations, frameRange.from, frameRange.to, true, 1);
      this.previewDirectAnimationSnapshots.push({ animatable, from: frameRange.from });
    });
  }

  /** 从动画关键帧中计算可播放帧段，空动画或无效帧段不参与预览。 */
  private getAnimationFrameRange(animations: Animation[]): { from: number; to: number } | null {
    let from = Number.POSITIVE_INFINITY;
    let to = Number.NEGATIVE_INFINITY;
    animations.forEach((animation) => {
      animation.getKeys().forEach((key) => {
        from = Math.min(from, key.frame);
        to = Math.max(to, key.frame);
      });
    });

    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return null;
    }

    return { from, to };
  }

  /** 停止所有由预览模式启动的动画，并尽量回到动画起始姿态。 */
  private stopPreviewAnimations(): void {
    this.previewDirectAnimationSnapshots.forEach(({ animatable, from }) => {
      animatable.goToFrame(from);
      animatable.stop(undefined, undefined, undefined, true);
    });
    this.previewDirectAnimationSnapshots = [];

    this.previewAnimationGroupSnapshots.forEach(({ group, from, to, speedRatio, loopAnimation }) => {
      group.stop(true);
      group.reset();
      group.from = from;
      group.to = to;
      group.speedRatio = speedRatio;
      group.loopAnimation = loopAnimation;
    });
    this.previewAnimationGroupSnapshots = [];
  }

  /** 根据屏幕坐标投射到编辑地面，供拖拽创建和导入定位使用。 */
  public getGroundPointFromClient(clientX: number, clientY: number): Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pick = this.scene.pick(
      x,
      y,
      (mesh) => Boolean(mesh.metadata?.[DROP_SURFACE_FLAG])
    );

    return pick?.pickedPoint ?? this.getGroundPointFromRay(x, y);
  }

  /** 根据层级面板传入的 uniqueId 选中场景节点。 */
  public selectById(id: number): void {
    const node = this.findTransformNodeByUniqueId(id);
    if (node instanceof TransformNode) {
      this.selectNode(node);
    }
  }

  /** 根据层级树计算出的节点 ID 集合设置选区，primaryId 对应属性面板和 Gizmo 的主对象。 */
  public setSelectionByIds(ids: number[], primaryId: number | null): void {
    const uniqueIds = [...new Set(ids)];
    const transformNodeById = this.createTransformNodeLookup();
    const nodes = uniqueIds
      .map((id) => transformNodeById.get(id))
      .filter((node): node is TransformNode => node instanceof TransformNode && !node.metadata?.[HELPER_FLAG]);
    const primaryNode = primaryId === null ? null : nodes.find((node) => node.uniqueId === primaryId) ?? null;

    this.setSelection(nodes, primaryNode);
  }

  /** 多选右键已选节点时只切换主对象，保留其它已选项用于继续高亮。 */
  public setPrimarySelectionById(id: number): boolean {
    if (!this.selectedNodeIds.has(id)) {
      return false;
    }

    const node = this.findTransformNodeByUniqueId(id);
    if (!(node instanceof TransformNode) || node.metadata?.[HELPER_FLAG]) {
      return false;
    }

    this.selectedNode = node;
    this.ensureMoveToolForTransformSelection(node);
    this.applyHighlight();
    this.syncGizmoMode();
    this.emitSelectionSnapshot();
    this.refreshSceneGraph(false);
    this.scene.render();
    return true;
  }

  /** 选中指定节点的第一个可展示子级，供“选择子级”右键命令使用。 */
  public selectFirstChildById(id: number): boolean {
    const node = this.findTransformNodeByUniqueId(id);
    if (!node || node.metadata?.[HELPER_FLAG]) {
      return false;
    }

    const child = this.getVisibleChildren(node).find((item) => item instanceof TransformNode && this.isSceneGraphDisplayNode(item));
    if (!(child instanceof TransformNode) || this.isNodeLocked(child)) {
      return false;
    }

    this.selectNode(child);
    return true;
  }

  /** 根据层级面板传入的 uniqueId 快速定位到场景节点，可选择保留当前多选集合。 */
  public focusById(id: number, preserveSelection = false): void {
    const node = this.findTransformNodeByUniqueId(id);
    if (!(node instanceof TransformNode) || node.metadata?.[HELPER_FLAG]) {
      return;
    }

    if (preserveSelection && this.selectedNodeIds.has(id)) {
      this.setPrimarySelectionById(id);
    } else {
      this.selectNode(node);
    }
    this.frameNodeInView(node);
  }

  /** 根据层级面板传入的 uniqueId 切换场景节点显隐，并刷新层级树和属性面板。 */
  public setNodeVisibilityById(id: number, visible: boolean): void {
    const node = this.findSceneNodeByUniqueId(id);
    if (!node || node.metadata?.[HELPER_FLAG] || (node instanceof TransformNode && this.isNodeLocked(node))) {
      return;
    }

    const currentVisible = node instanceof TransformNode ? this.getNodeVisibility(node) : node.isEnabled();
    if (currentVisible === visible) {
      return;
    }

    this.recordSceneUndoSnapshot("切换对象显隐");
    if (node instanceof TransformNode) {
      this.updateNodeVisibility(node, visible);
      this.refreshNodeWorldMatrices(node);
    } else {
      node.setEnabled(visible);
    }

    if (this.selectedNode?.uniqueId === node.uniqueId) {
      this.emitSelectionSnapshot();
    }
    this.refreshSceneGraph();
    this.scene.render();
  }

  /** 选中对象时切换自身显隐状态，右键和快捷键共用同一入口。 */
  public toggleSelectedVisibility(): boolean {
    const nodes = this.getTopLevelSelectedTransformNodes().filter((node) => !this.isNodeLocked(node));
    const primaryNode = this.selectedNode && nodes.some((node) => node.uniqueId === this.selectedNode?.uniqueId) ? this.selectedNode : nodes[0];
    if (!primaryNode || nodes.length === 0) {
      return false;
    }

    this.recordSceneUndoSnapshot("切换对象显隐");
    const nextVisible = !this.getNodeVisibility(primaryNode);
    nodes.forEach((node) => {
      this.updateNodeVisibility(node, nextVisible);
      this.refreshNodeWorldMatrices(node);
    });
    this.emitSelectionSnapshot();
    this.refreshSceneGraph();
    this.scene.render();
    return true;
  }

  /** 选中对象时切换自身锁定状态，父级锁定对象不允许在子级上反向解锁。 */
  public toggleSelectedLock(): boolean {
    const nodes = this.getTopLevelSelectedTransformNodes().filter((node) => !this.isNodeLockedByAncestor(node) || this.isNodeSelfLocked(node));
    const primaryNode = this.selectedNode && nodes.some((node) => node.uniqueId === this.selectedNode?.uniqueId) ? this.selectedNode : nodes[0];
    if (!primaryNode || nodes.length === 0) {
      return false;
    }

    this.recordSceneUndoSnapshot("切换对象锁定");
    const nextLocked = !this.isNodeSelfLocked(primaryNode);
    nodes.forEach((node) => this.mergeNodeEditorMetadata(node, { locked: nextLocked }));
    this.emitSelectionSnapshot();
    this.syncGizmoMode();
    this.refreshSceneGraph();
    this.scene.render();
    return true;
  }

  /** 按当前选中节点反向定位底部资源库卡片，文件夹和 CAD 这类场景对象没有资源库目标。 */
  public getAssetLibraryFocusTargetById(id: number): AssetLibraryFocusTarget | null {
    const node = this.findTransformNodeByUniqueId(id);
    if (!node || node.metadata?.[HELPER_FLAG] || this.isEditorGroup(node) || this.isCadDrawingNode(node)) {
      return null;
    }

    if (this.isPoiNode(node)) {
      return { type: "poi", poiKind: this.getNodePoiConfig(node).kind };
    }

    const packageRoot = this.findModelPackageRoot(node);
    if (packageRoot) {
      const instance = this.asMetadataObject(this.getNodeEditorMetadata(packageRoot).modelPackageInstance);
      const assetId = typeof instance.assetId === "string" ? instance.assetId : "";
      if (assetId) {
        return { type: "asset", assetId };
      }
    }

    const sourceFile = this.getNodeSourceFileName(node);
    const sourceAsset = sourceFile ? this.findAssetBySourceFile(sourceFile) : undefined;
    if (sourceAsset) {
      return { type: "asset", assetId: sourceAsset.id };
    }

    const primitiveKind = this.getPrimitiveKindForAssetFocus(node);
    return primitiveKind ? { type: "primitive", primitiveKind } : null;
  }

  /** 删除当前选中的可编辑节点，并同步层级树、属性面板和性能统计。 */
  public deleteSelected(): void {
    const nodes = this.getTopLevelSelectedTransformNodes().filter((node) => !this.isNodeLocked(node));
    if (nodes.length === 0) {
      return;
    }

    this.recordSceneUndoSnapshot("删除对象");
    this.selectNode(null);
    nodes.forEach((node) => {
      this.cleanupPoiRuntimeInHierarchy(node);
      this.disposeEditableNode(node);
    });
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
    this.scene.render();
  }

  /** 把当前选区中的顶层节点放入新建逻辑分组，单选时保持原有群组体验。 */
  public groupSelected(): boolean {
    const nodes = this.getTopLevelSelectedTransformNodes().filter((node) => !this.isNodeLocked(node));
    if (nodes.length === 0) {
      return false;
    }

    this.recordSceneUndoSnapshot("对象分组");
    const firstParent = nodes[0].parent instanceof TransformNode ? nodes[0].parent : null;
    const sameParent = nodes.every((node) => node.parent === firstParent);
    const previousParent = sameParent ? firstParent : null;
    const group = new TransformNode(this.createUniqueGroupName(), this.scene);
    group.position.copyFrom(this.getSelectionGroupPosition(nodes));
    group.metadata = {
      [ROOT_FLAG]: true,
      editor: {
        nodeType: GROUP_NODE_TYPE
      }
    };
    group.setParent(previousParent);
    nodes.forEach((node) => {
      node.setParent(group);
      this.refreshNodeWorldMatrices(node);
    });
    this.selectNode(group);
    this.scene.render();
    return true;
  }

  /** 解组当前选中对象：选中 group 时释放其子级，选中子级时移回场景根级。 */
  public ungroupSelected(): boolean {
    const node = this.selectedNode;
    if (!node || node.metadata?.[HELPER_FLAG] || this.isNodeLocked(node)) {
      return false;
    }

    if (this.isEditorGroup(node)) {
      this.recordSceneUndoSnapshot("对象解组");
      const targetParent = node.parent instanceof TransformNode ? node.parent : null;
      const children = this.getVisibleChildren(node).filter((child): child is TransformNode => child instanceof TransformNode);
      children.forEach((child) => {
        child.setParent(targetParent);
        child.metadata = {
          ...this.asMetadataObject(child.metadata),
          [ROOT_FLAG]: true
        };
        this.refreshNodeWorldMatrices(child);
      });
      this.selectNode(children[0] ?? null);
      this.disposeEditableNode(node);
      this.refreshSceneGraph();
      this.scene.render();
      return true;
    }

    if (node.parent instanceof TransformNode && this.isEditorGroup(node.parent)) {
      this.moveNodeToGroup(node.uniqueId, null);
      return true;
    }

    return false;
  }

  /** 单选编辑器中的反选：选择当前节点之后的下一个可编辑树节点。 */
  public invertSelection(): boolean {
    const candidates = this.getSelectableSceneGraphNodes();
    if (candidates.length === 0) {
      return false;
    }

    const currentIndex = this.selectedNode ? candidates.findIndex((node) => node.uniqueId === this.selectedNode?.uniqueId) : -1;
    const nextNode = candidates[(currentIndex + 1 + candidates.length) % candidates.length];
    this.selectNode(nextNode);
    return true;
  }

  /** 复制当前选中的可编辑节点到引擎内部剪贴板，供后续 Ctrl+V 复用。 */
  public copySelected(): boolean {
    const sourceNode = this.selectedNode;
    if (this.previewMode || !sourceNode || sourceNode.metadata?.[HELPER_FLAG] || this.isNodeLocked(sourceNode)) {
      return false;
    }

    const copyRoot = this.findModelPackageRoot(sourceNode) ?? sourceNode;
    if (this.isNodeLocked(copyRoot)) {
      return false;
    }

    const sourceModelPackage = this.getModelPackageAssetForRoot(copyRoot)?.modelPackage;
    this.cleanupPoiRuntimeInHierarchy(copyRoot);
    if (sourceModelPackage) {
      this.stopModelPackageRuntime(copyRoot, true);
    }
    let template: TransformNode | null = null;
    try {
      template = this.cloneEditableNode(copyRoot, `__editor_clipboard_${copyRoot.uniqueId}__`);
    } finally {
      if (sourceModelPackage) {
        this.applyModelPackageRuntimeWithDynamicFallbacks(copyRoot, sourceModelPackage, "clone");
      }
    }
    if (!template) {
      return false;
    }

    this.prepareClonedHierarchy(template, copyRoot, true);
    template.setEnabled(false);
    const previousTemplate = this.clipboardTemplateNode;
    this.clipboardTemplateNode = template;
    this.clipboardBaseName = copyRoot.name || "模型";
    this.clipboardPasteCount = 0;
    if (previousTemplate) {
      this.disposeClonedNodeHierarchy(previousTemplate);
    }
    this.refreshSceneGraph();
    return true;
  }

  /** 把内部剪贴板中的模型粘贴为新的可编辑副本，并立即选中新副本。 */
  public pasteClipboard(): boolean {
    if (this.previewMode || !this.clipboardTemplateNode) {
      return false;
    }

    this.recordSceneUndoSnapshot("粘贴对象");
    const pasteName = this.createUniqueCopyName(this.clipboardBaseName);
    const pastedNode = this.cloneEditableNode(this.clipboardTemplateNode, pasteName);
    if (!pastedNode) {
      return false;
    }

    this.clipboardPasteCount += 1;
    this.prepareClonedHierarchy(pastedNode, this.clipboardTemplateNode, false);
    pastedNode.name = pasteName;
    pastedNode.setEnabled(true);
    pastedNode.position.addInPlace(this.clipboardPasteOffset.scale(this.clipboardPasteCount));
    const pastedModelPackage = this.getModelPackageAssetForRoot(pastedNode)?.modelPackage;
    if (pastedModelPackage) {
      this.applyModelPackageRuntimeWithDynamicFallbacks(pastedNode, pastedModelPackage, "clone");
    }
    this.refreshNodeWorldMatrices(pastedNode);
    this.ensureNodeGridCoverage(pastedNode);
    this.selectNode(pastedNode);
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
    this.scene.render();
    return true;
  }

  /** 根据视口右键位置拾取可展示上下文菜单的场景对象，阵列等具体命令再单独校验。 */
  public pickContextMenuTargetFromClient(clientX: number, clientY: number): TransformSnapshot | null {
    if (this.previewMode) {
      return null;
    }

    const rect = this.canvas.getBoundingClientRect();
    const pick = this.scene.pick(
      clientX - rect.left,
      clientY - rect.top,
      (mesh) => mesh.isPickable !== false && !mesh.metadata?.[HELPER_FLAG] && !mesh.metadata?.[DROP_SURFACE_FLAG]
    );
    const pickedMesh = pick?.pickedMesh;
    if (!pickedMesh) {
      return null;
    }

    const targetRoot = this.findSelectableRoot(pickedMesh);
    if (!targetRoot || targetRoot.metadata?.[HELPER_FLAG]) {
      return null;
    }

    if (this.selectedNodeIds.has(targetRoot.uniqueId)) {
      this.setPrimarySelectionById(targetRoot.uniqueId);
    } else {
      this.selectNode(targetRoot);
    }
    return this.createTransformSnapshot(targetRoot);
  }

  /** 判断指定节点是否能创建模型阵列，供 UI 菜单直接复用引擎兜底规则。 */
  public canCreateModelArrayForId(targetId: number): boolean {
    if (this.previewMode) {
      return false;
    }

    return Boolean(this.getModelArrayTargetRoot(this.findTransformNodeByUniqueId(targetId)));
  }

  /** 沿地面 X/Z 轴批量克隆指定模型，生成的副本是普通可编辑场景节点。 */
  public createModelArray(options: ModelArrayOptions): ModelArrayResult {
    if (this.previewMode) {
      return this.createModelArrayFailure("预览模式正在播放场景，请先停止预览再创建模型阵列。");
    }

    const cloneCount = options.count;
    if (
      !Number.isFinite(cloneCount) ||
      !Number.isInteger(cloneCount) ||
      cloneCount < 1 ||
      cloneCount > MAX_MODEL_ARRAY_CLONE_COUNT
    ) {
      return this.createModelArrayFailure(`克隆数量必须是 1-${MAX_MODEL_ARRAY_CLONE_COUNT} 之间的整数。`);
    }

    const modelSpacing = options.spacing;
    if (!Number.isFinite(modelSpacing) || modelSpacing < 0 || modelSpacing > MAX_MODEL_ARRAY_SPACING_METERS) {
      return this.createModelArrayFailure(`模型间距必须是 0-${MAX_MODEL_ARRAY_SPACING_METERS} 米之间的数字。`);
    }

    const sourceRoot = this.getModelArrayTargetRoot(this.findTransformNodeByUniqueId(options.targetId));
    if (!sourceRoot) {
      return this.createModelArrayFailure("当前选择不可创建模型阵列，请选择未锁定的普通模型。");
    }
    const sourceModelPackage = this.getModelPackageAssetForRoot(sourceRoot)?.modelPackage;

    const directionByAxis: Partial<Record<string, Vector3>> = {
      x: new Vector3(1, 0, 0),
      "-x": new Vector3(-1, 0, 0),
      z: new Vector3(0, 0, 1),
      "-z": new Vector3(0, 0, -1)
    };
    const direction = directionByAxis[options.axis];
    if (!direction) {
      return this.createModelArrayFailure("阵列轴向必须是 X、-X、Z 或 -Z。");
    }
    this.refreshNodeWorldMatrices(sourceRoot);
    const sourceBounds = this.getNodeWorldBounds(sourceRoot);
    if (!sourceBounds) {
      return this.createModelArrayFailure("当前模型没有可用于自动贴边阵列的可渲染包围盒。");
    }

    const autoStep = this.calculateModelArrayBaseStep(sourceRoot, sourceBounds, options.axis, sourceModelPackage);
    if (!Number.isFinite(autoStep) || autoStep <= MODEL_ARRAY_MIN_AUTO_STEP_METERS) {
      const axisLabel = options.axis === "x" || options.axis === "-x" ? "X" : "Z";
      return this.createModelArrayFailure(`当前模型在 ${axisLabel} 方向尺寸过小，无法自动贴边阵列。`);
    }
    const arrayStep = autoStep + modelSpacing;

    const sourceParent = sourceRoot.parent instanceof TransformNode ? sourceRoot.parent : null;
    const usedAssetCodes = this.collectSceneAssetCodes();
    const sourceAssetCode = this.getNodeAssetInfo(sourceRoot).assetCode.trim();
    const clones: TransformNode[] = [];
    let sourceRuntimeStopped = false;
    this.recordSceneUndoSnapshot("创建模型阵列");

    try {
      this.cleanupPoiRuntimeInHierarchy(sourceRoot);
      if (sourceModelPackage) {
        this.stopModelPackageRuntime(sourceRoot, true);
        sourceRuntimeStopped = true;
      }

      for (let index = 1; index <= cloneCount; index += 1) {
        const cloneName = this.createUniqueArrayCopyName(sourceRoot.name, index);
        const clone = this.cloneEditableNode(sourceRoot, cloneName, sourceParent);
        if (!clone) {
          throw new Error("克隆模型节点失败。");
        }

        this.prepareClonedHierarchy(clone, sourceRoot, false);
        clone.name = cloneName;
        clone.setEnabled(true);
        const worldOffset = direction.scale(arrayStep * index);
        clone.position.addInPlace(this.worldDeltaToParentLocalDelta(clone, worldOffset));
        if (sourceAssetCode) {
          this.updateNodeAssetInfo(clone, {
            assetCode: this.createUniqueArrayAssetCode(sourceAssetCode, usedAssetCodes)
          });
        }

        clones.push(clone);
        const cloneModelPackage = this.getModelPackageAssetForRoot(clone)?.modelPackage;
        if (cloneModelPackage) {
          this.applyModelPackageRuntimeWithDynamicFallbacks(clone, cloneModelPackage, "clone");
        }
        this.refreshNodeWorldMatrices(clone);
        this.ensureNodeGridCoverage(clone);
      }
    } catch (error) {
      clones.forEach((clone) => this.disposeClonedNodeHierarchy(clone));
      if (sourceRuntimeStopped && sourceModelPackage) {
        this.applyModelPackageRuntimeWithDynamicFallbacks(sourceRoot, sourceModelPackage, "clone");
      }
      this.refreshSceneGraph();
      this.scene.render();
      return this.createModelArrayFailure(getEngineErrorMessage(error, "创建模型阵列失败。"));
    }

    if (sourceRuntimeStopped && sourceModelPackage) {
      this.applyModelPackageRuntimeWithDynamicFallbacks(sourceRoot, sourceModelPackage, "clone");
    }

    const selectedClone = clones[clones.length - 1];
    this.selectNode(selectedClone);
    this.callbacks.onStatsChange(this.collectStats());
    this.scene.render();
    return {
      success: true,
      createdCount: clones.length,
      selectedNode: this.createTransformSnapshot(selectedClone)
    };
  }

  /** 创建基础几何体或灯光，并放置到指定位置。 */
  public addPrimitive(kind: PrimitiveKind, position = Vector3.Zero()): TransformNode {
    this.recordSceneUndoSnapshot("创建基础对象");
    const node = this.createPrimitive(kind, position);
    this.selectNode(node);
    this.refreshSceneGraph();
    return node;
  }

  /** 创建 POI 点位组件，并放置到指定地面落点。 */
  public addPoi(kind: PoiKind, position = Vector3.Zero()): TransformNode {
    this.recordSceneUndoSnapshot("创建 POI");
    const node = this.createPoi(kind, position);
    this.selectNode(node);
    this.refreshSceneGraph();
    return node;
  }

  /** 创建逻辑分组节点，分组只负责组织树结构和批量高亮，不作为可变换模型使用。 */
  public createGroup(): TransformNode {
    this.recordSceneUndoSnapshot("创建分组");
    const group = new TransformNode(this.createUniqueGroupName(), this.scene);
    group.metadata = {
      [ROOT_FLAG]: true,
      editor: {
        nodeType: GROUP_NODE_TYPE
      }
    };
    this.selectNode(group);
    this.refreshSceneGraph();
    this.scene.render();
    return group;
  }

  /** 切换节点自身锁定状态，父级锁定仍会继续让子节点保持有效锁定。 */
  public setNodeLockedById(id: number, locked: boolean): void {
    const node = this.findTransformNodeByUniqueId(id);
    if (!node || node.metadata?.[HELPER_FLAG]) {
      return;
    }

    if (this.isNodeSelfLocked(node) === locked) {
      return;
    }

    this.recordSceneUndoSnapshot("切换对象锁定");
    this.mergeNodeEditorMetadata(node, { locked });
    if (this.selectedNode?.uniqueId === node.uniqueId || (this.selectedNode && this.isNodeAncestor(node, this.selectedNode))) {
      this.emitSelectionSnapshot();
      this.syncGizmoMode();
    }
    this.refreshSceneGraph();
    this.scene.render();
  }

  /** 把单个模型或分组移动到目标分组下；保留旧入口，实际逻辑交给批量移动统一兜底。 */
  public moveNodeToGroup(nodeId: number, groupId: number | null): void {
    this.moveNodesToGroup([nodeId], groupId);
  }

  /** 把多个模型或分组一次性移动到目标 group；非法节点会被过滤，合法节点共享一次撤销快照。 */
  public moveNodesToGroup(nodeIds: number[], groupId: number | null): void {
    let targetParent: TransformNode | null = null;
    if (groupId !== null) {
      const group = this.findTransformNodeByUniqueId(groupId);
      if (!group || !this.isEditorGroup(group) || this.isNodeLocked(group)) {
        return;
      }
      targetParent = group;
    }

    const transformNodeById = this.createTransformNodeLookup();
    const uniqueNodeIds = [...new Set(nodeIds)].filter((id) => Number.isInteger(id));
    const candidateNodes = uniqueNodeIds
      .map((id) => transformNodeById.get(id))
      .filter((node): node is TransformNode => node instanceof TransformNode && !node.metadata?.[HELPER_FLAG] && !this.isNodeLocked(node));
    const candidateIds = new Set(candidateNodes.map((node) => node.uniqueId));
    const movableNodes = candidateNodes.filter((node) => {
      if (this.hasSelectedAncestor(node, candidateIds)) {
        return false;
      }

      if (targetParent && (targetParent.uniqueId === node.uniqueId || this.isNodeAncestor(node, targetParent))) {
        return false;
      }

      return (node.parent instanceof TransformNode ? node.parent : null) !== targetParent;
    });

    if (movableNodes.length === 0) {
      return;
    }

    this.recordSceneUndoSnapshot(movableNodes.length > 1 ? "批量移动对象分组" : "移动对象分组");
    movableNodes.forEach((node) => {
      node.setParent(targetParent);
      node.metadata = {
        ...this.asMetadataObject(node.metadata),
        [ROOT_FLAG]: true
      };
      this.refreshNodeWorldMatrices(node);
    });
    this.refreshSceneGraph();
    this.emitSelectionSnapshot();
    this.scene.render();
  }

  /** 返回当前资产记录快照，供 React 外层恢复项目资产文件缓存。 */
  public getAssetsSnapshot(): AssetRecord[] {
    return this.assets.map((asset) => ({ ...asset }));
  }

  /** 重新打开项目后，把项目目录内读回的文件绑定到资产记录上。 */
  public restoreAssetFiles(filesByAssetId: Map<string, File | File[]>): void {
    let changed = false;
    this.assets.forEach((asset) => {
      const value = filesByAssetId.get(asset.id);
      if (!value) {
        return;
      }

      const files = (Array.isArray(value) ? value : [value]).filter((file) => file instanceof File);
      if (files.length === 0) {
        return;
      }

      const primaryFileName = asset.modelPackage?.primaryModelFile.split(/[\\/]/).pop();
      const mainFile = files.find((file) => file.name === primaryFileName) ?? files.find((file) => file.name === asset.name) ?? files[0];
      this.assetFiles.set(asset.id, mainFile);
      this.assetDependencyFiles.set(asset.id, this.dedupeFiles([mainFile, ...files]));
      asset.sourceAvailable = true;
      changed = true;
    });

    if (changed) {
      this.callbacks.onAssetsChange([...this.assets]);
    }
  }

  /** 注册项目模型包脚本文本，运行器只从这里读取已复制进项目的本地脚本。 */
  public registerModelPackageScriptTexts(packageId: string, textFiles: Record<string, string>): void {
    const normalizedTexts = this.modelPackageScriptTexts.get(packageId) ?? new Map<string, string>();
    Object.entries(textFiles).forEach(([relativePath, text]) => {
      normalizedTexts.set(this.normalizeModelPackageRelativePath(relativePath), text);
    });
    this.modelPackageScriptTexts.set(packageId, normalizedTexts);
  }

  /** 替换模型包脚本文本缓存，刷新旧实例时避免已删除或改名的旧脚本残留。 */
  public replaceModelPackageScriptTexts(packageId: string, textFiles: Record<string, string>): void {
    const normalizedTexts = new Map<string, string>();
    Object.entries(textFiles).forEach(([relativePath, text]) => {
      normalizedTexts.set(this.normalizeModelPackageRelativePath(relativePath), text);
    });
    this.modelPackageScriptTexts.set(packageId, normalizedTexts);
  }

  /** 刷新已导入模型包资产的脚本和 manifest，并立即重跑当前场景中的同包实例。 */
  public refreshModelPackageAsset(assetId: string, manifest: ModelPackageManifest, textFiles: Record<string, string>): boolean {
    const asset = this.assets.find((item) => item.id === assetId && item.modelPackage?.packageId === manifest.packageId);
    if (!asset) {
      return false;
    }

    const matchingRoots = this.getSceneModelPackageRoots().filter((root) => {
      const instance = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageInstance);
      return instance.assetId === assetId && instance.packageId === manifest.packageId;
    });
    if (matchingRoots.length > 0) {
      this.recordSceneUndoSnapshot("刷新模型包");
    }

    this.replaceModelPackageScriptTexts(manifest.packageId, textFiles);
    asset.modelPackage = manifest;
    asset.name = manifest.displayName;
    asset.projectFiles = [...new Set([asset.projectFile, ...manifest.files.map((file) => file.projectFile)].filter((file): file is string => Boolean(file)))];

    matchingRoots.forEach((root) => {
      this.stopModelPackageRuntime(root, false);
      const values = this.getModelPackageValues(root, manifest);
      this.applyModelPackageRuntimeWithDynamicFallbacks(root, manifest, "load", values);
    });

    this.callbacks.onAssetsChange([...this.assets]);
    this.refreshSceneGraph();
    this.emitSelectionSnapshot();
    this.scene.render();
    return true;
  }

  /** 替换已导入模型包的完整资产，并用更新后的模型层级重建当前场景中的同包实例。 */
  public async replaceModelPackageAsset(
    assetId: string,
    files: File[],
    manifest: ModelPackageManifest,
    textFiles: Record<string, string>
  ): Promise<boolean> {
    const asset = this.assets.find((item) => item.id === assetId && item.modelPackage?.packageId === manifest.packageId);
    if (!asset) {
      return false;
    }

    const primaryFile = this.getModelPackagePrimaryFile(files, manifest);
    const extension = this.getFileExtension(primaryFile.name);
    if (!this.isSceneFile(extension)) {
      throw new Error(`模型包主文件不是可导入模型：${primaryFile.name}`);
    }

    const matchingRoots = this.getSceneModelPackageRoots().filter((root) => {
      const instance = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageInstance);
      return instance.assetId === assetId && instance.packageId === manifest.packageId;
    });

    const projectFileMap = new Map<string, ModelPackageProjectFile>();
    manifest.files.forEach((file) => projectFileMap.set(file.relativePath, file));
    const primaryProjectFile = projectFileMap.get(manifest.primaryModelFile)?.projectFile;
    const projectFiles = manifest.files.map((file) => file.projectFile);
    this.registerFilesForLocalImport(files);
    const preparedTemplate = await this.importSceneFileAsReplacementTemplate(primaryFile, extension);
    if (!preparedTemplate) {
      return false;
    }

    if (matchingRoots.length > 0) {
      this.recordSceneUndoSnapshot("替换模型包");
    }

    const snapshots = matchingRoots.map((root) => this.captureModelPackageReplacementSnapshot(root, assetId, manifest));
    const preparedReplacements: PreparedModelPackageReplacement[] = [];
    const hadPreviousScriptTexts = this.modelPackageScriptTexts.has(manifest.packageId);
    const previousScriptTexts = new Map(this.modelPackageScriptTexts.get(manifest.packageId) ?? []);
    const previousAssetFile = this.assetFiles.get(assetId);
    const previousDependencyFiles = this.assetDependencyFiles.get(assetId);
    const previousAsset = { ...asset };

    try {
      for (const snapshot of snapshots) {
        const replacementRoot = this.createModelPackageReplacementRoot(preparedTemplate.root, snapshot);
        preparedReplacements.push({ snapshot, replacementRoot });
      }

      this.replaceModelPackageScriptTexts(manifest.packageId, textFiles);
      const nextSelectedRoots: TransformNode[] = [];
      let nextPrimarySelectedRoot: TransformNode | null = null;
      preparedReplacements.forEach(({ snapshot, replacementRoot }) => {
        replacementRoot.setEnabled(true);
        this.syncModelPackageScriptMetadata(replacementRoot, manifest, snapshot.editableState.values);
        this.applyModelPackageRuntimeWithDynamicFallbacks(replacementRoot, manifest, "load", snapshot.editableState.values);
        this.updateNodeVisibility(replacementRoot, snapshot.visible);
        this.refreshNodeWorldMatrices(replacementRoot);
        this.ensureNodeGridCoverage(replacementRoot);
        if (snapshot.selected) {
          nextSelectedRoots.push(replacementRoot);
        }
        if (snapshot.primarySelected) {
          nextPrimarySelectedRoot = replacementRoot;
        }
      });
      preparedReplacements.forEach(({ snapshot }) => this.disposeEditableNode(snapshot.root));

      this.assetFiles.set(assetId, primaryFile);
      this.assetDependencyFiles.set(assetId, this.dedupeFiles([primaryFile, ...files]));
      asset.name = manifest.displayName;
      asset.sizeLabel = formatBytes(primaryFile.size);
      asset.projectFile = primaryProjectFile;
      asset.projectFiles = [...new Set(projectFiles)];
      asset.sourceAvailable = true;
      asset.modelPackage = manifest;
      Object.assign(asset, this.createAssetUnitFields(preparedTemplate.unitMetadata));

      this.disposeModelPackageReplacementTemplate(preparedTemplate);
      this.callbacks.onAssetsChange([...this.assets]);
      if (nextSelectedRoots.length > 0) {
        this.setSelection(nextSelectedRoots, nextPrimarySelectedRoot ?? nextSelectedRoots[0]);
      } else if (this.selectedNode && this.findSceneNodeByUniqueId(this.selectedNode.uniqueId)) {
        this.emitSelectionSnapshot();
        this.refreshSceneGraph();
      } else {
        this.selectNode(null);
      }
      this.callbacks.onStatsChange(this.collectStats());
      this.scene.render();
      return true;
    } catch (error) {
      preparedReplacements.forEach(({ replacementRoot }) => this.disposeEditableNode(replacementRoot));
      this.disposeModelPackageReplacementTemplate(preparedTemplate);
      if (hadPreviousScriptTexts) {
        this.modelPackageScriptTexts.set(manifest.packageId, previousScriptTexts);
      } else {
        this.modelPackageScriptTexts.delete(manifest.packageId);
      }
      if (previousAssetFile) {
        this.assetFiles.set(assetId, previousAssetFile);
      } else {
        this.assetFiles.delete(assetId);
      }
      if (previousDependencyFiles) {
        this.assetDependencyFiles.set(assetId, previousDependencyFiles);
      } else {
        this.assetDependencyFiles.delete(assetId);
      }
      Object.assign(asset, previousAsset);
      throw error;
    }
  }

  /** 项目重新打开并恢复脚本文本后，初始化场景里已有模型包实例的运行器。 */
  public initializeModelPackageRuntimesForScene(): void {
    this.getSceneModelPackageRoots().forEach((root) => {
      const asset = this.getModelPackageAssetForRoot(root);
      if (asset?.modelPackage) {
        const values = this.getModelPackageValues(root, asset.modelPackage);
        this.applyModelPackageRuntimeWithDynamicFallbacks(root, asset.modelPackage, "load", values);
      }
    });
    this.refreshSceneGraph();
    this.emitSelectionSnapshot();
    this.scene.render();
  }

  /** 只把用户选择的文件登记到资产库，不立即写入 Babylon 场景。 */
  public registerAssetFiles(files: FileList | File[], projectFiles = new Map<File, string>()): void {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const extension = this.getFileExtension(file.name);
      if (this.isTextureFile(extension)) {
        this.registerAsset(file, "texture", projectFiles.get(file), this.getProjectFilesForAsset(file, fileArray, projectFiles), [
          file
        ]);
        continue;
      }

      if (this.isSceneFile(extension)) {
        this.registerAsset(
          file,
          extension === ".babylon" ? "scene" : "model",
          projectFiles.get(file),
          this.getProjectFilesForAsset(file, fileArray, projectFiles),
          this.getDependencyFilesForAsset(file, fileArray)
        );
      }
    }

    this.callbacks.onAssetsChange([...this.assets]);
  }

  /** 从资产库拖入视口时，才把对应模型实例化到当前场景。 */
  public async instantiateAsset(assetId: string, position = Vector3.Zero()): Promise<boolean> {
    const asset = this.assets.find((item) => item.id === assetId);
    if (!asset || (asset.type !== "model" && asset.type !== "scene")) {
      return false;
    }

    const file = this.assetFiles.get(assetId);
    this.recordSceneUndoSnapshot("实例化资源");
    const clonedNode = asset.modelPackage && file
      ? null
      : this.instantiateAssetFromSceneTemplate(asset, position);
    if (clonedNode) {
      this.callbacks.onStatsChange(this.collectStats());
      return true;
    }

    if (!file) {
      return false;
    }

    const extension = this.getFileExtension(file.name);
    if (!this.isSceneFile(extension)) {
      return false;
    }

    this.registerFilesForLocalImport(this.getCachedAssetFiles(assetId, file));
    const prepared = await this.importSceneFile(file, extension, position, false, undefined, undefined, [file], getPersistedModelUnitMetadata(asset));
    if (!prepared) {
      return false;
    }

    if (asset.modelPackage) {
      this.attachModelPackageMetadata(prepared.root, asset.id, asset.modelPackage);
      this.applyModelPackageRuntimeWithDynamicFallbacks(
        prepared.root,
        asset.modelPackage,
        "import",
        this.getModelPackageValues(prepared.root, asset.modelPackage)
      );
      this.emitSelectionSnapshot();
    }

    this.updateAssetUnitMetadata(assetId, prepared.unitMetadata);
    this.refreshSceneGraph();
    return true;
  }

  /** 用户直接把文件拖入视口时，立即创建场景对象并同步登记资产。 */
  public async importFiles(files: FileList | File[], position = Vector3.Zero(), projectFiles = new Map<File, string>()): Promise<void> {
    const fileArray = Array.from(files);
    const willMutateScene = fileArray.some((file) => this.isSceneFile(this.getFileExtension(file.name)));
    if (willMutateScene) {
      this.recordSceneUndoSnapshot("导入模型文件");
    }
    this.registerFilesForLocalImport(fileArray);
    for (const file of fileArray) {
      const extension = this.getFileExtension(file.name);
      if (this.isTextureFile(extension)) {
        this.registerAsset(file, "texture", projectFiles.get(file), this.getProjectFilesForAsset(file, fileArray, projectFiles), [
          file
        ]);
        this.applyTextureToSelection(file);
        continue;
      }

      if (this.isSceneFile(extension)) {
        await this.importSceneFile(
          file,
          extension,
          position,
          true,
          projectFiles.get(file),
          this.getProjectFilesForAsset(file, fileArray, projectFiles),
          this.getDependencyFilesForAsset(file, fileArray)
        );
      }
    }

    this.callbacks.onAssetsChange([...this.assets]);
    this.refreshSceneGraph();
  }

  /** 导入文件夹模型包中的主 GLB，并把模型包 manifest 绑定到导入根节点。 */
  public async importModelPackage(files: File[], position: Vector3, manifest: ModelPackageManifest): Promise<void> {
    const primaryFileName = manifest.primaryModelFile.split(/[\\/]/).pop() ?? manifest.primaryModelFile;
    const primaryFile = files.find((file) => file.name === primaryFileName || file.name === manifest.primaryModelFile);
    if (!primaryFile) {
      throw new Error(`模型包缺少主模型文件：${manifest.primaryModelFile}`);
    }

    const extension = this.getFileExtension(primaryFile.name);
    if (!this.isSceneFile(extension)) {
      throw new Error(`模型包主文件不是可导入模型：${primaryFile.name}`);
    }

    this.recordSceneUndoSnapshot("导入模型包");
    this.registerFilesForLocalImport(files);
    const projectFileMap = new Map<string, ModelPackageProjectFile>();
    manifest.files.forEach((file) => projectFileMap.set(file.relativePath, file));
    const primaryProjectFile = projectFileMap.get(manifest.primaryModelFile)?.projectFile;
    const projectFiles = manifest.files.map((file) => file.projectFile);
    const prepared = await this.importSceneFile(primaryFile, extension, position, false, primaryProjectFile, projectFiles, files);
    if (!prepared) {
      return;
    }

    const asset = this.registerModelPackageAsset(primaryFile, manifest, primaryProjectFile, projectFiles, prepared.unitMetadata, files);
    this.attachModelPackageMetadata(prepared.root, asset.id, manifest);
    this.applyModelPackageRuntimeWithDynamicFallbacks(prepared.root, manifest, "import", this.getModelPackageValues(prepared.root, manifest));
    this.emitSelectionSnapshot();
    this.callbacks.onAssetsChange([...this.assets]);
    this.refreshSceneGraph();
  }

  /** 从项目文件缓存中定位模型包主模型文件，文件名和包内相对路径都兼容。 */
  private getModelPackagePrimaryFile(files: File[], manifest: ModelPackageManifest): File {
    const primaryFileName = manifest.primaryModelFile.split(/[\\/]/).pop() ?? manifest.primaryModelFile;
    const primaryFile = files.find((file) => file.name === primaryFileName || file.name === manifest.primaryModelFile);
    if (!primaryFile) {
      throw new Error(`模型包缺少主模型文件：${manifest.primaryModelFile}`);
    }
    return primaryFile;
  }

  /** 导入新模型包主模型作为临时模板；模板不参与选择、序列化或资产登记。 */
  private async importSceneFileAsReplacementTemplate(
    file: File,
    extension: string
  ): Promise<ModelPackageReplacementTemplate | null> {
    const result = await ImportMeshAsync(file, this.scene, {
      meshNames: null,
      pluginExtension: extension,
      name: file.name
    });
    const prepared = this.prepareImportedNodes(file.name, extension, result.meshes, result.transformNodes, Vector3.Zero());
    if (!prepared) {
      result.animationGroups?.forEach((group) => group.dispose());
      return null;
    }

    this.markModelPackageReplacementTemplate(prepared.root);
    return {
      ...prepared,
      animationGroups: result.animationGroups ?? []
    };
  }

  /** 释放模型包替换模板及其导入时临时注册到场景的动画组，避免模板资源残留。 */
  private disposeModelPackageReplacementTemplate(template: ModelPackageReplacementTemplate): void {
    template.animationGroups.forEach((group) => group.dispose());
    this.disposeEditableNode(template.root);
  }

  /** 把临时模板整棵树标记为 helper，避免替换过程中被保存、拾取或展示。 */
  private markModelPackageReplacementTemplate(root: TransformNode): void {
    this.getNodeHierarchy(root).forEach((node) => {
      node.doNotSerialize = true;
      node.metadata = {
        ...this.asMetadataObject(node.metadata),
        [HELPER_FLAG]: true
      };
      if (node instanceof AbstractMesh) {
        node.isPickable = false;
      }
    });
    root.setEnabled(false);
  }

  /** 捕获旧模型包实例的根级状态，并按新 manifest 过滤动态参数。 */
  private captureModelPackageReplacementSnapshot(
    root: TransformNode,
    assetId: string,
    manifest: ModelPackageManifest
  ): ModelPackageInstanceReplacementSnapshot {
    const values = this.getModelPackageReplacementValues(root, manifest);
    const editableState = this.captureModelPackageEditableState(root, values);
    editableState.modelPackageInstance = {
      ...this.asMetadataObject(editableState.modelPackageInstance),
      packageId: manifest.packageId,
      assetId,
      values: this.cloneDynamicParameterValues(values)
    };
    editableState.values = this.cloneDynamicParameterValues(values);
    const hierarchy = this.getNodeHierarchy(root);
    const selected = hierarchy.some((node) => this.selectedNodeIds.has(node.uniqueId));

    return {
      root,
      parent: root.parent,
      editorMetadata: this.deepCloneMetadata(this.getNodeEditorMetadata(root)),
      editableState,
      visible: this.getNodeVisibility(root),
      selected,
      primarySelected: Boolean(this.selectedNode && hierarchy.some((node) => node.uniqueId === this.selectedNode?.uniqueId))
    };
  }

  /** 从新模板克隆一个替换根节点，并恢复旧实例根级编辑状态。 */
  private createModelPackageReplacementRoot(
    templateRoot: TransformNode,
    snapshot: ModelPackageInstanceReplacementSnapshot
  ): TransformNode {
    const replacementRoot = templateRoot.clone(snapshot.editableState.name, null, false);
    if (!(replacementRoot instanceof TransformNode)) {
      throw new Error("模型包替换失败：新模型模板无法克隆。");
    }

    this.prepareClonedHierarchy(replacementRoot, templateRoot, false);
    replacementRoot.setEnabled(false);
    replacementRoot.setParent(snapshot.parent);
    this.applyModelPackageReplacementEditorMetadata(replacementRoot, snapshot);
    this.restoreModelPackageEditableState(replacementRoot, snapshot.editableState);
    return replacementRoot;
  }

  /** 把旧根节点 editor metadata 合并到新模型根，保留资产编号、锁定等编辑器状态。 */
  private applyModelPackageReplacementEditorMetadata(
    root: TransformNode,
    snapshot: ModelPackageInstanceReplacementSnapshot
  ): void {
    const metadata = this.asMetadataObject(root.metadata);
    const runtimeMetadata = { ...this.asMetadataObject(snapshot.editorMetadata.modelPackageRuntime) };
    this.clearOpaqueRollerConveyorRuntimeMetadata(runtimeMetadata);
    this.clearOpaqueChainConveyorRuntimeMetadata(runtimeMetadata);
    root.metadata = {
      ...metadata,
      [ROOT_FLAG]: true,
      editor: {
        ...snapshot.editorMetadata,
        modelPackageInstance: {
          ...snapshot.editableState.modelPackageInstance,
          values: this.cloneDynamicParameterValues(snapshot.editableState.values)
        },
        modelPackageRuntime: {
          ...runtimeMetadata,
          warning: ""
        }
      }
    };
  }

  /** 生成替换实例的参数值：保留同名兼容字段，新字段走默认值，旧字段被丢弃。 */
  private getModelPackageReplacementValues(root: TransformNode, manifest: ModelPackageManifest): Record<string, DynamicParameterValue> {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    return {
      ...this.createInitialDynamicParameterValues(manifest),
      ...this.normalizeDynamicParameterValueMap(this.asMetadataObject(instance.values), manifest.dynamicFields, false)
    };
  }

  /** 从工具栏导入 DXF CAD 图纸，Worker 会把图纸源单位统一换算成米制二进制线段 chunk。 */
  public async importCadDrawing(file: File, options: CadDrawingImportOptions = {}): Promise<CadLineImportSummary> {
    const extension = this.getFileExtension(file.name);
    if (extension === ".dwg") {
      throw new Error("当前 CAD 导入支持 DXF 文本图纸；DWG 请先转换为 DXF 后再导入。");
    }

    if (extension !== ".dxf") {
      throw new Error("请选择 .dxf 格式的 CAD 图纸。");
    }

    this.recordSceneUndoSnapshot("导入 CAD 图纸");
    const root = this.createCadDrawingRoot(file.name, options.sourcePath);
    try {
      const chunkManifests: CadLineChunkManifest[] = [];
      const persistTasks: Array<Promise<void>> = [];
      let renderedChunks = 0;
      let renderedSegments = 0;
      let persistedChunks = 0;
      let activePersistTasks = 0;
      let lastRenderProgressAt = 0;
      let persistProgressEnabled = false;
      let persistProgressSummary: CadLineImportSummary | null = null;
      let persistCancelled = false;
      const pendingPersistRuns: Array<{ run: () => void; reject: (reason?: unknown) => void }> = [];
      let currentPackIndex = 0;
      let currentPackBuffers: ArrayBuffer[] = [];
      let currentPackByteLength = 0;
      let currentPackManifests: CadLineChunkManifest[] = [];
      const reportPersistProgress = () => {
        if (!persistProgressEnabled || !persistProgressSummary) {
          return;
        }

        options.onProgress?.({
          phase: "persisting",
          parsedEntities: persistProgressSummary.entityCount,
          emittedSegments: persistProgressSummary.segmentCount,
          totalEntities: persistProgressSummary.entityCount,
          totalSegments: persistProgressSummary.segmentCount,
          chunkCount: persistProgressSummary.chunkCount,
          persistedChunks,
          message: "正在保存 CAD 线段分块"
        });
      };
      const cancelPendingPersistTasks = (reason: unknown) => {
        persistCancelled = true;
        const pendingRuns = pendingPersistRuns.splice(0);
        pendingRuns.forEach((pending) => pending.reject(reason));
      };
      const enqueuePersistPack = (fileName: string, buffers: ArrayBuffer[], byteLength: number, manifests: CadLineChunkManifest[]) => {
        if (!options.persistLineChunk) {
          return;
        }

        if (persistCancelled) {
          throw new Error("CAD 线段分块保存已失败，导入已停止。");
        }

        const packData = new Uint8Array(byteLength);
        let offset = 0;
        buffers.forEach((buffer) => {
          packData.set(new Uint8Array(buffer), offset);
          offset += buffer.byteLength;
        });

        const persistTask = new Promise<void>((resolve, reject) => {
          // 大型 CAD 使用 pack 侧车并限制 IPC 写入并发，避免上千个小文件和无上限缓冲堆积。
          const run = () => {
            if (persistCancelled) {
              reject(new Error("CAD 线段分块保存已取消。"));
              return;
            }

            activePersistTasks += 1;
            Promise.resolve()
              .then(() => options.persistLineChunk!(fileName, packData.buffer))
              .then((projectFile) => {
                manifests.forEach((manifest) => {
                  manifest.packProjectFile = projectFile;
                });
                persistedChunks += manifests.length;
                reportPersistProgress();
                resolve();
              }, (error) => {
                cancelPendingPersistTasks(error);
                reject(error);
              })
              .finally(() => {
                activePersistTasks -= 1;
                if (!persistCancelled) {
                  pendingPersistRuns.shift()?.run();
                }
              });
          };

          if (activePersistTasks < CAD_LINE_CHUNK_PERSIST_CONCURRENCY) {
            run();
          } else {
            pendingPersistRuns.push({ run, reject });
          }
        });
        persistTasks.push(persistTask);
      };
      const flushCurrentPack = () => {
        if (!options.persistLineChunk || currentPackBuffers.length === 0) {
          return;
        }

        const fileName = `cad-lines-pack-${currentPackIndex}.cadlines.pack.bin`;
        enqueuePersistPack(fileName, currentPackBuffers, currentPackByteLength, currentPackManifests);
        currentPackIndex += 1;
        currentPackBuffers = [];
        currentPackByteLength = 0;
        currentPackManifests = [];
      };
      const appendChunkToPack = (buffer: ArrayBuffer, manifest: CadLineChunkManifest) => {
        if (!options.persistLineChunk) {
          return;
        }

        if (currentPackByteLength > 0 && currentPackByteLength + buffer.byteLength > CAD_LINE_PACK_MAX_BYTES) {
          flushCurrentPack();
        }

        const packFile = `cad-lines-pack-${currentPackIndex}.cadlines.pack.bin`;
        manifest.packFile = packFile;
        manifest.byteOffset = currentPackByteLength;
        manifest.byteLength = buffer.byteLength;
        currentPackBuffers.push(buffer);
        currentPackByteLength += buffer.byteLength;
        currentPackManifests.push(manifest);
        currentPackManifests.forEach((item) => {
          item.packByteLength = currentPackByteLength;
        });
      };
      const text = await this.readCadDrawingTextWithProgress(file, options.onProgress);
      const summary = await this.parseCadDrawingWithWorker(file.name, text, {
        sourcePath: options.sourcePath,
        projectMode: Boolean(options.persistLineChunk),
        onProgress: options.onProgress,
        onChunk: (chunk) => {
          const mesh = this.createCadLineChunkMesh(root, chunk.chunkId, chunk.style, chunk.segmentCount, new Float32Array(chunk.positionsBuffer));
          renderedChunks += 1;
          renderedSegments += chunk.segmentCount;
          const now = typeof performance === "undefined" ? Date.now() : performance.now();
          if (renderedChunks === 1 || now - lastRenderProgressAt >= 500) {
            lastRenderProgressAt = now;
            options.onProgress?.({
              phase: "rendering",
              parsedEntities: 0,
              emittedSegments: renderedSegments,
              chunkCount: renderedChunks,
              message: "正在创建 CAD 线段网格"
            });
          }
          mesh.doNotSerialize = Boolean(options.persistLineChunk);
          const fileName = `${chunk.chunkId}.cadlines.bin`;
          const manifest: CadLineChunkManifest = {
            chunkId: chunk.chunkId,
            fileName,
            style: chunk.style,
            segmentCount: chunk.segmentCount,
            bounds: chunk.bounds
          };
          chunkManifests.push(manifest);
          if (options.persistLineChunk) {
            appendChunkToPack(chunk.positionsBuffer, manifest);
          }
        }
      });
      flushCurrentPack();
      if (persistTasks.length > 0) {
        persistProgressSummary = summary;
        persistProgressEnabled = true;
        reportPersistProgress();
      }
      await Promise.all(persistTasks);
      if (persistTasks.length > 0) {
        options.onProgress?.({
          phase: "persisting",
          parsedEntities: summary.entityCount,
          emittedSegments: summary.segmentCount,
          totalEntities: summary.entityCount,
          totalSegments: summary.segmentCount,
          chunkCount: summary.chunkCount,
          persistedChunks: summary.chunkCount,
          message: "CAD 线段分块保存完成"
        });
      }
      options.onProgress?.({
        phase: "done",
        parsedEntities: summary.entityCount,
        emittedSegments: summary.segmentCount,
        totalEntities: summary.entityCount,
        totalSegments: summary.segmentCount,
        chunkCount: summary.chunkCount,
        persistedChunks: persistTasks.length > 0 ? summary.chunkCount : undefined,
        message: "CAD 图纸导入完成"
      });
      this.applyCadDrawingSummaryMetadata(root, summary, file.name, options.sourcePath, chunkManifests);
      this.selectNode(root);
      this.frameCadDrawingInView(root);
      this.refreshSceneGraph();
      this.callbacks.onStatsChange(this.collectStats());
      this.scene.render();
      return summary;
    } catch (error) {
      this.disposeEditableNode(root);
      this.refreshSceneGraph();
      this.callbacks.onStatsChange(this.collectStats());
      this.scene.render();
      throw error;
    }
  }

  /** 用 FileReader 读取 DXF 文本并上报字节进度，无法监听进度时退回 File.text。 */
  private readCadDrawingTextWithProgress(file: File, onProgress?: (progress: CadDxfLineProgress) => void): Promise<string> {
    onProgress?.({
      phase: "reading",
      parsedEntities: 0,
      emittedSegments: 0,
      loadedBytes: 0,
      totalBytes: file.size,
      message: "正在读取 CAD 图纸文件"
    });

    if (typeof FileReader === "undefined") {
      return file.text().then((text) => {
        onProgress?.({
          phase: "reading",
          parsedEntities: 0,
          emittedSegments: 0,
          loadedBytes: file.size,
          totalBytes: file.size,
          message: "CAD 图纸文件读取完成"
        });
        return text;
      });
    }

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        onProgress?.({
          phase: "reading",
          parsedEntities: 0,
          emittedSegments: 0,
          loadedBytes: event.loaded,
          totalBytes: event.lengthComputable ? event.total : file.size,
          message: "正在读取 CAD 图纸文件"
        });
      };
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("CAD 图纸文件读取结果不是文本内容。"));
          return;
        }

        onProgress?.({
          phase: "reading",
          parsedEntities: 0,
          emittedSegments: 0,
          loadedBytes: file.size,
          totalBytes: file.size,
          message: "CAD 图纸文件读取完成"
        });
        resolve(reader.result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("CAD 图纸文件读取失败。"));
      reader.onabort = () => reject(new Error("CAD 图纸文件读取已取消。"));
      reader.readAsText(file);
    });
  }

  /** 创建 CAD 根节点，真实 bounds/单位会在 Worker 完成后回填。 */
  private createCadDrawingRoot(sourceFile: string, sourcePath: string | undefined): TransformNode {
    const root = new TransformNode(`CAD 图纸 - ${sourceFile.replace(/\.[^.]+$/, "")}`, this.scene);
    root.metadata = {
      ...this.withMetricModelMetadata(
        {
          cadDrawing: true,
          cad: {
            format: "DXF",
            sourceFile,
            sourcePath,
            streaming: true
          }
        },
        {
          sourceFile,
          modelUnitPolicy: "cad-drawing-source-units-normalized-to-meters"
        }
      ),
      [ROOT_FLAG]: true
    };
    return root;
  }

  /** Worker 解析完成后回填 CAD 根节点 metadata，并写入侧车 chunk manifest。 */
  private applyCadDrawingSummaryMetadata(
    root: TransformNode,
    summary: CadLineImportSummary,
    sourceFile: string,
    sourcePath: string | undefined,
    chunkManifests: CadLineChunkManifest[]
  ): void {
    root.name = `CAD 图纸 - ${summary.name}`;
    root.metadata = {
      ...this.withMetricModelMetadata(
        {
          ...this.asMetadataObject(root.metadata),
          cadDrawing: true,
          cad: {
            format: "DXF",
            sourceFile,
            sourcePath,
            sourceUnit: summary.unit.sourceUnit,
            unitScaleToMeters: summary.unit.unitScaleToMeters,
            unitInferenceMethod: summary.unit.inferenceMethod,
            unitInferenceConfidence: summary.unit.confidence,
            insunitsCode: summary.unit.insunitsCode,
            measurementCode: summary.unit.measurementCode,
            bounds: summary.bounds,
            rawBounds: summary.rawBounds,
            layers: summary.layers,
            entityCount: summary.entityCount,
            segmentCount: summary.segmentCount,
            primitiveCounts: summary.primitiveCounts,
            warnings: summary.warnings,
            chunkCount: summary.chunkCount
          },
          editor: {
            ...this.asMetadataObject(this.asMetadataObject(root.metadata).editor),
            cadChunkManifest: {
              version: 1,
              sourceFile,
              sourcePath,
              bounds: summary.bounds,
              rawBounds: summary.rawBounds,
              unit: summary.unit,
              segmentCount: summary.segmentCount,
              chunkSegmentLimit: CAD_LINE_CHUNK_SEGMENTS,
              chunks: chunkManifests
            }
          }
        },
        {
          sourceFile,
          sourceUnit: summary.unit.sourceUnit,
          unitScaleToMeters: summary.unit.unitScaleToMeters,
          modelUnitPolicy: "cad-drawing-source-units-normalized-to-meters"
        }
      ),
      [ROOT_FLAG]: true
    };
  }

  /** 优先使用 Web Worker 后台解析 CAD，失败时回退到同线程流式解析以保持浏览器兼容。 */
  private parseCadDrawingWithWorker(
    fileName: string,
    text: string,
    options: {
      sourcePath?: string;
      projectMode: boolean;
      onProgress?: (progress: CadDxfLineProgress) => void;
      onChunk: (chunk: CadDxfWorkerChunkMessage) => void;
    }
  ): Promise<CadLineImportSummary> {
    if (typeof Worker === "undefined") {
      return Promise.resolve(this.parseCadDrawingInCurrentThread(fileName, text, options.onChunk, options.onProgress));
    }

    return new Promise<CadLineImportSummary>((resolve, reject) => {
      const worker = new Worker(new URL("../editor/cadDxf.worker.ts", import.meta.url), { type: "module" });
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        worker.terminate();
        callback();
      };

      worker.onmessage = (event: MessageEvent<CadDxfWorkerMessage>) => {
        try {
          const message = event.data;
          if (message.type === "chunk") {
            options.onChunk(message);
          } else if (message.type === "progress") {
            options.onProgress?.(message.progress);
          } else if (message.type === "done") {
            finish(() => resolve(message.summary));
          } else if (message.type === "error") {
            finish(() => reject(new Error(message.message)));
          }
        } catch (error) {
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          finish(() => reject(normalizedError));
        }
      };
      worker.onerror = (event) => {
        finish(() => reject(new Error(event.message || "CAD Worker 执行失败。")));
      };
      worker.postMessage({
        type: "start",
        fileName,
        text,
        sourcePath: options.sourcePath,
        projectMode: options.projectMode
      } satisfies CadDxfWorkerStartMessage);
    });
  }

  /** Worker 不可用时的同步兜底，仍然使用二进制 chunk sink，避免回到 primitive 数组路径。 */
  private parseCadDrawingInCurrentThread(
    fileName: string,
    text: string,
    onChunk: (chunk: CadDxfWorkerChunkMessage) => void,
    onProgress?: (progress: CadDxfLineProgress) => void
  ): CadLineImportSummary {
    return parseCadDxfLineStream(fileName, text, {
      emitChunk: (chunk) => {
        const positionsBuffer = chunk.positions.buffer.slice(0) as ArrayBuffer;
        onChunk({
          type: "chunk",
          chunkId: chunk.chunkId,
          style: chunk.style,
          segmentCount: chunk.segmentCount,
          positionsBuffer,
          bounds: chunk.bounds
        });
      },
      reportProgress: onProgress
    });
  }

  /** 直接从二进制 CAD 线段 chunk 创建 LinesMesh，不经过 Vector3/Color4 对象数组。 */
  private createCadLineChunkMesh(
    root: TransformNode,
    chunkId: string,
    style: CadDxfLineChunkStyle,
    segmentCount: number,
    positions: Float32Array
  ): LinesMesh {
    const finalAlpha = this.getCadDisplayAlpha(root, style.alpha);
    const mesh = new LinesMesh(`${root.name} / ${style.layer} / ${style.color} / ${chunkId}`, this.scene, null, null, undefined, false, finalAlpha < 1);
    const indices = this.createCadLineChunkIndices(segmentCount);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh, false);
    mesh.parent = root;
    mesh.position.y = CAD_LINE_ELEVATION_METERS;
    mesh.color = Color3.FromHexString(style.color);
    mesh.alpha = finalAlpha;
    mesh.isPickable = true;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.metadata = {
      cadPrimitive: "polyline",
      cadLayer: style.layer,
      cadColor: style.color,
      cadAlpha: style.alpha,
      cadEntityType: style.entityType,
      cadChunkId: chunkId
    };
    return mesh;
  }

  /** 生成顺序线段索引，chunk 上限保持在 Uint16 可表达范围内。 */
  private createCadLineChunkIndices(segmentCount: number): Uint16Array {
    const indices = new Uint16Array(segmentCount * 2);
    for (let index = 0; index < indices.length; index += 1) {
      indices[index] = index;
    }
    return indices;
  }

  /** 按图层、颜色和透明度归并点标记，点也走 LineSystem 分块以减少 mesh 数量。 */
  private groupCadPointsByStyle(points: CadDxfPointPrimitive[]): Map<string, CadDxfPointPrimitive[]> {
    const grouped = new Map<string, CadDxfPointPrimitive[]>();
    points.forEach((point) => {
      const key = this.getCadPrimitiveStyleKey(point);
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.push(point);
      } else {
        grouped.set(key, [point]);
      }
    });
    return grouped;
  }

  /** 流式创建 CAD 线段 mesh，避免先按样式复制完整 polyline 引用数组导致内存峰值叠加。 */
  private createCadLineSystemsFromPrimitives(
    root: TransformNode,
    bounds: CadDxfBounds,
    primitives: CadDxfPrimitive[]
  ): void {
    const builders = new Map<string, CadLineChunkBuilder>();
    primitives.forEach((primitive) => {
      if (primitive.type !== "polyline") {
        return;
      }

      const key = this.getCadPrimitiveStyleKey(primitive);
      let builder = builders.get(key);
      if (!builder) {
        builder = this.createCadLineChunkBuilder(primitive);
        builders.set(key, builder);
      }
      this.pushCadPolylineToChunkBuilder(root, bounds, builder, primitive);
    });
    builders.forEach((builder) => this.flushCadLineChunk(root, builder, false));
  }

  /** 创建某一 CAD 样式的 typed-array 分块写入器。 */
  private createCadLineChunkBuilder(polyline: CadDxfPolyline): CadLineChunkBuilder {
    return {
      layer: polyline.layer,
      colorHex: polyline.color,
      alpha: polyline.alpha,
      color: Color3.FromHexString(polyline.color),
      positions: new Float32Array(CAD_LINE_CHUNK_SEGMENTS * 2 * 3),
      indices: new Uint16Array(CAD_LINE_CHUNK_SEGMENTS * 2),
      positionOffset: 0,
      indexOffset: 0,
      vertexIndex: 0,
      segmentCount: 0,
      chunkIndex: 1
    };
  }

  /** 将一条 CAD 折线写入对应样式的分块缓冲，disjoint 折线按点对解释为离散线段。 */
  private pushCadPolylineToChunkBuilder(
    root: TransformNode,
    bounds: CadDxfBounds,
    builder: CadLineChunkBuilder,
    polyline: CadDxfPolyline
  ): void {
    const step = polyline.disjoint ? 2 : 1;
    for (let index = 0; index + 1 < polyline.points.length; index += step) {
      this.pushCadLineSegmentToChunkBuilder(root, bounds, builder, polyline.points[index], polyline.points[index + 1]);
    }
  }

  /** 写入单条 CAD 线段，满块时立即生成 mesh 并复用新的 typed array 继续写。 */
  private pushCadLineSegmentToChunkBuilder(
    root: TransformNode,
    bounds: CadDxfBounds,
    builder: CadLineChunkBuilder,
    start: CadDxfPolyline["points"][number],
    end: CadDxfPolyline["points"][number]
  ): void {
    if (builder.segmentCount >= CAD_LINE_CHUNK_SEGMENTS) {
      this.flushCadLineChunk(root, builder, true);
    }

    if (start.x === end.x && start.y === end.y) {
      return;
    }

    builder.positions[builder.positionOffset] = start.x - bounds.centerX;
    builder.positions[builder.positionOffset + 1] = CAD_LINE_ELEVATION_METERS;
    builder.positions[builder.positionOffset + 2] = -(start.y - bounds.centerY);
    builder.positions[builder.positionOffset + 3] = end.x - bounds.centerX;
    builder.positions[builder.positionOffset + 4] = CAD_LINE_ELEVATION_METERS;
    builder.positions[builder.positionOffset + 5] = -(end.y - bounds.centerY);
    builder.indices[builder.indexOffset] = builder.vertexIndex;
    builder.indices[builder.indexOffset + 1] = builder.vertexIndex + 1;
    builder.positionOffset += 6;
    builder.indexOffset += 2;
    builder.vertexIndex += 2;
    builder.segmentCount += 1;

    if (builder.segmentCount >= CAD_LINE_CHUNK_SEGMENTS) {
      this.flushCadLineChunk(root, builder, true);
    }
  }

  /** 将当前 CAD 线段块提交为 LinesMesh，并清空写入器等待下一块数据。 */
  private flushCadLineChunk(root: TransformNode, builder: CadLineChunkBuilder, keepBuffer = true): void {
    if (builder.segmentCount === 0) {
      if (!keepBuffer) {
        builder.positions = new Float32Array(0);
        builder.indices = new Uint16Array(0);
      }
      return;
    }

    const lineSystem = new LinesMesh(
      `${root.name} / ${builder.layer} / ${builder.colorHex} #${builder.chunkIndex}`,
      this.scene,
      null,
      null,
      undefined,
      false,
      builder.alpha < 1
    );
    const vertexData = new VertexData();
    const isFullChunk = builder.segmentCount === CAD_LINE_CHUNK_SEGMENTS;
    vertexData.positions = isFullChunk ? builder.positions : builder.positions.slice(0, builder.positionOffset);
    vertexData.indices = isFullChunk ? builder.indices : builder.indices.slice(0, builder.indexOffset);
    vertexData.applyToMesh(lineSystem, false);
    lineSystem.parent = root;
    lineSystem.color = builder.color.clone();
    lineSystem.alpha = builder.alpha;
    lineSystem.isPickable = true;
    lineSystem.alwaysSelectAsActiveMesh = true;
    lineSystem.metadata = { cadPrimitive: "polyline", cadLayer: builder.layer, cadColor: builder.colorHex, cadAlpha: builder.alpha };
    builder.positions = keepBuffer ? new Float32Array(CAD_LINE_CHUNK_SEGMENTS * 2 * 3) : new Float32Array(0);
    builder.indices = keepBuffer ? new Uint16Array(CAD_LINE_CHUNK_SEGMENTS * 2) : new Uint16Array(0);
    builder.positionOffset = 0;
    builder.indexOffset = 0;
    builder.vertexIndex = 0;
    builder.segmentCount = 0;
    builder.chunkIndex += 1;
  }

  /** 为 CAD 点 primitive 创建十字线标记。 */
  private createCadPointLineSystems(root: TransformNode, bounds: CadDxfBounds, points: CadDxfPointPrimitive[]): void {
    const first = points[0];
    if (!first) {
      return;
    }

    const color = this.cadPrimitiveColor4(first);
    const lines: Vector3[][] = [];
    const colors: Color4[][] = [];
    points.forEach((primitive) => {
      const center = this.toCadGroundPoint(primitive.point, bounds, CAD_LINE_ELEVATION_METERS);
      const size = Math.max(CAD_POINT_MARKER_SIZE_METERS, primitive.size);
      lines.push([new Vector3(center.x - size / 2, center.y, center.z), new Vector3(center.x + size / 2, center.y, center.z)]);
      lines.push([new Vector3(center.x, center.y, center.z - size / 2), new Vector3(center.x, center.y, center.z + size / 2)]);
      colors.push([color.clone(), color.clone()]);
      colors.push([color.clone(), color.clone()]);
    });

    const markerSystem = MeshBuilder.CreateLineSystem(
      `${root.name} / ${first.layer} / 点标记`,
      { lines, colors, useVertexAlpha: true },
      this.scene
    );
    markerSystem.parent = root;
    markerSystem.isPickable = true;
    markerSystem.alwaysSelectAsActiveMesh = true;
    markerSystem.metadata = { cadPrimitive: "point", cadLayer: first.layer, cadColor: first.color, cadAlpha: first.alpha };
  }

  /** 为 CAD IMAGE primitive 创建真实四角贴图，尽量还原扫描底图或外部栅格参照。 */
  private async createCadImageMesh(
    root: TransformNode,
    bounds: CadDxfBounds,
    image: CadDxfImagePrimitive,
    index: number,
    context: CadImageRenderContext
  ): Promise<string | null> {
    if (this.isIgnoredCadImageReference(image.sourcePath)) {
      return null;
    }

    const source = await this.resolveCadImageSource(image, context);
    if (!source) {
      return `IMAGE 图片文件 ${image.sourcePath ?? image.imageDefHandle ?? "(未命名)"} 未随 DXF 提供或无法从本地路径读取，已保留图片范围用于取景。`;
    }

    const mesh = new Mesh(`${root.name} / ${image.layer} / 图片 #${index}`, this.scene);
    const corners = image.corners.map((point) => this.toCadGroundPoint(point, bounds, CAD_IMAGE_ELEVATION_METERS));
    const vertexData = new VertexData();
    vertexData.positions = corners.flatMap((point) => [point.x, point.y, point.z]);
    vertexData.indices = [0, 1, 2, 0, 2, 3];
    vertexData.normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    vertexData.uvs = [0, 1, 1, 1, 1, 0, 0, 0];
    vertexData.applyToMesh(mesh);

    const material = this.createCadImageMaterial(`${root.name} / ${image.layer} / 图片材质 #${index}`, source);

    mesh.parent = root;
    mesh.isPickable = true;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.material = material;
    mesh.metadata = {
      cadPrimitive: "image",
      cadLayer: image.layer,
      cadEntityType: image.entityType,
      cadImage: {
        sourcePath: image.sourcePath,
        resolvedFileName: source.fileName,
        source: source.source,
        imageDefHandle: image.imageDefHandle,
        pixelWidth: image.pixelWidth,
        pixelHeight: image.pixelHeight
      }
    };
    return null;
  }

  /** 创建 CAD 图片自发光材质，导入和保存恢复共用同一套贴图参数。 */
  private createCadImageMaterial(name: string, source: CadResolvedImageSource): StandardMaterial {
    const texture = new Texture(
      source.url,
      this.scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => source.revoke(),
      () => source.revoke()
    );
    texture.hasAlpha = true;

    const material = new StandardMaterial(name, this.scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.metadata = { cadImageMaterial: true };
    return material;
  }

  /** 解析 CAD IMAGE 的图片来源：先匹配同批 File，再走 Electron 受控本地读取。 */
  private async resolveCadImageSource(image: CadDxfImagePrimitive, context: CadImageRenderContext): Promise<CadResolvedImageSource | null> {
    if (!image.sourcePath || this.isIgnoredCadImageReference(image.sourcePath)) {
      return null;
    }

    const batchFile = this.findCadImageRelatedFile(image.sourcePath, context.relatedFiles);
    if (batchFile) {
      const url = URL.createObjectURL(batchFile);
      context.objectUrls.push(url);
      return {
        url,
        fileName: batchFile.name,
        source: "batch",
        revoke: () => this.revokeCadImageObjectUrl(context, url)
      };
    }

    if (!context.sourcePath || !window.electronApp?.files?.readLocalReference) {
      return null;
    }

    try {
      const payload = await window.electronApp.files.readLocalReference(context.sourcePath, image.sourcePath);
      if (!payload) {
        return null;
      }
      const blob = new Blob([payload.data], { type: payload.mimeType || this.getImageMimeType(payload.fileName) });
      const url = URL.createObjectURL(blob);
      context.objectUrls.push(url);
      return {
        url,
        fileName: payload.fileName,
        source: "local",
        revoke: () => this.revokeCadImageObjectUrl(context, url)
      };
    } catch (error) {
      console.warn("CAD IMAGE 外部图片读取失败。", error);
      return null;
    }
  }

  /** 从同批导入文件中按路径尾段或文件名匹配 CAD IMAGE 引用。 */
  private findCadImageRelatedFile(sourcePath: string, files: File[]): File | null {
    if (this.isIgnoredCadImageReference(sourcePath)) {
      return null;
    }

    const normalizedSource = this.normalizeCadReferencePath(sourcePath);
    const sourceName = normalizedSource.split("/").pop() ?? normalizedSource;
    return (
      files.find((file) => {
        if (!this.isTextureFile(this.getFileExtension(file.name))) {
          return false;
        }
        const relativePath = this.normalizeCadReferencePath(file.webkitRelativePath || file.name);
        return relativePath === normalizedSource || relativePath.endsWith(`/${normalizedSource}`) || file.name.toLowerCase() === sourceName;
      }) ?? null
    );
  }

  /** 统一 CAD 外部参照路径分隔符和大小写，便于跨 Windows/Linux DXF 匹配。 */
  private normalizeCadReferencePath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\.\/+/, "").trim().toLowerCase();
  }

  /** 根据图片文件扩展名给 Blob 补 MIME，避免部分本地文件加载失败。 */
  private getImageMimeType(fileName: string): string {
    const extension = this.getFileExtension(fileName);
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

  /** 判断 CAD 外部图片参照是否按产品要求忽略，当前 BMP 不参与导入和提示。 */
  private isIgnoredCadImageReference(sourcePath: string | undefined): boolean {
    return IGNORED_CAD_IMAGE_EXTENSIONS.has(this.getFileExtension(sourcePath ?? ""));
  }

  /** 释放 CAD 图片临时 URL，避免重复导入大图后泄漏内存。 */
  private revokeCadImageObjectUrl(context: CadImageRenderContext, url: string): void {
    URL.revokeObjectURL(url);
    const index = context.objectUrls.indexOf(url);
    if (index >= 0) {
      context.objectUrls.splice(index, 1);
    }
  }

  /** 为 CAD 填充 primitive 创建贴地 polygon mesh，复杂面失败时保留解析器生成的边界线。 */
  private createCadFillMesh(root: TransformNode, bounds: CadDxfBounds, fill: CadDxfFill, index: number): void {
    const rings = fill.rings.map((ring) => ring.map((point) => this.toCadGroundPoint(point, bounds, CAD_FILL_ELEVATION_METERS)));
    this.splitCadFillRings(rings).forEach((polygon, polygonIndex) => {
      let mesh: Mesh;
      try {
        mesh = CreatePolygon(
          `${root.name} / ${fill.layer} / 填充 #${index}.${polygonIndex + 1}`,
          { shape: polygon.shape, holes: polygon.holes, sideOrientation: Mesh.DOUBLESIDE },
          this.scene,
          earcut
        );
      } catch (error) {
        console.warn("CAD HATCH 填充三角化失败，已保留边界线。", error);
        return;
      }

      mesh.parent = root;
      mesh.position.y = CAD_FILL_ELEVATION_METERS;
      mesh.isPickable = true;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.material = this.createCadColorMaterial(`CAD 填充材质 ${fill.layer} ${fill.color} ${fill.alpha}`, fill.color, fill.alpha);
      mesh.metadata = {
        cadPrimitive: "fill",
        cadLayer: fill.layer,
        cadColor: fill.color,
        cadAlpha: fill.alpha,
        cadEntityType: fill.entityType
      };
    });
  }

  /** 为 WIPEOUT 创建遮罩面；在缺少完整 draw-order 时只遮图片/填充，不压住主体矢量线。 */
  private createCadWipeoutMesh(root: TransformNode, bounds: CadDxfBounds, wipeout: CadDxfWipeoutPrimitive, index: number): void {
    const ring = wipeout.ring.map((point) => this.toCadGroundPoint(point, bounds, 0));
    const shape = this.normalizeCadFillRing(ring);
    if (shape.length < 3 || Math.abs(this.getCadFillRingArea(shape)) <= 1e-10) {
      return;
    }

    let mesh: Mesh;
    try {
      mesh = CreatePolygon(
        `${root.name} / ${wipeout.layer} / WIPEOUT #${index}`,
        { shape, sideOrientation: Mesh.DOUBLESIDE },
        this.scene,
        earcut
      );
    } catch (error) {
      console.warn("CAD WIPEOUT 遮罩三角化失败，已跳过该遮罩。", error);
      return;
    }

    mesh.parent = root;
    mesh.position.y = CAD_WIPEOUT_ELEVATION_METERS;
    mesh.isPickable = true;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.material = this.createCadColorMaterial(
      `CAD WIPEOUT 遮罩材质 ${wipeout.layer}`,
      this.color4ToHex(this.scene.clearColor, DEFAULT_SCENE_ENVIRONMENT_COLOR),
      1
    );
    mesh.metadata = {
      cadPrimitive: "wipeout",
      cadLayer: wipeout.layer,
      cadColor: wipeout.color,
      cadAlpha: wipeout.alpha,
      cadEntityType: wipeout.entityType
    };
  }

  /** 将 HATCH/SOLID 的多个闭合环拆成外轮廓和孔洞，避免多个填充岛只渲染第一个。 */
  private splitCadFillRings(rings: Vector3[][]): Array<{ shape: Vector3[]; holes: Vector3[][] }> {
    const normalized = rings
      .map((ring) => this.normalizeCadFillRing(ring))
      .filter((ring) => ring.length >= 3)
      .map((ring) => ({ ring, area: Math.abs(this.getCadFillRingArea(ring)) }))
      .filter((entry) => entry.area > 1e-10)
      .sort((left, right) => right.area - left.area);
    const groups: Array<{ shape: Vector3[]; holes: Vector3[][]; area: number }> = [];

    normalized.forEach((entry) => {
      const samplePoint = this.getCadFillRingCentroid(entry.ring);
      const containerCount = normalized.filter((candidate) => candidate.area > entry.area && this.isPointInsideCadFillRing(samplePoint, candidate.ring)).length;
      if (containerCount % 2 === 1) {
        const parent = groups
          .filter((group) => this.isPointInsideCadFillRing(samplePoint, group.shape))
          .sort((left, right) => left.area - right.area)[0];
        if (parent) {
          parent.holes.push(entry.ring);
          return;
        }
      }

      groups.push({ shape: entry.ring, holes: [], area: entry.area });
    });

    return groups.map(({ shape, holes }) => ({ shape, holes }));
  }

  /** 去掉闭合环尾部重复点，Babylon polygon builder 会自行处理闭合。 */
  private normalizeCadFillRing(ring: Vector3[]): Vector3[] {
    if (ring.length < 2) {
      return ring;
    }

    const first = ring[0];
    const last = ring[ring.length - 1];
    return first.equalsWithEpsilon(last, 1e-7) ? ring.slice(0, -1) : ring.slice();
  }

  /** 计算 XZ 平面多边形面积，用于区分外轮廓和孔洞。 */
  private getCadFillRingArea(ring: Vector3[]): number {
    return ring.reduce((area, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return area + point.x * next.z - next.x * point.z;
    }, 0) / 2;
  }

  /** 计算填充环的中心采样点，供包含关系判断使用。 */
  private getCadFillRingCentroid(ring: Vector3[]): Vector3 {
    const total = ring.reduce((sum, point) => sum.add(point), Vector3.Zero());
    return total.scale(1 / Math.max(1, ring.length));
  }

  /** 在 XZ 平面判断点是否位于闭合环内部。 */
  private isPointInsideCadFillRing(point: Vector3, ring: Vector3[]): boolean {
    let inside = false;
    for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
      const current = ring[index];
      const previous = ring[previousIndex];
      const intersects =
        current.z > point.z !== previous.z > point.z &&
        point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || Number.EPSILON) + current.x;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  /** 为 CAD 文字 primitive 创建贴地 DynamicTexture 平面，支持中文标注。 */
  private createCadTextMesh(root: TransformNode, bounds: CadDxfBounds, text: CadDxfText, index: number): void {
    const textLines = text.text.split(/\r?\n/).filter(Boolean);
    const lineCount = Math.max(1, textLines.length);
    const width = Math.max(text.height, text.width ?? Math.max(text.height, text.text.length * text.height * text.widthFactor * 0.62));
    const height = Math.max(text.height, text.height * lineCount * 1.25);
    const material = this.createCadTextMaterial(
      `${root.name} / ${text.layer} / 文字材质 #${index}`,
      `${root.name} / ${text.layer} / 文字纹理 #${index}`,
      text
    );

    const plane = MeshBuilder.CreatePlane(`${root.name} / ${text.layer} / 文字 #${index}`, { width, height }, this.scene);
    plane.parent = root;
    plane.position = this.toCadGroundPoint(text.position, bounds, CAD_TEXT_ELEVATION_METERS);
    plane.rotation.x = Math.PI / 2;
    plane.rotation.y = (-text.rotationDegrees * Math.PI) / 180;
    plane.isPickable = true;
    plane.alwaysSelectAsActiveMesh = true;
    plane.material = material;
    plane.metadata = {
      cadPrimitive: "text",
      cadLayer: text.layer,
      cadColor: text.color,
      cadAlpha: text.alpha,
      cadEntityType: text.entityType,
      cadText: text
    };
  }

  /** 创建 CAD 文字材质，保存场景后可根据 cadText metadata 重新绘制 DynamicTexture。 */
  private createCadTextMaterial(materialName: string, textureName: string, text: CadDxfText): StandardMaterial {
    const texture = this.createCadTextTexture(textureName, text);
    const material = new StandardMaterial(materialName, this.scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.emissiveColor = Color3.FromHexString(text.color);
    material.alpha = text.alpha;
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;
    material.metadata = { cadTextMaterial: true };
    return material;
  }

  /** 把 CAD 文字内容绘制到动态纹理，保留中文字体和 MTEXT 多行。 */
  private createCadTextTexture(textureName: string, text: CadDxfText): DynamicTexture {
    const textLines = text.text.split(/\r?\n/).filter(Boolean);
    const lineCount = Math.max(1, textLines.length);
    const width = Math.max(text.height, text.width ?? Math.max(text.height, text.text.length * text.height * text.widthFactor * 0.62));
    const textureWidth = Math.min(CAD_TEXT_TEXTURE_MAX_SIZE, Math.max(128, Math.ceil(width / Math.max(text.height, 0.001) * 96)));
    const textureHeight = Math.min(CAD_TEXT_TEXTURE_MAX_SIZE, Math.max(64, Math.ceil(lineCount * 96)));
    const texture = new DynamicTexture(textureName, { width: textureWidth, height: textureHeight }, this.scene, true);
    texture.hasAlpha = true;
    const context = texture.getContext() as CanvasRenderingContext2D;
    context.clearRect(0, 0, textureWidth, textureHeight);
    context.font = `bold ${Math.floor(textureHeight / (lineCount * 1.25))}px Microsoft YaHei, SimHei, Arial`;
    context.fillStyle = text.color;
    context.textBaseline = "top";
    context.textAlign = text.align === "center" ? "center" : text.align === "right" ? "right" : "left";
    const x = text.align === "center" ? textureWidth / 2 : text.align === "right" ? textureWidth : 0;
    textLines.forEach((line, lineIndex) => context.fillText(line, x, lineIndex * (textureHeight / lineCount)));
    texture.update();
    return texture;
  }

  /** 将已换算为米的 CAD XY 平面映射到 Babylon XZ 网格，整张图纸居中到世界原点。 */
  private toCadGroundPoint(point: { x: number; y: number }, bounds: CadDxfBounds, elevation = CAD_LINE_ELEVATION_METERS): Vector3 {
    return new Vector3(point.x - bounds.centerX, elevation, -(point.y - bounds.centerY));
  }

  /** 创建 CAD 纯色自发光材质，尽量贴近黑底 CAD 查看器的可读性。 */
  private createCadColorMaterial(name: string, colorHex: string, alpha: number): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    const color = Color3.FromHexString(colorHex);
    material.diffuseColor = color;
    material.emissiveColor = color.scale(0.75);
    material.alpha = alpha;
    material.disableLighting = true;
    material.backFaceCulling = false;
    return material;
  }

  /** 将 CAD primitive 颜色转成 LineSystem 顶点色。 */
  private cadPrimitiveColor4(primitive: Pick<CadDxfPrimitive, "color" | "alpha">): Color4 {
    const color = Color3.FromHexString(primitive.color);
    return new Color4(color.r, color.g, color.b, primitive.alpha);
  }

  /** 构造 CAD primitive 分组 key。 */
  private getCadPrimitiveStyleKey(primitive: Pick<CadDxfPrimitive, "layer" | "color" | "alpha">): string {
    return `${primitive.layer}\u0000${primitive.color}\u0000${primitive.alpha}`;
  }

  /** CAD 导入完成后执行专用取景，不改变普通模型拖入时的相机语义。 */
  private frameCadDrawingInView(root: TransformNode): void {
    this.refreshNodeWorldMatrices(root);
    const bounds = this.getNodeWorldBounds(root);
    if (!bounds) {
      this.ensureNodeGridCoverage(root);
      return;
    }

    this.frameBoundsInView(bounds);
  }

  /** 将当前场景序列化为 .babylon 文件并触发浏览器下载。 */
  public saveScene(): void {
    const serialized = this.serializeScene();
    const blob = new Blob([JSON.stringify(serialized, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scene.babylon";
    link.click();
    URL.revokeObjectURL(url);
  }

  /** 序列化当前编辑场景，供非项目模式 .babylon 下载保持自包含语义。 */
  public serializeScene(): unknown {
    if (this.previewMode) {
      this.exitPreviewMode();
    }

    const sceneInspector = this.createSceneInspectorSnapshot();
    this.sceneBusinessRuntime.stop(true);
    this.stopAllModelPackageRuntimes(true, { preserveParametricRootScaling: true });
    try {
      const serialized = SceneSerializer.Serialize(this.scene) as Record<string, unknown>;
      this.stripEditorRuntimeSerialization(serialized);
      serialized.metadata = this.withMetricSceneMetadata(serialized.metadata, {
        savedAt: new Date().toISOString(),
        assets: this.getSerializableAssets(),
        sceneEnvironment: { backgroundColor: this.getSceneEnvironmentColor() },
        sceneCamera: sceneInspector.camera,
        sceneEditorSettings: sceneInspector.editorSettings,
        sceneDataDriven: sceneInspector.dataDriven
      });
      return serialized;
    } finally {
      this.applyModelPackageRuntimeToScene("serialize");
      this.sceneBusinessRuntime.start();
    }
  }

  /** 序列化项目场景，贴图二进制写入项目侧车文件，场景 JSON 只保留轻量引用。 */
  public async serializeProjectScene(options: ProjectSceneSerializeOptions = {}): Promise<unknown> {
    if (!options.persistExternalTexture) {
      return this.serializeScene();
    }

    if (this.previewMode) {
      this.exitPreviewMode();
    }

    const sceneInspector = this.createSceneInspectorSnapshot();
    const previousSerializeBuffers = Texture.SerializeBuffers;
    const previousForceSerializeBuffers = Texture.ForceSerializeBuffers;
    this.sceneBusinessRuntime.stop(true);
    this.stopAllModelPackageRuntimes(true, { preserveParametricRootScaling: true });
    try {
      const externalTextures = await this.persistProjectExternalTextures(options.persistExternalTexture);
      Texture.SerializeBuffers = false;
      Texture.ForceSerializeBuffers = false;
      const serialized = SceneSerializer.Serialize(this.scene) as Record<string, unknown>;
      this.stripEditorRuntimeSerialization(serialized);
      this.applyProjectExternalTextureReferences(serialized, externalTextures);
      const strippedBase64Count = this.stripProjectSceneEmbeddedTexturePayloads(serialized);
      const projectExternalTextures = this.mergeProjectExternalTextureManifest(serialized, externalTextures);
      serialized.metadata = this.withMetricSceneMetadata(serialized.metadata, {
        savedAt: new Date().toISOString(),
        assets: this.getSerializableAssets(),
        sceneEnvironment: { backgroundColor: this.getSceneEnvironmentColor() },
        sceneCamera: sceneInspector.camera,
        sceneEditorSettings: sceneInspector.editorSettings,
        sceneDataDriven: sceneInspector.dataDriven,
        projectExternalTextures,
        projectTextureSerialization: {
          version: 1,
          serializeBuffers: false,
          strippedBase64Count
        }
      });
      return serialized;
    } finally {
      Texture.SerializeBuffers = previousSerializeBuffers;
      Texture.ForceSerializeBuffers = previousForceSerializeBuffers;
      this.applyModelPackageRuntimeToScene("serialize");
      this.sceneBusinessRuntime.start();
    }
  }

  /** 从项目场景文件恢复 Babylon 内容，并保留编辑器自己的相机、网格和交互辅助对象。 */
  public async loadSerializedScene(serializedScene: unknown, options: SerializedSceneLoadOptions = {}): Promise<void> {
    if (!this.isSerializedScene(serializedScene)) {
      return;
    }

    const cameraSnapshot = options.preserveEditorCamera ? this.captureEditorCameraSnapshot() : null;
    const assetFileCacheSnapshot = options.preserveAssetFileCache ? this.captureAssetFileCacheSnapshot() : null;
    this.cancelCadRestore();
    if (this.previewMode) {
      this.exitPreviewMode();
    }
    this.sceneBusinessRuntime.stop(true);

    const loadableScene = this.createLoadableSerializedScene(serializedScene);
    const projectTextureFileRegistration = await this.registerProjectExternalTextureFilesForLoad(loadableScene, options);
    const sceneUrl = this.createSerializedSceneUrl(loadableScene);
    const previousUseSerializedUrlIfAny = Texture.UseSerializedUrlIfAny;
    if (projectTextureFileRegistration.size > 0) {
      Texture.UseSerializedUrlIfAny = true;
    }
    try {
      try {
        // 先完整解析到资产容器，成功后再替换视口内容，避免坏场景把当前场景清空。
        const container = await LoadAssetContainerAsync(sceneUrl, this.scene, { pluginExtension: ".babylon" });
        this.clearEditableScene();
        container.addAllToScene();
        const backgroundColor = this.getSerializedSceneEnvironmentColor(loadableScene) ?? DEFAULT_SCENE_ENVIRONMENT_COLOR;
        this.applySceneEnvironmentColor(backgroundColor, false);
        this.scene.metadata = this.withMetricSceneMetadata(loadableScene.metadata, {
          sceneEnvironment: { backgroundColor }
        });
        const sceneInspector = this.createSceneInspectorSnapshot();
        this.applySceneCameraSettings(sceneInspector.camera);
        this.applySceneEditorSettings(sceneInspector.editorSettings);
      } finally {
        URL.revokeObjectURL(sceneUrl);
        Texture.UseSerializedUrlIfAny = previousUseSerializedUrlIfAny;
        this.restoreProjectExternalTextureFileRegistration(projectTextureFileRegistration);
      }
      this.scene.activeCamera = this.editorCamera;
      this.attachEditorCameraControl();
      if (cameraSnapshot) {
        this.restoreEditorCameraSnapshot(cameraSnapshot);
      }
      await this.prepareLoadedScene(loadableScene, options);
      if (assetFileCacheSnapshot) {
        this.restoreAssetFileCacheSnapshot(assetFileCacheSnapshot);
      }
      const selectedNode = this.selectFirstEditableNode();
      if (!cameraSnapshot) {
        this.frameEditableSceneInView(selectedNode);
      }
      this.refreshSceneGraph();
      this.callbacks.onStatsChange(this.collectStats());
      if (options.resetUndoHistory !== false) {
        this.clearSceneUndoHistory();
      }
    } finally {
      this.sceneBusinessRuntime.start();
    }
  }

  /** 将序列化场景包装为 Blob URL，避免 data URL 被 #、中文或贴图地址截断。 */
  private createSerializedSceneUrl(serializedScene: Record<string, unknown>): string {
    const sceneBlob = new Blob([JSON.stringify(serializedScene)], { type: "application/json" });
    return URL.createObjectURL(sceneBlob);
  }

  /** 复制并清洗项目场景，兼容旧版本保存下来的编辑器运行时数据。 */
  private createLoadableSerializedScene(serializedScene: Record<string, unknown>): Record<string, unknown> {
    const loadableScene = JSON.parse(JSON.stringify(serializedScene)) as Record<string, unknown>;
    this.stripEditorRuntimeSerialization(loadableScene);
    return loadableScene;
  }

  /** 捕获当前资产源文件和依赖文件缓存，撤销重载后只恢复仍存在于快照资产列表中的条目。 */
  private captureAssetFileCacheSnapshot(): AssetFileCacheSnapshot {
    return {
      assetFiles: new Map(this.assetFiles),
      assetDependencyFiles: new Map([...this.assetDependencyFiles.entries()].map(([assetId, files]) => [assetId, [...files]]))
    };
  }

  /** 撤销重载场景后按资产 ID 恢复文件缓存，避免一次撤销让资产库卡片失去源文件。 */
  private restoreAssetFileCacheSnapshot(snapshot: AssetFileCacheSnapshot): void {
    const filesByAssetId = new Map<string, File[]>();
    this.assets.forEach((asset) => {
      const mainFile = snapshot.assetFiles.get(asset.id);
      const dependencyFiles = snapshot.assetDependencyFiles.get(asset.id) ?? [];
      const files = this.dedupeFiles([...dependencyFiles, ...(mainFile ? [mainFile] : [])]);
      if (files.length > 0) {
        filesByAssetId.set(asset.id, files);
      }
    });

    if (filesByAssetId.size === 0) {
      return;
    }

    this.restoreAssetFiles(filesByAssetId);
    this.registerFilesForLocalImport([...filesByAssetId.values()].flat());
  }

  /** 从运行时材质贴图提取可持久化图片，并逐个写入项目侧车文件。 */
  private async persistProjectExternalTextures(
    persistExternalTexture?: (fileName: string, data: ArrayBuffer) => Promise<string>
  ): Promise<ProjectExternalTextureFile[]> {
    if (!persistExternalTexture) {
      return [];
    }

    const candidates = await this.collectProjectExternalTextureCandidates();
    const files: ProjectExternalTextureFile[] = [];
    for (const candidate of candidates) {
      const projectFile = await persistExternalTexture(candidate.fileName, candidate.data);
      files.push({
        textureUniqueId: candidate.texture.uniqueId,
        fileName: candidate.fileName,
        projectFile,
        byteLength: candidate.byteLength,
        mimeType: candidate.mimeType,
        sourceName: candidate.sourceName,
        sourceUrl: candidate.sourceUrl
      });
    }
    return files;
  }

  /** 收集材质正在使用且带有原始二进制的 Texture，避免对 GPU 贴图做同步读回。 */
  private async collectProjectExternalTextureCandidates(): Promise<ProjectExternalTextureCandidate[]> {
    const candidates: ProjectExternalTextureCandidate[] = [];
    const seenTextureIds = new Set<number>();
    const seenTextureSources = new Set<string>();
    const usedFileNames = new Set<string>();
    for (const material of this.scene.materials) {
      for (const baseTexture of material.getActiveTextures()) {
        if (!(baseTexture instanceof Texture) || baseTexture instanceof DynamicTexture) {
          continue;
        }
        if (seenTextureIds.has(baseTexture.uniqueId) || (baseTexture as { isRenderTarget?: boolean }).isRenderTarget) {
          continue;
        }

        const data = await this.extractProjectTextureBuffer(baseTexture);
        if (!data || data.byteLength < PROJECT_TEXTURE_SIDECAR_MIN_BYTES) {
          continue;
        }

        seenTextureIds.add(baseTexture.uniqueId);
        const sourceUrl = typeof baseTexture.url === "string" ? baseTexture.url : undefined;
        const sourceName = typeof baseTexture.name === "string" ? baseTexture.name : undefined;
        const sourceKey = this.getProjectTextureSourceKey(baseTexture, sourceUrl, sourceName);
        if (seenTextureSources.has(sourceKey)) {
          continue;
        }
        seenTextureSources.add(sourceKey);

        const mimeType = this.detectProjectTextureMimeType(data, (baseTexture as { mimeType?: string }).mimeType, sourceUrl);
        const fileName = this.createProjectExternalTextureFileName(baseTexture, mimeType, usedFileNames);
        candidates.push({
          texture: baseTexture,
          fileName,
          data,
          byteLength: data.byteLength,
          mimeType,
          sourceName,
          sourceUrl
        });
      }
    }
    return candidates;
  }

  /** 生成运行时贴图去重 key，同一 GLB image 或同一源文件只需要保存一份侧车。 */
  private getProjectTextureSourceKey(texture: Texture, sourceUrl?: string, sourceName?: string): string {
    if (sourceUrl && !sourceUrl.startsWith("blob:")) {
      return "url:" + sourceUrl;
    }
    if (sourceName && !sourceName.startsWith("blob:")) {
      return "name:" + sourceName;
    }
    return "texture:" + texture.uniqueId;
  }

  /** 从 Babylon Texture 的原始 buffer、data URL 或本地文件缓存中复制图片数据，无法确认来源时保持跳过。 */
  private async extractProjectTextureBuffer(texture: Texture): Promise<ArrayBuffer | null> {
    const textureWithBuffer = texture as { _buffer?: unknown; _texture?: { _buffer?: unknown } };
    const bufferData = this.projectTextureBufferToArrayBuffer(textureWithBuffer._buffer ?? textureWithBuffer._texture?._buffer);
    if (bufferData) {
      return bufferData;
    }

    if (typeof texture.url === "string") {
      const urlData = this.dataUrlToArrayBuffer(texture.url);
      if (urlData) {
        return urlData;
      }
    }

    if (typeof texture.name === "string") {
      const nameData = this.dataUrlToArrayBuffer(texture.name);
      if (nameData) {
        return nameData;
      }
    }

    return this.readProjectTextureFileCache(texture);
  }

  /** 从 Babylon 全局本地文件缓存读取贴图源文件，覆盖 glTF/OBJ 依赖贴图和用户手动导入图片。 */
  private async readProjectTextureFileCache(texture: Texture): Promise<ArrayBuffer | null> {
    const file = this.findProjectTextureFileCache(texture);
    if (!file) {
      return null;
    }

    try {
      return await file.arrayBuffer();
    } catch (error) {
      console.warn("项目贴图源文件缓存读取失败，已跳过外部化。", error);
      return null;
    }
  }

  /** 根据 Texture 的 url/name/metadata 在 FilesInputStore 中查找原始 File。 */
  private findProjectTextureFileCache(texture: Texture): File | null {
    for (const key of this.getProjectTextureFileLookupKeys(texture)) {
      const file = FilesInputStore.FilesToLoad[key];
      if (file) {
        return file;
      }
    }
    return null;
  }

  /** 生成贴图源文件缓存查找 key，Babylon 的 file: 解析表统一使用小写文件名。 */
  private getProjectTextureFileLookupKeys(texture: Texture): string[] {
    const keys = new Set<string>();
    const metadata = this.asMetadataObject(texture.metadata);
    const sourceTexture = this.asMetadataObject(metadata.editorSourceTexture);
    const projectTexture = this.asMetadataObject(metadata.editorProjectTexture);
    [
      texture.url,
      texture.name,
      sourceTexture.fileName,
      projectTexture.fileName
    ].forEach((value) => {
      const key = this.normalizeProjectTextureFileLookupKey(value);
      if (key) {
        keys.add(key);
      }
    });
    return [...keys];
  }

  /** 把 file: URL、普通文件名或路径片段规整成 FilesInputStore 使用的 key。 */
  private normalizeProjectTextureFileLookupKey(value: unknown): string | null {
    if (typeof value !== "string" || value.length === 0 || value.startsWith("data:") || value.startsWith("blob:")) {
      return null;
    }

    let fileName = value;
    if (fileName.startsWith("file:")) {
      try {
        fileName = decodeURIComponent(fileName.substring(5));
      } catch {
        fileName = fileName.substring(5);
      }
    }
    if (fileName.startsWith("./")) {
      fileName = fileName.substring(2);
    }
    return this.getFileName(fileName).toLowerCase();
  }

  /** 将 Texture 内部可能出现的 data URL 或 typed array 统一转成独立 ArrayBuffer。 */
  private projectTextureBufferToArrayBuffer(source: unknown): ArrayBuffer | null {
    if (source instanceof ArrayBuffer) {
      return source.slice(0);
    }

    if (ArrayBuffer.isView(source)) {
      const view = source as ArrayBufferView;
      const bytes = new Uint8Array(view.byteLength);
      bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return bytes.buffer;
    }

    if (typeof source === "string") {
      return this.dataUrlToArrayBuffer(source);
    }

    return null;
  }

  /** 解析浏览器 data URL，保存项目侧车时只接受可还原的内联图片数据。 */
  private dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
    if (!match) {
      return null;
    }

    let binary: string;
    try {
      const payload = match[3] ?? "";
      binary = match[2] ? atob(payload) : decodeURIComponent(payload);
    } catch {
      return null;
    }

    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index) & 0xff;
    }
    return bytes.buffer;
  }

  /** 根据显式 MIME、data URL 或图片魔数推断侧车文件类型。 */
  private detectProjectTextureMimeType(data: ArrayBuffer, explicitMimeType?: string, sourceUrl?: string): string {
    if (explicitMimeType?.startsWith("image/")) {
      return explicitMimeType;
    }

    const dataUrlMimeType = typeof sourceUrl === "string" ? /^data:([^;,]+)/i.exec(sourceUrl)?.[1] : undefined;
    if (dataUrlMimeType?.startsWith("image/")) {
      return dataUrlMimeType;
    }

    const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 16));
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
    return "image/png";
  }

  /** 为贴图侧车文件生成稳定且不含路径字符的文件名。 */
  private createProjectExternalTextureFileName(texture: Texture, mimeType: string, usedFileNames: Set<string>): string {
    const extension = this.getProjectTextureExtension(mimeType);
    const existingFileName = this.getProjectTextureMetadataFileName(texture);
    if (existingFileName && !usedFileNames.has(existingFileName.toLowerCase())) {
      usedFileNames.add(existingFileName.toLowerCase());
      return existingFileName;
    }

    const source = texture.name || texture.url || "texture-" + texture.uniqueId;
    const sourceBaseName = source.startsWith("data:") ? "texture-" + texture.uniqueId : source.replace(/\.[^.]+$/, "");
    const baseName = this.sanitizeProjectTextureFileName(sourceBaseName, "texture-" + texture.uniqueId);
    let fileName = texture.uniqueId + "-" + baseName + "." + extension;
    let index = 2;
    while (usedFileNames.has(fileName.toLowerCase())) {
      fileName = texture.uniqueId + "-" + baseName + "-" + index + "." + extension;
      index += 1;
    }
    usedFileNames.add(fileName.toLowerCase());
    return fileName;
  }

  /** 优先复用已加载侧车贴图自己的文件名，避免重复保存生成新文件。 */
  private getProjectTextureMetadataFileName(texture: Texture): string | null {
    const metadata = this.asMetadataObject(texture.metadata);
    const projectTexture = this.asMetadataObject(metadata.editorProjectTexture);
    if (projectTexture.version !== PROJECT_TEXTURE_SIDECAR_VERSION || typeof projectTexture.fileName !== "string") {
      return null;
    }

    const leafName = this.getFileName(projectTexture.fileName);
    const dotIndex = leafName.lastIndexOf(".");
    const extension =
      dotIndex > 0
        ? this.sanitizeProjectTextureFileName(leafName.slice(dotIndex + 1), this.getProjectTextureExtension(String(projectTexture.mimeType ?? "")))
        : this.getProjectTextureExtension(String(projectTexture.mimeType ?? ""));
    return this.sanitizeProjectTextureFileName(dotIndex > 0 ? leafName.slice(0, dotIndex) : leafName, "texture-" + texture.uniqueId) + "." + extension;
  }

  /** 收敛贴图文件名片段，避免 data URL、路径和非法字符进入项目目录。 */
  private sanitizeProjectTextureFileName(input: string, fallback: string): string {
    const value = input
      .split(/[\\/]/)
      .pop()
      ?.replace(/^data:/i, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 72)
      .replace(/^-+|-+$/g, "");
    return value || fallback;
  }

  /** 将 MIME 映射为项目侧车文件扩展名。 */
  private getProjectTextureExtension(mimeType: string): string {
    switch (mimeType.toLowerCase()) {
      case "image/jpeg":
        return "jpg";
      case "image/webp":
        return "webp";
      case "image/ktx":
        return "ktx";
      case "image/ktx2":
        return "ktx2";
      default:
        return "png";
    }
  }

  /** 把序列化贴图改成 file: 侧车引用，并写入单贴图诊断 metadata。 */
  private applyProjectExternalTextureReferences(serializedScene: Record<string, unknown>, externalTextures: ProjectExternalTextureFile[]): void {
    if (externalTextures.length === 0) {
      return;
    }

    const textureFilesById = new Map(externalTextures.map((file) => [file.textureUniqueId, file]));
    const textureFilesBySourceUrl = this.createProjectExternalTextureSourceMap(externalTextures, "sourceUrl");
    const textureFilesBySourceName = this.createProjectExternalTextureSourceMap(externalTextures, "sourceName");
    this.visitSerializedObjects(serializedScene, (node) => {
      if (!this.isSerializedTextureNode(node)) {
        return;
      }

      const externalTexture = this.findProjectExternalTextureForSerializedNode(
        node,
        textureFilesById,
        textureFilesBySourceUrl,
        textureFilesBySourceName
      );
      if (!externalTexture) {
        return;
      }

      node.name = externalTexture.fileName;
      node.url = this.createProjectTextureFileUrl(externalTexture.fileName);
      delete node.base64String;
      node.metadata = {
        ...this.asMetadataObject(node.metadata),
        editorProjectTexture: {
          version: PROJECT_TEXTURE_SIDECAR_VERSION,
          textureUniqueId: externalTexture.textureUniqueId,
          projectFile: externalTexture.projectFile,
          fileName: externalTexture.fileName,
          byteLength: externalTexture.byteLength,
          mimeType: externalTexture.mimeType
        }
      };
    });
  }

  /** 为序列化贴图的 url/name 匹配建立索引，兼容旧场景不序列化 Texture uniqueId 的情况。 */
  private createProjectExternalTextureSourceMap(
    externalTextures: ProjectExternalTextureFile[],
    key: "sourceUrl" | "sourceName"
  ): Map<string, ProjectExternalTextureFile> {
    const map = new Map<string, ProjectExternalTextureFile>();
    externalTextures.forEach((file) => {
      const value = file[key];
      if (value && !map.has(value)) {
        map.set(value, file);
      }
    });
    return map;
  }

  /** 按 uniqueId、原始 url、原始 name 依次匹配已写入的项目侧车贴图。 */
  private findProjectExternalTextureForSerializedNode(
    node: Record<string, unknown>,
    textureFilesById: Map<number, ProjectExternalTextureFile>,
    textureFilesBySourceUrl: Map<string, ProjectExternalTextureFile>,
    textureFilesBySourceName: Map<string, ProjectExternalTextureFile>
  ): ProjectExternalTextureFile | undefined {
    const textureUniqueId = typeof node.uniqueId === "number" ? node.uniqueId : null;
    if (textureUniqueId !== null) {
      const byId = textureFilesById.get(textureUniqueId);
      if (byId) {
        return byId;
      }
    }

    const url = typeof node.url === "string" ? node.url : undefined;
    if (url) {
      const byUrl = textureFilesBySourceUrl.get(url);
      if (byUrl) {
        return byUrl;
      }
    }

    const name = typeof node.name === "string" ? node.name : undefined;
    return name ? textureFilesBySourceName.get(name) : undefined;
  }

  /** 生成 Babylon 可安全 decode 的 file: 贴图引用。 */
  private createProjectTextureFileUrl(fileName: string): string {
    return "file:" + encodeURIComponent(fileName);
  }

  /** 合并新写入的贴图和场景中已有的项目侧车贴图，避免重开后再次保存清空清单。 */
  private mergeProjectExternalTextureManifest(
    serializedScene: Record<string, unknown>,
    externalTextures: ProjectExternalTextureFile[]
  ): ProjectExternalTextureManifest {
    const filesByProjectFile = new Map<string, ProjectExternalTextureFile>();
    const existingManifest = this.getProjectExternalTextureManifest(serializedScene);
    this.collectSerializedProjectExternalTextures(serializedScene, existingManifest).forEach((file) => {
      filesByProjectFile.set(file.projectFile, file);
    });
    externalTextures.forEach((file) => {
      filesByProjectFile.set(file.projectFile, file);
    });
    return {
      version: PROJECT_TEXTURE_SIDECAR_VERSION,
      files: [...filesByProjectFile.values()]
    };
  }

  /** 从序列化贴图节点上读取仍被引用的项目侧车贴图记录。 */
  private collectSerializedProjectExternalTextures(
    serializedScene: Record<string, unknown>,
    existingManifest?: ProjectExternalTextureManifest | null
  ): ProjectExternalTextureFile[] {
    const files: ProjectExternalTextureFile[] = [];
    const existingFilesByName = new Map(existingManifest?.files.map((file) => [file.fileName.toLowerCase(), file]) ?? []);
    this.visitSerializedObjects(serializedScene, (node) => {
      if (!this.isSerializedTextureNode(node)) {
        return;
      }

      const projectTexture = this.getProjectTextureNodeMetadata(node);
      if (projectTexture) {
        files.push({
          textureUniqueId: projectTexture.textureUniqueId ?? (typeof node.uniqueId === "number" ? node.uniqueId : -1),
          fileName: projectTexture.fileName,
          projectFile: projectTexture.projectFile,
          byteLength: projectTexture.byteLength,
          mimeType: projectTexture.mimeType
        });
        return;
      }

      const existingFile = this.findExistingProjectExternalTextureForSerializedNode(node, existingFilesByName);
      if (existingFile) {
        files.push(existingFile);
      }
    });
    return files.filter((file) => file.textureUniqueId >= 0);
  }

  /** metadata 丢失但 file: 引用仍在时，用旧清单补回项目侧车记录。 */
  private findExistingProjectExternalTextureForSerializedNode(
    node: Record<string, unknown>,
    existingFilesByName: Map<string, ProjectExternalTextureFile>
  ): ProjectExternalTextureFile | undefined {
    const urlFileName = this.getSerializedProjectTextureFileName(node.url);
    if (urlFileName) {
      const byUrl = existingFilesByName.get(urlFileName.toLowerCase());
      if (byUrl) {
        return byUrl;
      }
    }

    const nameFileName = this.getSerializedProjectTextureFileName(node.name);
    return nameFileName ? existingFilesByName.get(nameFileName.toLowerCase()) : undefined;
  }

  /** 从序列化贴图的 file: URL 或 name 中取回侧车文件名。 */
  private getSerializedProjectTextureFileName(value: unknown): string | null {
    const key = this.normalizeProjectTextureFileLookupKey(value);
    return key ? this.getFileName(key) : null;
  }

  /** 双保险移除项目场景里残留的 base64String，防止大贴图继续进入 IPC。 */
  private stripProjectSceneEmbeddedTexturePayloads(serializedScene: Record<string, unknown>): number {
    let strippedCount = 0;
    this.visitSerializedObjects(serializedScene, (node) => {
      if (this.isSerializedTextureNode(node) && typeof node.base64String === "string") {
        delete node.base64String;
        strippedCount += 1;
      }
    });
    return strippedCount;
  }

  /** 判断序列化对象是否像 Babylon Texture，限制 base64 清理范围。 */
  private isSerializedTextureNode(node: Record<string, unknown>): boolean {
    return (
      typeof node.url === "string" ||
        typeof node.invertY === "boolean" ||
        typeof node.samplingMode === "number" ||
        typeof node.internalTextureUniqueId === "number" ||
      typeof node.base64String === "string"
    );
  }

  /** 从贴图节点 metadata 中读取项目侧车记录，损坏 metadata 直接忽略。 */
  private getProjectTextureNodeMetadata(node: Record<string, unknown>): ProjectTextureNodeMetadata | null {
    const metadata = this.asMetadataObject(node.metadata);
    const projectTexture = this.asMetadataObject(metadata.editorProjectTexture);
    if (
      projectTexture.version !== PROJECT_TEXTURE_SIDECAR_VERSION ||
      typeof projectTexture.projectFile !== "string" ||
      projectTexture.projectFile.length === 0 ||
      typeof projectTexture.fileName !== "string" ||
      projectTexture.fileName.length === 0 ||
      typeof projectTexture.byteLength !== "number" ||
      !Number.isFinite(projectTexture.byteLength) ||
      projectTexture.byteLength < 0 ||
      typeof projectTexture.mimeType !== "string" ||
      projectTexture.mimeType.length === 0
    ) {
      return null;
    }

    return {
      textureUniqueId:
        typeof projectTexture.textureUniqueId === "number" && Number.isFinite(projectTexture.textureUniqueId)
          ? projectTexture.textureUniqueId
          : undefined,
      projectFile: projectTexture.projectFile,
      fileName: projectTexture.fileName,
      byteLength: projectTexture.byteLength,
      mimeType: projectTexture.mimeType
    };
  }

  /** 深度遍历序列化 JSON 中的普通对象，用于贴图引用和诊断清理。 */
  private visitSerializedObjects(value: unknown, visitor: (node: Record<string, unknown>) => void): void {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => this.visitSerializedObjects(item, visitor));
      return;
    }

    const node = value as Record<string, unknown>;
    visitor(node);
    Object.values(node).forEach((item) => this.visitSerializedObjects(item, visitor));
  }

  /** 加载项目前读取贴图侧车文件，并临时注册到 Babylon file: 解析表。 */
  private async registerProjectExternalTextureFilesForLoad(
    serializedScene: Record<string, unknown>,
    options: SerializedSceneLoadOptions
  ): Promise<Map<string, File | undefined>> {
    const previousFiles = new Map<string, File | undefined>();
    const manifest = this.getProjectExternalTextureManifest(serializedScene);
    if (!manifest || manifest.files.length === 0 || !options.loadExternalTextures) {
      return previousFiles;
    }

    let results: ProjectExternalTextureLoadResult[];
    try {
      results = await options.loadExternalTextures(
        manifest.files.map((file) => ({
          projectFile: file.projectFile,
          fileName: file.fileName,
          expectedByteLength: file.byteLength,
          mimeType: file.mimeType
        }))
      );
    } catch (error) {
      console.warn("项目贴图侧车批量读取失败，场景将继续尝试加载。", error);
      return previousFiles;
    }
    const mimeTypesByProjectFile = new Map(manifest.files.map((file) => [file.projectFile, file]));
    results.forEach((result) => {
      if (!result.data || result.error) {
        console.warn(result.error ?? "项目贴图侧车 " + result.projectFile + " 读取失败。");
        return;
      }

      const manifestFile = mimeTypesByProjectFile.get(result.projectFile);
      const fileName = result.fileName || manifestFile?.fileName || this.getFileName(result.projectFile);
      const key = fileName.toLowerCase();
      if (!previousFiles.has(key)) {
        previousFiles.set(key, FilesInputStore.FilesToLoad[key]);
      }
      FilesInputStore.FilesToLoad[key] = new File([result.data], fileName, {
        type: manifestFile?.mimeType ?? "application/octet-stream",
        lastModified: result.lastModified
      });
    });
    return previousFiles;
  }

  /** 加载完成后恢复 Babylon 全局 file: 缓存，避免侧车贴图长期占用内存。 */
  private restoreProjectExternalTextureFileRegistration(previousFiles: Map<string, File | undefined>): void {
    previousFiles.forEach((file, key) => {
      if (file) {
        FilesInputStore.FilesToLoad[key] = file;
      } else {
        delete FilesInputStore.FilesToLoad[key];
      }
    });
  }

  /** 从场景 metadata 中读取并校验项目贴图侧车清单。 */
  private getProjectExternalTextureManifest(serializedScene: Record<string, unknown>): ProjectExternalTextureManifest | null {
    const metadata = this.asMetadataObject(serializedScene.metadata);
    const editorMetadata = this.asMetadataObject(metadata.editor);
    const manifest = this.asMetadataObject(editorMetadata.projectExternalTextures);
    if (manifest.version !== PROJECT_TEXTURE_SIDECAR_VERSION || !Array.isArray(manifest.files)) {
      return null;
    }

    const files = manifest.files.filter((file): file is ProjectExternalTextureFile => this.isProjectExternalTextureFile(file));
    return files.length > 0 ? { version: PROJECT_TEXTURE_SIDECAR_VERSION, files } : null;
  }

  /** 校验单个贴图侧车记录，损坏条目直接忽略，避免阻塞旧项目打开。 */
  private isProjectExternalTextureFile(value: unknown): value is ProjectExternalTextureFile {
    const file = this.asMetadataObject(value);
    return (
      typeof file.textureUniqueId === "number" &&
      Number.isFinite(file.textureUniqueId) &&
      typeof file.fileName === "string" &&
      file.fileName.length > 0 &&
      typeof file.projectFile === "string" &&
      file.projectFile.length > 0 &&
      typeof file.byteLength === "number" &&
      Number.isFinite(file.byteLength) &&
      file.byteLength >= 0 &&
      typeof file.mimeType === "string" &&
      file.mimeType.length > 0
    );
  }

  /** 移除不应持久化的编辑器运行时对象，避免保存后再次加载失败或重复创建辅助层。 */
  private stripEditorRuntimeSerialization(serializedScene: Record<string, unknown>): void {
    delete serializedScene.activeCameraID;
    serializedScene.effectLayers = [];
  }

  /** 打开或关闭 Babylon 官方 Inspector，作为开发期调试视图。 */
  public async toggleInspector(): Promise<void> {
    if (this.scene.debugLayer.isVisible()) {
      this.scene.debugLayer.hide();
      return;
    }

    if (!import.meta.env.DEV) {
      return;
    }

    await this.scene.debugLayer.show({
      embedMode: false,
      overlay: true,
      inspectorURL: "https://cdn.babylonjs.com/inspector/babylon.inspector.bundle.js"
    });
  }

  /** 从属性面板更新当前选中对象；保留旧入口并委托给按节点 ID 定向更新的实现。 */
  public updateSelected(update: TransformUpdate): void {
    if (!this.selectedNode) {
      return;
    }

    const snapshot = this.updateNodeById(this.selectedNode.uniqueId, update);
    if (snapshot) {
      this.callbacks.onSelectionChange({ type: "node", node: snapshot });
    }
  }

  /** 按属性面板快照中的 uniqueId 定向更新节点，返回目标节点最新快照；返回 null 仅表示目标节点不存在或不可编辑。 */
  public updateNodeById(id: number, update: TransformUpdate): TransformSnapshot | null {
    const node = this.findTransformNodeByUniqueId(id);
    if (!node || node.metadata?.[HELPER_FLAG]) {
      return null;
    }

    if (this.isNodeLocked(node)) {
      return this.createTransformSnapshot(node);
    }

    if (this.hasTransformUpdatePayload(update)) {
      this.recordSceneUndoSnapshot("更新对象属性", { coalesceMs: 700 });
    }
    const graphDirty = this.applyTransformUpdateToNode(node, update);
    this.refreshNodeWorldMatrices(node);
    if (this.selectedNode?.uniqueId === node.uniqueId) {
      this.syncCameraOrbitTargetToSelection();
    }
    const snapshot = this.createTransformSnapshot(node);
    if (graphDirty) {
      this.refreshSceneGraph();
    }
    this.scene.render();
    return snapshot;
  }

  /** 把属性面板更新应用到指定节点，返回是否需要刷新左侧层级树。 */
  private applyTransformUpdateToNode(node: TransformNode, update: TransformUpdate): boolean {
    let graphDirty = false;
    const transformEditable = !this.isEditorGroup(node);

    if (update.name !== undefined) {
      node.name = update.name.trim() || node.name;
      graphDirty = true;
    }

    if (transformEditable && update.position) {
      applySnapshotVector(node.position, update.position);
    }

    if (transformEditable && update.rotation) {
      node.rotationQuaternion = null;
      applySnapshotVector(node.rotation, update.rotation, "degrees");
    }

    if (transformEditable && update.scaling) {
      applySnapshotVector(node.scaling, update.scaling);
    }

    if (update.visible !== undefined) {
      this.updateNodeVisibility(node, update.visible);
      graphDirty = true;
    }

    if (transformEditable && update.materialColor && !this.isCadDrawingNode(node)) {
      this.updateNodeMaterialColor(node, update.materialColor);
      this.updateNodeMeshVertexModify(node, { mainColor: update.materialColor });
    }

    if (transformEditable && update.cadOpacity !== undefined && node.metadata?.cadDrawing) {
      this.applyCadDisplayOpacity(node, update.cadOpacity);
    }

    if (transformEditable && update.meshVertexModify) {
      const meshVertexModify = this.updateNodeMeshVertexModify(node, update.meshVertexModify);
      if (update.meshVertexModify.rollerDensity !== undefined) {
        this.applyMeshVertexModifyRuntime(node, meshVertexModify);
      }
      if (update.meshVertexModify.mainColor && !this.isCadDrawingNode(node)) {
        this.updateNodeMaterialColor(node, update.meshVertexModify.mainColor);
      }
      graphDirty = true;
    }

    if (transformEditable && update.assetInfo) {
      this.updateNodeAssetInfo(node, update.assetInfo);
    }

    if (transformEditable && update.dynamicParameter) {
      graphDirty = this.updateNodeDynamicParameter(node, update.dynamicParameter) || graphDirty;
    }

    if (transformEditable && update.poi && this.isPoiNode(node)) {
      this.updateNodePoiConfig(node, update.poi);
    }

    if (transformEditable && update.locatorAnimationConnection && this.isLocatorWireCubeNode(node)) {
      this.updateLocatorAnimationConnection(node, update.locatorAnimationConnection);
    }

    if (transformEditable && update.locatorDimensions && this.isLocatorWireCubeNode(node)) {
      this.updateLocatorDimensions(node, update.locatorDimensions);
    }

    return graphDirty;
  }

  /** 判断属性面板更新是否包含会改变对象布局或可见状态的字段。 */
  private hasTransformUpdatePayload(update: TransformUpdate): boolean {
    return (
      update.name !== undefined ||
      update.position !== undefined ||
      update.rotation !== undefined ||
      update.scaling !== undefined ||
      update.visible !== undefined ||
      update.materialColor !== undefined ||
      update.cadOpacity !== undefined ||
      update.assetInfo !== undefined ||
      update.meshVertexModify !== undefined ||
      update.locatorAnimationConnection !== undefined ||
      update.locatorDimensions !== undefined ||
      update.poi !== undefined ||
      update.dynamicParameter !== undefined
    );
  }

  /** 创建编辑器视口相机，提供类似 Unity Scene View 的轨道操作体验。 */
  private createEditorCamera(): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      "Editor Camera",
      Math.PI / 4,
      Math.PI / 3,
      DEFAULT_CAMERA_RADIUS_METERS,
      new Vector3(0, 1.2, 0),
      this.scene
    );
    camera.metadata = { [HELPER_FLAG]: true };
    camera.doNotSerialize = true;
    // 不设置最近半径限制，并关闭碰撞，允许编辑相机直接穿过模型。
    camera.lowerRadiusLimit = null;
    camera.checkCollisions = false;
    camera.upperRadiusLimit = DEFAULT_CAMERA_FAR_CLIP_METERS;
    camera.panningSensibility = DEFAULT_CAMERA_PANNING_SENSIBILITY;
    camera.angularSensibilityX = DEFAULT_CAMERA_ROTATION_SENSIBILITY;
    camera.angularSensibilityY = DEFAULT_CAMERA_ROTATION_SENSIBILITY;
    camera.movement.panSpeed = MIN_CAMERA_PAN_SPEED_SCALE;
    disableEditorCameraDefaultMovementInputs(camera);
    camera.minZ = 0.05;
    camera.maxZ = DEFAULT_CAMERA_FAR_CLIP_METERS;
    camera.fov = 0.92;
    camera.useInputToRestoreState = false;
    // 编辑器只保留显式实现的 Unity 风格导航，避免 Babylon 默认键盘输入产生隐藏相机行为。
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.inputs.removeByType("ArcRotateCameraPointersInput");
    camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
    camera.inputs.add(
      new EditorCameraUnityPointerInput(this.canvas, {
        onNavigationStart: () => {
          this.cameraNavigationActive = true;
        },
        onNavigationEnd: (action, moved) => {
          this.cameraNavigationActive = false;
          if (moved || action !== "look") {
            this.lastCameraNavigationEndTime = performance.now();
          }
        },
        getLockedBeta: () => this.getLockedCameraBeta()
      })
    );
    camera.inputs.add(new EditorCameraWheelDollyInput(this.canvas));
    camera.wheelPrecision = DEFAULT_CAMERA_WHEEL_PRECISION;
    this.scene.activeCamera = camera;
    camera.attachControl(this.canvas, true);
    disableEditorCameraDefaultMovementInputs(camera);
    return camera;
  }

  /** 按相机观察半径同步右键平移速度，避免大模型取景后拖动画面几乎不动。 */
  private syncEditorCameraPanSpeed(): void {
    const radius = Number.isFinite(this.editorCamera.radius) ? Math.abs(this.editorCamera.radius) : DEFAULT_CAMERA_RADIUS_METERS;
    const speedScale = Math.min(
      MAX_CAMERA_PAN_SPEED_SCALE,
      Math.max(MIN_CAMERA_PAN_SPEED_SCALE, radius / CAMERA_PAN_SPEED_REFERENCE_RADIUS_METERS)
    );
    this.editorCamera.movement.panSpeed = speedScale;
  }

  /** 配置 GizmoManager，使工具栏负责所有变换模式切换。 */
  private configureGizmos(): void {
    this.gizmoManager.usePointerToAttachGizmos = false;
    this.gizmoManager.enableAutoPicking = false;
    this.gizmoManager.clearGizmoOnEmptyPointerEvent = false;
    this.syncGizmoMode();
  }

  /** 绑定 Gizmo 拖拽事件，让右侧属性面板在场景内移动、旋转、缩放时实时刷新。 */
  private bindGizmoRealtimeSync(): void {
    const transformGizmos = [
      this.gizmoManager.gizmos.positionGizmo,
      this.gizmoManager.gizmos.rotationGizmo,
      this.gizmoManager.gizmos.scaleGizmo
    ];

    transformGizmos.forEach((gizmo) => {
      if (!gizmo || this.observedTransformGizmos.has(gizmo)) {
        return;
      }

      this.observedTransformGizmos.add(gizmo);
      gizmo.onDragStartObservable.add(() => {
        this.beginTransformGizmoDrag();
        this.flushTransformSnapshotSync();
      });
      gizmo.onDragObservable.add(() => this.scheduleTransformSnapshotSync());
      gizmo.onDragEndObservable.add(() => {
        this.endTransformGizmoDrag();
        this.flushTransformSnapshotSync();
      });
    });
  }

  /** Gizmo 抢占左键拖拽期间暂停相机输入，避免变换轴拖动同时带动镜头。 */
  private beginTransformGizmoDrag(): void {
    if (this.transformGizmoDragging) {
      this.clearEditorCameraInertia();
      return;
    }

    this.recordSceneUndoSnapshot("拖拽变换对象");
    this.transformGizmoDragging = true;
    this.clearEditorCameraInertia();
    this.editorCamera.detachControl();
  }

  /** Gizmo 拖拽结束后恢复编辑相机输入，并丢弃拖拽期间残留的惯性。 */
  private endTransformGizmoDrag(): void {
    if (!this.transformGizmoDragging) {
      this.clearEditorCameraInertia();
      return;
    }

    this.clearEditorCameraInertia();
    this.attachEditorCameraControl();
    this.transformGizmoDragging = false;
  }

  /** 绑定编辑相机输入后立刻关闭 Babylon 默认 movement 映射，保证只有自定义 Unity 输入生效。 */
  private attachEditorCameraControl(): void {
    this.applyCameraPitchLock();
    this.editorCamera.attachControl(this.canvas, true);
    disableEditorCameraDefaultMovementInputs(this.editorCamera);
  }

  /** 俯瞰模式用接近 0 的安全俯仰角模拟垂直正顶，避免 ArcRotateCamera 在 beta=0 时方向奇异。 */
  private getLockedCameraBeta(): number | null {
    return this.overheadMode ? OVERHEAD_CAMERA_BETA : null;
  }

  /** 按当前相机模式统一修正俯仰角，防止预览恢复或聚焦取景打破正顶俯瞰。 */
  private applyCameraPitchLock(): void {
    const lockedBeta = this.getLockedCameraBeta();
    if (lockedBeta === null) {
      return;
    }

    this.editorCamera.beta = lockedBeta;
  }

  /** 清空 ArcRotateCamera 的惯性偏移，避免重新绑定输入后延续旧拖拽速度。 */
  private clearEditorCameraInertia(): void {
    this.editorCamera.inertialAlphaOffset = 0;
    this.editorCamera.inertialBetaOffset = 0;
    this.editorCamera.inertialRadiusOffset = 0;
    this.editorCamera.inertialPanningX = 0;
    this.editorCamera.inertialPanningY = 0;
  }

  /** 合并高频拖拽事件，最多每帧向 React 推送一次属性快照。 */
  private scheduleTransformSnapshotSync(): void {
    if (this.transformSyncFrame) {
      return;
    }

    this.transformSyncFrame = window.requestAnimationFrame(() => {
      this.transformSyncFrame = 0;
      this.emitTransformSnapshotAfterGizmo();
    });
  }

  /** 立即同步一次 Gizmo 变换结果，保证拖拽开始和结束时属性面板不会落后一帧。 */
  private flushTransformSnapshotSync(): void {
    if (this.transformSyncFrame) {
      window.cancelAnimationFrame(this.transformSyncFrame);
      this.transformSyncFrame = 0;
    }

    this.emitTransformSnapshotAfterGizmo();
  }

  /** 根据当前选中对象生成最新属性快照，专供 Gizmo 拖拽后同步面板。 */
  private emitTransformSnapshotAfterGizmo(): void {
    if (!this.selectedNode) {
      return;
    }

    this.selectedNode.computeWorldMatrix(true);
    this.syncCameraOrbitTargetToSelection();
    this.emitSelectionSnapshot();
  }

  /** 创建默认可编辑场景，保证首次打开就是可用工作台。 */
  private createDefaultScene(): void {
    this.createGridHelper();
    this.createCoordinateAxesHelper();

    const hemi = new HemisphericLight("环境光", new Vector3(0.2, 1, 0.4), this.scene);
    hemi.metadata = { [HELPER_FLAG]: true };
    hemi.doNotSerialize = true;
    hemi.intensity = 0.7;

    const sun = new DirectionalLight("主方向光", new Vector3(-0.4, -1, 0.6), this.scene);
    sun.metadata = { [HELPER_FLAG]: true };
    sun.doNotSerialize = true;
    sun.position = new Vector3(8, 12, -8);
    sun.intensity = 1.4;

    const cube = this.createPrimitive("cube", new Vector3(-1.8, 0.5, 0));
    const sphere = this.createPrimitive("sphere", new Vector3(1.8, 0.75, 0));
    const ground = this.createPrimitive("ground", new Vector3(0, 0, 0));
    ground.name = "工作地面";

    this.selectNode(cube);
    this.refreshSceneGraph();
  }

  /** 创建场景原点的三维坐标轴辅助对象，替代视口 DOM 角标。 */
  private createCoordinateAxesHelper(): void {
    const axes = [
      {
        label: "X",
        color: new Color3(1, 0.24, 0.18),
        colorHex: "#ff554c",
        lines: this.createCoordinateAxisLines("x"),
        labelPosition: new Vector3(
          COORDINATE_AXIS_LENGTH_METERS + COORDINATE_AXIS_LABEL_OFFSET_METERS,
          COORDINATE_AXIS_GROUND_LIFT_METERS + COORDINATE_AXIS_LABEL_SIZE_METERS * 0.45,
          0
        )
      },
      {
        label: "Y",
        color: new Color3(0.32, 0.88, 0.38),
        colorHex: "#5ee86b",
        lines: this.createCoordinateAxisLines("y"),
        labelPosition: new Vector3(
          0,
          COORDINATE_AXIS_GROUND_LIFT_METERS + COORDINATE_AXIS_LENGTH_METERS + COORDINATE_AXIS_LABEL_OFFSET_METERS,
          0
        )
      },
      {
        label: "Z",
        color: new Color3(0.32, 0.5, 1),
        colorHex: "#5a82ff",
        lines: this.createCoordinateAxisLines("z"),
        labelPosition: new Vector3(
          0,
          COORDINATE_AXIS_GROUND_LIFT_METERS + COORDINATE_AXIS_LABEL_SIZE_METERS * 0.45,
          COORDINATE_AXIS_LENGTH_METERS + COORDINATE_AXIS_LABEL_OFFSET_METERS
        )
      }
    ];

    axes.forEach((axis) => {
      const colors = axis.lines.map(() => {
        const axisColor = new Color4(axis.color.r, axis.color.g, axis.color.b, 1);
        return [axisColor.clone(), axisColor.clone()];
      });
      const lineSystem = MeshBuilder.CreateLineSystem(
        `场景坐标轴 ${axis.label}`,
        { lines: axis.lines, colors, useVertexAlpha: true },
        this.scene
      );
      lineSystem.alwaysSelectAsActiveMesh = true;
      lineSystem.isPickable = false;
      lineSystem.doNotSerialize = true;
      lineSystem.metadata = { [HELPER_FLAG]: true };
      if (lineSystem.material) {
        lineSystem.material.doNotSerialize = true;
      }

      this.createCoordinateAxisLabel(axis.label, axis.labelPosition, axis.color, axis.colorHex);
    });
  }

  /** 按指定轴向生成主轴和箭头线段，所有线段均位于 Babylon 场景内。 */
  private createCoordinateAxisLines(axis: "x" | "y" | "z"): Vector3[][] {
    const lift = COORDINATE_AXIS_GROUND_LIFT_METERS;
    const length = COORDINATE_AXIS_LENGTH_METERS;
    const headLength = COORDINATE_AXIS_HEAD_LENGTH_METERS;
    const headWidth = COORDINATE_AXIS_HEAD_WIDTH_METERS;

    if (axis === "x") {
      const origin = new Vector3(0, lift, 0);
      const end = new Vector3(length, lift, 0);
      return [
        [origin, end],
        [end, new Vector3(length - headLength, lift + headWidth, 0)],
        [end, new Vector3(length - headLength, lift, headWidth)],
        [end, new Vector3(length - headLength, lift, -headWidth)]
      ];
    }

    if (axis === "y") {
      const origin = new Vector3(0, lift, 0);
      const end = new Vector3(0, lift + length, 0);
      return [
        [origin, end],
        [end, new Vector3(headWidth, lift + length - headLength, 0)],
        [end, new Vector3(-headWidth, lift + length - headLength, 0)],
        [end, new Vector3(0, lift + length - headLength, headWidth)],
        [end, new Vector3(0, lift + length - headLength, -headWidth)]
      ];
    }

    const origin = new Vector3(0, lift, 0);
    const end = new Vector3(0, lift, length);
    return [
      [origin, end],
      [end, new Vector3(headWidth, lift, length - headLength)],
      [end, new Vector3(-headWidth, lift, length - headLength)],
      [end, new Vector3(0, lift + headWidth, length - headLength)]
    ];
  }

  /** 创建跟随相机朝向的坐标轴文字标签，避免再次使用 DOM 覆盖层。 */
  private createCoordinateAxisLabel(label: string, position: Vector3, color: Color3, colorHex: string): void {
    const texture = new DynamicTexture(
      `场景坐标轴 ${label} 标签纹理`,
      { width: COORDINATE_AXIS_LABEL_TEXTURE_SIZE, height: COORDINATE_AXIS_LABEL_TEXTURE_SIZE },
      this.scene,
      true
    );
    texture.hasAlpha = true;
    texture.drawText(label, null, 88, "bold 78px Arial", colorHex, "transparent", true, true);

    const material = new StandardMaterial(`场景坐标轴 ${label} 标签材质`, this.scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.emissiveColor = color;
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;
    material.doNotSerialize = true;

    const plane = MeshBuilder.CreatePlane(
      `场景坐标轴 ${label} 标签`,
      { size: COORDINATE_AXIS_LABEL_SIZE_METERS },
      this.scene
    );
    plane.position = position;
    plane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    plane.alwaysSelectAsActiveMesh = true;
    plane.isPickable = false;
    plane.doNotSerialize = true;
    plane.metadata = { [HELPER_FLAG]: true };
    plane.material = material;
  }

  /** 清空可编辑内容，必要时同步清空资产库，避免加载项目场景时和默认对象叠加。 */
  private clearEditableScene(clearAssets = true): void {
    this.cancelCadRestore();
    this.selectNode(null);
    this.sceneBusinessRuntime.stop(true);
    this.stopAllModelPackageRuntimes(false);
    this.disposeClipboardTemplate();
    [...this.scene.rootNodes].filter((node) => !node.metadata?.[HELPER_FLAG]).forEach((node) => node.dispose());
    this.scene.lights.filter((light) => !light.metadata?.[HELPER_FLAG]).forEach((light) => light.dispose());
    this.scene.cameras
      .filter((camera) => camera !== this.editorCamera && !camera.metadata?.[HELPER_FLAG])
      .forEach((camera) => camera.dispose());
    [...this.scene.animationGroups].forEach((animationGroup) => animationGroup.dispose());
    this.scene.materials.filter((material) => !material.doNotSerialize).forEach((material) => material.dispose(true, true));
    if (clearAssets) {
      this.assets.splice(0, this.assets.length);
      this.assetFiles.clear();
      this.assetDependencyFiles.clear();
      this.clearRegisteredLocalImportFiles();
      this.callbacks.onAssetsChange([]);
    }
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
    this.sceneBusinessRuntime.start();
  }

  /** 恢复加载后节点的可编辑元数据，并从序列化数据中取回资产列表。 */
  private async prepareLoadedScene(serializedScene: Record<string, unknown>, options: SerializedSceneLoadOptions = {}): Promise<void> {
    this.scene.rootNodes
      .filter((node) => !node.metadata?.[HELPER_FLAG])
      .forEach((node) => {
        if (node instanceof TransformNode) {
          node.metadata = {
            ...this.withMetricModelMetadata(node.metadata, this.getNodeSourceFileName(node)),
            [ROOT_FLAG]: node.metadata?.[ROOT_FLAG] ?? true
          };
          if (node instanceof AbstractMesh) {
            node.isPickable = true;
          }
          node.getChildMeshes().forEach((mesh) => {
            mesh.isPickable = true;
          });
          if (node.metadata?.cadDrawing) {
            this.applyCadDisplayOpacity(node, this.getCadDisplayOpacity(node));
          }
          if (this.isLocatorWireCubeNode(node)) {
            const locatorDimensions = this.getLocatorDimensions(node);
            this.mergeNodeEditorMetadata(node, {
              locatorDimensions,
              locatorAnimationConnection: this.getLocatorAnimationConnection(node)
            });
            this.applyLocatorDimensionsToNode(node, locatorDimensions);
          }
        }
      });
    this.getScenePoiNodes().forEach((node) => this.ensureNodePoiMetadata(node));

    this.startLoadedCadChunkRestore(options);
    await this.restoreLoadedCadMedia();
    this.scene.rootNodes.forEach((node) => {
      if (node instanceof TransformNode && node.metadata?.cadDrawing) {
        this.applyCadDisplayOpacity(node, this.getCadDisplayOpacity(node));
      }
    });

    const restoredAssets = this.getSerializedAssets(serializedScene);
    this.assets.splice(0, this.assets.length, ...restoredAssets);
    this.callbacks.onAssetsChange([...this.assets]);
  }

  /** 启动后台 CAD 侧车恢复，避免项目重开被百万级线段阻塞。 */
  private startLoadedCadChunkRestore(options: SerializedSceneLoadOptions): void {
    if (!options.loadCadLineChunk && !options.loadCadLineChunks) {
      return;
    }

    const tasks: CadRestoreChunkTask[] = [];
    this.scene.rootNodes.forEach((root) => {
      if (!(root instanceof TransformNode)) {
        return;
      }

      const manifest = this.getCadChunkManifest(root);
      if (!manifest) {
        return;
      }

      this.disposeCadChunkMeshes(root);
      manifest.chunks.forEach((chunk) => tasks.push({ root, chunk }));
    });

    if (tasks.length === 0) {
      return;
    }

    const generation = this.cadRestoreGeneration;
    void this.restoreLoadedCadChunkMeshes(tasks, options, generation);
  }

  /** 后台分批读取 CAD 侧车并合并创建 LinesMesh。 */
  private async restoreLoadedCadChunkMeshes(
    tasks: CadRestoreChunkTask[],
    options: SerializedSceneLoadOptions,
    generation: number
  ): Promise<void> {
    const builders = new Map<string, CadRestoreMergedLineBuilder>();
    const totalChunks = tasks.length;
    const totalSegments = tasks.reduce((sum, task) => sum + task.chunk.segmentCount, 0);
    let restoredChunks = 0;
    let renderedChunks = 0;
    let skippedChunks = 0;

    const report = (message: string) => {
      options.onCadRestoreProgress?.({
        phase: "restoring",
        parsedEntities: 0,
        emittedSegments: totalSegments,
        totalSegments,
        chunkCount: totalChunks,
        restoredChunks,
        renderedChunks,
        skippedChunks,
        message
      });
    };

    const isActive = () => generation === this.cadRestoreGeneration && !this.scene.isDisposed;
    report("正在恢复 CAD 线段侧车");

    try {
      for (let index = 0; index < tasks.length && isActive(); index += CAD_RESTORE_BATCH_CHUNKS) {
        const batch = tasks.slice(index, index + CAD_RESTORE_BATCH_CHUNKS);
        const buffers = await this.loadCadRestoreBatch(batch, options);
        if (!isActive()) {
          return;
        }

        for (const task of batch) {
          const buffer = buffers.get(task.chunk.chunkId);
          if (!buffer) {
            skippedChunks += 1;
            continue;
          }

          try {
            renderedChunks += this.appendCadRestoreChunkToBuilders(builders, task.root, task.chunk, buffer);
            restoredChunks += 1;
          } catch (error) {
            skippedChunks += 1;
            this.addCadMetadataWarning(task.root, getEngineErrorMessage(error, `CAD 线段块 ${task.chunk.chunkId} 恢复失败，已跳过。`));
          }

          if (renderedChunks > 0 && renderedChunks % CAD_RESTORE_YIELD_MESHES === 0) {
            report("正在创建 CAD 线段网格");
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
            if (!isActive()) {
              return;
            }
          }
        }

        report("正在读取 CAD 线段侧车");
      }

      builders.forEach((builder) => {
        if (builder.segmentCount > 0 && isActive()) {
          this.flushCadRestoreBuilder(builder);
          renderedChunks += 1;
        }
      });

      if (!isActive()) {
        return;
      }

      report("CAD 线段恢复完成");
      this.refreshSceneGraph();
      this.callbacks.onStatsChange(this.collectStats());
      this.scene.render();
      options.onCadRestoreProgress?.({
        phase: "done",
        parsedEntities: 0,
        emittedSegments: totalSegments,
        totalSegments,
        chunkCount: totalChunks,
        restoredChunks,
        renderedChunks,
        skippedChunks,
        message: "CAD 图纸恢复完成"
      });
    } catch (error) {
      if (isActive()) {
        options.onCadRestoreProgress?.({
          phase: "done",
          parsedEntities: 0,
          emittedSegments: totalSegments,
          totalSegments,
          chunkCount: totalChunks,
          restoredChunks,
          renderedChunks,
          skippedChunks,
          message: getEngineErrorMessage(error, "CAD 图纸恢复失败。")
        });
      }
    }
  }

  /** 删除 CAD 根节点下旧的线段 mesh，避免侧车恢复后和序列化残留重复显示。 */
  private disposeCadChunkMeshes(root: TransformNode): void {
    root.getChildMeshes(false).forEach((mesh) => {
      const metadata = this.asMetadataObject(mesh.metadata);
      if (metadata.cadPrimitive === "polyline") {
        mesh.dispose(false, false);
      }
    });
  }

  /** 批量读取一组 CAD chunk，pack 文件只读取一次，再按 manifest 偏移切出单个 chunk。 */
  private async loadCadRestoreBatch(
    tasks: CadRestoreChunkTask[],
    options: SerializedSceneLoadOptions
  ): Promise<Map<string, ArrayBuffer>> {
    const requests = new Map<string, CadLineChunkLoadRequest>();
    tasks.forEach((task) => {
      const projectFile = this.getCadChunkProjectFile(task.chunk);
      if (!projectFile) {
        this.addCadMetadataWarning(task.root, `CAD 线段块 ${task.chunk.chunkId} 缺少项目侧车文件路径，已跳过恢复。`);
        return;
      }

      const expectedByteLength = task.chunk.packProjectFile ? task.chunk.packByteLength : this.getCadChunkExpectedByteLength(task.chunk);
      const previous = requests.get(projectFile);
      if (!previous) {
        requests.set(projectFile, { projectFile, expectedByteLength });
      } else if (previous.expectedByteLength === undefined && expectedByteLength !== undefined) {
        previous.expectedByteLength = expectedByteLength;
      }
    });

    const loaded = new Map<string, ArrayBuffer>();
    if (requests.size === 0) {
      return loaded;
    }

    const requestList = [...requests.values()];
    const results = options.loadCadLineChunks
      ? await options.loadCadLineChunks(requestList)
      : await Promise.all(
          requestList.map(async (request): Promise<CadLineChunkLoadResult> => {
            if (!options.loadCadLineChunk) {
              return { projectFile: request.projectFile, error: "当前运行环境不支持读取 CAD 线段侧车文件。" };
            }

            try {
              const data = await options.loadCadLineChunk(request.projectFile);
              return { projectFile: request.projectFile, data };
            } catch (error) {
              return { projectFile: request.projectFile, error: getEngineErrorMessage(error, "CAD 线段侧车文件读取失败。") };
            }
          })
        );

    const loadedFiles = new Map<string, CadLineChunkLoadResult>();
    results.forEach((result) => loadedFiles.set(result.projectFile, result));
    tasks.forEach((task) => {
      const projectFile = this.getCadChunkProjectFile(task.chunk);
      if (!projectFile) {
        return;
      }

      const result = loadedFiles.get(projectFile);
      if (!result?.data) {
        this.addCadMetadataWarning(task.root, result?.error ?? `CAD 线段块 ${task.chunk.chunkId} 读取失败，已跳过恢复。`);
        return;
      }

      const chunkBuffer = this.sliceCadChunkBuffer(task.chunk, result.data);
      if (!chunkBuffer) {
        this.addCadMetadataWarning(task.root, `CAD 线段块 ${task.chunk.chunkId} 数据长度异常，已跳过恢复。`);
        return;
      }

      loaded.set(task.chunk.chunkId, chunkBuffer);
    });
    return loaded;
  }

  /** 取得 CAD chunk 所在的项目资产文件，优先新 pack 格式，兼容旧单 chunk 文件。 */
  private getCadChunkProjectFile(chunk: CadLineChunkManifest): string | undefined {
    return chunk.packProjectFile ?? chunk.projectFile;
  }

  /** 单个 chunk 按 Float32 positions 计算应有字节数。 */
  private getCadChunkExpectedByteLength(chunk: CadLineChunkManifest): number {
    return chunk.segmentCount * 2 * 3 * Float32Array.BYTES_PER_ELEMENT;
  }

  /** 从旧 chunk 文件或新 pack 文件中切出单个 chunk 的精确 ArrayBuffer。 */
  private sliceCadChunkBuffer(chunk: CadLineChunkManifest, source: ArrayBuffer): ArrayBuffer | null {
    const expectedByteLength = this.getCadChunkExpectedByteLength(chunk);
    if (chunk.packProjectFile) {
      const byteOffset = chunk.byteOffset ?? -1;
      const byteLength = chunk.byteLength ?? -1;
      if (byteOffset < 0 || byteLength !== expectedByteLength || byteOffset + byteLength > source.byteLength) {
        return null;
      }

      return source.slice(byteOffset, byteOffset + byteLength);
    }

    return source.byteLength === expectedByteLength ? source : null;
  }

  /** 将一个 CAD chunk 追加到同样式合并 builder，达到顶点上限后刷出 mesh。 */
  private appendCadRestoreChunkToBuilders(
    builders: Map<string, CadRestoreMergedLineBuilder>,
    root: TransformNode,
    chunk: CadLineChunkManifest,
    buffer: ArrayBuffer
  ): number {
    let renderedMeshes = 0;
    let sourceOffset = 0;
    const source = new Float32Array(buffer);
    let remainingSegments = chunk.segmentCount;

    while (remainingSegments > 0) {
      const builder = this.getCadRestoreBuilder(builders, root, chunk.style);
      const writableSegments = Math.min(remainingSegments, CAD_RESTORE_MESH_SEGMENTS - builder.segmentCount);
      const floatCount = writableSegments * 2 * 3;
      builder.positions.set(source.subarray(sourceOffset, sourceOffset + floatCount), builder.offset);
      builder.offset += floatCount;
      builder.segmentCount += writableSegments;
      builder.chunkIds.push(chunk.chunkId);
      sourceOffset += floatCount;
      remainingSegments -= writableSegments;

      if (builder.segmentCount >= CAD_RESTORE_MESH_SEGMENTS) {
        this.flushCadRestoreBuilder(builder);
        renderedMeshes += 1;
      }
    }

    return renderedMeshes;
  }

  /** 获取同 CAD 根节点、同图层颜色透明度的恢复合并 builder。 */
  private getCadRestoreBuilder(
    builders: Map<string, CadRestoreMergedLineBuilder>,
    root: TransformNode,
    style: CadDxfLineChunkStyle
  ): CadRestoreMergedLineBuilder {
    const key = `${root.uniqueId}|${style.layer}|${style.color}|${style.alpha}|${style.entityType}`;
    let builder = builders.get(key);
    if (!builder) {
      builder = {
        root,
        style,
        chunkIds: [],
        positions: new Float32Array(CAD_RESTORE_MESH_SEGMENTS * 2 * 3),
        offset: 0,
        segmentCount: 0,
        meshIndex: 0
      };
      builders.set(key, builder);
    }
    return builder;
  }

  /** 把恢复合并 builder 刷成一个 LinesMesh，并复用统一的 chunk mesh 创建路径。 */
  private flushCadRestoreBuilder(builder: CadRestoreMergedLineBuilder): void {
    if (builder.segmentCount === 0) {
      return;
    }

    const positions = builder.segmentCount === CAD_RESTORE_MESH_SEGMENTS ? builder.positions : builder.positions.slice(0, builder.offset);
    const chunkId = `cad-restore-${builder.root.uniqueId}-${builder.style.layer}-${builder.meshIndex}`;
    const mesh = this.createCadLineChunkMesh(builder.root, chunkId, builder.style, builder.segmentCount, positions);
    mesh.doNotSerialize = true;
    mesh.metadata = {
      ...this.asMetadataObject(mesh.metadata),
      cadRestoredChunkIds: [...new Set(builder.chunkIds)]
    };
    builder.meshIndex += 1;
    builder.positions = new Float32Array(CAD_RESTORE_MESH_SEGMENTS * 2 * 3);
    builder.offset = 0;
    builder.segmentCount = 0;
    builder.chunkIds = [];
  }

  /** 从 CAD 根节点 metadata 安全读取侧车 chunk manifest。 */
  private getCadChunkManifest(root: TransformNode): CadChunkManifestMetadata | null {
    const rootMetadata = this.asMetadataObject(root.metadata);
    if (!rootMetadata.cadDrawing) {
      return null;
    }

    const editorMetadata = this.asMetadataObject(rootMetadata.editor);
    const manifest = this.asMetadataObject(editorMetadata.cadChunkManifest);
    if (manifest.version !== 1 || !Array.isArray(manifest.chunks)) {
      return null;
    }

    const chunks = manifest.chunks.filter((chunk): chunk is CadLineChunkManifest => this.isCadLineChunkManifest(chunk));
    if (chunks.length === 0) {
      return null;
    }

    return {
      version: 1,
      sourceFile: typeof manifest.sourceFile === "string" ? manifest.sourceFile : undefined,
      sourcePath: typeof manifest.sourcePath === "string" ? manifest.sourcePath : undefined,
      bounds: this.isCadDxfBounds(manifest.bounds) ? manifest.bounds : undefined,
      rawBounds: this.isCadDxfBounds(manifest.rawBounds) ? manifest.rawBounds : undefined,
      unit: manifest.unit,
      segmentCount: this.getOptionalFiniteNumber(manifest.segmentCount),
      chunkSegmentLimit: this.getOptionalFiniteNumber(manifest.chunkSegmentLimit),
      chunks
    };
  }

  /** 校验单个 CAD chunk manifest，避免损坏项目文件触发无效 typed array 构建。 */
  private isCadLineChunkManifest(value: unknown): value is CadLineChunkManifest {
    const chunk = this.asMetadataObject(value);
    return (
      typeof chunk.chunkId === "string" &&
      typeof chunk.fileName === "string" &&
      (chunk.projectFile === undefined || typeof chunk.projectFile === "string") &&
      (chunk.packFile === undefined || typeof chunk.packFile === "string") &&
      (chunk.packProjectFile === undefined || typeof chunk.packProjectFile === "string") &&
      (chunk.byteOffset === undefined || this.isSafeNonNegativeInteger(chunk.byteOffset)) &&
      (chunk.byteLength === undefined || this.isSafeNonNegativeInteger(chunk.byteLength, CAD_LINE_PACK_MAX_BYTES)) &&
      (chunk.packByteLength === undefined || this.isSafeNonNegativeInteger(chunk.packByteLength, CAD_LINE_PACK_MAX_BYTES)) &&
      this.isCadLineChunkStyle(chunk.style) &&
      this.isSafeNonNegativeInteger(chunk.segmentCount, CAD_RESTORE_MESH_SEGMENTS) &&
      this.isCadDxfBounds(chunk.bounds)
    );
  }

  /** 校验 CAD 线段样式 metadata，保证恢复时颜色和图层可用。 */
  private isCadLineChunkStyle(value: unknown): value is CadDxfLineChunkStyle {
    const style = this.asMetadataObject(value);
    return (
      typeof style.layer === "string" &&
      typeof style.color === "string" &&
      /^#[0-9a-fA-F]{6}$/.test(style.color) &&
      typeof style.alpha === "number" &&
      Number.isFinite(style.alpha) &&
      typeof style.entityType === "string" &&
      this.asMetadataObject(style.style) !== null
    );
  }

  /** 校验 CAD 二维 bounds，恢复相机和诊断信息时不能信任旧项目 JSON。 */
  private isCadDxfBounds(value: unknown): value is CadDxfBounds {
    const bounds = this.asMetadataObject(value);
    return ["minX", "minY", "maxX", "maxY", "centerX", "centerY", "width", "height"].every(
      (key) => typeof bounds[key] === "number" && Number.isFinite(bounds[key])
    );
  }

  /** 读取可选数值 metadata，非数值直接忽略。 */
  private getOptionalFiniteNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  /** 读取 CAD 根节点显示透明度，默认 1 表示不额外降低原始 CAD 线条 alpha。 */
  private getCadDisplayOpacity(root: TransformNode): number {
    const metadata = this.asMetadataObject(root.metadata);
    const editorMetadata = this.asMetadataObject(metadata.editor);
    const cadMetadata = this.asMetadataObject(metadata.cad);
    return this.clampCadDisplayOpacity(
      this.getNumberMetadata(editorMetadata.cadDisplayOpacity, this.getNumberMetadata(cadMetadata.displayOpacity, 1))
    );
  }

  /** CAD 透明度限制在可见范围内，隐藏整张图纸仍使用节点显隐开关。 */
  private clampCadDisplayOpacity(value: number): number {
    return Math.max(0.05, Math.min(1, Number.isFinite(value) ? value : 1));
  }

  /** 把 CAD primitive 自身 alpha 与整张图纸显示透明度相乘。 */
  private getCadDisplayAlpha(root: TransformNode, primitiveAlpha: number): number {
    const baseAlpha = Math.max(0, Math.min(1, Number.isFinite(primitiveAlpha) ? primitiveAlpha : 1));
    return Math.max(0, Math.min(1, baseAlpha * this.getCadDisplayOpacity(root)));
  }

  /** 更新 CAD 根节点透明度 metadata，并同步已创建的所有 CAD 子 mesh。 */
  private applyCadDisplayOpacity(root: TransformNode, opacity: number): void {
    const nextOpacity = this.clampCadDisplayOpacity(opacity);
    const metadata = this.asMetadataObject(root.metadata);
    const editorMetadata = this.asMetadataObject(metadata.editor);
    const cadMetadata = this.asMetadataObject(metadata.cad);
    root.metadata = {
      ...metadata,
      cad: {
        ...cadMetadata,
        displayOpacity: nextOpacity
      },
      editor: {
        ...editorMetadata,
        cadDisplayOpacity: nextOpacity
      }
    };

    root.getChildMeshes(false).forEach((mesh) => {
      if (this.asMetadataObject(mesh.metadata).cadPrimitive) {
        this.applyCadMeshDisplayOpacity(mesh, nextOpacity);
      }
    });
  }

  /** 对单个 CAD mesh 应用整体透明度，不覆盖 metadata 中保存的原始 cadAlpha。 */
  private applyCadMeshDisplayOpacity(mesh: AbstractMesh, opacity: number): void {
    const metadata = this.asMetadataObject(mesh.metadata);
    const fallbackAlpha = mesh instanceof LinesMesh ? mesh.alpha : mesh.material && !(mesh.material instanceof MultiMaterial) ? mesh.material.alpha : 1;
    const baseAlpha = this.getNumberMetadata(metadata.cadAlpha, fallbackAlpha || 1);
    if (typeof metadata.cadAlpha !== "number" || !Number.isFinite(metadata.cadAlpha)) {
      mesh.metadata = { ...metadata, cadAlpha: baseAlpha };
    }
    const finalAlpha = Math.max(0, Math.min(1, baseAlpha * opacity));
    if (mesh instanceof LinesMesh) {
      mesh.alpha = finalAlpha;
    }
    const material = mesh.material;
    if (material && !(material instanceof MultiMaterial)) {
      material.alpha = finalAlpha;
    }
  }

  /** 校验来自项目 JSON 的非负整数，避免损坏 manifest 触发超大 typed array 分配。 */
  private isSafeNonNegativeInteger(value: unknown, maxValue = Number.MAX_SAFE_INTEGER): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maxValue;
  }

  /** 将 CAD 恢复问题写回根节点 metadata，供属性面板和保存后的项目诊断。 */
  private addCadMetadataWarning(root: TransformNode, warning: string): void {
    const rootMetadata = this.asMetadataObject(root.metadata);
    const cadMetadata = this.asMetadataObject(rootMetadata.cad);
    const existingWarnings = Array.isArray(cadMetadata.warnings)
      ? cadMetadata.warnings.filter((item): item is string => typeof item === "string")
      : [];
    root.metadata = {
      ...rootMetadata,
      cad: {
        ...cadMetadata,
        warnings: [...new Set([...existingWarnings, warning])]
      },
      [ROOT_FLAG]: rootMetadata[ROOT_FLAG] ?? true
    };
  }

  /** 保存场景后恢复 CAD 文字和图片贴图，避免 blob URL 或 DynamicTexture 丢失导致图纸空白。 */
  private async restoreLoadedCadMedia(): Promise<void> {
    const tasks: Array<Promise<void>> = [];
    this.scene.rootNodes.forEach((root) => {
      if (!(root instanceof TransformNode)) {
        return;
      }

      const rootMetadata = this.asMetadataObject(root.metadata);
      if (!rootMetadata.cadDrawing) {
        return;
      }

      const cadMetadata = this.asMetadataObject(rootMetadata.cad);
      const context: CadImageRestoreContext = {
        sourcePath: typeof cadMetadata.sourcePath === "string" ? cadMetadata.sourcePath : undefined
      };

      root.getChildMeshes(false).forEach((mesh) => {
        const metadata = this.asMetadataObject(mesh.metadata);
        if (metadata.cadPrimitive === "text") {
          this.restoreCadTextMaterial(mesh);
        } else if (metadata.cadPrimitive === "image") {
          tasks.push(this.restoreCadImageMaterial(mesh, context));
        }
      });
    });

    await Promise.all(tasks);
  }

  /** 根据 CAD 文字 metadata 重建 DynamicTexture，供项目重开后继续显示中文标注。 */
  private restoreCadTextMaterial(mesh: AbstractMesh): void {
    const text = this.getCadTextMetadata(mesh);
    if (!text) {
      return;
    }

    const previousMaterial = mesh.material;
    mesh.material = this.createCadTextMaterial(`${mesh.name} / 恢复文字材质`, `${mesh.name} / 恢复文字纹理`, text);
    if (previousMaterial?.metadata?.cadTextMaterial === true) {
      previousMaterial.dispose(false, true, false);
    }
  }

  /** 根据 CAD 图片 metadata 和原始 DXF 路径重建图片贴图；浏览器无本地路径时保持现状。 */
  private async restoreCadImageMaterial(mesh: AbstractMesh, context: CadImageRestoreContext): Promise<void> {
    const metadata = this.asMetadataObject(mesh.metadata);
    const cadImage = this.asMetadataObject(metadata.cadImage);
    const sourcePath = typeof cadImage.sourcePath === "string" ? cadImage.sourcePath : undefined;
    if (!sourcePath || !context.sourcePath || !window.electronApp?.files?.readLocalReference) {
      return;
    }

    const source = await this.resolveCadImageSource({ sourcePath } as CadDxfImagePrimitive, {
      sourcePath: context.sourcePath,
      relatedFiles: [],
      objectUrls: []
    });
    if (!source) {
      return;
    }

    const previousMaterial = mesh.material;
    mesh.material = this.createCadImageMaterial(`${mesh.name} / 恢复图片材质`, source);
    mesh.metadata = {
      ...metadata,
      cadImage: {
        ...cadImage,
        resolvedFileName: source.fileName,
        source: source.source
      }
    };
    if (previousMaterial?.metadata?.cadImageMaterial === true) {
      previousMaterial.dispose(false, true, false);
    }
  }

  /** 从序列化 metadata 中恢复 CAD 文字绘制所需的最小数据。 */
  private getCadTextMetadata(mesh: AbstractMesh): CadDxfText | null {
    const metadata = this.asMetadataObject(mesh.metadata);
    const rawText = this.asMetadataObject(metadata.cadText);
    if (typeof rawText.text !== "string" || rawText.text.length === 0) {
      return null;
    }

    const color = this.normalizeHexColor(rawText.color) ?? this.normalizeHexColor(metadata.cadColor) ?? "#ffffff";
    const alpha = Math.max(0.01, Math.min(1, this.getNumberMetadata(rawText.alpha, this.getNumberMetadata(metadata.cadAlpha, 1))));
    const height = Math.max(0.001, this.getNumberMetadata(rawText.height, 0.25));
    const width = rawText.width === undefined ? undefined : Math.max(0.001, this.getNumberMetadata(rawText.width, height));
    const align = rawText.align === "center" || rawText.align === "right" ? rawText.align : "left";

    return {
      type: "text",
      entityType: typeof rawText.entityType === "string" ? rawText.entityType : "TEXT",
      layer: typeof rawText.layer === "string" ? rawText.layer : this.getStringMetadata(metadata.cadLayer, "0"),
      color,
      alpha,
      style: this.asMetadataObject(rawText.style) as unknown as CadDxfText["style"],
      text: rawText.text,
      position: { x: 0, y: 0 },
      height,
      rotationDegrees: this.getNumberMetadata(rawText.rotationDegrees, 0),
      widthFactor: Math.max(0.001, this.getNumberMetadata(rawText.widthFactor, 1)),
      align,
      width
    };
  }

  /** 释放单个可编辑节点，包含其子网格和不再被场景引用的独立材质。 */
  private disposeEditableNode(node: TransformNode): void {
    const packageRoot = this.findModelPackageRoot(node);
    if (packageRoot) {
      this.stopModelPackageRuntime(packageRoot, false);
    }
    const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
    const materials = new Set<Material>();
    meshes.forEach((mesh) => this.collectMaterialTree(mesh.material, materials));
    node.dispose(false, false);
    this.disposeUnusedMaterials(materials);
  }

  /** 清理某个节点层级下所有 POI 的运行态对象，复制和删除前都需要先调用。 */
  private cleanupPoiRuntimeInHierarchy(node: TransformNode): void {
    this.getNodeHierarchy(node).forEach((item) => {
      if (item instanceof TransformNode && this.isPoiNode(item)) {
        this.sceneBusinessRuntime.cleanupPoi(item);
      }
    });
  }

  /** 释放内部剪贴板模板，并重置复制粘贴状态。 */
  private disposeClipboardTemplate(): void {
    if (this.clipboardTemplateNode) {
      this.disposeClonedNodeHierarchy(this.clipboardTemplateNode);
    }
    this.clipboardTemplateNode = null;
    this.clipboardBaseName = "";
    this.clipboardPasteCount = 0;
  }

  /** 释放复制粘贴产生的节点层级，材质独立释放但保留可能共享的贴图资源。 */
  private disposeClonedNodeHierarchy(node: TransformNode): void {
    const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
    const materials = new Set<Material>();
    meshes.forEach((mesh) => this.collectMaterialTree(mesh.material, materials));
    node.dispose(false, false);
    this.disposeUnusedMaterials(materials);
  }

  /** 递归收集 MultiMaterial 及其子材质，确保深克隆出来的子材质也能被释放。 */
  private collectMaterialTree(material: Material | null, output: Set<Material>): void {
    if (!material || output.has(material)) {
      return;
    }

    output.add(material);
    if (material instanceof MultiMaterial) {
      material.subMaterials.forEach((subMaterial) => this.collectMaterialTree(subMaterial, output));
    }
  }

  /** 只释放当前场景不再被任何网格引用的材质，避免副本删除误伤源模型资源。 */
  private disposeUnusedMaterials(materials: Set<Material | null>): void {
    materials.forEach((material) => {
      if (!material || this.isMaterialUsedBySceneMesh(material)) {
        return;
      }
      // MultiMaterial 的子材质已由 collectMaterialTree 递归收集，逐个经过引用检查后再释放。
      material.dispose(false, material.metadata?.cadTextMaterial === true || material.metadata?.cadImageMaterial === true, false);
    });
  }

  /** 判断材质是否仍被场景中的其它网格引用。 */
  private isMaterialUsedBySceneMesh(material: Material): boolean {
    return this.scene.meshes.some((mesh) => {
      const meshMaterial = mesh.material;
      return meshMaterial === material || (meshMaterial instanceof MultiMaterial && meshMaterial.subMaterials.includes(material));
    });
  }

  /** 克隆可编辑节点层级，失败时返回 null 以便快捷键不拦截默认行为。 */
  private cloneEditableNode(sourceNode: TransformNode, name: string, parent: TransformNode | null = null): TransformNode | null {
    const marker = this.markCloneSourceHierarchy(sourceNode);
    let clone: TransformNode | null = null;
    try {
      const clonedNode = sourceNode.clone(name, parent, false);
      if (clonedNode instanceof TransformNode) {
        clone = clonedNode;
        this.cloneSourceNodeMaps.set(clone, this.createCloneSourceNodeMap(clone, marker.sourceByToken));
      }
      return clone;
    } finally {
      this.restoreCloneSourceTokens(marker.snapshots);
      if (clone) {
        this.clearCloneSourceTokens(clone);
      }
    }
  }

  /** 为源层级临时写入克隆 token，避免按场景枚举顺序猜测源节点与副本节点关系。 */
  private markCloneSourceHierarchy(sourceRoot: TransformNode): CloneSourceTokenMarkResult {
    const sourceByToken = new Map<string, Node>();
    const snapshots: CloneSourceTokenSnapshot[] = [];
    const operationToken = `${this.cloneTokenSeed++}`;
    this.getNodeHierarchy(sourceRoot).forEach((node) => {
      const metadata = this.asMetadataObject(node.metadata);
      const token = `${operationToken}:${node.uniqueId}`;
      snapshots.push({
        node,
        hadToken: Object.prototype.hasOwnProperty.call(metadata, CLONE_SOURCE_TOKEN_KEY),
        previousToken: metadata[CLONE_SOURCE_TOKEN_KEY]
      });
      sourceByToken.set(token, node);
      node.metadata = {
        ...metadata,
        [CLONE_SOURCE_TOKEN_KEY]: token
      };
    });
    return { sourceByToken, snapshots };
  }

  /** 从副本层级读取克隆 token 并建立反查表，随后清掉副本上的临时标记。 */
  private createCloneSourceNodeMap(cloneRoot: TransformNode, sourceByToken: Map<string, Node>): WeakMap<Node, Node> {
    const cloneSourceMap = new WeakMap<Node, Node>();
    this.getNodeHierarchy(cloneRoot).forEach((cloneNode) => {
      const metadata = this.asMetadataObject(cloneNode.metadata);
      const token = typeof metadata[CLONE_SOURCE_TOKEN_KEY] === "string" ? metadata[CLONE_SOURCE_TOKEN_KEY] : "";
      const sourceNode = token ? sourceByToken.get(token) : undefined;
      if (sourceNode) {
        cloneSourceMap.set(cloneNode, sourceNode);
      }
      this.clearCloneSourceToken(cloneNode);
    });
    return cloneSourceMap;
  }

  /** 恢复源节点原有 token 状态，保证临时克隆标记不会进入场景保存或后续运行态。 */
  private restoreCloneSourceTokens(snapshots: CloneSourceTokenSnapshot[]): void {
    snapshots.forEach((snapshot) => {
      const metadata = { ...this.asMetadataObject(snapshot.node.metadata) };
      if (snapshot.hadToken) {
        metadata[CLONE_SOURCE_TOKEN_KEY] = snapshot.previousToken;
      } else {
        delete metadata[CLONE_SOURCE_TOKEN_KEY];
      }
      snapshot.node.metadata = metadata;
    });
  }

  /** 清理副本层级残留的克隆 token，避免异常路径把内部标记带进真实节点。 */
  private clearCloneSourceTokens(root: TransformNode): void {
    this.getNodeHierarchy(root).forEach((node) => this.clearCloneSourceToken(node));
  }

  /** 清理单个节点上的克隆 token。 */
  private clearCloneSourceToken(node: Node): void {
    const metadata = this.asMetadataObject(node.metadata);
    if (!Object.prototype.hasOwnProperty.call(metadata, CLONE_SOURCE_TOKEN_KEY)) {
      return;
    }

    const nextMetadata = { ...metadata };
    delete nextMetadata[CLONE_SOURCE_TOKEN_KEY];
    node.metadata = nextMetadata;
  }

  /** 生成模型阵列失败结果，保证 App 层不需要重复拼装错误结构。 */
  private createModelArrayFailure(message: string): ModelArrayResult {
    return {
      success: false,
      createdCount: 0,
      message
    };
  }

  /** 计算模型阵列的基础步长；Shelf 沿 X 阵列时按支架中心距对齐，让 0 间距表示中间立柱重合。 */
  private calculateModelArrayBaseStep(
    sourceRoot: TransformNode,
    sourceBounds: NodeWorldBounds,
    axis: ModelArrayAxis,
    sourceModelPackage: ModelPackageManifest | undefined
  ): number {
    const fallbackStep = axis === "x" || axis === "-x" ? sourceBounds.size.x : sourceBounds.size.z;
    if (axis !== "x" && axis !== "-x") {
      return fallbackStep;
    }

    return this.calculateShelfModelArrayPitch(sourceRoot, sourceModelPackage) ?? fallbackStep;
  }

  /** Shelf 货架阵列复用模型包内部列距语义，优先用当前世界坐标里的左右支架中心距。 */
  private calculateShelfModelArrayPitch(root: TransformNode, manifest: ModelPackageManifest | undefined): number | null {
    if (!this.isShelfModelPackageRoot(root, manifest)) {
      return null;
    }

    const supportCenters = this.collectShelfArraySupportCenters(root);
    if (supportCenters.length >= 2) {
      const pitch = Math.max(...supportCenters) - Math.min(...supportCenters);
      if (Number.isFinite(pitch) && pitch > MODEL_ARRAY_MIN_AUTO_STEP_METERS) {
        return pitch;
      }
    }

    const values = manifest ? this.getModelPackageValues(root, manifest) : this.getRawModelPackageValues(root);
    const cellWidth = Number(values.cellWidth);
    const columnCount = Math.max(1, Math.round(Number(values.columnCount) || 1));
    const fallbackPitch = cellWidth * columnCount;
    return Number.isFinite(fallbackPitch) && fallbackPitch > MODEL_ARRAY_MIN_AUTO_STEP_METERS ? fallbackPitch : null;
  }

  /** 判断当前模型包是否是 Shelf；只对明确携带 shelf 标识的模型包启用支架中心距阵列。 */
  private isShelfModelPackageRoot(root: TransformNode, manifest: ModelPackageManifest | undefined): boolean {
    const instance = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageInstance);
    if (!manifest && (typeof instance.packageId !== "string" || typeof instance.assetId !== "string")) {
      return false;
    }

    const values = manifest ? this.getModelPackageValues(root, manifest) : this.getRawModelPackageValues(root);
    if (String(values.modelKey ?? "").trim().toLowerCase() === SHELF_MODEL_KEY) {
      return true;
    }

    const hints = [
      manifest?.packageId,
      manifest?.displayName,
      manifest?.rootDirectoryName,
      manifest?.primaryModelFile,
      manifest?.scriptFile,
      manifest?.runtimeScriptFile,
      manifest?.sourceRoot,
      this.getNodeSourceFileName(root)
    ];
    return hints.some((hint) => this.isShelfModelPackageHint(hint));
  }

  /** 识别模型包 manifest 中的 shelf 路径或文件名，避免普通用户命名误触发。 */
  private isShelfModelPackageHint(value: string | undefined): boolean {
    return Boolean(value && /(?:^|[\\/_.\-\s])shelf(?:[\\/_.\-\s]|$)/i.test(value));
  }

  /** 收集 Shelf 左右支架中心点，去重后用于判断相邻货架应重合的边界中心线。 */
  private collectShelfArraySupportCenters(root: TransformNode): number[] {
    const centers = this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root && this.isShelfArraySupportNode(node))
      .map((node) => this.getNodeWorldBounds(node, true)?.center.x)
      .filter((center): center is number => typeof center === "number" && Number.isFinite(center))
      .sort((left, right) => left - right);

    return centers.filter((center, index) => index === 0 || Math.abs(center - centers[index - 1]) > MODEL_ARRAY_MIN_AUTO_STEP_METERS);
  }

  /** Shelf 支架节点可能来自原始 GLB 名、运行时 sourceNodeName 或克隆名前缀，统一按名称片段识别。 */
  private isShelfArraySupportNode(node: Node): boolean {
    const metadata = this.asMetadataObject(node.metadata);
    const parentName = node.parent ? node.parent.name : "";
    const candidates = [metadata.sourceNodeName, node.name, parentName].filter((value): value is string => typeof value === "string");
    return candidates.some((candidate) => {
      const tokens = candidate
        .replace(SHELF_ARRAY_RUNTIME_NAME_SUFFIX_PATTERN, "")
        .split(/[._\s-]+/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
      return SHELF_ARRAY_SHARED_SUPPORT_NODE_NAMES.some((supportName) => tokens.includes(supportName.toLowerCase()));
    });
  }

  /** 收敛模型阵列目标，只允许普通 Mesh/Transform 模型进入批量克隆流程。 */
  private getModelArrayTargetRoot(node: TransformNode | null | undefined): TransformNode | null {
    const root = node ? this.findModelPackageRoot(node) ?? node : null;
    if (
      !root ||
      root.metadata?.[HELPER_FLAG] ||
      this.isNodeLocked(root) ||
      this.isEditorGroup(root) ||
      this.isCadDrawingNode(root) ||
      this.isPoiNode(root) ||
      this.isLocatorWireCubeNode(root)
    ) {
      return null;
    }

    const kind = this.getNodeKind(root);
    return kind === "Mesh" || kind === "Transform" ? root : null;
  }

  /** 按节点源文件在资产记录里查找可聚焦卡片，兼容保存恢复后的项目相对路径。 */
  private findAssetBySourceFile(sourceFile: string): AssetRecord | undefined {
    const sourceLeaf = this.getFileName(sourceFile);
    return this.assets.find((asset) => {
      if (asset.name === sourceLeaf || asset.name === sourceFile) {
        return true;
      }

      const projectFiles = [asset.projectFile, ...(asset.projectFiles ?? [])].filter((file): file is string => Boolean(file));
      return projectFiles.some((projectFile) => this.getFileName(projectFile) === sourceLeaf || projectFile === sourceFile);
    });
  }

  /** 从基础对象 metadata 读取资源库卡片类型，非法旧值不会进入 UI 命令。 */
  private getPrimitiveKindForAssetFocus(node: TransformNode): PrimitiveKind | null {
    const primitive = this.asMetadataObject(node.metadata).primitive;
    return primitive === "cube" ||
      primitive === "sphere" ||
      primitive === "cylinder" ||
      primitive === "ground" ||
      primitive === "light" ||
      primitive === "locatorWireCube"
      ? primitive
      : null;
  }

  /** 按层级树顺序收集可被单选命令访问的节点，供 Ctrl+I 在单选结构下循环切换。 */
  private getSelectableSceneGraphNodes(): TransformNode[] {
    const output: TransformNode[] = [];
    const visit = (node: Node): void => {
      if (node.metadata?.[HELPER_FLAG]) {
        return;
      }

      if (node instanceof TransformNode && this.isSceneGraphDisplayNode(node) && !this.isNodeLocked(node)) {
        output.push(node);
        if (!this.isEditorGroup(node)) {
          return;
        }
      }

      this.getVisibleChildren(node).forEach(visit);
    };

    this.scene.rootNodes.forEach(visit);
    return output;
  }

  /** 将世界方向位移换算成节点父级局部坐标，保证 group 内阵列仍沿场景 X/Z 展开。 */
  private worldDeltaToParentLocalDelta(node: TransformNode, worldDelta: Vector3): Vector3 {
    if (worldDelta.lengthSquared() <= 0) {
      return Vector3.Zero();
    }

    const parent = node.parent;
    if (!(parent instanceof TransformNode)) {
      return worldDelta.clone();
    }

    parent.computeWorldMatrix(true);
    return Vector3.TransformNormal(worldDelta, Matrix.Invert(parent.getWorldMatrix()));
  }

  /** 准备复制出的节点层级，确保 metadata、拾取状态和材质都独立且符合编辑器约定。 */
  private prepareClonedHierarchy(cloneRoot: TransformNode, sourceRoot: TransformNode, asClipboardTemplate: boolean): void {
    const cloneSourceMap = this.cloneSourceNodeMaps.get(cloneRoot);
    const sourceNodes = this.getNodeHierarchy(sourceRoot);
    const cloneNodes = this.getNodeHierarchy(cloneRoot);
    cloneNodes.forEach((cloneNode, index) => {
      const sourceNode = cloneSourceMap?.get(cloneNode) ?? sourceNodes[index] ?? cloneNode;
      const metadata = this.deepCloneMetadata(sourceNode.metadata);
      if (asClipboardTemplate) {
        metadata[HELPER_FLAG] = true;
      } else {
        delete metadata[HELPER_FLAG];
      }
      if (cloneNode === cloneRoot) {
        metadata[ROOT_FLAG] = !asClipboardTemplate;
        this.resetClonedModelPackageRuntimeMetadata(metadata);
      } else {
        this.restoreClonedChildNodeName(cloneNode, sourceNode);
      }
      cloneNode.metadata = metadata;
      cloneNode.doNotSerialize = asClipboardTemplate;
      if (cloneNode instanceof AbstractMesh) {
        cloneNode.isPickable = !asClipboardTemplate;
      }
    });
    this.cloneSourceNodeMaps.delete(cloneRoot);
    this.prepareModelPackageCloneBaseline(cloneRoot, sourceRoot, asClipboardTemplate);

    const cloneMeshes = cloneRoot instanceof AbstractMesh ? [cloneRoot, ...cloneRoot.getChildMeshes()] : cloneRoot.getChildMeshes();
    this.cloneHierarchyMaterials(cloneMeshes, asClipboardTemplate);
  }

  /** 克隆模型包时先按源基线收敛副本节点，再清除几何基线等待副本独立重建运行态。 */
  private prepareModelPackageCloneBaseline(cloneRoot: TransformNode, sourceRoot: TransformNode, asClipboardTemplate: boolean): void {
    let runtimeMetadataUpdated = false;
    const editorMetadata = this.getNodeEditorMetadata(cloneRoot);
    const runtimeMetadata = { ...this.asMetadataObject(editorMetadata.modelPackageRuntime) };

    if (this.isOpaqueRollerConveyorPackage(cloneRoot)) {
      const sourceBaseline = this.readOpaqueRollerConveyorBaseline(sourceRoot);
      if (sourceBaseline) {
        this.restoreOpaqueRollerConveyorBaseline(cloneRoot, sourceBaseline);
      }
      this.disposeGeneratedRollerCountNodes(cloneRoot, true);
      this.clearOpaqueRollerConveyorCloneRuntimeMetadata(runtimeMetadata);
      runtimeMetadataUpdated = true;
    }

    if (this.isOpaqueChainConveyorPackage(cloneRoot)) {
      const sourceBaseline =
        this.readOpaqueChainConveyorBaseline(sourceRoot) ??
        (sourceRoot.metadata?.[HELPER_FLAG] ? null : this.ensureOpaqueChainConveyorBaseline(sourceRoot));
      this.clearOpaqueChainConveyorCloneRuntimeMetadata(runtimeMetadata);
      if (sourceBaseline) {
        runtimeMetadata.opaqueChainConveyorBaseline = this.createOpaqueChainConveyorBaselineMetadata(sourceBaseline);
      }
      if (!asClipboardTemplate) {
        this.makeOpaqueChainConveyorDeformableGeometryUnique(cloneRoot);
        if (sourceBaseline) {
          this.restoreOpaqueChainConveyorBaseline(cloneRoot, sourceBaseline);
        }
        this.disposeGeneratedChainConveyorNodes(cloneRoot);
        const cloneBaseline = this.captureOpaqueChainConveyorBaseline(cloneRoot);
        if (cloneBaseline) {
          runtimeMetadata.opaqueChainConveyorBaseline = this.createOpaqueChainConveyorBaselineMetadata(cloneBaseline);
        }
      }
      runtimeMetadataUpdated = true;
    }

    if (runtimeMetadataUpdated) {
      this.mergeNodeEditorMetadata(cloneRoot, {
        modelPackageRuntime: runtimeMetadata
      });
    }
  }

  /** Babylon 克隆会给子节点名追加根节点前缀，这里恢复源节点名，保证模型包按固定物理节点名继续参数化。 */
  private restoreClonedChildNodeName(cloneNode: Node, sourceNode: Node): void {
    if (typeof sourceNode.name !== "string" || sourceNode.name.length === 0) {
      return;
    }

    cloneNode.name = sourceNode.name;
  }

  /** 链条机会做顶点级长度/宽度变形，应用参数前必须拆出独立 Geometry，避免共享几何把副本和源实例绑在一起。 */
  private makeOpaqueChainConveyorDeformableGeometryUnique(root: TransformNode): void {
    const nodesByName = this.getOpaqueChainConveyorNodesByName(root);
    const meshes = new Set<Mesh>();
    const addMesh = (mesh: Mesh): void => {
      if (mesh.getTotalVertices() > 0 && !this.hasGeneratedRuntimeAncestorForBaseline(mesh, root)) {
        meshes.add(mesh);
      }
    };

    OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.forEach((nodeName) => {
      const node = nodesByName.get(nodeName);
      if (!node) {
        return;
      }
      if (node instanceof Mesh) {
        addMesh(node);
      }
      this.getOpaqueChainConveyorLengthGeometryMeshes(node).forEach(addMesh);
    });

    meshes.forEach((mesh) => {
      if (mesh.geometry && mesh.geometry.meshes.length > 1) {
        mesh.makeGeometryUnique();
      }
    });
    this.refreshNodeWorldMatrices(root);
  }

  /** 重置克隆实例的模型包运行态缓存，动态参数仍从 modelPackageInstance.values 继承。 */
  private resetClonedModelPackageRuntimeMetadata(metadata: Record<string, unknown>): void {
    const editorMetadata = this.asMetadataObject(metadata.editor);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    if (typeof instance.packageId !== "string" || typeof instance.assetId !== "string") {
      return;
    }

    const runtimeMetadata = { ...this.asMetadataObject(editorMetadata.modelPackageRuntime) };
    this.clearOpaqueRollerConveyorCloneRuntimeMetadata(runtimeMetadata);
    this.clearOpaqueChainConveyorCloneRuntimeMetadata(runtimeMetadata);
    metadata.editor = {
      ...editorMetadata,
      modelPackageRuntime: {
        ...runtimeMetadata,
        warning: "",
        parametricRootScaling: snapshotVector(this.createDefaultParametricRootScaling())
      }
    };
  }

  /** 按父子关系递归收集完整节点层级，覆盖 glTF 中常见的空 TransformNode。 */
  private getNodeHierarchy(root: Node): Node[] {
    const output: Node[] = [root];
    const visit = (node: Node): void => {
      this.getSceneChildren(node, true).forEach((child) => {
        output.push(child);
        visit(child);
      });
    };
    visit(root);
    return output;
  }

  /** 为复制层级克隆独立材质，避免改色或删除副本时影响原模型。 */
  private cloneHierarchyMaterials(meshes: AbstractMesh[], asClipboardTemplate: boolean): void {
    const materialClones = new Map<Material, Material>();
    meshes.forEach((mesh) => {
      const material = mesh.material;
      if (!material) {
        return;
      }

      let clonedMaterial = materialClones.get(material);
      if (!clonedMaterial) {
        const materialClone = this.cloneMaterialForDuplicate(material, asClipboardTemplate);
        if (!materialClone) {
          return;
        }
        clonedMaterial = materialClone;
        materialClones.set(material, clonedMaterial);
      }
      mesh.material = clonedMaterial;
    });
  }

  /** 克隆材质；MultiMaterial 需要深克隆子材质，避免子材质继续共享源模型资源。 */
  private cloneMaterialForDuplicate(material: Material, asClipboardTemplate: boolean): Material | null {
    const clonedMaterial =
      material instanceof MultiMaterial ? material.clone(`${material.name} 副本`, true) : material.clone(`${material.name} 副本`);
    if (!clonedMaterial) {
      return null;
    }

    clonedMaterial.doNotSerialize = asClipboardTemplate;
    if (clonedMaterial instanceof MultiMaterial) {
      clonedMaterial.subMaterials.forEach((subMaterial) => {
        if (subMaterial) {
          subMaterial.doNotSerialize = asClipboardTemplate;
        }
      });
    }
    return clonedMaterial;
  }

  /** 深拷贝节点元数据，避免复制模板、副本和源对象共享嵌套引用。 */
  private deepCloneMetadata(metadata: unknown): Record<string, unknown> {
    const metadataObject = this.asMetadataObject(metadata);
    try {
      return structuredClone(metadataObject) as Record<string, unknown>;
    } catch {
      try {
        return JSON.parse(JSON.stringify(metadataObject)) as Record<string, unknown>;
      } catch {
        return { ...metadataObject };
      }
    }
  }

  /** 生成当前场景中唯一的副本名称，避免多次粘贴时层级树出现重名。 */
  private createUniqueCopyName(baseName: string): string {
    const copyBaseName = `${baseName || "模型"} 副本`;
    let candidate = copyBaseName;
    let index = 2;
    while (this.scene.getNodeByName(candidate)) {
      candidate = `${copyBaseName} ${index}`;
      index += 1;
    }
    return candidate;
  }

  /** 生成模型阵列副本名称，按创建顺序保持层级树可读且避免重名。 */
  private createUniqueArrayCopyName(baseName: string, arrayIndex: number): string {
    const arrayBaseName = `${baseName || "模型"} 阵列 ${arrayIndex}`;
    let candidate = arrayBaseName;
    let index = 2;
    while (this.scene.getNodeByName(candidate)) {
      candidate = `${arrayBaseName} 副本 ${index}`;
      index += 1;
    }
    return candidate;
  }

  /** 收集场景中已有业务资产编号，供阵列副本生成不冲突的新编号。 */
  private collectSceneAssetCodes(): Set<string> {
    const assetCodes = new Set<string>();
    [...this.scene.transformNodes, ...this.scene.meshes].forEach((node) => {
      if (!(node instanceof TransformNode) || node.metadata?.[HELPER_FLAG]) {
        return;
      }

      const assetCode = this.getNodeAssetInfo(node).assetCode.trim();
      if (assetCode) {
        assetCodes.add(assetCode);
      }
    });
    return assetCodes;
  }

  /** 根据源资产编号生成递增编号，源 ABC 会生成 ABC-1、ABC-2 并自动跳过冲突。 */
  private createUniqueArrayAssetCode(sourceAssetCode: string, usedAssetCodes: Set<string>): string {
    let index = 1;
    let candidate = `${sourceAssetCode}-${index}`;
    while (usedAssetCodes.has(candidate)) {
      index += 1;
      candidate = `${sourceAssetCode}-${index}`;
    }
    usedAssetCodes.add(candidate);
    return candidate;
  }

  /** 生成当前场景中唯一的分组名称，避免连续新建时树中出现重名。 */
  private createUniqueGroupName(): string {
    const baseName = "新建Group";
    let candidate = baseName;
    let index = 2;
    while (this.scene.getNodeByName(candidate)) {
      candidate = `${baseName} ${index}`;
      index += 1;
    }
    return candidate;
  }

  /** 选择加载后第一个可编辑根节点，让属性面板立即进入可用状态。 */
  private selectFirstEditableNode(): TransformNode | null {
    const firstNode = this.scene.rootNodes.find((node) => node instanceof TransformNode && !node.metadata?.[HELPER_FLAG]);
    const selectedNode = firstNode instanceof TransformNode ? firstNode : null;
    this.selectNode(selectedNode);
    return selectedNode;
  }

  /** 创建只作用于工作网格闪光层的专用光晕，避免污染模型、CAD 和选中描边。 */
  private createGridGlowLayer(): GlowLayer {
    const glowLayer = new GlowLayer("编辑网格光晕层", this.scene, {
      mainTextureRatio: GRID_GLOW_TEXTURE_RATIO,
      mainTextureSamples: 1,
      blurKernelSize: GRID_GLOW_BLUR_KERNEL_SIZE,
      excludeByDefault: true
    });
    glowLayer.intensity = 0;
    glowLayer.isEnabled = false;
    glowLayer.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
      const color = this.gridGlowColors.get(mesh.uniqueId) ?? Color3.White();
      const strength =
        GRID_GLOW_EMISSIVE_MIN_STRENGTH +
        (GRID_GLOW_EMISSIVE_MAX_STRENGTH - GRID_GLOW_EMISSIVE_MIN_STRENGTH) * this.gridGlowPulse;
      result.set(color.r * strength, color.g * strength, color.b * strength, 1);
    };
    return glowLayer;
  }

  /** 注册参与光晕后处理的网格闪光层，并记录它在光晕贴图中的发光颜色。 */
  private registerGridGlowMesh(mesh: AbstractMesh, color: Color4): void {
    if (!(mesh instanceof Mesh)) {
      return;
    }

    this.gridGlowMeshes.push(mesh);
    this.gridGlowColors.set(mesh.uniqueId, new Color3(color.r, color.g, color.b));
    this.gridGlowLayer.addIncludedOnlyMesh(mesh);
  }

  /** 清理动态网格重建前的 GlowLayer include 列表，避免旧 mesh uniqueId 残留。 */
  private clearGridGlowMeshes(): void {
    this.gridGlowMeshes.forEach((mesh) => {
      this.gridGlowLayer.removeIncludedOnlyMesh(mesh);
    });
    this.gridGlowMeshes.length = 0;
    this.gridGlowColors.clear();
    this.gridGlowPulse = 0;
    this.gridStaticVisibilityApplied = false;
    this.gridGlowLayer.intensity = 0;
    this.gridGlowLayer.isEnabled = false;
  }

  /** 按当前呼吸相位同步光晕强度；是否呼吸只由工具栏显式开关控制。 */
  private updateGridGlow(pulse: number): void {
    const hasGlowMeshes = this.gridGlowMeshes.some((mesh) => !mesh.isDisposed());
    const enabled = this.gridVisible && this.gridBreathingEffectEnabled && hasGlowMeshes;
    this.gridGlowPulse = enabled ? pulse : 0;
    this.gridGlowLayer.isEnabled = enabled;
    this.gridGlowLayer.intensity = this.gridGlowLayer.isEnabled
      ? GRID_GLOW_MIN_INTENSITY + (GRID_GLOW_MAX_INTENSITY - GRID_GLOW_MIN_INTENSITY) * pulse
      : 0;
  }

  /** 根据工具栏开关统一应用网格视觉层状态，保留透明拖放平面用于落点计算。 */
  private applyGridVisibilityState(): void {
    if (!this.gridVisible || !this.gridBreathingEffectEnabled) {
      this.applyGridStaticVisibility();
      this.gridStaticVisibilityApplied = true;
      return;
    }

    this.gridStaticVisibilityApplied = false;
    this.gridVisualMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = 1;
      }
    });

    this.gridFlashPulseMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = mesh.visibility > 0 ? mesh.visibility : GRID_FLASH_MIN_VISIBILITY;
      }
    });

    this.gridFlashSweepMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.position.x = this.gridCenter.x;
        mesh.position.z = this.gridCenter.z;
        mesh.visibility = mesh.visibility > 0 ? mesh.visibility : GRID_FLASH_MIN_VISIBILITY;
      }
    });

    this.updateGridGlow(this.gridGlowPulse);
  }

  /** 静态网格状态只显示基础线段，隐藏呼吸闪光层和 GlowLayer。 */
  private applyGridStaticVisibility(): void {
    const baseVisibility = this.gridVisible ? 1 : 0;
    this.gridVisualMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = baseVisibility;
      }
    });

    this.gridFlashPulseMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = 0;
      }
    });

    this.gridFlashSweepMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.position.x = this.gridCenter.x;
        mesh.position.z = this.gridCenter.z;
        mesh.visibility = 0;
      }
    });

    this.updateGridGlow(0);
  }

  /** 创建随相机动态覆盖的线段工作网格和透明拖放平面，避免视口看到固定边界。 */
  private createGridHelper(
    sizeMeters = EDITOR_GRID_SIZE_METERS,
    cellSizeMeters = EDITOR_GRID_CELL_SIZE_METERS,
    center = Vector3.Zero()
  ): void {
    this.disposeGridHelper();

    const cellSize = Math.max(EDITOR_GRID_CELL_SIZE_METERS, cellSizeMeters);
    const lineCount = Math.max(2, Math.ceil(sizeMeters / cellSize / 2) * 2);
    const coverageSize = lineCount * cellSize;
    const halfSize = coverageSize / 2;
    const snappedCenter = this.getSnappedGridCenter(center, cellSize);
    const minorLines: Vector3[][] = [];
    const majorLines: Vector3[][] = [];
    const axisXLines: Vector3[][] = [];
    const axisZLines: Vector3[][] = [];

    const pushLine = (line: Vector3[], coordinate: number, axisLines: Vector3[][]): void => {
      if (coordinate === 0) {
        axisLines.push(line);
        return;
      }

      const worldCell = Math.round(coordinate / cellSize);
      if (worldCell % GRID_MAJOR_LINE_EVERY_CELLS === 0) {
        majorLines.push(line);
        return;
      }

      minorLines.push(line);
    };

    for (let index = 1; index < lineCount; index += 1) {
      const xRaw = snappedCenter.x - halfSize + index * cellSize;
      const zRaw = snappedCenter.z - halfSize + index * cellSize;
      const xCoordinate = Math.abs(xRaw) < cellSize * 0.001 ? 0 : Number(xRaw.toFixed(6));
      const zCoordinate = Math.abs(zRaw) < cellSize * 0.001 ? 0 : Number(zRaw.toFixed(6));
      pushLine(
        [
          new Vector3(snappedCenter.x - halfSize, GRID_RENDER_ELEVATION_METERS, zCoordinate),
          new Vector3(snappedCenter.x + halfSize, GRID_RENDER_ELEVATION_METERS, zCoordinate)
        ],
        zCoordinate,
        axisXLines
      );
      pushLine(
        [
          new Vector3(xCoordinate, GRID_RENDER_ELEVATION_METERS, snappedCenter.z - halfSize),
          new Vector3(xCoordinate, GRID_RENDER_ELEVATION_METERS, snappedCenter.z + halfSize)
        ],
        xCoordinate,
        axisZLines
      );
    }

    this.pushGridLineSystem("编辑网格细线", minorLines, new Color4(0.32, 0.46, 0.36, 0.62));
    this.pushGridLineSystem("编辑网格主线", majorLines, new Color4(0.68, 0.82, 0.62, 0.86));
    this.pushGridLineSystem("编辑网格 X 轴", axisXLines, new Color4(1, 0.44, 0.38, 0.98));
    this.pushGridLineSystem("编辑网格 Z 轴", axisZLines, new Color4(0.44, 0.62, 1, 0.98));
    this.pushGridFlashPulseLineSystem("编辑网格闪光主线", majorLines, new Color4(0.9, 1, 0.56, 1));
    this.pushGridFlashPulseLineSystem("编辑网格闪光 X 轴", axisXLines, new Color4(1, 0.18, 0.12, 1));
    this.pushGridFlashPulseLineSystem("编辑网格闪光 Z 轴", axisZLines, new Color4(0.18, 0.5, 1, 1));
    this.pushGridFlashSweep(coverageSize, snappedCenter);
    this.gridHelperMeshes.push(this.createGridDropSurface(coverageSize, snappedCenter));
    this.gridCoverageSizeMeters = coverageSize;
    this.gridCellSizeMeters = cellSize;
    this.gridCenter = snappedCenter;
    this.applyGridVisibilityState();
  }

  /** 释放旧网格辅助对象，供导入超大模型后重建更大参考网格。 */
  private disposeGridHelper(): void {
    this.clearGridGlowMeshes();
    const materials = new Set(this.gridHelperMeshes.map((mesh) => mesh.material).filter(Boolean));
    this.gridHelperMeshes.forEach((mesh) => mesh.dispose());
    materials.forEach((material) => material?.dispose());
    this.gridHelperMeshes.length = 0;
    this.gridVisualMeshes.length = 0;
    this.gridFlashPulseMeshes.length = 0;
    this.gridFlashSweepMeshes.length = 0;
  }

  /** 创建一组可见网格线，并统一标记为编辑器辅助对象。 */
  private pushGridLineSystem(name: string, lines: Vector3[][], color: Color4): void {
    if (lines.length === 0) {
      return;
    }

    const colors = lines.map(() => [color.clone(), color.clone()]);
    const gridLines = MeshBuilder.CreateLineSystem(name, { lines, colors, useVertexAlpha: true }, this.scene);
    gridLines.alwaysSelectAsActiveMesh = true;
    gridLines.isPickable = false;
    gridLines.doNotSerialize = true;
    gridLines.metadata = { [HELPER_FLAG]: true };
    if (gridLines.material) {
      gridLines.material.doNotSerialize = true;
    }
    this.gridHelperMeshes.push(gridLines);
    this.gridVisualMeshes.push(gridLines);
  }

  /** 创建覆盖在主线和坐标轴上的高对比闪光层，增强远视角下的网格辨识度。 */
  private pushGridFlashPulseLineSystem(name: string, lines: Vector3[][], color: Color4): void {
    if (lines.length === 0) {
      return;
    }

    const elevation = GRID_RENDER_ELEVATION_METERS + GRID_FLASH_PULSE_ELEVATION_OFFSET_METERS;
    const pulseLines = lines.map((line) => line.map((point) => new Vector3(point.x, elevation, point.z)));
    const colors = pulseLines.map(() => [color.clone(), color.clone()]);
    const pulseLineSystem = MeshBuilder.CreateLineSystem(
      name,
      { lines: pulseLines, colors, useVertexAlpha: true },
      this.scene
    );
    pulseLineSystem.alwaysSelectAsActiveMesh = true;
    pulseLineSystem.isPickable = false;
    pulseLineSystem.doNotSerialize = true;
    pulseLineSystem.metadata = { [HELPER_FLAG]: true };
    if (pulseLineSystem.material) {
      pulseLineSystem.material.doNotSerialize = true;
    }
    this.gridHelperMeshes.push(pulseLineSystem);
    this.gridFlashPulseMeshes.push(pulseLineSystem);
    this.registerGridGlowMesh(pulseLineSystem, color);
  }

  /** 创建一组移动高亮线，形成更醒目的网格定位闪光且不参与拾取。 */
  private pushGridFlashSweep(sizeMeters: number, center: Vector3): void {
    const halfSize = sizeMeters / 2;
    const elevation = GRID_RENDER_ELEVATION_METERS + GRID_FLASH_SWEEP_ELEVATION_OFFSET_METERS;
    const lines = [
      [new Vector3(-halfSize, elevation, 0), new Vector3(halfSize, elevation, 0)],
      [new Vector3(0, elevation, -halfSize), new Vector3(0, elevation, halfSize)]
    ];
    const color = new Color4(0.78, 1, 0.62, 1);
    const colors = lines.map(() => [color.clone(), color.clone()]);
    const sweepLines = MeshBuilder.CreateLineSystem(
      "编辑网格闪光定位线",
      { lines, colors, useVertexAlpha: true },
      this.scene
    );
    sweepLines.position.x = center.x;
    sweepLines.position.z = center.z;
    sweepLines.alwaysSelectAsActiveMesh = true;
    sweepLines.isPickable = false;
    sweepLines.doNotSerialize = true;
    sweepLines.metadata = { [HELPER_FLAG]: true };
    if (sweepLines.material) {
      sweepLines.material.doNotSerialize = true;
    }
    this.gridHelperMeshes.push(sweepLines);
    this.gridFlashSweepMeshes.push(sweepLines);
    this.registerGridGlowMesh(sweepLines, color);
  }

  /** 创建只用于拖放拾取的透明地面，视觉网格不再承担拾取职责。 */
  private createGridDropSurface(sizeMeters: number, center: Vector3): Mesh {
    const surface = MeshBuilder.CreateGround(
      "编辑拖放平面",
      { width: sizeMeters, height: sizeMeters, subdivisions: 1 },
      this.scene
    );
    surface.position.x = center.x;
    surface.position.z = center.z;
    const material = new StandardMaterial("编辑拖放平面材质", this.scene);
    material.alpha = 0;
    material.disableColorWrite = true;
    material.disableDepthWrite = true;
    material.doNotSerialize = true;
    surface.material = material;
    surface.visibility = 0;
    surface.isPickable = true;
    surface.doNotSerialize = true;
    surface.metadata = { [HELPER_FLAG]: true, [DROP_SURFACE_FLAG]: true };
    return surface;
  }

  /** 当透明拾取平面未命中时，用相机射线和 y=0 平面求交，保证拖放落点稳定。 */
  private getGroundPointFromRay(x: number, y: number): Vector3 {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.editorCamera);
    if (Math.abs(ray.direction.y) < 0.00001) {
      return Vector3.Zero();
    }

    const distance = -ray.origin.y / ray.direction.y;
    if (!Number.isFinite(distance) || distance < 0) {
      return Vector3.Zero();
    }

    return ray.origin.add(ray.direction.scale(distance));
  }

  /** 注册指针拾取逻辑，点击模型后同步层级、属性和高亮状态。 */
  private bindPointerSelection(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (this.previewMode || this.gizmoManager.isDragging || this.shouldSkipPointerSelectionAfterCameraNavigation()) {
        return;
      }

      const event = pointerInfo.event as PointerEvent;
      if (event.button !== LEFT_MOUSE_BUTTON || event.altKey) {
        return;
      }

      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        return;
      }

      if (pointerInfo.type === PointerEventTypes.POINTERDOUBLETAP) {
        const mesh = pointerInfo.pickInfo?.pickedMesh;
        if (!mesh || mesh.metadata?.[HELPER_FLAG]) {
          return;
        }

        const root = this.findSelectableRoot(mesh);
        if (this.isNodeLocked(root)) {
          this.selectNode(null);
          return;
        }

        this.selectNode(root);
        this.frameNodeInView(root);
        return;
      }

      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) {
        return;
      }

      const mesh = pointerInfo.pickInfo?.pickedMesh;
      if (!mesh || mesh.metadata?.[HELPER_FLAG]) {
        this.selectNode(null);
        return;
      }

      const root = this.findSelectableRoot(mesh);
      this.selectNode(this.isNodeLocked(root) ? null : root);
    });
  }

  /** 相机导航刚结束时 Babylon 可能补发 pick，短暂跳过可避免 Alt+左键环绕误选。 */
  private shouldSkipPointerSelectionAfterCameraNavigation(): boolean {
    return this.cameraNavigationActive || (this.lastCameraNavigationEndTime > 0 && performance.now() - this.lastCameraNavigationEndTime < 120);
  }

  /** 暴露给 React 菜单层判断右键拖拽后的 contextmenu 是否应被抑制。 */
  public hasActiveOrRecentCameraNavigation(): boolean {
    return this.shouldSkipPointerSelectionAfterCameraNavigation();
  }

  /** 绑定统计信息刷新，避免每帧都触发 React 重渲染。 */
  private bindStatsLoop(): void {
    this.scene.onAfterRenderObservable.add(() => {
      const now = performance.now();
      if (now - this.statsStamp < EDITOR_STATS_INTERVAL_MS) {
        return;
      }

      this.statsStamp = now;
      this.callbacks.onStatsChange(this.collectStats());
    });
  }

  /** 绑定窗口尺寸变化，保持画布和 WebGL 视口同步。 */
  private bindResize(): void {
    window.addEventListener("resize", this.handleResize);
  }

  /** 绑定 WebGL 上下文丢失事件，黑屏时能在状态栏明确暴露原因。 */
  private bindWebglContextLifecycle(): void {
    this.canvas.addEventListener("webglcontextlost", this.handleWebglContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleWebglContextRestored);
  }

  /** 读取当前 WebGL 渲染器信息，用于判断是否真正跑在硬件 GPU 上。 */
  private captureGpuRendererInfo(): void {
    try {
      const glInfo = this.engine.getGlInfo();
      this.gpuVendor = this.normalizeGpuInfo(glInfo.vendor, "未知 GPU");
      this.gpuRenderer = this.normalizeGpuInfo(glInfo.renderer, "未知渲染器");
    } catch {
      this.gpuVendor = "未知 GPU";
      this.gpuRenderer = "未知渲染器";
    }
  }

  /** 清洗 GPU 字符串，避免空值撑爆状态栏或误导诊断。 */
  private normalizeGpuInfo(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  /** 判断 WebGL renderer 是否疑似软件路径，用于在状态栏直接暴露显卡未命中的风险。 */
  private isSoftwareGpuRenderer(): boolean {
    const renderer = `${this.gpuVendor} ${this.gpuRenderer}`.toLowerCase();
    return (
      renderer.includes("swiftshader") ||
      renderer.includes("llvmpipe") ||
      renderer.includes("software") ||
      renderer.includes("microsoft basic render")
    );
  }

  /** 读取 WebGL 主版本，缺失时回退 0，避免不同 Babylon 版本字段差异导致统计崩溃。 */
  private getWebGlVersion(): number {
    const engineWithVersion = this.engine as unknown as { webGLVersion?: number };
    return typeof engineWithVersion.webGLVersion === "number" ? engineWithVersion.webGLVersion : 0;
  }

  /** 读取当前 GPU 的最大纹理尺寸，用来辅助判断 WebGL 是否落到低能力渲染路径。 */
  private getMaxTextureSize(): number {
    try {
      const caps = this.engine.getCaps() as { maxTextureSize?: number };
      return typeof caps.maxTextureSize === "number" ? caps.maxTextureSize : 0;
    } catch {
      return 0;
    }
  }

  /** 创建数据驱动运行态货箱 cube，只存在于预览内存中，不进入撤销栈和场景保存。 */
  private createRuntimeCargoBox(request: RuntimeCargoBoxRequest): TransformNode {
    const cargoCode = request.cargoCode.trim() || `Cargo-${Date.now()}`;
    const name = `运行态货箱 ${cargoCode}`;
    const mesh = MeshBuilder.CreateBox(name, { size: request.size }, this.scene);
    mesh.position.copyFrom(request.position);
    mesh.isPickable = true;
    mesh.doNotSerialize = true;
    mesh.metadata = {
      [ROOT_FLAG]: true,
      primitive: "cube",
      isDataDrivenRuntimeGenerated: true,
      dataDrivenRuntimeKind: "cargoCube",
      dataDrivenRuntimeOwnerId: request.carrierRoot.uniqueId,
      dataDrivenRuntimeCargoCode: cargoCode,
      editor: {
        assetInfo: {
          assetCode: cargoCode,
          cargoCode,
          boxCode: cargoCode
        }
      }
    };

    const material = new StandardMaterial(`${name} 材质`, this.scene);
    material.diffuseColor = Color3.FromHexString("#d89a3d");
    material.specularColor = new Color3(0.22, 0.2, 0.16);
    material.doNotSerialize = true;
    mesh.material = material;
    this.markScenePerformanceCachesDirty();
    return mesh;
  }

  /** 创建一个符合当前编辑规范的基础对象。 */
  private createPrimitive(kind: PrimitiveKind, position: Vector3): TransformNode {
    const name = `${this.getPrimitiveName(kind)} ${this.primitiveSeed++}`;

    if (kind === "light") {
      const lightRoot = new TransformNode(name, this.scene);
      lightRoot.position.copyFrom(position.add(new Vector3(0, DEFAULT_LIGHT_HEIGHT_METERS, 0)));
      lightRoot.metadata = { [ROOT_FLAG]: true, primitive: kind };

      const light = new PointLight(`${name} 灯体`, Vector3.Zero(), this.scene);
      light.intensity = 1.2;
      light.parent = lightRoot;
      light.metadata = { [HELPER_FLAG]: true };
      return lightRoot;
    }

    const mesh = this.createPrimitiveMesh(kind, name);
    mesh.position.copyFrom(position);
    mesh.metadata = { [ROOT_FLAG]: true, primitive: kind };
    mesh.isPickable = true;

    if (kind === "locatorWireCube") {
      this.mergeNodeEditorMetadata(mesh, {
        locatorDimensions: DEFAULT_LOCATOR_DIMENSIONS,
        locatorAnimationConnection: DEFAULT_LOCATOR_ANIMATION_CONNECTION
      });
    }

    if (kind !== "ground" && kind !== "locatorWireCube") {
      mesh.material = this.createDefaultMaterial(name);
    }

    return mesh;
  }

  /** 根据类型创建 Babylon 内置网格，集中管理默认尺寸。 */
  private createPrimitiveMesh(kind: PrimitiveKind, name: string): Mesh {
    if (kind === "sphere") {
      return MeshBuilder.CreateSphere(name, { diameter: DEFAULT_SPHERE_DIAMETER_METERS, segments: 32 }, this.scene);
    }

    if (kind === "cylinder") {
      return MeshBuilder.CreateCylinder(
        name,
        { height: DEFAULT_CYLINDER_HEIGHT_METERS, diameter: DEFAULT_CYLINDER_DIAMETER_METERS, tessellation: 32 },
        this.scene
      );
    }

    if (kind === "locatorWireCube") {
      return this.createLocatorWireCubeMesh(name);
    }

    if (kind === "ground") {
      const ground = MeshBuilder.CreateGround(
        name,
        { width: DEFAULT_GROUND_SIZE_METERS, height: DEFAULT_GROUND_SIZE_METERS, subdivisions: DEFAULT_GROUND_SIZE_METERS },
        this.scene
      );
      const material = new StandardMaterial(`${name} 材质`, this.scene);
      material.diffuseColor = new Color3(0.28, 0.31, 0.28);
      material.specularColor = new Color3(0.08, 0.08, 0.08);
      ground.material = material;
      return ground;
    }

    return MeshBuilder.CreateBox(name, { size: DEFAULT_BOX_SIZE_METERS }, this.scene);
  }

  /** 创建只包含 12 条边的定位线框，底面以局部原点贴地，便于把货物手动摆入框内。 */
  private createLocatorWireCubeMesh(name: string): LinesMesh {
    const lineSystem = MeshBuilder.CreateLineSystem(
      name,
      { lines: this.createLocatorWireCubeLines(DEFAULT_LOCATOR_DIMENSIONS), updatable: true },
      this.scene
    );
    lineSystem.color = Color3.FromHexString("#72d6ff");
    lineSystem.alpha = 0.95;
    lineSystem.intersectionThreshold = 0.08;
    lineSystem.alwaysSelectAsActiveMesh = true;
    return lineSystem;
  }

  /** 按定位框长宽高生成 12 条边；长对应 X 轴，宽对应 Z 轴，高对应 Y 轴。 */
  private createLocatorWireCubeLines(dimensions: LocatorDimensionsSnapshot): Vector3[][] {
    const halfLength = dimensions.length / 2;
    const halfWidth = dimensions.width / 2;
    const bottomCorners = [
      new Vector3(-halfLength, 0, -halfWidth),
      new Vector3(halfLength, 0, -halfWidth),
      new Vector3(halfLength, 0, halfWidth),
      new Vector3(-halfLength, 0, halfWidth)
    ];
    const topCorners = bottomCorners.map((corner) => corner.add(new Vector3(0, dimensions.height, 0)));
    return [
      [bottomCorners[0], bottomCorners[1]],
      [bottomCorners[1], bottomCorners[2]],
      [bottomCorners[2], bottomCorners[3]],
      [bottomCorners[3], bottomCorners[0]],
      [topCorners[0], topCorners[1]],
      [topCorners[1], topCorners[2]],
      [topCorners[2], topCorners[3]],
      [topCorners[3], topCorners[0]],
      [bottomCorners[0], topCorners[0]],
      [bottomCorners[1], topCorners[1]],
      [bottomCorners[2], topCorners[2]],
      [bottomCorners[3], topCorners[3]]
    ];
  }

  /** 把定位框线段端点展开为 position buffer，兼容旧场景中非 updatable 的 LinesMesh。 */
  private flattenLocatorWireCubeLinePositions(dimensions: LocatorDimensionsSnapshot): number[] {
    return this.createLocatorWireCubeLines(dimensions).flatMap((line) =>
      line.flatMap((point) => [point.x, point.y, point.z])
    );
  }

  /** 创建默认材质，让新增物体在深色视口里有清晰轮廓。 */
  private createDefaultMaterial(name: string): StandardMaterial {
    const material = new StandardMaterial(`${name} 材质`, this.scene);
    material.diffuseColor = Color3.FromHexString(this.pickMaterialColor());
    material.specularColor = new Color3(0.25, 0.25, 0.22);
    return material;
  }

  /** 按序轮换材质颜色，避免默认场景变成单一色块。 */
  private pickMaterialColor(): string {
    const palette = ["#4fb477", "#d89a3d", "#d75f5f", "#58a6a6", "#b7a05d"];
    return palette[this.primitiveSeed % palette.length];
  }

  /** 返回基础对象的中文名称前缀。 */
  private getPrimitiveName(kind: PrimitiveKind): string {
    const names: Record<PrimitiveKind, string> = {
      cube: "立方体",
      locatorWireCube: "定位线框立方体",
      sphere: "球体",
      cylinder: "圆柱体",
      ground: "地面",
      light: "点光源"
    };

    return names[kind];
  }

  /** 创建可编辑 POI 根节点和其基础可视部件。 */
  private createPoi(kind: PoiKind, position: Vector3): TransformNode {
    const normalizedKind = normalizePoiKind(kind);
    const definition = this.getPoiDefinition(normalizedKind);
    const poiConfig = createDefaultPoiConfig(normalizedKind);
    const name = `${definition.title} ${this.poiSeed++}`;
    const root = new TransformNode(name, this.scene);
    root.position.copyFrom(position);
    const metricMetadata = this.withMetricModelMetadata({ poi: normalizedKind });
    root.metadata = {
      ...metricMetadata,
      [ROOT_FLAG]: true,
      poi: normalizedKind,
      editor: {
        ...this.asMetadataObject(metricMetadata.editor),
        poiConfig
      }
    };

    this.createPoiBase(root, name, definition);
    this.createPoiShape(root, name, definition);
    this.createPoiLabel(root, name, definition);
    return root;
  }

  /** 创建 POI 的落地点和竖向引导杆，帮助用户看清点位实际落点。 */
  private createPoiBase(root: TransformNode, name: string, definition: PoiDefinition): void {
    const baseMaterial = this.createPoiMaterial(`${name} 落点材质`, "#2b302c", "#3f4a40");
    const stemMaterial = this.createPoiMaterial(`${name} 引导杆材质`, definition.colorHex, definition.emissiveHex);

    const base = MeshBuilder.CreateCylinder(
      `${name} 落点`,
      { height: 0.035, diameter: POI_BASE_DIAMETER_METERS, tessellation: 48 },
      this.scene
    );
    base.parent = root;
    base.position.y = 0.018;
    base.material = baseMaterial;
    base.isPickable = true;

    const stem = MeshBuilder.CreateCylinder(
      `${name} 引导杆`,
      { height: POI_STEM_HEIGHT_METERS, diameter: POI_STEM_DIAMETER_METERS, tessellation: 16 },
      this.scene
    );
    stem.parent = root;
    stem.position.y = POI_STEM_HEIGHT_METERS / 2;
    stem.material = stemMaterial;
    stem.isPickable = true;
  }

  /** 按 POI 类型创建主体形状，避免所有点位在场景中看起来完全相同。 */
  private createPoiShape(root: TransformNode, name: string, definition: PoiDefinition): void {
    if (definition.shape === "roam" || definition.shape === "inspection") {
      this.createCameraPoiShape(root, name, definition);
      return;
    }

    if (definition.shape === "spawner") {
      this.createDevicePoiShape(root, name, definition);
      return;
    }

    if (definition.shape === "panel" || definition.shape === "chart") {
      this.createPanelPoiShape(root, name, definition);
      return;
    }

    if (definition.shape === "path") {
      this.createPathPoiShape(root, name, definition);
      return;
    }

    if (definition.shape === "sender" || definition.shape === "receiver" || definition.shape === "group") {
      this.createDirectionalPoiShape(root, name, definition);
      return;
    }

    const marker = MeshBuilder.CreateSphere(
      `${name} 标记头`,
      { diameter: POI_HEAD_SIZE_METERS, segments: 24 },
      this.scene
    );
    marker.parent = root;
    marker.position.y = POI_STEM_HEIGHT_METERS + POI_HEAD_SIZE_METERS * 0.28;
    marker.material = this.createPoiMaterial(`${name} 标记头材质`, definition.colorHex, definition.emissiveHex);
    marker.isPickable = true;
  }

  /** 创建摄像头类 POI 的机身和镜头。 */
  private createCameraPoiShape(root: TransformNode, name: string, definition: PoiDefinition): void {
    const material = this.createPoiMaterial(`${name} 摄像头材质`, definition.colorHex, definition.emissiveHex);
    const body = MeshBuilder.CreateBox(`${name} 机身`, { width: 0.5, height: 0.26, depth: 0.26 }, this.scene);
    body.parent = root;
    body.position.y = POI_STEM_HEIGHT_METERS + 0.16;
    body.material = material;
    body.isPickable = true;

    const lens = MeshBuilder.CreateCylinder(`${name} 镜头`, { height: 0.18, diameter: 0.18, tessellation: 24 }, this.scene);
    lens.parent = root;
    lens.position = new Vector3(0, POI_STEM_HEIGHT_METERS + 0.16, 0.22);
    lens.rotation.x = Math.PI / 2;
    lens.material = material;
    lens.isPickable = true;
  }

  /** 创建设备类 POI 的方形设备标识。 */
  private createDevicePoiShape(root: TransformNode, name: string, definition: PoiDefinition): void {
    const device = MeshBuilder.CreateBox(
      `${name} 设备块`,
      { width: 0.42, height: 0.42, depth: 0.18 },
      this.scene
    );
    device.parent = root;
    device.position.y = POI_STEM_HEIGHT_METERS + 0.22;
    device.material = this.createPoiMaterial(`${name} 设备块材质`, definition.colorHex, definition.emissiveHex);
    device.isPickable = true;
  }

  /** 创建标签类 POI 的竖向标牌。 */
  private createPanelPoiShape(root: TransformNode, name: string, definition: PoiDefinition): void {
    const panel = MeshBuilder.CreateBox(
      `${name} 标牌`,
      { width: 0.62, height: 0.34, depth: 0.08 },
      this.scene
    );
    panel.parent = root;
    panel.position.y = POI_STEM_HEIGHT_METERS + 0.22;
    panel.material = this.createPoiMaterial(`${name} 标牌材质`, definition.colorHex, definition.emissiveHex);
    panel.isPickable = true;
  }

  /** 创建发送、回收和群组绑定类 POI 的方向箭头外观。 */
  private createDirectionalPoiShape(root: TransformNode, name: string, definition: PoiDefinition): void {
    const material = this.createPoiMaterial(`${name} 方向材质`, definition.colorHex, definition.emissiveHex);
    const shaft = MeshBuilder.CreateCylinder(`${name} 箭身`, { height: 0.46, diameter: 0.13, tessellation: 18 }, this.scene);
    shaft.parent = root;
    shaft.position.y = POI_STEM_HEIGHT_METERS + 0.2;
    shaft.rotation.z = Math.PI / 2;
    shaft.material = material;
    shaft.isPickable = true;

    const head = MeshBuilder.CreateCylinder(`${name} 箭头`, { height: 0.22, diameterTop: 0, diameterBottom: 0.28, tessellation: 24 }, this.scene);
    head.parent = root;
    head.position = new Vector3(0.34, POI_STEM_HEIGHT_METERS + 0.2, 0);
    head.rotation.z = -Math.PI / 2;
    head.material = material;
    head.isPickable = true;
  }

  /** 创建路径类 POI 的折线节点外观，真实路径线由运行态根据配置重建。 */
  private createPathPoiShape(root: TransformNode, name: string, definition: PoiDefinition): void {
    const material = this.createPoiMaterial(`${name} 路径材质`, definition.colorHex, definition.emissiveHex);
    const nodeA = MeshBuilder.CreateSphere(`${name} 起点`, { diameter: 0.22, segments: 16 }, this.scene);
    nodeA.parent = root;
    nodeA.position = new Vector3(-0.24, POI_STEM_HEIGHT_METERS + 0.18, -0.08);
    nodeA.material = material;
    nodeA.isPickable = true;

    const nodeB = MeshBuilder.CreateSphere(`${name} 中点`, { diameter: 0.18, segments: 16 }, this.scene);
    nodeB.parent = root;
    nodeB.position = new Vector3(0.08, POI_STEM_HEIGHT_METERS + 0.32, 0.08);
    nodeB.material = material;
    nodeB.isPickable = true;

    const nodeC = MeshBuilder.CreateSphere(`${name} 终点`, { diameter: 0.22, segments: 16 }, this.scene);
    nodeC.parent = root;
    nodeC.position = new Vector3(0.34, POI_STEM_HEIGHT_METERS + 0.12, -0.02);
    nodeC.material = material;
    nodeC.isPickable = true;
  }

  /** 创建跟随相机朝向的 POI 标签，显示点位类型。 */
  private createPoiLabel(root: TransformNode, name: string, definition: PoiDefinition): void {
    const texture = new DynamicTexture(
      `${name} 标签纹理`,
      { width: POI_LABEL_TEXTURE_WIDTH, height: POI_LABEL_TEXTURE_HEIGHT },
      this.scene,
      true
    );
    texture.hasAlpha = true;
    texture.drawText(
      definition.title,
      null,
      82,
      "bold 58px Microsoft YaHei, Arial",
      "#f7f1df",
      definition.colorHex,
      true,
      true
    );

    const material = new StandardMaterial(`${name} 标签材质`, this.scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.emissiveColor = Color3.FromHexString(definition.emissiveHex);
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;
    material.backFaceCulling = false;

    const label = MeshBuilder.CreatePlane(
      `${name} 标签`,
      { width: POI_LABEL_WIDTH_METERS, height: POI_LABEL_HEIGHT_METERS },
      this.scene
    );
    label.parent = root;
    label.position.y = POI_STEM_HEIGHT_METERS + 0.66;
    label.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    label.alwaysSelectAsActiveMesh = true;
    label.isPickable = true;
    label.material = material;
  }

  /** 创建 POI 专用材质，保留轻微自发光以便在深色视口中定位。 */
  private createPoiMaterial(name: string, colorHex: string, emissiveHex: string): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = Color3.FromHexString(colorHex);
    material.emissiveColor = Color3.FromHexString(emissiveHex).scale(0.28);
    material.specularColor = new Color3(0.2, 0.22, 0.2);
    return material;
  }

  /** 返回内置 POI 组件定义，所有拖拽 POI 均从这里取模板参数。 */
  private getPoiDefinition(kind: PoiKind): PoiDefinition {
    return getPoiCatalogItem(kind);
  }

  /** 导入模型或场景文件，并把导入根节点移动到落点。 */
  private async importSceneFile(
    file: File,
    extension: string,
    position: Vector3,
    shouldRegisterAsset: boolean,
    projectFile?: string,
    projectFiles?: string[],
    dependencyFiles: File[] = [file],
    persistedUnitMetadata: ModelUnitMetadata | null = null
  ): Promise<{ root: TransformNode; unitMetadata: ModelUnitMetadata } | null> {
    const result = await ImportMeshAsync(file, this.scene, {
      meshNames: null,
      pluginExtension: extension,
      name: file.name
    });
    const prepared = this.prepareImportedNodes(file.name, extension, result.meshes, result.transformNodes, position, persistedUnitMetadata);
    if (shouldRegisterAsset) {
      this.registerAsset(file, extension === ".babylon" ? "scene" : "model", projectFile, projectFiles, dependencyFiles, prepared?.unitMetadata);
    }
    if (prepared?.root) {
      this.selectNode(prepared.root);
      this.ensureNodeGridCoverage(prepared.root);
    }
    return prepared;
  }

  /** 为导入的网格和空分组节点补充编辑器元数据，并保留模型原始父子层级。 */
  private prepareImportedNodes(
    fileName: string,
    extension: string,
    meshes: AbstractMesh[],
    transformNodes: TransformNode[],
    position: Vector3,
    persistedUnitMetadata: ModelUnitMetadata | null = null
  ): { root: TransformNode; unitMetadata: ModelUnitMetadata } | null {
    const importedNodes = this.getUniqueImportedNodes(meshes, transformNodes);
    if (importedNodes.length === 0) {
      return null;
    }

    importedNodes.forEach((node) => {
      if (node instanceof AbstractMesh) {
        node.isPickable = true;
      }
    });

    const importedRoots = this.getImportedRootNodes(importedNodes);
    const displayName = fileName.replace(/\.[^.]+$/, "");
    let root = importedRoots.length === 1 ? importedRoots[0] : new TransformNode(displayName, this.scene);
    if (importedRoots.length > 1) {
      importedRoots.forEach((node) => node.setParent(root));
    }

    const metricMetadata = this.inferImportedModelUnitMetadata(root, extension, fileName, persistedUnitMetadata);
    root = this.normalizeImportedModelRoots(root, importedRoots, displayName, metricMetadata);
    root = this.ensureEditableRootOriginAtModelBase(root, displayName);
    root.name = root.name === "__root__" || root.name === "root" ? displayName : root.name;
    importedNodes.forEach((node) => {
      node.metadata = this.withMetricModelMetadata(node.metadata, metricMetadata);
    });
    root.metadata = { ...this.withMetricModelMetadata(root.metadata, metricMetadata), [ROOT_FLAG]: true };
    this.alignNodeBaseToPosition(root, position);
    return { root, unitMetadata: metricMetadata.unitNormalization };
  }

  /** 根据导入后的真实世界包围盒推断米/厘米/毫米源单位，并归一到米制编辑器。 */
  private inferImportedModelUnitMetadata(
    root: TransformNode,
    extension: string,
    fileName: string,
    persistedUnitMetadata: ModelUnitMetadata | null = null
  ): ImportedModelMetricMetadataOptions {
    this.refreshNodeWorldMatrices(root);
    const bounds = this.getNodeWorldBounds(root);
    const unitNormalization = inferModelUnitFromBounds(
      bounds ? { maxDimension: bounds.maxDimension } : null,
      extension,
      persistedUnitMetadata
    );
    const modelUnitPolicy =
      unitNormalization.unitScaleToMeters === SCENE_UNIT_IN_METERS
        ? IMPORTED_MODEL_UNIT_POLICY
        : IMPORTED_MODEL_NORMALIZED_UNIT_POLICY;

    return {
      sourceFile: fileName,
      sourceUnit: unitNormalization.sourceUnit,
      unitScaleToMeters: unitNormalization.unitScaleToMeters,
      modelUnitPolicy,
      unitNormalization
    };
  }

  /** 对需要归一化的源模型做内部缩放，外层根节点仍保持易编辑的米制变换。 */
  private normalizeImportedModelRoots(
    root: TransformNode,
    importedRoots: TransformNode[],
    displayName: string,
    unitMetadata: MetricModelMetadataOptions
  ): TransformNode {
    if (unitMetadata.unitScaleToMeters === undefined || unitMetadata.unitScaleToMeters === SCENE_UNIT_IN_METERS) {
      return root;
    }

    const normalizedRoot = importedRoots.length === 1 ? new TransformNode(displayName, this.scene) : root;
    if (importedRoots.length === 1) {
      root.setParent(normalizedRoot);
    }

    const unitScaleToMeters = unitMetadata.unitScaleToMeters ?? SCENE_UNIT_IN_METERS;
    importedRoots.forEach((node) => {
      node.position.scaleInPlace(unitScaleToMeters);
      node.scaling.scaleInPlace(unitScaleToMeters);
    });
    this.refreshNodeWorldMatrices(normalizedRoot);
    return normalizedRoot;
  }

  /** 为几何原点明显偏离模型的导入资源创建外层编辑根节点，让 Gizmo 出现在模型底面中心。 */
  private ensureEditableRootOriginAtModelBase(root: TransformNode, displayName: string): TransformNode {
    this.refreshNodeWorldMatrices(root);
    const bounds = this.getNodeWorldBounds(root);
    if (!bounds) {
      return root;
    }

    const baseCenter = new Vector3(bounds.center.x, bounds.minimum.y, bounds.center.z);
    if (Vector3.DistanceSquared(root.getAbsolutePosition(), baseCenter) < 0.0001) {
      return root;
    }

    const editableRoot = new TransformNode(displayName, this.scene);
    editableRoot.position.copyFrom(baseCenter);
    this.refreshNodeWorldMatrices(editableRoot);
    root.setParent(editableRoot);
    this.refreshNodeWorldMatrices(editableRoot);
    return editableRoot;
  }

  /** 将导入模型的底部中心移动到落点，避免模型中心贴地后半截沉入地面。 */
  private alignNodeBaseToPosition(node: TransformNode, position: Vector3): void {
    this.refreshNodeWorldMatrices(node);
    const bounds = this.getNodeWorldBounds(node);
    if (!bounds) {
      node.position.copyFrom(position);
      return;
    }

    const baseCenter = new Vector3(bounds.center.x, bounds.minimum.y, bounds.center.z);
    node.position.addInPlace(position.subtract(baseCenter));
    this.refreshNodeWorldMatrices(node);
  }

  /** 只扩展网格覆盖范围，不改变当前相机视角，供拖入模型后保持视角稳定。 */
  private ensureNodeGridCoverage(node: TransformNode): void {
    this.refreshNodeWorldMatrices(node);
    const bounds = this.getNodeWorldBounds(node);
    if (!bounds) {
      return;
    }

    this.ensureGridCoversBounds(bounds);
  }

  /** 按需把相机拉到节点包围盒前，仅用于双击或层级定位等显式聚焦操作。 */
  private frameNodeInView(node: TransformNode): void {
    this.refreshNodeWorldMatrices(node);
    const bounds = this.getNodeWorldBounds(node);
    if (!bounds) {
      return;
    }

    this.frameBoundsInView(bounds);
  }

  /** 加载项目后按整场景包围盒取景，避免模型远离原点时视口看起来全黑。 */
  private frameEditableSceneInView(fallbackNode: TransformNode | null): void {
    const bounds = this.getEditableSceneBounds() ?? (fallbackNode ? this.getNodeWorldBounds(fallbackNode) : null);
    if (!bounds) {
      this.resetEditorCameraOverview();
      return;
    }

    this.frameBoundsInView(bounds);
  }

  /** 根据给定包围盒计算相机距离和裁剪面，让完整场景留出可见余量。 */
  private frameBoundsInView(bounds: NodeWorldBounds): void {
    this.ensureGridCoversBounds(bounds);
    const radius = this.getCameraRadiusForBounds(bounds);
    this.editorCamera.setTarget(bounds.center);
    this.editorCamera.upperRadiusLimit = Math.max(this.editorCamera.upperRadiusLimit ?? 0, radius * 3);
    this.editorCamera.maxZ = Math.min(MAX_CAMERA_FAR_CLIP_METERS, Math.max(this.editorCamera.maxZ, radius * 6));
    this.editorCamera.radius = radius;
    this.attachEditorCameraControl();
  }

  /** 按包围球和当前视口宽高计算取景半径，比固定倍数更不容易裁切长模型。 */
  private getCameraRadiusForBounds(bounds: NodeWorldBounds): number {
    const renderWidth = Math.max(1, this.engine.getRenderWidth());
    const renderHeight = Math.max(1, this.engine.getRenderHeight());
    const aspect = renderWidth / renderHeight;
    const verticalFov = Math.max(0.1, this.editorCamera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const limitingFov = Math.max(0.1, Math.min(verticalFov, horizontalFov));
    const boundingRadius = Math.max(bounds.size.length() / 2, bounds.maxDimension / 2, 1);
    return Math.max(MIN_FRAMED_CAMERA_RADIUS_METERS, (boundingRadius / Math.sin(limitingFov / 2)) * CAMERA_FRAME_MARGIN);
  }

  /** 没有可编辑模型时回到大视野默认工作台，保证用户仍能看到网格背景。 */
  private resetEditorCameraOverview(): void {
    this.editorCamera.setTarget(new Vector3(0, 1.2, 0));
    this.editorCamera.radius = DEFAULT_CAMERA_RADIUS_METERS;
    this.editorCamera.maxZ = DEFAULT_CAMERA_FAR_CLIP_METERS;
    this.attachEditorCameraControl();
    this.createGridHelper(EDITOR_GRID_SIZE_METERS, EDITOR_GRID_CELL_SIZE_METERS, Vector3.Zero());
  }

  /** 按导入模型尺寸和离原点距离扩展参考网格，避免大模型取景后看不到网格。 */
  private ensureGridCoversBounds(bounds: NodeWorldBounds): void {
    const farthestHorizontalPoint = Math.max(
      Math.abs(bounds.minimum.x),
      Math.abs(bounds.maximum.x),
      Math.abs(bounds.minimum.z),
      Math.abs(bounds.maximum.z),
      EDITOR_GRID_SIZE_METERS / 2
    );
    const desiredSize = Math.max(EDITOR_GRID_SIZE_METERS, farthestHorizontalPoint * 2 + bounds.maxDimension * 0.5);
    if (desiredSize <= this.gridCoverageSizeMeters * 0.9) {
      return;
    }

    this.createGridHelper(desiredSize, this.pickGridCellSize(desiredSize), bounds.center);
  }

  /** 按相机半径计算当前视口需要的网格覆盖范围，避免固定网格露出边界。 */
  private getDynamicGridSizeMeters(): number {
    const radius = Number.isFinite(this.editorCamera.radius) ? this.editorCamera.radius : EDITOR_GRID_SIZE_METERS;
    return Math.max(EDITOR_GRID_SIZE_METERS, radius * GRID_CAMERA_RADIUS_COVERAGE_FACTOR);
  }

  /** 用相机视口在地面上的投影估算当前需要绘制的网格范围。 */
  private getVisibleGridFrame(): { center: Vector3; size: number } {
    const visiblePoints = this.getVisibleGroundPoints();
    const fallbackSize = this.getDynamicGridSizeMeters();
    const fallbackCenter = this.editorCamera.target.clone();
    fallbackCenter.y = 0;

    if (visiblePoints.length < 2) {
      return { center: fallbackCenter, size: fallbackSize };
    }

    let minX = visiblePoints[0].x;
    let maxX = visiblePoints[0].x;
    let minZ = visiblePoints[0].z;
    let maxZ = visiblePoints[0].z;
    visiblePoints.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    });

    const radius = Number.isFinite(this.editorCamera.radius) ? this.editorCamera.radius : EDITOR_GRID_SIZE_METERS;
    const padding = Math.max(EDITOR_GRID_SIZE_METERS * 0.5, radius * GRID_VIEWPORT_PADDING_FACTOR);
    const center = new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const size = Math.max(EDITOR_GRID_SIZE_METERS, fallbackSize, maxX - minX + padding * 2, maxZ - minZ + padding * 2);
    return { center, size };
  }

  /** 采样视口关键点与 y=0 地面的交点，用于让网格覆盖用户真实可见区域。 */
  private getVisibleGroundPoints(): Vector3[] {
    const width = Math.max(1, this.engine.getRenderWidth());
    const height = Math.max(1, this.engine.getRenderHeight());
    const samples = [
      [0, 0],
      [width * 0.5, 0],
      [width, 0],
      [0, height * 0.5],
      [width * 0.5, height * 0.5],
      [width, height * 0.5],
      [0, height],
      [width * 0.5, height],
      [width, height]
    ];

    return samples
      .map(([x, y]) => this.getGroundPointFromViewport(x, y))
      .filter((point): point is Vector3 => Boolean(point));
  }

  /** 将视口坐标投射到 y=0 编辑地面，射线不朝向地面时返回空值。 */
  private getGroundPointFromViewport(x: number, y: number): Vector3 | null {
    const ray = this.scene.createPickingRay(x, y, Matrix.Identity(), this.editorCamera);
    if (Math.abs(ray.direction.y) < 0.00001) {
      return null;
    }

    const distance = -ray.origin.y / ray.direction.y;
    if (!Number.isFinite(distance) || distance < 0) {
      return null;
    }

    return ray.origin.add(ray.direction.scale(distance));
  }

  /** 将网格中心吸附到单元格倍数，避免相机轻微移动时网格线抖动。 */
  private getSnappedGridCenter(center: Vector3, cellSize: number): Vector3 {
    return new Vector3(
      Math.round(center.x / cellSize) * cellSize,
      0,
      Math.round(center.z / cellSize) * cellSize
    );
  }

  /** 相机平移或缩放到接近网格边界时，重建一个新的可见网格块形成无边界效果。 */
  private updateDynamicGridForCamera(): void {
    const gridFrame = this.getVisibleGridFrame();
    const desiredSize = gridFrame.size;
    const cellSize = this.pickGridCellSize(desiredSize);
    const center = this.getSnappedGridCenter(gridFrame.center, cellSize);
    const centerDelta = Math.max(Math.abs(center.x - this.gridCenter.x), Math.abs(center.z - this.gridCenter.z));
    const recenterThreshold = cellSize * GRID_RECENTER_THRESHOLD_CELLS;
    const coverageDeltaRatio = Math.abs(desiredSize - this.gridCoverageSizeMeters) / this.gridCoverageSizeMeters;
    const shouldRebuild =
      centerDelta >= recenterThreshold || cellSize !== this.gridCellSizeMeters || coverageDeltaRatio >= GRID_RESIZE_HYSTERESIS;

    if (shouldRebuild) {
      this.createGridHelper(desiredSize, cellSize, center);
    }
  }

  /** 只有相机主动运动或预览相机运行时才按帧检查动态网格，静止编辑态避免无效几何计算。 */
  private shouldUpdateDynamicGridForFrame(): boolean {
    return this.previewMode || this.cameraNavigationActive;
  }

  /** 让所有可见网格线按用户开关呼吸闪烁，画质模式不再接管呼吸效果。 */
  private updateGridFlash(): void {
    if (this.gridVisualMeshes.length === 0) {
      this.updateGridGlow(0);
      return;
    }

    if (!this.gridVisible) {
      if (!this.gridStaticVisibilityApplied) {
        this.applyGridVisibilityState();
      }
      return;
    }

    if (!this.gridBreathingEffectEnabled) {
      if (!this.gridStaticVisibilityApplied) {
        this.applyGridVisibilityState();
      }
      return;
    }

    const now = performance.now();
    if (now - this.gridFlashStamp < ADAPTIVE_GRID_FLASH_THROTTLE_MS) {
      return;
    }

    this.gridFlashStamp = now;
    const cycle = (now % GRID_FLASH_PERIOD_MS) / GRID_FLASH_PERIOD_MS;
    const pulse = (Math.sin(cycle * Math.PI * 2) + 1) / 2;
    const easedPulse = pulse * pulse * (3 - 2 * pulse);
    const synchronizedVisibility =
      GRID_FLASH_MIN_VISIBILITY + (GRID_FLASH_MAX_VISIBILITY - GRID_FLASH_MIN_VISIBILITY) * easedPulse;

    this.gridStaticVisibilityApplied = false;
    this.applyGridFlashVisibility(synchronizedVisibility);
    this.updateGridGlow(easedPulse);
  }

  /** 高负载场景下减少非必要编辑交互开销，网格呼吸由工具栏开关独立控制。 */
  private shouldReduceEditorVisualEffects(): boolean {
    return (
      this.renderQualityMode === "performance" ||
      this.adaptiveRenderQualityActive ||
      this.isLargeSceneForEditorEffects() ||
      this.isCurrentRenderLoadHighForEditorEffects() ||
      this.isCurrentFpsLowForEditorEffects()
    );
  }

  /** 判断是否进入编辑交互降载，主要用于暂停指针移动拾取，不接管网格呼吸效果。 */
  private isLargeSceneForEditorEffects(): boolean {
    const stats = this.getSceneContentStats();
    return stats.meshCount >= LARGE_SCENE_EFFECT_MESH_THRESHOLD || stats.vertexCount >= LARGE_SCENE_EFFECT_VERTEX_THRESHOLD;
  }

  /** 通过上一帧 active mesh 和 draw call 判断大量小模型造成的渲染提交压力。 */
  private isCurrentRenderLoadHighForEditorEffects(): boolean {
    const activeMeshes = Number((this.scene.getActiveMeshes() as unknown as { length: number }).length ?? 0);
    const drawCalls = this.sceneInstrumentation.drawCallsCounter.current;
    return (
      activeMeshes >= LARGE_SCENE_EFFECT_ACTIVE_MESH_THRESHOLD ||
      (Number.isFinite(drawCalls) && drawCalls >= LARGE_SCENE_EFFECT_DRAW_CALL_THRESHOLD)
    );
  }

  /** FPS 已经偏低时优先停掉编辑辅助后处理，避免继续挤占场景主体帧预算。 */
  private isCurrentFpsLowForEditorEffects(): boolean {
    const fps = this.engine.getFps();
    return Number.isFinite(fps) && fps > 0 && fps < LOW_FPS_EFFECT_REDUCTION_THRESHOLD;
  }

  /** 批量设置网格线和扫线可见性，避免不同路径重复遍历同一批辅助 mesh。 */
  private applyGridFlashVisibility(visibility: number): void {
    this.gridVisualMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = visibility;
      }
    });

    this.gridFlashPulseMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = visibility;
      }
    });

    this.gridFlashSweepMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.position.x = this.gridCenter.x;
        mesh.position.z = this.gridCenter.z;
        mesh.visibility = visibility;
      }
    });
  }

  /** 根据网格覆盖范围选择易读的单元格尺寸，控制线段数量并保留 1m 默认精度。 */
  private pickGridCellSize(sizeMeters: number): number {
    const rawStep = Math.max(EDITOR_GRID_CELL_SIZE_METERS, sizeMeters / MAX_GRID_LINE_COUNT_PER_AXIS);
    return this.toNiceGridStep(rawStep);
  }

  /** 将任意间距规整为 1、2、5、10 这样的工程常用步长。 */
  private toNiceGridStep(value: number): number {
    if (!Number.isFinite(value) || value <= EDITOR_GRID_CELL_SIZE_METERS) {
      return EDITOR_GRID_CELL_SIZE_METERS;
    }

    const exponent = Math.floor(Math.log10(value));
    const base = 10 ** exponent;
    const normalized = value / base;
    const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return multiplier * base;
  }

  /** 去重合并导入结果中的 Mesh 与 TransformNode，避免 glTF 空节点从层级树中消失。 */
  private getUniqueImportedNodes(meshes: AbstractMesh[], transformNodes: TransformNode[]): TransformNode[] {
    const seen = new Set<number>();
    const nodes: TransformNode[] = [];
    [...transformNodes, ...meshes].forEach((node) => {
      if (node.metadata?.[HELPER_FLAG] || seen.has(node.uniqueId)) {
        return;
      }

      seen.add(node.uniqueId);
      nodes.push(node);
    });
    return nodes;
  }

  /** 找出导入批次中的顶层节点；多根模型会额外挂到同一个文件根节点下。 */
  private getImportedRootNodes(importedNodes: TransformNode[]): TransformNode[] {
    const importedSet = new Set<Node>(importedNodes);
    return importedNodes.filter((node) => !node.parent || !importedSet.has(node.parent));
  }

  /** 将贴图应用到当前选中网格的材质上，没有选中时仅登记资产。 */
  private applyTextureToSelection(file: File): void {
    if (!(this.selectedNode instanceof AbstractMesh)) {
      return;
    }

    const url = URL.createObjectURL(file);
    const material = this.ensureEditableMaterial(this.selectedNode);
    const texture = new Texture(url, this.scene, false, false, undefined, () => URL.revokeObjectURL(url), () => URL.revokeObjectURL(url));
    texture.name = file.name;
    texture.metadata = {
      ...this.asMetadataObject(texture.metadata),
      editorSourceTexture: {
        fileName: file.name,
        byteLength: file.size,
        mimeType: file.type || "application/octet-stream",
        lastModified: file.lastModified
      }
    };
    material.diffuseTexture = texture;
    this.emitSelectionSnapshot();
  }

  /** 获取或创建可编辑的 StandardMaterial，方便属性面板和贴图导入复用。 */
  private ensureEditableMaterial(mesh: AbstractMesh): StandardMaterial {
    if (mesh.material instanceof StandardMaterial) {
      return mesh.material;
    }

    const material = new StandardMaterial(`${mesh.name} 材质`, this.scene);
    material.diffuseColor = Color3.FromHexString("#4fb477");
    mesh.material = material;
    return material;
  }

  /** 从文件名中提取小写扩展名，供导入器判断插件类型。 */
  private getFileExtension(fileName: string): string {
    const index = fileName.lastIndexOf(".");
    return index >= 0 ? fileName.slice(index).toLowerCase() : "";
  }

  /** 判断文件是否属于 Babylon 可加载的场景或模型。 */
  private isSceneFile(extension: string): boolean {
    return [".glb", ".gltf", ".babylon", ".obj", ".stl"].includes(extension);
  }

  /** 判断文件是否属于可直接绑定到材质的贴图资源。 */
  private isTextureFile(extension: string): boolean {
    return [".png", ".jpg", ".jpeg", ".webp", ".ktx", ".ktx2"].includes(extension);
  }

  /** 登记外部文件资产，供资产浏览器展示。 */
  private registerAsset(
    file: File,
    type: AssetRecord["type"],
    projectFile?: string,
    projectFiles?: string[],
    dependencyFiles: File[] = [file],
    unitMetadata?: ModelUnitMetadata
  ): void {
    const id = this.getFileAssetId(file);
    const existingIndex = this.assets.findIndex((asset) => asset.id === id);
    if (existingIndex >= 0) {
      this.assets.splice(existingIndex, 1);
    }

    this.assetFiles.set(id, file);
    this.assetDependencyFiles.set(id, this.dedupeFiles([file, ...dependencyFiles]));
    const unitAssetFields = unitMetadata ? this.createAssetUnitFields(unitMetadata) : {};
    this.assets.unshift({
      id,
      name: file.name,
      type,
      sizeLabel: formatBytes(file.size),
      createdAt: Date.now(),
      projectFile,
      projectFiles,
      sourceAvailable: true,
      ...unitAssetFields
    });
  }

  /** 登记模型包资产，复用项目源文件列表以支持重新加载和拖拽实例化。 */
  private registerModelPackageAsset(
    file: File,
    manifest: ModelPackageManifest,
    projectFile: string | undefined,
    projectFiles: string[],
    unitMetadata: ModelUnitMetadata,
    dependencyFiles: File[]
  ): AssetRecord {
    const id = `${manifest.packageId}-${this.getFileAssetId(file)}`;
    const existingIndex = this.assets.findIndex((asset) => asset.id === id);
    if (existingIndex >= 0) {
      this.assets.splice(existingIndex, 1);
    }

    this.assetFiles.set(id, file);
    this.assetDependencyFiles.set(id, this.dedupeFiles([file, ...dependencyFiles]));
    const asset: AssetRecord = {
      id,
      name: manifest.displayName,
      type: "model",
      sizeLabel: formatBytes(file.size),
      createdAt: Date.now(),
      projectFile,
      projectFiles,
      sourceAvailable: true,
      modelPackage: manifest,
      ...this.createAssetUnitFields(unitMetadata)
    };
    this.assets.unshift(asset);
    return asset;
  }

  /** 将单位归一化 metadata 展开为可序列化的资产记录字段。 */
  private createAssetUnitFields(unitMetadata: ModelUnitMetadata): Pick<
    AssetRecord,
    | "sourceUnit"
    | "unitScaleToMeters"
    | "unitInferenceMethod"
    | "unitInferenceConfidence"
    | "unitNormalizationVersion"
    | "rawMaxDimension"
    | "normalizedMaxDimension"
  > {
    return {
      sourceUnit: unitMetadata.sourceUnit,
      unitScaleToMeters: unitMetadata.unitScaleToMeters,
      unitInferenceMethod: unitMetadata.inferenceMethod,
      unitInferenceConfidence: unitMetadata.confidence,
      unitNormalizationVersion: unitMetadata.version,
      rawMaxDimension: unitMetadata.rawMaxDimension,
      normalizedMaxDimension: unitMetadata.normalizedMaxDimension
    };
  }

  /** 回写资产首次实例化时推断出的单位策略，保证后续拖入稳定复用。 */
  private updateAssetUnitMetadata(assetId: string, unitMetadata: ModelUnitMetadata): void {
    const asset = this.assets.find((item) => item.id === assetId);
    if (!asset) {
      return;
    }

    Object.assign(asset, this.createAssetUnitFields(unitMetadata));
    this.callbacks.onAssetsChange([...this.assets]);
  }

  /** 生成当前主资产对应的项目源文件列表，主文件和依赖文件都用于项目重开后的懒恢复。 */
  private getProjectFilesForAsset(file: File, fileArray: File[], projectFiles: Map<File, string>): string[] | undefined {
    const files = this.getDependencyFilesForAsset(file, fileArray)
      .map((item) => projectFiles.get(item))
      .filter((projectFile): projectFile is string => Boolean(projectFile));
    return files.length > 0 ? [...new Set(files)] : undefined;
  }

  /** 同批选择的非场景文件作为模型依赖，支持 glTF/OBJ 的 bin、mtl 和贴图重开后继续可用。 */
  private getDependencyFilesForAsset(file: File, fileArray: File[]): File[] {
    const dependencyFiles = fileArray.filter((item) => item === file || !this.isSceneFile(this.getFileExtension(item.name)));
    return this.dedupeFiles(dependencyFiles);
  }

  /** 返回资产缓存文件，缺少依赖列表时至少包含主文件。 */
  private getCachedAssetFiles(assetId: string, mainFile: File): File[] {
    return this.assetDependencyFiles.get(assetId) ?? [mainFile];
  }

  /** 把本地文件注册给 Babylon 文件加载器，使 glTF/OBJ 可以按 file: 文件名解析同批依赖。 */
  private registerFilesForLocalImport(files: File[]): void {
    this.dedupeFiles(files).forEach((file) => {
      const key = file.name.toLowerCase();
      FilesInputStore.FilesToLoad[key] = file;
      this.localImportFileKeys.add(key);
    });
  }

  /** 清理本引擎写入 Babylon 全局文件缓存的条目，避免切换项目后继续持有大文件。 */
  private clearRegisteredLocalImportFiles(): void {
    this.localImportFileKeys.forEach((key) => {
      delete FilesInputStore.FilesToLoad[key];
    });
    this.localImportFileKeys.clear();
  }

  /** 按文件名、大小和修改时间去重，避免重复导入时依赖列表膨胀。 */
  private dedupeFiles(files: File[]): File[] {
    const seen = new Set<string>();
    return files.filter((file) => {
      const key = this.getFileAssetId(file);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  /** 生成同一会话内稳定的文件资产编号，避免重复导入同名同大小文件时出现多条记录。 */
  private getFileAssetId(file: File): string {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  /** 选中指定节点，并同步高亮、Gizmo、层级树和属性快照。 */
  private selectNode(node: TransformNode | null): void {
    this.setSelection(node ? [node] : [], node);
  }

  /** 写入选区集合，并保证主对象始终来自集合，避免属性面板指向已经取消选择的节点。 */
  private setSelection(nodes: TransformNode[], primaryNode: TransformNode | null): void {
    const selectableNodes = nodes.filter((node) => !node.metadata?.[HELPER_FLAG]);
    const selectableIds = new Set(selectableNodes.map((node) => node.uniqueId));
    const nextPrimary =
      primaryNode && selectableIds.has(primaryNode.uniqueId) ? primaryNode : selectableNodes[selectableNodes.length - 1] ?? null;

    this.selectedNodeIds = new Set(selectableNodes.map((node) => node.uniqueId));
    this.selectedNode = nextPrimary;
    // 普通选择只改变选区和 Gizmo，不改变相机 target，避免鼠标点选模型时视角跳动。
    this.ensureMoveToolForTransformSelection(nextPrimary);
    this.applyHighlight();
    this.syncGizmoMode();
    this.emitSelectionSnapshot();
    this.refreshSceneGraph(false);
  }

  /** 根据当前主选中对象同步 ArcRotateCamera 轨道中心，避免左键旋转继续绕世界原点。 */
  private syncCameraOrbitTargetToSelection(): void {
    this.syncCameraOrbitTargetToNode(this.selectedNode);
  }

  /** 将相机旋转中心切到指定节点中心，并保持当前相机位置不跳变。 */
  private syncCameraOrbitTargetToNode(node: TransformNode | null): void {
    if (this.overheadMode) {
      return;
    }

    if (!node || this.previewMode || this.transformGizmoDragging || node.metadata?.[HELPER_FLAG]) {
      return;
    }

    this.refreshNodeWorldMatrices(node);
    const bounds = this.getNodeWorldBounds(node);
    const orbitTarget = bounds?.center ?? node.getAbsolutePosition();
    this.editorCamera.setTarget(orbitTarget, false, true, false);
  }

  /** 选中可变换对象时自动进入移动工具，保证 X/Y/Z 方向轴立即绑定到可编辑根节点。 */
  private ensureMoveToolForTransformSelection(node: TransformNode | null): void {
    if (!node || this.previewMode || this.isEditorGroup(node) || this.isNodeLocked(node)) {
      return;
    }

    if (this.currentTool === "move") {
      return;
    }

    this.currentTool = "move";
    this.callbacks.onToolChange?.("move");
  }

  /** 读取当前选区中的可编辑 TransformNode，并过滤掉已经由选中祖先覆盖的子节点。 */
  private getTopLevelSelectedTransformNodes(): TransformNode[] {
    const transformNodeById = this.createTransformNodeLookup();
    const selectedNodes = [...this.selectedNodeIds]
      .map((id) => transformNodeById.get(id))
      .filter((node): node is TransformNode => node instanceof TransformNode && !node.metadata?.[HELPER_FLAG]);
    const selectedIds = new Set(selectedNodes.map((node) => node.uniqueId));

    return selectedNodes.filter((node) => !this.hasSelectedAncestor(node, selectedIds));
  }

  /** 判断节点是否已经被选区中的祖先覆盖，用于避免批量命令重复处理父子节点。 */
  private hasSelectedAncestor(node: TransformNode, selectedIds: Set<number>): boolean {
    let current = node.parent;
    while (current) {
      if (selectedIds.has(current.uniqueId)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /** 用选中节点世界坐标中心作为新 group 位置，避免多节点群组时 group 偏到某个单项上。 */
  private getSelectionGroupPosition(nodes: TransformNode[]): Vector3 {
    if (nodes.length === 0) {
      return Vector3.Zero();
    }

    const sum = nodes.reduce((position, node) => position.addInPlace(node.getAbsolutePosition()), Vector3.Zero());
    return sum.scaleInPlace(1 / nodes.length);
  }

  /** 从被拾取的子网格向上查找导入根节点或可编辑根节点。 */
  private findSelectableRoot(mesh: AbstractMesh): TransformNode {
    let current: Node | null = mesh;
    while (current?.parent) {
      if (current.metadata?.[ROOT_FLAG] && !current.metadata?.generatedByParametricRuntime) {
        return current as TransformNode;
      }
      current = current.parent;
    }

    return current instanceof TransformNode ? current : mesh;
  }

  /** 按 uniqueId 在可编辑变换节点中查找节点，兼容 Babylon 9 的 Scene API。 */
  private findTransformNodeByUniqueId(id: number): TransformNode | undefined {
    return [...this.scene.meshes, ...this.scene.transformNodes].find((node) => node.uniqueId === id);
  }

  /** 为本次批量选择创建一次性节点索引，避免 Shift 大范围选择时反复扫描场景。 */
  private createTransformNodeLookup(): Map<number, TransformNode> {
    return new Map([...this.scene.meshes, ...this.scene.transformNodes].map((node) => [node.uniqueId, node]));
  }

  /** 按 uniqueId 查找层级面板可展示的场景节点。 */
  private findSceneNodeByUniqueId(id: number): Node | undefined {
    return [...this.scene.meshes, ...this.scene.transformNodes, ...this.scene.lights, ...this.scene.cameras].find((node) => node.uniqueId === id);
  }

  /** 根据当前工具模式开启对应 Gizmo，并附着到选中节点。 */
  private syncGizmoMode(): void {
    const canTransformSelection = Boolean(
      this.selectedNode && !this.isEditorGroup(this.selectedNode) && !this.isNodeLocked(this.selectedNode)
    );

    if (this.previewMode || !canTransformSelection) {
      this.gizmoManager.positionGizmoEnabled = false;
      this.gizmoManager.rotationGizmoEnabled = false;
      this.gizmoManager.scaleGizmoEnabled = false;
      this.gizmoManager.boundingBoxGizmoEnabled = false;
      this.gizmoManager.attachToNode(null);
      return;
    }

    this.gizmoManager.positionGizmoEnabled = this.currentTool === "move";
    this.gizmoManager.rotationGizmoEnabled = this.currentTool === "rotate";
    this.gizmoManager.scaleGizmoEnabled = this.currentTool === "scale";
    this.gizmoManager.boundingBoxGizmoEnabled =
      this.currentTool === "select" &&
      Boolean(this.selectedNode) &&
      !this.isCadDrawingNode(this.selectedNode) &&
      !this.isLocatorWireCubeNode(this.selectedNode);
    this.bindGizmoRealtimeSync();
    this.gizmoManager.attachToNode(this.selectedNode);
  }

  /** 收集节点自身和子节点中的可编辑网格，便于导入模型整组应用属性。 */
  private getEditableMeshes(node: TransformNode): AbstractMesh[] {
    const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
    return meshes.filter((mesh) => !mesh.metadata?.[HELPER_FLAG]);
  }

  /** 计算节点下真实可渲染网格的世界包围盒，用于导入定位、自适应网格和相机取景。 */
  private getNodeWorldBounds(node: TransformNode, includeDisabled = false): NodeWorldBounds | null {
    const meshes = this.getEditableMeshes(node).filter((mesh) => mesh.getTotalVertices() > 0 && (includeDisabled || mesh.isEnabled()));
    return this.createNodeWorldBoundsFromMeshes(meshes);
  }

  /** 从一组 mesh 聚合世界包围盒。 */
  private createNodeWorldBoundsFromMeshes(meshes: AbstractMesh[]): NodeWorldBounds | null {
    if (meshes.length === 0) {
      return null;
    }

    const firstBox = meshes[0].getBoundingInfo().boundingBox;
    const minimum = firstBox.minimumWorld.clone();
    const maximum = firstBox.maximumWorld.clone();
    meshes.slice(1).forEach((mesh) => {
      const box = mesh.getBoundingInfo().boundingBox;
      minimum.x = Math.min(minimum.x, box.minimumWorld.x);
      minimum.y = Math.min(minimum.y, box.minimumWorld.y);
      minimum.z = Math.min(minimum.z, box.minimumWorld.z);
      maximum.x = Math.max(maximum.x, box.maximumWorld.x);
      maximum.y = Math.max(maximum.y, box.maximumWorld.y);
      maximum.z = Math.max(maximum.z, box.maximumWorld.z);
    });

    return this.createNodeWorldBounds(minimum, maximum);
  }

  /** 聚合当前所有可编辑根节点的包围盒，用于打开项目后一次性看到完整场景。 */
  private getEditableSceneBounds(): NodeWorldBounds | null {
    return this.scene.rootNodes
      .filter((node): node is TransformNode => node instanceof TransformNode && !node.metadata?.[HELPER_FLAG])
      .reduce<NodeWorldBounds | null>((bounds, node) => this.mergeNodeWorldBounds(bounds, this.getNodeWorldBounds(node)), null);
  }

  /** 合并两个世界包围盒，保留最大可见范围。 */
  private mergeNodeWorldBounds(current: NodeWorldBounds | null, next: NodeWorldBounds | null): NodeWorldBounds | null {
    if (!next) {
      return current;
    }

    if (!current) {
      return this.createNodeWorldBounds(next.minimum.clone(), next.maximum.clone());
    }

    const minimum = new Vector3(
      Math.min(current.minimum.x, next.minimum.x),
      Math.min(current.minimum.y, next.minimum.y),
      Math.min(current.minimum.z, next.minimum.z)
    );
    const maximum = new Vector3(
      Math.max(current.maximum.x, next.maximum.x),
      Math.max(current.maximum.y, next.maximum.y),
      Math.max(current.maximum.z, next.maximum.z)
    );
    return this.createNodeWorldBounds(minimum, maximum);
  }

  /** 从最小/最大点创建一致的包围盒快照。 */
  private createNodeWorldBounds(minimum: Vector3, maximum: Vector3): NodeWorldBounds {
    const size = maximum.subtract(minimum);
    return {
      minimum,
      maximum,
      center: minimum.add(size.scale(0.5)),
      size,
      maxDimension: Math.max(size.x, size.y, size.z)
    };
  }

  /** 立即刷新节点和子网格世界矩阵，保证属性面板输入后视口同步更新。 */
  private refreshNodeWorldMatrices(node: TransformNode): void {
    node.computeWorldMatrix(true);
    this.getEditableMeshes(node).forEach((mesh) => mesh.computeWorldMatrix(true));
  }

  /** 刷新选中轮廓，把多选集合中各模型的子网格去重后统一描边。 */
  private applyHighlight(explicitNode?: TransformNode | null): void {
    this.selectionOutlineLayer.clearSelection();

    const transformNodeById = explicitNode === undefined ? this.createTransformNodeLookup() : null;
    const nodes =
      explicitNode === undefined
        ? [...this.selectedNodeIds]
            .map((id) => transformNodeById?.get(id))
            .filter((node): node is TransformNode => node instanceof TransformNode && !node.metadata?.[HELPER_FLAG])
        : explicitNode
          ? [explicitNode]
          : [];
    if (nodes.length === 0) {
      return;
    }

    const meshesById = new Map<number, Mesh>();
    nodes.forEach((node) => {
      if (this.isCadDrawingNode(node)) {
        return;
      }

      this.getEditableMeshes(node)
        .filter((mesh): mesh is Mesh => mesh instanceof Mesh && !mesh.metadata?.[HELPER_FLAG] && !this.isCadDrawingNode(mesh))
        .filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.getTotalVertices() > 0)
        .forEach((mesh) => meshesById.set(mesh.uniqueId, mesh));
    });
    const meshes = [...meshesById.values()];

    if (meshes.length > 0) {
      this.selectionOutlineLayer.addSelection(meshes);
    }
  }

  /** 向 React 发出当前选中对象的属性快照。 */
  private emitSelectionSnapshot(): void {
    if (!this.selectedNode) {
      this.callbacks.onSelectionChange({ type: "scene", scene: this.createSceneInspectorSnapshot() });
      return;
    }

    this.callbacks.onSelectionChange({ type: "node", node: this.createTransformSnapshot(this.selectedNode) });
  }

  /** 从 Babylon 节点创建属性面板需要的完整快照。 */
  private createTransformSnapshot(node: TransformNode): TransformSnapshot {
    const rotation = node.rotationQuaternion ? node.rotationQuaternion.toEulerAngles() : node.rotation;
    const bounds = this.getNodeWorldBounds(node);
    const materialColor = this.getNodeMaterialColor(node);
    const selfLocked = this.isNodeSelfLocked(node);
    const lockedByAncestor = this.isNodeLockedByAncestor(node);
    const displayableChildren = this.getVisibleChildren(node).filter((child) => this.isSceneGraphDisplayNode(child));
    return {
      id: node.uniqueId,
      name: node.name,
      kind: this.getNodeKind(node),
      position: snapshotVector(node.position),
      dimensions: bounds ? snapshotVector(bounds.size) : undefined,
      rotation: snapshotVector(rotation, "degrees"),
      scaling: snapshotVector(node.scaling),
      visible: this.getNodeVisibility(node),
      materialColor,
      cadOpacity: node.metadata?.cadDrawing ? this.getCadDisplayOpacity(node) : undefined,
      selfLocked,
      locked: selfLocked || lockedByAncestor,
      lockedByAncestor,
      hasChildren: displayableChildren.length > 0,
      parentId: node.parent instanceof TransformNode ? node.parent.uniqueId : undefined,
      meshVertexModify: this.getNodeMeshVertexModify(node, materialColor),
      assetInfo: this.getNodeAssetInfo(node),
      dynamicParameters: this.getNodeDynamicParameters(node),
      poi: this.isPoiNode(node) ? this.getNodePoiConfig(node) : undefined,
      poiRuntime: this.isPoiNode(node) ? this.sceneBusinessRuntime.getPoiRuntimeState(node) : undefined,
      locatorAnimationConnection: this.isLocatorWireCubeNode(node) ? this.getLocatorAnimationConnection(node) : undefined,
      locatorDimensions: this.isLocatorWireCubeNode(node) ? this.getLocatorDimensions(node) : undefined
    };
  }

  /** 读取 MeshVertexModifyComponent 参数，旧场景没有记录时回退默认值。 */
  private getNodeMeshVertexModify(node: TransformNode, materialColor?: string): MeshVertexModifySnapshot {
    const editorMetadata = this.getNodeEditorMetadata(node);
    const stored = this.asMetadataObject(editorMetadata.meshVertexModify);
    return {
      showLegA: this.getBooleanMetadata(stored.showLegA, DEFAULT_MESH_VERTEX_MODIFY.showLegA),
      showLegB: this.getBooleanMetadata(stored.showLegB, DEFAULT_MESH_VERTEX_MODIFY.showLegB),
      rollerSkin: this.getBooleanMetadata(stored.rollerSkin, DEFAULT_MESH_VERTEX_MODIFY.rollerSkin),
      sideGuard: this.getBooleanMetadata(stored.sideGuard, DEFAULT_MESH_VERTEX_MODIFY.sideGuard),
      mainColor: typeof stored.mainColor === "string" ? stored.mainColor : materialColor,
      heightA: this.getNumberMetadata(stored.heightA, DEFAULT_MESH_VERTEX_MODIFY.heightA),
      heightB: this.getNumberMetadata(stored.heightB, DEFAULT_MESH_VERTEX_MODIFY.heightB),
      curveWidth: this.getNumberMetadata(stored.curveWidth, DEFAULT_MESH_VERTEX_MODIFY.curveWidth),
      radius: this.getNumberMetadata(stored.radius, DEFAULT_MESH_VERTEX_MODIFY.radius),
      curveAngle: this.getNumberMetadata(stored.curveAngle, DEFAULT_MESH_VERTEX_MODIFY.curveAngle),
      rollerDensity: this.getNumberMetadata(stored.rollerDensity, DEFAULT_MESH_VERTEX_MODIFY.rollerDensity)
    };
  }

  /** 读取当前节点的资产业务信息，资产编号与文件来源分开保存。 */
  private getNodeAssetInfo(node: TransformNode): AssetInfoSnapshot {
    const editorMetadata = this.getNodeEditorMetadata(node);
    const stored = this.asMetadataObject(editorMetadata.assetInfo);
    return {
      assetCode: typeof stored.assetCode === "string" ? stored.assetCode : "",
      sourceFile: this.getNodeSourceFileName(node)
    };
  }

  /** 读取定位框动画连接配置，旧场景缺失字段时回退到安全默认值。 */
  private getLocatorAnimationConnection(node: TransformNode): LocatorAnimationConnectionSnapshot {
    const editorMetadata = this.getNodeEditorMetadata(node);
    return this.normalizeLocatorAnimationConnection(this.asMetadataObject(editorMetadata.locatorAnimationConnection));
  }

  /** 将定位框动画连接配置收敛为稳定快照，非法字段不进入运行态。 */
  private normalizeLocatorAnimationConnection(value: Record<string, unknown>): LocatorAnimationConnectionSnapshot {
    return {
      version: 1,
      enabled: this.getBooleanMetadata(value.enabled, DEFAULT_LOCATOR_ANIMATION_CONNECTION.enabled),
      assetCode: this.getStringMetadata(value.assetCode, DEFAULT_LOCATOR_ANIMATION_CONNECTION.assetCode),
      deviceIdField: this.getStringMetadata(value.deviceIdField, DEFAULT_LOCATOR_ANIMATION_CONNECTION.deviceIdField),
      assetCodeField: this.getStringMetadata(value.assetCodeField, DEFAULT_LOCATOR_ANIMATION_CONNECTION.assetCodeField),
      positionXField: this.getStringMetadata(value.positionXField, DEFAULT_LOCATOR_ANIMATION_CONNECTION.positionXField),
      positionYField: this.getStringMetadata(value.positionYField, DEFAULT_LOCATOR_ANIMATION_CONNECTION.positionYField),
      positionZField: this.getStringMetadata(value.positionZField, DEFAULT_LOCATOR_ANIMATION_CONNECTION.positionZField),
      rotationYField: this.getStringMetadata(value.rotationYField, DEFAULT_LOCATOR_ANIMATION_CONNECTION.rotationYField),
      interpolationMs: Math.max(
        0,
        this.getNumberMetadata(value.interpolationMs, DEFAULT_LOCATOR_ANIMATION_CONNECTION.interpolationMs)
      )
    };
  }

  /** 读取选中节点所属模型包实例的动态参数快照。 */
  private getNodeDynamicParameters(node: TransformNode): DynamicParameterSnapshot | undefined {
    const packageRoot = this.findModelPackageRoot(node);
    if (!packageRoot) {
      return undefined;
    }

    const editorMetadata = this.getNodeEditorMetadata(packageRoot);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    const assetId = typeof instance.assetId === "string" ? instance.assetId : "";
    const packageId = typeof instance.packageId === "string" ? instance.packageId : "";
    const asset = this.assets.find((item) => item.id === assetId && item.modelPackage?.packageId === packageId);
    if (!asset?.modelPackage) {
      return undefined;
    }

    const values = this.getModelPackageValues(packageRoot, asset.modelPackage);

    return {
      packageId,
      assetId,
      displayName: asset.modelPackage.displayName,
      fields: asset.modelPackage.dynamicFields,
      values,
      runtimeWarning: this.getModelPackageRuntimeWarning(packageRoot)
    };
  }

  /** 根据模型包字段定义生成实例默认参数值。 */
  private createDefaultDynamicParameterValues(fields: DynamicInspectorField[]): Record<string, DynamicParameterValue> {
    return fields.reduce<Record<string, DynamicParameterValue>>((values, field) => {
      values[field.key] = field.defaultValue;
      return values;
    }, {});
  }

  /** 根据模型包 manifest 生成实例初始参数，优先采用 meta.json 中模型给出的参数值。 */
  private createInitialDynamicParameterValues(manifest: ModelPackageManifest): Record<string, DynamicParameterValue> {
    const values = this.createDefaultDynamicParameterValues(manifest.dynamicFields);
    const fieldsByKey = new Map(manifest.dynamicFields.map((field) => [field.key, field]));
    Object.entries(this.asMetadataObject(manifest.initialValues)).forEach(([key, value]) => {
      const field = fieldsByKey.get(key);
      const parameterValue = field ? this.normalizeDynamicParameterValueForField(field, value) : undefined;
      if (parameterValue === undefined) {
        return;
      }

      values[key] = parameterValue;
    });
    return values;
  }

  /** 将模型包实例信息写入导入根节点 metadata，参数值随场景序列化保存。 */
  private attachModelPackageMetadata(root: TransformNode, assetId: string, manifest: ModelPackageManifest): void {
    const values = this.createInitialDynamicParameterValues(manifest);
    this.mergeNodeEditorMetadata(root, {
      modelPackageInstance: {
        packageId: manifest.packageId,
        assetId,
        values
      },
      modelPackageRuntime: { warning: "" }
    });
    this.syncModelPackageScriptMetadata(root, manifest, values);
  }

  /** 从当前节点向上查找携带模型包实例 metadata 的根节点。 */
  private findModelPackageRoot(node: TransformNode): TransformNode | null {
    let current: Node | null = node;
    while (current) {
      const editorMetadata = this.getNodeEditorMetadata(current);
      const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
      if (typeof instance.packageId === "string" && typeof instance.assetId === "string") {
        return current instanceof TransformNode ? current : null;
      }
      current = current.parent;
    }

    return null;
  }

  /** 读取节点 metadata.editor，统一兼容旧场景中的空 metadata。 */
  private getNodeEditorMetadata(node: Node): Record<string, unknown> {
    return this.asMetadataObject(this.asMetadataObject(node.metadata).editor);
  }

  /** 判断节点是否是 POI 根节点，兼容旧顶层 metadata.poi 和新 poiConfig。 */
  private isPoiNode(node: Node | null | undefined): boolean {
    if (!(node instanceof TransformNode)) {
      return false;
    }

    const metadata = this.asMetadataObject(node.metadata);
    const editorMetadata = this.getNodeEditorMetadata(node);
    const poiConfig = this.asMetadataObject(editorMetadata.poiConfig);
    return typeof metadata.poi === "string" || typeof poiConfig.kind === "string" || typeof editorMetadata.poi === "string";
  }

  /** 读取并补齐 POI 可持久化配置，旧场景缺字段时自动落到 catalog 默认值。 */
  private getNodePoiConfig(node: TransformNode): PoiConfigSnapshot {
    const metadata = this.asMetadataObject(node.metadata);
    const editorMetadata = this.getNodeEditorMetadata(node);
    const legacyKind =
      (typeof metadata.poi === "string" && metadata.poi) ||
      (typeof editorMetadata.poi === "string" && editorMetadata.poi) ||
      undefined;
    return normalizePoiConfig(legacyKind, editorMetadata.poiConfig);
  }

  /** 合并写回 POI 配置，并保留顶层 metadata.poi 供旧场景和层级树识别。 */
  private updateNodePoiConfig(node: TransformNode, update: Partial<PoiConfigSnapshot>): void {
    const current = this.getNodePoiConfig(node);
    const nextConfig = normalizePoiConfig(current.kind, {
      ...current,
      ...update,
      kind: current.kind,
      version: 1
    });
    const metadata = this.asMetadataObject(node.metadata);
    node.metadata = {
      ...metadata,
      poi: nextConfig.kind
    };
    this.mergeNodeEditorMetadata(node, { poiConfig: nextConfig });
    if (update.title !== undefined) {
      node.name = update.title.trim() || node.name;
    }
    if (update.colorHex !== undefined) {
      this.applyPoiVisualColor(node, nextConfig.colorHex);
    }
    if (this.shouldRestartPoiRuntimeConnections(update)) {
      this.sceneBusinessRuntime.restart();
    } else if (this.shouldRefreshPoiRuntimeOverlay(update)) {
      this.sceneBusinessRuntime.cleanupPoi(node);
    }
  }

  /** 判断本次 POI 配置变更是否会影响 WebSocket/MQTT 外发连接。 */
  private shouldRestartPoiRuntimeConnections(update: Partial<PoiConfigSnapshot>): boolean {
    return ["enabled", "outputType", "websocketEndpoint", "mqttTopic"].some((key) => Object.prototype.hasOwnProperty.call(update, key));
  }

  /** 判断本次 POI 配置变更是否需要重建当前 POI 的运行态可视覆盖层。 */
  private shouldRefreshPoiRuntimeOverlay(update: Partial<PoiConfigSnapshot>): boolean {
    return ["enabled", "colorHex", "pathPoints"].some((key) => Object.prototype.hasOwnProperty.call(update, key));
  }

  /** 将 POI 配置颜色同步到当前可视网格材质。 */
  private applyPoiVisualColor(node: TransformNode, colorHex: string): void {
    const color = Color3.FromHexString(colorHex);
    node.getChildMeshes().forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof StandardMaterial) {
        material.diffuseColor = color;
        material.emissiveColor = color.scale(0.28);
      }
    });
  }

  /** 加载旧场景时补齐 POI 根标识和默认配置，不触碰其它 editor metadata。 */
  private ensureNodePoiMetadata(node: TransformNode): void {
    const config = this.getNodePoiConfig(node);
    const metadata = this.asMetadataObject(node.metadata);
    node.metadata = {
      ...metadata,
      [ROOT_FLAG]: true,
      poi: config.kind
    };
    this.mergeNodeEditorMetadata(node, { poiConfig: config });
  }

  /** 判断节点是否是编辑器逻辑分组，分组只承载树结构和批量操作。 */
  private isEditorGroup(node: Node | null | undefined): boolean {
    if (!node) {
      return false;
    }

    return this.getNodeEditorMetadata(node).nodeType === GROUP_NODE_TYPE;
  }

  /** 判断节点自身是否被锁定，不包含父级继承状态。 */
  private isNodeSelfLocked(node: Node | null | undefined): boolean {
    if (!node) {
      return false;
    }

    return this.getNodeEditorMetadata(node).locked === true;
  }

  /** 判断节点是否继承了父级锁定，供树图标显示和编辑拦截复用。 */
  private isNodeLockedByAncestor(node: Node | null | undefined): boolean {
    let current = node?.parent ?? null;
    while (current) {
      if (this.isNodeSelfLocked(current)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /** 判断节点当前是否有效锁定，父级 group 锁定会覆盖子模型。 */
  private isNodeLocked(node: Node | null | undefined): boolean {
    return this.isNodeSelfLocked(node) || this.isNodeLockedByAncestor(node);
  }

  /** 判断 ancestor 是否是 node 的父级链路成员，避免拖拽形成循环层级。 */
  private isNodeAncestor(ancestor: Node, node: Node): boolean {
    let current = node.parent;
    while (current) {
      if (current.uniqueId === ancestor.uniqueId) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /** 从 metadata 中读取布尔值，缺失或类型不符时使用默认值。 */
  private getBooleanMetadata(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  /** 从 metadata 中读取有限数字，缺失或类型不符时使用默认值。 */
  private getNumberMetadata(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  /** 合并写回指定节点的 MeshVertexModifyComponent 参数，不直接修改真实 mesh 顶点。 */
  private updateNodeMeshVertexModify(node: TransformNode, update: Partial<MeshVertexModifySnapshot>): MeshVertexModifySnapshot {
    const current = this.getNodeMeshVertexModify(node, this.getNodeMaterialColor(node));
    const editorMetadata = this.getNodeEditorMetadata(node);
    const stored = this.asMetadataObject(editorMetadata.meshVertexModify);
    const next = {
      ...stored,
      ...current,
      ...update
    } as MeshVertexModifySnapshot;
    this.mergeNodeEditorMetadata(node, { meshVertexModify: next });
    return next;
  }

  /** 对旧版 MeshVertexModifyComponent 中可安全落地的参数应用运行态几何变化。 */
  private applyMeshVertexModifyRuntime(node: TransformNode, value: MeshVertexModifySnapshot): void {
    this.applyRollerCountToNamedRollers(node, value.rollerDensity, false);
    this.refreshNodeWorldMatrices(node);
    this.applyHighlight();
    this.callbacks.onStatsChange(this.collectStats());
  }

  /** 模型包运行脚本执行后统一补齐编辑器侧安全兜底，覆盖脚本缺失和旧命名模型。 */
  private applyModelPackageDynamicFallbacks(
    root: TransformNode,
    values: Record<string, DynamicParameterValue>,
    changedParameterKey?: string
  ): void {
    if (this.applyOpaqueChainConveyorParameterFallback(root, values)) {
      return;
    }

    if (this.applyOpaqueRollerConveyorParameterFallback(root, values, changedParameterKey)) {
      return;
    }

    this.applyModelPackageRollerDensityFallback(root, values);
    this.applyOpaqueRollerConveyorSupportFallback(root, values);
  }

  /** 当前链条机 GLB 使用固定节点名，长度变化时按部件级规则更新，避免整体 Z 缩放拉伸电机和支架。 */
  private applyOpaqueChainConveyorParameterFallback(
    root: TransformNode,
    values: Record<string, DynamicParameterValue>
  ): boolean {
    if (!this.isOpaqueChainConveyorPackage(root)) {
      return false;
    }

    this.resetModelPackageRootParametricAxisScaling(root, "x");
    this.resetModelPackageRootParametricAxisScaling(root, "z");
    const baseline = this.ensureOpaqueChainConveyorBaseline(root);
    if (!baseline) {
      return false;
    }

    this.restoreOpaqueChainConveyorBaseline(root, baseline);
    this.disposeGeneratedChainConveyorNodes(root);

    const requestedLength = this.readPositiveDynamicNumberParameter(values.chainLength, baseline.size.z);
    const targetLength = this.createOpaqueChainConveyorEffectiveLength(baseline, requestedLength);
    const lengthDelta = targetLength - baseline.size.z;
    const requestedWidth = this.readPositiveDynamicNumberParameter(values.chainWidth, baseline.size.x);
    const targetWidth = this.createOpaqueChainConveyorEffectiveWidth(baseline, requestedWidth);
    const widthDelta = targetWidth - baseline.size.x;
    const widthCenterX = this.getOpaqueChainConveyorBaselineCenterX(baseline);
    const nodesByName = this.getOpaqueChainConveyorNodesByName(root);

    OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.forEach((nodeName) => {
      const node = nodesByName.get(nodeName);
      const nodeBaseline = baseline.nodes.get(nodeName);
      if (node && nodeBaseline) {
        if (nodeName === OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME) {
          this.applyOpaqueChainConveyorBodyLengthGeometryForNode(node, nodeBaseline, baseline, baseline.minimum.z, lengthDelta);
          return;
        }
        this.applyOpaqueChainConveyorLengthGeometryForNode(node, nodeBaseline, baseline.minimum.z, lengthDelta);
      }
    });
    OPAQUE_CHAIN_CONVEYOR_WIDTH_GEOMETRY_NODE_NAMES.forEach((nodeName) => {
      const node = nodesByName.get(nodeName);
      const nodeBaseline = baseline.nodes.get(nodeName);
      if (node && nodeBaseline) {
        if (nodeName === OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME) {
          this.applyOpaqueChainConveyorBodyWidthGeometryForNode(node, nodeBaseline, baseline, widthCenterX, widthDelta);
          return;
        }
        this.applyOpaqueChainConveyorWidthGeometryForNode(node, nodeBaseline, widthCenterX, widthDelta);
      }
    });

    this.refreshNodeWorldMatrices(root);
    OPAQUE_CHAIN_CONVEYOR_TAIL_FOLLOW_NODE_NAMES.forEach((nodeName) => {
      const node = nodesByName.get(nodeName);
      const nodeBaseline = baseline.nodes.get(nodeName);
      if (node && nodeBaseline) {
        this.moveNodeCenterOnRootAxis(root, node, "z", nodeBaseline.center.z + lengthDelta);
      }
    });
    OPAQUE_CHAIN_CONVEYOR_WIDTH_FOLLOW_NODE_NAMES.forEach((nodeName) => {
      const node = nodesByName.get(nodeName);
      const nodeBaseline = baseline.nodes.get(nodeName);
      if (node && nodeBaseline) {
        this.moveNodeCenterOnRootAxis(root, node, "x", nodeBaseline.center.x + this.createOpaqueChainConveyorWidthOffset(baseline, nodeBaseline, widthDelta));
      }
    });

    const showFrontSupport = this.readDynamicBooleanParameter(values.showFrontSupport);
    const showRearSupport = this.readDynamicBooleanParameter(values.showRearSupport);
    if (showFrontSupport !== undefined) {
      this.setNamedSupportNodesEnabled(root, ["ZJ01"], showFrontSupport);
    }
    if (showRearSupport !== undefined) {
      this.setNamedSupportNodesEnabled(root, ["ZJ"], showRearSupport);
    }

    this.refreshNodeWorldMatrices(root);
    this.applyHighlight();
    this.callbacks.onStatsChange(this.collectStats());
    return true;
  }

  /** 链条机长度按参数相对基线增减，但不会缩短到让任一红框网格反向。 */
  private createOpaqueChainConveyorEffectiveLength(baseline: OpaqueChainConveyorBaseline, requestedLength: number): number {
    const minimumLength = this.createOpaqueChainConveyorMinimumEffectiveLength(baseline);
    return Math.max(minimumLength, requestedLength);
  }

  /** 计算链条机允许的最短有效长度，保证所有参与顶点延展的 Mesh 仍保留正向长度。 */
  private createOpaqueChainConveyorMinimumEffectiveLength(baseline: OpaqueChainConveyorBaseline): number {
    const stretchableRootLengths: number[] = [];
    const captureStretchableLength = (geometryBaseline: OpaqueChainConveyorLengthGeometryBaseline, lengthAnchorZ: number): void => {
      if (!geometryBaseline.positionVertices) {
        return;
      }

      const stretchableRootLength = this.getOpaqueChainConveyorRootStretchLength(lengthAnchorZ, geometryBaseline);
      if (stretchableRootLength > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON && Number.isFinite(stretchableRootLength)) {
        stretchableRootLengths.push(stretchableRootLength);
      }
    };

    OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.forEach((nodeName) => {
      const nodeBaseline = baseline.nodes.get(nodeName);
      if (!nodeBaseline) {
        return;
      }
      const lengthAnchorZ =
        nodeName === OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME
          ? this.getOpaqueChainConveyorBodyLengthAnchorZ(baseline, nodeBaseline, baseline.minimum.z)
          : baseline.minimum.z;
      captureStretchableLength(nodeBaseline, lengthAnchorZ);
      nodeBaseline.lengthMeshBaselines?.forEach((meshBaseline) => {
        captureStretchableLength(
          meshBaseline,
          nodeName === OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME
            ? this.getOpaqueChainConveyorBodyLengthAnchorZ(baseline, meshBaseline, baseline.minimum.z)
            : baseline.minimum.z
        );
      });
    });

    if (stretchableRootLengths.length === 0) {
      return Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, baseline.size.z);
    }

    const maximumSafeShrink = Math.min(...stretchableRootLengths) - MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON;
    return Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, baseline.size.z - Math.max(0, maximumSafeShrink));
  }

  /** 链条机宽度按整机外包络处理，避免继续使用根节点 X 缩放。 */
  private createOpaqueChainConveyorEffectiveWidth(baseline: OpaqueChainConveyorBaseline, requestedWidth: number): number {
    return Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, requestedWidth, baseline.size.x * 0.05);
  }

  /** 根据节点处于宽度中心的哪一侧，计算刚体外移量。 */
  private createOpaqueChainConveyorWidthOffset(
    baseline: OpaqueChainConveyorBaseline,
    nodeBaseline: OpaqueChainConveyorNodeBaseline,
    widthDelta: number
  ): number {
    if (Math.abs(widthDelta) <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return 0;
    }

    const centerOffset = nodeBaseline.center.x - this.getOpaqueChainConveyorBaselineCenterX(baseline);
    if (Math.abs(centerOffset) <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return 0;
    }
    return Math.sign(centerOffset) * widthDelta / 2;
  }

  /** 读取链条机整机基线宽度中心，避免把中心点额外写入 metadata。 */
  private getOpaqueChainConveyorBaselineCenterX(baseline: OpaqueChainConveyorBaseline): number {
    return (baseline.minimum.x + baseline.maximum.x) / 2;
  }

  /** 计算链条机中间驱动区的半宽，Box003 在这个区域内的顶点保持原始形状。 */
  private getOpaqueChainConveyorDriveBayHalfWidth(baseline: OpaqueChainConveyorBaseline): number {
    const motorBaseline = baseline.nodes.get(OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME);
    const fromBody = baseline.size.x * OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_HALF_WIDTH_RATIO;
    const fromMotor = (motorBaseline?.size.x ?? 0) * OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_MOTOR_WIDTH_RATIO;
    return Math.max(fromBody, fromMotor, MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON);
  }

  /** 计算链条机中间驱动区的半深度，保护 DJ 前后驱动座不被长度参数拉斜。 */
  private getOpaqueChainConveyorDriveBayHalfDepth(baseline: OpaqueChainConveyorBaseline): number {
    const motorBaseline = baseline.nodes.get(OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME);
    const fromBody = baseline.size.z * OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_HALF_DEPTH_RATIO;
    const fromMotor = (motorBaseline?.size.z ?? 0) * OPAQUE_CHAIN_CONVEYOR_DRIVE_BAY_MOTOR_DEPTH_RATIO;
    return Math.max(fromBody, fromMotor, MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON);
  }

  /** 取得 DJ 驱动段在根节点 Z 轴上的尾侧边界，Box003 只从这里之后开始承担长度增量。 */
  private getOpaqueChainConveyorDriveBayTailRootZ(baseline: OpaqueChainConveyorBaseline): number | null {
    const motorBaseline = baseline.nodes.get(OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME);
    if (!motorBaseline) {
      return null;
    }
    return motorBaseline.center.z + this.getOpaqueChainConveyorDriveBayHalfDepth(baseline);
  }

  /** Box003 长度锚点锁到 DJ 驱动段尾侧，避免中间电机座和支撑板被拉长。 */
  private getOpaqueChainConveyorBodyLengthAnchorZ(
    conveyorBaseline: OpaqueChainConveyorBaseline,
    geometryBaseline: OpaqueChainConveyorLengthGeometryBaseline,
    fallbackAnchorZ: number
  ): number {
    const driveBayTailZ = this.getOpaqueChainConveyorDriveBayTailRootZ(conveyorBaseline);
    const requestedAnchorZ = driveBayTailZ === null ? fallbackAnchorZ : Math.max(fallbackAnchorZ, driveBayTailZ);
    const nodeMinimumZ = geometryBaseline.center.z - geometryBaseline.size.z / 2;
    const nodeMaximumZ = geometryBaseline.center.z + geometryBaseline.size.z / 2;
    return Math.min(nodeMaximumZ, Math.max(nodeMinimumZ, requestedAnchorZ));
  }

  /** 判断顶点是否位于链条机中间驱动区，驱动区不能随长度或宽度参数被拉伸。 */
  private isOpaqueChainConveyorDriveBayVertex(
    conveyorBaseline: OpaqueChainConveyorBaseline,
    geometryBaseline: OpaqueChainConveyorLengthGeometryBaseline,
    xBounds: { minimum: number; maximum: number; center: number },
    zBounds: { minimum: number; maximum: number; center: number },
    sourceX: number,
    sourceZ: number
  ): boolean {
    const motorBaseline = conveyorBaseline.nodes.get(OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME);
    if (!motorBaseline) {
      return false;
    }

    const rootX = this.mapOpaqueChainConveyorLengthVertexAxisToRootAxis(sourceX, geometryBaseline, xBounds, "x");
    const rootZ = this.mapOpaqueChainConveyorLengthVertexAxisToRootAxis(sourceZ, geometryBaseline, zBounds, "z");
    return (
      Math.abs(rootX - motorBaseline.center.x) <= this.getOpaqueChainConveyorDriveBayHalfWidth(conveyorBaseline) &&
      Math.abs(rootZ - motorBaseline.center.z) <= this.getOpaqueChainConveyorDriveBayHalfDepth(conveyorBaseline)
    );
  }

  /** 对 Box003 应用长度延展，但保护中间驱动区，避免电机支撑和红框区域被拉长变形。 */
  private applyOpaqueChainConveyorBodyLengthGeometryForNode(
    node: TransformNode,
    baseline: OpaqueChainConveyorNodeBaseline,
    conveyorBaseline: OpaqueChainConveyorBaseline,
    lengthAnchorZ: number,
    lengthDelta: number
  ): void {
    this.applyOpaqueChainConveyorBodyLengthGeometry(node, baseline, conveyorBaseline, lengthAnchorZ, lengthDelta);
    baseline.lengthMeshBaselines?.forEach((meshBaseline) => {
      const mesh = this.resolveOpaqueChainConveyorLengthMesh(node, meshBaseline.path);
      if (mesh) {
        this.applyOpaqueChainConveyorBodyLengthGeometry(mesh, meshBaseline, conveyorBaseline, lengthAnchorZ, lengthDelta);
      }
    });
  }

  /** 对 Box003 应用宽度延展，但保护中间驱动区，避免电机支撑板随宽度被横向拉开。 */
  private applyOpaqueChainConveyorBodyWidthGeometryForNode(
    node: TransformNode,
    baseline: OpaqueChainConveyorNodeBaseline,
    conveyorBaseline: OpaqueChainConveyorBaseline,
    widthCenterX: number,
    widthDelta: number
  ): void {
    this.applyOpaqueChainConveyorBodyWidthGeometry(node, baseline, conveyorBaseline, widthCenterX, widthDelta);
    baseline.lengthMeshBaselines?.forEach((meshBaseline) => {
      const mesh = this.resolveOpaqueChainConveyorLengthMesh(node, meshBaseline.path);
      if (mesh) {
        this.applyOpaqueChainConveyorBodyWidthGeometry(mesh, meshBaseline, conveyorBaseline, widthCenterX, widthDelta);
      }
    });
  }

  /** 只让 Box003 内真正的长梁伸长，横梁、脚板和支撑脚按刚体平移保持原始形状。 */
  private applyOpaqueChainConveyorBodyLengthGeometry(
    node: TransformNode,
    baseline: OpaqueChainConveyorLengthGeometryBaseline,
    conveyorBaseline: OpaqueChainConveyorBaseline,
    lengthAnchorZ: number,
    lengthDelta: number
  ): void {
    if (!(node instanceof Mesh) || !baseline.positionVertices || !Number.isFinite(lengthAnchorZ) || !Number.isFinite(lengthDelta)) {
      return;
    }

    const baselinePositionVertices = baseline.positionVertices;
    const zBounds = this.getPositionVertexAxisBounds(baselinePositionVertices, "z");
    const xBounds = this.getPositionVertexAxisBounds(baselinePositionVertices, "x");
    if (!zBounds || !xBounds || baseline.size.z <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const bodyAnchorZ = this.getOpaqueChainConveyorBodyLengthAnchorZ(conveyorBaseline, baseline, lengthAnchorZ);
    const anchorVertexZ = this.mapOpaqueChainConveyorRootZToLengthVertexZ(bodyAnchorZ, baseline, zBounds);
    const stretchableRootLength = this.getOpaqueChainConveyorRootStretchLength(bodyAnchorZ, baseline);
    if (stretchableRootLength <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const stretchRatio = Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, stretchableRootLength + lengthDelta) / stretchableRootLength;
    const nextPositions = baselinePositionVertices.slice();
    const vertexUnitsPerRootUnit = (zBounds.maximum - zBounds.minimum) / baseline.size.z;
    const rigidVertexDeltaZ = lengthDelta * vertexUnitsPerRootUnit;
    this.createOpaqueChainConveyorMeshComponents(node, baselinePositionVertices).forEach((component) => {
      if (component.maximum.z <= anchorVertexZ + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
        return;
      }
      if (this.shouldStretchOpaqueChainConveyorBodyLengthComponent(component, zBounds)) {
        component.vertexIndices.forEach((vertexIndex) => {
          const positionIndex = vertexIndex * 3 + 2;
          const sourceZ = baselinePositionVertices[positionIndex];
          if (sourceZ > anchorVertexZ + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
            nextPositions[positionIndex] = anchorVertexZ + (sourceZ - anchorVertexZ) * stretchRatio;
          }
        });
        return;
      }
      if (
        component.center.z > anchorVertexZ + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON &&
        !this.isOpaqueChainConveyorDriveBayComponent(conveyorBaseline, baseline, xBounds, zBounds, component)
      ) {
        component.vertexIndices.forEach((vertexIndex) => {
          nextPositions[vertexIndex * 3 + 2] += rigidVertexDeltaZ;
        });
      }
    });
    node.setVerticesData(VertexBuffer.PositionKind, nextPositions, true);
    node.refreshBoundingInfo(false, false);
  }

  /** 宽度变化时侧边小块按刚体外移，内部跨宽横梁/支撑也按 X 向延展，避免主体与导轨脱开架空。 */
  private applyOpaqueChainConveyorBodyWidthGeometry(
    node: TransformNode,
    baseline: OpaqueChainConveyorLengthGeometryBaseline,
    conveyorBaseline: OpaqueChainConveyorBaseline,
    widthCenterX: number,
    widthDelta: number
  ): void {
    if (!(node instanceof Mesh) || !baseline.positionVertices || !Number.isFinite(widthCenterX) || !Number.isFinite(widthDelta)) {
      return;
    }

    const baselinePositionVertices = baseline.positionVertices;
    const xBounds = this.getPositionVertexAxisBounds(baselinePositionVertices, "x");
    const zBounds = this.getPositionVertexAxisBounds(baselinePositionVertices, "z");
    if (!xBounds || !zBounds || baseline.size.x <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const currentPositions = node.getVerticesData(VertexBuffer.PositionKind, true, true);
    if (!currentPositions || currentPositions.length !== baselinePositionVertices.length) {
      return;
    }

    const anchorVertexX = this.mapOpaqueChainConveyorRootXToWidthVertexX(widthCenterX, baseline, xBounds);
    const vertexUnitsPerRootUnit = (xBounds.maximum - xBounds.minimum) / baseline.size.x;
    const vertexHalfDelta = widthDelta * vertexUnitsPerRootUnit / 2;
    const nextPositions = Array.from(currentPositions, (position) => Number(position));
    this.createOpaqueChainConveyorMeshComponents(node, baselinePositionVertices).forEach((component) => {
      if (this.shouldProtectOpaqueChainConveyorDriveBayWidthComponent(conveyorBaseline, baseline, xBounds, zBounds, component)) {
        return;
      }

      if (this.shouldMoveOpaqueChainConveyorBodyWidthComponent(component, xBounds)) {
        const rootCenterX = this.mapOpaqueChainConveyorLengthVertexAxisToRootAxis(component.center.x, baseline, xBounds, "x");
        const rootOffset = rootCenterX - widthCenterX;
        if (Math.abs(rootOffset) <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
          return;
        }
        const vertexDeltaX = Math.sign(rootOffset) * vertexHalfDelta;
        component.vertexIndices.forEach((vertexIndex) => {
          nextPositions[vertexIndex * 3] += vertexDeltaX;
        });
        return;
      }

      if (!this.shouldStretchOpaqueChainConveyorBodyWidthComponent(component, xBounds)) {
        return;
      }

      component.vertexIndices.forEach((vertexIndex) => {
        const positionIndex = vertexIndex * 3;
        const sourceX = baselinePositionVertices[positionIndex];
        if (sourceX > anchorVertexX + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
          nextPositions[positionIndex] += vertexHalfDelta;
        } else if (sourceX < anchorVertexX - MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
          nextPositions[positionIndex] -= vertexHalfDelta;
        }
      });
    });
    node.setVerticesData(VertexBuffer.PositionKind, nextPositions, true);
    node.refreshBoundingInfo(false, false);
  }

  /** 按坐标焊接后的物理连通关系拆分 Mesh 顶点，避免 Box003 的支撑脚和横梁被面片级规则拆散。 */
  private createOpaqueChainConveyorMeshComponents(
    mesh: Mesh,
    positionVertices: number[]
  ): OpaqueChainConveyorMeshComponent[] {
    const vertexCount = Math.floor(positionVertices.length / 3);
    const indices = mesh.getIndices();
    if (!indices || indices.length < 3 || vertexCount <= 0) {
      return [this.createOpaqueChainConveyorMeshComponent([...Array(vertexCount).keys()], positionVertices)];
    }

    const parents = Array.from({ length: vertexCount }, (_, index) => index);
    const find = (index: number): number => {
      let current = index;
      while (parents[current] !== current) {
        parents[current] = parents[parents[current]];
        current = parents[current];
      }
      return current;
    };
    const union = (left: number, right: number): void => {
      if (left < 0 || right < 0 || left >= vertexCount || right >= vertexCount) {
        return;
      }
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) {
        parents[rightRoot] = leftRoot;
      }
    };

    const weldedVertexByKey = new Map<string, number>();
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const key = this.createOpaqueChainConveyorMeshComponentWeldKey(positionVertices, vertexIndex);
      const weldedVertexIndex = weldedVertexByKey.get(key);
      if (weldedVertexIndex === undefined) {
        weldedVertexByKey.set(key, vertexIndex);
      } else {
        union(weldedVertexIndex, vertexIndex);
      }
    }

    for (let index = 0; index + 2 < indices.length; index += 3) {
      const first = Number(indices[index]);
      const second = Number(indices[index + 1]);
      const third = Number(indices[index + 2]);
      union(first, second);
      union(second, third);
      union(third, first);
    }

    const componentVertices = new Map<number, number[]>();
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const root = find(vertexIndex);
      const vertices = componentVertices.get(root) ?? [];
      vertices.push(vertexIndex);
      componentVertices.set(root, vertices);
    }

    return [...componentVertices.values()]
      .filter((vertices) => vertices.length > 0)
      .map((vertices) => this.createOpaqueChainConveyorMeshComponent(vertices, positionVertices));
  }

  /** 为同坐标拆分顶点生成稳定焊接键，保证横梁、脚板等实体按整体参与参数化。 */
  private createOpaqueChainConveyorMeshComponentWeldKey(positionVertices: number[], vertexIndex: number): string {
    const positionIndex = vertexIndex * 3;
    const normalize = (value: number): number => {
      const coordinate = Number.isFinite(value) ? value : 0;
      return Math.round(coordinate * OPAQUE_CHAIN_CONVEYOR_COMPONENT_WELD_PRECISION);
    };
    return [
      normalize(positionVertices[positionIndex]),
      normalize(positionVertices[positionIndex + 1]),
      normalize(positionVertices[positionIndex + 2])
    ].join("|");
  }

  /** 计算一个 Box003 物理连通块的局部包围盒，后续按块判断伸长或刚体平移。 */
  private createOpaqueChainConveyorMeshComponent(
    vertexIndices: number[],
    positionVertices: number[]
  ): OpaqueChainConveyorMeshComponent {
    const minimum = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const maximum = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    vertexIndices.forEach((vertexIndex) => {
      const positionIndex = vertexIndex * 3;
      const x = positionVertices[positionIndex];
      const y = positionVertices[positionIndex + 1];
      const z = positionVertices[positionIndex + 2];
      minimum.x = Math.min(minimum.x, x);
      minimum.y = Math.min(minimum.y, y);
      minimum.z = Math.min(minimum.z, z);
      maximum.x = Math.max(maximum.x, x);
      maximum.y = Math.max(maximum.y, y);
      maximum.z = Math.max(maximum.z, z);
    });

    const center = minimum.add(maximum).scale(0.5);
    return {
      vertexIndices,
      minimum,
      maximum,
      center,
      size: maximum.subtract(minimum)
    };
  }

  /** 只有沿长度方向占比足够大的 Box003 连通块才允许被拉长，其它支撑块保持刚体。 */
  private shouldStretchOpaqueChainConveyorBodyLengthComponent(
    component: OpaqueChainConveyorMeshComponent,
    zBounds: { minimum: number; maximum: number; center: number }
  ): boolean {
    const meshLength = zBounds.maximum - zBounds.minimum;
    return (
      meshLength > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON &&
      component.size.z >= meshLength * 0.45 &&
      component.size.x <= Math.max(meshLength * 0.18, component.size.z * 0.2)
    );
  }

  /** 宽度变化时侧边窄块作为刚体跟随边界移动，避免长梁和支撑小件截面被横向拉胖。 */
  private shouldMoveOpaqueChainConveyorBodyWidthComponent(
    component: OpaqueChainConveyorMeshComponent,
    xBounds: { minimum: number; maximum: number; center: number }
  ): boolean {
    const meshWidth = xBounds.maximum - xBounds.minimum;
    return meshWidth > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON && component.size.x <= meshWidth * 0.35;
  }

  /** 跨宽连通块需要随 chainWidth 顶点延展，否则两侧导轨外移后内部横梁会悬空。 */
  private shouldStretchOpaqueChainConveyorBodyWidthComponent(
    component: OpaqueChainConveyorMeshComponent,
    xBounds: { minimum: number; maximum: number; center: number }
  ): boolean {
    const meshWidth = xBounds.maximum - xBounds.minimum;
    return meshWidth > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON && component.size.x > meshWidth * 0.35;
  }

  /** DJ 驱动区内的紧凑小件保持原始位置和截面，跨宽件仍允许延展来连接新的主体宽度。 */
  private shouldProtectOpaqueChainConveyorDriveBayWidthComponent(
    conveyorBaseline: OpaqueChainConveyorBaseline,
    geometryBaseline: OpaqueChainConveyorLengthGeometryBaseline,
    xBounds: { minimum: number; maximum: number; center: number },
    zBounds: { minimum: number; maximum: number; center: number },
    component: OpaqueChainConveyorMeshComponent
  ): boolean {
    return (
      this.shouldMoveOpaqueChainConveyorBodyWidthComponent(component, xBounds) &&
      this.isOpaqueChainConveyorDriveBayComponent(conveyorBaseline, geometryBaseline, xBounds, zBounds, component)
    );
  }

  /** 按连通块中心判断是否属于 DJ 中间驱动区，驱动段保持原始形状和位置。 */
  private isOpaqueChainConveyorDriveBayComponent(
    conveyorBaseline: OpaqueChainConveyorBaseline,
    geometryBaseline: OpaqueChainConveyorLengthGeometryBaseline,
    xBounds: { minimum: number; maximum: number; center: number },
    zBounds: { minimum: number; maximum: number; center: number },
    component: OpaqueChainConveyorMeshComponent
  ): boolean {
    return this.isOpaqueChainConveyorDriveBayVertex(
      conveyorBaseline,
      geometryBaseline,
      xBounds,
      zBounds,
      component.center.x,
      component.center.z
    );
  }

  /** 对链条机命名节点及其真实子 Mesh 应用长度延展，兼容 Rail 节点导出为空包装的情况。 */
  private applyOpaqueChainConveyorLengthGeometryForNode(
    node: TransformNode,
    baseline: OpaqueChainConveyorNodeBaseline,
    lengthAnchorZ: number,
    lengthDelta: number
  ): void {
    this.applyOpaqueChainConveyorLengthGeometry(node, baseline, lengthAnchorZ, lengthDelta);
    baseline.lengthMeshBaselines?.forEach((meshBaseline) => {
      const mesh = this.resolveOpaqueChainConveyorLengthMesh(node, meshBaseline.path);
      if (mesh) {
        this.applyOpaqueChainConveyorLengthGeometry(mesh, meshBaseline, lengthAnchorZ, lengthDelta);
      }
    });
  }

  /** 基于 -Z 固定起点拉伸链条机红框主体和长梁顶点，节点自身截面和非长度轴保持基线形状。 */
  private applyOpaqueChainConveyorLengthGeometry(
    node: TransformNode,
    baseline: OpaqueChainConveyorLengthGeometryBaseline,
    lengthAnchorZ: number,
    lengthDelta: number
  ): void {
    if (!(node instanceof Mesh) || !baseline.positionVertices || !Number.isFinite(lengthAnchorZ) || !Number.isFinite(lengthDelta)) {
      return;
    }

    const bounds = this.getPositionVertexAxisBounds(baseline.positionVertices, "z");
    if (!bounds || baseline.size.z <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const anchorVertexZ = this.mapOpaqueChainConveyorRootZToLengthVertexZ(lengthAnchorZ, baseline, bounds);
    const stretchableRootLength = this.getOpaqueChainConveyorRootStretchLength(lengthAnchorZ, baseline);
    if (stretchableRootLength <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const stretchRatio = Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, stretchableRootLength + lengthDelta) / stretchableRootLength;
    const nextPositions = baseline.positionVertices.slice();
    for (let index = 2; index < nextPositions.length; index += 3) {
      const sourceZ = baseline.positionVertices[index];
      if (sourceZ > anchorVertexZ + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
        nextPositions[index] = anchorVertexZ + (sourceZ - anchorVertexZ) * stretchRatio;
      }
    }
    node.setVerticesData(VertexBuffer.PositionKind, nextPositions, true);
    node.refreshBoundingInfo(false, false);
  }

  /** 对链条机主体及其真实子 Mesh 应用宽度延展，和长度延展可叠加。 */
  private applyOpaqueChainConveyorWidthGeometryForNode(
    node: TransformNode,
    baseline: OpaqueChainConveyorNodeBaseline,
    widthCenterX: number,
    widthDelta: number
  ): void {
    this.applyOpaqueChainConveyorWidthGeometry(node, baseline, widthCenterX, widthDelta);
    baseline.lengthMeshBaselines?.forEach((meshBaseline) => {
      const mesh = this.resolveOpaqueChainConveyorLengthMesh(node, meshBaseline.path);
      if (mesh) {
        this.applyOpaqueChainConveyorWidthGeometry(mesh, meshBaseline, widthCenterX, widthDelta);
      }
    });
  }

  /** 保留链条机主体截面厚度，只把宽度中心两侧顶点分别外移或内移。 */
  private applyOpaqueChainConveyorWidthGeometry(
    node: TransformNode,
    baseline: OpaqueChainConveyorLengthGeometryBaseline,
    widthCenterX: number,
    widthDelta: number
  ): void {
    if (!(node instanceof Mesh) || !baseline.positionVertices || !Number.isFinite(widthCenterX) || !Number.isFinite(widthDelta)) {
      return;
    }

    const bounds = this.getPositionVertexAxisBounds(baseline.positionVertices, "x");
    if (!bounds || baseline.size.x <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const currentPositions = node.getVerticesData(VertexBuffer.PositionKind, true, true);
    if (!currentPositions || currentPositions.length !== baseline.positionVertices.length) {
      return;
    }

    const anchorVertexX = this.mapOpaqueChainConveyorRootXToWidthVertexX(widthCenterX, baseline, bounds);
    const vertexUnitsPerRootUnit = (bounds.maximum - bounds.minimum) / baseline.size.x;
    const vertexHalfDelta = widthDelta * vertexUnitsPerRootUnit / 2;
    const nextPositions = Array.from(currentPositions, (position) => Number(position));
    for (let index = 0; index < nextPositions.length; index += 3) {
      const sourceX = baseline.positionVertices[index];
      if (sourceX > anchorVertexX + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
        nextPositions[index] += vertexHalfDelta;
      } else if (sourceX < anchorVertexX - MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
        nextPositions[index] -= vertexHalfDelta;
      }
    }
    node.setVerticesData(VertexBuffer.PositionKind, nextPositions, true);
    node.refreshBoundingInfo(false, false);
  }

  /** 将根节点本地 X 宽度中心映射到主体 Mesh 顶点 X，用于分左右侧平移。 */
  private mapOpaqueChainConveyorRootXToWidthVertexX(
    rootX: number,
    baseline: OpaqueChainConveyorLengthGeometryBaseline,
    bounds: { minimum: number; maximum: number; center: number }
  ): number {
    const nodeMinimumX = baseline.center.x - baseline.size.x / 2;
    const nodeMaximumX = baseline.center.x + baseline.size.x / 2;
    const clampedRootX = Math.min(nodeMaximumX, Math.max(nodeMinimumX, rootX));
    const rootRatio = this.createSafeRatio(clampedRootX - nodeMinimumX, baseline.size.x);
    return bounds.minimum + (bounds.maximum - bounds.minimum) * rootRatio;
  }

  /** 将链条机 Mesh 顶点局部轴坐标反推到根节点本地轴坐标，用于识别中间驱动区。 */
  private mapOpaqueChainConveyorLengthVertexAxisToRootAxis(
    vertexValue: number,
    baseline: OpaqueChainConveyorLengthGeometryBaseline,
    bounds: { minimum: number; maximum: number; center: number },
    axis: "x" | "z"
  ): number {
    const nodeMinimum = baseline.center[axis] - baseline.size[axis] / 2;
    const rootRatio = this.createSafeRatio(vertexValue - bounds.minimum, bounds.maximum - bounds.minimum);
    return nodeMinimum + baseline.size[axis] * rootRatio;
  }

  /** 计算根节点本地坐标下从固定锚点到该节点 +Z 尾端的可伸缩长度。 */
  private getOpaqueChainConveyorRootStretchLength(
    rootZ: number,
    baseline: OpaqueChainConveyorLengthGeometryBaseline
  ): number {
    if (baseline.size.z <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return 0;
    }

    const nodeMinimumZ = baseline.center.z - baseline.size.z / 2;
    const nodeMaximumZ = baseline.center.z + baseline.size.z / 2;
    const clampedRootZ = Math.min(nodeMaximumZ, Math.max(nodeMinimumZ, rootZ));
    return nodeMaximumZ - clampedRootZ;
  }

  /** 将根节点本地 Z 锚点映射到红框主体和长梁 position 顶点 Z，用于只拉伸起点之后的顶点。 */
  private mapOpaqueChainConveyorRootZToLengthVertexZ(
    rootZ: number,
    baseline: OpaqueChainConveyorLengthGeometryBaseline,
    bounds: { minimum: number; maximum: number; center: number }
  ): number {
    const nodeMinimumZ = baseline.center.z - baseline.size.z / 2;
    const nodeMaximumZ = baseline.center.z + baseline.size.z / 2;
    const clampedRootZ = Math.min(nodeMaximumZ, Math.max(nodeMinimumZ, rootZ));
    const rootRatio = this.createSafeRatio(clampedRootZ - nodeMinimumZ, baseline.size.z);
    return bounds.minimum + (bounds.maximum - bounds.minimum) * rootRatio;
  }

  /** 当前辊道机 GLB 使用不透明 A 系列和 GT 系列命名，参数变化时按部件级规则更新，避免整体根缩放把模型拉伸变形。 */
  private applyOpaqueRollerConveyorParameterFallback(
    root: TransformNode,
    values: Record<string, DynamicParameterValue>,
    changedParameterKey?: string
  ): boolean {
    if (!this.isOpaqueRollerConveyorPackage(root)) {
      return false;
    }

    const baseline = this.ensureOpaqueRollerConveyorBaseline(root);
    if (!baseline) {
      return false;
    }

    let changed = this.resetModelPackageRootParametricScaling(root);
    this.restoreOpaqueRollerConveyorBaseline(root, baseline);
    this.disposeGeneratedRollerCountNodes(root, true);

    const requestedLength = this.readPositiveDynamicNumberParameter(values.length, baseline.size.x);
    const lengthAnchorX = this.getOpaqueRollerConveyorLengthAnchorX(baseline);
    const targetLength = this.createOpaqueRollerConveyorEffectiveLength(baseline, requestedLength, lengthAnchorX);
    const targetWidth = this.readPositiveDynamicNumberParameter(values.width, baseline.size.z);
    const targetHeight = this.readPositiveDynamicNumberParameter(values.height, baseline.size.y);
    if (changedParameterKey === "rollerDensity") {
      this.setOpaqueRollerConveyorManualRollerCount(root, true);
    }
    this.ensureOpaqueRollerConveyorInitialRollerCountValue(root, values);
    const rollerDensity = this.resolveOpaqueRollerConveyorRollerCount(root, values);
    const widthRatio = this.createSafeRatio(targetWidth, baseline.size.z);
    const targetRollerWidthRange = this.createOpaqueRollerConveyorTargetRollerWidthRange(baseline, widthRatio);
    const automaticRollerWidth = targetRollerWidthRange
      ? targetRollerWidthRange.end - targetRollerWidthRange.start
      : baseline.rollerBaseWidth * widthRatio;
    const targetRollerCenterZ = targetRollerWidthRange
      ? (targetRollerWidthRange.start + targetRollerWidthRange.end) / 2
      : this.createOpaqueRollerConveyorBaseRollerCenterZ(baseline);
    const targetRollerWidth = this.resolveOpaqueRollerConveyorRollerWidth(root, baseline, automaticRollerWidth, values, changedParameterKey);
    const heightRatio = this.createSafeRatio(targetHeight, baseline.size.y);
    const lengthDelta = targetLength - baseline.size.x;
    const heightDelta = targetHeight - baseline.size.y;
    const rollerWidthRatio = this.createSafeRatio(targetRollerWidth, baseline.rollerBaseWidth);

    this.applyOpaqueRollerConveyorFrameTransforms(root, baseline, lengthAnchorX, lengthDelta, widthRatio, heightRatio, heightDelta);
    const rollerLayoutLength = changedParameterKey === "rollerDensity" || changedParameterKey === undefined ? targetLength : baseline.size.x;
    this.applyOpaqueRollerConveyorRollers(
      root,
      baseline,
      rollerDensity,
      rollerWidthRatio,
      heightDelta,
      lengthAnchorX,
      rollerLayoutLength,
      targetRollerCenterZ
    );
    const showFrontSupport = this.readDynamicBooleanParameter(values.showFrontSupport);
    const showRearSupport = this.readDynamicBooleanParameter(values.showRearSupport);
    if (showFrontSupport !== undefined) {
      changed = this.setNamedSupportNodesEnabled(root, OPAQUE_ROLLER_CONVEYOR_FRONT_SUPPORT_NODE_NAMES, showFrontSupport) || changed;
    }
    if (showRearSupport !== undefined) {
      changed = this.setNamedSupportNodesEnabled(root, OPAQUE_ROLLER_CONVEYOR_REAR_SUPPORT_NODE_NAMES, showRearSupport) || changed;
    }

    this.refreshNodeWorldMatrices(root);
    this.applyHighlight();
    this.callbacks.onStatsChange(this.collectStats());
    return true;
  }

  /** 解析 opaque 辊道机最终辊筒数；长度变化不再自动增减或重排辊筒。 */
  private resolveOpaqueRollerConveyorRollerCount(root: TransformNode, values: Record<string, DynamicParameterValue>): number {
    const requestedCount = this.readDynamicNumberParameter(values.rollerDensity);
    if (!this.hasOpaqueRollerConveyorManualRollerCount(root)) {
      return 1;
    }
    return requestedCount === undefined ? 1 : this.clampRollerConveyorCount(requestedCount);
  }

  /** 未手动接管辊筒数量时，把面板值也同步为 1，避免模型包默认数量和视图显示不一致。 */
  private ensureOpaqueRollerConveyorInitialRollerCountValue(
    root: TransformNode,
    values: Record<string, DynamicParameterValue>
  ): void {
    if (this.hasOpaqueRollerConveyorManualRollerCount(root) || this.readDynamicNumberParameter(values.rollerDensity) === 1) {
      return;
    }

    values.rollerDensity = 1;
    const asset = this.getModelPackageAssetForRoot(root);
    this.persistModelPackageValues(root, values);
    if (asset?.modelPackage) {
      this.syncModelPackageScriptMetadata(root, asset.modelPackage, values);
    }
  }

  /** 解析 opaque 辊道机辊筒宽度：整机宽度变化时默认随动，用户显式改辊筒宽度后保持手动值。 */
  private resolveOpaqueRollerConveyorRollerWidth(
    root: TransformNode,
    baseline: OpaqueRollerConveyorBaseline,
    automaticRollerWidth: number,
    values: Record<string, DynamicParameterValue>,
    changedParameterKey?: string
  ): number {
    const automaticWidth = Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, automaticRollerWidth);
    const requestedWidth = this.readPositiveDynamicNumberParameter(values.rollerWidth, baseline.rollerBaseWidth);
    const previousAutomaticWidth = this.getOpaqueRollerConveyorPreviousAutoRollerWidth(root);
    if (changedParameterKey === "rollerWidth") {
      this.setOpaqueRollerConveyorManualRollerWidth(root, true);
      return requestedWidth;
    }

    const hasManualRollerWidth = this.hasOpaqueRollerConveyorManualRollerWidth(root);
    const shouldUseAutomaticWidth =
      !hasManualRollerWidth &&
      (changedParameterKey === "width" ||
        values.rollerWidth === undefined ||
        this.areNumbersClose(requestedWidth, baseline.rollerBaseWidth) ||
        (previousAutomaticWidth !== undefined && this.areNumbersClose(requestedWidth, previousAutomaticWidth)));

    if (!shouldUseAutomaticWidth) {
      return requestedWidth;
    }

    if (!this.areNumbersClose(requestedWidth, automaticWidth)) {
      values.rollerWidth = automaticWidth;
      const asset = this.getModelPackageAssetForRoot(root);
      this.persistModelPackageValues(root, values);
      if (asset?.modelPackage) {
        this.syncModelPackageScriptMetadata(root, asset.modelPackage, values);
      }
    }
    this.setOpaqueRollerConveyorPreviousAutoRollerWidth(root, automaticWidth);
    this.setOpaqueRollerConveyorManualRollerWidth(root, false);
    return automaticWidth;
  }

  /** 计算当前宽度下两侧 A10/A11 长梁的内侧区间，辊筒宽度按该区间贴合侧梁。 */
  private createOpaqueRollerConveyorTargetRollerWidthRange(
    baseline: OpaqueRollerConveyorBaseline,
    widthRatio: number
  ): OpaqueRollerConveyorAxisRange | null {
    const beamRanges = OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES
      .map((nodeName) => {
        const nodeBaseline = baseline.nodes.get(nodeName);
        return nodeBaseline
          ? this.createOpaqueRollerConveyorTargetWidthNodeRange(nodeName, nodeBaseline, baseline, widthRatio)
          : null;
      })
      .filter((range): range is OpaqueRollerConveyorAxisRange => Boolean(range))
      .sort((left, right) => (left.start + left.end) / 2 - (right.start + right.end) / 2);
    if (beamRanges.length < 2) {
      return null;
    }

    const minimumSideBeam = beamRanges[0];
    const maximumSideBeam = beamRanges[beamRanges.length - 1];
    const start = minimumSideBeam.end;
    const end = maximumSideBeam.start;
    return end - start > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ? { start, end } : null;
  }

  /** 按 width 参数推导单个节点的目标 Z 向范围，复用框架宽度中心计算避免两套规则漂移。 */
  private createOpaqueRollerConveyorTargetWidthNodeRange(
    nodeName: string,
    nodeBaseline: OpaqueRollerConveyorNodeBaseline,
    baseline: OpaqueRollerConveyorBaseline,
    widthRatio: number
  ): OpaqueRollerConveyorAxisRange {
    const targetCenter = this.createOpaqueRollerConveyorWidthCenter(nodeName, nodeBaseline, baseline, widthRatio);
    const targetSize = OPAQUE_ROLLER_CONVEYOR_WIDTH_SCALE_NODE_NAMES.includes(nodeName)
      ? nodeBaseline.size.z * widthRatio
      : nodeBaseline.size.z;
    return {
      start: targetCenter - targetSize / 2,
      end: targetCenter + targetSize / 2
    };
  }

  /** 读取基线辊筒 Z 中心，长梁区间不可用时保持旧行为。 */
  private createOpaqueRollerConveyorBaseRollerCenterZ(baseline: OpaqueRollerConveyorBaseline): number {
    const rollerCenters = OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES
      .map((name) => baseline.nodes.get(name)?.center.z)
      .filter((center): center is number => typeof center === "number" && Number.isFinite(center));
    return rollerCenters.length > 0
      ? rollerCenters.reduce((sum, center) => sum + center, 0) / rollerCenters.length
      : (baseline.minimum.z + baseline.maximum.z) / 2;
  }

  /** 收敛辊筒数量，防止异常参数生成过多运行态节点。 */
  private clampRollerConveyorCount(value: number): number {
    return Math.max(1, Math.min(100, Math.round(value)));
  }

  /** 读取上一次由整机宽度自动计算出的辊筒宽度，用于区分默认随动值和用户手动输入。 */
  private getOpaqueRollerConveyorPreviousAutoRollerWidth(root: TransformNode): number | undefined {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    const width = Number(runtimeMetadata.opaqueRollerConveyorAutoRollerWidth);
    return Number.isFinite(width) && width > 0 ? width : undefined;
  }

  /** 记录本次整机宽度自动计算出的辊筒宽度，保存重开后仍可继续随宽度变化。 */
  private setOpaqueRollerConveyorPreviousAutoRollerWidth(root: TransformNode, width: number): void {
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime),
        opaqueRollerConveyorAutoRollerWidth: Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, width)
      }
    });
  }

  /** 判断辊筒宽度是否已由用户手动接管，避免后续整机宽度变化覆盖手动参数。 */
  private hasOpaqueRollerConveyorManualRollerWidth(root: TransformNode): boolean {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    return runtimeMetadata.opaqueRollerConveyorManualRollerWidth === true;
  }

  /** 记录辊筒宽度当前是自动随动还是用户手动接管。 */
  private setOpaqueRollerConveyorManualRollerWidth(root: TransformNode, manual: boolean): void {
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime),
        opaqueRollerConveyorManualRollerWidth: manual
      }
    });
  }

  /** 判断用户是否已经手动设置过辊筒数量；未设置时初始化只显示第一根。 */
  private hasOpaqueRollerConveyorManualRollerCount(root: TransformNode): boolean {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    return runtimeMetadata.opaqueRollerConveyorManualRollerCount === true;
  }

  /** 记录辊筒数量已经由用户接管，避免模型包默认值让初始化显示全部辊筒。 */
  private setOpaqueRollerConveyorManualRollerCount(root: TransformNode, manual: boolean): void {
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime),
        opaqueRollerConveyorManualRollerCount: manual
      }
    });
  }

  /** 按参数更新框架节点；length 让 A10/A11 从蓝框锚点向右延伸，尾部支撑脚和短横件跟随末端。 */
  private applyOpaqueRollerConveyorFrameTransforms(
    root: TransformNode,
    baseline: OpaqueRollerConveyorBaseline,
    lengthAnchorX: number,
    lengthDelta: number,
    widthRatio: number,
    heightRatio: number,
    heightDelta: number
  ): void {
    const nodesByName = this.getOpaqueRollerConveyorNodesByName(root);
    OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.forEach((nodeName) => {
      const nodeBaseline = baseline.nodes.get(nodeName);
      const node = nodesByName.get(nodeName);
      if (nodeBaseline && node) {
        this.applyOpaqueRollerConveyorLengthGeometry(node, nodeBaseline, lengthAnchorX, lengthDelta);
      }
    });
    this.refreshNodeWorldMatrices(root);
    const lengthTailReference = this.createOpaqueRollerConveyorLengthTailReference(root, baseline, nodesByName);

    baseline.nodes.forEach((nodeBaseline, nodeName) => {
      if (OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES.includes(nodeName)) {
        return;
      }

      const node = nodesByName.get(nodeName);
      if (!node) {
        return;
      }

      const isLengthGeometryNode = OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.includes(nodeName);
      const isLengthTailFollowNode = OPAQUE_ROLLER_CONVEYOR_LENGTH_TAIL_FOLLOW_NODE_NAMES.includes(nodeName);
      if (OPAQUE_ROLLER_CONVEYOR_WIDTH_SCALE_NODE_NAMES.includes(nodeName)) {
        node.scaling.z = nodeBaseline.scaling.z * widthRatio;
      }
      if (OPAQUE_ROLLER_CONVEYOR_HEIGHT_SCALE_NODE_NAMES.includes(nodeName)) {
        node.scaling.y = nodeBaseline.scaling.y * this.createOpaqueRollerConveyorLegHeightRatio(nodeBaseline, heightDelta, heightRatio);
      }

      const nextCenter = nodeBaseline.center.clone();
      nextCenter.x =
        isLengthTailFollowNode && lengthTailReference
          ? lengthTailReference.currentTailX + (nodeBaseline.center.x - lengthTailReference.baselineTailX)
          : isLengthTailFollowNode
            ? nodeBaseline.center.x + lengthDelta
            : nodeBaseline.center.x;
      nextCenter.z = this.createOpaqueRollerConveyorWidthCenter(nodeName, nodeBaseline, baseline, widthRatio);
      if (!OPAQUE_ROLLER_CONVEYOR_BOTTOM_FIXED_NODE_NAMES.includes(nodeName)) {
        nextCenter.y = OPAQUE_ROLLER_CONVEYOR_HEIGHT_SCALE_NODE_NAMES.includes(nodeName)
          ? this.moveCenterWithFixedMinimum(nodeBaseline.center.y, nodeBaseline.size.y, heightDelta)
          : nodeBaseline.center.y + heightDelta;
      }

      if (!isLengthGeometryNode) {
        this.moveNodeCenterOnRootAxis(root, node, "x", nextCenter.x);
      }
      this.moveNodeCenterOnRootAxis(root, node, "y", nextCenter.y);
      this.moveNodeCenterOnRootAxis(root, node, "z", nextCenter.z);
    });
  }

  /** 基于左端支架锚点拉伸长梁右侧顶点，绕开当前 GLB 远原点 pivot 导致的 transform 缩放漂移。 */
  private applyOpaqueRollerConveyorLengthGeometry(
    node: TransformNode,
    baseline: OpaqueRollerConveyorNodeBaseline,
    lengthAnchorX: number,
    lengthDelta: number
  ): void {
    if (!(node instanceof Mesh) || !baseline.positionVertices || !Number.isFinite(lengthAnchorX) || !Number.isFinite(lengthDelta)) {
      return;
    }

    const bounds = this.getPositionVertexAxisBounds(baseline.positionVertices, "x");
    if (!bounds || baseline.size.x <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const anchorVertexX = this.mapOpaqueRollerConveyorRootXToLengthVertexX(lengthAnchorX, baseline, bounds);
    const stretchableLength = bounds.maximum - anchorVertexX;
    if (stretchableLength <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return;
    }

    const stretchRatio = Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, stretchableLength + lengthDelta) / stretchableLength;
    const nextPositions = baseline.positionVertices.slice();
    for (let index = 0; index < nextPositions.length; index += 3) {
      const sourceX = baseline.positionVertices[index];
      if (sourceX > anchorVertexX + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
        nextPositions[index] = anchorVertexX + (sourceX - anchorVertexX) * stretchRatio;
      }
    }
    node.setVerticesData(VertexBuffer.PositionKind, nextPositions, true);
    node.refreshBoundingInfo(false, false);
  }

  /** 读取长梁当前真实尾端，尾部支撑脚按该尾端保持原始偏移，避免场景轴向变化时跟随方向反转。 */
  private createOpaqueRollerConveyorLengthTailReference(
    root: TransformNode,
    baseline: OpaqueRollerConveyorBaseline,
    nodesByName: Map<string, TransformNode>
  ): OpaqueRollerConveyorLengthTailReference | null {
    const baselineBeamRange = this.createOpaqueRollerConveyorBaselineLengthBeamRange(baseline);
    const currentBeamRange = this.createOpaqueRollerConveyorCurrentLengthBeamRange(root, nodesByName);
    if (!baselineBeamRange || !currentBeamRange) {
      return null;
    }

    const tailCenters = OPAQUE_ROLLER_CONVEYOR_LENGTH_TAIL_FOLLOW_NODE_NAMES
      .map((nodeName) => baseline.nodes.get(nodeName)?.center.x)
      .filter((center): center is number => typeof center === "number" && Number.isFinite(center));
    const tailCenter = tailCenters.length > 0
      ? tailCenters.reduce((sum, center) => sum + center, 0) / tailCenters.length
      : baselineBeamRange.end;
    const followsRangeEnd =
      Math.abs(tailCenter - baselineBeamRange.end) <= Math.abs(tailCenter - baselineBeamRange.start);
    return {
      baselineTailX: followsRangeEnd ? baselineBeamRange.end : baselineBeamRange.start,
      currentTailX: followsRangeEnd ? currentBeamRange.end : currentBeamRange.start
    };
  }

  /** 计算 A10/A11 在基线中的完整 X 覆盖范围。 */
  private createOpaqueRollerConveyorBaselineLengthBeamRange(
    baseline: OpaqueRollerConveyorBaseline
  ): OpaqueRollerConveyorAxisRange | null {
    const ranges = OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES
      .map((nodeName) => baseline.nodes.get(nodeName))
      .filter((node): node is OpaqueRollerConveyorNodeBaseline => Boolean(node))
      .map((node) => ({
        start: node.center.x - node.size.x / 2,
        end: node.center.x + node.size.x / 2
      }))
      .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
    if (ranges.length === 0) {
      return null;
    }
    return {
      start: Math.min(...ranges.map((range) => range.start)),
      end: Math.max(...ranges.map((range) => range.end))
    };
  }

  /** 计算 A10/A11 经过顶点拉伸后的真实根节点本地 X 并集范围，用于读取长梁尾端。 */
  private createOpaqueRollerConveyorCurrentLengthBeamRange(
    root: TransformNode,
    nodesByName: Map<string, TransformNode>
  ): OpaqueRollerConveyorAxisRange | null {
    const ranges = this.createOpaqueRollerConveyorCurrentLengthBeamNodeRanges(root, nodesByName);
    if (ranges.length === 0) {
      return null;
    }
    return {
      start: Math.min(...ranges.map((range) => range.start)),
      end: Math.max(...ranges.map((range) => range.end))
    };
  }

  /** 计算 A10/A11 当前共同覆盖区，辊筒只能从该红框入口开始并在双长梁轨道内追加。 */
  private createOpaqueRollerConveyorCurrentLengthBeamSharedRange(
    root: TransformNode,
    nodesByName: Map<string, TransformNode>
  ): OpaqueRollerConveyorAxisRange | null {
    const ranges = this.createOpaqueRollerConveyorCurrentLengthBeamNodeRanges(root, nodesByName);
    if (ranges.length === 0) {
      return null;
    }

    const start = Math.max(...ranges.map((range) => range.start));
    const end = Math.min(...ranges.map((range) => range.end));
    return end - start > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ? { start, end } : null;
  }

  /** 读取每根 A10/A11 长梁当前 X 范围，供尾端跟随和辊筒轨道分别组合。 */
  private createOpaqueRollerConveyorCurrentLengthBeamNodeRanges(
    root: TransformNode,
    nodesByName: Map<string, TransformNode>
  ): OpaqueRollerConveyorAxisRange[] {
    return OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES
      .map((nodeName) => nodesByName.get(nodeName))
      .filter((node): node is TransformNode => Boolean(node))
      .map((node) => {
        const bounds = this.getOpaqueRollerConveyorBaselineWorldBounds(node, true);
        return bounds ? this.worldBoundsToRootLocalBounds(root, bounds) : null;
      })
      .filter((bounds): bounds is NodeWorldBounds => Boolean(bounds))
      .map((bounds) => ({
        start: bounds.minimum.x,
        end: bounds.maximum.x
      }))
      .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
  }

  /** 按辊筒数量参数重排辊筒；length 单独变化不主动补增数量，但会使用当前长梁轨道边界。 */
  private applyOpaqueRollerConveyorRollers(
    root: TransformNode,
    baseline: OpaqueRollerConveyorBaseline,
    rollerDensity: number,
    rollerWidthRatio: number,
    heightDelta: number,
    lengthAnchorX: number,
    targetLength: number,
    targetRollerCenterZ: number
  ): void {
    const nodesByName = this.getOpaqueRollerConveyorNodesByName(root);
    const rollers = OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES.map((name) => nodesByName.get(name))
      .filter((node): node is TransformNode => Boolean(node))
      .sort((left, right) => {
        const leftCenter = baseline.nodes.get(left.name)?.center.x ?? 0;
        const rightCenter = baseline.nodes.get(right.name)?.center.x ?? 0;
        return leftCenter - rightCenter;
      });
    if (rollers.length === 0) {
      return;
    }

    const lengthTailReference = this.createOpaqueRollerConveyorLengthTailReference(root, baseline, nodesByName);
    const currentSharedBeamRange = this.createOpaqueRollerConveyorCurrentLengthBeamSharedRange(root, nodesByName);
    const measuredTrackRange = currentSharedBeamRange
      ? this.createOpaqueRollerConveyorMeasuredRollerTrackRange(currentSharedBeamRange)
      : null;
    const targetCount = Math.max(1, Math.min(100, Math.round(rollerDensity)));
    const targetCenters = this.createOpaqueRollerConveyorRollerCenters(
      baseline,
      targetCount,
      lengthAnchorX,
      targetLength,
      lengthTailReference,
      measuredTrackRange
    );
    const visibleCount = targetCenters.length;
    const baseRollerCenterY =
      baseline.nodes.get(OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES[0])?.center.y ?? baseline.maximum.y;
    const targetRollerCenterY = baseRollerCenterY + heightDelta;
    rollers.forEach((roller, index) => {
      const rollerBaseline = baseline.nodes.get(roller.name);
      const visible = index < Math.min(visibleCount, rollers.length);
      roller.setEnabled(visible);
      if (!rollerBaseline || !visible) {
        return;
      }

      roller.scaling.z = rollerBaseline.scaling.z * rollerWidthRatio;
      this.moveNodeCenterOnRootAxis(root, roller, "x", targetCenters[index]);
      this.moveNodeCenterOnRootAxis(root, roller, "y", targetRollerCenterY);
      this.moveNodeCenterOnRootAxis(root, roller, "z", targetRollerCenterZ);
    });

    for (let index = rollers.length; index < visibleCount; index += 1) {
      const source = rollers[index % rollers.length];
      const sourceBaseline = baseline.nodes.get(source.name);
      const clone = source.clone(`${source.name || "roller"}_mesh_vertex_${index + 1}`, source.parent, false);
      if (!clone || !sourceBaseline) {
        continue;
      }

      clone.metadata = {
        ...this.asMetadataObject(clone.metadata),
        generatedByMeshVertexModifyRuntime: true,
        sourceNodeName: source.name,
        reason: "rollerDensity"
      };
      clone.doNotSerialize = true;
      clone.setEnabled(true);
      clone.scaling.copyFrom(sourceBaseline.scaling);
      clone.scaling.z = sourceBaseline.scaling.z * rollerWidthRatio;
      this.copyMeshVertexModifyPickability(source, clone);
      this.moveNodeCenterOnRootAxis(root, clone, "x", targetCenters[index]);
      this.moveNodeCenterOnRootAxis(root, clone, "y", targetRollerCenterY);
      this.moveNodeCenterOnRootAxis(root, clone, "z", targetRollerCenterZ);
    }
  }

  /** 确保当前辊道机拥有未参数化前的节点基线，后续每次参数变化都从基线重新应用。 */
  private ensureOpaqueRollerConveyorBaseline(root: TransformNode): OpaqueRollerConveyorBaseline | null {
    const hasDirtyBaselineNodes = this.hasDirtyOpaqueRollerConveyorBaselineNodeNames(root);
    const existing = this.readOpaqueRollerConveyorBaseline(root);
    if (existing) {
      this.ensureOpaqueRollerConveyorLengthGeometryBaseline(root, existing);
      if (hasDirtyBaselineNodes) {
        this.persistOpaqueRollerConveyorBaseline(root, existing);
      }
      return existing;
    }

    this.disposeGeneratedRollerCountNodes(root, true);
    const baseline = this.captureOpaqueRollerConveyorBaseline(root);
    if (!baseline) {
      return null;
    }

    this.persistOpaqueRollerConveyorBaseline(root, baseline);
    return baseline;
  }

  /** 兼容已打开旧场景：旧基线没有长梁顶点时，从当前 GLB mesh 读取原始顶点补进 metadata。 */
  private ensureOpaqueRollerConveyorLengthGeometryBaseline(root: TransformNode, baseline: OpaqueRollerConveyorBaseline): void {
    const nodesByName = this.getOpaqueRollerConveyorNodesByName(root);
    let changed = false;
    OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.forEach((nodeName) => {
      const nodeBaseline = baseline.nodes.get(nodeName);
      if (!nodeBaseline) {
        return;
      }

      const node = nodesByName.get(nodeName);
      if (this.isOpaqueRollerConveyorLengthVertexBaselineValid(nodeBaseline)) {
        return;
      }

      const positionVertices = node ? this.captureOpaqueRollerConveyorLengthVertices(node, nodeName, nodeBaseline.size.x) : undefined;
      if (!positionVertices) {
        return;
      }

      nodeBaseline.positionVertices = positionVertices;
      changed = true;
    });

    if (changed) {
      this.persistOpaqueRollerConveyorBaseline(root, baseline);
    }
  }

  /** 捕获当前 opaque 辊道机节点的原始局部状态和根节点本地包围盒。 */
  private captureOpaqueRollerConveyorBaseline(root: TransformNode): OpaqueRollerConveyorBaseline | null {
    this.refreshNodeWorldMatrices(root);
    const rootBounds = this.getOpaqueRollerConveyorBaselineWorldBounds(root, true);
    if (!rootBounds) {
      return null;
    }

    const rootLocalBounds = this.worldBoundsToRootLocalBounds(root, rootBounds);
    const rootMinimum = rootLocalBounds.minimum;
    const rootMaximum = rootLocalBounds.maximum;
    const size = rootLocalBounds.size;
    const nodes = new Map<string, OpaqueRollerConveyorNodeBaseline>();
    this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root && Boolean(node.name))
      .filter((node) => this.isOpaqueRollerConveyorOriginalNodeName(node.name))
      .filter((node) => !this.isGeneratedRuntimeNodeForBaseline(node))
      .forEach((node) => {
        const bounds = this.getOpaqueRollerConveyorBaselineWorldBounds(node, true);
        const localBounds = bounds ? this.worldBoundsToRootLocalBounds(root, bounds) : null;
        const center = localBounds?.center ?? Vector3.Zero();
        const nodeSize = localBounds?.size ?? Vector3.Zero();
        nodes.set(node.name, {
          position: node.position.clone(),
          scaling: node.scaling.clone(),
          rotation: node.rotation.clone(),
          rotationQuaternion: node.rotationQuaternion?.clone() ?? null,
          enabled: typeof node.isEnabled === "function" ? node.isEnabled() : undefined,
          center,
          size: nodeSize,
          positionVertices: this.captureOpaqueRollerConveyorLengthVertices(node, node.name, nodeSize.x)
        });
      });

    const rollerCenters = OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES
      .map((name) => nodes.get(name)?.center.x)
      .filter((center): center is number => typeof center === "number" && Number.isFinite(center));
    const rollerWidths = OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES
      .map((name) => nodes.get(name)?.size.z)
      .filter((width): width is number => typeof width === "number" && Number.isFinite(width) && width > 0);
    const rollerStart = rollerCenters.length > 0 ? Math.min(...rollerCenters) : rootMinimum.x;
    const rollerEnd = rollerCenters.length > 0 ? Math.max(...rollerCenters) : rootMaximum.x;

    return {
      nodes,
      minimum: rootMinimum,
      maximum: rootMaximum,
      size,
      rollerBaseWidth: rollerWidths[0] ?? size.z,
      rollerMarginStart: Math.max(0, rollerStart - rootMinimum.x),
      rollerMarginEnd: Math.max(0, rootMaximum.x - rollerEnd)
    };
  }

  /** 读取需要长度参数化的长梁原始顶点，后续按顶点中心拉长，不再依赖 TransformNode.scaling。 */
  private captureOpaqueRollerConveyorLengthVertices(
    node: TransformNode,
    nodeName: string,
    expectedLength: number
  ): number[] | undefined {
    if (!OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.includes(nodeName) || !(node instanceof Mesh)) {
      return undefined;
    }

    const positions = node.getVerticesData(VertexBuffer.PositionKind, true, true);
    if (!positions || positions.length < 3 || positions.length % 3 !== 0) {
      return undefined;
    }
    return this.normalizePositionVerticesToAxisLength(Array.from(positions, (position) => Number(position)), "x", expectedLength);
  }

  /** 把 opaque 辊道机基线写入 metadata，避免保存重开后参数重复叠加。 */
  private persistOpaqueRollerConveyorBaseline(root: TransformNode, baseline: OpaqueRollerConveyorBaseline): void {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...runtimeMetadata,
        opaqueRollerConveyorBaseline: {
          version: 1,
          minimum: snapshotVector(baseline.minimum),
          maximum: snapshotVector(baseline.maximum),
          size: snapshotVector(baseline.size),
          rollerBaseWidth: baseline.rollerBaseWidth,
          rollerMarginStart: baseline.rollerMarginStart,
          rollerMarginEnd: baseline.rollerMarginEnd,
          nodes: Object.fromEntries(
            [...baseline.nodes.entries()].map(([name, node]) => [
              name,
              {
                position: snapshotVector(node.position),
                scaling: snapshotVector(node.scaling),
                rotation: snapshotVector(node.rotation),
                rotationQuaternion: node.rotationQuaternion ? this.snapshotQuaternion(node.rotationQuaternion) : null,
                enabled: node.enabled,
                center: snapshotVector(node.center),
                size: snapshotVector(node.size),
                ...(node.positionVertices ? { positionVertices: node.positionVertices } : {})
              }
            ])
          )
        }
      }
    });
  }

  /** 从 metadata 读取 opaque 辊道机基线，损坏或旧格式缺字段时返回空并重新捕获。 */
  private readOpaqueRollerConveyorBaseline(root: TransformNode): OpaqueRollerConveyorBaseline | null {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    const baselineMetadata = this.asMetadataObject(runtimeMetadata.opaqueRollerConveyorBaseline);
    const nodeMetadata = this.asMetadataObject(baselineMetadata.nodes);
    if (Number(baselineMetadata.version) !== 1 || Object.keys(nodeMetadata).length === 0) {
      return null;
    }
    const hasDirtyBaselineNodes = Object.keys(nodeMetadata).some(
      (nodeName) => this.isGeneratedRuntimeNodeNameForBaseline(nodeName) || !this.isOpaqueRollerConveyorOriginalNodeName(nodeName)
    );

    const minimum = this.readMetadataVector3(baselineMetadata.minimum);
    const maximum = this.readMetadataVector3(baselineMetadata.maximum);
    const size = this.readMetadataVector3(baselineMetadata.size);
    if (!minimum || !maximum || !size) {
      return null;
    }

    const nodes = new Map<string, OpaqueRollerConveyorNodeBaseline>();
    Object.entries(nodeMetadata).forEach(([name, value]) => {
      if (this.isGeneratedRuntimeNodeNameForBaseline(name) || !this.isOpaqueRollerConveyorOriginalNodeName(name)) {
        return;
      }

      const node = this.asMetadataObject(value);
      const position = this.readMetadataVector3(node.position);
      const scaling = this.readMetadataVector3(node.scaling);
      const rotation = this.readMetadataVector3(node.rotation);
      const center = this.readMetadataVector3(node.center);
      const nodeSize = this.readMetadataVector3(node.size);
      if (!position || !scaling || !rotation || !center || !nodeSize) {
        return;
      }

      nodes.set(name, {
        position,
        scaling,
        rotation,
        rotationQuaternion: this.readMetadataQuaternion(node.rotationQuaternion),
        enabled: typeof node.enabled === "boolean" ? node.enabled : undefined,
        center,
        size: nodeSize,
        positionVertices: this.readMetadataNumberArray(node.positionVertices)
      });
    });

    if (nodes.size === 0) {
      return null;
    }

    const cleanBounds = this.createOpaqueRollerConveyorBaselineBounds(nodes);
    if (!cleanBounds) {
      return null;
    }

    const baselineMinimum = cleanBounds.minimum ?? minimum;
    const baselineMaximum = cleanBounds.maximum ?? maximum;
    const baselineSize = cleanBounds.size ?? size;
    const rollerCenters = OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES
      .map((name) => nodes.get(name)?.center.x)
      .filter((center): center is number => typeof center === "number" && Number.isFinite(center));
    const rollerStart = rollerCenters.length > 0 ? Math.min(...rollerCenters) : baselineMinimum.x;
    const rollerEnd = rollerCenters.length > 0 ? Math.max(...rollerCenters) : baselineMaximum.x;

    return {
      nodes,
      minimum: baselineMinimum,
      maximum: baselineMaximum,
      size: baselineSize,
      rollerBaseWidth: this.readPositiveMetadataNumber(baselineMetadata.rollerBaseWidth, baselineSize.z),
      rollerMarginStart: hasDirtyBaselineNodes
        ? Math.max(0, rollerStart - baselineMinimum.x)
        : this.readPositiveMetadataNumber(baselineMetadata.rollerMarginStart, 0),
      rollerMarginEnd: hasDirtyBaselineNodes
        ? Math.max(0, baselineMaximum.x - rollerEnd)
        : this.readPositiveMetadataNumber(baselineMetadata.rollerMarginEnd, 0)
    };
  }

  /** 从已读取的原始节点基线重算整体包围盒，用于修复历史脏基线中混入运行态辊筒克隆的情况。 */
  private createOpaqueRollerConveyorBaselineBounds(nodes: Map<string, OpaqueRollerConveyorNodeBaseline>): NodeWorldBounds | null {
    const bounds = [...nodes.values()]
      .map((node) => ({
        minimum: node.center.subtract(node.size.scale(0.5)),
        maximum: node.center.add(node.size.scale(0.5))
      }))
      .filter((item) =>
        [item.minimum.x, item.minimum.y, item.minimum.z, item.maximum.x, item.maximum.y, item.maximum.z].every((value) =>
          Number.isFinite(value)
        )
      );
    if (bounds.length === 0) {
      return null;
    }

    const minimum = bounds[0].minimum.clone();
    const maximum = bounds[0].maximum.clone();
    bounds.slice(1).forEach((item) => {
      minimum.minimizeInPlace(item.minimum);
      maximum.maximizeInPlace(item.maximum);
    });
    return this.createNodeWorldBounds(minimum, maximum);
  }

  /** 计算 opaque 辊道机基线包围盒，排除运行态克隆及其子网格，避免父节点间接吞入临时辊筒。 */
  private getOpaqueRollerConveyorBaselineWorldBounds(node: TransformNode, includeDisabled = false): NodeWorldBounds | null {
    const meshes = this.getEditableMeshes(node).filter(
      (mesh) =>
        mesh.getTotalVertices() > 0 &&
        (includeDisabled || mesh.isEnabled()) &&
        !this.hasGeneratedRuntimeAncestorForBaseline(mesh, node)
    );
    return this.createNodeWorldBoundsFromMeshes(meshes);
  }

  /** 判断 mesh 自身或到边界节点之间的祖先是否属于运行态生成节点。 */
  private hasGeneratedRuntimeAncestorForBaseline(node: Node, boundary: TransformNode): boolean {
    let current: Node | null = node;
    while (current) {
      if (current instanceof TransformNode && this.isGeneratedRuntimeNodeForBaseline(current)) {
        return true;
      }
      if (current === boundary) {
        return false;
      }
      current = current.parent;
    }
    return false;
  }

  /** 判断历史基线 metadata 是否混入运行态克隆名或聚合父节点，命中时需要过滤并重新写回干净基线。 */
  private hasDirtyOpaqueRollerConveyorBaselineNodeNames(root: TransformNode): boolean {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    const baselineMetadata = this.asMetadataObject(runtimeMetadata.opaqueRollerConveyorBaseline);
    const nodeMetadata = this.asMetadataObject(baselineMetadata.nodes);
    return Object.keys(nodeMetadata).some(
      (nodeName) => this.isGeneratedRuntimeNodeNameForBaseline(nodeName) || !this.isOpaqueRollerConveyorOriginalNodeName(nodeName)
    );
  }

  /** 将 opaque 辊道机所有已知节点恢复到基线状态，再应用新的参数。 */
  private restoreOpaqueRollerConveyorBaseline(root: TransformNode, baseline: OpaqueRollerConveyorBaseline): void {
    const nodesByName = this.getOpaqueRollerConveyorNodesByName(root);
    baseline.nodes.forEach((nodeBaseline, nodeName) => {
      const node = nodesByName.get(nodeName);
      if (!node) {
        return;
      }

      node.position.copyFrom(nodeBaseline.position);
      node.scaling.copyFrom(nodeBaseline.scaling);
      node.rotation.copyFrom(nodeBaseline.rotation);
      node.rotationQuaternion = nodeBaseline.rotationQuaternion?.clone() ?? null;
      this.restoreOpaqueRollerConveyorLengthVertices(node, nodeBaseline);
      if (nodeBaseline.enabled !== undefined && typeof node.setEnabled === "function") {
        node.setEnabled(nodeBaseline.enabled);
      }
    });
    this.refreshNodeWorldMatrices(root);
  }

  /** 每次重新应用参数前先恢复长梁原始顶点，避免连续输入长度时重复拉伸。 */
  private restoreOpaqueRollerConveyorLengthVertices(node: TransformNode, baseline: OpaqueRollerConveyorNodeBaseline): void {
    if (!(node instanceof Mesh) || !baseline.positionVertices) {
      return;
    }

    node.setVerticesData(VertexBuffer.PositionKind, baseline.positionVertices, true);
    node.refreshBoundingInfo(false, false);
  }

  /** 确保当前链条机拥有导入时节点基线，长度变化始终从该基线重新计算。 */
  private ensureOpaqueChainConveyorBaseline(root: TransformNode): OpaqueChainConveyorBaseline | null {
    this.makeOpaqueChainConveyorDeformableGeometryUnique(root);
    const existing = this.readOpaqueChainConveyorBaseline(root);
    if (existing) {
      this.ensureOpaqueChainConveyorLengthGeometryBaseline(root, existing);
      return existing;
    }

    this.disposeGeneratedChainConveyorNodes(root);
    const baseline = this.captureOpaqueChainConveyorBaseline(root);
    if (!baseline) {
      return null;
    }

    this.persistOpaqueChainConveyorBaseline(root, baseline);
    return baseline;
  }

  /** 兼容旧场景：基线缺少红框主体或长梁顶点时，从当前 GLB mesh 补齐原始顶点数据。 */
  private ensureOpaqueChainConveyorLengthGeometryBaseline(root: TransformNode, baseline: OpaqueChainConveyorBaseline): void {
    const nodesByName = this.getOpaqueChainConveyorNodesByName(root);
    let changed = false;
    OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.forEach((nodeName) => {
      const nodeBaseline = baseline.nodes.get(nodeName);
      if (!nodeBaseline || this.hasOpaqueChainConveyorLengthGeometryBaseline(nodeBaseline)) {
        return;
      }

      const node = nodesByName.get(nodeName);
      const positionVertices = node ? this.captureOpaqueChainConveyorLengthVertices(node, nodeName) : undefined;
      if (positionVertices) {
        nodeBaseline.positionVertices = positionVertices;
        changed = true;
        return;
      }

      const lengthMeshBaselines = node ? this.captureOpaqueChainConveyorLengthMeshBaselines(root, node, nodeName) : undefined;
      if (lengthMeshBaselines?.length) {
        nodeBaseline.lengthMeshBaselines = lengthMeshBaselines;
        changed = true;
      }
    });

    if (changed) {
      this.persistOpaqueChainConveyorBaseline(root, baseline);
    }
  }

  /** 判断链条机命名节点是否已经有可用于长度重算的顶点基线。 */
  private hasOpaqueChainConveyorLengthGeometryBaseline(baseline: OpaqueChainConveyorNodeBaseline): boolean {
    return Boolean(baseline.positionVertices || baseline.lengthMeshBaselines?.length);
  }

  /** 捕获链条机原始节点局部状态和根节点本地包围盒，排除运行态补梁。 */
  private captureOpaqueChainConveyorBaseline(root: TransformNode): OpaqueChainConveyorBaseline | null {
    this.refreshNodeWorldMatrices(root);
    const rootBounds = this.getOpaqueChainConveyorBaselineWorldBounds(root, true);
    if (!rootBounds) {
      return null;
    }

    const rootLocalBounds = this.worldBoundsToRootLocalBounds(root, rootBounds);
    const nodes = new Map<string, OpaqueChainConveyorNodeBaseline>();
    this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root && Boolean(node.name))
      .map((node) => ({
        node,
        nodeName: this.getOpaqueChainConveyorCanonicalNodeName(node.name)
      }))
      .filter(({ nodeName }) => this.isOpaqueChainConveyorOriginalNodeName(nodeName))
      .filter(({ node }) => !this.isGeneratedRuntimeNodeForBaseline(node))
      .forEach(({ node, nodeName }) => {
        const bounds = this.getOpaqueChainConveyorBaselineWorldBounds(node, true);
        const localBounds = bounds ? this.worldBoundsToRootLocalBounds(root, bounds) : null;
        const center = localBounds?.center ?? Vector3.Zero();
        const nodeSize = localBounds?.size ?? Vector3.Zero();
        const positionVertices = this.captureOpaqueChainConveyorLengthVertices(node, nodeName);
        const lengthMeshBaselines = positionVertices
          ? undefined
          : this.captureOpaqueChainConveyorLengthMeshBaselines(root, node, nodeName);
        nodes.set(nodeName, {
          position: node.position.clone(),
          scaling: node.scaling.clone(),
          rotation: node.rotation.clone(),
          rotationQuaternion: node.rotationQuaternion?.clone() ?? null,
          enabled: typeof node.isEnabled === "function" ? node.isEnabled() : undefined,
          center,
          size: nodeSize,
          positionVertices,
          lengthMeshBaselines
        });
      });

    return {
      nodes,
      minimum: rootLocalBounds.minimum,
      maximum: rootLocalBounds.maximum,
      size: rootLocalBounds.size
    };
  }

  /** 读取链条机红框主体和长梁原始顶点，后续按局部 Z 延展而不是缩放整节点。 */
  private captureOpaqueChainConveyorLengthVertices(
    node: TransformNode,
    nodeName: string
  ): number[] | undefined {
    if (!OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.includes(nodeName) || !(node instanceof Mesh)) {
      return undefined;
    }
    return this.captureOpaqueChainConveyorMeshLengthVertices(node);
  }

  /** 捕获链条机命名包装节点下真实 Mesh 的原始顶点，解决 Rail 节点导出为空 TransformNode 时不伸长的问题。 */
  private captureOpaqueChainConveyorLengthMeshBaselines(
    root: TransformNode,
    node: TransformNode,
    nodeName: string
  ): OpaqueChainConveyorLengthMeshBaseline[] | undefined {
    if (!OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.includes(nodeName)) {
      return undefined;
    }

    const baselines = this.getOpaqueChainConveyorLengthGeometryMeshes(node)
      .map((mesh): OpaqueChainConveyorLengthMeshBaseline | null => {
        const bounds = this.createNodeWorldBoundsFromMeshes([mesh]);
        const localBounds = bounds ? this.worldBoundsToRootLocalBounds(root, bounds) : null;
        const meshSize = localBounds?.size ?? Vector3.Zero();
        const positionVertices = this.captureOpaqueChainConveyorMeshLengthVertices(mesh);
        const path = this.createOpaqueChainConveyorLengthMeshPath(node, mesh);
        if (!positionVertices || !path) {
          return null;
        }

        return {
          path,
          center: localBounds?.center ?? Vector3.Zero(),
          size: meshSize,
          positionVertices
        };
      })
      .filter((baseline): baseline is OpaqueChainConveyorLengthMeshBaseline => Boolean(baseline));

    return baselines.length > 0 ? baselines : undefined;
  }

  /** 读取单个真实 Mesh 的原始 position 顶点，保留 GLB 局部单位以免叠加节点缩放后被压扁。 */
  private captureOpaqueChainConveyorMeshLengthVertices(mesh: Mesh): number[] | undefined {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind, true, true);
    if (!positions || positions.length < 3 || positions.length % 3 !== 0) {
      return undefined;
    }
    return Array.from(positions, (position) => Number(position));
  }

  /** 收集命名链条机节点下可直接改 position 顶点的 Mesh，不把运行态生成节点纳入基线。 */
  private getOpaqueChainConveyorLengthGeometryMeshes(node: TransformNode): Mesh[] {
    return node
      .getChildMeshes(false)
      .filter(
        (mesh): mesh is Mesh =>
          mesh instanceof Mesh &&
          mesh.getTotalVertices() > 0 &&
          !this.hasGeneratedRuntimeAncestorForBaseline(mesh, node)
      );
  }

  /** 记录真实 Mesh 相对命名节点的层级索引路径，避免依赖子 Mesh 名称唯一。 */
  private createOpaqueChainConveyorLengthMeshPath(owner: TransformNode, mesh: Mesh): string {
    if (mesh === owner) {
      return ".";
    }

    const segments: string[] = [];
    let current: Node | null = mesh;
    while (current && current !== owner) {
      const parent: Node | null = current.parent;
      if (!parent) {
        return "";
      }
      const siblings = this.getSceneChildren(parent, true);
      const index = siblings.indexOf(current);
      if (index < 0) {
        return "";
      }
      segments.unshift(String(index));
      current = parent;
    }
    return current === owner ? segments.join("/") : "";
  }

  /** 按保存的层级索引路径找回真实 Mesh，用于保存重开、复制和阵列后的长度重算。 */
  private resolveOpaqueChainConveyorLengthMesh(owner: TransformNode, path: string): Mesh | null {
    if (path === ".") {
      return owner instanceof Mesh ? owner : null;
    }
    if (!path) {
      return null;
    }

    let current: Node = owner;
    for (const segment of path.split("/")) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) {
        return null;
      }
      const child = this.getSceneChildren(current, true)[index];
      if (!child) {
        return null;
      }
      current = child;
    }
    return current instanceof Mesh ? current : null;
  }

  /** 把链条机基线写入 metadata，避免保存重开后把已延展姿态当作新基线。 */
  private persistOpaqueChainConveyorBaseline(root: TransformNode, baseline: OpaqueChainConveyorBaseline): void {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...runtimeMetadata,
        opaqueChainConveyorBaseline: this.createOpaqueChainConveyorBaselineMetadata(baseline)
      }
    });
  }

  /** 序列化链条机基线，复制模板和真实实例都复用同一格式，避免副本参数化失去基线。 */
  private createOpaqueChainConveyorBaselineMetadata(baseline: OpaqueChainConveyorBaseline): Record<string, unknown> {
    return {
      version: OPAQUE_CHAIN_CONVEYOR_BASELINE_VERSION,
      minimum: snapshotVector(baseline.minimum),
      maximum: snapshotVector(baseline.maximum),
      size: snapshotVector(baseline.size),
      nodes: Object.fromEntries(
        [...baseline.nodes.entries()].map(([name, node]) => [
          name,
          {
            position: snapshotVector(node.position),
            scaling: snapshotVector(node.scaling),
            rotation: snapshotVector(node.rotation),
            rotationQuaternion: node.rotationQuaternion ? this.snapshotQuaternion(node.rotationQuaternion) : null,
            enabled: node.enabled,
            center: snapshotVector(node.center),
            size: snapshotVector(node.size),
            ...(node.positionVertices ? { positionVertices: node.positionVertices } : {}),
            ...(node.lengthMeshBaselines?.length
              ? {
                  lengthMeshBaselines: node.lengthMeshBaselines.map((meshBaseline) => ({
                    path: meshBaseline.path,
                    center: snapshotVector(meshBaseline.center),
                    size: snapshotVector(meshBaseline.size),
                    positionVertices: meshBaseline.positionVertices
                  }))
                }
              : {})
          }
        ])
      )
    };
  }

  /** 读取定位框几何尺寸，旧场景缺失字段时回退到默认 1.5m 立方框。 */
  private getLocatorDimensions(node: TransformNode): LocatorDimensionsSnapshot {
    const editorMetadata = this.getNodeEditorMetadata(node);
    return this.normalizeLocatorDimensions(this.asMetadataObject(editorMetadata.locatorDimensions));
  }

  /** 将定位框尺寸收敛为正数，避免 0 或非法 metadata 生成不可见线框。 */
  private normalizeLocatorDimensions(value: Record<string, unknown>): LocatorDimensionsSnapshot {
    return {
      version: 1,
      length: this.normalizeLocatorDimension(value.length, DEFAULT_LOCATOR_DIMENSIONS.length),
      width: this.normalizeLocatorDimension(value.width, DEFAULT_LOCATOR_DIMENSIONS.width),
      height: this.normalizeLocatorDimension(value.height, DEFAULT_LOCATOR_DIMENSIONS.height)
    };
  }

  /** 读取单个定位框尺寸字段，小于最小值时钳制到可见下限。 */
  private normalizeLocatorDimension(value: unknown, fallback: number): number {
    return Math.max(MIN_LOCATOR_DIMENSION_METERS, this.getNumberMetadata(value, fallback));
  }

  /** 从 metadata 读取链条机基线，格式损坏或节点集合不完整时返回空并重新捕获。 */
  private readOpaqueChainConveyorBaseline(root: TransformNode): OpaqueChainConveyorBaseline | null {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    const baselineMetadata = this.asMetadataObject(runtimeMetadata.opaqueChainConveyorBaseline);
    const nodeMetadata = this.asMetadataObject(baselineMetadata.nodes);
    if (Number(baselineMetadata.version) !== OPAQUE_CHAIN_CONVEYOR_BASELINE_VERSION || Object.keys(nodeMetadata).length === 0) {
      return null;
    }

    const minimum = this.readMetadataVector3(baselineMetadata.minimum);
    const maximum = this.readMetadataVector3(baselineMetadata.maximum);
    const size = this.readMetadataVector3(baselineMetadata.size);
    if (!minimum || !maximum || !size) {
      return null;
    }

    const nodes = new Map<string, OpaqueChainConveyorNodeBaseline>();
    Object.entries(nodeMetadata).forEach(([name, value]) => {
      if (!this.isOpaqueChainConveyorOriginalNodeName(name)) {
        return;
      }

      const node = this.asMetadataObject(value);
      const position = this.readMetadataVector3(node.position);
      const scaling = this.readMetadataVector3(node.scaling);
      const rotation = this.readMetadataVector3(node.rotation);
      const center = this.readMetadataVector3(node.center);
      const nodeSize = this.readMetadataVector3(node.size);
      if (!position || !scaling || !rotation || !center || !nodeSize) {
        return;
      }

      const positionVertices = this.readMetadataNumberArray(node.positionVertices);
      const lengthMeshBaselines = Array.isArray(node.lengthMeshBaselines)
        ? node.lengthMeshBaselines
            .map((item): OpaqueChainConveyorLengthMeshBaseline | null => {
              const meshBaseline = this.asMetadataObject(item);
              const path = typeof meshBaseline.path === "string" ? meshBaseline.path : "";
              const meshCenter = this.readMetadataVector3(meshBaseline.center);
              const meshSize = this.readMetadataVector3(meshBaseline.size);
              const meshPositionVertices = this.readMetadataNumberArray(meshBaseline.positionVertices);
              if (!path || !meshCenter || !meshSize || !meshPositionVertices) {
                return null;
              }
              return {
                path,
                center: meshCenter,
                size: meshSize,
                positionVertices: meshPositionVertices
              };
            })
            .filter((item): item is OpaqueChainConveyorLengthMeshBaseline => Boolean(item))
        : undefined;
      nodes.set(name, {
        position,
        scaling,
        rotation,
        rotationQuaternion: this.readMetadataQuaternion(node.rotationQuaternion),
        enabled: typeof node.enabled === "boolean" ? node.enabled : undefined,
        center,
        size: nodeSize,
        positionVertices,
        lengthMeshBaselines: lengthMeshBaselines?.length ? lengthMeshBaselines : undefined
      });
    });

    const availableNodeNames = new Set(this.getNodeHierarchy(root).map((node) => this.getOpaqueChainConveyorCanonicalNodeName(node.name)));
    const requiredNodeNames = OPAQUE_CHAIN_CONVEYOR_BASELINE_REQUIRED_NODE_NAMES.filter((name) => availableNodeNames.has(name));
    return requiredNodeNames.every((name) => nodes.has(name))
      ? { nodes, minimum, maximum, size }
      : null;
  }

  /** 将链条机所有已知原始节点恢复到基线状态，再按当前参数重新应用。 */
  private restoreOpaqueChainConveyorBaseline(root: TransformNode, baseline: OpaqueChainConveyorBaseline): void {
    const nodesByName = this.getOpaqueChainConveyorNodesByName(root);
    baseline.nodes.forEach((nodeBaseline, nodeName) => {
      const node = nodesByName.get(nodeName);
      if (!node) {
        return;
      }

      node.position.copyFrom(nodeBaseline.position);
      node.scaling.copyFrom(nodeBaseline.scaling);
      node.rotation.copyFrom(nodeBaseline.rotation);
      node.rotationQuaternion = nodeBaseline.rotationQuaternion?.clone() ?? null;
      this.restoreOpaqueChainConveyorLengthVertices(node, nodeBaseline);
      if (nodeBaseline.enabled !== undefined && typeof node.setEnabled === "function") {
        node.setEnabled(nodeBaseline.enabled);
      }
    });
    this.refreshNodeWorldMatrices(root);
  }

  /** 每次重新应用链条机长度前恢复红框主体和长梁原始顶点，避免连续输入时重复延展。 */
  private restoreOpaqueChainConveyorLengthVertices(node: TransformNode, baseline: OpaqueChainConveyorNodeBaseline): void {
    if (node instanceof Mesh && baseline.positionVertices) {
      node.setVerticesData(VertexBuffer.PositionKind, baseline.positionVertices, true);
      node.refreshBoundingInfo(false, false);
    }

    baseline.lengthMeshBaselines?.forEach((meshBaseline) => {
      const mesh = this.resolveOpaqueChainConveyorLengthMesh(node, meshBaseline.path);
      if (!mesh) {
        return;
      }
      mesh.setVerticesData(VertexBuffer.PositionKind, meshBaseline.positionVertices, true);
      mesh.refreshBoundingInfo(false, false);
    });
  }

  /** 清除不应跨模型包替换复用的 opaque 辊道机运行态基线和自动参数记录。 */
  private clearOpaqueRollerConveyorRuntimeMetadata(runtimeMetadata: Record<string, unknown>): void {
    delete runtimeMetadata.opaqueRollerConveyorBaseline;
    delete runtimeMetadata.opaqueRollerConveyorAutoRollerCount;
    delete runtimeMetadata.opaqueRollerConveyorAutoRollerWidth;
    delete runtimeMetadata.opaqueRollerConveyorManualRollerCount;
    delete runtimeMetadata.opaqueRollerConveyorManualRollerWidth;
  }

  /** 克隆新实例时只清除几何基线，保留手动辊筒参数状态让副本外观跟随源模型。 */
  private clearOpaqueRollerConveyorCloneRuntimeMetadata(runtimeMetadata: Record<string, unknown>): void {
    delete runtimeMetadata.opaqueRollerConveyorBaseline;
    delete runtimeMetadata.opaqueRollerConveyorAutoRollerCount;
  }

  /** 清除链条机模型包替换时不应继承的运行态基线。 */
  private clearOpaqueChainConveyorRuntimeMetadata(runtimeMetadata: Record<string, unknown>): void {
    delete runtimeMetadata.opaqueChainConveyorBaseline;
  }

  /** 克隆链条机实例时清除几何基线，让副本用自己的 GLB 节点重新捕获。 */
  private clearOpaqueChainConveyorCloneRuntimeMetadata(runtimeMetadata: Record<string, unknown>): void {
    delete runtimeMetadata.opaqueChainConveyorBaseline;
  }

  /** 基线只能来自 GLB 原始节点，运行态克隆和脚本生成节点都不能参与。 */
  private isGeneratedRuntimeNodeForBaseline(node: TransformNode): boolean {
    const metadata = this.asMetadataObject(node.metadata);
    return metadata.generatedByParametricRuntime === true || metadata.generatedByMeshVertexModifyRuntime === true;
  }

  /** 识别历史脏基线中可能混入的运行态克隆节点名，读取时会过滤这些节点。 */
  private isGeneratedRuntimeNodeNameForBaseline(nodeName: string): boolean {
    return /_(mesh_vertex|roller)_\d+$/i.test(nodeName);
  }

  /** 当前 opaque 辊道机 GLB 的真实物理节点命名，只保留这些节点进入部件级基线。 */
  private isOpaqueRollerConveyorOriginalNodeName(nodeName: string): boolean {
    return /^(A\d+|GT\d+)$/i.test(nodeName);
  }

  /** 当前 opaque 链条机 GLB 的原始物理节点命名，只保留这些节点进入基线。 */
  private isOpaqueChainConveyorOriginalNodeName(nodeName: string): boolean {
    return (
      nodeName === OPAQUE_CHAIN_CONVEYOR_BODY_NODE_NAME ||
      nodeName === OPAQUE_CHAIN_CONVEYOR_MOTOR_NODE_NAME ||
      OPAQUE_CHAIN_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES.includes(nodeName) ||
      OPAQUE_CHAIN_CONVEYOR_TAIL_FOLLOW_NODE_NAMES.includes(nodeName)
    );
  }

  /** 兼容旧复制体：Babylon 曾把子节点改成“副本根名.原节点名”，链条机规则统一按末段原名索引。 */
  private getOpaqueChainConveyorCanonicalNodeName(nodeName: string): string {
    if (this.isOpaqueChainConveyorOriginalNodeName(nodeName)) {
      return nodeName;
    }

    const suffix = nodeName.slice(nodeName.lastIndexOf(".") + 1);
    return this.isOpaqueChainConveyorOriginalNodeName(suffix) ? suffix : nodeName;
  }

  /** 去掉模型包 runtime 写到根节点的参数化缩放，保留用户在编辑器里手动设置的缩放。 */
  private resetModelPackageRootParametricScaling(root: TransformNode): boolean {
    const parametricRootScaling = this.getModelPackageParametricRootScaling(root);
    const userScaling = this.divideVectorComponents(root.scaling, parametricRootScaling);
    const changed =
      Math.abs(parametricRootScaling.x - 1) > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ||
      Math.abs(parametricRootScaling.y - 1) > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ||
      Math.abs(parametricRootScaling.z - 1) > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON;
    root.scaling.copyFrom(userScaling);
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime),
        parametricRootScaling: snapshotVector(this.createDefaultParametricRootScaling())
      }
    });
    this.refreshNodeWorldMatrices(root);
    return changed;
  }

  /** 只去掉模型包 runtime 写到根节点指定轴的参数化缩放，保留其它参数轴的既有行为。 */
  private resetModelPackageRootParametricAxisScaling(root: TransformNode, axis: "x" | "y" | "z"): boolean {
    const parametricRootScaling = this.getModelPackageParametricRootScaling(root);
    const axisScale = parametricRootScaling[axis];
    if (!Number.isFinite(axisScale) || Math.abs(axisScale - 1) <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return false;
    }

    root.scaling[axis] = Math.abs(axisScale) > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ? root.scaling[axis] / axisScale : root.scaling[axis];
    const nextParametricRootScaling = parametricRootScaling.clone();
    nextParametricRootScaling[axis] = 1;
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime),
        parametricRootScaling: snapshotVector(nextParametricRootScaling)
      }
    });
    this.refreshNodeWorldMatrices(root);
    return true;
  }

  /** 获取 opaque 辊道机子节点名称索引，当前 GLB 的 A 系列和 GT 系列名称唯一。 */
  private getOpaqueRollerConveyorNodesByName(root: TransformNode): Map<string, TransformNode> {
    return new Map(
      this.getNodeHierarchy(root)
        .filter((node): node is TransformNode => node instanceof TransformNode && node !== root)
        .map((node) => [node.name, node])
    );
  }

  /** 获取 opaque 链条机子节点名称索引，当前 GLB 的节点名唯一且数量很少。 */
  private getOpaqueChainConveyorNodesByName(root: TransformNode): Map<string, TransformNode> {
    const nodesByName = new Map<string, TransformNode>();
    this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root)
      .forEach((node) => {
        const nodeName = this.getOpaqueChainConveyorCanonicalNodeName(node.name);
        if (this.isOpaqueChainConveyorOriginalNodeName(nodeName) && !nodesByName.has(nodeName)) {
          nodesByName.set(nodeName, node);
        }
      });
    return nodesByName;
  }

  /** 在整体基线中心周围按比例移动坐标，不改变节点自身非对应轴尺寸。 */
  private scaleCoordinateAroundCenter(coordinate: number, minimum: number, maximum: number, ratio: number): number {
    const center = (minimum + maximum) / 2;
    return center + (coordinate - center) * ratio;
  }

  /** 以左端支架右边界作为长度伸长起点，蓝框固定区不参与 X 方向拉伸。 */
  private getOpaqueRollerConveyorLengthAnchorX(baseline: OpaqueRollerConveyorBaseline): number {
    const fixedMaximums = OPAQUE_ROLLER_CONVEYOR_LENGTH_FIXED_START_NODE_NAMES
      .map((nodeName) => baseline.nodes.get(nodeName))
      .filter((node): node is OpaqueRollerConveyorNodeBaseline => Boolean(node))
      .map((node) => node.center.x + node.size.x / 2)
      .filter((maximum) => Number.isFinite(maximum));
    if (fixedMaximums.length === 0) {
      return baseline.minimum.x;
    }
    return Math.min(baseline.maximum.x, Math.max(baseline.minimum.x, Math.max(...fixedMaximums)));
  }

  /** 限制长度不能短到压坏固定支架区，过小输入只压缩固定区右侧的有效输送段。 */
  private createOpaqueRollerConveyorEffectiveLength(
    baseline: OpaqueRollerConveyorBaseline,
    requestedLength: number,
    lengthAnchorX: number
  ): number {
    const fixedStartLength = Math.max(0, lengthAnchorX - baseline.minimum.x);
    const minimumLength = fixedStartLength + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON;
    return Math.max(minimumLength, requestedLength);
  }

  /** 将根节点本地 X 锚点映射到长梁 position 顶点 X，用于只拉伸锚点右侧顶点。 */
  private mapOpaqueRollerConveyorRootXToLengthVertexX(
    rootX: number,
    baseline: OpaqueRollerConveyorNodeBaseline,
    bounds: { minimum: number; maximum: number; center: number }
  ): number {
    const nodeMinimumX = baseline.center.x - baseline.size.x / 2;
    const nodeMaximumX = baseline.center.x + baseline.size.x / 2;
    const clampedRootX = Math.min(nodeMaximumX, Math.max(nodeMinimumX, rootX));
    const rootRatio = this.createSafeRatio(clampedRootX - nodeMinimumX, baseline.size.x);
    return bounds.minimum + (bounds.maximum - bounds.minimum) * rootRatio;
  }

  /** 按整机目标外宽移动节点中心，侧边零件贴齐新边界，横向贯穿件保持中心线对称缩放。 */
  private createOpaqueRollerConveyorWidthCenter(
    nodeName: string,
    nodeBaseline: OpaqueRollerConveyorNodeBaseline,
    baseline: OpaqueRollerConveyorBaseline,
    widthRatio: number
  ): number {
    const baseCenter = (baseline.minimum.z + baseline.maximum.z) / 2;
    const targetWidth = baseline.size.z * widthRatio;
    const targetMinimum = baseCenter - targetWidth / 2;
    const targetMaximum = baseCenter + targetWidth / 2;
    const nodeMinimum = nodeBaseline.center.z - nodeBaseline.size.z / 2;
    const nodeMaximum = nodeBaseline.center.z + nodeBaseline.size.z / 2;
    const nodeTargetSize = OPAQUE_ROLLER_CONVEYOR_WIDTH_SCALE_NODE_NAMES.includes(nodeName)
      ? nodeBaseline.size.z * widthRatio
      : nodeBaseline.size.z;
    const edgeTolerance = Math.max(0.01, baseline.size.z * 0.08);
    const touchesMinimum = Math.abs(nodeMinimum - baseline.minimum.z) <= edgeTolerance;
    const touchesMaximum = Math.abs(nodeMaximum - baseline.maximum.z) <= edgeTolerance;

    if (touchesMinimum && !touchesMaximum) {
      return targetMinimum + nodeTargetSize / 2;
    }
    if (touchesMaximum && !touchesMinimum) {
      return targetMaximum - nodeTargetSize / 2;
    }
    return this.scaleCoordinateAroundCenter(nodeBaseline.center.z, baseline.minimum.z, baseline.maximum.z, widthRatio);
  }

  /** 用统一容差比较浮点参数，避免连续输入时自动值被微小误差误判成手动值。 */
  private areNumbersClose(left: number, right: number): boolean {
    return Math.abs(left - right) <= Math.max(0.000001, Math.max(Math.abs(left), Math.abs(right)) * 0.000001);
  }

  /** 按底端固定的方式计算立柱增高后的中心，避免脚杯离地。 */
  private moveCenterWithFixedMinimum(center: number, size: number, delta: number): number {
    const targetSize = Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, size + delta);
    const minimum = center - size / 2;
    return minimum + targetSize / 2;
  }

  /** 计算四根立柱的高度缩放比例，只有立柱自身承担高度变化。 */
  private createOpaqueRollerConveyorLegHeightRatio(
    baseline: OpaqueRollerConveyorNodeBaseline,
    heightDelta: number,
    fallbackRatio: number
  ): number {
    if (baseline.size.y <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return fallbackRatio;
    }

    const targetHeight = Math.max(MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON, baseline.size.y + heightDelta);
    return targetHeight / baseline.size.y;
  }

  /** 按长梁内部有效范围生成辊筒中心，避免脏 GT 位置把辊筒排到长梁外侧。 */
  private createOpaqueRollerConveyorRollerCenters(
    baseline: OpaqueRollerConveyorBaseline,
    targetCount: number,
    lengthAnchorX: number,
    targetLength: number,
    lengthTailReference?: OpaqueRollerConveyorLengthTailReference | null,
    measuredTrackRange?: OpaqueRollerConveyorAxisRange | null
  ): number[] {
    const trackRange = measuredTrackRange ?? this.createOpaqueRollerConveyorRollerTrackRange(baseline, targetLength);
    const fallbackRange = trackRange ? this.createOpaqueRollerConveyorInsetTrackRange(baseline, trackRange) : null;
    if (fallbackRange) {
      return this.createIncrementalOpaqueRollerConveyorCenters(baseline, fallbackRange, targetCount, lengthTailReference);
    }

    return [Math.max(baseline.minimum.x, Math.min(baseline.maximum.x, lengthAnchorX))];
  }

  /** 以整机目标长度为硬边界，并优先与 A10/A11 当前长梁共同覆盖范围取交集。 */
  private createOpaqueRollerConveyorRollerTrackRange(
    baseline: OpaqueRollerConveyorBaseline,
    targetLength: number
  ): OpaqueRollerConveyorAxisRange | null {
    if (!Number.isFinite(targetLength)) {
      return null;
    }

    const targetMaximumX = baseline.minimum.x + targetLength;
    const targetRange: OpaqueRollerConveyorAxisRange = {
      start: Math.min(baseline.minimum.x, targetMaximumX),
      end: targetMaximumX
    };
    const beamRange = this.createOpaqueRollerConveyorCurrentBeamRange(baseline, targetLength);
    const range = beamRange
      ? {
        start: Math.max(targetRange.start, beamRange.start),
        end: Math.min(targetRange.end, beamRange.end)
      }
      : targetRange;
    return range.end - range.start > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ? range : null;
  }

  /** 根据 A10/A11 基线和当前目标长度估算长梁共同覆盖范围，入口使用长梁左端而不是 length 拉伸锚点。 */
  private createOpaqueRollerConveyorCurrentBeamRange(
    baseline: OpaqueRollerConveyorBaseline,
    targetLength: number
  ): OpaqueRollerConveyorAxisRange | null {
    const lengthDelta = targetLength - baseline.size.x;
    const ranges = OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES
      .map((nodeName) => baseline.nodes.get(nodeName))
      .filter((node): node is OpaqueRollerConveyorNodeBaseline => Boolean(node))
      .map((node) => ({
        start: node.center.x - node.size.x / 2,
        end: node.center.x + node.size.x / 2 + lengthDelta
      }))
      .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
    if (ranges.length === 0) {
      return null;
    }

    const start = Math.max(...ranges.map((range) => range.start));
    const end = Math.min(...ranges.map((range) => range.end));
    return end - start > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ? { start, end } : null;
  }

  /** 使用当前 A10/A11 真实共同包围盒作为辊筒轨道，保证第一根从红框入口向内侧开始。 */
  private createOpaqueRollerConveyorMeasuredRollerTrackRange(
    currentBeamRange: OpaqueRollerConveyorAxisRange
  ): OpaqueRollerConveyorAxisRange | null {
    if (currentBeamRange.end - currentBeamRange.start <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return null;
    }

    return { start: currentBeamRange.start, end: currentBeamRange.end };
  }

  /** 长梁轨道兜底分布时向内缩进半个辊筒直径，避免首尾辊筒贴到端部框架外侧。 */
  private createOpaqueRollerConveyorInsetTrackRange(
    baseline: OpaqueRollerConveyorBaseline,
    trackRange: OpaqueRollerConveyorAxisRange
  ): OpaqueRollerConveyorAxisRange {
    const rollerDepths = OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES
      .map((name) => baseline.nodes.get(name)?.size.x)
      .filter((size): size is number => typeof size === "number" && Number.isFinite(size) && size > 0);
    const trackSpan = Math.max(0, trackRange.end - trackRange.start);
    const rollerHalfDepth = rollerDepths.length > 0 ? Math.max(...rollerDepths) / 2 : 0;
    const margin = Math.min(rollerHalfDepth, trackSpan / 3);
    const start = trackRange.start + margin;
    const end = trackRange.end - margin;
    return end - start > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ? { start, end } : trackRange;
  }

  /** 从远离长梁尾端的一侧开始按原始间距向尾端增加，超过长梁安全范围的数量不显示。 */
  private createIncrementalOpaqueRollerConveyorCenters(
    baseline: OpaqueRollerConveyorBaseline,
    range: OpaqueRollerConveyorAxisRange,
    targetCount: number,
    lengthTailReference?: OpaqueRollerConveyorLengthTailReference | null
  ): number[] {
    const layout = this.createOpaqueRollerConveyorRollerLayoutRange(range, lengthTailReference);
    const firstCenter = this.createOpaqueRollerConveyorFirstRollerCenter(layout);
    const pitch = this.createOpaqueRollerConveyorRollerPitch(baseline);
    if (pitch <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return [firstCenter];
    }

    const centers: number[] = [];
    for (let index = 0; index < targetCount; index += 1) {
      const center = firstCenter + pitch * layout.direction * index;
      const hasPassedEnd = layout.direction > 0
        ? center > layout.end + MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON
        : center < layout.end - MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON;
      if (hasPassedEnd) {
        break;
      }
      centers.push(center);
    }
    return centers.length > 0 ? centers : [layout.start];
  }

  /** 以长梁真实尾端决定辊筒追加方向，从远离尾端的一侧向尾端逐个追加。 */
  private createOpaqueRollerConveyorRollerLayoutRange(
    range: OpaqueRollerConveyorAxisRange,
    lengthTailReference?: OpaqueRollerConveyorLengthTailReference | null
  ): OpaqueRollerConveyorAxisRange & { direction: 1 | -1 } {
    if (!lengthTailReference) {
      return { ...range, direction: 1 };
    }

    const followsRangeEnd =
      Math.abs(lengthTailReference.currentTailX - range.end) <= Math.abs(lengthTailReference.currentTailX - range.start);
    return followsRangeEnd
      ? { start: range.start, end: range.end, direction: 1 }
      : { start: range.end, end: range.start, direction: -1 };
  }

  /** 第一根辊筒以当前长梁安全区间的起点为准，避免沿用原始 GT 外部坐标。 */
  private createOpaqueRollerConveyorFirstRollerCenter(range: OpaqueRollerConveyorAxisRange): number {
    return range.start;
  }

  /** 使用原始 GT 中心距作为新增辊筒固定间距，保证数量增加时沿尾端方向追加而不是重新铺满。 */
  private createOpaqueRollerConveyorRollerPitch(baseline: OpaqueRollerConveyorBaseline): number {
    const centers = this.getOpaqueRollerConveyorBaseRollerCenters(baseline);
    for (let index = 1; index < centers.length; index += 1) {
      const pitch = centers[index] - centers[index - 1];
      if (pitch > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
        return pitch;
      }
    }

    const rollerDepths = OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES
      .map((name) => baseline.nodes.get(name)?.size.x)
      .filter((size): size is number => typeof size === "number" && Number.isFinite(size) && size > 0);
    return rollerDepths.length > 0 ? Math.max(...rollerDepths) : 0;
  }

  /** 读取原始 GT 中心点，只作为固定间距基准，不再决定第一根辊筒位置。 */
  private getOpaqueRollerConveyorBaseRollerCenters(baseline: OpaqueRollerConveyorBaseline): number[] {
    return OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES
      .map((name) => baseline.nodes.get(name)?.center.x)
      .filter((center): center is number => typeof center === "number" && Number.isFinite(center))
      .sort((left, right) => left - right);
  }

  /** 将世界坐标点转为根节点本地坐标。 */
  private worldPointToRootLocal(root: TransformNode, point: Vector3): Vector3 {
    const rootMatrix = root.getWorldMatrix().clone();
    rootMatrix.invert();
    return Vector3.TransformCoordinates(point, rootMatrix);
  }

  /** 将世界包围盒完整转换为根节点本地包围盒，兼容 GLB 根节点存在负轴缩放或旋转的情况。 */
  private worldBoundsToRootLocalBounds(root: TransformNode, bounds: NodeWorldBounds): NodeWorldBounds {
    const rootMatrix = root.getWorldMatrix().clone();
    rootMatrix.invert();
    const localPoints = this.createBoundsCornerPoints(bounds).map((point) => Vector3.TransformCoordinates(point, rootMatrix));
    const minimum = localPoints[0].clone();
    const maximum = localPoints[0].clone();
    localPoints.slice(1).forEach((point) => {
      minimum.minimizeInPlace(point);
      maximum.maximizeInPlace(point);
    });
    return this.createNodeWorldBounds(minimum, maximum);
  }

  /** 枚举包围盒 8 个角点，避免只转换 min/max 时遇到负轴缩放后范围反转。 */
  private createBoundsCornerPoints(bounds: NodeWorldBounds): Vector3[] {
    return [
      new Vector3(bounds.minimum.x, bounds.minimum.y, bounds.minimum.z),
      new Vector3(bounds.minimum.x, bounds.minimum.y, bounds.maximum.z),
      new Vector3(bounds.minimum.x, bounds.maximum.y, bounds.minimum.z),
      new Vector3(bounds.minimum.x, bounds.maximum.y, bounds.maximum.z),
      new Vector3(bounds.maximum.x, bounds.minimum.y, bounds.minimum.z),
      new Vector3(bounds.maximum.x, bounds.minimum.y, bounds.maximum.z),
      new Vector3(bounds.maximum.x, bounds.maximum.y, bounds.minimum.z),
      new Vector3(bounds.maximum.x, bounds.maximum.y, bounds.maximum.z)
    ];
  }

  /** 计算 position 顶点数组在指定轴上的范围，供局部几何参数化围绕自身中心应用。 */
  private getPositionVertexAxisBounds(vertices: number[], axis: "x" | "y" | "z"): { minimum: number; maximum: number; center: number } | null {
    const offset = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let index = offset; index < vertices.length; index += 3) {
      const value = vertices[index];
      if (!Number.isFinite(value)) {
        return null;
      }
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }

    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
      return null;
    }
    return {
      minimum,
      maximum,
      center: (minimum + maximum) / 2
    };
  }

  /** 判断 metadata 中的长梁顶点基线是否仍是原始长度，防止旧运行态顶点被当成基线继续放大。 */
  private isOpaqueRollerConveyorLengthVertexBaselineValid(baseline: OpaqueRollerConveyorNodeBaseline): boolean {
    if (!baseline.positionVertices) {
      return false;
    }

    const bounds = this.getPositionVertexAxisBounds(baseline.positionVertices, "x");
    if (!bounds || baseline.size.x <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return false;
    }

    const length = bounds.maximum - bounds.minimum;
    return Math.abs(length - baseline.size.x) <= Math.max(0.001, baseline.size.x * 0.01);
  }

  /** 把当前长梁顶点收敛回原始基线长度；旧场景已保存运行态顶点时，用这个步骤恢复可预测基线。 */
  private normalizePositionVerticesToAxisLength(
    vertices: number[],
    axis: "x" | "y" | "z",
    targetLength: number
  ): number[] | undefined {
    if (!Number.isFinite(targetLength) || targetLength <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return undefined;
    }

    const bounds = this.getPositionVertexAxisBounds(vertices, axis);
    if (!bounds) {
      return undefined;
    }

    const currentLength = bounds.maximum - bounds.minimum;
    if (currentLength <= MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON) {
      return undefined;
    }

    const offset = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const ratio = targetLength / currentLength;
    const normalized = vertices.slice();
    for (let index = offset; index < normalized.length; index += 3) {
      normalized[index] = bounds.center + (vertices[index] - bounds.center) * ratio;
    }
    return normalized;
  }

  /** 从 metadata 读取 Vector3 快照。 */
  private readMetadataVector3(value: unknown): Vector3 | null {
    const vector = this.asMetadataObject(value);
    if ([vector.x, vector.y, vector.z].every((component) => typeof component === "number" && Number.isFinite(component))) {
      return new Vector3(Number(vector.x), Number(vector.y), Number(vector.z));
    }
    return null;
  }

  /** 从 metadata 读取有限数字数组，旧场景没有顶点基线时返回空并由当前 mesh 补录。 */
  private readMetadataNumberArray(value: unknown): number[] | undefined {
    if (!Array.isArray(value) || value.length < 3 || value.length % 3 !== 0) {
      return undefined;
    }
    const numbers = value.map((item) => Number(item));
    return numbers.every((item) => Number.isFinite(item)) ? numbers : undefined;
  }

  /** 从 metadata 读取 Quaternion 快照，缺失时表示节点没有四元数旋转。 */
  private readMetadataQuaternion(value: unknown): Quaternion | null {
    const quaternion = this.asMetadataObject(value);
    if (
      [quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(
        (component) => typeof component === "number" && Number.isFinite(component)
      )
    ) {
      return new Quaternion(Number(quaternion.x), Number(quaternion.y), Number(quaternion.z), Number(quaternion.w));
    }
    return null;
  }

  /** 将 Quaternion 转成可写入 metadata 的快照对象。 */
  private snapshotQuaternion(value: Quaternion): { x: number; y: number; z: number; w: number } {
    return {
      x: value.x,
      y: value.y,
      z: value.z,
      w: value.w
    };
  }

  /** 读取正数 metadata 字段，非法值回退到调用方给出的基线。 */
  private readPositiveMetadataNumber(value: unknown, fallback: number): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
  }

  /** 读取正数动态参数，非法或未填写时使用模型基线值。 */
  private readPositiveDynamicNumberParameter(value: unknown, fallback: number): number {
    const numberValue = this.readDynamicNumberParameter(value);
    return numberValue !== undefined && numberValue > 0 ? numberValue : fallback;
  }

  /** 创建安全比例，避免基线尺寸异常时产生无限缩放。 */
  private createSafeRatio(target: number, baseline: number): number {
    return Number.isFinite(target) && Number.isFinite(baseline) && Math.abs(baseline) > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON
      ? target / baseline
      : 1;
  }

  /** 模型包脚本缺失、未刷新或旧状态残留时，仍按动态参数实时修正辊筒数量。 */
  private applyModelPackageRollerDensityFallback(root: TransformNode, values: Record<string, DynamicParameterValue>): void {
    const rollerDensity = this.readDynamicNumberParameter(values.rollerDensity);
    if (rollerDensity === undefined) {
      return;
    }

    if (this.applyRollerCountToNamedRollers(root, rollerDensity, true)) {
      this.refreshNodeWorldMatrices(root);
      this.applyHighlight();
      this.callbacks.onStatsChange(this.collectStats());
    }
  }

  /** 当前辊道机 GLB 的支架节点没有语义命名时，按已验证 A* 节点组兜底处理显隐。 */
  private applyOpaqueRollerConveyorSupportFallback(root: TransformNode, values: Record<string, DynamicParameterValue>): void {
    const showFrontSupport = this.readDynamicBooleanParameter(values.showFrontSupport);
    const showRearSupport = this.readDynamicBooleanParameter(values.showRearSupport);
    if (showFrontSupport === undefined && showRearSupport === undefined) {
      return;
    }

    if (!this.isOpaqueRollerConveyorPackage(root)) {
      return;
    }

    let changed = false;
    if (showFrontSupport !== undefined) {
      changed = this.setNamedSupportNodesEnabled(root, OPAQUE_ROLLER_CONVEYOR_FRONT_SUPPORT_NODE_NAMES, showFrontSupport) || changed;
    }
    if (showRearSupport !== undefined) {
      changed = this.setNamedSupportNodesEnabled(root, OPAQUE_ROLLER_CONVEYOR_REAR_SUPPORT_NODE_NAMES, showRearSupport) || changed;
    }

    if (changed) {
      this.refreshNodeWorldMatrices(root);
      this.applyHighlight();
      this.callbacks.onStatsChange(this.collectStats());
    }
  }

  /** 判断当前根节点是否是需要 A* 支架兼容的辊道机模型包实例。 */
  private isOpaqueRollerConveyorPackage(root: TransformNode): boolean {
    return this.hasOpaqueRollerConveyorNodeSet(root);
  }

  /** 检查当前 GLB 的不透明节点名集合，防止支架兜底误命中其它模型。 */
  private hasOpaqueRollerConveyorNodeSet(root: TransformNode): boolean {
    const names = new Set(
      this.getNodeHierarchy(root)
        .filter((node) => node instanceof TransformNode)
        .map((node) => node.name)
    );
    return [
      ...OPAQUE_ROLLER_CONVEYOR_ROLLER_NODE_NAMES,
      ...OPAQUE_ROLLER_CONVEYOR_LENGTH_GEOMETRY_NODE_NAMES,
      ...OPAQUE_ROLLER_CONVEYOR_FRONT_SUPPORT_NODE_NAMES,
      ...OPAQUE_ROLLER_CONVEYOR_REAR_SUPPORT_NODE_NAMES
    ].every((name) => names.has(name));
  }

  /** 判断当前根节点是否是需要链条机长度兜底的模型包实例。 */
  private isOpaqueChainConveyorPackage(root: TransformNode): boolean {
    return this.hasOpaqueChainConveyorNodeSet(root);
  }

  /** 检查链条机 GLB 的固定节点集合，防止链条机规则误命中其它输送设备。 */
  private hasOpaqueChainConveyorNodeSet(root: TransformNode): boolean {
    const names = new Set(
      this.getNodeHierarchy(root)
        .filter((node) => node instanceof TransformNode)
        .map((node) => this.getOpaqueChainConveyorCanonicalNodeName(node.name))
    );
    return OPAQUE_CHAIN_CONVEYOR_REQUIRED_NODE_NAMES.every((name) => names.has(name));
  }

  /** 计算链条机基线包围盒，排除运行态补梁及其子网格。 */
  private getOpaqueChainConveyorBaselineWorldBounds(node: TransformNode, includeDisabled = false): NodeWorldBounds | null {
    const meshes = this.getEditableMeshes(node).filter(
      (mesh) =>
        mesh.getTotalVertices() > 0 &&
        (includeDisabled || mesh.isEnabled()) &&
        !this.hasGeneratedRuntimeAncestorForBaseline(mesh, node)
    );
    return this.createNodeWorldBoundsFromMeshes(meshes);
  }

  /** 清理旧版本链条机长度兜底生成的临时补板，避免它继续影响基线和保存。 */
  private disposeGeneratedChainConveyorNodes(root: TransformNode): void {
    const generatedNodes = this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root)
      .filter((node) => {
        const metadata = this.asMetadataObject(node.metadata);
        return metadata.generatedByParametricRuntime === true && metadata.reason === OPAQUE_CHAIN_CONVEYOR_EXTENSION_REASON;
      });
    const materials = new Set<Material>();
    generatedNodes.forEach((node) => {
      const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
      meshes.forEach((mesh) => this.collectMaterialTree(mesh.material, materials));
    });
    generatedNodes.forEach((node) => node.dispose(false, false));
    this.disposeUnusedMaterials(materials);
  }

  /** 按精确节点名切换支架可见性，返回是否真的改变了节点启用状态。 */
  private setNamedSupportNodesEnabled(root: TransformNode, nodeNames: string[], enabled: boolean): boolean {
    const nodesByName = new Map(
      this.getNodeHierarchy(root)
        .filter((node): node is TransformNode => node instanceof TransformNode)
        .map((node) => [node.name, node])
    );
    return nodeNames.reduce((changed, nodeName) => {
      const node = nodesByName.get(nodeName);
      if (!node || typeof node.setEnabled !== "function") {
        return changed;
      }

      const wasEnabled = typeof node.isEnabled === "function" ? node.isEnabled() : undefined;
      node.setEnabled(enabled);
      return changed || wasEnabled !== enabled;
    }, false);
  }

  /** 按最终数量重排命名辊筒，普通 GLB 和模型包兜底逻辑共用同一套实现。 */
  private applyRollerCountToNamedRollers(root: TransformNode, rollerDensity: number, cleanupModelPackageRollerClones: boolean): boolean {
    const rollers = this.getRollerCountTemplates(root);
    if (rollers.length === 0) {
      return false;
    }

    this.disposeGeneratedRollerCountNodes(root, cleanupModelPackageRollerClones);
    const targetCount = Math.max(1, Math.min(100, Math.round(rollerDensity)));
    const targetCenters = this.createMeshVertexModifyRollerCenters(root, rollers, targetCount);
    rollers.forEach((roller, index) => {
      const visible = index < Math.min(targetCount, rollers.length);
      roller.setEnabled(visible);
      if (visible) {
        this.moveNodeCenterOnRootAxis(root, roller, "x", targetCenters[index]);
      }
    });

    for (let index = rollers.length; index < targetCount; index += 1) {
      const source = rollers[index % rollers.length];
      const clone = source.clone(`${source.name || "roller"}_mesh_vertex_${index + 1}`, source.parent, false);
      if (!clone) {
        continue;
      }

      clone.metadata = {
        ...this.asMetadataObject(clone.metadata),
        generatedByMeshVertexModifyRuntime: true,
        sourceNodeName: source.name,
        reason: "rollerDensity"
      };
      clone.doNotSerialize = true;
      clone.setEnabled(true);
      this.copyMeshVertexModifyPickability(source, clone);
      this.moveNodeCenterOnRootAxis(root, clone, "x", targetCenters[index]);
    }
    return true;
  }

  /** 复制源节点及子网格的拾取能力，避免生成辊筒破坏选中根节点的体验。 */
  private copyMeshVertexModifyPickability(source: TransformNode, clone: TransformNode): void {
    const sourceMeshes = source instanceof AbstractMesh ? [source, ...source.getChildMeshes()] : source.getChildMeshes();
    const cloneMeshes = clone instanceof AbstractMesh ? [clone, ...clone.getChildMeshes()] : clone.getChildMeshes();
    cloneMeshes.forEach((mesh, index) => {
      mesh.isPickable = sourceMeshes[index]?.isPickable ?? true;
      mesh.doNotSerialize = true;
    });
  }

  /** 清理编辑器兜底生成的辊筒，模型包路径还会清理脚本生成的 roller 克隆避免重复叠加。 */
  private disposeGeneratedRollerCountNodes(root: TransformNode, includeModelPackageRollerClones: boolean): void {
    const generatedNodes = this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root)
      .filter((node) => this.isGeneratedRollerCountNode(node, includeModelPackageRollerClones));
    const materials = new Set<Material>();
    generatedNodes.forEach((node) => {
      const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
      meshes.forEach((mesh) => this.collectMaterialTree(mesh.material, materials));
    });
    generatedNodes.forEach((node) => node.dispose(false, false));
    this.disposeUnusedMaterials(materials);
  }

  /** 判断节点是否属于辊筒数量逻辑生成的临时克隆。 */
  private isGeneratedRollerCountNode(node: TransformNode, includeModelPackageRollerClones: boolean): boolean {
    const metadata = this.asMetadataObject(node.metadata);
    if (metadata.generatedByMeshVertexModifyRuntime) {
      return true;
    }

    return (
      includeModelPackageRollerClones &&
      metadata.generatedByParametricRuntime === true &&
      (metadata.reason === "roller" ||
        metadata.reason === "rollerDensity" ||
        this.isRollerCountNodeName(String(metadata.sourceNodeName ?? "")))
    );
  }

  /** 收集原始辊筒模板，按模型根节点本地 X 轴从小到大排序。 */
  private getRollerCountTemplates(root: TransformNode): TransformNode[] {
    return this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root)
      .filter((node) => {
        const metadata = this.asMetadataObject(node.metadata);
        return !metadata.generatedByMeshVertexModifyRuntime && !metadata.generatedByParametricRuntime;
      })
      .filter((node) => this.isRollerCountNodeName(node.name || ""))
      .sort((left, right) => {
        const delta = this.getNodeCenterOnRootAxis(root, left, "x") - this.getNodeCenterOnRootAxis(root, right, "x");
        return Math.abs(delta) > 0.000001 ? delta : left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true });
      });
  }

  /** 识别辊道机常见辊筒命名，兼容 GT1..GT10、roller 以及中文辊/滚。 */
  private isRollerCountNodeName(name: string): boolean {
    return /^(GT\d+)|roller|辊|滚/i.test(name);
  }

  /** 在原始辊筒覆盖范围内按目标数量生成根节点本地 X 轴中心点。 */
  private createMeshVertexModifyRollerCenters(root: TransformNode, rollers: TransformNode[], targetCount: number): number[] {
    const centers = rollers.map((roller) => this.getNodeCenterOnRootAxis(root, roller, "x"));
    const start = Math.min(...centers);
    const end = Math.max(...centers);
    if (targetCount <= 1) {
      return [(start + end) / 2];
    }

    const span = end - start;
    if (Math.abs(span) < 0.000001) {
      const bounds = this.getNodeWorldBounds(rollers[0], true);
      const spacing = Math.max(0.01, bounds?.size.x ?? 0.01);
      const first = start - ((targetCount - 1) * spacing) / 2;
      return Array.from({ length: targetCount }, (_, index) => first + index * spacing);
    }

    return Array.from({ length: targetCount }, (_, index) => start + (span * index) / (targetCount - 1));
  }

  /** 读取节点世界包围盒中心在根节点本地坐标系的轴向坐标。 */
  private getNodeCenterOnRootAxis(root: TransformNode, node: TransformNode, axis: "x" | "y" | "z"): number {
    this.refreshNodeWorldMatrices(root);
    const bounds = this.getNodeWorldBounds(node, true);
    if (!bounds) {
      return 0;
    }

    const center = bounds.center;
    const rootMatrix = root.getWorldMatrix().clone();
    rootMatrix.invert();
    return Vector3.TransformCoordinates(center, rootMatrix)[axis];
  }

  /** 沿根节点本地轴移动节点，使节点包围盒中心对齐目标坐标。 */
  private moveNodeCenterOnRootAxis(root: TransformNode, node: TransformNode, axis: "x" | "y" | "z", targetCenter: number): void {
    if (!node.position || !Number.isFinite(targetCenter)) {
      return;
    }

    const currentCenter = this.getNodeCenterOnRootAxis(root, node, axis);
    const delta = targetCenter - currentCenter;
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.000001) {
      return;
    }

    // targetCenter 属于编辑根节点本地轴，节点 position 属于父级局部轴，必须转换坐标系后再写入。
    root.computeWorldMatrix(true);
    if (node.parent instanceof TransformNode) {
      node.parent.computeWorldMatrix(true);
    }
    const rootLocalDelta = Vector3.Zero();
    rootLocalDelta[axis] = delta;
    const worldDelta = Vector3.TransformNormal(rootLocalDelta, root.getWorldMatrix());
    const parent = node.parent;
    const parentLocalDelta =
      parent instanceof TransformNode
        ? Vector3.TransformNormal(worldDelta, parent.getWorldMatrix().clone().invert())
        : worldDelta;
    node.position.addInPlace(parentLocalDelta);
    this.refreshNodeWorldMatrices(root);
  }

  /** 合并写回指定节点的业务资产信息，assetCode 不与文件资产 ID 混用。 */
  private updateNodeAssetInfo(node: TransformNode, update: Partial<Pick<AssetInfoSnapshot, "assetCode">>): void {
    const current = this.getNodeAssetInfo(node);
    const editorMetadata = this.getNodeEditorMetadata(node);
    const stored = this.asMetadataObject(editorMetadata.assetInfo);
    this.mergeNodeEditorMetadata(node, {
      assetInfo: {
        ...stored,
        assetCode: update.assetCode ?? current.assetCode
      }
    });
  }

  /** 合并写回定位框动画连接配置，只保留 Inspector 暴露的白名单字段。 */
  private updateLocatorAnimationConnection(node: TransformNode, update: LocatorAnimationConnectionUpdate): void {
    const current = this.getLocatorAnimationConnection(node);
    this.mergeNodeEditorMetadata(node, {
      locatorAnimationConnection: this.normalizeLocatorAnimationConnection({
        ...current,
        ...update
      })
    });
  }

  /** 写回定位框尺寸，并立即更新当前 LinesMesh 的 12 条边。 */
  private updateLocatorDimensions(node: TransformNode, update: LocatorDimensionsUpdate): void {
    const dimensions = this.normalizeLocatorDimensions({
      ...this.getLocatorDimensions(node),
      ...update
    });
    this.mergeNodeEditorMetadata(node, { locatorDimensions: dimensions });
    this.applyLocatorDimensionsToNode(node, dimensions);
  }

  /** 把尺寸同步到定位框真实顶点，保留节点 ID、选中态和业务 metadata 不变。 */
  private applyLocatorDimensionsToNode(node: TransformNode, dimensions: LocatorDimensionsSnapshot): void {
    if (!(node instanceof LinesMesh)) {
      return;
    }

    const lines = this.createLocatorWireCubeLines(dimensions);
    try {
      if (!node.isVertexBufferUpdatable(VertexBuffer.PositionKind)) {
        node.markVerticesDataAsUpdatable(VertexBuffer.PositionKind, true);
      }
      MeshBuilder.CreateLineSystem(node.name, { lines, instance: node }, this.scene);
    } catch {
      node.setVerticesData(VertexBuffer.PositionKind, this.flattenLocatorWireCubeLinePositions(dimensions), true);
    }
    node.refreshBoundingInfo(true);
    node.computeWorldMatrix(true);
  }

  /** 写回指定节点所属模型包的动态参数，并立即重跑运行脚本驱动真实模型。 */
  private updateNodeDynamicParameter(node: TransformNode, update: DynamicParameterUpdate): boolean {
    const packageRoot = this.findModelPackageRoot(node);
    if (!packageRoot) {
      console.warn(`动态参数 ${update.key} 更新失败：当前节点不属于模型包实例。`);
      return false;
    }

    const editorMetadata = this.getNodeEditorMetadata(packageRoot);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    if (update.packageId && instance.packageId !== update.packageId) {
      this.setModelPackageRuntimeWarning(packageRoot, `动态参数 ${update.key} 更新失败：模型包编号不匹配。`);
      return false;
    }

    const assetId = typeof instance.assetId === "string" ? instance.assetId : "";
    const packageId = typeof instance.packageId === "string" ? instance.packageId : "";
    const asset = this.assets.find((item) => item.id === assetId && item.modelPackage?.packageId === packageId);
    const manifest = asset?.modelPackage;
    if (!manifest) {
      this.setModelPackageRuntimeWarning(packageRoot, `动态参数 ${update.key} 更新失败：未找到对应模型包资产。`);
      return false;
    }

    const field = manifest.dynamicFields.find((item) => item.key === update.key);
    const parameterValue = field ? this.normalizeDynamicParameterValueForField(field, update.value) : undefined;
    if (!field || parameterValue === undefined) {
      this.setModelPackageRuntimeWarning(packageRoot, `动态参数 ${update.key} 更新失败：字段不存在或值类型不匹配。`);
      return false;
    }

    const values = this.getModelPackageValues(packageRoot, manifest);
    const nextValues = {
      ...values,
      [update.key]: parameterValue
    } as Record<string, DynamicParameterValue>;
    this.applyModelPackageRuntimeWithDynamicFallbacks(packageRoot, manifest, "parameter", nextValues, update.key);
    this.refreshSceneGraph();
    this.emitSelectionSnapshot();
    this.scene.render();
    return true;
  }

  /** 遍历当前场景的模型包根节点，保存后用于恢复视口中的参数化效果。 */
  private applyModelPackageRuntimeToScene(reason: "load" | "serialize"): void {
    this.getSceneModelPackageRoots().forEach((root) => {
      const asset = this.getModelPackageAssetForRoot(root);
      if (asset?.modelPackage) {
        const values = this.getModelPackageValues(root, asset.modelPackage);
        this.applyModelPackageRuntimeWithDynamicFallbacks(root, asset.modelPackage, reason, values);
      }
    });
    this.refreshSceneGraph();
    this.emitSelectionSnapshot();
    this.callbacks.onStatsChange(this.collectStats());
    this.scene.render();
  }

  /** 应用模型包运行脚本后立即执行编辑器兜底，避免导入、拖入、复制和阵列路径遗漏部件级修正。 */
  private applyModelPackageRuntimeWithDynamicFallbacks(
    root: TransformNode,
    manifest: ModelPackageManifest,
    reason: "import" | "load" | "parameter" | "serialize" | "clone",
    values?: Record<string, DynamicParameterValue>,
    changedParameterKey?: string
  ): void {
    const runtimeValues = values ?? this.getModelPackageValues(root, manifest);
    this.persistModelPackageValues(root, runtimeValues);
    this.syncModelPackageScriptMetadata(root, manifest, runtimeValues);
    this.applyModelPackageRuntime(root, manifest, reason);
    this.applyModelPackageDynamicFallbacks(root, runtimeValues, changedParameterKey);
  }

  /** 对指定模型包根节点应用运行脚本；失败只记录告警，参数值仍然保存。 */
  private applyModelPackageRuntime(root: TransformNode, manifest: ModelPackageManifest, reason: "import" | "load" | "parameter" | "serialize" | "clone"): void {
    const scriptFile = manifest.runtimeScriptFile ?? manifest.scriptFile;
    if (!scriptFile) {
      this.setModelPackageRuntimeWarning(root, "模型包未声明运行脚本，参数只会保存，不会驱动模型变化。");
      return;
    }

    const scriptText = this.getModelPackageScriptText(manifest.packageId, scriptFile);
    if (scriptText === undefined) {
      this.setModelPackageRuntimeWarning(root, `模型包运行脚本 ${scriptFile} 尚未加载，参数只会保存，不会驱动模型变化。`);
      return;
    }

    const className = manifest.runtimeClassName ?? DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS;
    const compileResult = compileModelPackageRuntime(scriptText, scriptFile, className);
    if (!compileResult.runtimeConstructor) {
      this.setModelPackageRuntimeWarning(root, compileResult.warning ?? `${scriptFile} 运行脚本不可用。`);
      return;
    }

    const handle = this.getOrCreateModelPackageRuntimeHandle(root, manifest.packageId, scriptFile, className, compileResult.runtimeConstructor);
    if (!handle) {
      return;
    }

    const values = this.getModelPackageValues(root, manifest);
    this.persistModelPackageValues(root, values);
    this.syncModelPackageScriptMetadata(root, manifest, values);
    this.assignModelPackageRuntimeValues(handle.instance, values, manifest.dynamicFields);
    const methodName = handle.started ? "onUpdate" : "onStart";
    const warning = this.runModelPackageLifecycleWithEditableStateGuard(root, manifest, values, "apply", () =>
      invokeModelPackageRuntimeLifecycle(handle.instance, methodName, scriptFile)
    );
    if (warning) {
      this.setModelPackageRuntimeWarning(root, warning);
      return;
    }

    handle.started = true;
    const generatedNodeCount = this.countGeneratedModelPackageRuntimeNodes(root);
    if (generatedNodeCount > MAX_MODEL_PACKAGE_RUNTIME_GENERATED_NODES) {
      this.stopModelPackageRuntime(root, true);
      this.setModelPackageRuntimeWarning(
        root,
        `模型包运行脚本生成了 ${generatedNodeCount} 个节点，超过上限 ${MAX_MODEL_PACKAGE_RUNTIME_GENERATED_NODES}，已停止本次应用。`
      );
      return;
    }

    this.setModelPackageRuntimeWarning(root, "");
    this.refreshNodeWorldMatrices(root);
    this.ensureNodeGridCoverage(root);
    if (reason === "parameter" || reason === "import" || reason === "load") {
      this.applyHighlight();
      this.callbacks.onStatsChange(this.collectStats());
    }
  }

  /** 获取或创建某个模型包根节点的运行类实例，同一根节点复用同一生命周期对象。 */
  private getOrCreateModelPackageRuntimeHandle(
    root: TransformNode,
    packageId: string,
    scriptFile: string,
    className: string,
    RuntimeConstructor: new (node: TransformNode) => ModelPackageRuntimeInstance
  ): ModelPackageRuntimeHandle | null {
    const current = this.modelPackageRuntimeHandles.get(root.uniqueId);
    if (current && current.scriptFile === scriptFile && current.className === className && current.packageId === packageId) {
      return current;
    }

    if (current) {
      this.stopModelPackageRuntime(root, false);
    }

    try {
      const handle: ModelPackageRuntimeHandle = {
        root,
        packageId,
        scriptFile,
        className,
        instance: new RuntimeConstructor(root),
        started: false
      };
      this.modelPackageRuntimeHandles.set(root.uniqueId, handle);
      return handle;
    } catch (error) {
      this.setModelPackageRuntimeWarning(root, `${scriptFile} 运行类实例化失败：${this.formatRuntimeError(error)}`);
      return null;
    }
  }

  /** 停止单个模型包运行器，保存和克隆前会用它恢复基线并清理运行时生成节点。 */
  private stopModelPackageRuntime(
    root: TransformNode,
    keepHandleForRestart: boolean,
    options: ModelPackageRuntimeStopOptions = {}
  ): void {
    const handle = this.modelPackageRuntimeHandles.get(root.uniqueId);
    if (!handle) {
      return;
    }

    const manifest = this.getModelPackageAssetForRoot(root)?.modelPackage;
    const values = manifest ? this.getModelPackageValues(root, manifest) : this.getRawModelPackageValues(root);
    if (manifest) {
      this.persistModelPackageValues(root, values);
      this.syncModelPackageScriptMetadata(root, manifest, values);
    }
    this.assignModelPackageRuntimeValues(handle.instance, values, manifest?.dynamicFields);
    const warning = this.runModelPackageLifecycleWithEditableStateGuard(
      root,
      manifest,
      values,
      "stop",
      () => invokeModelPackageRuntimeLifecycle(handle.instance, "onStop", handle.scriptFile),
      options.preserveParametricRootScaling === true
    );
    if (warning) {
      this.setModelPackageRuntimeWarning(root, warning);
    }
    this.disposeGeneratedModelPackageRuntimeNodes(root);
    handle.started = false;
    this.refreshNodeWorldMatrices(root);

    if (!keepHandleForRestart) {
      this.modelPackageRuntimeHandles.delete(root.uniqueId);
    }
  }

  /** 停止所有模型包运行器，保存场景时清理运行时生成内容，销毁场景时直接释放句柄。 */
  private stopAllModelPackageRuntimes(
    keepHandlesForRestart: boolean,
    options: ModelPackageRuntimeStopOptions = {}
  ): void {
    [...this.modelPackageRuntimeHandles.values()].forEach((handle) =>
      this.stopModelPackageRuntime(handle.root, keepHandlesForRestart, options)
    );
    if (!keepHandlesForRestart) {
      this.modelPackageRuntimeHandles.clear();
    }
  }

  /** 包住模型包生命周期调用，避免保存时 onStop/onStart 把用户编辑的根节点状态和参数还原。 */
  private runModelPackageLifecycleWithEditableStateGuard(
    root: TransformNode,
    manifest: ModelPackageManifest | undefined,
    values: Record<string, DynamicParameterValue>,
    mode: "apply" | "stop",
    action: () => string | undefined,
    preserveParametricRootScaling = false
  ): string | undefined {
    const editableState = this.captureModelPackageEditableState(root, values);
    const temporaryMetadataFlags = this.markNonRenderableRuntimeBoundsNodes(root);
    let warning: string | undefined;
    try {
      this.normalizeModelPackageRootForLifecycle(root);
      if (manifest && this.isOpaqueRollerConveyorPackage(root)) {
        this.ensureOpaqueRollerConveyorBaseline(root);
      }
      if (manifest && this.isOpaqueChainConveyorPackage(root)) {
        this.ensureOpaqueChainConveyorBaseline(root);
      }
      warning = action();
      if (mode === "stop") {
        // 序列化保存时保留参数缩放，重新加载才不会把它误判为用户手动缩放。
        if (!preserveParametricRootScaling) {
          editableState.parametricRootScaling = this.createDefaultParametricRootScaling();
        }
      } else if (!warning) {
        editableState.parametricRootScaling =
          this.normalizeModelPackageParametricRootScaling(root.scaling);
      }
      return warning;
    } finally {
      this.restoreTemporaryRuntimeMetadataFlags(temporaryMetadataFlags);
      this.restoreModelPackageEditableState(root, editableState);
      if (manifest) {
        this.syncModelPackageScriptMetadata(root, manifest, editableState.values);
      }
      this.refreshNodeWorldMatrices(root);
    }
  }

  /** 临时把模型根节点归一到局部基准状态，让参数脚本按模型自身坐标轴计算几何。 */
  private normalizeModelPackageRootForLifecycle(root: TransformNode): void {
    root.position.set(0, 0, 0);
    root.rotationQuaternion = null;
    root.rotation.set(0, 0, 0);
    root.scaling.set(1, 1, 1);
    this.refreshNodeWorldMatrices(root);
  }

  /** 临时隐藏 0 顶点 GLB 包装 mesh，避免模型包脚本把它当作有效包围盒参与参数化计算。 */
  private markNonRenderableRuntimeBoundsNodes(root: TransformNode): ModelPackageRuntimeTemporaryMetadataFlag[] {
    const markers: ModelPackageRuntimeTemporaryMetadataFlag[] = [];
    this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode)
      .filter((node): node is AbstractMesh => node instanceof AbstractMesh && node.getTotalVertices() <= 0)
      .forEach((node) => {
        const metadata = this.asMetadataObject(node.metadata);
        if (metadata.generatedByParametricRuntime === true) {
          return;
        }

        markers.push({
          node,
          hadGeneratedFlag: Object.prototype.hasOwnProperty.call(metadata, "generatedByParametricRuntime"),
          generatedFlagValue: metadata.generatedByParametricRuntime
        });
        node.metadata = {
          ...metadata,
          generatedByParametricRuntime: true
        };
      });
    return markers;
  }

  /** 恢复 runtime 生命周期期间临时写入的 metadata，避免临时标记进入保存、克隆和清理逻辑。 */
  private restoreTemporaryRuntimeMetadataFlags(markers: ModelPackageRuntimeTemporaryMetadataFlag[]): void {
    markers.forEach((marker) => {
      if (marker.node.isDisposed()) {
        return;
      }

      const metadata = { ...this.asMetadataObject(marker.node.metadata) };
      if (marker.hadGeneratedFlag) {
        metadata.generatedByParametricRuntime = marker.generatedFlagValue;
      } else {
        delete metadata.generatedByParametricRuntime;
      }
      marker.node.metadata = metadata;
    });
  }

  /** 捕获模型包根节点用户可编辑状态，供运行脚本生命周期结束后恢复。 */
  private captureModelPackageEditableState(
    root: TransformNode,
    values: Record<string, DynamicParameterValue>
  ): ModelPackageEditableStateSnapshot {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const modelPackageInstance = this.deepCloneMetadata(editorMetadata.modelPackageInstance);
    const parametricRootScaling = this.getModelPackageParametricRootScaling(root);
    return {
      name: root.name,
      position: root.position.clone(),
      rotation: root.rotation.clone(),
      rotationQuaternion: root.rotationQuaternion?.clone() ?? null,
      scaling: this.divideVectorComponents(root.scaling, parametricRootScaling),
      parametricRootScaling,
      modelPackageInstance,
      values: this.cloneDynamicParameterValues(values)
    };
  }

  /** 恢复模型包根节点状态，只回写权威动态参数，不干扰运行时告警等其它 editor metadata。 */
  private restoreModelPackageEditableState(root: TransformNode, snapshot: ModelPackageEditableStateSnapshot): void {
    root.name = snapshot.name;
    root.position.copyFrom(snapshot.position);
    root.rotation.copyFrom(snapshot.rotation);
    root.rotationQuaternion = snapshot.rotationQuaternion?.clone() ?? null;
    root.scaling.copyFrom(this.multiplyVectorComponents(snapshot.scaling, snapshot.parametricRootScaling));
    this.mergeNodeEditorMetadata(root, {
      modelPackageInstance: {
        ...snapshot.modelPackageInstance,
        values: this.cloneDynamicParameterValues(snapshot.values)
      },
      modelPackageRuntime: {
        ...this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime),
        parametricRootScaling: snapshotVector(snapshot.parametricRootScaling)
      }
    });
  }

  /** 读取上一次 runtime 写入的根节点参数化缩放，旧场景没有记录时按无参数化缩放处理。 */
  private getModelPackageParametricRootScaling(root: TransformNode): Vector3 {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    const scaling = this.asMetadataObject(runtimeMetadata.parametricRootScaling);
    return new Vector3(
      this.normalizeModelPackageScaleComponent(scaling.x),
      this.normalizeModelPackageScaleComponent(scaling.y),
      this.normalizeModelPackageScaleComponent(scaling.z)
    );
  }

  /** 创建默认参数化缩放，表示 runtime 暂未改变根节点尺寸。 */
  private createDefaultParametricRootScaling(): Vector3 {
    return new Vector3(1, 1, 1);
  }

  /** 收敛 runtime 本次算出的根节点缩放，避免异常脚本把非法值写入 metadata。 */
  private normalizeModelPackageParametricRootScaling(scaling: Vector3): Vector3 {
    return new Vector3(
      this.normalizeModelPackageScaleComponent(scaling.x),
      this.normalizeModelPackageScaleComponent(scaling.y),
      this.normalizeModelPackageScaleComponent(scaling.z)
    );
  }

  /** 归一化单个缩放分量，过小或非法时回退到 1，避免后续拆分用户缩放时除零。 */
  private normalizeModelPackageScaleComponent(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && Math.abs(numberValue) > MODEL_PACKAGE_PARAMETRIC_SCALE_EPSILON ? numberValue : 1;
  }

  /** 按分量相除，用于从最终根缩放中扣除参数化缩放，得到用户编辑缩放。 */
  private divideVectorComponents(left: Vector3, right: Vector3): Vector3 {
    return new Vector3(
      left.x / this.normalizeModelPackageScaleComponent(right.x),
      left.y / this.normalizeModelPackageScaleComponent(right.y),
      left.z / this.normalizeModelPackageScaleComponent(right.z)
    );
  }

  /** 按分量相乘，用于把用户缩放和 runtime 参数化缩放合成最终视口缩放。 */
  private multiplyVectorComponents(left: Vector3, right: Vector3): Vector3 {
    return new Vector3(left.x * right.x, left.y * right.y, left.z * right.z);
  }

  /** 同步脚本读取的 metadata.scripts[]，桥接编辑器内部参数存储和模型包运行脚本契约。 */
  private syncModelPackageScriptMetadata(
    root: TransformNode,
    manifest: ModelPackageManifest,
    values: Record<string, DynamicParameterValue>
  ): void {
    const metadata = this.asMetadataObject(root.metadata);
    const existingScripts = Array.isArray(metadata.scripts) ? metadata.scripts : [];
    const parameterClassName = "ParametricModelParamsComponent";
    const runtimeClassName = manifest.runtimeClassName ?? DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS;
    const managedClassNames = new Set([parameterClassName, runtimeClassName]);
    const unmanagedScripts = existingScripts.filter((script) => {
      const scriptRecord = this.asMetadataObject(script);
      const className = String(scriptRecord.className ?? scriptRecord.name ?? "");
      return !managedClassNames.has(className);
    });
    const parameterScriptFile = manifest.scriptFile ?? manifest.runtimeScriptFile;
    const runtimeScriptFile = manifest.runtimeScriptFile ?? manifest.scriptFile;
    const scripts: Record<string, unknown>[] = [
      ...unmanagedScripts.map((script) => this.deepCloneMetadata(script)),
      {
        scriptFilename: parameterScriptFile,
        className: parameterClassName,
        fields: manifest.dynamicFields.map((field) => ({
          key: field.key,
          propertyKey: field.key,
          label: field.label,
          type: field.kind,
          defaultValue: field.defaultValue,
          unit: field.unit,
          physicalKind: field.physicalKind,
          configuration: {
            type: field.kind,
            unit: field.unit,
            physicalKind: field.physicalKind,
            min: field.min,
            max: field.max,
            step: field.step
          }
        })),
        values: this.cloneDynamicParameterValues(values)
      }
    ];

    if (runtimeScriptFile) {
      scripts.push({
        scriptFilename: runtimeScriptFile,
        className: runtimeClassName,
        values: this.cloneDynamicParameterValues(values)
      });
    }

    root.metadata = {
      ...metadata,
      scripts
    };
  }

  /** 读取并归一化模型包实例当前值，缺失字段回退 manifest 默认值，旧包装值返回为裸值。 */
  private getModelPackageValues(root: TransformNode, manifest: ModelPackageManifest): Record<string, DynamicParameterValue> {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    return {
      ...this.createInitialDynamicParameterValues(manifest),
      ...this.normalizeDynamicParameterValueMap(this.asMetadataObject(instance.values), manifest.dynamicFields, true)
    } as Record<string, DynamicParameterValue>;
  }

  /** 将模型包参数按裸值字典写回 metadata.editor，作为场景保存和脚本同步的权威来源。 */
  private persistModelPackageValues(root: TransformNode, values: Record<string, DynamicParameterValue>): void {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    this.mergeNodeEditorMetadata(root, {
      modelPackageInstance: {
        ...instance,
        values: this.cloneDynamicParameterValues(values)
      }
    });
  }

  /** 在缺少资产 manifest 时读取原始模型包参数，用于停止运行脚本时兜底保护用户输入。 */
  private getRawModelPackageValues(root: TransformNode): Record<string, DynamicParameterValue> {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    return this.normalizeUntypedDynamicParameterValueMap(this.asMetadataObject(instance.values));
  }

  /** 按字段定义批量归一化动态参数，兼容旧场景中的 { value } 包装结构。 */
  private normalizeDynamicParameterValueMap(
    rawValues: Record<string, unknown>,
    fields: DynamicInspectorField[],
    includeUnknown: boolean
  ): Record<string, DynamicParameterValue> {
    const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
    return Object.entries(rawValues).reduce<Record<string, DynamicParameterValue>>((output, [key, rawValue]) => {
      const field = fieldsByKey.get(key);
      const value = field
        ? this.normalizeDynamicParameterValueForField(field, rawValue)
        : includeUnknown
          ? this.normalizeUntypedDynamicParameterValue(rawValue)
          : undefined;
      if (value !== undefined) {
        output[key] = value;
      }
      return output;
    }, {});
  }

  /** 未拿到 manifest 时按安全标量规则归一化旧参数值。 */
  private normalizeUntypedDynamicParameterValueMap(rawValues: Record<string, unknown>): Record<string, DynamicParameterValue> {
    return Object.entries(rawValues).reduce<Record<string, DynamicParameterValue>>((output, [key, rawValue]) => {
      const value = this.normalizeUntypedDynamicParameterValue(rawValue);
      if (value !== undefined) {
        output[key] = value;
      }
      return output;
    }, {});
  }

  /** 根据字段类型归一化单个动态参数值。 */
  private normalizeDynamicParameterValueForField(field: DynamicInspectorField, value: unknown): DynamicParameterValue | undefined {
    const unwrapped = this.unwrapDynamicParameterValue(value);
    if (field.kind === "number") {
      return this.normalizeNumberDynamicParameterValue(unwrapped);
    }

    if (field.kind === "string") {
      return typeof unwrapped === "string" ? unwrapped : undefined;
    }

    if (field.kind === "boolean") {
      return this.normalizeBooleanDynamicParameterValue(unwrapped);
    }

    if (field.kind === "color3") {
      return this.normalizeColor3DynamicParameterValue(unwrapped);
    }

    return undefined;
  }

  /** 在没有字段定义时只保留可安全序列化的动态参数值。 */
  private normalizeUntypedDynamicParameterValue(value: unknown): DynamicParameterValue | undefined {
    const unwrapped = this.unwrapDynamicParameterValue(value);
    if (typeof unwrapped === "number") {
      return Number.isFinite(unwrapped) ? unwrapped : undefined;
    }
    if (typeof unwrapped === "string" || typeof unwrapped === "boolean") {
      return unwrapped;
    }
    return this.normalizeColor3DynamicParameterValue(unwrapped);
  }

  /** 从 meta 或旧场景包装对象中拆出真实参数值。 */
  private unwrapDynamicParameterValue(value: unknown): unknown {
    const record = this.asMetadataObject(value);
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (Object.prototype.hasOwnProperty.call(record, "value") ||
        Object.prototype.hasOwnProperty.call(record, "currentValue") ||
        Object.prototype.hasOwnProperty.call(record, "defaultValue"))
    ) {
      return record.value ?? record.currentValue ?? record.defaultValue;
    }
    return value;
  }

  /** 归一化数字动态参数，兼容旧场景保存为字符串数字的情况。 */
  private normalizeNumberDynamicParameterValue(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return undefined;
  }

  /** 归一化布尔动态参数，兼容旧场景保存为 true/false 字符串的情况。 */
  private normalizeBooleanDynamicParameterValue(value: unknown): boolean | undefined {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string" && ["true", "false"].includes(value.trim().toLowerCase())) {
      return value.trim().toLowerCase() === "true";
    }
    return undefined;
  }

  /** 归一化 Color3 动态参数，保持 0-1 颜色快照可序列化。 */
  private normalizeColor3DynamicParameterValue(value: unknown): DynamicParameterValue | undefined {
    const color = this.asMetadataObject(value);
    if ([color.r, color.g, color.b].every((component) => typeof component === "number" && Number.isFinite(component))) {
      return {
        r: Number(color.r),
        g: Number(color.g),
        b: Number(color.b)
      };
    }
    return undefined;
  }

  /** 读取数字参数值，用于旧实例兜底逻辑兼容包装值。 */
  private readDynamicNumberParameter(value: unknown): number | undefined {
    return this.normalizeNumberDynamicParameterValue(this.unwrapDynamicParameterValue(value));
  }

  /** 读取布尔参数值，用于旧实例兜底逻辑兼容包装值和字符串布尔值。 */
  private readDynamicBooleanParameter(value: unknown): boolean | undefined {
    return this.normalizeBooleanDynamicParameterValue(this.unwrapDynamicParameterValue(value));
  }

  /** 把动态参数注入运行脚本实例，兼容脚本通过 this.xxx 读取参数的写法。 */
  private assignModelPackageRuntimeValues(
    instance: ModelPackageRuntimeInstance,
    values: Record<string, DynamicParameterValue>,
    fields?: DynamicInspectorField[]
  ): void {
    const target = instance as Record<string, unknown>;
    const fieldsByKey = new Map((fields ?? []).map((field) => [field.key, field]));
    Object.entries(values).forEach(([key, value]) => {
      target[key] = this.cloneDynamicParameterValueForRuntime(value, fieldsByKey.get(key));
    });
  }

  /** 克隆动态参数字典，避免运行脚本修改 metadata.scripts[].values 时污染权威参数。 */
  private cloneDynamicParameterValues(values: Record<string, DynamicParameterValue>): Record<string, DynamicParameterValue> {
    return Object.entries(values).reduce<Record<string, DynamicParameterValue>>((output, [key, value]) => {
      output[key] = this.cloneDynamicParameterValue(value);
      return output;
    }, {});
  }

  /** 克隆单个动态参数值，颜色对象按普通 metadata 深拷贝，标量直接复用。 */
  private cloneDynamicParameterValue(value: DynamicParameterValue): DynamicParameterValue {
    if (value && typeof value === "object") {
      return this.deepCloneMetadata(value) as unknown as DynamicParameterValue;
    }

    return value;
  }

  /** 克隆注入运行脚本实例的参数值，颜色字段转为 Babylon Color3 以兼容 this.xxx 用法。 */
  private cloneDynamicParameterValueForRuntime(value: DynamicParameterValue, field?: DynamicInspectorField): unknown {
    if ((field?.kind === "color3" || (!field && this.isColor3ParameterValue(value))) && this.isColor3ParameterValue(value)) {
      const color = this.asMetadataObject(value);
      return new Color3(Number(color.r), Number(color.g), Number(color.b));
    }

    return this.cloneDynamicParameterValue(value);
  }

  /** 根据根节点 metadata 找到对应资产记录。 */
  private getModelPackageAssetForRoot(root: TransformNode): AssetRecord | undefined {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    const assetId = typeof instance.assetId === "string" ? instance.assetId : "";
    const packageId = typeof instance.packageId === "string" ? instance.packageId : "";
    return this.assets.find((item) => item.id === assetId && item.modelPackage?.packageId === packageId);
  }

  /** 读取模型包声明的数据驱动语义，旧资产没有该字段时返回 undefined。 */
  private getModelDataDrivenDefinition(root: TransformNode): ModelDataDrivenDefinition | undefined {
    return this.getModelPackageAssetForRoot(root)?.modelPackage?.dataDriven;
  }

  /** 收集场景内所有带模型包实例 metadata 的根节点。 */
  private getSceneModelPackageRoots(): TransformNode[] {
    const roots = new Map<number, TransformNode>();
    const candidates = [...this.scene.rootNodes, ...this.scene.transformNodes, ...this.scene.meshes];
    candidates.forEach((node) => {
      if (!(node instanceof TransformNode) || node.metadata?.[HELPER_FLAG]) {
        return;
      }

      const packageRoot = this.findModelPackageRoot(node);
      if (packageRoot && !packageRoot.metadata?.[HELPER_FLAG]) {
        roots.set(packageRoot.uniqueId, packageRoot);
      }
    });
    return [...roots.values()];
  }

  /** 从注册表读取已复制进项目的模型包脚本文本。 */
  private getModelPackageScriptText(packageId: string, scriptFile: string): string | undefined {
    return this.modelPackageScriptTexts.get(packageId)?.get(this.normalizeModelPackageRelativePath(scriptFile));
  }

  /** 规范化模型包内部相对路径，兼容 meta 中的 ./ 前缀和 Windows 反斜杠。 */
  private normalizeModelPackageRelativePath(filePath: string): string {
    return filePath.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  }

  /** 统计运行脚本生成节点数量，用硬上限防止阵列参数或脚本异常导致场景膨胀。 */
  private countGeneratedModelPackageRuntimeNodes(root: TransformNode): number {
    return this.getNodeHierarchy(root).filter((node) => Boolean(this.asMetadataObject(node.metadata).generatedByParametricRuntime)).length;
  }

  /** 兜底清理运行脚本标记的生成节点，避免 onStop 缺失时保存进场景。 */
  private disposeGeneratedModelPackageRuntimeNodes(root: TransformNode): void {
    const generatedNodes = this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root)
      .filter((node) => Boolean(this.asMetadataObject(node.metadata).generatedByParametricRuntime));
    const materials = new Set<Material>();
    generatedNodes.forEach((node) => {
      const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
      meshes.forEach((mesh) => this.collectMaterialTree(mesh.material, materials));
    });
    generatedNodes.forEach((node) => node.dispose(false, false));
    this.disposeUnusedMaterials(materials);
  }

  /** 写入最近一次模型包运行告警，属性栏会随选中快照显示。 */
  private setModelPackageRuntimeWarning(root: TransformNode, warning: string): void {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const runtimeMetadata = this.asMetadataObject(editorMetadata.modelPackageRuntime);
    this.mergeNodeEditorMetadata(root, {
      modelPackageRuntime: {
        ...runtimeMetadata,
        warning
      }
    });
    if (warning.trim()) {
      console.warn(warning);
    }
  }

  /** 读取最近一次模型包运行告警。 */
  private getModelPackageRuntimeWarning(root: TransformNode): string | undefined {
    const runtimeMetadata = this.asMetadataObject(this.getNodeEditorMetadata(root).modelPackageRuntime);
    const warning = typeof runtimeMetadata.warning === "string" ? runtimeMetadata.warning.trim() : "";
    return warning || undefined;
  }

  /** 统一格式化运行时异常，避免把复杂对象直接写进 metadata。 */
  private formatRuntimeError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    if (typeof error === "string" && error.trim()) {
      return error;
    }

    return "未知错误";
  }

  /** 校验动态参数值是否匹配字段类型，避免损坏数据写入 metadata。 */
  private isDynamicParameterValueCompatible(field: DynamicInspectorField, value: DynamicParameterValue): boolean {
    return this.normalizeDynamicParameterValueForField(field, value) !== undefined;
  }

  /** 判断动态参数是否是可序列化 Color3 值。 */
  private isColor3ParameterValue(value: DynamicParameterValue): boolean {
    const color = this.asMetadataObject(value);
    return [color.r, color.g, color.b].every((component) => typeof component === "number" && Number.isFinite(component));
  }

  /** 合并写回 node.metadata.editor，保留已有单位、资产和运行时 metadata。 */
  private mergeNodeEditorMetadata(node: Node, editorPatch: Record<string, unknown>): void {
    const metadata = this.asMetadataObject(node.metadata);
    const editorMetadata = this.asMetadataObject(metadata.editor);
    node.metadata = {
      ...metadata,
      editor: {
        ...editorMetadata,
        ...editorPatch
      }
    };
    this.markScenePerformanceCachesDirty();
  }

  /** 读取节点可见性，导入模型根节点会以任一子网格可见作为可见状态。 */
  private getNodeVisibility(node: TransformNode): boolean {
    const meshes = this.getEditableMeshes(node);
    if (meshes.length === 0) {
      return true;
    }

    return meshes.some((mesh) => mesh.isVisible);
  }

  /** 批量更新节点可见性，导入模型根节点会同步影响所有子网格。 */
  private updateNodeVisibility(node: TransformNode, visible: boolean): void {
    const meshes = this.getEditableMeshes(node);
    if (meshes.length === 0 && node instanceof AbstractMesh) {
      node.isVisible = visible;
      return;
    }

    meshes.forEach((mesh) => {
      mesh.isVisible = visible;
    });
  }

  /** 读取节点材质颜色，支持导入模型根节点从第一个有材质的子网格取色。 */
  private getNodeMaterialColor(node: TransformNode): string | undefined {
    const mesh = this.getEditableMeshes(node).find((item) => item.material instanceof StandardMaterial || item.material instanceof PBRMaterial);
    return mesh ? this.getMaterialColor(mesh) : undefined;
  }

  /** 读取单个网格材质颜色，支持标准材质和 PBR 材质。 */
  private getMaterialColor(mesh: AbstractMesh): string | undefined {
    if (mesh.material instanceof StandardMaterial) {
      return mesh.material.diffuseColor.toHexString();
    }

    if (mesh.material instanceof PBRMaterial) {
      return mesh.material.albedoColor.toHexString();
    }

    return undefined;
  }

  /** 批量更新节点材质颜色，导入模型根节点会同步影响所有子网格。 */
  private updateNodeMaterialColor(node: TransformNode, color: string): void {
    this.getEditableMeshes(node).forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof PBRMaterial) {
        material.albedoColor = Color3.FromHexString(color);
        return;
      }

      this.ensureEditableMaterial(mesh).diffuseColor = Color3.FromHexString(color);
    });
  }

  /** 重新构建层级树数据，并过滤编辑器辅助对象。 */
  private refreshSceneGraph(sceneContentChanged = true): void {
    if (sceneContentChanged) {
      this.markScenePerformanceCachesDirty();
    }
    const nodes: SceneNodeSummary[] = [];
    const roots = this.scene.rootNodes.filter((node) => !node.metadata?.[HELPER_FLAG]);
    roots.forEach((node) => this.pushSceneNodeSummary(nodes, node, 0));
    this.callbacks.onSceneGraphChange(nodes);
  }

  /** 场景结构或业务 metadata 变化后清理派生缓存，下一帧按最新内容重建。 */
  private markScenePerformanceCachesDirty(): void {
    this.sceneContentStatsCache = null;
    this.scenePoiNodesCache = null;
    this.editableRuntimeRootsCache = null;
    this.dataDrivenTargetsCache = null;
    this.dataDrivenDropTargetsCache = null;
  }

  /** 将可展示节点递归压入层级列表，导入模型内部节点仍保持折叠为单个模型。 */
  private pushSceneNodeSummary(output: SceneNodeSummary[], node: Node, depth: number, parentId?: number): void {
    if (node.metadata?.[HELPER_FLAG]) {
      return;
    }

    const displayable = this.isSceneGraphDisplayNode(node);
    const childNodes = this.getVisibleChildren(node).filter((child) => this.isSceneGraphDisplayNode(child));
    if (displayable) {
      const selfLocked = this.isNodeSelfLocked(node);
      const lockedByAncestor = this.isNodeLockedByAncestor(node);
      output.push({
        id: node.uniqueId,
        parentId,
        name: node.name,
        kind: this.getNodeKind(node),
        depth,
        selected: this.selectedNodeIds.has(node.uniqueId),
        primarySelected: this.selectedNode?.uniqueId === node.uniqueId,
        visible: node instanceof TransformNode ? this.getNodeVisibility(node) : node.isEnabled(),
        hasChildren: childNodes.length > 0,
        childCount: childNodes.length,
        selfLocked,
        locked: selfLocked || lockedByAncestor,
        lockedByAncestor
      });

      if (this.isEditorGroup(node)) {
        childNodes.forEach((child) => this.pushSceneNodeSummary(output, child, depth + 1, node.uniqueId));
      }
      return;
    }

    this.getVisibleChildren(node).forEach((child) => this.pushSceneNodeSummary(output, child, depth, parentId));
  }

  /** 获取层级树可展示的子节点，兼容不同 Babylon Node 类型。 */
  private getVisibleChildren(node: Node): Node[] {
    return this.getSceneChildren(node, false);
  }

  /** 判断节点是否应该作为左侧树节点展示，避免展开导入模型内部 TransformNode。 */
  private isSceneGraphDisplayNode(node: Node): boolean {
    if (node.metadata?.isPoiRuntimeGenerated || node.metadata?.isDataDrivenRuntimeGenerated) {
      return false;
    }

    return this.isEditorGroup(node) || node.metadata?.[ROOT_FLAG] === true || node.parent === null;
  }

  /** 获取 Babylon 场景中指定节点的直接子节点，可选择是否包含编辑器 helper。 */
  private getSceneChildren(node: Node, includeHelpers: boolean): Node[] {
    const seen = new Set<number>();
    const candidates: Node[] = [...this.scene.transformNodes, ...this.scene.meshes, ...this.scene.lights, ...this.scene.cameras];
    return candidates.filter((child) => {
      if (child.parent !== node || (!includeHelpers && child.metadata?.[HELPER_FLAG]) || seen.has(child.uniqueId)) {
        return false;
      }

      seen.add(child.uniqueId);
      return true;
    });
  }

  /** 判断节点是否属于 CAD 图纸根节点或其派生 primitive，避免选中态和颜色编辑破坏原 CAD 配色。 */
  private isCadDrawingNode(node: Node | null | undefined): boolean {
    let current: Node | null | undefined = node;
    while (current) {
      if (current.metadata?.cadDrawing || current.metadata?.cadPrimitive) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /** 判断节点是否是定位线框立方体，避免把视觉定位框当作业务模型处理。 */
  private isLocatorWireCubeNode(node: Node | null | undefined): boolean {
    let current: Node | null | undefined = node;
    while (current) {
      if (current.metadata?.primitive === "locatorWireCube") {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /** 判断节点类别，供层级树和属性面板显示。 */
  private getNodeKind(node: Node): SceneNodeKind {
    if (node.metadata?.[HELPER_FLAG]) {
      return "Helper";
    }

    if (this.isEditorGroup(node)) {
      return "Group";
    }

    if (node.metadata?.primitive === "light") {
      return "Light";
    }

    if (this.isLocatorWireCubeNode(node)) {
      return "Locator";
    }

    if (this.isPoiNode(node)) {
      return "POI";
    }

    if (node.metadata?.cadDrawing) {
      return "CAD";
    }

    if (node instanceof AbstractMesh) {
      return "Mesh";
    }

    if (node instanceof Light) {
      return "Light";
    }

    if (node instanceof Camera) {
      return "Camera";
    }

    return "Transform";
  }

  /** 汇总当前场景性能指标，便于用户判断编辑器压力。 */
  private collectStats(): EditorStats {
    const sceneContentStats = this.getSceneContentStats();
    const drawCalls = this.sceneInstrumentation.drawCallsCounter.current;
    return {
      fps: Math.round(this.engine.getFps()),
      meshes: sceneContentStats.meshCount,
      activeMeshes: Number((this.scene.getActiveMeshes() as unknown as { length: number }).length ?? 0),
      vertices: sceneContentStats.vertexCount,
      drawCalls: Number.isFinite(drawCalls) ? Math.round(drawCalls) : 0,
      hardwareScalingLevel: Number(this.engine.getHardwareScalingLevel().toFixed(2)),
      renderWidth: this.engine.getRenderWidth(true),
      renderHeight: this.engine.getRenderHeight(true),
      gpuVendor: this.gpuVendor,
      gpuRenderer: this.gpuRenderer,
      webGLVersion: this.getWebGlVersion(),
      maxTextureSize: this.getMaxTextureSize(),
      renderQualityMode: this.renderQualityMode,
      adaptiveQualityActive: this.adaptiveRenderQualityActive,
      softwareRenderer: this.isSoftwareGpuRenderer(),
      contextLost: this.webglContextLost
    };
  }

  /** 计算并缓存结构性场景规模，避免状态栏刷新时反复遍历全部 mesh 和顶点。 */
  private getSceneContentStats(): SceneContentStatsCache {
    if (this.sceneContentStatsCache) {
      return this.sceneContentStatsCache;
    }

    const meshes = this.scene.meshes.filter((mesh) => !mesh.metadata?.[HELPER_FLAG]);
    this.sceneContentStatsCache = {
      meshCount: meshes.length,
      vertexCount: meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0)
    };
    return this.sceneContentStatsCache;
  }

  /** 创建右侧属性面板需要的场景级快照，缺失 metadata 时回退默认配置。 */
  private createSceneInspectorSnapshot(): SceneInspectorSnapshot {
    const editorMetadata = this.getSceneEditorMetadata();
    const sceneEnvironment = this.asMetadataObject(editorMetadata.sceneEnvironment);
    const sceneCamera = this.asMetadataObject(editorMetadata.sceneCamera);
    const sceneEditorSettings = this.asMetadataObject(editorMetadata.sceneEditorSettings);
    const sceneDataDriven = this.asMetadataObject(editorMetadata.sceneDataDriven);

    return {
      name: "场景",
      camera: {
        visibleDistance: this.normalizePositiveNumber(sceneCamera.visibleDistance, this.editorCamera.maxZ)
      },
      editorSettings: this.normalizeSceneEditorSettings(sceneEditorSettings),
      environment: {
        backgroundColor: this.normalizeHexColor(sceneEnvironment.backgroundColor) ?? this.getSceneEnvironmentColor()
      },
      dataDriven: this.normalizeSceneDataDriven(sceneDataDriven)
    };
  }

  /** 读取场景 metadata.editor，统一兼容旧场景中的空 metadata。 */
  private getSceneEditorMetadata(): Record<string, unknown> {
    return this.asMetadataObject(this.asMetadataObject(this.scene.metadata).editor);
  }

  /** 应用场景相机配置，当前只影响编辑视口远裁剪和缩放上限。 */
  private applySceneCameraSettings(camera: SceneInspectorSnapshot["camera"]): void {
    const visibleDistance = this.normalizePositiveNumber(camera.visibleDistance, DEFAULT_CAMERA_FAR_CLIP_METERS);
    this.editorCamera.maxZ = visibleDistance;
    this.editorCamera.upperRadiusLimit = visibleDistance;
  }

  /** 应用编辑器设置，默认值 10 对应当前相机手感，数值越大操作越灵敏。 */
  private applySceneEditorSettings(settings: SceneEditorSettingsSnapshot): void {
    const normalizedSettings = this.normalizeSceneEditorSettings({
      zoomSensitivity: settings.zoomSensitivity,
      moveSensitivity: settings.moveSensitivity,
      rotateSensitivity: settings.rotateSensitivity
    });
    this.editorCamera.wheelPrecision = this.mapSceneSensitivityToCameraSensibility(
      normalizedSettings.zoomSensitivity,
      DEFAULT_CAMERA_WHEEL_PRECISION
    );
    this.editorCamera.panningSensibility = this.mapSceneSensitivityToCameraSensibility(
      normalizedSettings.moveSensitivity,
      DEFAULT_CAMERA_PANNING_SENSIBILITY
    );
    const rotationSensibility = this.mapSceneSensitivityToCameraSensibility(
      normalizedSettings.rotateSensitivity,
      DEFAULT_CAMERA_ROTATION_SENSIBILITY
    );
    this.editorCamera.angularSensibilityX = rotationSensibility;
    this.editorCamera.angularSensibilityY = rotationSensibility;
  }

  /** 把未知数字收敛为正有限值，避免非法 metadata 进入面板或相机参数。 */
  private normalizePositiveNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  /** 将面板灵敏度映射为 Babylon 相机 sensibility，保持默认 10 不改变既有手感。 */
  private mapSceneSensitivityToCameraSensibility(sensitivity: number, defaultSensibility: number): number {
    const normalizedSensitivity = this.normalizePositiveNumber(sensitivity, DEFAULT_SCENE_EDITOR_SETTINGS.zoomSensitivity);
    const nextValue = (defaultSensibility * DEFAULT_SCENE_EDITOR_SETTINGS.zoomSensitivity) / normalizedSensitivity;
    return Math.min(MAX_CAMERA_INPUT_SENSIBILITY, Math.max(MIN_CAMERA_INPUT_SENSIBILITY, nextValue));
  }

  /** 把场景编辑器设置收敛为可编辑数字，非法值回退默认值。 */
  private normalizeSceneEditorSettings(value: Record<string, unknown>): SceneEditorSettingsSnapshot {
    return {
      zoomSensitivity: this.normalizePositiveNumber(value.zoomSensitivity, DEFAULT_SCENE_EDITOR_SETTINGS.zoomSensitivity),
      moveSensitivity: this.normalizePositiveNumber(value.moveSensitivity, DEFAULT_SCENE_EDITOR_SETTINGS.moveSensitivity),
      rotateSensitivity: this.normalizePositiveNumber(value.rotateSensitivity, DEFAULT_SCENE_EDITOR_SETTINGS.rotateSensitivity)
    };
  }

  /** 把场景数据驱动配置收敛为稳定快照，非法字段会回退默认值。 */
  private normalizeSceneDataDriven(value: Record<string, unknown>): SceneDataDrivenSnapshot {
    return {
      dataDrivenMode: this.getStringMetadata(value.dataDrivenMode, DEFAULT_SCENE_DATA_DRIVEN.dataDrivenMode),
      defaultGenerator: this.getStringMetadata(value.defaultGenerator, DEFAULT_SCENE_DATA_DRIVEN.defaultGenerator),
      devicePropertyInitialization: this.getStringMetadata(
        value.devicePropertyInitialization,
        DEFAULT_SCENE_DATA_DRIVEN.devicePropertyInitialization
      ),
      robotArmDriveMode: this.getStringMetadata(value.robotArmDriveMode, DEFAULT_SCENE_DATA_DRIVEN.robotArmDriveMode),
      boxLineGenerator: this.getStringMetadata(value.boxLineGenerator, DEFAULT_SCENE_DATA_DRIVEN.boxLineGenerator),
      size: this.getNumberMetadata(value.size, DEFAULT_SCENE_DATA_DRIVEN.size),
      dataConnectionEnabled: this.getBooleanMetadata(value.dataConnectionEnabled, DEFAULT_SCENE_DATA_DRIVEN.dataConnectionEnabled),
      dataSourceType: this.normalizeSceneDataSourceType(value.dataSourceType),
      dataEndpoint: this.getStringMetadata(value.dataEndpoint, DEFAULT_SCENE_DATA_DRIVEN.dataEndpoint),
      dataChannel: this.getStringMetadata(value.dataChannel, DEFAULT_SCENE_DATA_DRIVEN.dataChannel),
      deviceIdField: this.getStringMetadata(value.deviceIdField, DEFAULT_SCENE_DATA_DRIVEN.deviceIdField),
      assetCodeField: this.getStringMetadata(value.assetCodeField, DEFAULT_SCENE_DATA_DRIVEN.assetCodeField),
      payloadPath: this.getStringMetadata(value.payloadPath, DEFAULT_SCENE_DATA_DRIVEN.payloadPath),
      interpolationMs: Math.max(0, this.getNumberMetadata(value.interpolationMs, DEFAULT_SCENE_DATA_DRIVEN.interpolationMs)),
      credentialProfileId: this.getStringMetadata(value.credentialProfileId, DEFAULT_SCENE_DATA_DRIVEN.credentialProfileId)
    };
  }

  /** 收敛场景数据源类型，避免旧文件或手写 metadata 写入非法连接类型。 */
  private normalizeSceneDataSourceType(value: unknown): SceneDataSourceType {
    return value === "websocket" || value === "mqtt" || value === "none" ? value : DEFAULT_SCENE_DATA_DRIVEN.dataSourceType;
  }

  /** 从 metadata 中读取字符串，缺失或类型不符时使用默认值。 */
  private getStringMetadata(value: unknown, fallback: string): string {
    return typeof value === "string" ? value : fallback;
  }

  /** 将场景环境色应用到 Babylon 背景、环境光和编辑器元数据。 */
  private applySceneEnvironmentColor(colorHex: string, renderAfterApply = true): void {
    const normalizedColor = this.normalizeHexColor(colorHex) ?? DEFAULT_SCENE_ENVIRONMENT_COLOR;
    const backgroundColor = this.hexToColor3(normalizedColor);
    this.scene.clearColor = new Color4(backgroundColor.r, backgroundColor.g, backgroundColor.b, 1);
    this.scene.ambientColor = this.createAmbientColorFromBackground(backgroundColor);
    this.scene.metadata = this.withMetricSceneMetadata(this.scene.metadata, {
      sceneEnvironment: { backgroundColor: normalizedColor }
    });

    if (renderAfterApply) {
      this.scene.render();
    }
  }

  /** 从背景色派生环境光颜色，避免旧场景把环境光恢复成纯黑导致模型过暗。 */
  private createAmbientColorFromBackground(backgroundColor: Color3): Color3 {
    return new Color3(
      Math.min(1, backgroundColor.r * 0.65 + 0.08),
      Math.min(1, backgroundColor.g * 0.65 + 0.08),
      Math.min(1, backgroundColor.b * 0.65 + 0.08)
    );
  }

  /** 将 #rrggbb 字符串转换为 Babylon Color3。 */
  private hexToColor3(colorHex: string): Color3 {
    const normalizedColor = this.normalizeHexColor(colorHex) ?? DEFAULT_SCENE_ENVIRONMENT_COLOR;
    return new Color3(
      Number.parseInt(normalizedColor.slice(1, 3), 16) / 255,
      Number.parseInt(normalizedColor.slice(3, 5), 16) / 255,
      Number.parseInt(normalizedColor.slice(5, 7), 16) / 255
    );
  }

  /** 把用户输入或元数据里的颜色收敛为标准小写 #rrggbb。 */
  private normalizeHexColor(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const color = value.trim();
    const match = color.match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toLowerCase()}` : null;
  }

  /** 把 Babylon Color4 转成工具栏可显示的 #rrggbb。 */
  private color4ToHex(color: Color4, fallbackColor: string): string {
    return this.colorComponentsToHex(color.r, color.g, color.b) ?? fallbackColor;
  }

  /** 从序列化场景里读取编辑器环境色，兼容旧场景只保存 clearColor 的情况。 */
  private getSerializedSceneEnvironmentColor(serializedScene: Record<string, unknown>): string | null {
    const metadata = this.asMetadataObject(serializedScene.metadata);
    const editorMetadata = this.asMetadataObject(metadata.editor);
    const sceneEnvironment = this.asMetadataObject(editorMetadata.sceneEnvironment);
    const metadataColor = this.normalizeHexColor(sceneEnvironment.backgroundColor);
    if (metadataColor) {
      return metadataColor;
    }

    const serializedColor = this.serializedColorToHex(serializedScene.clearColor);
    return serializedColor === "#000000" ? null : serializedColor;
  }

  /** 读取 Babylon 序列化颜色，支持数组和对象两种常见结构。 */
  private serializedColorToHex(value: unknown): string | null {
    if (Array.isArray(value)) {
      return this.colorComponentsToHex(value[0], value[1], value[2]);
    }

    const color = this.asMetadataObject(value);
    return this.colorComponentsToHex(color.r, color.g, color.b);
  }

  /** 将 0-1 RGB 分量收敛为 #rrggbb，非法值返回空。 */
  private colorComponentsToHex(red: unknown, green: unknown, blue: unknown): string | null {
    if (![red, green, blue].every((component) => typeof component === "number" && Number.isFinite(component))) {
      return null;
    }

    const toHexComponent = (component: unknown) =>
      Math.round(Math.min(1, Math.max(0, component as number)) * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${toHexComponent(red)}${toHexComponent(green)}${toHexComponent(blue)}`;
  }

  /** 返回统一的米制单位元数据，保存和导入模型都使用同一份契约。 */
  private getMetricUnitSystem(): { length: string; babylonUnitInMeters: number } {
    return {
      length: EDITOR_LENGTH_UNIT,
      babylonUnitInMeters: SCENE_UNIT_IN_METERS
    };
  }

  /** 写入场景级米制元数据，确保项目保存和重新打开后单位契约不丢失。 */
  private withMetricSceneMetadata(
    metadata: unknown,
    editorOverrides: {
      savedAt?: string;
      assets?: AssetRecord[];
      sceneEnvironment?: { backgroundColor?: string };
      sceneCamera?: Partial<SceneInspectorSnapshot["camera"]>;
      sceneEditorSettings?: Partial<SceneEditorSettingsSnapshot>;
      sceneDataDriven?: Partial<SceneDataDrivenSnapshot>;
      projectExternalTextures?: ProjectExternalTextureManifest;
      projectTextureSerialization?: Record<string, unknown>;
    } = {}
  ): Record<string, unknown> {
    const baseMetadata = this.asMetadataObject(metadata);
    const editorMetadata = this.asMetadataObject(baseMetadata.editor);
    const sceneEnvironmentMetadata = this.asMetadataObject(editorMetadata.sceneEnvironment);
    const sceneCameraMetadata = this.asMetadataObject(editorMetadata.sceneCamera);
    const sceneEditorSettingsMetadata = this.asMetadataObject(editorMetadata.sceneEditorSettings);
    const sceneDataDrivenMetadata = this.asMetadataObject(editorMetadata.sceneDataDriven);
    const backgroundColor =
      this.normalizeHexColor(editorOverrides.sceneEnvironment?.backgroundColor) ??
      this.normalizeHexColor(sceneEnvironmentMetadata.backgroundColor) ??
      this.getSceneEnvironmentColor();
    const visibleDistance = this.normalizePositiveNumber(
      editorOverrides.sceneCamera?.visibleDistance,
      this.normalizePositiveNumber(sceneCameraMetadata.visibleDistance, this.editorCamera.maxZ)
    );
    const editorSettings = this.normalizeSceneEditorSettings({
      ...sceneEditorSettingsMetadata,
      ...editorOverrides.sceneEditorSettings
    });
    const dataDriven = this.normalizeSceneDataDriven({
      ...sceneDataDrivenMetadata,
      ...editorOverrides.sceneDataDriven
    });
    const nextEditorMetadata: Record<string, unknown> = {
      ...editorMetadata,
      name: "Babylon Unity-like 3D Editor",
      unitSystem: this.getMetricUnitSystem(),
      modelUnitPolicy: IMPORTED_MODEL_UNIT_POLICY,
      sceneEnvironment: {
        ...sceneEnvironmentMetadata,
        backgroundColor
      },
      sceneCamera: {
        ...sceneCameraMetadata,
        visibleDistance
      },
      sceneEditorSettings: {
        ...sceneEditorSettingsMetadata,
        ...editorSettings
      },
      sceneDataDriven: {
        ...sceneDataDrivenMetadata,
        ...dataDriven
      }
    };

    if (editorOverrides.savedAt) {
      nextEditorMetadata.savedAt = editorOverrides.savedAt;
    }

    if (editorOverrides.assets) {
      nextEditorMetadata.assets = editorOverrides.assets;
    }

    if (editorOverrides.projectExternalTextures) {
      nextEditorMetadata.projectExternalTextures = editorOverrides.projectExternalTextures;
    }

    if (editorOverrides.projectTextureSerialization) {
      nextEditorMetadata.projectTextureSerialization = editorOverrides.projectTextureSerialization;
    }

    return {
      ...baseMetadata,
      editor: nextEditorMetadata
    };
  }

  /** 写入模型级米制元数据，导入模型的最终坐标和包围盒都按米解释。 */
  private withMetricModelMetadata(
    metadata: unknown,
    options: MetricModelMetadataOptions | string | undefined = {}
  ): Record<string, unknown> {
    const metadataOptions: MetricModelMetadataOptions = typeof options === "string" ? { sourceFile: options } : options ?? {};
    const baseMetadata = this.asMetadataObject(metadata);
    const editorMetadata = this.asMetadataObject(baseMetadata.editor);
    const sourceUnit =
      metadataOptions.sourceUnit ?? (typeof baseMetadata.sourceUnit === "string" ? baseMetadata.sourceUnit : EDITOR_LENGTH_UNIT);
    const modelUnitPolicy =
      metadataOptions.modelUnitPolicy ??
      (typeof baseMetadata.modelUnitPolicy === "string" ? baseMetadata.modelUnitPolicy : IMPORTED_MODEL_UNIT_POLICY);
    const unitScaleToMeters =
      metadataOptions.unitScaleToMeters ??
      (typeof baseMetadata.unitScaleToMeters === "number" ? baseMetadata.unitScaleToMeters : undefined);
    const nextMetadata: Record<string, unknown> = {
      ...baseMetadata,
      unitSystem: this.getMetricUnitSystem(),
      sourceUnit,
      modelUnitPolicy,
      editor: {
        ...editorMetadata,
        unitSystem: this.getMetricUnitSystem(),
        sourceUnit,
        modelUnitPolicy,
        unitNormalization: metadataOptions.unitNormalization ?? editorMetadata.unitNormalization
      }
    };

    if (unitScaleToMeters !== undefined) {
      nextMetadata.unitScaleToMeters = unitScaleToMeters;
      (nextMetadata.editor as Record<string, unknown>).unitScaleToMeters = unitScaleToMeters;
    }

    if (metadataOptions.unitNormalization) {
      nextMetadata.unitNormalizationVersion = metadataOptions.unitNormalization.version;
      nextMetadata.rawMaxDimension = metadataOptions.unitNormalization.rawMaxDimension;
      nextMetadata.normalizedMaxDimension = metadataOptions.unitNormalization.normalizedMaxDimension;
    }

    if (metadataOptions.sourceFile) {
      nextMetadata.sourceFile = metadataOptions.sourceFile;
    }

    return nextMetadata;
  }

  /** 从节点元数据中读取原始文件名，旧项目没有记录时保持为空。 */
  private getNodeSourceFileName(node: Node): string | undefined {
    const metadata = this.asMetadataObject(node.metadata);
    return typeof metadata.sourceFile === "string" ? metadata.sourceFile : undefined;
  }

  /** 旧项目缺少源文件副本时，尝试从当前场景已有同源且已米制归一的模型克隆一个新实例。 */
  private instantiateAssetFromSceneTemplate(asset: AssetRecord, position: Vector3): TransformNode | null {
    const assetUnitMetadata = getPersistedModelUnitMetadata(asset);
    const sourceNode = this.getSceneTemplateCandidates().find((node) => this.isSceneTemplateMatchForAsset(node, asset, assetUnitMetadata));
    if (!sourceNode) {
      return null;
    }

    const sourceValues = asset.modelPackage ? this.getModelPackageValues(sourceNode, asset.modelPackage) : undefined;
    if (asset.modelPackage) {
      this.stopModelPackageRuntime(sourceNode, true);
    }
    const cloneName = this.createUniqueCopyName(sourceNode.name || asset.name);
    let clone: TransformNode | null = null;
    try {
      const clonedNode = sourceNode.clone(cloneName, null, false);
      if (clonedNode instanceof TransformNode) {
        clone = clonedNode;
        this.prepareClonedHierarchy(clone, sourceNode, false);
      }
    } finally {
      if (asset.modelPackage && sourceValues) {
        this.applyModelPackageRuntimeWithDynamicFallbacks(sourceNode, asset.modelPackage, "clone", sourceValues);
      }
    }

    if (!(clone instanceof TransformNode)) {
      return null;
    }

    clone.name = cloneName;
    clone.setEnabled(true);
    this.updateNodeVisibility(clone, true);

    this.alignNodeBaseToPosition(clone, position);
    if (asset.modelPackage) {
      this.applyModelPackageRuntimeWithDynamicFallbacks(clone, asset.modelPackage, "import", this.getModelPackageValues(clone, asset.modelPackage));
    }
    this.selectNode(clone);
    this.ensureNodeGridCoverage(clone);
    this.refreshSceneGraph();
    return clone;
  }

  /** 判断场景中的已有根节点是否可以作为指定资产的克隆模板。 */
  private isSceneTemplateMatchForAsset(node: TransformNode, asset: AssetRecord, assetUnitMetadata: ModelUnitMetadata | null): boolean {
    if (!this.isNodeUnitMetadataCompatible(node, assetUnitMetadata)) {
      return false;
    }

    if (asset.modelPackage) {
      const instance = this.asMetadataObject(this.getNodeEditorMetadata(node).modelPackageInstance);
      return instance.packageId === asset.modelPackage.packageId;
    }

    return this.getNodeSourceFileName(node) === asset.name;
  }

  /** 递归收集可作为资产克隆模板的模型根节点，模型移入 group 后仍可兜底复用。 */
  private getSceneTemplateCandidates(): TransformNode[] {
    const candidates = new Map<number, TransformNode>();
    const visit = (node: Node): void => {
      if (node.metadata?.[HELPER_FLAG]) {
        return;
      }

      if (node instanceof TransformNode && !this.isEditorGroup(node) && this.isSceneGraphDisplayNode(node)) {
        candidates.set(node.uniqueId, node);
        return;
      }

      this.getVisibleChildren(node).forEach(visit);
    };

    this.scene.rootNodes.forEach(visit);
    return [...candidates.values()];
  }

  /** 判断场景模板的单位归一化记录是否足够安全，可用于资产源文件缺失时克隆。 */
  private isNodeUnitMetadataCompatible(node: Node, assetUnitMetadata: ModelUnitMetadata | null): boolean {
    const metadata = this.asMetadataObject(node.metadata);
    const editorMetadata = this.asMetadataObject(metadata.editor);
    const nodeUnitMetadata = isNormalizedModelUnitMetadata(editorMetadata.unitNormalization) ? editorMetadata.unitNormalization : null;
    if (!assetUnitMetadata) {
      return true;
    }

    if (!nodeUnitMetadata) {
      return false;
    }

    return (
      nodeUnitMetadata.version === assetUnitMetadata.version &&
      nodeUnitMetadata.sourceUnit === assetUnitMetadata.sourceUnit &&
      nodeUnitMetadata.unitScaleToMeters === assetUnitMetadata.unitScaleToMeters
    );
  }

  /** 将未知元数据安全收敛为普通对象，避免旧文件中的非对象 metadata 破坏合并。 */
  private asMetadataObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  /** 判断项目场景负载是否像一个 Babylon 序列化对象。 */
  private isSerializedScene(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  /** 生成可写入场景文件的资产记录，去掉只在当前会话有效的 File 缓存状态。 */
  private getSerializableAssets(): AssetRecord[] {
    return this.assets.map(({ sourceAvailable, ...asset }) => asset);
  }

  /** 从 Babylon 场景元数据中恢复资产面板记录。 */
  private getSerializedAssets(serializedScene: Record<string, unknown>): AssetRecord[] {
    const metadata = serializedScene.metadata as { editor?: { assets?: unknown } } | undefined;
    const assets = metadata?.editor?.assets;
    if (!Array.isArray(assets)) {
      return [];
    }

    return assets
      .filter((asset): asset is AssetRecord => this.isAssetRecord(asset))
      .map((asset) => ({ ...this.normalizeSerializedAssetUnitFields(asset), sourceAvailable: false }));
  }

  /** 校验资产记录结构，避免损坏项目文件污染资产面板。 */
  private isAssetRecord(value: unknown): value is AssetRecord {
    if (!value || typeof value !== "object") {
      return false;
    }

    const asset = value as AssetRecord;
    return (
      typeof asset.id === "string" &&
      typeof asset.name === "string" &&
      ["model", "texture", "primitive", "scene"].includes(asset.type) &&
      typeof asset.sizeLabel === "string" &&
      typeof asset.createdAt === "number" &&
      (asset.projectFile === undefined || typeof asset.projectFile === "string") &&
      (asset.projectFiles === undefined ||
        (Array.isArray(asset.projectFiles) && asset.projectFiles.every((projectFile) => typeof projectFile === "string"))) &&
      (asset.sourceAvailable === undefined || typeof asset.sourceAvailable === "boolean") &&
      (asset.modelPackage === undefined || this.isModelPackageManifest(asset.modelPackage))
    );
  }

  /** 校验模型包 manifest 的最小可用字段，兼容旧场景缺少该字段。 */
  private isModelPackageManifest(value: unknown): value is ModelPackageManifest {
    const manifest = this.asMetadataObject(value);
    return (
      manifest.version === 1 &&
      typeof manifest.packageId === "string" &&
      typeof manifest.displayName === "string" &&
      typeof manifest.rootDirectoryName === "string" &&
      (manifest.sourceRoot === undefined || typeof manifest.sourceRoot === "string") &&
      typeof manifest.primaryModelFile === "string" &&
      (manifest.scriptFile === undefined || typeof manifest.scriptFile === "string") &&
      (manifest.runtimeScriptFile === undefined || typeof manifest.runtimeScriptFile === "string") &&
      (manifest.runtimeClassName === undefined || typeof manifest.runtimeClassName === "string") &&
      (manifest.dataDriven === undefined || this.isModelDataDrivenDefinition(manifest.dataDriven)) &&
      Array.isArray(manifest.files) &&
      manifest.files.every((file) => this.isModelPackageProjectFile(file)) &&
      Array.isArray(manifest.dynamicFields) &&
      manifest.dynamicFields.every((field) => this.isDynamicInspectorField(field)) &&
      (manifest.initialValues === undefined || this.isDynamicParameterValueMap(manifest.initialValues)) &&
      Array.isArray(manifest.warnings) &&
      manifest.warnings.every((warning) => typeof warning === "string") &&
      typeof manifest.importedAt === "number"
    );
  }

  /** 校验模型包 dataDriven 语义定义，保持旧项目可选兼容。 */
  private isModelDataDrivenDefinition(value: unknown): value is ModelDataDrivenDefinition {
    const definition = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      (definition.device === undefined || this.isModelDataDrivenDeviceDefinition(definition.device)) &&
      (definition.motion === undefined || this.isModelDataDrivenMotionDefinitions(definition.motion)) &&
      (definition.fixedNodes === undefined || this.isStringArray(definition.fixedNodes)) &&
      (definition.simulation === undefined || this.isModelDataDrivenSimulationDefinition(definition.simulation)) &&
      (definition.cargoHandling === undefined || this.isModelDataDrivenCargoHandlingDefinition(definition.cargoHandling))
    );
  }

  /** 校验模型包 dataDriven.device 设备默认绑定字段。 */
  private isModelDataDrivenDeviceDefinition(value: unknown): boolean {
    const device = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      (device.devType === undefined || typeof device.devType === "string") &&
      (device.defaultAssetCode === undefined || typeof device.defaultAssetCode === "string") &&
      (device.deviceIdField === undefined || typeof device.deviceIdField === "string") &&
      (device.assetCodeField === undefined || typeof device.assetCodeField === "string") &&
      (device.interpolationMs === undefined || (typeof device.interpolationMs === "number" && Number.isFinite(device.interpolationMs)))
    );
  }

  /** 校验模型包 dataDriven.motion 中的运动组定义。 */
  private isModelDataDrivenMotionDefinitions(value: unknown): boolean {
    const motion = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      Object.values(motion).every((group) => this.isModelDataDrivenMotionGroupDefinition(group))
    );
  }

  /** 校验单个数据驱动运动组。 */
  private isModelDataDrivenMotionGroupDefinition(value: unknown): boolean {
    const group = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      this.isStringArray(group.fields) &&
      (group.kind === undefined || group.kind === "translate" || group.kind === "rotate") &&
      ["x", "y", "z"].includes(String(group.axis)) &&
      this.isStringArray(group.nodes) &&
      (group.valueMode === undefined || group.valueMode === "target" || group.valueMode === "action") &&
      (group.actionMap === undefined || this.isModelDataDrivenActionMap(group.actionMap)) &&
      (group.target === undefined || group.target === "nodes" || group.target === "root") &&
      (group.fallbackPattern === undefined || typeof group.fallbackPattern === "string") &&
      (group.speed === undefined || (typeof group.speed === "number" && Number.isFinite(group.speed) && group.speed > 0)) &&
      (group.limits === undefined || this.isModelDataDrivenMotionLimitDefinition(group.limits))
    );
  }

  /** 校验 action 模式下协议枚举到运动方向的映射表。 */
  private isModelDataDrivenActionMap(value: unknown): boolean {
    const actionMap = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      Object.values(actionMap).every((direction) => typeof direction === "number" && Number.isFinite(direction))
    );
  }

  /** 校验模型包运动行程限制定义，缺省字段保持兼容旧模型包。 */
  private isModelDataDrivenMotionLimitDefinition(value: unknown): boolean {
    const limits = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      (limits.min === undefined || (typeof limits.min === "number" && Number.isFinite(limits.min))) &&
      (limits.max === undefined || (typeof limits.max === "number" && Number.isFinite(limits.max))) &&
      (limits.blockerNodes === undefined || this.isStringArray(limits.blockerNodes)) &&
      (limits.blockerFallbackPattern === undefined || typeof limits.blockerFallbackPattern === "string") &&
      (limits.clearance === undefined || (typeof limits.clearance === "number" && Number.isFinite(limits.clearance) && limits.clearance >= 0))
    );
  }

  /** 校验模型包货箱取放吸附定义。 */
  private isModelDataDrivenCargoHandlingDefinition(value: unknown): boolean {
    const cargoHandling = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      (cargoHandling.actionFields === undefined || this.isStringArray(cargoHandling.actionFields)) &&
      (cargoHandling.cargoFields === undefined || this.isStringArray(cargoHandling.cargoFields)) &&
      (cargoHandling.targetFields === undefined || this.isStringArray(cargoHandling.targetFields)) &&
      (cargoHandling.pickupValues === undefined || this.isStringArray(cargoHandling.pickupValues)) &&
      (cargoHandling.dropValues === undefined || this.isStringArray(cargoHandling.dropValues)) &&
      (cargoHandling.pickupMinForkExtension === undefined || (typeof cargoHandling.pickupMinForkExtension === "number" && Number.isFinite(cargoHandling.pickupMinForkExtension))) &&
      (cargoHandling.pickupMaxDistance === undefined || (typeof cargoHandling.pickupMaxDistance === "number" && Number.isFinite(cargoHandling.pickupMaxDistance))) &&
      (cargoHandling.anchorNodes === undefined || this.isStringArray(cargoHandling.anchorNodes)) &&
      (cargoHandling.anchorFallbackPattern === undefined || typeof cargoHandling.anchorFallbackPattern === "string") &&
      (cargoHandling.anchorOffset === undefined || this.isVector3SnapshotLike(cargoHandling.anchorOffset))
    );
  }

  /** 校验三维向量快照形状，供模型包声明货箱吸附偏移使用。 */
  private isVector3SnapshotLike(value: unknown): boolean {
    const vector = this.asMetadataObject(value);
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof vector.x === "number" &&
        Number.isFinite(vector.x) &&
        typeof vector.y === "number" &&
        Number.isFinite(vector.y) &&
        typeof vector.z === "number" &&
        Number.isFinite(vector.z)
    );
  }

  /** 校验模型包本地模拟范围定义。 */
  private isModelDataDrivenSimulationDefinition(value: unknown): boolean {
    const simulation = this.asMetadataObject(value);
    return (
      Boolean(value && typeof value === "object" && !Array.isArray(value)) &&
      ["intervalMs", "travelRange", "liftBase", "liftRange", "forkRange", "forkSideRange"].every((key) => {
        const item = simulation[key];
        return item === undefined || (typeof item === "number" && Number.isFinite(item));
      })
    );
  }

  /** 校验字符串数组。 */
  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }

  /** 校验模型包文件记录，避免损坏项目文件污染资产恢复。 */
  private isModelPackageProjectFile(value: unknown): value is ModelPackageProjectFile {
    const file = this.asMetadataObject(value);
    return (
      typeof file.relativePath === "string" &&
      typeof file.projectFile === "string" &&
      ["primaryModel", "modelDependency", "script", "meta", "texture", "other"].includes(String(file.role)) &&
      typeof file.size === "number" &&
      Number.isFinite(file.size) &&
      (file.lastModified === undefined || (typeof file.lastModified === "number" && Number.isFinite(file.lastModified)))
    );
  }

  /** 校验动态字段结构，避免损坏 metadata 让属性面板读取非法字段。 */
  private isDynamicInspectorField(value: unknown): value is DynamicInspectorField {
    const field = this.asMetadataObject(value);
    const hasValidCommonFields =
      typeof field.id === "string" &&
      typeof field.key === "string" &&
      typeof field.label === "string" &&
      typeof field.sourceFile === "string" &&
      ["visibleAsNumber", "visibleAsColor3", "visibleAsString", "visibleAsBoolean"].includes(String(field.sourceDecorator)) &&
      typeof field.order === "number" &&
      Number.isFinite(field.order) &&
      (field.unit === undefined || ["m", "count", "degree", "ratio"].includes(String(field.unit))) &&
      (field.physicalKind === undefined || ["length", "distance", "count", "angle", "ratio"].includes(String(field.physicalKind))) &&
      (field.min === undefined || (typeof field.min === "number" && Number.isFinite(field.min))) &&
      (field.max === undefined || (typeof field.max === "number" && Number.isFinite(field.max))) &&
      (field.step === undefined || (typeof field.step === "number" && Number.isFinite(field.step)));

    if (!hasValidCommonFields) {
      return false;
    }

    if (field.kind === "number") {
      return field.sourceDecorator === "visibleAsNumber" && typeof field.defaultValue === "number" && Number.isFinite(field.defaultValue);
    }

    if (field.kind === "color3") {
      return field.sourceDecorator === "visibleAsColor3" && this.isColor3ParameterValue(field.defaultValue as DynamicParameterValue);
    }

    if (field.kind === "string") {
      return field.sourceDecorator === "visibleAsString" && typeof field.defaultValue === "string";
    }

    if (field.kind === "boolean") {
      return field.sourceDecorator === "visibleAsBoolean" && typeof field.defaultValue === "boolean";
    }

    return false;
  }

  /** 校验模型包 manifest 中的初始参数字典，避免坏项目把不可序列化对象带入运行时。 */
  private isDynamicParameterValueMap(value: unknown): boolean {
    const values = this.asMetadataObject(value);
    return Boolean(value && typeof value === "object" && !Array.isArray(value)) && Object.values(values).every((item) => {
      return this.normalizeUntypedDynamicParameterValue(item) !== undefined;
    });
  }

  /** 规范化序列化资产中的单位字段；无效单位字段只会被丢弃，不影响资产本身恢复。 */
  private normalizeSerializedAssetUnitFields(asset: AssetRecord): AssetRecord {
    const unitMetadata = getPersistedModelUnitMetadata(asset);
    if (unitMetadata) {
      return { ...asset, ...this.createAssetUnitFields(unitMetadata) };
    }

    const {
      sourceUnit: _sourceUnit,
      unitScaleToMeters: _unitScaleToMeters,
      unitInferenceMethod: _unitInferenceMethod,
      unitInferenceConfidence: _unitInferenceConfidence,
      unitNormalizationVersion: _unitNormalizationVersion,
      rawMaxDimension: _rawMaxDimension,
      normalizedMaxDimension: _normalizedMaxDimension,
      ...assetWithoutUnitFields
    } = asset;
    return assetWithoutUnitFields;
  }
}
