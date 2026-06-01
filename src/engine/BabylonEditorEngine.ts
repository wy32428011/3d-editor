import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Loading/Plugins/babylonFileLoader";
import "@babylonjs/core/Materials/imageProcessingConfiguration";
import "@babylonjs/core/Meshes/groundMesh";
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
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Node } from "@babylonjs/core/node";
import { ImportMeshAsync, LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { SceneSerializer } from "@babylonjs/core/Misc/sceneSerializer";
import { Scene } from "@babylonjs/core/scene";
import { applySnapshotVector, formatBytes, snapshotVector } from "../editor/math";
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
import type {
  AssetRecord,
  EditorEngineCallbacks,
  EditorStats,
  EditorTool,
  PrimitiveKind,
  SceneNodeKind,
  SceneNodeSummary,
  TransformSnapshot,
  TransformUpdate
} from "../types/editor";

const HELPER_FLAG = "isEditorHelper";
const ROOT_FLAG = "isEditorRoot";
const DROP_SURFACE_FLAG = "isEditorDropSurface";
const GRID_RENDER_ELEVATION_METERS = 0.015;
const GRID_MAJOR_LINE_EVERY_CELLS = 5;
const MAX_GRID_LINE_COUNT_PER_AXIS = 160;

/** 节点世界包围盒信息，用于导入落点、相机取景和自适应网格。 */
interface NodeWorldBounds {
  minimum: Vector3;
  maximum: Vector3;
  center: Vector3;
  size: Vector3;
  maxDimension: number;
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
  private readonly highlightedMeshes = new Set<Mesh>();
  private selectedNode: TransformNode | null = null;
  private currentTool: EditorTool = "move";
  private performanceMode = false;
  private statsStamp = 0;
  private primitiveSeed = 1;
  private transformSyncFrame = 0;
  private gridCoverageSizeMeters = EDITOR_GRID_SIZE_METERS;
  private readonly gridHelperMeshes: AbstractMesh[] = [];
  private readonly observedTransformGizmos = new WeakSet<object>();
  private readonly handleResize = () => this.engine.resize();

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
    this.scene.clearColor = new Color4(0.07, 0.075, 0.075, 1);

    this.editorCamera = this.createEditorCamera();
    this.gizmoManager = new GizmoManager(this.scene);
    this.highlightLayer = new HighlightLayer("EditorSelectionHighlight", this.scene);

    this.configureGizmos();
    this.createDefaultScene();
    this.bindPointerSelection();
    this.bindStatsLoop();
    this.bindResize();
    this.engine.runRenderLoop(() => this.scene.render());
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
    this.highlightLayer.dispose();
    this.gizmoManager.dispose();
    this.scene.dispose();
    this.engine.dispose();
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

  /** 创建基础几何体或灯光，并放置到指定位置。 */
  public addPrimitive(kind: PrimitiveKind, position = Vector3.Zero()): TransformNode {
    const node = this.createPrimitive(kind, position);
    this.selectNode(node);
    this.refreshSceneGraph();
    return node;
  }

  /** 导入用户拖入的模型、贴图或 Babylon 场景文件。 */
  public async importFiles(files: FileList | File[], position = Vector3.Zero()): Promise<void> {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      const extension = this.getFileExtension(file.name);
      if (this.isTextureFile(extension)) {
        this.registerAsset(file, "texture");
        this.applyTextureToSelection(file);
        continue;
      }

      if (this.isSceneFile(extension)) {
        await this.importSceneFile(file, extension, position);
      }
    }

    this.callbacks.onAssetsChange([...this.assets]);
    this.refreshSceneGraph();
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
    const serialized = SceneSerializer.Serialize(this.scene) as Record<string, unknown>;
    this.stripEditorRuntimeSerialization(serialized);
    const metadata = serialized.metadata && typeof serialized.metadata === "object" ? serialized.metadata : {};
    serialized.metadata = {
      ...metadata,
      editor: {
        name: "Babylon Unity-like 3D Editor",
        savedAt: new Date().toISOString(),
        unitSystem: {
          length: "meter",
          babylonUnitInMeters: SCENE_UNIT_IN_METERS
        },
        assets: this.assets
      }
    };
    return serialized;
  }

  /** 从项目场景文件恢复 Babylon 内容，并保留编辑器自己的相机、网格和交互辅助对象。 */
  public async loadSerializedScene(serializedScene: unknown): Promise<void> {
    if (!this.isSerializedScene(serializedScene)) {
      return;
    }

    const loadableScene = this.createLoadableSerializedScene(serializedScene);
    const sceneUrl = this.createSerializedSceneUrl(loadableScene);
    try {
      // 先完整解析到资产容器，成功后再替换视口内容，避免坏场景把当前场景清空。
      const container = await LoadAssetContainerAsync(sceneUrl, this.scene, { pluginExtension: ".babylon" });
      this.clearEditableScene();
      container.addAllToScene();
    } finally {
      URL.revokeObjectURL(sceneUrl);
    }
    this.scene.activeCamera = this.editorCamera;
    this.editorCamera.attachControl(this.canvas, true);
    this.prepareLoadedScene(loadableScene);
    this.selectFirstEditableNode();
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

  /** 从属性面板更新当前选中对象的名称、变换、显隐和材质颜色。 */
  public updateSelected(update: TransformUpdate): void {
    if (!this.selectedNode) {
      return;
    }

    if (update.name !== undefined) {
      this.selectedNode.name = update.name.trim() || this.selectedNode.name;
    }

    if (update.position) {
      applySnapshotVector(this.selectedNode.position, update.position);
    }

    if (update.rotation) {
      this.selectedNode.rotationQuaternion = null;
      applySnapshotVector(this.selectedNode.rotation, update.rotation, "degrees");
    }

    if (update.scaling) {
      applySnapshotVector(this.selectedNode.scaling, update.scaling);
    }

    if (update.visible !== undefined) {
      this.updateNodeVisibility(this.selectedNode, update.visible);
    }

    if (update.materialColor) {
      this.updateNodeMaterialColor(this.selectedNode, update.materialColor);
    }

    this.refreshNodeWorldMatrices(this.selectedNode);
    this.emitSelectionSnapshot();
    this.refreshSceneGraph();
    this.scene.render();
  }

  /** 创建编辑器视口相机，提供类似 Unity Scene View 的轨道操作体验。 */
  private createEditorCamera(): ArcRotateCamera {
    const camera = new ArcRotateCamera("Editor Camera", Math.PI / 4, Math.PI / 3, 16, new Vector3(0, 1, 0), this.scene);
    camera.metadata = { [HELPER_FLAG]: true };
    camera.doNotSerialize = true;
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 120;
    camera.wheelPrecision = 45;
    camera.panningSensibility = 55;
    camera.minZ = 0.05;
    camera.maxZ = 1000;
    camera.attachControl(this.canvas, true);
    return camera;
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
    this.registerBuiltinAsset("Cube", "primitive");
    this.registerBuiltinAsset("Sphere", "primitive");
    this.registerBuiltinAsset("Ground", "primitive");
    this.callbacks.onAssetsChange([...this.assets]);
    this.refreshSceneGraph();
  }

  /** 清空可编辑内容，避免加载项目场景时和默认对象叠加。 */
  private clearEditableScene(): void {
    this.selectNode(null);
    [...this.scene.rootNodes].filter((node) => !node.metadata?.[HELPER_FLAG]).forEach((node) => node.dispose());
    this.scene.lights.filter((light) => !light.metadata?.[HELPER_FLAG]).forEach((light) => light.dispose());
    this.scene.cameras
      .filter((camera) => camera !== this.editorCamera && !camera.metadata?.[HELPER_FLAG])
      .forEach((camera) => camera.dispose());
    this.scene.materials.filter((material) => !material.doNotSerialize).forEach((material) => material.dispose(true, true));
    this.assets.splice(0, this.assets.length);
    this.callbacks.onAssetsChange([]);
    this.refreshSceneGraph();
    this.callbacks.onStatsChange(this.collectStats());
  }

  /** 恢复加载后节点的可编辑元数据，并从序列化数据中取回资产列表。 */
  private prepareLoadedScene(serializedScene: Record<string, unknown>): void {
    this.scene.rootNodes
      .filter((node) => !node.metadata?.[HELPER_FLAG])
      .forEach((node) => {
        if (node instanceof TransformNode) {
          node.metadata = { ...node.metadata, [ROOT_FLAG]: node.metadata?.[ROOT_FLAG] ?? true };
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
    if (this.assets.length === 0) {
      this.registerBuiltinAsset("Cube", "primitive");
      this.registerBuiltinAsset("Sphere", "primitive");
      this.registerBuiltinAsset("Ground", "primitive");
    }
    this.callbacks.onAssetsChange([...this.assets]);
  }

  /** 释放单个可编辑节点，包含其子网格和独占材质，避免导入模型删除后残留资源。 */
  private disposeEditableNode(node: TransformNode): void {
    const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
    const materials = new Set(
      meshes.map((mesh) => mesh.material).filter((material) => material && !material.doNotSerialize)
    );
    node.dispose(false, true);
    materials.forEach((material) => material?.dispose(true, true));
  }

  /** 选择加载后第一个可编辑根节点，让属性面板立即进入可用状态。 */
  private selectFirstEditableNode(): void {
    const firstNode = this.scene.rootNodes.find((node) => node instanceof TransformNode && !node.metadata?.[HELPER_FLAG]);
    this.selectNode(firstNode instanceof TransformNode ? firstNode : null);
  }

  /** 创建独立线段工作网格和透明拖放平面，避免网格与实体地面共面闪烁或被遮挡。 */
  private createGridHelper(sizeMeters = EDITOR_GRID_SIZE_METERS, cellSizeMeters = EDITOR_GRID_CELL_SIZE_METERS): void {
    this.disposeGridHelper();

    const cellSize = Math.max(EDITOR_GRID_CELL_SIZE_METERS, cellSizeMeters);
    const lineCount = Math.max(2, Math.ceil(sizeMeters / cellSize));
    const coverageSize = lineCount * cellSize;
    const halfSize = coverageSize / 2;
    const minorLines: Vector3[][] = [];
    const majorLines: Vector3[][] = [];
    const axisXLines: Vector3[][] = [];
    const axisZLines: Vector3[][] = [];

    for (let index = 0; index <= lineCount; index += 1) {
      const rawCoordinate = -halfSize + index * cellSize;
      const coordinate = Math.abs(rawCoordinate) < cellSize * 0.001 ? 0 : Number(rawCoordinate.toFixed(6));
      const lineAlongX = [
        new Vector3(-halfSize, GRID_RENDER_ELEVATION_METERS, coordinate),
        new Vector3(halfSize, GRID_RENDER_ELEVATION_METERS, coordinate)
      ];
      const lineAlongZ = [
        new Vector3(coordinate, GRID_RENDER_ELEVATION_METERS, -halfSize),
        new Vector3(coordinate, GRID_RENDER_ELEVATION_METERS, halfSize)
      ];

      if (coordinate === 0) {
        axisXLines.push(lineAlongX);
        axisZLines.push(lineAlongZ);
      } else if (index % GRID_MAJOR_LINE_EVERY_CELLS === 0) {
        majorLines.push(lineAlongX, lineAlongZ);
      } else {
        minorLines.push(lineAlongX, lineAlongZ);
      }
    }

    this.pushGridLineSystem("编辑网格细线", minorLines, new Color4(0.24, 0.3, 0.25, 0.4));
    this.pushGridLineSystem("编辑网格主线", majorLines, new Color4(0.42, 0.5, 0.4, 0.68));
    this.pushGridLineSystem("编辑网格 X 轴", axisXLines, new Color4(0.78, 0.3, 0.28, 0.9));
    this.pushGridLineSystem("编辑网格 Z 轴", axisZLines, new Color4(0.28, 0.46, 0.86, 0.9));
    this.gridHelperMeshes.push(this.createGridDropSurface(coverageSize));
    this.gridCoverageSizeMeters = coverageSize;
  }

  /** 释放旧网格辅助对象，供导入超大模型后重建更大参考网格。 */
  private disposeGridHelper(): void {
    const materials = new Set(this.gridHelperMeshes.map((mesh) => mesh.material).filter(Boolean));
    this.gridHelperMeshes.forEach((mesh) => mesh.dispose());
    materials.forEach((material) => material?.dispose());
    this.gridHelperMeshes.length = 0;
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
  }

  /** 创建只用于拖放拾取的透明地面，视觉网格不再承担拾取职责。 */
  private createGridDropSurface(sizeMeters: number): Mesh {
    const surface = MeshBuilder.CreateGround(
      "编辑拖放平面",
      { width: sizeMeters, height: sizeMeters, subdivisions: 1 },
      this.scene
    );
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
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK || this.gizmoManager.isDragging) {
        return;
      }

      const event = pointerInfo.event as PointerEvent;
      if (event.button !== 0) {
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

  /** 导入模型或场景文件，并把导入根节点移动到落点。 */
  private async importSceneFile(file: File, extension: string, position: Vector3): Promise<void> {
    const result = await ImportMeshAsync(file, this.scene, {
      meshNames: null,
      pluginExtension: extension,
      name: file.name
    });
    const root = this.prepareImportedNodes(file.name, result.meshes, result.transformNodes, position);
    this.registerAsset(file, extension === ".babylon" ? "scene" : "model");
    if (root) {
      this.selectNode(root);
      this.frameNodeInView(root);
    }
  }

  /** 为导入的网格和空分组节点补充编辑器元数据，并保留模型原始父子层级。 */
  private prepareImportedNodes(
    fileName: string,
    meshes: AbstractMesh[],
    transformNodes: TransformNode[],
    position: Vector3
  ): TransformNode | null {
    const importedNodes = this.getUniqueImportedNodes(meshes, transformNodes);
    if (importedNodes.length === 0) {
      return null;
    }

    importedNodes.forEach((node) => {
      node.metadata = {
        ...node.metadata,
        sourceFile: fileName
      };
      if (node instanceof AbstractMesh) {
        node.isPickable = true;
      }
    });

    const importedRoots = this.getImportedRootNodes(importedNodes);
    const displayName = fileName.replace(/\.[^.]+$/, "");
    const root = importedRoots.length === 1 ? importedRoots[0] : new TransformNode(displayName, this.scene);
    if (importedRoots.length > 1) {
      importedRoots.forEach((node) => node.setParent(root));
    }

    root.name = root.name === "__root__" || root.name === "root" ? displayName : root.name;
    root.metadata = { ...root.metadata, [ROOT_FLAG]: true };
    this.alignNodeBaseToPosition(root, position);
    return root;
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

  /** 导入模型后自动把相机拉到模型包围盒前，保证用户立即看得到新模型。 */
  private frameNodeInView(node: TransformNode): void {
    const bounds = this.getNodeWorldBounds(node);
    if (!bounds) {
      return;
    }

    this.ensureGridCoversBounds(bounds);
    const radius = Math.max(bounds.maxDimension * 2.2, 3);
    this.editorCamera.setTarget(bounds.center);
    this.editorCamera.upperRadiusLimit = Math.max(this.editorCamera.upperRadiusLimit ?? 0, radius * 2);
    this.editorCamera.maxZ = Math.max(this.editorCamera.maxZ, radius * 4);
    this.editorCamera.radius = radius;
    this.editorCamera.attachControl(this.canvas, true);
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

    this.createGridHelper(desiredSize, this.pickGridCellSize(desiredSize));
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
  private registerAsset(file: File, type: AssetRecord["type"]): void {
    this.assets.unshift({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      type,
      sizeLabel: formatBytes(file.size),
      createdAt: Date.now()
    });
  }

  /** 登记内置资产，避免初始资产面板为空。 */
  private registerBuiltinAsset(name: string, type: AssetRecord["type"]): void {
    this.assets.push({
      id: `builtin-${name}`,
      name,
      type,
      sizeLabel: "内置",
      createdAt: Date.now()
    });
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

  /** 根据当前工具模式开启对应 Gizmo，并附着到选中节点。 */
  private syncGizmoMode(): void {
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
      this.callbacks.onSelectionChange(null);
      return;
    }

    this.callbacks.onSelectionChange(this.createTransformSnapshot(this.selectedNode));
  }

  /** 从 Babylon 节点创建属性面板需要的完整快照。 */
  private createTransformSnapshot(node: TransformNode): TransformSnapshot {
    const rotation = node.rotationQuaternion ? node.rotationQuaternion.toEulerAngles() : node.rotation;
    return {
      id: node.uniqueId,
      name: node.name,
      kind: this.getNodeKind(node),
      position: snapshotVector(node.position),
      rotation: snapshotVector(rotation, "degrees"),
      scaling: snapshotVector(node.scaling),
      visible: this.getNodeVisibility(node),
      materialColor: this.getNodeMaterialColor(node)
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
      visible: node instanceof AbstractMesh ? node.isVisible : true,
      childCount: children.length
    });
  }

  /** 获取层级树可展示的子节点，兼容不同 Babylon Node 类型。 */
  private getVisibleChildren(node: Node): Node[] {
    const seen = new Set<number>();
    const candidates: Node[] = [...this.scene.transformNodes, ...this.scene.meshes, ...this.scene.lights, ...this.scene.cameras];
    return candidates.filter((child) => {
      if (child.parent !== node || child.metadata?.[HELPER_FLAG] || seen.has(child.uniqueId)) {
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

  /** 判断项目场景负载是否像一个 Babylon 序列化对象。 */
  private isSerializedScene(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  /** 从 Babylon 场景元数据中恢复资产面板记录。 */
  private getSerializedAssets(serializedScene: Record<string, unknown>): AssetRecord[] {
    const metadata = serializedScene.metadata as { editor?: { assets?: unknown } } | undefined;
    const assets = metadata?.editor?.assets;
    if (!Array.isArray(assets)) {
      return [];
    }

    return assets.filter((asset): asset is AssetRecord => this.isAssetRecord(asset));
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
      typeof asset.createdAt === "number"
    );
  }
}
