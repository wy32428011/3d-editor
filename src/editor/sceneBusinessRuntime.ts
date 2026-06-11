import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Node } from "@babylonjs/core/node";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { Scene } from "@babylonjs/core/scene";
import { createBusinessDataConnection, type BusinessDataConnection, type BusinessDataMessageMetadata } from "./businessDataConnection";
import { applyLogisticsMqttFrameDefaults, parseLogisticsMqttTopic } from "./mqttLogisticsProtocol";
import type { AssetRecord, PoiConfigSnapshot, PoiRuntimeState, SceneDataDrivenSnapshot } from "../types/editor";

const POI_RUNTIME_FLAG = "isPoiRuntimeGenerated";
const POI_RUNTIME_OWNER_ID = "poiRuntimeOwnerId";
const POI_RUNTIME_REUSE_KEY = "poiRuntimeReuseKey";
const MAX_POI_TREND_POINTS = 16;
const MAX_RUNTIME_SPAWN_PER_TICK = 1;
const DEFAULT_RUNTIME_FRAME_MS = 16;
const MAX_INTERNAL_EVENT_DEPTH = 8;

/** POI runtime 需要的宿主能力，具体 Babylon 创建和资源读取仍由引擎负责。 */
interface SceneBusinessRuntimeOptions {
  scene: Scene;
  camera: ArcRotateCamera;
  getConfig: () => SceneDataDrivenSnapshot;
  getPoiNodes: () => TransformNode[];
  getPoiConfig: (node: TransformNode) => PoiConfigSnapshot;
  getEditableRoots: () => TransformNode[];
  getAssets: () => AssetRecord[];
  onPoiChanged: (nodes: TransformNode[], now: number) => void;
}

/** 单个 POI 运行中间态，只放在内存中，不写回 metadata。 */
interface PoiRuntimeInternalState extends PoiRuntimeState {
  timerDueAt: number;
  flashPhase: number;
  inspectionStartedAt: number;
  generatedNodes: TransformNode[];
  overlayNode?: TransformNode;
}

/** 内部事件总线负载，发送器和触发器之间只传普通 JSON 数据。 */
interface PoiRuntimeEvent {
  name: string;
  sourceId: number;
  payload: Record<string, unknown>;
  createdAt: number;
  depth: number;
  visitedPoiIds: number[];
}

/** 相机状态快照，用于漫游和巡检结束后恢复编辑相机。 */
interface RuntimeCameraSnapshot {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

/** POI 业务运行态，负责编辑态和预览态都可用的轻量业务闭环。 */
export class SceneBusinessRuntime {
  private connection: BusinessDataConnection | null = null;
  private readonly outputConnections = new Map<string, BusinessDataConnection>();
  private readonly states = new Map<number, PoiRuntimeInternalState>();
  private readonly pointerObserver: Observer<PointerInfo>;
  private connectionGeneration = 0;
  private running = false;
  private cameraSnapshot: RuntimeCameraSnapshot | null = null;

  /** 创建业务运行态并注册 POI 点击监听，具体启动由 start 控制。 */
  public constructor(private readonly options: SceneBusinessRuntimeOptions) {
    this.pointerObserver = this.options.scene.onPointerObservable.add((pointerInfo) => this.handlePointer(pointerInfo));
  }

  /** 启动 POI 运行态；未配置外部数据源时仍会启用点击、定时和内部事件。 */
  public start(): void {
    this.stop(true);
    this.running = true;
    this.capturePoiBaselines();
    this.startInputConnection();
    this.startSenderConnections();
    this.ensureStaticOverlays();
  }

  /** 停止运行态，清理连接、临时生成节点和相机中间态。 */
  public stop(restoreCamera = true): void {
    this.invalidateConnection();
    this.connection?.stop();
    this.connection = null;
    this.outputConnections.forEach((connection) => connection.stop());
    this.outputConnections.clear();
    this.clearGeneratedNodes();
    if (restoreCamera) {
      this.restoreRuntimeCamera();
    }
    this.states.clear();
    this.running = false;
  }

  /** 释放运行态自身监听器，供 Babylon 引擎 dispose 调用。 */
  public dispose(): void {
    this.stop(false);
    this.options.scene.onPointerObservable.remove(this.pointerObserver);
  }

  /** 配置变化后重启连接和 POI 默认闭环。 */
  public restart(): void {
    this.start();
  }

  /** 清理指定 POI 产生的运行态对象，用于删除节点前收口。 */
  public cleanupPoi(node: TransformNode): void {
    const state = this.states.get(node.uniqueId);
    const generatedNodes = new Set<TransformNode>();
    state?.generatedNodes.forEach((generatedNode) => generatedNodes.add(generatedNode));
    if (state?.overlayNode) {
      generatedNodes.add(state.overlayNode);
    }
    [...this.options.scene.transformNodes, ...this.options.scene.meshes].forEach((candidate) => {
      if (candidate.metadata?.[POI_RUNTIME_FLAG] && candidate.metadata?.[POI_RUNTIME_OWNER_ID] === node.uniqueId) {
        generatedNodes.add(candidate);
      }
    });
    generatedNodes.forEach((generatedNode) => this.disposeRuntimeNode(generatedNode));
    this.states.delete(node.uniqueId);
    this.restoreRuntimeCamera();
  }

  /** 读取属性面板展示的运行态快照，找不到时返回默认空状态。 */
  public getPoiRuntimeState(node: TransformNode): PoiRuntimeState {
    return this.toPublicState(this.ensureState(node));
  }

  /** 每帧推进定时器、闪烁、路径、巡检和状态面板。 */
  public update(now: number): TransformNode[] {
    if (!this.running) {
      return [];
    }

    const changedNodes: TransformNode[] = [];
    this.options.getPoiNodes().forEach((node) => {
      const config = this.options.getPoiConfig(node);
      const state = this.ensureState(node);
      if (!config.enabled) {
        return;
      }

      if (this.updateTimerTrigger(node, config, state, now)) {
        changedNodes.push(node);
      }
      if (this.updateAlarmFlash(node, state, now)) {
        changedNodes.push(node);
      }
      if (this.updatePathFollower(config, state, now)) {
        changedNodes.push(node);
      }
      if (this.updateInspectionCamera(config, state, now)) {
        changedNodes.push(node);
      }
      if (this.updatePoiOverlay(node, config, state)) {
        changedNodes.push(node);
      }
    });
    return changedNodes;
  }

  /** 指针拾取命中 POI 时触发点击业务事件，不影响引擎自身选中逻辑。 */
  private handlePointer(pointerInfo: PointerInfo): void {
    if (!this.running || pointerInfo.type !== PointerEventTypes.POINTERPICK) {
      return;
    }

    const pickedMesh = pointerInfo.pickInfo?.pickedMesh;
    if (!pickedMesh) {
      return;
    }

    const poiNode = this.findPoiRootFromNode(pickedMesh);
    if (!poiNode) {
      return;
    }

    const config = this.options.getPoiConfig(poiNode);
    if (!config.enabled || config.triggerMode !== "click") {
      return;
    }

    this.handlePoiTrigger(poiNode, config, { type: "click" });
  }

  /** 根据场景级配置启动可选的数据订阅连接。 */
  private startInputConnection(): void {
    const config = this.options.getConfig();
    if (!config.dataConnectionEnabled || config.dataSourceType === "none" || !config.dataEndpoint.trim()) {
      return;
    }

    if (config.dataSourceType === "mqtt" && !config.dataChannel.trim()) {
      return;
    }

    const generation = this.nextConnectionGeneration();
    this.connection = createBusinessDataConnection(config, {
      onMessage: (text, metadata) => this.handleMessage(text, generation, metadata)
    });
    this.connection?.start();
  }

  /** 预连接发送器显式配置的 WebSocket/MQTT 输出端，首次发送时可直接外发。 */
  private startSenderConnections(): void {
    this.options.getPoiNodes().forEach((node) => {
      const config = this.options.getPoiConfig(node);
      if (config.kind !== "sender" || !config.enabled) {
        return;
      }

      if (config.outputType === "websocket" && config.websocketEndpoint.trim()) {
        this.ensureSenderOutputConnection(config, "websocket");
      }
      if (config.outputType === "mqtt" && config.websocketEndpoint.trim() && config.mqttTopic.trim()) {
        this.ensureSenderOutputConnection(config, "mqtt");
      }
    });
  }

  /** 收到外部消息后更新数据条件、图表、报警和模型产生器。 */
  private handleMessage(text: string, generation: number, metadata?: BusinessDataMessageMetadata): void {
    if (!this.running || generation !== this.connectionGeneration || text.length > 1024 * 1024) {
      return;
    }

    const payload = this.parsePayload(text);
    if (!payload) {
      return;
    }

    const topicMetadata = parseLogisticsMqttTopic(metadata?.mqttTopic);
    const frames = Array.isArray(payload) ? payload.slice(0, 200) : [payload];
    frames.forEach((frame) => {
      if (!this.isRecord(frame)) {
        return;
      }
      const normalizedFrame = { ...frame };
      applyLogisticsMqttFrameDefaults(normalizedFrame, topicMetadata);
      this.applyDataFrame(normalizedFrame);
    });
  }

  /** 将一帧业务数据分发给所有 POI。 */
  private applyDataFrame(frame: Record<string, unknown>): void {
    this.options.getPoiNodes().forEach((node) => {
      const config = this.options.getPoiConfig(node);
      if (!config.enabled) {
        return;
      }

      const state = this.ensureState(node);
      if (config.kind === "chartMarker" || config.kind === "chartPanel") {
        this.updateChartState(config, state, frame);
      }
      if (config.kind === "alarmManager") {
        this.updateAlarmState(config, state, frame);
      }
      if (config.triggerMode === "dataCondition" && this.matchesCondition(frame, config)) {
        this.handlePoiTrigger(node, config, { type: "data", frame });
      }
    });
  }

  /** 处理某个 POI 触发后的默认业务语义。 */
  private handlePoiTrigger(node: TransformNode, config: PoiConfigSnapshot, payload: Record<string, unknown>): void {
    const state = this.ensureState(node);
    state.status = config.kind === "alarmManager" ? state.status : "active";
    state.active = true;
    state.lastEventName = config.eventName;
    state.updatedAt = Date.now();

    const eventPayload = {
      ...payload,
      poiId: node.uniqueId,
      poiName: node.name,
      poiKind: config.kind
    };
    this.emitEvent({
      name: config.eventName,
      sourceId: node.uniqueId,
      payload: eventPayload,
      createdAt: Date.now(),
      depth: 0,
      visitedPoiIds: [node.uniqueId]
    });

    if (config.kind === "manualRoam") {
      this.startManualRoam(node, state);
    }
    if (config.kind === "autoInspection") {
      this.startAutoInspection(node, state);
    }
    if (config.kind === "modelSpawner") {
      this.spawnRuntimeModel(node, config, state);
    }
    if (config.kind === "receiver") {
      this.recycleRuntimeGeneratedNodes(config.targetSelector);
    }
  }

  /** 内部事件总线分发，发送器、回收器、巡检和模型产生器都从这里订阅。 */
  private emitEvent(event: PoiRuntimeEvent): void {
    if (event.depth > MAX_INTERNAL_EVENT_DEPTH) {
      return;
    }

    const visitedPoiIds = new Set(event.visitedPoiIds);
    this.options.getPoiNodes().forEach((node) => {
      const config = this.options.getPoiConfig(node);
      if (!config.enabled || visitedPoiIds.has(node.uniqueId)) {
        return;
      }

      if (config.eventName.trim() && config.eventName.trim() !== event.name) {
        return;
      }

      const state = this.ensureState(node);
      state.lastEventName = event.name;
      state.updatedAt = event.createdAt;

      if (config.kind === "sender") {
        this.dispatchSender(node, config, event);
      }
      if (config.kind === "receiver") {
        this.recycleRuntimeGeneratedNodes(config.targetSelector);
      }
      if (config.kind === "modelSpawner") {
        this.spawnRuntimeModel(node, config, state);
      }
      if (config.kind === "groupEventBinding") {
        this.applyGroupEventBinding(config, event);
      }
      if (config.kind === "autoInspection") {
        this.startAutoInspection(node, state);
      }
    });
  }

  /** 执行发送器三种输出：内部、WebSocket JSON、MQTT publish。 */
  private dispatchSender(node: TransformNode, config: PoiConfigSnapshot, event: PoiRuntimeEvent): void {
    const payload = {
      type: "poi-event",
      event: event.name,
      outputEvent: config.outputEventName,
      sourceId: event.sourceId,
      payload: event.payload,
      ts: event.createdAt
    };

    if (config.outputType === "internal") {
      this.emitEvent({
        name: config.outputEventName || event.name,
        sourceId: node.uniqueId,
        payload,
        createdAt: Date.now(),
        depth: event.depth + 1,
        visitedPoiIds: [...event.visitedPoiIds, node.uniqueId]
      });
      return;
    }

    if (config.outputType === "websocket") {
      const connection = this.ensureSenderOutputConnection(config, "websocket") ?? this.connection;
      connection?.sendJson(payload);
      return;
    }

    const connection = this.ensureSenderOutputConnection(config, "mqtt") ?? this.connection;
    connection?.publish(config.mqttTopic, payload);
  }

  /** 创建或复用发送器专用外发连接。 */
  private ensureSenderOutputConnection(config: PoiConfigSnapshot, type: "websocket" | "mqtt"): BusinessDataConnection | null {
    const endpoint = config.websocketEndpoint.trim();
    if (!endpoint) {
      return null;
    }

    const topic = config.mqttTopic.trim();
    if (type === "mqtt" && !topic) {
      return null;
    }

    const key = `${type}:${endpoint}:${topic}`;
    const existing = this.outputConnections.get(key);
    if (existing) {
      return existing;
    }

    const sceneConfig = this.options.getConfig();
    const connection = createBusinessDataConnection(
      {
        ...sceneConfig,
        dataConnectionEnabled: true,
        dataSourceType: type,
        dataEndpoint: endpoint,
        dataChannel: topic
      },
      { onMessage: () => undefined }
    );
    if (connection) {
      connection.start();
      this.outputConnections.set(key, connection);
    }
    return connection;
  }

  /** 定时触发器按间隔向内部事件总线发事件。 */
  private updateTimerTrigger(node: TransformNode, config: PoiConfigSnapshot, state: PoiRuntimeInternalState, now: number): boolean {
    if (config.triggerMode !== "timer" || config.triggerIntervalMs <= 0) {
      return false;
    }

    if (state.timerDueAt === 0) {
      state.timerDueAt = now + config.triggerIntervalMs;
      return false;
    }

    if (now < state.timerDueAt) {
      return false;
    }

    state.timerDueAt = now + Math.max(DEFAULT_RUNTIME_FRAME_MS, config.triggerIntervalMs);
    this.handlePoiTrigger(node, config, { type: "timer" });
    return true;
  }

  /** 图表类 POI 更新最新值和趋势数组。 */
  private updateChartState(config: PoiConfigSnapshot, state: PoiRuntimeInternalState, frame: Record<string, unknown>): void {
    const value = this.readPath(frame, config.displayField);
    if (value === undefined) {
      return;
    }

    state.latestValue = String(value);
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      state.trend = [...state.trend, numericValue].slice(-MAX_POI_TREND_POINTS);
    }
    state.status = this.readPath(frame, config.statusField) === "alarm" ? "alarm" : "active";
    state.updatedAt = Date.now();
  }

  /** 报警管理器按配置字段激活闪烁状态。 */
  private updateAlarmState(config: PoiConfigSnapshot, state: PoiRuntimeInternalState, frame: Record<string, unknown>): void {
    const active = this.matchesCondition(frame, {
      ...config,
      dataField: config.alarmField || config.dataField,
      conditionOperator: config.conditionOperator,
      conditionValue: config.conditionValue
    });
    state.alarmActive = active;
    state.active = active;
    state.status = active ? "alarm" : "idle";
    state.latestValue = active ? config.alarmMessage || config.alarmLevel : "";
    state.updatedAt = Date.now();
  }

  /** 报警状态通过缩放和材质自发光闪烁反馈到场景。 */
  private updateAlarmFlash(node: TransformNode, state: PoiRuntimeInternalState, now: number): boolean {
    if (!state.alarmActive) {
      return false;
    }

    state.flashPhase = (Math.sin(now / 140) + 1) / 2;
    node.getChildMeshes().forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof StandardMaterial) {
        material.emissiveColor = Color3.FromHexString("#ff7b68").scale(0.18 + state.flashPhase * 0.42);
      }
    });
    return true;
  }

  /** 路径组件可按进度或速度驱动绑定对象沿米制点列移动。 */
  private updatePathFollower(config: PoiConfigSnapshot, state: PoiRuntimeInternalState, now: number): boolean {
    if (config.kind !== "path" || !config.enabled || !config.targetSelector.trim()) {
      return false;
    }

    const target = this.findTargetBySelector(config.targetSelector);
    const point = this.getPathPointAtProgress(config, this.nextPathProgress(config, state, now));
    if (!target || !point) {
      return false;
    }

    target.position.copyFrom(point);
    return true;
  }

  /** 自动巡检运行时按路径点移动相机 target，退出运行态时恢复。 */
  private updateInspectionCamera(config: PoiConfigSnapshot, state: PoiRuntimeInternalState, now: number): boolean {
    if (config.kind !== "autoInspection" || state.status !== "running") {
      return false;
    }

    const elapsed = now - state.inspectionStartedAt;
    const duration = Math.max(1000, config.pathPoints.length * Math.max(500, config.dwellMs));
    const progress = config.loop ? (elapsed % duration) / duration : Math.min(1, elapsed / duration);
    const point = this.getPathPointAtProgress(config, progress);
    if (!point) {
      return false;
    }

    this.captureRuntimeCamera();
    this.options.camera.target.copyFrom(point.add(new Vector3(0, 0.8, 0)));
    this.options.camera.radius = Math.max(6, this.options.camera.radius);
    if (!config.loop && progress >= 1) {
      state.status = "idle";
      state.running = false;
    }
    return true;
  }

  /** 创建或刷新图表、路径等由配置派生的临时可视对象。 */
  private updatePoiOverlay(node: TransformNode, config: PoiConfigSnapshot, state: PoiRuntimeInternalState): boolean {
    if (config.kind === "chartMarker" || config.kind === "chartPanel") {
      this.ensureChartOverlay(node, config, state);
      return true;
    }

    if (config.kind === "path") {
      this.ensurePathOverlay(node, config, state);
      return true;
    }

    return false;
  }

  /** 确保图表类 POI 有运行态 DynamicTexture 面板。 */
  private ensureChartOverlay(node: TransformNode, config: PoiConfigSnapshot, state: PoiRuntimeInternalState): void {
    if (!state.overlayNode) {
      const panel = MeshBuilder.CreatePlane(`${node.name} 运行态图表`, { width: 1.35, height: 0.62 }, this.options.scene);
      panel.parent = node;
      panel.position.y = 2.35;
      panel.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
      panel.alwaysSelectAsActiveMesh = true;
      panel.isPickable = false;
      this.markRuntimeNode(panel, node, `${node.uniqueId}:chart`);

      const texture = new DynamicTexture(`${node.name} 运行态图表纹理`, { width: 512, height: 256 }, this.options.scene, true);
      texture.hasAlpha = true;
      const material = new StandardMaterial(`${node.name} 运行态图表材质`, this.options.scene);
      material.diffuseTexture = texture;
      material.opacityTexture = texture;
      material.emissiveColor = Color3.FromHexString(config.colorHex).scale(0.35);
      material.disableLighting = true;
      material.useAlphaFromDiffuseTexture = true;
      panel.material = material;
      state.overlayNode = panel;
      state.generatedNodes.push(panel);
    }

    const mesh = state.overlayNode.getChildMeshes()[0] ?? state.overlayNode;
    const material = mesh instanceof AbstractMesh ? mesh.material : null;
    if (!(material instanceof StandardMaterial) || !(material.diffuseTexture instanceof DynamicTexture)) {
      return;
    }

    const texture = material.diffuseTexture;
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = "rgba(7, 18, 30, 0.86)";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = config.colorHex;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 504, 248);
    ctx.fillStyle = "#d9f2ff";
    ctx.font = "bold 34px Microsoft YaHei, Arial";
    ctx.fillText(config.title, 28, 54);
    ctx.font = "bold 60px Microsoft YaHei, Arial";
    ctx.fillStyle = state.status === "alarm" ? "#ff8b7f" : "#ffffff";
    ctx.fillText(state.latestValue || "--", 28, 128);
    this.drawTrend(ctx, state.trend, config.colorHex);
    texture.update(false);
  }

  /** 确保路径 POI 有按配置重建的临时路径线。 */
  private ensurePathOverlay(node: TransformNode, config: PoiConfigSnapshot, state: PoiRuntimeInternalState): void {
    if (state.overlayNode) {
      return;
    }

    const points = config.pathPoints.map((point) => new Vector3(point.x, point.y + 0.04, point.z));
    const line = MeshBuilder.CreateLines(`${node.name} 运行态路径`, { points }, this.options.scene);
    line.color = Color3.FromHexString(config.colorHex);
    line.isPickable = false;
    this.markRuntimeNode(line, node, `${node.uniqueId}:path`);
    state.overlayNode = line;
    state.generatedNodes.push(line);
  }

  /** 初始化 POI 默认可视覆盖层，保证拖入后无需外部数据也有反馈。 */
  private ensureStaticOverlays(): void {
    this.options.getPoiNodes().forEach((node) => {
      const config = this.options.getPoiConfig(node);
      const state = this.ensureState(node);
      this.updatePoiOverlay(node, config, state);
    });
  }

  /** 在场景中生成轻量运行态占位模型，配置上限防止异常事件导致 OOM。 */
  private spawnRuntimeModel(node: TransformNode, config: PoiConfigSnapshot, state: PoiRuntimeInternalState): void {
    if (state.generatedCount >= Math.max(1, config.maxInstances) || state.generatedNodes.length >= Math.max(1, config.maxInstances)) {
      return;
    }

    const assetName = this.options.getAssets().find((asset) => asset.id === config.assetId)?.name ?? "运行态模型";
    const spawnIndex = Math.min(MAX_RUNTIME_SPAWN_PER_TICK, Math.max(1, config.maxInstances - state.generatedCount));
    for (let index = 0; index < spawnIndex; index += 1) {
      const box = MeshBuilder.CreateBox(`${assetName} ${state.generatedCount + 1}`, { width: 0.45, height: 0.45, depth: 0.45 }, this.options.scene);
      box.position.copyFrom(node.getAbsolutePosition().add(new Vector3(0.55 + state.generatedCount * 0.12, 0.28, 0.45)));
      box.material = this.createRuntimeMaterial(`${box.name} 材质`, config.colorHex);
      this.markRuntimeNode(box, node, config.reuseKey || `${node.uniqueId}:spawner`);
      state.generatedNodes.push(box);
      state.generatedCount += 1;
    }
    state.status = "running";
    state.updatedAt = Date.now();
  }

  /** 群组事件绑定默认短暂点亮 group 下的业务根节点，避免触碰导入模型内部节点和保存 metadata。 */
  private applyGroupEventBinding(config: PoiConfigSnapshot, event: PoiRuntimeEvent): void {
    const target = this.findTargetBySelector(config.targetSelector);
    if (!target) {
      return;
    }

    this.getDisplayRootsUnder(target).forEach((root) => {
      root.getChildMeshes().forEach((mesh) => {
        const material = mesh.material;
        if (material instanceof StandardMaterial) {
          material.emissiveColor = Color3.FromHexString(config.colorHex).scale(0.22);
        }
      });
    });
  }

  /** 启用手动漫游时只捕获恢复点，编辑器原有相机控制继续承担输入。 */
  private startManualRoam(node: TransformNode, state: PoiRuntimeInternalState): void {
    this.captureRuntimeCamera();
    this.options.camera.target.copyFrom(node.getAbsolutePosition().add(new Vector3(0, 1.2, 0)));
    state.status = "running";
    state.running = true;
  }

  /** 启动自动巡检，把相机 target 按路径点推进。 */
  private startAutoInspection(node: TransformNode, state: PoiRuntimeInternalState): void {
    this.captureRuntimeCamera();
    state.status = "running";
    state.running = true;
    state.paused = false;
    state.inspectionStartedAt = performance.now();
    if (this.options.getPoiConfig(node).pathPoints.length < 2) {
      this.options.camera.target.copyFrom(node.getAbsolutePosition().add(new Vector3(0, 1.2, 0)));
    }
  }

  /** 清理所有 POI 运行态生成节点。 */
  private clearGeneratedNodes(): void {
    this.states.forEach((state) => {
      state.generatedNodes.forEach((node) => this.disposeRuntimeNode(node));
      state.generatedNodes = [];
      state.overlayNode = undefined;
    });
    [...this.options.scene.transformNodes, ...this.options.scene.meshes]
      .filter((node) => node.metadata?.[POI_RUNTIME_FLAG])
      .forEach((node) => this.disposeRuntimeNode(node));
  }

  /** 按 reuseKey 或节点名回收运行态生成物。 */
  private recycleRuntimeGeneratedNodes(selector: string): void {
    const normalizedSelector = selector.trim().toLowerCase();
    this.states.forEach((state) => {
      const keptNodes: TransformNode[] = [];
      state.generatedNodes.forEach((node) => {
        const reuseKey = String(node.metadata?.[POI_RUNTIME_REUSE_KEY] ?? "").toLowerCase();
        if (!normalizedSelector || reuseKey.includes(normalizedSelector) || node.name.toLowerCase().includes(normalizedSelector)) {
          this.disposeRuntimeNode(node);
          state.generatedCount = Math.max(0, state.generatedCount - 1);
        } else {
          keptNodes.push(node);
        }
      });
      state.generatedNodes = keptNodes;
    });
  }

  /** 捕获当前所有 POI 基线，缺失状态会按默认空状态初始化。 */
  private capturePoiBaselines(): void {
    this.options.getPoiNodes().forEach((node) => this.ensureState(node));
  }

  /** 获取或创建某个 POI 的运行态。 */
  private ensureState(node: TransformNode): PoiRuntimeInternalState {
    const existing = this.states.get(node.uniqueId);
    if (existing) {
      return existing;
    }

    const state: PoiRuntimeInternalState = {
      status: "idle",
      active: false,
      alarmActive: false,
      lastEventName: "",
      latestValue: "",
      generatedCount: 0,
      running: false,
      paused: false,
      updatedAt: 0,
      trend: [],
      timerDueAt: 0,
      flashPhase: 0,
      inspectionStartedAt: 0,
      generatedNodes: []
    };
    this.states.set(node.uniqueId, state);
    return state;
  }

  /** 把内部状态裁剪成属性面板可读的公开快照。 */
  private toPublicState(state: PoiRuntimeInternalState): PoiRuntimeState {
    return {
      status: state.status,
      active: state.active,
      alarmActive: state.alarmActive,
      lastEventName: state.lastEventName,
      latestValue: state.latestValue,
      generatedCount: state.generatedCount,
      running: state.running,
      paused: state.paused,
      updatedAt: state.updatedAt,
      trend: [...state.trend]
    };
  }

  /** 为运行态节点打标，确保保存和层级树都能识别其临时属性。 */
  private markRuntimeNode(node: TransformNode, owner: TransformNode, reuseKey: string): void {
    node.doNotSerialize = true;
    node.metadata = {
      ...this.asRecord(node.metadata),
      [POI_RUNTIME_FLAG]: true,
      [POI_RUNTIME_OWNER_ID]: owner.uniqueId,
      [POI_RUNTIME_REUSE_KEY]: reuseKey
    };
  }

  /** 创建运行态占位模型材质。 */
  private createRuntimeMaterial(name: string, colorHex: string): StandardMaterial {
    const material = new StandardMaterial(name, this.options.scene);
    material.diffuseColor = Color3.FromHexString(colorHex);
    material.emissiveColor = Color3.FromHexString(colorHex).scale(0.25);
    material.doNotSerialize = true;
    return material;
  }

  /** 释放运行态节点及其独占材质和贴图，避免频繁重启 runtime 后泄漏。 */
  private disposeRuntimeNode(node: TransformNode): void {
    const meshes = node instanceof AbstractMesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
    meshes.forEach((mesh) => {
      const material = mesh.material;
      if (material instanceof StandardMaterial) {
        material.diffuseTexture?.dispose();
        material.opacityTexture?.dispose();
        material.dispose(false, true);
      }
    });
    node.dispose(false, false);
  }

  /** 绘制简单趋势折线，不引入外部图表库。 */
  private drawTrend(ctx: CanvasRenderingContext2D, trend: number[], colorHex: string): void {
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (trend.length < 2) {
      ctx.moveTo(28, 204);
      ctx.lineTo(484, 204);
      ctx.stroke();
      return;
    }

    const min = Math.min(...trend);
    const max = Math.max(...trend);
    const span = Math.max(1, max - min);
    trend.forEach((value, index) => {
      const x = 28 + (456 * index) / Math.max(1, trend.length - 1);
      const y = 214 - ((value - min) / span) * 58;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  /** 判断数据帧是否符合配置条件。 */
  private matchesCondition(frame: Record<string, unknown>, config: PoiConfigSnapshot): boolean {
    const value = this.readPath(frame, config.dataField);
    if (config.conditionOperator === "exists") {
      return value !== undefined && value !== null && value !== "";
    }

    const expected = config.conditionValue;
    if (config.conditionOperator === "equals") {
      return String(value) === expected;
    }
    if (config.conditionOperator === "notEquals") {
      return String(value) !== expected;
    }

    const numericValue = Number(value);
    const numericExpected = Number(expected);
    if (!Number.isFinite(numericValue) || !Number.isFinite(numericExpected)) {
      return false;
    }
    return config.conditionOperator === "greaterThan" ? numericValue > numericExpected : numericValue < numericExpected;
  }

  /** 读取对象点路径，留空时返回根对象。 */
  private readPath(source: Record<string, unknown>, path: string): unknown {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return source;
    }

    return normalizedPath.split(".").reduce<unknown>((current, key) => {
      if (!this.isRecord(current)) {
        return undefined;
      }
      return current[key];
    }, source);
  }

  /** 根据选择器查找业务目标根节点，支持 uniqueId、name 和 assetCode。 */
  private findTargetBySelector(selector: string): TransformNode | null {
    const normalized = selector.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return (
      this.options.getEditableRoots().find((node) => {
        const metadata = this.asRecord(this.asRecord(node.metadata).editor);
        const assetInfo = this.asRecord(metadata.assetInfo);
        return (
          String(node.uniqueId) === normalized ||
          node.name.toLowerCase().includes(normalized) ||
          String(assetInfo.assetCode ?? "").toLowerCase() === normalized
        );
      }) ?? null
    );
  }

  /** 收集某个 group 下的可展示根节点，不深入导入模型内部。 */
  private getDisplayRootsUnder(root: TransformNode): TransformNode[] {
    return this.options.getEditableRoots().filter((candidate) => candidate !== root && candidate.isDescendantOf(root));
  }

  /** 从命中的 mesh 向上查找 POI 根节点。 */
  private findPoiRootFromNode(node: Node): TransformNode | null {
    let current: Node | null = node;
    const poiIds = new Set(this.options.getPoiNodes().map((poi) => poi.uniqueId));
    while (current) {
      if (poiIds.has(current.uniqueId) && current instanceof TransformNode) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  /** 计算路径下一帧进度，按速度转换为路径归一进度。 */
  private nextPathProgress(config: PoiConfigSnapshot, state: PoiRuntimeInternalState, now: number): number {
    if (config.speedMetersPerSecond <= 0) {
      return Math.max(0, Math.min(1, config.progress));
    }

    const previous = state.updatedAt || Date.now();
    const deltaSeconds = Math.max(0, (Date.now() - previous) / 1000);
    state.updatedAt = Date.now();
    const length = this.getPathLength(config);
    const deltaProgress = length > 0 ? (config.speedMetersPerSecond * deltaSeconds) / length : 0;
    const current = state.trend[0] ?? config.progress;
    const next = config.loop ? (current + deltaProgress) % 1 : Math.min(1, current + deltaProgress);
    state.trend = [next];
    return Number.isFinite(now) ? next : config.progress;
  }

  /** 按归一进度获取路径点。 */
  private getPathPointAtProgress(config: PoiConfigSnapshot, progress: number): Vector3 | null {
    const points = config.pathPoints.map((point) => new Vector3(point.x, point.y, point.z));
    if (points.length === 0) {
      return null;
    }
    if (points.length === 1) {
      return points[0];
    }

    const totalLength = this.getPathLength(config);
    if (totalLength <= 0) {
      return points[0];
    }

    let distance = Math.max(0, Math.min(1, progress)) * totalLength;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const segmentLength = Vector3.Distance(from, to);
      if (distance <= segmentLength || index === points.length - 2) {
        return Vector3.Lerp(from, to, segmentLength <= 0 ? 0 : distance / segmentLength);
      }
      distance -= segmentLength;
    }
    return points[points.length - 1];
  }

  /** 计算路径总长度，点列单位为米。 */
  private getPathLength(config: PoiConfigSnapshot): number {
    const points = config.pathPoints.map((point) => new Vector3(point.x, point.y, point.z));
    return points.slice(1).reduce((total, point, index) => total + Vector3.Distance(points[index], point), 0);
  }

  /** 捕获相机恢复点，仅首次进入运行相机控制时记录。 */
  private captureRuntimeCamera(): void {
    if (this.cameraSnapshot) {
      return;
    }

    this.cameraSnapshot = {
      alpha: this.options.camera.alpha,
      beta: this.options.camera.beta,
      radius: this.options.camera.radius,
      target: this.options.camera.target.clone()
    };
  }

  /** 恢复手动漫游或巡检之前的编辑相机状态。 */
  private restoreRuntimeCamera(): void {
    if (!this.cameraSnapshot) {
      return;
    }

    this.options.camera.alpha = this.cameraSnapshot.alpha;
    this.options.camera.beta = this.cameraSnapshot.beta;
    this.options.camera.radius = this.cameraSnapshot.radius;
    this.options.camera.target.copyFrom(this.cameraSnapshot.target);
    this.cameraSnapshot = null;
  }

  /** 解析连接收到的 JSON 文本。 */
  private parsePayload(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  /** 生成新连接代号，用于隔离旧连接异步回调。 */
  private nextConnectionGeneration(): number {
    this.connectionGeneration += 1;
    return this.connectionGeneration;
  }

  /** 让旧连接代号失效。 */
  private invalidateConnection(): void {
    this.connectionGeneration += 1;
  }

  /** 判断未知值是否是普通对象。 */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  /** 把 metadata 规整为普通对象。 */
  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }
}
