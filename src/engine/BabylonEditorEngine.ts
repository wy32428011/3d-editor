import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Loading/Plugins/babylonFileLoader";
import "@babylonjs/core/Materials/imageProcessingConfiguration";
import "@babylonjs/core/Meshes/groundMesh";
import "@babylonjs/core/Animations/animatable";
import "@babylonjs/loaders/glTF";
import "@babylonjs/loaders/OBJ";
import "@babylonjs/loaders/STL";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
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
import { SceneDataDrivenRuntime, type SceneDataDrivenRootMotionFields, type SceneDataDrivenTarget } from "../editor/sceneDataDrivenRuntime";
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
import { DEFAULT_LOCATOR_ANIMATION_CONNECTION, DEFAULT_SCENE_DATA_DRIVEN, DEFAULT_SCENE_EDITOR_SETTINGS } from "../types/editor";
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
  ModelArrayOptions,
  ModelArrayResult,
  ModelDataDrivenDefinition,
  ModelPackageManifest,
  ModelPackageProjectFile,
  PoiConfigSnapshot,
  PoiKind,
  PrimitiveKind,
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
const GROUP_NODE_TYPE = "group";
const STACKER_DEMO_DEVICE_ID = "Stacker01";
const STACKER_DEMO_ENDPOINT = "ws://127.0.0.1:18083/stacker";
const STACKER_DEMO_TOPIC = "dt/factory/logistics/stacker/Stacker01/twindatadriven/joint";
export const DEFAULT_SCENE_ENVIRONMENT_COLOR = "#26312d";
const GRID_RENDER_ELEVATION_METERS = 0.015;
const EDITOR_LENGTH_UNIT = "meter";
const IMPORTED_MODEL_UNIT_POLICY = "imported-model-coordinates-are-meters";
const TARGET_HIGH_QUALITY_RENDER_PIXELS = 3840 * 2160;
const MAX_HIGH_QUALITY_RENDER_SCALE = 4;
const PERFORMANCE_PREVIEW_MIN_HARDWARE_SCALING_LEVEL = 1.25;
const HARDWARE_SCALING_LEVEL_EPSILON = 0.01;
const SELECTION_OUTLINE_COLOR = "#63d7ff";
const SELECTION_OUTLINE_THICKNESS = 1.8;
const SELECTION_OUTLINE_TEXTURE_RATIO = 0.5;
const CAD_LINE_CHUNK_PERSIST_CONCURRENCY = 2;
const IMPORTED_MODEL_NORMALIZED_UNIT_POLICY = "imported-model-source-units-normalized-to-meters";
const GRID_MAJOR_LINE_EVERY_CELLS = 5;
const MAX_GRID_LINE_COUNT_PER_AXIS = 160;
const GRID_CAMERA_RADIUS_COVERAGE_FACTOR = 12;
const GRID_VIEWPORT_PADDING_FACTOR = 0.9;
const GRID_RECENTER_THRESHOLD_CELLS = 8;
const GRID_RESIZE_HYSTERESIS = 0.35;
const GRID_FLASH_PERIOD_MS = 1200;
const GRID_FLASH_MIN_VISIBILITY = 0.32;
const GRID_FLASH_MAX_VISIBILITY = 1;
const GRID_FLASH_PULSE_ELEVATION_OFFSET_METERS = 0.026;
const GRID_FLASH_SWEEP_ELEVATION_OFFSET_METERS = 0.018;
const MAX_MODEL_PACKAGE_RUNTIME_GENERATED_NODES = 5000;
const MAX_MODEL_ARRAY_CLONE_COUNT = 50;
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
const DEFAULT_CAMERA_PANNING_SENSIBILITY = 55;
const DEFAULT_CAMERA_ROTATION_SENSIBILITY = 1000;
const MIN_CAMERA_INPUT_SENSIBILITY = 1;
const MAX_CAMERA_INPUT_SENSIBILITY = 100000;

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
  scaling: Vector3;
  modelPackageInstance: Record<string, unknown>;
  values: Record<string, DynamicParameterValue>;
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
  private readonly assets: AssetRecord[] = [];
  private readonly assetFiles = new Map<string, File>();
  private readonly assetDependencyFiles = new Map<string, File[]>();
  private readonly modelPackageScriptTexts = new Map<string, Map<string, string>>();
  private readonly modelPackageRuntimeHandles = new Map<number, ModelPackageRuntimeHandle>();
  private readonly sceneDataDrivenRuntime: SceneDataDrivenRuntime;
  private readonly sceneBusinessRuntime: SceneBusinessRuntime;
  private readonly sceneInstrumentation: SceneInstrumentation;
  private readonly localImportFileKeys = new Set<string>();
  private selectedNodeIds = new Set<number>();
  private selectedNode: TransformNode | null = null;
  private currentTool: EditorTool = "move";
  private performanceMode = false;
  private webglContextLost = false;
  private gpuVendor = "未知 GPU";
  private gpuRenderer = "未知渲染器";
  private previewMode = false;
  private pendingStackerDemoSimulation = false;
  private stackerDemoSimulationActive = false;
  private previewCameraSnapshot: PreviewCameraSnapshot | null = null;
  private previewAnimationGroupSnapshots: PreviewAnimationGroupSnapshot[] = [];
  private previewDirectAnimationSnapshots: PreviewDirectAnimationSnapshot[] = [];
  private clipboardTemplateNode: TransformNode | null = null;
  private clipboardBaseName = "";
  private clipboardPasteCount = 0;
  private readonly clipboardPasteOffset = new Vector3(0.5, 0, 0.5);
  private statsStamp = 0;
  private dataDrivenSelectionSyncStamp = 0;
  private primitiveSeed = 1;
  private poiSeed = 1;
  private transformSyncFrame = 0;
  private gridCoverageSizeMeters = EDITOR_GRID_SIZE_METERS;
  private gridCellSizeMeters = EDITOR_GRID_CELL_SIZE_METERS;
  private gridCenter = Vector3.Zero();
  private readonly gridHelperMeshes: AbstractMesh[] = [];
  private readonly gridVisualMeshes: AbstractMesh[] = [];
  private readonly gridFlashPulseMeshes: AbstractMesh[] = [];
  private readonly gridFlashSweepMeshes: AbstractMesh[] = [];
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

    this.configureGizmos();
    this.sceneDataDrivenRuntime = new SceneDataDrivenRuntime({
      scene: this.scene,
      getConfig: () => this.createSceneInspectorSnapshot().dataDriven,
      getTargets: () => this.createSceneDataDrivenTargets(),
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
      this.updateDynamicGridForCamera();
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
    this.sceneInstrumentation.dispose();
    this.selectionOutlineLayer.dispose();
    this.gizmoManager.dispose();
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

  /** 开关性能预览模式，在流畅度和编辑精度之间切换。 */
  public setPerformanceMode(enabled: boolean): void {
    this.performanceMode = enabled;
    this.applyRenderQuality();
    this.scene.skipPointerMovePicking = enabled;
    this.callbacks.onStatsChange(this.collectStats());
  }

  /** 按当前模式应用 WebGL 后备缓冲缩放；默认走接近 4K 的高清策略。 */
  private applyRenderQuality(): void {
    if (this.webglContextLost) {
      return;
    }

    const nextLevel = this.performanceMode
      ? this.calculatePerformancePreviewHardwareScalingLevel()
      : this.calculateHighQualityHardwareScalingLevel();
    const currentLevel = this.engine.getHardwareScalingLevel();
    if (!Number.isFinite(currentLevel) || Math.abs(currentLevel - nextLevel) > HARDWARE_SCALING_LEVEL_EPSILON) {
      this.engine.setHardwareScalingLevel(nextLevel);
    }
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

  /** 计算性能预览的硬件缩放值，保留用户主动降画质换流畅度的能力。 */
  private calculatePerformancePreviewHardwareScalingLevel(): number {
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    return Math.max(PERFORMANCE_PREVIEW_MIN_HARDWARE_SCALING_LEVEL, devicePixelRatio);
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

    const demoDeviceId = stackerTarget.dataDriven?.device?.defaultAssetCode?.trim() || STACKER_DEMO_DEVICE_ID;
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
    return [...targets.values()];
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
    const nodes = new Map<number, TransformNode>();
    [...this.scene.rootNodes, ...this.scene.transformNodes, ...this.scene.meshes].forEach((node) => {
      if (node instanceof TransformNode && !node.metadata?.[HELPER_FLAG] && this.isPoiNode(node)) {
        nodes.set(node.uniqueId, node);
      }
    });
    return [...nodes.values()];
  }

  /** 收集运行态可绑定的业务根节点，排除 POI 自身和临时生成节点。 */
  private getEditableRuntimeRoots(): TransformNode[] {
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
    return [...nodes.values()];
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

    this.editorCamera.alpha = this.previewCameraSnapshot.alpha;
    this.editorCamera.beta = this.previewCameraSnapshot.beta;
    this.editorCamera.radius = this.previewCameraSnapshot.radius;
    this.editorCamera.target.copyFrom(this.previewCameraSnapshot.target);
    this.editorCamera.minZ = this.previewCameraSnapshot.minZ;
    this.editorCamera.maxZ = this.previewCameraSnapshot.maxZ;
    this.editorCamera.lowerRadiusLimit = this.previewCameraSnapshot.lowerRadiusLimit;
    this.editorCamera.upperRadiusLimit = this.previewCameraSnapshot.upperRadiusLimit;
    this.editorCamera.attachControl(this.canvas, true);
    this.previewCameraSnapshot = null;
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
    this.applyHighlight();
    this.syncGizmoMode();
    this.emitSelectionSnapshot();
    this.refreshSceneGraph();
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

    const sourcePackageRoot = this.findModelPackageRoot(sourceNode) ?? sourceNode;
    const sourceModelPackage = this.getModelPackageAssetForRoot(sourcePackageRoot)?.modelPackage;
    this.cleanupPoiRuntimeInHierarchy(sourceNode);
    if (sourceModelPackage) {
      this.stopModelPackageRuntime(sourcePackageRoot, true);
    }
    const template = this.cloneEditableNode(sourceNode, `__editor_clipboard_${sourceNode.uniqueId}__`);
    if (sourceModelPackage) {
      this.applyModelPackageRuntime(sourcePackageRoot, sourceModelPackage, "clone");
    }
    if (!template) {
      return false;
    }

    this.prepareClonedHierarchy(template, sourceNode, true);
    template.setEnabled(false);
    const previousTemplate = this.clipboardTemplateNode;
    this.clipboardTemplateNode = template;
    this.clipboardBaseName = sourceNode.name || "模型";
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
      this.applyModelPackageRuntime(pastedNode, pastedModelPackage, "clone");
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

    if (!Number.isFinite(options.spacing) || options.spacing <= 0) {
      return this.createModelArrayFailure("阵列间距必须是大于 0 的米制数值。");
    }

    const sourceRoot = this.getModelArrayTargetRoot(this.findTransformNodeByUniqueId(options.targetId));
    if (!sourceRoot) {
      return this.createModelArrayFailure("当前选择不可创建模型阵列，请选择未锁定的普通模型。");
    }

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
    const sourceParent = sourceRoot.parent instanceof TransformNode ? sourceRoot.parent : null;
    const sourceModelPackage = this.getModelPackageAssetForRoot(sourceRoot)?.modelPackage;
    const usedAssetCodes = this.collectSceneAssetCodes();
    const sourceAssetCode = this.getNodeAssetInfo(sourceRoot).assetCode.trim();
    const clones: TransformNode[] = [];
    let sourceRuntimeStopped = false;

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
        const worldOffset = direction.scale(options.spacing * index);
        clone.position.addInPlace(this.worldDeltaToParentLocalDelta(clone, worldOffset));
        if (sourceAssetCode) {
          this.updateNodeAssetInfo(clone, {
            assetCode: this.createUniqueArrayAssetCode(sourceAssetCode, usedAssetCodes)
          });
        }

        clones.push(clone);
        const cloneModelPackage = this.getModelPackageAssetForRoot(clone)?.modelPackage;
        if (cloneModelPackage) {
          this.applyModelPackageRuntime(clone, cloneModelPackage, "clone");
        }
        this.refreshNodeWorldMatrices(clone);
        this.ensureNodeGridCoverage(clone);
      }
    } catch (error) {
      clones.forEach((clone) => this.disposeClonedNodeHierarchy(clone));
      if (sourceRuntimeStopped && sourceModelPackage) {
        this.applyModelPackageRuntime(sourceRoot, sourceModelPackage, "clone");
      }
      this.refreshSceneGraph();
      this.scene.render();
      return this.createModelArrayFailure(getEngineErrorMessage(error, "创建模型阵列失败。"));
    }

    if (sourceRuntimeStopped && sourceModelPackage) {
      this.applyModelPackageRuntime(sourceRoot, sourceModelPackage, "clone");
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
    const node = this.createPrimitive(kind, position);
    this.selectNode(node);
    this.refreshSceneGraph();
    return node;
  }

  /** 创建 POI 点位组件，并放置到指定地面落点。 */
  public addPoi(kind: PoiKind, position = Vector3.Zero()): TransformNode {
    const node = this.createPoi(kind, position);
    this.selectNode(node);
    this.refreshSceneGraph();
    return node;
  }

  /** 创建逻辑分组节点，分组只负责组织树结构和批量高亮，不作为可变换模型使用。 */
  public createGroup(): TransformNode {
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

    this.mergeNodeEditorMetadata(node, { locked });
    if (this.selectedNode?.uniqueId === node.uniqueId || (this.selectedNode && this.isNodeAncestor(node, this.selectedNode))) {
      this.emitSelectionSnapshot();
      this.syncGizmoMode();
    }
    this.refreshSceneGraph();
    this.scene.render();
  }

  /** 把模型或分组移动到目标分组下；groupId 为空时移回场景根级。 */
  public moveNodeToGroup(nodeId: number, groupId: number | null): void {
    const node = this.findTransformNodeByUniqueId(nodeId);
    if (!node || node.metadata?.[HELPER_FLAG] || this.isNodeLocked(node)) {
      return;
    }

    let targetParent: TransformNode | null = null;
    if (groupId !== null) {
      const group = this.findTransformNodeByUniqueId(groupId);
      if (!group || !this.isEditorGroup(group) || this.isNodeLocked(group)) {
        return;
      }
      targetParent = group;
    }

    if (targetParent && (targetParent.uniqueId === node.uniqueId || this.isNodeAncestor(node, targetParent))) {
      return;
    }

    node.setParent(targetParent);
    node.metadata = {
      ...this.asMetadataObject(node.metadata),
      [ROOT_FLAG]: true
    };
    this.refreshNodeWorldMatrices(node);
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

  /** 项目重新打开并恢复脚本文本后，初始化场景里已有模型包实例的运行器。 */
  public initializeModelPackageRuntimesForScene(): void {
    this.getSceneModelPackageRoots().forEach((root) => {
      const asset = this.getModelPackageAssetForRoot(root);
      if (asset?.modelPackage) {
        this.syncModelPackageScriptMetadata(root, asset.modelPackage, this.getModelPackageValues(root, asset.modelPackage));
        this.applyModelPackageRuntime(root, asset.modelPackage, "load");
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

    const clonedNode = this.instantiateAssetFromSceneTemplate(asset, position);
    if (clonedNode) {
      this.callbacks.onStatsChange(this.collectStats());
      return true;
    }

    const file = this.assetFiles.get(assetId);
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
      this.applyModelPackageRuntime(prepared.root, asset.modelPackage, "import");
      this.emitSelectionSnapshot();
    }

    this.updateAssetUnitMetadata(assetId, prepared.unitMetadata);
    this.refreshSceneGraph();
    return true;
  }

  /** 用户直接把文件拖入视口时，立即创建场景对象并同步登记资产。 */
  public async importFiles(files: FileList | File[], position = Vector3.Zero(), projectFiles = new Map<File, string>()): Promise<void> {
    const fileArray = Array.from(files);
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
    this.applyModelPackageRuntime(prepared.root, manifest, "import");
    this.emitSelectionSnapshot();
    this.callbacks.onAssetsChange([...this.assets]);
    this.refreshSceneGraph();
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

    this.sceneBusinessRuntime.stop(true);
    this.stopAllModelPackageRuntimes(true);
    try {
      const serialized = SceneSerializer.Serialize(this.scene) as Record<string, unknown>;
      this.stripEditorRuntimeSerialization(serialized);
      serialized.metadata = this.withMetricSceneMetadata(serialized.metadata, {
        savedAt: new Date().toISOString(),
        assets: this.getSerializableAssets(),
        sceneEnvironment: { backgroundColor: this.getSceneEnvironmentColor() }
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

    const previousSerializeBuffers = Texture.SerializeBuffers;
    const previousForceSerializeBuffers = Texture.ForceSerializeBuffers;
    this.sceneBusinessRuntime.stop(true);
    this.stopAllModelPackageRuntimes(true);
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
        this.applySceneEnvironmentColor(this.getSerializedSceneEnvironmentColor(loadableScene) ?? DEFAULT_SCENE_ENVIRONMENT_COLOR, false);
        this.scene.metadata = this.withMetricSceneMetadata(this.scene.metadata);
        const sceneInspector = this.createSceneInspectorSnapshot();
        this.applySceneCameraSettings(sceneInspector.camera);
        this.applySceneEditorSettings(sceneInspector.editorSettings);
      } finally {
        URL.revokeObjectURL(sceneUrl);
        Texture.UseSerializedUrlIfAny = previousUseSerializedUrlIfAny;
        this.restoreProjectExternalTextureFileRegistration(projectTextureFileRegistration);
      }
      this.scene.activeCamera = this.editorCamera;
      this.editorCamera.attachControl(this.canvas, true);
      await this.prepareLoadedScene(loadableScene, options);
      const selectedNode = this.selectFirstEditableNode();
      this.frameEditableSceneInView(selectedNode);
      this.refreshSceneGraph();
      this.callbacks.onStatsChange(this.collectStats());
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

    const graphDirty = this.applyTransformUpdateToNode(node, update);
    this.refreshNodeWorldMatrices(node);
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
      this.updateNodeMeshVertexModify(node, update.meshVertexModify);
      if (update.meshVertexModify.mainColor && !this.isCadDrawingNode(node)) {
        this.updateNodeMaterialColor(node, update.meshVertexModify.mainColor);
      }
    }

    if (transformEditable && update.assetInfo) {
      this.updateNodeAssetInfo(node, update.assetInfo);
    }

    if (transformEditable && update.dynamicParameter) {
      this.updateNodeDynamicParameter(node, update.dynamicParameter);
      graphDirty = true;
    }

    if (transformEditable && update.poi && this.isPoiNode(node)) {
      this.updateNodePoiConfig(node, update.poi);
    }

    if (transformEditable && update.locatorAnimationConnection && this.isLocatorWireCubeNode(node)) {
      this.updateLocatorAnimationConnection(node, update.locatorAnimationConnection);
    }

    return graphDirty;
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
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = DEFAULT_CAMERA_FAR_CLIP_METERS;
    camera.wheelPrecision = DEFAULT_CAMERA_WHEEL_PRECISION;
    camera.panningSensibility = DEFAULT_CAMERA_PANNING_SENSIBILITY;
    camera.angularSensibilityX = DEFAULT_CAMERA_ROTATION_SENSIBILITY;
    camera.angularSensibilityY = DEFAULT_CAMERA_ROTATION_SENSIBILITY;
    camera.movement.panSpeed = MIN_CAMERA_PAN_SPEED_SCALE;
    camera.minZ = 0.05;
    camera.maxZ = DEFAULT_CAMERA_FAR_CLIP_METERS;
    camera.fov = 0.92;
    camera.useInputToRestoreState = false;
    this.scene.activeCamera = camera;
    camera.attachControl(this.canvas, true);
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
      gizmo.onDragStartObservable.add(() => this.flushTransformSnapshotSync());
      gizmo.onDragObservable.add(() => this.scheduleTransformSnapshotSync());
      gizmo.onDragEndObservable.add(() => this.flushTransformSnapshotSync());
    });
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
    const clone = sourceNode.clone(name, parent, false);
    return clone instanceof TransformNode ? clone : null;
  }

  /** 生成模型阵列失败结果，保证 App 层不需要重复拼装错误结构。 */
  private createModelArrayFailure(message: string): ModelArrayResult {
    return {
      success: false,
      createdCount: 0,
      message
    };
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
    const sourceNodes = this.getNodeHierarchy(sourceRoot);
    const cloneNodes = this.getNodeHierarchy(cloneRoot);
    cloneNodes.forEach((cloneNode, index) => {
      const sourceNode = sourceNodes[index] ?? cloneNode;
      const metadata = this.deepCloneMetadata(sourceNode.metadata);
      if (asClipboardTemplate) {
        metadata[HELPER_FLAG] = true;
      } else {
        delete metadata[HELPER_FLAG];
      }
      if (cloneNode === cloneRoot) {
        metadata[ROOT_FLAG] = !asClipboardTemplate;
      }
      cloneNode.metadata = metadata;
      cloneNode.doNotSerialize = asClipboardTemplate;
      if (cloneNode instanceof AbstractMesh) {
        cloneNode.isPickable = !asClipboardTemplate;
      }
    });

    const cloneMeshes = cloneRoot instanceof AbstractMesh ? [cloneRoot, ...cloneRoot.getChildMeshes()] : cloneRoot.getChildMeshes();
    this.cloneHierarchyMaterials(cloneMeshes, asClipboardTemplate);
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
  }

  /** 释放旧网格辅助对象，供导入超大模型后重建更大参考网格。 */
  private disposeGridHelper(): void {
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
      if (this.previewMode || this.gizmoManager.isDragging) {
        return;
      }

      const event = pointerInfo.event as PointerEvent;
      if (event.button !== 0) {
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

  /** 绑定统计信息刷新，避免每帧都触发 React 重渲染。 */
  private bindStatsLoop(): void {
    this.scene.onAfterRenderObservable.add(() => {
      const now = performance.now();
      if (now - this.statsStamp < 500) {
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
    const size = DEFAULT_BOX_SIZE_METERS;
    const halfSize = size / 2;
    const bottomCorners = [
      new Vector3(-halfSize, 0, -halfSize),
      new Vector3(halfSize, 0, -halfSize),
      new Vector3(halfSize, 0, halfSize),
      new Vector3(-halfSize, 0, halfSize)
    ];
    const topCorners = bottomCorners.map((corner) => corner.add(new Vector3(0, size, 0)));
    const lines = [
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
    const lineSystem = MeshBuilder.CreateLineSystem(name, { lines }, this.scene);
    lineSystem.color = Color3.FromHexString("#72d6ff");
    lineSystem.alpha = 0.95;
    lineSystem.intersectionThreshold = 0.08;
    lineSystem.alwaysSelectAsActiveMesh = true;
    return lineSystem;
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
    this.editorCamera.attachControl(this.canvas, true);
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
    this.editorCamera.attachControl(this.canvas, true);
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

  /** 让所有可见网格线按同一节奏整体闪烁，帮助用户在大视野中快速定位编辑平面。 */
  private updateGridFlash(): void {
    if (this.gridVisualMeshes.length === 0) {
      return;
    }

    const cycle = (performance.now() % GRID_FLASH_PERIOD_MS) / GRID_FLASH_PERIOD_MS;
    const pulse = (Math.sin(cycle * Math.PI * 2) + 1) / 2;
    const easedPulse = pulse * pulse * (3 - 2 * pulse);
    const synchronizedVisibility =
      GRID_FLASH_MIN_VISIBILITY + (GRID_FLASH_MAX_VISIBILITY - GRID_FLASH_MIN_VISIBILITY) * easedPulse;
    this.gridVisualMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = synchronizedVisibility;
      }
    });

    this.gridFlashPulseMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.visibility = synchronizedVisibility;
      }
    });

    this.gridFlashSweepMeshes.forEach((mesh) => {
      if (!mesh.isDisposed()) {
        mesh.position.x = this.gridCenter.x;
        mesh.position.z = this.gridCenter.z;
        mesh.visibility = synchronizedVisibility;
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
    this.applyHighlight();
    this.syncGizmoMode();
    this.emitSelectionSnapshot();
    this.refreshSceneGraph();
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
      if (current.metadata?.[ROOT_FLAG]) {
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
  private getNodeWorldBounds(node: TransformNode): NodeWorldBounds | null {
    const meshes = this.getEditableMeshes(node).filter((mesh) => mesh.getTotalVertices() > 0 && mesh.isEnabled());
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
      locatorAnimationConnection: this.isLocatorWireCubeNode(node) ? this.getLocatorAnimationConnection(node) : undefined
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

    const values = {
      ...this.createInitialDynamicParameterValues(asset.modelPackage),
      ...this.asMetadataObject(instance.values)
    } as Record<string, DynamicParameterValue>;

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
      const parameterValue = value as DynamicParameterValue;
      if (!field || !this.isDynamicParameterValueCompatible(field, parameterValue)) {
        return;
      }

      values[key] = this.cloneDynamicParameterValue(parameterValue);
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
  private updateNodeMeshVertexModify(node: TransformNode, update: Partial<MeshVertexModifySnapshot>): void {
    const current = this.getNodeMeshVertexModify(node, this.getNodeMaterialColor(node));
    const editorMetadata = this.getNodeEditorMetadata(node);
    const stored = this.asMetadataObject(editorMetadata.meshVertexModify);
    this.mergeNodeEditorMetadata(node, {
      meshVertexModify: {
        ...stored,
        ...current,
        ...update
      }
    });
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

  /** 写回指定节点所属模型包的动态参数，并立即重跑运行脚本驱动真实模型。 */
  private updateNodeDynamicParameter(node: TransformNode, update: DynamicParameterUpdate): void {
    const packageRoot = this.findModelPackageRoot(node);
    if (!packageRoot) {
      return;
    }

    const editorMetadata = this.getNodeEditorMetadata(packageRoot);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    if (update.packageId && instance.packageId !== update.packageId) {
      return;
    }

    const assetId = typeof instance.assetId === "string" ? instance.assetId : "";
    const packageId = typeof instance.packageId === "string" ? instance.packageId : "";
    const asset = this.assets.find((item) => item.id === assetId && item.modelPackage?.packageId === packageId);
    const manifest = asset?.modelPackage;
    if (!manifest) {
      return;
    }

    const field = manifest.dynamicFields.find((item) => item.key === update.key);
    if (!field || !this.isDynamicParameterValueCompatible(field, update.value)) {
      return;
    }

    const values = this.asMetadataObject(instance.values);
    const nextValues = {
      ...values,
      [update.key]: update.value
    } as Record<string, DynamicParameterValue>;
    this.mergeNodeEditorMetadata(packageRoot, {
      modelPackageInstance: {
        ...instance,
        values: nextValues
      }
    });
    this.syncModelPackageScriptMetadata(packageRoot, manifest, nextValues);
    this.applyModelPackageRuntime(packageRoot, manifest, "parameter");
  }

  /** 遍历当前场景的模型包根节点，保存后用于恢复视口中的参数化效果。 */
  private applyModelPackageRuntimeToScene(reason: "load" | "serialize"): void {
    this.getSceneModelPackageRoots().forEach((root) => {
      const asset = this.getModelPackageAssetForRoot(root);
      if (asset?.modelPackage) {
        this.syncModelPackageScriptMetadata(root, asset.modelPackage, this.getModelPackageValues(root, asset.modelPackage));
        this.applyModelPackageRuntime(root, asset.modelPackage, reason);
      }
    });
    this.refreshSceneGraph();
    this.emitSelectionSnapshot();
    this.callbacks.onStatsChange(this.collectStats());
    this.scene.render();
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
    this.syncModelPackageScriptMetadata(root, manifest, values);
    this.assignModelPackageRuntimeValues(handle.instance, values, manifest.dynamicFields);
    const methodName = handle.started ? "onUpdate" : "onStart";
    const warning = this.runModelPackageLifecycleWithEditableStateGuard(root, manifest, values, () =>
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
  private stopModelPackageRuntime(root: TransformNode, keepHandleForRestart: boolean): void {
    const handle = this.modelPackageRuntimeHandles.get(root.uniqueId);
    if (!handle) {
      return;
    }

    const manifest = this.getModelPackageAssetForRoot(root)?.modelPackage;
    const values = manifest ? this.getModelPackageValues(root, manifest) : this.getRawModelPackageValues(root);
    if (manifest) {
      this.syncModelPackageScriptMetadata(root, manifest, values);
    }
    this.assignModelPackageRuntimeValues(handle.instance, values, manifest?.dynamicFields);
    const warning = this.runModelPackageLifecycleWithEditableStateGuard(root, manifest, values, () =>
      invokeModelPackageRuntimeLifecycle(handle.instance, "onStop", handle.scriptFile)
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
  private stopAllModelPackageRuntimes(keepHandlesForRestart: boolean): void {
    [...this.modelPackageRuntimeHandles.values()].forEach((handle) => this.stopModelPackageRuntime(handle.root, keepHandlesForRestart));
    if (!keepHandlesForRestart) {
      this.modelPackageRuntimeHandles.clear();
    }
  }

  /** 包住模型包生命周期调用，避免保存时 onStop/onStart 把用户编辑的根节点状态和参数还原。 */
  private runModelPackageLifecycleWithEditableStateGuard(
    root: TransformNode,
    manifest: ModelPackageManifest | undefined,
    values: Record<string, DynamicParameterValue>,
    action: () => string | undefined
  ): string | undefined {
    const editableState = this.captureModelPackageEditableState(root, values);
    try {
      this.normalizeModelPackageRootForLifecycle(root);
      return action();
    } finally {
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

  /** 捕获模型包根节点用户可编辑状态，供运行脚本生命周期结束后恢复。 */
  private captureModelPackageEditableState(
    root: TransformNode,
    values: Record<string, DynamicParameterValue>
  ): ModelPackageEditableStateSnapshot {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const modelPackageInstance = this.deepCloneMetadata(editorMetadata.modelPackageInstance);
    return {
      name: root.name,
      position: root.position.clone(),
      rotation: root.rotation.clone(),
      rotationQuaternion: root.rotationQuaternion?.clone() ?? null,
      scaling: root.scaling.clone(),
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
    root.scaling.copyFrom(snapshot.scaling);
    this.mergeNodeEditorMetadata(root, {
      modelPackageInstance: {
        ...snapshot.modelPackageInstance,
        values: this.cloneDynamicParameterValues(snapshot.values)
      }
    });
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

  /** 读取模型包实例当前值，缺失字段回退 manifest 默认值。 */
  private getModelPackageValues(root: TransformNode, manifest: ModelPackageManifest): Record<string, DynamicParameterValue> {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    return {
      ...this.createInitialDynamicParameterValues(manifest),
      ...this.asMetadataObject(instance.values)
    } as Record<string, DynamicParameterValue>;
  }

  /** 在缺少资产 manifest 时读取原始模型包参数，用于停止运行脚本时兜底保护用户输入。 */
  private getRawModelPackageValues(root: TransformNode): Record<string, DynamicParameterValue> {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    return this.cloneDynamicParameterValues(this.asMetadataObject(instance.values) as Record<string, DynamicParameterValue>);
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
    if (field.kind === "number") {
      return typeof value === "number" && Number.isFinite(value);
    }

    if (field.kind === "color3") {
      return this.isColor3ParameterValue(value);
    }

    if (field.kind === "string") {
      return typeof value === "string";
    }

    if (field.kind === "boolean") {
      return typeof value === "boolean";
    }

    return false;
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
  private refreshSceneGraph(): void {
    const nodes: SceneNodeSummary[] = [];
    const roots = this.scene.rootNodes.filter((node) => !node.metadata?.[HELPER_FLAG]);
    roots.forEach((node) => this.pushSceneNodeSummary(nodes, node, 0));
    this.callbacks.onSceneGraphChange(nodes);
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
    if (node.metadata?.isPoiRuntimeGenerated) {
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
    const meshes = this.scene.meshes.filter((mesh) => !mesh.metadata?.[HELPER_FLAG]);
    const drawCalls = this.sceneInstrumentation.drawCallsCounter.current;
    return {
      fps: Math.round(this.engine.getFps()),
      meshes: meshes.length,
      activeMeshes: Number((this.scene.getActiveMeshes() as unknown as { length: number }).length ?? 0),
      vertices: meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0),
      drawCalls: Number.isFinite(drawCalls) ? Math.round(drawCalls) : 0,
      hardwareScalingLevel: Number(this.engine.getHardwareScalingLevel().toFixed(2)),
      renderWidth: this.engine.getRenderWidth(true),
      renderHeight: this.engine.getRenderHeight(true),
      gpuVendor: this.gpuVendor,
      gpuRenderer: this.gpuRenderer,
      contextLost: this.webglContextLost
    };
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

    if (asset.modelPackage) {
      this.stopModelPackageRuntime(sourceNode, true);
    }
    const cloneName = this.createUniqueCopyName(sourceNode.name || asset.name);
    const clone = sourceNode.clone(cloneName, null, false);
    if (asset.modelPackage) {
      this.applyModelPackageRuntime(sourceNode, asset.modelPackage, "clone");
    }
    if (!(clone instanceof TransformNode)) {
      return null;
    }

    this.prepareClonedHierarchy(clone, sourceNode, false);
    clone.name = cloneName;
    clone.setEnabled(true);
    this.updateNodeVisibility(clone, true);

    this.alignNodeBaseToPosition(clone, position);
    if (asset.modelPackage) {
      this.applyModelPackageRuntime(clone, asset.modelPackage, "import");
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
      (group.fallbackPattern === undefined || typeof group.fallbackPattern === "string") &&
      (group.speed === undefined || (typeof group.speed === "number" && Number.isFinite(group.speed) && group.speed > 0)) &&
      (group.limits === undefined || this.isModelDataDrivenMotionLimitDefinition(group.limits))
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
      if (typeof item === "number") {
        return Number.isFinite(item);
      }
      if (typeof item === "string" || typeof item === "boolean") {
        return true;
      }
      return this.isColor3ParameterValue(item as DynamicParameterValue);
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
