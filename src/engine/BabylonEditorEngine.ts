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
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Node } from "@babylonjs/core/node";
import { ImportMeshAsync, LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { SceneSerializer } from "@babylonjs/core/Misc/sceneSerializer";
import { FilesInputStore } from "@babylonjs/core/Misc/filesInputStore";
import { Scene } from "@babylonjs/core/scene";
import type { Animatable } from "@babylonjs/core/Animations/animatable";
import type { Animation } from "@babylonjs/core/Animations/animation";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { applySnapshotVector, formatBytes, snapshotVector } from "../editor/math";
import {
  compileModelPackageRuntime,
  DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS,
  invokeModelPackageRuntimeLifecycle,
  type ModelPackageRuntimeInstance
} from "../editor/modelPackageRuntime";
import { parseCadDxf, type CadDxfBounds, type CadDxfParseResult, type CadDxfPolyline } from "../editor/cadDxf";
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
import { DEFAULT_SCENE_DATA_DRIVEN, DEFAULT_SCENE_EDITOR_SETTINGS } from "../types/editor";
import type {
  AssetInfoSnapshot,
  AssetRecord,
  DynamicInspectorField,
  DynamicParameterSnapshot,
  DynamicParameterUpdate,
  DynamicParameterValue,
  EditorEngineCallbacks,
  EditorStats,
  EditorTool,
  MeshVertexModifySnapshot,
  ModelPackageManifest,
  ModelPackageProjectFile,
  PoiKind,
  PrimitiveKind,
  SceneDataDrivenSnapshot,
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
export const DEFAULT_SCENE_ENVIRONMENT_COLOR = "#26312d";
const GRID_RENDER_ELEVATION_METERS = 0.015;
const EDITOR_LENGTH_UNIT = "meter";
const IMPORTED_MODEL_UNIT_POLICY = "imported-model-coordinates-are-meters";
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
const CAD_LINE_ELEVATION_METERS = GRID_RENDER_ELEVATION_METERS + 0.045;
const CAD_LINE_CHUNK_SEGMENTS = 20000;
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

/** POI 模板的基础视觉参数，便于 UI 库和场景实例保持一致语义。 */
interface PoiDefinition {
  name: string;
  text: string;
  colorHex: string;
  emissiveHex: string;
  shape: "pin" | "panel" | "camera" | "device";
}

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

/** 管理 Babylon.js 运行时、编辑器交互、资产导入与场景序列化。 */
export class BabylonEditorEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: EditorEngineCallbacks;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly editorCamera: ArcRotateCamera;
  private readonly gizmoManager: GizmoManager;
  private readonly highlightLayer: HighlightLayer;
  private readonly assets: AssetRecord[] = [];
  private readonly assetFiles = new Map<string, File>();
  private readonly assetDependencyFiles = new Map<string, File[]>();
  private readonly modelPackageScriptTexts = new Map<string, Map<string, string>>();
  private readonly modelPackageRuntimeHandles = new Map<number, ModelPackageRuntimeHandle>();
  private readonly localImportFileKeys = new Set<string>();
  private readonly highlightedMeshes = new Set<Mesh>();
  private selectedNode: TransformNode | null = null;
  private currentTool: EditorTool = "move";
  private performanceMode = false;
  private previewMode = false;
  private previewCameraSnapshot: PreviewCameraSnapshot | null = null;
  private previewAnimationGroupSnapshots: PreviewAnimationGroupSnapshot[] = [];
  private previewDirectAnimationSnapshots: PreviewDirectAnimationSnapshot[] = [];
  private clipboardTemplateNode: TransformNode | null = null;
  private clipboardBaseName = "";
  private clipboardPasteCount = 0;
  private readonly clipboardPasteOffset = new Vector3(0.5, 0, 0.5);
  private statsStamp = 0;
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

  /** 初始化渲染引擎、默认场景和所有编辑器输入绑定。 */
  public constructor(canvas: HTMLCanvasElement, callbacks: EditorEngineCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.engine = new Engine(canvas, true, {
      adaptToDeviceRatio: true,
      preserveDrawingBuffer: true,
      stencil: true
    });
    this.scene = new Scene(this.engine);

    this.editorCamera = this.createEditorCamera();
    this.applySceneEnvironmentColor(DEFAULT_SCENE_ENVIRONMENT_COLOR, false);
    this.gizmoManager = new GizmoManager(this.scene);
    this.highlightLayer = new HighlightLayer("EditorSelectionHighlight", this.scene);

    this.configureGizmos();
    this.createDefaultScene();
    this.bindPointerSelection();
    this.bindStatsLoop();
    this.bindResize();
    this.engine.runRenderLoop(() => {
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
    if (this.transformSyncFrame) {
      window.cancelAnimationFrame(this.transformSyncFrame);
      this.transformSyncFrame = 0;
    }
    window.removeEventListener("resize", this.handleResize);
    this.stopAllModelPackageRuntimes(false);
    this.disposeClipboardTemplate();
    this.clearRegisteredLocalImportFiles();
    this.highlightLayer.dispose();
    this.gizmoManager.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  /** 同步画布 CSS 尺寸和 WebGL 后备缓冲，避免布局变化后视口变黑或取景错位。 */
  public resize(): void {
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
    this.engine.setHardwareScalingLevel(enabled ? Math.max(1.25, window.devicePixelRatio || 1.25) : 1);
    this.scene.skipPointerMovePicking = enabled;
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

  /** 进入预览模式时保存编辑视角、隐藏编辑辅助交互，并播放动画。 */
  private enterPreviewMode(): void {
    this.previewMode = true;
    this.previewCameraSnapshot = this.capturePreviewCameraSnapshot();
    this.applyHighlight(null);
    this.syncGizmoMode();
    this.frameEditableSceneInView(this.selectedNode);
    this.startPreviewAnimations();
    this.scene.render();
  }

  /** 退出预览模式时停止动画，并恢复进入预览前的编辑视角与选择辅助。 */
  private exitPreviewMode(): void {
    this.stopPreviewAnimations();
    this.restorePreviewCameraSnapshot();
    this.previewMode = false;
    this.applyHighlight(this.selectedNode);
    this.syncGizmoMode();
    this.scene.render();
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

  /** 根据层级面板传入的 uniqueId 快速定位到场景节点。 */
  public focusById(id: number): void {
    const node = this.findTransformNodeByUniqueId(id);
    if (!(node instanceof TransformNode) || node.metadata?.[HELPER_FLAG]) {
      return;
    }

    this.selectNode(node);
    this.frameNodeInView(node);
  }

  /** 根据层级面板传入的 uniqueId 切换场景节点显隐，并刷新层级树和属性面板。 */
  public setNodeVisibilityById(id: number, visible: boolean): void {
    const node = this.findSceneNodeByUniqueId(id);
    if (!node || node.metadata?.[HELPER_FLAG]) {
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

  /** 删除当前选中的可编辑节点，并同步层级树、属性面板和性能统计。 */
  public deleteSelected(): void {
    const node = this.selectedNode;
    if (!node || node.metadata?.[HELPER_FLAG]) {
      return;
    }

    this.selectNode(null);
    this.disposeEditableNode(node);
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
  }

  /** 复制当前选中的可编辑节点到引擎内部剪贴板，供后续 Ctrl+V 复用。 */
  public copySelected(): boolean {
    const sourceNode = this.selectedNode;
    if (this.previewMode || !sourceNode || sourceNode.metadata?.[HELPER_FLAG]) {
      return false;
    }

    const sourcePackageRoot = this.findModelPackageRoot(sourceNode) ?? sourceNode;
    const sourceModelPackage = this.getModelPackageAssetForRoot(sourcePackageRoot)?.modelPackage;
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

    const file = this.assetFiles.get(assetId);
    if (!file) {
      const clonedNode = this.instantiateAssetFromSceneTemplate(asset, position);
      return Boolean(clonedNode);
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

  /** 从工具栏导入 DXF CAD 图纸，解析器会把图纸源单位统一换算成米制矢量线。 */
  public async importCadDrawing(file: File): Promise<CadDxfParseResult> {
    const extension = this.getFileExtension(file.name);
    if (extension === ".dwg") {
      throw new Error("当前 CAD 导入支持 DXF 文本图纸；DWG 请先转换为 DXF 后再导入。");
    }

    if (extension !== ".dxf") {
      throw new Error("请选择 .dxf 格式的 CAD 图纸。");
    }

    const parsed = parseCadDxf(file.name, await file.text());
    const root = this.createCadGroundDrawing(parsed, file.name);
    this.selectNode(root);
    this.ensureNodeGridCoverage(root);
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
    this.scene.render();
    return parsed;
  }

  /** 根据 CAD 解析结果创建贴地矢量根节点，图纸尺寸已按项目米制单位归一。 */
  private createCadGroundDrawing(drawing: CadDxfParseResult, sourceFile: string): TransformNode {
    const root = new TransformNode(`CAD 图纸 - ${drawing.name}`, this.scene);
    root.metadata = {
      ...this.withMetricModelMetadata(
        {
          cadDrawing: true,
          cad: {
            format: "DXF",
            sourceFile,
            sourceUnit: drawing.unit.sourceUnit,
            unitScaleToMeters: drawing.unit.unitScaleToMeters,
            unitInferenceMethod: drawing.unit.inferenceMethod,
            unitInferenceConfidence: drawing.unit.confidence,
            insunitsCode: drawing.unit.insunitsCode,
            measurementCode: drawing.unit.measurementCode,
            bounds: drawing.bounds,
            rawBounds: drawing.rawBounds,
            layers: drawing.layers,
            entityCount: drawing.entityCount,
            segmentCount: drawing.segmentCount,
            warnings: drawing.warnings
          }
        },
        {
          sourceFile,
          sourceUnit: drawing.unit.sourceUnit,
          unitScaleToMeters: drawing.unit.unitScaleToMeters,
          modelUnitPolicy: "cad-drawing-source-units-normalized-to-meters"
        }
      ),
      [ROOT_FLAG]: true
    };

    this.groupCadPolylinesByLayer(drawing.polylines).forEach((polylines, layer) => {
      const layerIndex = Math.max(0, drawing.layers.indexOf(layer));
      this.createCadLayerLineSystems(root, drawing.bounds, layer, polylines, this.getCadLayerColor(layerIndex));
    });

    return root;
  }

  /** 按图层归并 CAD 折线，便于每层使用稳定颜色和较少 LineSystem。 */
  private groupCadPolylinesByLayer(polylines: CadDxfPolyline[]): Map<string, CadDxfPolyline[]> {
    const grouped = new Map<string, CadDxfPolyline[]>();
    polylines.forEach((polyline) => {
      const layer = polyline.layer || "0";
      const bucket = grouped.get(layer);
      if (bucket) {
        bucket.push(polyline);
      } else {
        grouped.set(layer, [polyline]);
      }
    });
    return grouped;
  }

  /** 为单个 CAD 图层创建一个或多个 LineSystem，分块避免超大图纸单网格过重。 */
  private createCadLayerLineSystems(
    root: TransformNode,
    bounds: CadDxfBounds,
    layer: string,
    polylines: CadDxfPolyline[],
    color: Color4
  ): void {
    let lines: Vector3[][] = [];
    let colors: Color4[][] = [];
    let segmentCount = 0;
    let chunkIndex = 1;
    const flushChunk = () => {
      if (lines.length === 0) {
        return;
      }

      const lineSystem = MeshBuilder.CreateLineSystem(
        `${root.name} / ${layer} #${chunkIndex}`,
        { lines, colors, useVertexAlpha: true },
        this.scene
      );
      lineSystem.parent = root;
      lineSystem.isPickable = true;
      lineSystem.alwaysSelectAsActiveMesh = true;
      lineSystem.metadata = { cadDrawingLine: true, cadLayer: layer };
      lines = [];
      colors = [];
      segmentCount = 0;
      chunkIndex += 1;
    };

    polylines.forEach((polyline) => {
      const points = polyline.points.map((point) => this.toCadGroundPoint(point, bounds));
      const nextSegmentCount = Math.max(0, points.length - 1);
      if (nextSegmentCount <= 0) {
        return;
      }

      if (segmentCount > 0 && segmentCount + nextSegmentCount > CAD_LINE_CHUNK_SEGMENTS) {
        flushChunk();
      }

      lines.push(points);
      colors.push(points.map(() => color.clone()));
      segmentCount += nextSegmentCount;
    });

    flushChunk();
  }

  /** 将已换算为米的 CAD XY 平面映射到 Babylon XZ 网格，整张图纸居中到世界原点。 */
  private toCadGroundPoint(point: { x: number; y: number }, bounds: CadDxfBounds): Vector3 {
    return new Vector3(point.x - bounds.centerX, CAD_LINE_ELEVATION_METERS, -(point.y - bounds.centerY));
  }

  /** 为 CAD 图层生成稳定高对比颜色，便于在深色网格上区分不同图层。 */
  private getCadLayerColor(layerIndex: number): Color4 {
    const palette = ["#52d6a6", "#77aaff", "#f4c542", "#fb7770", "#b58cff", "#62d0ff", "#f0a45d", "#9ddc62"];
    const color = this.hexToColor3(palette[layerIndex % palette.length]);
    return new Color4(color.r, color.g, color.b, 0.98);
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

  /** 序列化当前编辑场景，供项目文件保存或浏览器下载复用。 */
  public serializeScene(): unknown {
    if (this.previewMode) {
      this.exitPreviewMode();
    }

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
    }
  }

  /** 从项目场景文件恢复 Babylon 内容，并保留编辑器自己的相机、网格和交互辅助对象。 */
  public async loadSerializedScene(serializedScene: unknown): Promise<void> {
    if (!this.isSerializedScene(serializedScene)) {
      return;
    }

    if (this.previewMode) {
      this.exitPreviewMode();
    }

    const loadableScene = this.createLoadableSerializedScene(serializedScene);
    const sceneUrl = this.createSerializedSceneUrl(loadableScene);
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
    }
    this.scene.activeCamera = this.editorCamera;
    this.editorCamera.attachControl(this.canvas, true);
    this.prepareLoadedScene(loadableScene);
    const selectedNode = this.selectFirstEditableNode();
    this.frameEditableSceneInView(selectedNode);
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
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

    if (update.name !== undefined) {
      node.name = update.name.trim() || node.name;
      graphDirty = true;
    }

    if (update.position) {
      applySnapshotVector(node.position, update.position);
    }

    if (update.rotation) {
      node.rotationQuaternion = null;
      applySnapshotVector(node.rotation, update.rotation, "degrees");
    }

    if (update.scaling) {
      applySnapshotVector(node.scaling, update.scaling);
    }

    if (update.visible !== undefined) {
      this.updateNodeVisibility(node, update.visible);
      graphDirty = true;
    }

    if (update.materialColor) {
      this.updateNodeMaterialColor(node, update.materialColor);
      this.updateNodeMeshVertexModify(node, { mainColor: update.materialColor });
    }

    if (update.meshVertexModify) {
      this.updateNodeMeshVertexModify(node, update.meshVertexModify);
      if (update.meshVertexModify.mainColor) {
        this.updateNodeMaterialColor(node, update.meshVertexModify.mainColor);
      }
    }

    if (update.assetInfo) {
      this.updateNodeAssetInfo(node, update.assetInfo);
    }

    if (update.dynamicParameter) {
      this.updateNodeDynamicParameter(node, update.dynamicParameter);
      graphDirty = true;
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
    this.selectNode(null);
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
  }

  /** 恢复加载后节点的可编辑元数据，并从序列化数据中取回资产列表。 */
  private prepareLoadedScene(serializedScene: Record<string, unknown>): void {
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
        }
      });

    const restoredAssets = this.getSerializedAssets(serializedScene);
    this.assets.splice(0, this.assets.length, ...restoredAssets);
    this.callbacks.onAssetsChange([...this.assets]);
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
      material.dispose(false, false, false);
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
  private cloneEditableNode(sourceNode: TransformNode, name: string): TransformNode | null {
    const clone = sourceNode.clone(name, null, false);
    return clone instanceof TransformNode ? clone : null;
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

      this.selectNode(this.findSelectableRoot(mesh));
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

    if (kind !== "ground") {
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
      sphere: "球体",
      cylinder: "圆柱体",
      ground: "地面",
      light: "点光源"
    };

    return names[kind];
  }

  /** 创建可编辑 POI 根节点和其基础可视部件。 */
  private createPoi(kind: PoiKind, position: Vector3): TransformNode {
    const definition = this.getPoiDefinition(kind);
    const name = `${definition.name} ${this.poiSeed++}`;
    const root = new TransformNode(name, this.scene);
    root.position.copyFrom(position);
    root.metadata = {
      ...this.withMetricModelMetadata({ poi: kind }),
      [ROOT_FLAG]: true,
      poi: kind
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
    if (definition.shape === "camera") {
      this.createCameraPoiShape(root, name, definition);
      return;
    }

    if (definition.shape === "device") {
      this.createDevicePoiShape(root, name, definition);
      return;
    }

    if (definition.shape === "panel") {
      this.createPanelPoiShape(root, name, definition);
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
      definition.text,
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
    const definitions: Record<PoiKind, PoiDefinition> = {
      marker: {
        name: "POI 标记点",
        text: "标记点",
        colorHex: "#4f9cff",
        emissiveHex: "#6fb0ff",
        shape: "pin"
      },
      info: {
        name: "POI 信息点",
        text: "信息",
        colorHex: "#4fb477",
        emissiveHex: "#73d99a",
        shape: "pin"
      },
      warning: {
        name: "POI 告警点",
        text: "告警",
        colorHex: "#d85f4f",
        emissiveHex: "#ff7b68",
        shape: "pin"
      },
      camera: {
        name: "POI 摄像头",
        text: "摄像头",
        colorHex: "#b58cff",
        emissiveHex: "#c9a8ff",
        shape: "camera"
      },
      device: {
        name: "POI 设备点",
        text: "设备",
        colorHex: "#d6a247",
        emissiveHex: "#f0bd62",
        shape: "device"
      },
      label: {
        name: "POI 文本标签",
        text: "标签",
        colorHex: "#65c7c0",
        emissiveHex: "#86e3dc",
        shape: "panel"
      }
    };

    return definitions[kind];
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
    material.diffuseTexture = new Texture(url, this.scene, false, false, undefined, () => URL.revokeObjectURL(url), () => URL.revokeObjectURL(url));
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
    this.selectedNode = node;
    this.applyHighlight(node);
    this.syncGizmoMode();
    this.emitSelectionSnapshot();
    this.refreshSceneGraph();
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

  /** 按 uniqueId 查找层级面板可展示的场景节点。 */
  private findSceneNodeByUniqueId(id: number): Node | undefined {
    return [...this.scene.meshes, ...this.scene.transformNodes, ...this.scene.lights, ...this.scene.cameras].find((node) => node.uniqueId === id);
  }

  /** 根据当前工具模式开启对应 Gizmo，并附着到选中节点。 */
  private syncGizmoMode(): void {
    if (this.previewMode) {
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
    this.gizmoManager.boundingBoxGizmoEnabled = this.currentTool === "select" && Boolean(this.selectedNode);
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

  /** 刷新选中高亮层，TransformNode 会高亮其所有子网格。 */
  private applyHighlight(node: TransformNode | null): void {
    this.highlightedMeshes.forEach((mesh) => this.highlightLayer.removeMesh(mesh));
    this.highlightedMeshes.clear();

    if (!node) {
      return;
    }

    this.getEditableMeshes(node)
      .filter((mesh): mesh is Mesh => mesh instanceof Mesh && !mesh.metadata?.[HELPER_FLAG])
      .forEach((mesh) => {
        this.highlightLayer.addMesh(mesh, Color3.FromHexString("#f4c542"));
        this.highlightedMeshes.add(mesh);
      });
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
      meshVertexModify: this.getNodeMeshVertexModify(node, materialColor),
      assetInfo: this.getNodeAssetInfo(node),
      dynamicParameters: this.getNodeDynamicParameters(node)
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
      ...this.createDefaultDynamicParameterValues(asset.modelPackage.dynamicFields),
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

  /** 将模型包实例信息写入导入根节点 metadata，参数值随场景序列化保存。 */
  private attachModelPackageMetadata(root: TransformNode, assetId: string, manifest: ModelPackageManifest): void {
    const values = this.createDefaultDynamicParameterValues(manifest.dynamicFields);
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

    const methodName = handle.started ? "onUpdate" : "onStart";
    const warning = this.runModelPackageLifecycleWithPositionGuard(root, () =>
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
      this.applyHighlight(this.selectedNode);
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

    const warning = this.runModelPackageLifecycleWithPositionGuard(root, () =>
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

  /** 包住生命周期调用，只保护模型包根节点位置，缩放和角度仍允许由脚本参数驱动。 */
  private runModelPackageLifecycleWithPositionGuard(root: TransformNode, action: () => string | undefined): string | undefined {
    const position = root.position.clone();
    try {
      return action();
    } finally {
      root.position.copyFrom(position);
      this.refreshNodeWorldMatrices(root);
    }
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
          configuration: {
            type: field.kind,
            min: field.min,
            max: field.max,
            step: field.step
          }
        })),
        values
      }
    ];

    if (runtimeScriptFile) {
      scripts.push({
        scriptFilename: runtimeScriptFile,
        className: runtimeClassName,
        values: {}
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
      ...this.createDefaultDynamicParameterValues(manifest.dynamicFields),
      ...this.asMetadataObject(instance.values)
    } as Record<string, DynamicParameterValue>;
  }

  /** 根据根节点 metadata 找到对应资产记录。 */
  private getModelPackageAssetForRoot(root: TransformNode): AssetRecord | undefined {
    const editorMetadata = this.getNodeEditorMetadata(root);
    const instance = this.asMetadataObject(editorMetadata.modelPackageInstance);
    const assetId = typeof instance.assetId === "string" ? instance.assetId : "";
    const packageId = typeof instance.packageId === "string" ? instance.packageId : "";
    return this.assets.find((item) => item.id === assetId && item.modelPackage?.packageId === packageId);
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
    this.getNodeHierarchy(root)
      .filter((node): node is TransformNode => node instanceof TransformNode && node !== root)
      .filter((node) => Boolean(this.asMetadataObject(node.metadata).generatedByParametricRuntime))
      .forEach((node) => node.dispose(false, false));
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
    roots.forEach((node) => this.pushTopLevelNodeSummary(nodes, node));
    this.callbacks.onSceneGraphChange(nodes);
  }

  /** 将场景顶层对象压入层级列表，导入模型的内部子节点不在左侧面板展开。 */
  private pushTopLevelNodeSummary(output: SceneNodeSummary[], node: Node): void {
    if (node.metadata?.[HELPER_FLAG]) {
      return;
    }

    const children = this.getVisibleChildren(node);
    output.push({
      id: node.uniqueId,
      name: node.name,
      kind: this.getNodeKind(node),
      depth: 0,
      selected: this.selectedNode?.uniqueId === node.uniqueId,
      visible: node instanceof TransformNode ? this.getNodeVisibility(node) : node.isEnabled(),
      childCount: children.length
    });
  }

  /** 获取层级树可展示的子节点，兼容不同 Babylon Node 类型。 */
  private getVisibleChildren(node: Node): Node[] {
    return this.getSceneChildren(node, false);
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

  /** 判断节点类别，供层级树和属性面板显示。 */
  private getNodeKind(node: Node): SceneNodeKind {
    if (node.metadata?.[HELPER_FLAG]) {
      return "Helper";
    }

    if (node.metadata?.primitive === "light") {
      return "Light";
    }

    if (typeof node.metadata?.poi === "string") {
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
    return {
      fps: Math.round(this.engine.getFps()),
      meshes: meshes.length,
      activeMeshes: Number((this.scene.getActiveMeshes() as unknown as { length: number }).length ?? 0),
      vertices: meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0),
      drawCalls: 0
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

  /** 把场景数据驱动配置收敛为稳定快照，当前只负责持久化配置。 */
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
      size: this.getNumberMetadata(value.size, DEFAULT_SCENE_DATA_DRIVEN.size)
    };
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
    const sourceNode = this.scene.rootNodes.find(
      (node): node is TransformNode =>
        node instanceof TransformNode &&
        !node.metadata?.[HELPER_FLAG] &&
        this.isSceneTemplateMatchForAsset(node, asset, assetUnitMetadata)
    );
    if (!sourceNode) {
      return null;
    }

    if (asset.modelPackage) {
      this.stopModelPackageRuntime(sourceNode, true);
    }
    const clone = sourceNode.clone(`${sourceNode.name} 副本`, null, false);
    if (asset.modelPackage) {
      this.applyModelPackageRuntime(sourceNode, asset.modelPackage, "clone");
    }
    if (!(clone instanceof TransformNode)) {
      return null;
    }

    clone.metadata = {
      ...this.asMetadataObject(sourceNode.metadata),
      [ROOT_FLAG]: true
    };
    if (clone instanceof AbstractMesh) {
      clone.isPickable = true;
    }
    clone.getChildMeshes().forEach((mesh) => {
      mesh.isPickable = true;
    });

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
      Array.isArray(manifest.files) &&
      manifest.files.every((file) => this.isModelPackageProjectFile(file)) &&
      Array.isArray(manifest.dynamicFields) &&
      manifest.dynamicFields.every((field) => this.isDynamicInspectorField(field)) &&
      Array.isArray(manifest.warnings) &&
      manifest.warnings.every((warning) => typeof warning === "string") &&
      typeof manifest.importedAt === "number"
    );
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
