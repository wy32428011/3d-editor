import type { Scene } from "@babylonjs/core/scene";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type {
  ModelDataDrivenAxis,
  ModelDataDrivenCargoHandlingDefinition,
  ModelDataDrivenDefinition,
  ModelDataDrivenMotionGroupDefinition,
  ModelDataDrivenMotionKind,
  ModelDataDrivenMotionTarget,
  ModelDataDrivenMotionValueMode,
  ModelDataDrivenSimulationDefinition,
  SceneDataConnectionStatusSnapshot,
  SceneDataDrivenSnapshot
} from "../types/editor";
import { createBusinessDataConnection, type BusinessDataMessageMetadata } from "./businessDataConnection";
import {
  applyLogisticsMqttFrameDefaults,
  parseLogisticsMqttTopic,
  type LogisticsMqttTopicMetadata
} from "./mqttLogisticsProtocol";

const MAX_DATA_MESSAGE_BYTES = 1024 * 1024;
const MAX_FRAMES_PER_MESSAGE = 200;
const DATA_CONNECTION_STALE_MS = 5000;
const STACKER_DEMO_INTERVAL_MS = 250;
const STACKER_DEMO_DEVICE_ID = "DDJ2";
const STACKER_DEMO_CARGO_ID = "Box01";
const STACKER_TRAVEL_FIELDS = ["travel_pos", "trackZ", "travelZ", "travel", "position.z", "pos.z", "location.z", "z"];
const STACKER_LIFT_FIELDS = ["lift_pos", "liftY", "lift", "platformY", "platform.y", "elevation"];
const STACKER_FORK_FIELDS = ["fork_extend", "forkExtend", "forkX", "fork.x", "fork.extend"];
const STACKER_FORK_SIDE_FIELDS = ["fork_side", "forkZ", "fork.z"];
const STACKER_PLC_DEVICE_CODE_FIELD = "device_code";
const CARGO_ACTION_FIELDS = ["cargo_action", "cargoAction", "cargo.action", "action"];
const CARGO_TARGET_FIELDS = ["cargo", "cargoId", "cargoCode", "payload", "box", "boxId", "boxCode", "targetCargo"];
const CARGO_DROP_TARGET_FIELDS = ["target", "dropTarget", "targetLocator", "locator", "locatorAssetCode", "slot"];
const CARGO_PICKUP_VALUES = ["pickup", "pick", "attach", "load", "carry", "take", "取货", "吸附", "装载"];
const CARGO_DROP_VALUES = ["drop", "detach", "unload", "release", "put", "放货", "释放", "卸载"];
const DEFAULT_CARGO_PICKUP_MIN_FORK_EXTENSION = 0.45;
const DEFAULT_CARGO_PICKUP_MAX_DISTANCE = 2.5;
const DEFAULT_CARGO_ANCHOR_OFFSET = new Vector3(0, 0.32, 0);
// 辊筒模型只声明自转速度时，用该米/秒速度推进已绑定货箱。
const DEFAULT_CONVEYOR_CARGO_SPEED = 2;
const STACKER_TRACK_NODE_NAMES = ["guidaoshang.1", "guidaoxia.2"];
const STACKER_TRAVEL_NODE_NAMES = [
  "dingbuhuagui2.3",
  "dingbuhuagui1.4",
  "dingbu.5",
  "dibu.6",
  "lizhu1.11",
  "lizhu2.12",
  "dianji.7",
  "caozuotai.8",
  "xiang.13",
  "huocha.9",
  "huocha2.10"
];
const STACKER_LIFT_NODE_NAMES = ["xiang.13", "huocha.9", "huocha2.10"];
const STACKER_FORK_NODE_NAMES = ["huocha.9", "huocha2.10"];
const STACKER_TRAVEL_FALLBACK_PATTERN = /dingbu|dibu|lizhu|dianji|caozuotai|xiang|huocha|顶部|底部|立柱|电机|操作台|载货|货叉/i;
const STACKER_LIFT_FALLBACK_PATTERN = /platform|cargo|bay|xiang|台|仓|fork|叉|huocha|cha\d*/i;
const STACKER_FORK_FALLBACK_PATTERN = /fork|叉|huocha|cha\d*/i;
const MAX_CONFIGURED_FALLBACK_PATTERN_LENGTH = 160;
const MAX_ACTION_DELTA_SECONDS = 1;
const DEFAULT_ACTION_MAP_ENTRIES: Array<[string, number]> = [["0", 0], ["1", 1], ["2", -1]];

type StackerMotionGroupKey = "travel" | "lift" | "fork" | "forkSide";

/** 运行时归一化后的运动组，节点来源可来自模型脚本或 Stacker 兜底配置。 */
interface RuntimeMotionGroup {
  key: string;
  kind: ModelDataDrivenMotionKind;
  fields: string[];
  axis: ModelDataDrivenAxis;
  nodes: TransformNode[];
  valueMode: ModelDataDrivenMotionValueMode;
  actionMap: Map<string, number>;
  target: ModelDataDrivenMotionTarget;
  speed?: number;
  limits?: RuntimeMotionLimit;
}

/** 运行态运动行程限制，显式数值和防撞物体推导结果会合并成最终 min/max。 */
interface RuntimeMotionLimit {
  min?: number;
  max?: number;
  blockerNodes: TransformNode[];
  clearance: number;
}

/** 节点在指定世界方向上的投影范围。 */
interface ProjectedBounds {
  min: number;
  max: number;
}

/** 节点世界包围盒，用于把货物底部中心对齐到定位框底面中心。 */
interface NodeWorldBounds {
  minimum: Vector3;
  maximum: Vector3;
}

/** 旧 Stacker 兜底规则生成的四类运动组。 */
type LegacyStackerMotionGroups = Record<StackerMotionGroupKey, RuntimeMotionGroup>;

/** 子部件旋转快照，保留原始欧拉角或四元数模式。 */
interface MotionRotationSnapshot {
  euler: Vector3;
  quaternion?: Quaternion;
}

/** 本地模拟预览使用的瞬时数据范围，不写入场景文件。 */
interface StackerSimulationSettings {
  deviceId: string;
  intervalMs: number;
  travelRange: number;
  liftBase: number;
  liftRange: number;
  forkRange: number;
  forkSideRange: number;
}

/** 运行态货箱吸附配置，来源于模型包声明或 Stacker 默认兜底。 */
interface RuntimeCargoHandlingConfig {
  actionFields: string[];
  cargoFields: string[];
  targetFields: string[];
  pickupValues: Set<string>;
  dropValues: Set<string>;
  pickupMinForkExtension: number;
  pickupMaxDistance: number;
  anchorNodes: TransformNode[];
  anchorOffset: Vector3;
}

/** 货箱吸附关系只保存在内存中，停止预览后统一清空。 */
interface CargoAttachmentState {
  carrierRootId: number;
  cargoRoot: TransformNode;
  cargoCode: string;
  offsetFromAnchor: Vector3;
  updatedAt: number;
}

/** 输送线载荷关系按动作语义推进货箱，不要求数据侧持续发送货箱坐标。 */
interface CargoTransportState {
  carrierRootId: number;
  cargoRoot: TransformNode;
  cargoCode: string;
  axis: ModelDataDrivenAxis;
  speed: number;
  updatedAt: number;
  blockedDirection?: number;
  blockedBoundary?: "start" | "end";
}

/** 货箱沿输送方向投影后的可用范围。 */
interface CargoTransportAxisRange {
  minimum: number;
  maximum: number;
}

const DEFAULT_STACKER_SIMULATION_SETTINGS: StackerSimulationSettings = {
  deviceId: STACKER_DEMO_DEVICE_ID,
  intervalMs: STACKER_DEMO_INTERVAL_MS,
  travelRange: 2.8,
  liftBase: 0.35,
  liftRange: 2.1,
  forkRange: 0.75,
  forkSideRange: 0.18
};

/** 根节点整体位姿字段映射，定位框可用它接收自定义字段。 */
export interface SceneDataDrivenRootMotionFields {
  positionX?: string[];
  positionY?: string[];
  positionZ?: string[];
  rotationY?: string[];
  interpolationMs?: number;
}

/** 可被场景数据驱动运行时匹配和驱动的模型或定位框根节点。 */
export interface SceneDataDrivenTarget {
  root: TransformNode;
  matchFields: Record<string, string>;
  dataDriven?: ModelDataDrivenDefinition;
  rootMotionFields?: SceneDataDrivenRootMotionFields;
  requiresDeviceMatch?: boolean;
}

/** 可作为 Stacker 放货目标的定位线框锚点。 */
export interface SceneDataDrivenDropTarget {
  root: TransformNode;
  matchFields: Record<string, string>;
}

/** 场景数据驱动运行时的宿主能力，由 Babylon 引擎提供。 */
interface SceneDataDrivenRuntimeOptions {
  scene: Scene;
  getConfig: () => SceneDataDrivenSnapshot;
  getTargets: () => SceneDataDrivenTarget[];
  getDropTargets: () => SceneDataDrivenDropTarget[];
  onTargetsChanged: (roots: TransformNode[], now: number) => void;
  onConnectionStatusChanged?: (status: SceneDataConnectionStatusSnapshot) => void;
}

/** 单个模型进入预览时捕获的姿态基线。 */
interface DataDrivenTargetState {
  target: SceneDataDrivenTarget;
  isStacker: boolean;
  rootBasePosition: Vector3;
  rootStartPosition: Vector3;
  rootTargetPosition: Vector3;
  rootBaseRotationY?: number;
  rootStartRotationY?: number;
  rootTargetRotationY?: number;
  usesDocumentCoordinateMapping: boolean;
  motionGroups: RuntimeMotionGroup[];
  motionNodes: TransformNode[];
  motionBasePositions: Map<number, Vector3>;
  motionStartPositions: Map<number, Vector3>;
  motionTargetPositions: Map<number, Vector3>;
  motionBaseRotations: Map<number, MotionRotationSnapshot>;
  motionStartRotations: Map<number, MotionRotationSnapshot>;
  motionTargetRotations: Map<number, MotionRotationSnapshot>;
  motionStartValues: Map<string, number>;
  motionValues: Map<string, number>;
  motionActionDirections: Map<string, number>;
  cargoHandling: RuntimeCargoHandlingConfig | null;
  motionStartedAt: number;
  motionDurationMs: number;
  motionActionUpdatedAt: number;
}

/** 场景数据连接的最小生命周期。 */
interface DataConnection {
  start: () => void;
  stop: () => void;
}

/** 解析后的业务数据帧。 */
type DataFrame = Record<string, unknown>;

/** 场景级数据驱动运行时，负责订阅数据并把 payload 映射到模型运动。 */
export class SceneDataDrivenRuntime {
  private connection: DataConnection | null = null;
  private readonly targetStates = new Map<number, DataDrivenTargetState>();
  private readonly cargoAttachments = new Map<number, CargoAttachmentState>();
  private readonly cargoTransports = new Map<number, CargoTransportState>();
  private simulationConfig: SceneDataDrivenSnapshot | null = null;
  private connectionGeneration = 0;
  private lastMessageAt = 0;
  private staleStatusEmitted = false;
  private running = false;

  /** 创建场景数据驱动运行时，实际连接只会在 start 时建立。 */
  public constructor(private readonly options: SceneDataDrivenRuntimeOptions) {}

  /** 按当前场景配置启动订阅，并捕获所有可驱动目标的进入预览姿态。 */
  public start(): void {
    this.stop(true);
    this.simulationConfig = null;
    const config = this.options.getConfig();
    if (!this.isConfigRunnable(config)) {
      return;
    }

    this.running = true;
    this.lastMessageAt = 0;
    this.staleStatusEmitted = false;
    this.captureTargets(performance.now());
    const generation = this.nextConnectionGeneration();
    this.connection = this.createConnection(config, generation);
    this.connection?.start();
  }

  /** 启动仅用于 Stacker 验证的本地模拟数据源，不把模拟状态写入场景文件。 */
  public startStackerDemoSimulation(config: SceneDataDrivenSnapshot): void {
    this.invalidateConnection();
    this.connection?.stop();
    this.connection = null;
    this.simulationConfig = config;
    this.running = true;
    this.lastMessageAt = Date.now();
    this.staleStatusEmitted = false;
    this.emitConnectionStatus({ state: "connected", label: "内置模拟已启动", lastMessageAt: this.lastMessageAt });
    this.captureTargets(performance.now());
    const generation = this.nextConnectionGeneration();
    this.connection = new StackerDemoSimulationConnection(
      config,
      (text) => this.handleMessage(text, generation),
      () => this.getStackerSimulationSettings()
    );
    this.connection.start();
  }

  /** 检查指定目标是否能按 Stacker 结构驱动，用于启动模拟前给出明确反馈。 */
  public canDriveStackerTarget(target: SceneDataDrivenTarget): boolean {
    const groups = this.createStackerMotionGroups(target);
    if (!this.isStackerTarget(target, groups)) {
      return false;
    }

    return this.getMotionNodes(Object.values(groups)).length > 0;
  }

  /** 读取当前可驱动 Stacker 的模拟参数，优先使用模型脚本 dataDriven.simulation。 */
  private getStackerSimulationSettings(): StackerSimulationSettings {
    const target = this.options.getTargets().find((item) => this.canDriveStackerTarget(item));
    const simulation = target?.dataDriven?.simulation;
    return {
      deviceId: target?.matchFields.assetCode?.trim() || DEFAULT_STACKER_SIMULATION_SETTINGS.deviceId,
      intervalMs: this.readSimulationNumber(simulation, "intervalMs", DEFAULT_STACKER_SIMULATION_SETTINGS.intervalMs, 16),
      travelRange: this.readSimulationNumber(simulation, "travelRange", DEFAULT_STACKER_SIMULATION_SETTINGS.travelRange, 0),
      liftBase: this.readSimulationNumber(simulation, "liftBase", DEFAULT_STACKER_SIMULATION_SETTINGS.liftBase),
      liftRange: this.readSimulationNumber(simulation, "liftRange", DEFAULT_STACKER_SIMULATION_SETTINGS.liftRange, 0),
      forkRange: this.readSimulationNumber(simulation, "forkRange", DEFAULT_STACKER_SIMULATION_SETTINGS.forkRange, 0),
      forkSideRange: this.readSimulationNumber(simulation, "forkSideRange", DEFAULT_STACKER_SIMULATION_SETTINGS.forkSideRange, 0)
    };
  }

  /** 读取模拟数字字段，并用下限防止 interval 为 0 导致高频循环。 */
  private readSimulationNumber(
    simulation: ModelDataDrivenSimulationDefinition | undefined,
    key: keyof ModelDataDrivenSimulationDefinition,
    fallback: number,
    minValue?: number
  ): number {
    const value = simulation?.[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return fallback;
    }

    return minValue === undefined ? value : Math.max(minValue, value);
  }

  /** 停止订阅并按需恢复模型进入预览前的姿态。 */
  public stop(restoreTargets = true): void {
    this.invalidateConnection();
    this.connection?.stop();
    this.connection = null;
    this.simulationConfig = null;
    if (restoreTargets) {
      this.restoreTargets();
    }
    this.cargoAttachments.clear();
    this.cargoTransports.clear();
    this.targetStates.clear();
    this.running = false;
    this.lastMessageAt = 0;
    this.staleStatusEmitted = false;
    this.emitConnectionStatus({ state: "idle", label: "数据驱动已停止" });
  }

  /** 配置变更时重建连接，保持预览中的数据源和 UI 配置一致。 */
  public restart(): void {
    if (!this.running) {
      return;
    }

    this.start();
  }

  /** 每帧推进插值动画，返回本帧发生变化的模型根节点。 */
  public update(now: number): TransformNode[] {
    if (!this.running || this.targetStates.size === 0) {
      return [];
    }

    this.updateStaleConnectionStatus();
    const actionFramesAreStale = this.areActionFramesStale();
    const changedRoots: TransformNode[] = [];
    this.targetStates.forEach((state) => {
      if (this.isRuntimeDrivenCargoRoot(state.target.root)) {
        return;
      }

      const interpolatedChanged = this.applyInterpolatedState(state, now);
      const actionChanged = this.applyActionState(state, now, actionFramesAreStale);
      if (interpolatedChanged || actionChanged) {
        changedRoots.push(state.target.root);
      }
      changedRoots.push(...this.updateCargoAttachmentsForState(state, now));
      changedRoots.push(...this.updateCargoTransportsForState(state, now, actionFramesAreStale));
    });
    return this.dedupeTransformNodes(changedRoots);
  }

  /** 将连接收到的原始消息解析为业务帧并写入目标运动状态。 */
  private handleMessage(text: string, generation: number, metadata?: BusinessDataMessageMetadata): void {
    if (!this.running || generation !== this.connectionGeneration) {
      return;
    }

    this.lastMessageAt = Date.now();
    this.staleStatusEmitted = false;
    if (text.length > MAX_DATA_MESSAGE_BYTES) {
      console.warn("数据驱动消息超过大小上限，已忽略。");
      return;
    }

    const payload = this.parsePayload(text);
    if (payload === undefined) {
      return;
    }

    const config = this.simulationConfig ?? this.options.getConfig();
    const frames = this.extractPayloadFrames(payload, config, metadata);
    const now = performance.now();
    frames.forEach((frame) => this.applyFrame(frame, config, now));
  }

  /** 生成新连接代号，用于隔离旧连接中排队到达的异步消息。 */
  private nextConnectionGeneration(): number {
    this.connectionGeneration += 1;
    return this.connectionGeneration;
  }

  /** 让当前连接代号失效，确保 stop 后旧 socket/blob 回调不会再驱动模型。 */
  private invalidateConnection(): void {
    this.connectionGeneration += 1;
  }

  /** 判断场景数据驱动配置是否足够启动真实订阅。 */
  private isConfigRunnable(config: SceneDataDrivenSnapshot): boolean {
    if (!config.dataConnectionEnabled || config.dataSourceType === "none") {
      return false;
    }

    if (!config.dataEndpoint.trim()) {
      console.warn("数据驱动连接地址为空，已跳过订阅。");
      return false;
    }

    if (config.dataSourceType === "mqtt" && !config.dataChannel.trim()) {
      console.warn("MQTT 数据驱动需要配置 Topic，已跳过订阅。");
      return false;
    }

    return true;
  }

  /** 根据数据源类型创建连接实例。 */
  private createConnection(config: SceneDataDrivenSnapshot, generation: number): DataConnection | null {
    return createBusinessDataConnection(config, {
      onMessage: (text, metadata) => this.handleMessage(text, generation, metadata),
      onStatusChange: (status) => this.handleConnectionStatus(status, generation)
    });
  }

  /** 只接收当前连接代号的状态，避免旧 socket 关闭回调覆盖新连接。 */
  private handleConnectionStatus(status: SceneDataConnectionStatusSnapshot, generation: number): void {
    if (generation !== this.connectionGeneration) {
      return;
    }

    if (status.lastMessageAt) {
      this.lastMessageAt = status.lastMessageAt;
      this.staleStatusEmitted = false;
    }
    this.emitConnectionStatus(status);
  }

  /** 真实连接长时间无数据时标记 stale，但保持最后姿态，避免现场短断导致模型跳变。 */
  private updateStaleConnectionStatus(): void {
    if (this.simulationConfig || this.staleStatusEmitted || this.lastMessageAt <= 0) {
      return;
    }

    if (Date.now() - this.lastMessageAt < DATA_CONNECTION_STALE_MS) {
      return;
    }

    this.staleStatusEmitted = true;
    this.emitConnectionStatus({
      state: "stale",
      label: `超过 ${Math.round(DATA_CONNECTION_STALE_MS / 1000)} 秒未收到数据，保持最后姿态`,
      lastMessageAt: this.lastMessageAt
    });
  }

  /** 判断 action 模式是否因长时间无新帧而需要自动停住。 */
  private areActionFramesStale(): boolean {
    return !this.simulationConfig && this.lastMessageAt > 0 && Date.now() - this.lastMessageAt >= DATA_CONNECTION_STALE_MS;
  }

  /** 上报运行态连接状态，调用方只用于界面提示。 */
  private emitConnectionStatus(status: SceneDataConnectionStatusSnapshot): void {
    this.options.onConnectionStatusChanged?.(status);
  }

  /** 捕获当前所有可驱动目标的基线姿态。 */
  private captureTargets(now: number): void {
    this.options.getTargets().forEach((target) => this.ensureTargetState(target, now));
  }

  /** 获取或创建目标运行状态，新拖入的模型也可以在预览中被后续数据命中。 */
  private ensureTargetState(target: SceneDataDrivenTarget, now: number): DataDrivenTargetState {
    const existing = this.targetStates.get(target.root.uniqueId);
    if (existing) {
      return existing;
    }

    const rootMotionOnly = Boolean(target.rootMotionFields);
    const legacyStackerGroups = rootMotionOnly ? null : this.createStackerMotionGroups(target);
    const isStacker = legacyStackerGroups ? this.isStackerTarget(target, legacyStackerGroups) : false;
    const motionGroups = legacyStackerGroups ? this.createMotionGroups(target, isStacker, legacyStackerGroups) : [];
    const motionNodes = this.getMotionNodes(motionGroups);
    const motionBasePositions = this.captureNodePositions(motionNodes);
    const motionBaseRotations = this.captureNodeRotations(motionNodes);
    const initialMotionValues = this.createInitialMotionValues(motionGroups);
    const rotationY = target.root.rotationQuaternion ? undefined : target.root.rotation.y;
    const state: DataDrivenTargetState = {
      target,
      isStacker,
      rootBasePosition: target.root.position.clone(),
      rootStartPosition: target.root.position.clone(),
      rootTargetPosition: target.root.position.clone(),
      rootBaseRotationY: rotationY,
      rootStartRotationY: rotationY,
      rootTargetRotationY: rotationY,
      usesDocumentCoordinateMapping: Boolean(target.dataDriven?.device) || isStacker,
      motionGroups,
      motionNodes,
      motionBasePositions,
      motionStartPositions: this.captureNodePositions(motionNodes),
      motionTargetPositions: this.captureNodePositions(motionNodes),
      motionBaseRotations,
      motionStartRotations: this.captureNodeRotations(motionNodes),
      motionTargetRotations: this.cloneNodeRotationSnapshots(motionBaseRotations),
      motionStartValues: new Map(initialMotionValues),
      motionValues: initialMotionValues,
      motionActionDirections: this.createInitialMotionActionDirections(motionGroups),
      cargoHandling: this.createCargoHandlingConfig(target, isStacker, motionGroups),
      motionStartedAt: now,
      motionDurationMs: 0,
      motionActionUpdatedAt: now
    };
    this.targetStates.set(target.root.uniqueId, state);
    return state;
  }

  /** 捕获一组节点的当前位置，用 uniqueId 保持稳定索引。 */
  private captureNodePositions(nodes: TransformNode[]): Map<number, Vector3> {
    return new Map(nodes.map((node) => [node.uniqueId, node.position.clone()]));
  }

  /** 捕获一组节点的当前旋转，四元数节点保持四元数模式。 */
  private captureNodeRotations(nodes: TransformNode[]): Map<number, MotionRotationSnapshot> {
    return new Map(nodes.map((node) => [node.uniqueId, this.captureNodeRotation(node)]));
  }

  /** 捕获单个节点的当前旋转。 */
  private captureNodeRotation(node: TransformNode): MotionRotationSnapshot {
    return node.rotationQuaternion
      ? { euler: node.rotationQuaternion.toEulerAngles(), quaternion: node.rotationQuaternion.clone() }
      : { euler: node.rotation.clone() };
  }

  /** 深拷贝旋转快照，避免插值过程中修改基线。 */
  private cloneNodeRotationSnapshots(snapshots: Map<number, MotionRotationSnapshot>): Map<number, MotionRotationSnapshot> {
    return new Map([...snapshots.entries()].map(([key, value]) => [key, this.cloneRotationSnapshot(value)]));
  }

  /** 深拷贝单个旋转快照。 */
  private cloneRotationSnapshot(snapshot: MotionRotationSnapshot): MotionRotationSnapshot {
    return {
      euler: snapshot.euler.clone(),
      quaternion: snapshot.quaternion?.clone()
    };
  }

  /** 退出预览时恢复所有已驱动模型的基线姿态。 */
  private restoreTargets(): void {
    const restoredRoots: TransformNode[] = [];
    this.targetStates.forEach((state) => {
      state.target.root.position.copyFrom(state.rootBasePosition);
      if (state.rootBaseRotationY !== undefined && !state.target.root.rotationQuaternion) {
        state.target.root.rotation.y = state.rootBaseRotationY;
      }
      this.restoreNodePositions(state.motionNodes, state.motionBasePositions);
      this.restoreNodeRotations(state.motionNodes, state.motionBaseRotations);
      restoredRoots.push(state.target.root);
    });

    if (restoredRoots.length > 0) {
      this.options.onTargetsChanged(restoredRoots, performance.now());
    }
  }

  /** 批量恢复节点位置，缺失节点会被跳过以兼容运行时模型重建。 */
  private restoreNodePositions(nodes: TransformNode[], positions: Map<number, Vector3>): void {
    nodes.forEach((node) => {
      const position = positions.get(node.uniqueId);
      if (position) {
        node.position.copyFrom(position);
      }
    });
  }

  /** 批量恢复节点旋转，缺失节点会被跳过以兼容运行时模型重建。 */
  private restoreNodeRotations(nodes: TransformNode[], rotations: Map<number, MotionRotationSnapshot>): void {
    nodes.forEach((node) => {
      const rotation = rotations.get(node.uniqueId);
      if (rotation) {
        this.applyRotationSnapshot(node, rotation);
      }
    });
  }

  /** 将旋转快照写回节点，保持节点原本的欧拉角或四元数表达方式。 */
  private applyRotationSnapshot(node: TransformNode, rotation: MotionRotationSnapshot): void {
    if (rotation.quaternion) {
      node.rotationQuaternion = rotation.quaternion.clone();
      return;
    }

    if (node.rotationQuaternion) {
      node.rotationQuaternion = null;
    }
    node.rotation.copyFrom(rotation.euler);
  }

  /** 把一帧业务数据写入匹配模型的目标姿态。 */
  private applyFrame(frame: DataFrame, config: SceneDataDrivenSnapshot, now: number): void {
    const target = this.findTargetForFrame(frame, config);
    if (!target) {
      return;
    }

    if (this.isRuntimeDrivenCargoRoot(target.root)) {
      return;
    }

    const state = this.ensureTargetState(target, now);
    const configuredDuration = state.target.rootMotionFields?.interpolationMs ?? state.target.dataDriven?.device?.interpolationMs;
    const fallbackDuration = Math.max(0, Number(configuredDuration ?? config.interpolationMs) || 0);
    const nextMotionValues = this.readMotionGroupValues(frame, state.motionGroups);
    const nextActionDirections = this.readMotionGroupActionDirections(frame, state.motionGroups);
    this.applyInterpolatedState(state, now);
    this.applyActionState(state, now, false);
    const currentMotionValues = this.createCurrentMotionValues(state, now);
    const speedDuration = this.createSpeedDrivenMotionDuration(currentMotionValues, nextMotionValues, state.motionGroups);
    const duration = speedDuration !== undefined ? Math.max(speedDuration, fallbackDuration) : fallbackDuration;
    state.motionStartedAt = now;
    state.motionDurationMs = duration;
    state.rootStartPosition = state.target.root.position.clone();
    state.rootTargetPosition = this.createRootTargetPosition(state, frame);
    if (state.rootBaseRotationY !== undefined && !state.target.root.rotationQuaternion) {
      state.rootStartRotationY = state.target.root.rotation.y;
      state.rootTargetRotationY = this.createRootTargetRotationY(state, frame);
    }
    state.motionStartValues = currentMotionValues;
    if (nextMotionValues.size > 0) {
      this.updateMotionValues(state.motionValues, nextMotionValues, state.motionGroups);
    }
    if (nextActionDirections.size > 0) {
      this.updateMotionActionDirections(state.motionActionDirections, nextActionDirections);
      state.motionActionUpdatedAt = now;
    }
    state.motionStartPositions = this.captureNodePositions(state.motionNodes);
    state.motionTargetPositions = this.createMotionTargetPositions(state);
    state.motionStartRotations = this.captureNodeRotations(state.motionNodes);
    state.motionTargetRotations = this.createMotionTargetRotations(state);

    if (duration === 0) {
      this.applyInterpolatedState(state, now + 1);
    }
    const changedCargoRoots = this.applyCargoActionFrame(state, frame, now);
    this.applyCargoTransportFrame(state, frame, now);
    if (changedCargoRoots.length > 0) {
      this.options.onTargetsChanged(changedCargoRoots, now);
    }
  }

  /** 根据数据帧创建整机根节点目标位置，文档坐标的 X/Y/H 对应 Babylon 的 X/Z/Y。 */
  private createRootTargetPosition(state: DataDrivenTargetState, frame: DataFrame): Vector3 {
    const position = state.target.root.position.clone();
    const x = this.readNumber(
      frame,
      this.getRootMotionFieldCandidates(state.target.rootMotionFields?.positionX, ["x", "position.x", "pos.x", "location.x", "root.x"])
    );
    const yFields = state.usesDocumentCoordinateMapping
      ? ["h", "height", "position.z", "pos.z", "location.z", "root.z"]
      : ["y", "position.y", "pos.y", "location.y", "root.y"];
    const zFields = state.usesDocumentCoordinateMapping ? ["y"] : ["z", "h", "height", "position.z", "pos.z", "location.z", "root.z"];
    const yFieldCandidates = this.getRootMotionFieldCandidates(state.target.rootMotionFields?.positionY, yFields);
    const zFieldCandidates = this.getRootMotionFieldCandidates(state.target.rootMotionFields?.positionZ, zFields);
    const y = this.readNumber(frame, yFieldCandidates);
    const z = this.readNumber(frame, zFieldCandidates);
    if (x !== undefined) {
      position.x = x;
    }
    if (y !== undefined) {
      position.y = y;
    }
    if (z !== undefined) {
      position.z = z;
    }
    return position;
  }

  /** 根据数据帧创建整机朝向，文档 twinspawn 的 r 和 yaw/rotationY 默认按角度解释。 */
  private createRootTargetRotationY(state: DataDrivenTargetState, frame: DataFrame): number | undefined {
    const rotationY = this.readNumber(
      frame,
      this.getRootMotionFieldCandidates(state.target.rootMotionFields?.rotationY, ["r", "yaw", "rotationY", "rotation.y", "heading"])
    );
    if (rotationY === undefined) {
      return state.rootTargetRotationY;
    }

    return (rotationY * Math.PI) / 180;
  }

  /** 定位框可自定义根节点位姿字段；传入空数组时表示该轴不接收数据。 */
  private getRootMotionFieldCandidates(customFields: string[] | undefined, fallbackFields: string[]): string[] {
    if (customFields !== undefined) {
      return customFields.map((field) => field.trim()).filter((field) => field.length > 0);
    }

    return fallbackFields;
  }

  /** 根据所有 translate 运动组合成内部部件目标位置。 */
  private createMotionTargetPositions(state: DataDrivenTargetState): Map<number, Vector3> {
    return new Map(
      state.motionNodes.map((node) => {
        const base = state.motionBasePositions.get(node.uniqueId) ?? node.position;
        const position = base.clone();
        const worldDelta = Vector3.Zero();
        state.motionGroups
          .filter((group) => group.kind === "translate" && group.target === "nodes")
          .forEach((group) => this.addMotionGroupDelta(node, state.target.root, group, state.motionValues.get(group.key) ?? 0, worldDelta));
        position.addInPlace(this.worldDeltaToParentLocalDelta(node, worldDelta));
        return [node.uniqueId, position];
      })
    );
  }

  /** 根据所有 rotate 运动组合成内部部件目标旋转。 */
  private createMotionTargetRotations(state: DataDrivenTargetState): Map<number, MotionRotationSnapshot> {
    return new Map(
      state.motionNodes.map((node) => {
        const base = state.motionBaseRotations.get(node.uniqueId) ?? this.captureNodeRotation(node);
        let rotation = this.cloneRotationSnapshot(base);
        state.motionGroups
          .filter((group) => group.kind === "rotate" && group.target === "nodes")
          .forEach((group) => {
            rotation = this.addMotionGroupRotation(node, group, state.motionValues.get(group.key) ?? 0, rotation);
          });
        return [node.uniqueId, rotation];
      })
    );
  }

  /** 应用当前插值进度，返回节点是否发生变化。 */
  private applyInterpolatedState(state: DataDrivenTargetState, now: number): boolean {
    const progress = this.calculateMotionProgress(state, now);
    const easedProgress = this.easeOutCubic(progress);
    let changed = this.copyInterpolatedVector(state.target.root.position, state.rootStartPosition, state.rootTargetPosition, easedProgress);
    if (
      state.rootStartRotationY !== undefined &&
      state.rootTargetRotationY !== undefined &&
      !state.target.root.rotationQuaternion
    ) {
      const nextRotationY = this.lerp(state.rootStartRotationY, state.rootTargetRotationY, easedProgress);
      if (Math.abs(state.target.root.rotation.y - nextRotationY) > 0.000001) {
        state.target.root.rotation.y = nextRotationY;
        changed = true;
      }
    }
    changed =
      this.applyInterpolatedNodePositions(state.motionNodes, state.motionStartPositions, state.motionTargetPositions, easedProgress) ||
      changed;
    changed =
      this.applyInterpolatedNodeRotations(state.motionNodes, state.motionStartRotations, state.motionTargetRotations, easedProgress) ||
      changed;
    return changed;
  }

  /** 按动作枚举持续积分运动，断流时自动把方向视为停止。 */
  private applyActionState(state: DataDrivenTargetState, now: number, stale: boolean): boolean {
    const elapsedSeconds = Math.min(MAX_ACTION_DELTA_SECONDS, Math.max(0, (now - state.motionActionUpdatedAt) / 1000));
    state.motionActionUpdatedAt = now;
    if (elapsedSeconds <= 0) {
      return false;
    }

    let changed = false;
    let nodeMotionChanged = false;
    state.motionGroups.forEach((group) => {
      if (group.valueMode !== "action" || !group.speed || group.speed <= 0) {
        return;
      }

      const direction = stale ? 0 : state.motionActionDirections.get(group.key) ?? 0;
      if (!Number.isFinite(direction) || direction === 0) {
        return;
      }

      const currentValue = state.motionValues.get(group.key) ?? 0;
      const nextValue = this.clampMotionGroupValue(currentValue + direction * group.speed * elapsedSeconds, group);
      const appliedDelta = nextValue - currentValue;
      if (Math.abs(appliedDelta) <= 1e-9) {
        return;
      }

      state.motionValues.set(group.key, nextValue);
      if (group.target === "root") {
        changed = this.applyRootMotionActionDelta(state.target.root, group, appliedDelta) || changed;
        return;
      }

      nodeMotionChanged = true;
    });

    if (nodeMotionChanged) {
      state.motionStartPositions = this.captureNodePositions(state.motionNodes);
      state.motionTargetPositions = this.createMotionTargetPositions(state);
      state.motionStartRotations = this.captureNodeRotations(state.motionNodes);
      state.motionTargetRotations = this.createMotionTargetRotations(state);
      changed = this.applyInterpolatedNodePositions(state.motionNodes, state.motionStartPositions, state.motionTargetPositions, 1) || changed;
      changed = this.applyInterpolatedNodeRotations(state.motionNodes, state.motionStartRotations, state.motionTargetRotations, 1) || changed;
    }
    if (changed) {
      state.rootStartPosition = state.target.root.position.clone();
      state.rootTargetPosition = state.target.root.position.clone();
      if (state.rootBaseRotationY !== undefined && !state.target.root.rotationQuaternion) {
        state.rootStartRotationY = state.target.root.rotation.y;
        state.rootTargetRotationY = state.target.root.rotation.y;
      }
    }
    return changed;
  }

  /** 将 root 级动作增量写入整车根节点，适用于 RGV/AGV/四向车等整车动作。 */
  private applyRootMotionActionDelta(root: TransformNode, group: RuntimeMotionGroup, delta: number): boolean {
    if (group.kind === "rotate") {
      const radians = (delta * Math.PI) / 180;
      if (root.rotationQuaternion) {
        root.rotationQuaternion = root.rotationQuaternion.multiply(Quaternion.RotationAxis(this.getLocalAxisVector(group.axis), radians));
      } else if (group.axis === "x") {
        root.rotation.x += radians;
      } else if (group.axis === "y") {
        root.rotation.y += radians;
      } else {
        root.rotation.z += radians;
      }
      return true;
    }

    const worldDelta = Vector3.Zero();
    this.addModelLocalAxisDelta(worldDelta, root, group.axis, delta);
    const localDelta = this.worldDeltaToParentLocalDelta(root, worldDelta);
    if (localDelta.lengthSquared() <= 1e-12) {
      return false;
    }

    root.position.addInPlace(localDelta);
    return true;
  }

  /** 计算当前插值进度，集中处理 0ms 跳转和异常时间值。 */
  private calculateMotionProgress(state: DataDrivenTargetState, now: number): number {
    if (state.motionDurationMs <= 0) {
      return 1;
    }
    return Math.min(1, Math.max(0, (now - state.motionStartedAt) / state.motionDurationMs));
  }

  /** 批量按插值进度更新子部件位置。 */
  private applyInterpolatedNodePositions(
    nodes: TransformNode[],
    starts: Map<number, Vector3>,
    targets: Map<number, Vector3>,
    progress: number
  ): boolean {
    let changed = false;
    nodes.forEach((node) => {
      const start = starts.get(node.uniqueId);
      const target = targets.get(node.uniqueId);
      if (start && target) {
        changed = this.copyInterpolatedVector(node.position, start, target, progress) || changed;
      }
    });
    return changed;
  }

  /** 批量按插值进度更新子部件旋转。 */
  private applyInterpolatedNodeRotations(
    nodes: TransformNode[],
    starts: Map<number, MotionRotationSnapshot>,
    targets: Map<number, MotionRotationSnapshot>,
    progress: number
  ): boolean {
    let changed = false;
    nodes.forEach((node) => {
      const start = starts.get(node.uniqueId);
      const target = targets.get(node.uniqueId);
      if (start && target) {
        changed = this.copyInterpolatedRotation(node, start, target, progress) || changed;
      }
    });
    return changed;
  }

  /** 根据货箱动作字段处理取货和放货命令。 */
  private applyCargoActionFrame(state: DataDrivenTargetState, frame: DataFrame, now: number): TransformNode[] {
    const cargoConfig = state.cargoHandling;
    if (!cargoConfig) {
      return [];
    }

    const action = this.readString(frame, cargoConfig.actionFields);
    const cargoCode = this.readString(frame, cargoConfig.cargoFields);
    if (!action) {
      if (cargoCode && this.isPayloadBindingFrame(frame)) {
        this.attachCargoToFork(state, cargoConfig, cargoCode, now, false);
      }
      return [];
    }

    const normalizedAction = this.normalizeMatchValue(action);
    if (cargoConfig.pickupValues.has(normalizedAction)) {
      if (cargoCode) {
        this.attachCargoToFork(state, cargoConfig, cargoCode, now, true);
      }
      return [];
    }

    if (cargoConfig.dropValues.has(normalizedAction)) {
      const dropTargetCode = this.readString(frame, cargoConfig.targetFields);
      return this.dropCargoFromFork(state, cargoCode, dropTargetCode, now);
    }

    return [];
  }

  /** 处理输送线负载绑定帧，货箱后续由输送线动作自动推进。 */
  private applyCargoTransportFrame(state: DataDrivenTargetState, frame: DataFrame, now: number): void {
    if (!this.isCargoTransportCarrier(state) || !this.isPayloadBindingFrame(frame)) {
      return;
    }

    const cargoCode = this.readString(frame, CARGO_TARGET_FIELDS);
    if (!cargoCode) {
      return;
    }

    this.bindCargoToTransportCarrier(state, cargoCode, now);
  }

  /** 尝试把指定货箱吸附到当前 Stacker 货叉吸附点。 */
  private attachCargoToFork(
    state: DataDrivenTargetState,
    cargoConfig: RuntimeCargoHandlingConfig,
    cargoCode: string,
    now: number,
    enforcePickupGuards: boolean
  ): void {
    const forkExtension = this.readCurrentForkExtension(state);
    if (enforcePickupGuards && forkExtension < cargoConfig.pickupMinForkExtension) {
      return;
    }

    const cargoTarget = this.findCargoTarget(cargoCode, state.target.root);
    if (!cargoTarget) {
      return;
    }

    const anchorPosition = this.getCargoAnchorWorldPosition(state, cargoConfig);
    const cargoPosition = cargoTarget.root.getAbsolutePosition();
    if (enforcePickupGuards && cargoConfig.pickupMaxDistance > 0 && Vector3.Distance(cargoPosition, anchorPosition) > cargoConfig.pickupMaxDistance) {
      return;
    }

    this.detachCargoFromTransport(cargoTarget.root);
    const attachment: CargoAttachmentState = {
      carrierRootId: state.target.root.uniqueId,
      cargoRoot: cargoTarget.root,
      cargoCode: this.normalizeMatchValue(cargoCode),
      offsetFromAnchor: Vector3.Zero(),
      updatedAt: now
    };
    this.cargoAttachments.set(cargoTarget.root.uniqueId, attachment);
    this.setNodeAbsolutePosition(cargoTarget.root, anchorPosition);
    this.syncCargoTargetStateToCurrentPose(cargoTarget.root, now);
  }

  /** 判断当前帧是否来自规范的负载绑定消息，可直接同步载体与货箱关系。 */
  private isPayloadBindingFrame(frame: DataFrame): boolean {
    const subRes = this.readString(frame, ["subRes"]);
    if (subRes === "payload") {
      return true;
    }

    return this.readString(frame, ["p"]) === "payload" || frame.payload !== undefined;
  }

  /** 解除指定货箱或当前 Stacker 所有货箱的运行态吸附关系，带 target 时先放入定位框。 */
  private dropCargoFromFork(
    state: DataDrivenTargetState,
    cargoCode: string | undefined,
    dropTargetCode: string | undefined,
    now: number
  ): TransformNode[] {
    const normalizedCargoCode = cargoCode ? this.normalizeMatchValue(cargoCode) : undefined;
    const dropTarget = dropTargetCode ? this.findCargoDropTarget(dropTargetCode) : null;
    if (dropTargetCode && !dropTarget) {
      console.warn(`未找到资产编号为 ${dropTargetCode} 的定位线框，已保持货物吸附状态。`);
      return [];
    }

    const changedCargoRoots: TransformNode[] = [];
    [...this.cargoAttachments.entries()].forEach(([nodeId, attachment]) => {
      if (attachment.carrierRootId !== state.target.root.uniqueId) {
        return;
      }
      if (normalizedCargoCode && attachment.cargoCode !== normalizedCargoCode) {
        return;
      }
      if (dropTarget) {
        this.moveCargoToDropTarget(attachment.cargoRoot, dropTarget.root);
        changedCargoRoots.push(attachment.cargoRoot);
      }
      this.syncCargoTargetStateToCurrentPose(attachment.cargoRoot, now);
      this.cargoAttachments.delete(nodeId);
    });
    return changedCargoRoots;
  }

  /** Stacker 位姿插值后推进已吸附货箱，让货箱持续停在货叉吸附点。 */
  private updateCargoAttachmentsForState(state: DataDrivenTargetState, now: number): TransformNode[] {
    const cargoConfig = state.cargoHandling;
    if (!cargoConfig) {
      return [];
    }

    const anchorPosition = this.getCargoAnchorWorldPosition(state, cargoConfig);
    const changedCargoRoots: TransformNode[] = [];
    [...this.cargoAttachments.values()].forEach((attachment) => {
      if (attachment.carrierRootId !== state.target.root.uniqueId) {
        return;
      }
      if (attachment.cargoRoot.isDisposed()) {
        this.cargoAttachments.delete(attachment.cargoRoot.uniqueId);
        return;
      }
      const nextPosition = anchorPosition.add(attachment.offsetFromAnchor);
      if (this.setNodeAbsolutePosition(attachment.cargoRoot, nextPosition)) {
        attachment.updatedAt = now;
        changedCargoRoots.push(attachment.cargoRoot);
      }
      this.syncCargoTargetStateToCurrentPose(attachment.cargoRoot, now);
    });
    return changedCargoRoots;
  }

  /** 将货箱绑定到输送线，由输送线 movement_x 动作推进。 */
  private bindCargoToTransportCarrier(state: DataDrivenTargetState, cargoCode: string, now: number): void {
    const cargoTarget = this.findCargoTarget(cargoCode, state.target.root);
    if (!cargoTarget || this.isAttachedCargoRoot(cargoTarget.root)) {
      return;
    }

    this.cargoTransports.set(cargoTarget.root.uniqueId, {
      carrierRootId: state.target.root.uniqueId,
      cargoRoot: cargoTarget.root,
      cargoCode: this.normalizeMatchValue(cargoCode),
      axis: this.resolveCargoTransportAxis(state),
      speed: this.resolveCargoTransportSpeed(state),
      updatedAt: now
    });
    this.syncCargoTargetStateToCurrentPose(cargoTarget.root, now);
  }

  /** Stacker 接管货箱前解除输送线绑定，避免两个载体同时驱动同一货箱。 */
  private detachCargoFromTransport(cargoRoot: TransformNode): void {
    this.cargoTransports.delete(cargoRoot.uniqueId);
  }

  /** 输送线运行期间按设备本地轴推进已绑定货箱。 */
  private updateCargoTransportsForState(state: DataDrivenTargetState, now: number, stale: boolean): TransformNode[] {
    if (!this.isCargoTransportCarrier(state)) {
      return [];
    }

    const changedCargoRoots: TransformNode[] = [];
    [...this.cargoTransports.values()].forEach((transport) => {
      if (transport.carrierRootId !== state.target.root.uniqueId) {
        return;
      }
      if (transport.cargoRoot.isDisposed() || this.isAttachedCargoRoot(transport.cargoRoot)) {
        this.cargoTransports.delete(transport.cargoRoot.uniqueId);
        return;
      }

      const direction = stale ? 0 : this.resolveCargoTransportDirection(state);
      const elapsedSeconds = Math.min(MAX_ACTION_DELTA_SECONDS, Math.max(0, (now - transport.updatedAt) / 1000));
      transport.updatedAt = now;
      if (direction === 0 || elapsedSeconds <= 0) {
        return;
      }

      if (transport.blockedDirection !== undefined && Math.sign(direction) === Math.sign(transport.blockedDirection)) {
        return;
      }
      if (transport.blockedDirection !== undefined && Math.sign(direction) !== Math.sign(transport.blockedDirection)) {
        transport.blockedDirection = undefined;
        transport.blockedBoundary = undefined;
      }

      const worldDelta = this.createCargoTransportWorldDelta(state, transport, direction, elapsedSeconds);
      if (worldDelta.lengthSquared() <= 0) {
        return;
      }
      const nextPosition = transport.cargoRoot.getAbsolutePosition().add(worldDelta);
      if (this.setNodeAbsolutePosition(transport.cargoRoot, nextPosition)) {
        changedCargoRoots.push(transport.cargoRoot);
      }
      this.syncCargoTargetStateToCurrentPose(transport.cargoRoot, now);
    });
    return changedCargoRoots;
  }

  /** 判断目标是否是可承载货箱的输送线类设备。 */
  private isCargoTransportCarrier(state: DataDrivenTargetState): boolean {
    if (!this.findCargoTransportMotionGroup(state)) {
      return false;
    }

    const devType = this.normalizeMatchValue(state.target.dataDriven?.device?.devType ?? "");
    if (devType === "conveyor") {
      return true;
    }

    const values = this.getCargoMatchValues(state.target).map((value) => this.normalizeMatchValue(value));
    return values.some((value) => value.includes("conveyor") || value.includes("roller") || value.includes("chain"));
  }

  /** 生成输送线本帧货箱位移，辊道机额外按输送段范围夹紧。 */
  private createCargoTransportWorldDelta(
    state: DataDrivenTargetState,
    transport: CargoTransportState,
    direction: number,
    elapsedSeconds: number
  ): Vector3 {
    const rawDistance = direction * transport.speed * elapsedSeconds;
    const axisDirection = this.modelLocalAxisToWorldDirection(state.target.root, transport.axis);
    if (axisDirection.lengthSquared() <= 0) {
      return Vector3.Zero();
    }

    const distance = this.isBoundedRollerConveyorTarget(state.target)
      ? this.clampBoundedCargoTransportDistance(state, transport, axisDirection, rawDistance)
      : rawDistance;
    return Math.abs(distance) <= 0 ? Vector3.Zero() : axisDirection.scale(distance);
  }

  /** 辊道机货箱按当前辊筒输送段夹紧，整箱到末端后等待反向或重绑信号。 */
  private clampBoundedCargoTransportDistance(
    state: DataDrivenTargetState,
    transport: CargoTransportState,
    axisDirection: Vector3,
    rawDistance: number
  ): number {
    const direction = Math.sign(rawDistance);
    if (direction === 0) {
      return 0;
    }

    const trackRange = this.createCargoTransportTrackRange(state, axisDirection);
    const cargoRange = this.createNodeProjectionRange(transport.cargoRoot, axisDirection);
    if (!trackRange || !cargoRange) {
      return rawDistance;
    }

    const trackLength = trackRange.maximum - trackRange.minimum;
    const cargoLength = cargoRange.maximum - cargoRange.minimum;
    if (trackLength <= 0 || cargoLength > trackLength) {
      transport.blockedDirection = direction;
      transport.blockedBoundary = direction > 0 ? "end" : "start";
      return 0;
    }

    const nextMinimum = cargoRange.minimum + rawDistance;
    const nextMaximum = cargoRange.maximum + rawDistance;
    if (direction > 0 && nextMaximum > trackRange.maximum) {
      transport.blockedDirection = direction;
      transport.blockedBoundary = "end";
      return Math.max(0, trackRange.maximum - cargoRange.maximum);
    }
    if (direction < 0 && nextMinimum < trackRange.minimum) {
      transport.blockedDirection = direction;
      transport.blockedBoundary = "start";
      return Math.min(0, trackRange.minimum - cargoRange.minimum);
    }

    transport.blockedDirection = undefined;
    transport.blockedBoundary = undefined;
    return rawDistance;
  }

  /** 计算辊道机当前有效输送段；优先使用辊筒运动节点，缺失时回退整机几何。 */
  private createCargoTransportTrackRange(state: DataDrivenTargetState, axisDirection: Vector3): CargoTransportAxisRange | null {
    const motionGroup = this.findCargoTransportMotionGroup(state);
    const ranges = (motionGroup?.nodes ?? [])
      .map((node) => this.createNodeProjectionRange(node, axisDirection))
      .filter((range): range is CargoTransportAxisRange => Boolean(range));
    if (ranges.length > 0) {
      return this.mergeProjectionRanges(ranges);
    }

    return this.createNodeProjectionRange(state.target.root, axisDirection);
  }

  /** 将节点真实网格包围盒直接投影到输送方向，避免旋转后世界 AABB 放大输送范围。 */
  private createNodeProjectionRange(node: TransformNode, axisDirection: Vector3): CargoTransportAxisRange | null {
    const projectedBounds = this.projectNodesBoundsOnAxis([node], axisDirection);
    if (!projectedBounds) {
      return null;
    }

    return { minimum: projectedBounds.min, maximum: projectedBounds.max };
  }

  /** 合并多个投影范围，得到整体输送段或货箱占用段。 */
  private mergeProjectionRanges(ranges: CargoTransportAxisRange[]): CargoTransportAxisRange | null {
    if (ranges.length === 0) {
      return null;
    }

    const minimum = Math.min(...ranges.map((range) => range.minimum));
    const maximum = Math.max(...ranges.map((range) => range.maximum));
    return Number.isFinite(minimum) && Number.isFinite(maximum) && maximum >= minimum ? { minimum, maximum } : null;
  }

  /** 辊道机需要有界输送，防止绑定货箱越过输送段首尾。 */
  private isBoundedRollerConveyorTarget(target: SceneDataDrivenTarget): boolean {
    const matchValues = this.dedupeStrings([
      target.dataDriven?.device?.defaultAssetCode,
      target.matchFields.assetCode,
      target.matchFields.modelKey,
      target.matchFields.deviceId,
      target.matchFields.name,
      target.matchFields.sourceFile,
      target.matchFields.sourceFileStem
    ]).map((value) => this.normalizeMatchValue(value));

    return matchValues.some((value) => value === "rollerconveyor01" || value.includes("rollerconveyor"));
  }

  /** 读取输送线当前动作方向，优先使用 movement_x 对应的 action 运动组。 */
  private resolveCargoTransportDirection(state: DataDrivenTargetState): number {
    const group = this.findCargoTransportMotionGroup(state);
    if (!group) {
      return 0;
    }

    const direction = state.motionActionDirections.get(group.key) ?? 0;
    return Number.isFinite(direction) ? Math.sign(direction) : 0;
  }

  /** 货箱沿输送线本地轴移动，默认 movement_x 对应模型本地 X 轴。 */
  private resolveCargoTransportAxis(state: DataDrivenTargetState): ModelDataDrivenAxis {
    const group = this.findCargoTransportMotionGroup(state);
    if (!group) {
      return "x";
    }

    if (group.target === "root" && group.kind === "translate") {
      return group.axis;
    }
    return this.resolveAxisFromMotionFields(group.fields);
  }

  /** 输送线载货速度优先复用平移运动组速度，辊筒旋转类模型使用运行态默认速度。 */
  private resolveCargoTransportSpeed(state: DataDrivenTargetState): number {
    const group = this.findCargoTransportMotionGroup(state);
    if (group?.kind === "translate" && group.speed && group.speed > 0) {
      return group.speed;
    }
    return DEFAULT_CONVEYOR_CARGO_SPEED;
  }

  /** 查找最适合表达输送线前进/后退的 action 运动组。 */
  private findCargoTransportMotionGroup(state: DataDrivenTargetState): RuntimeMotionGroup | undefined {
    const actionGroups = state.motionGroups.filter((group) => group.valueMode === "action");
    return (
      actionGroups.find((group) => this.motionGroupUsesField(group, "movement_x")) ??
      actionGroups.find((group) => this.motionGroupUsesField(group, "rotation")) ??
      actionGroups[0]
    );
  }

  /** 判断运动组字段是否包含指定点位名。 */
  private motionGroupUsesField(group: RuntimeMotionGroup, fieldName: string): boolean {
    const normalizedField = this.normalizeMatchValue(fieldName);
    return group.fields.some((field) => this.normalizeMatchValue(field) === normalizedField);
  }

  /** 按 movement_x/y/z 点位名推导货箱输送轴，rotation 仍按 X 方向作为输送线默认流向。 */
  private resolveAxisFromMotionFields(fields: string[]): ModelDataDrivenAxis {
    const normalizedFields = fields.map((field) => this.normalizeMatchValue(field));
    if (normalizedFields.includes("movement_y")) {
      return "y";
    }
    if (normalizedFields.includes("movement_z")) {
      return "z";
    }
    return "x";
  }

  /** 判断指定根节点当前是否作为货箱被载体吸附，吸附期间不再消费自身位姿帧。 */
  private isAttachedCargoRoot(root: TransformNode): boolean {
    return this.cargoAttachments.has(root.uniqueId);
  }

  /** 判断指定根节点是否正由 Stacker 或输送线运行态关系驱动。 */
  private isRuntimeDrivenCargoRoot(root: TransformNode): boolean {
    return this.isAttachedCargoRoot(root) || this.cargoTransports.has(root.uniqueId);
  }

  /** 把货箱自身数据驱动状态同步到当前姿态，避免吸附或放货后被旧 twinspawn 目标拉回。 */
  private syncCargoTargetStateToCurrentPose(cargoRoot: TransformNode, now: number): void {
    const cargoState = this.targetStates.get(cargoRoot.uniqueId);
    if (!cargoState) {
      return;
    }

    const currentPosition = cargoRoot.position.clone();
    cargoState.rootStartPosition = currentPosition.clone();
    cargoState.rootTargetPosition = currentPosition.clone();
    if (cargoState.rootStartRotationY !== undefined && cargoState.rootTargetRotationY !== undefined && !cargoRoot.rotationQuaternion) {
      cargoState.rootStartRotationY = cargoRoot.rotation.y;
      cargoState.rootTargetRotationY = cargoRoot.rotation.y;
    }
    cargoState.motionStartedAt = now;
    cargoState.motionDurationMs = 0;
    cargoState.motionStartValues = new Map(cargoState.motionValues);
    cargoState.motionActionDirections.forEach((_direction, key) => cargoState.motionActionDirections.set(key, 0));
    cargoState.motionActionUpdatedAt = now;
    cargoState.motionStartPositions = this.captureNodePositions(cargoState.motionNodes);
    cargoState.motionTargetPositions = this.captureNodePositions(cargoState.motionNodes);
    cargoState.motionStartRotations = this.captureNodeRotations(cargoState.motionNodes);
    cargoState.motionTargetRotations = this.captureNodeRotations(cargoState.motionNodes);
  }

  /** 读取当前货叉伸出量，模型脚本自定义 fork 名称时也按字段名兜底识别。 */
  private readCurrentForkExtension(state: DataDrivenTargetState): number {
    const directValue = state.motionValues.get("fork");
    if (directValue !== undefined) {
      return directValue;
    }

    for (const group of state.motionGroups) {
      const key = group.key.toLowerCase();
      if (key.includes("fork") && !key.includes("side")) {
        return state.motionValues.get(group.key) ?? 0;
      }
    }
    return 0;
  }

  /** 按资产编号、节点名或 uniqueId 查找被取放的货箱根节点。 */
  private findCargoTarget(cargoCode: string, carrierRoot: TransformNode): SceneDataDrivenTarget | null {
    const normalizedCargoCode = this.normalizeMatchValue(cargoCode);
    return (
      this.options.getTargets().find((target) => {
        if (target.root.uniqueId === carrierRoot.uniqueId || target.root.isDescendantOf?.(carrierRoot) || carrierRoot.isDescendantOf?.(target.root)) {
          return false;
        }
        return this.getCargoMatchValues(target).some((value) => this.normalizeMatchValue(value) === normalizedCargoCode);
      }) ?? null
    );
  }

  /** 生成货箱可匹配值，优先使用业务资产编号，也允许 demo 直接用名称或 uniqueId。 */
  private getCargoMatchValues(target: SceneDataDrivenTarget): string[] {
    return this.dedupeStrings([
      target.matchFields.assetCode,
      target.matchFields.cargoCode,
      target.matchFields.boxCode,
      target.matchFields.uniqueId,
      target.matchFields.name,
      ...Object.values(target.matchFields)
    ]);
  }

  /** 按 target 字段查找定位线框放货目标，定位框无需启用动画接收。 */
  private findCargoDropTarget(dropTargetCode: string): SceneDataDrivenDropTarget | null {
    const normalizedTargetCode = this.normalizeMatchValue(dropTargetCode);
    return (
      this.options.getDropTargets().find((target) =>
        this.getDropTargetMatchValues(target).some((value) => this.normalizeMatchValue(value) === normalizedTargetCode)
      ) ?? null
    );
  }

  /** 生成定位框可匹配值，优先使用定位框资产编号，也兼容名称和 uniqueId。 */
  private getDropTargetMatchValues(target: SceneDataDrivenDropTarget): string[] {
    return this.dedupeStrings([
      target.matchFields.locatorAssetCode,
      target.matchFields.assetCode,
      target.matchFields.uniqueId,
      target.matchFields.name,
      ...Object.values(target.matchFields)
    ]);
  }

  /** 把货物底部中心对齐到定位线框底面中心，保留货物自身父级关系。 */
  private moveCargoToDropTarget(cargoRoot: TransformNode, dropTargetRoot: TransformNode): boolean {
    if (cargoRoot.isDisposed() || dropTargetRoot.isDisposed()) {
      return false;
    }

    const dropPosition = dropTargetRoot.getAbsolutePosition();
    const cargoRootPosition = cargoRoot.getAbsolutePosition();
    const cargoBottomCenter = this.getNodeWorldBottomCenter(cargoRoot) ?? cargoRootPosition;
    const rootOffsetFromBottomCenter = cargoRootPosition.subtract(cargoBottomCenter);
    return this.setNodeAbsolutePosition(cargoRoot, dropPosition.add(rootOffsetFromBottomCenter));
  }

  /** 读取节点世界包围盒底面中心；无几何时让调用方回退到根节点位置。 */
  private getNodeWorldBottomCenter(node: TransformNode): Vector3 | null {
    const bounds = this.getNodeWorldBounds(node);
    if (!bounds) {
      return null;
    }

    return new Vector3(
      (bounds.minimum.x + bounds.maximum.x) / 2,
      bounds.minimum.y,
      (bounds.minimum.z + bounds.maximum.z) / 2
    );
  }

  /** 计算节点真实几何的世界包围盒，过滤无顶点或已禁用的网格。 */
  private getNodeWorldBounds(node: TransformNode): NodeWorldBounds | null {
    const meshes = this.getMotionLimitMeshes([node]);
    if (meshes.length === 0) {
      return null;
    }

    const minimum = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const maximum = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    meshes.forEach((mesh) => {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      minimum.x = Math.min(minimum.x, box.minimumWorld.x);
      minimum.y = Math.min(minimum.y, box.minimumWorld.y);
      minimum.z = Math.min(minimum.z, box.minimumWorld.z);
      maximum.x = Math.max(maximum.x, box.maximumWorld.x);
      maximum.y = Math.max(maximum.y, box.maximumWorld.y);
      maximum.z = Math.max(maximum.z, box.maximumWorld.z);
    });

    return [minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z].every(Number.isFinite) ? { minimum, maximum } : null;
  }

  /** 计算货叉吸附点的世界坐标，默认取货叉节点中心并加一个竖向承载偏移。 */
  private getCargoAnchorWorldPosition(state: DataDrivenTargetState, cargoConfig: RuntimeCargoHandlingConfig): Vector3 {
    const anchorNodes = cargoConfig.anchorNodes.filter((node) => !node.isDisposed());
    const basePosition = anchorNodes.length > 0 ? this.averageNodeWorldPosition(anchorNodes) : state.target.root.getAbsolutePosition();
    return basePosition.add(this.modelLocalVectorToWorldVector(state.target.root, cargoConfig.anchorOffset));
  }

  /** 计算多个节点世界坐标平均值，双货叉节点会自然落在中心线。 */
  private averageNodeWorldPosition(nodes: TransformNode[]): Vector3 {
    const total = nodes.reduce((sum, node) => sum.addInPlace(node.getAbsolutePosition()), Vector3.Zero());
    return total.scale(1 / Math.max(1, nodes.length));
  }

  /** 将模型根局部偏移转换成世界偏移，只使用旋转方向，不继承缩放。 */
  private modelLocalVectorToWorldVector(root: TransformNode, offset: Vector3): Vector3 {
    const result = Vector3.Zero();
    this.addModelLocalAxisDelta(result, root, "x", offset.x);
    this.addModelLocalAxisDelta(result, root, "y", offset.y);
    this.addModelLocalAxisDelta(result, root, "z", offset.z);
    return result;
  }

  /** 写入节点世界坐标，保留原父级关系，避免运行态吸附污染层级树。 */
  private setNodeAbsolutePosition(node: TransformNode, worldPosition: Vector3): boolean {
    const current = node.getAbsolutePosition();
    if (Vector3.DistanceSquared(current, worldPosition) < 1e-10) {
      return false;
    }

    const parent = node.parent;
    if (parent instanceof TransformNode) {
      parent.computeWorldMatrix(true);
      const localPosition = Vector3.TransformCoordinates(worldPosition, Matrix.Invert(parent.getWorldMatrix()));
      node.position.copyFrom(localPosition);
    } else {
      node.position.copyFrom(worldPosition);
    }
    node.computeWorldMatrix(true);
    return true;
  }

  /** 把 from 到 to 的插值结果写入 target，数值未变化时返回 false。 */
  private copyInterpolatedVector(target: Vector3, from: Vector3, to: Vector3, progress: number): boolean {
    const nextX = this.lerp(from.x, to.x, progress);
    const nextY = this.lerp(from.y, to.y, progress);
    const nextZ = this.lerp(from.z, to.z, progress);
    if (Math.abs(target.x - nextX) < 0.000001 && Math.abs(target.y - nextY) < 0.000001 && Math.abs(target.z - nextZ) < 0.000001) {
      return false;
    }

    target.set(nextX, nextY, nextZ);
    return true;
  }

  /** 把 from 到 to 的旋转插值结果写入节点，数值未变化时返回 false。 */
  private copyInterpolatedRotation(
    node: TransformNode,
    from: MotionRotationSnapshot,
    to: MotionRotationSnapshot,
    progress: number
  ): boolean {
    if (from.quaternion && to.quaternion) {
      const next = Quaternion.Slerp(from.quaternion, to.quaternion, progress);
      const current = node.rotationQuaternion ?? Quaternion.Identity();
      if (this.areQuaternionsClose(current, next)) {
        return false;
      }

      node.rotationQuaternion = next;
      return true;
    }

    if (node.rotationQuaternion) {
      node.rotationQuaternion = null;
    }
    return this.copyInterpolatedVector(node.rotation, from.euler, to.euler, progress);
  }

  /** 判断两个四元数是否足够接近，避免每帧无意义地触发刷新。 */
  private areQuaternionsClose(left: Quaternion, right: Quaternion): boolean {
    return (
      Math.abs(left.x - right.x) < 0.000001 &&
      Math.abs(left.y - right.y) < 0.000001 &&
      Math.abs(left.z - right.z) < 0.000001 &&
      Math.abs(left.w - right.w) < 0.000001
    );
  }

  /** 查找一帧数据对应的场景模型；没有设备号且只有一个目标时默认驱动该目标。 */
  private findTargetForFrame(frame: DataFrame, config: SceneDataDrivenSnapshot): SceneDataDrivenTarget | null {
    const targets = this.options.getTargets();
    let frameContainsDeviceId = false;
    for (const target of targets) {
      const deviceId = this.readString(frame, this.getDeviceIdFieldCandidates(target, config));
      if (!deviceId) {
        continue;
      }

      frameContainsDeviceId = true;
      const normalizedDeviceId = this.normalizeMatchValue(deviceId);
      if (this.getTargetMatchValues(target, config).some((value) => value && this.normalizeMatchValue(value) === normalizedDeviceId)) {
        return target;
      }
    }

    const fallbackTargets = targets.filter((target) => !target.requiresDeviceMatch);
    return !frameContainsDeviceId && fallbackTargets.length === 1 ? fallbackTargets[0] : null;
  }

  /** 解析 JSON payload，非 JSON 文本会被忽略。 */
  private parsePayload(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      console.warn("数据驱动消息不是合法 JSON，已忽略。");
      return undefined;
    }
  }

  /** 从原始 payload 中提取业务数据帧，支持数组、data/payload 包装和用户配置路径。 */
  private extractPayloadFrames(payload: unknown, config: SceneDataDrivenSnapshot, metadata?: BusinessDataMessageMetadata): DataFrame[] {
    const topicMetadata = parseLogisticsMqttTopic(metadata?.mqttTopic);
    if (!this.shouldConsumeMqttTopicForMotion(topicMetadata)) {
      return [];
    }

    const scopedPayload = config.payloadPath.trim() ? this.readPath(payload, config.payloadPath.trim()) : payload;
    const normalizedPayload = this.normalizeDocumentJointPayload(scopedPayload, topicMetadata);
    const frames: DataFrame[] = [];
    this.collectFrames(normalizedPayload, frames, this.getCommonFrameFieldNames(config), topicMetadata);
    return frames;
  }

  /** 只让规范内会影响孪生展示的 topic 进入模型运动链路，状态和告警交给 POI 业务层消费。 */
  private shouldConsumeMqttTopicForMotion(metadata: LogisticsMqttTopicMetadata | null): boolean {
    if (!metadata) {
      return true;
    }

    if (metadata.msgFlag === "twinspawn") {
      return true;
    }

    if (metadata.msgFlag !== "twindatadriven") {
      return false;
    }

    return metadata.subRes === "joint" || metadata.subRes === "payload";
  }

  /** 将 MQTT 文档的 {e,p,v} 点位格式归一化为运行时可直接读取的 {e,[p]:v} 帧。 */
  private normalizeDocumentJointPayload(value: unknown, metadata: LogisticsMqttTopicMetadata | null): unknown {
    if (Array.isArray(value)) {
      const jointRecords = value.filter((item) => this.isDocumentJointRecord(item));
      if (jointRecords.length === 0 || jointRecords.length !== value.length) {
        return value;
      }

      const groupedFrames = new Map<string, Record<string, unknown>>();
      jointRecords.forEach((record) => {
        const pointName = this.readJointPointName(record);
        if (!pointName) {
          return;
        }

        const deviceId = this.readJointDeviceId(record);
        const normalizedDeviceId = deviceId ?? metadata?.devId;
        const frameKey = normalizedDeviceId ?? `__anonymous_${groupedFrames.size}`;
        const frame = groupedFrames.get(frameKey) ?? {};
        if (normalizedDeviceId) {
          frame.e = normalizedDeviceId;
        }
        if (record.ts !== undefined) {
          frame.ts = record.ts;
        }
        frame[pointName] = record.v;
        this.applyDocumentPointAlias(frame, pointName, record.v);
        applyLogisticsMqttFrameDefaults(frame, metadata);
        groupedFrames.set(frameKey, frame);
      });
      return [...groupedFrames.values()];
    }

    if (!this.isDocumentJointRecord(value)) {
      return value;
    }

    const pointName = this.readJointPointName(value);
    if (!pointName) {
      return value;
    }

    const frame: Record<string, unknown> = { [pointName]: value.v };
    const deviceId = this.readJointDeviceId(value) ?? metadata?.devId;
    if (deviceId) {
      frame.e = deviceId;
    }
    if (value.ts !== undefined) {
      frame.ts = value.ts;
    }
    this.applyDocumentPointAlias(frame, pointName, value.v);
    applyLogisticsMqttFrameDefaults(frame, metadata);
    return frame;
  }

  /** 将规范点位、现场 PLC 点位映射到运行时可消费的标准字段。 */
  private applyDocumentPointAlias(frame: Record<string, unknown>, pointName: string, pointValue: unknown): void {
    this.applyDocumentFieldAlias(frame, pointName, pointValue);
  }

  /** 扫描整帧字段，兼容已经是对象形态的现场 PLC 报文。 */
  private applyDocumentFrameAliases(frame: Record<string, unknown>): void {
    Object.entries(frame).forEach(([fieldName, fieldValue]) => this.applyDocumentFieldAlias(frame, fieldName, fieldValue));
  }

  /** 将单个点位别名写入标准字段，原始点位仍保留给业务层展示。 */
  private applyDocumentFieldAlias(frame: Record<string, unknown>, pointName: string, pointValue: unknown): void {
    const normalizedPointName = this.normalizeProtocolFieldName(pointName);
    const compactPointName = normalizedPointName.replace(/[\s_]/g, "");
    if (normalizedPointName === "payload") {
      if (frame.cargo === undefined) {
        frame.cargo = pointValue;
      }
      if (frame.cargoId === undefined) {
        frame.cargoId = pointValue;
      }
      return;
    }

    if (normalizedPointName === STACKER_PLC_DEVICE_CODE_FIELD.toLowerCase() || compactPointName === "devicecode") {
      if (frame[STACKER_PLC_DEVICE_CODE_FIELD] === undefined) {
        frame[STACKER_PLC_DEVICE_CODE_FIELD] = pointValue;
      }
      if (frame.deviceCode === undefined) {
        frame.deviceCode = pointValue;
      }
      return;
    }

    if (normalizedPointName === "action") {
      this.writeMotionAlias(frame, "movement_x", this.readBitfieldAction(pointValue, [0], [1]));
      return;
    }

    if (compactPointName === "frontaction" || compactPointName === "backaction") {
      this.writeMotionAlias(frame, "movement_y", this.readBitfieldAction(pointValue, [2], [3]));
      return;
    }

    if (compactPointName === "frontforkaction") {
      this.writeMotionAlias(frame, "front_movement_z", this.readBitfieldAction(pointValue, [1, 3], [2, 4]));
      return;
    }

    if (compactPointName === "backforkaction") {
      this.writeMotionAlias(frame, "back_movement_z", this.readBitfieldAction(pointValue, [1, 3], [2, 4]));
    }
  }

  /** 规范化协议字段名，只用于别名判断，不改变原始 payload 字段。 */
  private normalizeProtocolFieldName(value: string): string {
    return value.trim().replace(/-/g, "_").toLowerCase();
  }

  /** 把 PLC 位信号转换成运行时动作枚举：1 正向，2 反向，0 停止或冲突。 */
  private readBitfieldAction(value: unknown, positiveBits: number[], negativeBits: number[]): number | undefined {
    const bitfield = this.readBitfieldNumber(value);
    if (bitfield === undefined) {
      return undefined;
    }

    const positive = positiveBits.some((bit) => (bitfield & (1 << bit)) !== 0);
    const negative = negativeBits.some((bit) => (bitfield & (1 << bit)) !== 0);
    if (positive && !negative) {
      return 1;
    }
    if (negative && !positive) {
      return 2;
    }
    return 0;
  }

  /** 读取 PLC Byte 位域，非法值不参与动作别名转换。 */
  private readBitfieldNumber(value: unknown): number | undefined {
    const numberValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      return undefined;
    }
    return Math.trunc(numberValue);
  }

  /** 写入动作别名；0 不覆盖后续同帧非 0 动作，避免前后叉空信号挡住真实动作。 */
  private writeMotionAlias(frame: Record<string, unknown>, fieldName: string, action: number | undefined): void {
    if (action === undefined) {
      return;
    }

    const current = frame[fieldName];
    if (current === undefined || (this.isZeroActionValue(current) && action !== 0)) {
      frame[fieldName] = action;
    }
  }

  /** 判断当前动作值是否是停止态，用于同帧多个 PLC 信号的优先级合并。 */
  private isZeroActionValue(value: unknown): boolean {
    if (typeof value === "number") {
      return value === 0;
    }
    return typeof value === "string" && value.trim() === "0";
  }

  /** 判断对象是否符合文档 twindatadriven/joint 的单点位格式。 */
  private isDocumentJointRecord(value: unknown): value is Record<string, unknown> & { v: unknown } {
    if (!this.isRecord(value)) {
      return false;
    }
    return Boolean(this.readJointPointName(value) && value.v !== undefined);
  }

  /** 读取文档 joint 消息中的设备编号，兼容 Excel 常用 deviceCode 和旧 e 字段。 */
  private readJointDeviceId(record: Record<string, unknown>): string | undefined {
    for (const key of ["e", "deviceCode", STACKER_PLC_DEVICE_CODE_FIELD, "devId", "deviceId", "deviceID", "assetCode"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return undefined;
  }

  /** 读取文档 joint 消息中的点位名称，空名称不参与运动映射。 */
  private readJointPointName(record: Record<string, unknown>): string | undefined {
    const value = record.p;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  /** 递归收集 payload 中可能的业务帧，达到上限后立即停止展开。 */
  private collectFrames(
    value: unknown,
    output: DataFrame[],
    commonFieldNames: string[],
    metadata: LogisticsMqttTopicMetadata | null
  ): void {
    if (output.length >= MAX_FRAMES_PER_MESSAGE) {
      return;
    }

    const normalizedValue = this.normalizeDocumentJointPayload(value, metadata);
    if (normalizedValue !== value) {
      this.collectFrames(normalizedValue, output, commonFieldNames, metadata);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectFrames(item, output, commonFieldNames, metadata);
        if (output.length >= MAX_FRAMES_PER_MESSAGE) {
          return;
        }
      }
      return;
    }

    if (!this.isRecord(value)) {
      return;
    }

    if (this.hasMotionLikeField(value)) {
      output.push(this.createFrameWithMqttDefaults(value, metadata));
      return;
    }

    const nestedFrames: DataFrame[] = [];
    ["data", "payload", "message"].forEach((key) => this.collectFrames(value[key], nestedFrames, commonFieldNames, metadata));
    if (nestedFrames.length > 0) {
      const commonFields = this.pickCommonFrameFields(value, commonFieldNames);
      for (const frame of nestedFrames) {
        if (output.length >= MAX_FRAMES_PER_MESSAGE) {
          return;
        }
        output.push(this.createFrameWithMqttDefaults({ ...commonFields, ...frame }, metadata));
      }
      return;
    }

    output.push(this.createFrameWithMqttDefaults(value, metadata));
  }

  /** 给帧补齐 MQTT topic 中的设备上下文，避免直接修改原始 payload 对象。 */
  private createFrameWithMqttDefaults(value: Record<string, unknown>, metadata: LogisticsMqttTopicMetadata | null): DataFrame {
    const frame: DataFrame = { ...value };
    applyLogisticsMqttFrameDefaults(frame, metadata);
    this.applyDocumentFrameAliases(frame);
    return frame;
  }

  /** 判断对象是否包含常见运动字段，避免把包装对象误当业务帧。 */
  private hasMotionLikeField(value: Record<string, unknown>): boolean {
    return [
      "x",
      "y",
      "z",
      "h",
      "position",
      "pos",
      "location",
      "movement_x",
      "movement_y",
      "movement_z",
      "front_movement_z",
      "back_movement_z",
      "front_action",
      "back_action",
      "front_forkAction",
      "back_forkAction",
      "forkState",
      "rotation",
      "move",
      "action",
      "folding",
      "flip",
      "fork",
      "travel_pos",
      "trackZ",
      "travelZ",
      "travel",
      "lift_pos",
      "liftY",
      "lift",
      "platformY",
      "fork_extend",
      "forkExtend",
      "forkX",
      "fork_side",
      "forkZ",
      "cargo_action",
      "cargoAction",
      "cargo",
      "cargoId",
      "cargoCode",
      "boxId",
      "boxCode",
      "r",
      "yaw",
      "rotationY"
    ].some((key) => value[key] !== undefined);
  }

  /** 从包装对象中保留设备标识字段，方便 data/payload 内只含坐标。 */
  private pickCommonFrameFields(value: Record<string, unknown>, commonFieldNames: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    commonFieldNames.forEach((key) => {
      if (value[key] !== undefined) {
        result[key] = value[key];
      }
    });
    return result;
  }

  /** 汇总场景和模型脚本可能使用的设备字段名，用于包装 payload 向内层帧透传。 */
  private getCommonFrameFieldNames(config: SceneDataDrivenSnapshot): string[] {
    const targets = this.options.getTargets();
    return this.dedupeStrings([
      config.deviceIdField,
      ...targets.map((target) => target.dataDriven?.device?.deviceIdField),
      "e",
      "deviceCode",
      STACKER_PLC_DEVICE_CODE_FIELD,
      "devId",
      "deviceId",
      "deviceID",
      "id",
      "assetCode",
      "modelKey",
      ...CARGO_ACTION_FIELDS,
      ...CARGO_TARGET_FIELDS,
      ...CARGO_DROP_TARGET_FIELDS,
      ...targets.flatMap((target) => target.dataDriven?.cargoHandling?.actionFields ?? []),
      ...targets.flatMap((target) => target.dataDriven?.cargoHandling?.cargoFields ?? []),
      ...targets.flatMap((target) => target.dataDriven?.cargoHandling?.targetFields ?? [])
    ]);
  }

  /** 按多个候选路径读取数字字段。 */
  private readNumber(frame: DataFrame, paths: string[]): number | undefined {
    for (const path of paths) {
      const value = this.readPath(frame, path);
      const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }
    return undefined;
  }

  /** 按多个候选路径读取字符串字段。 */
  private readString(frame: DataFrame, paths: string[]): string | undefined {
    for (const path of paths.filter(Boolean)) {
      const value = this.readPath(frame, path);
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return undefined;
  }

  /** 按点路径读取对象属性，支持简单的 a.b.c 路径。 */
  private readPath(value: unknown, path: string): unknown {
    if (!path) {
      return value;
    }

    return path.split(".").reduce<unknown>((current, segment) => {
      if (!this.isRecord(current)) {
        return undefined;
      }
      return current[segment];
    }, value);
  }

  /** 生成一帧数据可能使用的设备字段列表，模型脚本默认值优先于通用兜底字段。 */
  private getDeviceIdFieldCandidates(target: SceneDataDrivenTarget, config: SceneDataDrivenSnapshot): string[] {
    return this.dedupeStrings([
      target.dataDriven?.device?.deviceIdField,
      config.deviceIdField,
      "e",
      "deviceCode",
      STACKER_PLC_DEVICE_CODE_FIELD,
      "devId",
      "deviceId",
      "deviceID",
      "id",
      "assetCode",
      "modelKey"
    ]);
  }

  /** 生成目标侧可匹配值，模型脚本默认资产编号只作为兜底，不覆盖用户绑定。 */
  private getTargetMatchValues(target: SceneDataDrivenTarget, config: SceneDataDrivenSnapshot): string[] {
    const assetCodeField = target.dataDriven?.device?.assetCodeField?.trim() || config.assetCodeField;
    return this.dedupeStrings([
      target.matchFields[assetCodeField],
      target.matchFields.assetCode,
      target.dataDriven?.device?.defaultAssetCode,
      target.matchFields.modelKey,
      target.matchFields.deviceId,
      target.matchFields.name,
      target.matchFields.sourceFile,
      target.matchFields.sourceFileStem
    ]);
  }

  /** 读取 target 模式运动组绑定的 payload 数字目标值。 */
  private readMotionGroupValue(frame: DataFrame, group: RuntimeMotionGroup): number | undefined {
    return group.valueMode === "target" && group.fields.length > 0 ? this.readNumber(frame, group.fields) : undefined;
  }

  /** 读取 action 模式运动组绑定的原始枚举值，字符串和数字都按协议码处理。 */
  private readMotionGroupRawActionValue(frame: DataFrame, group: RuntimeMotionGroup): unknown {
    if (group.valueMode !== "action") {
      return undefined;
    }

    for (const field of group.fields) {
      const value = this.readPath(frame, field);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  /** 把协议动作枚举转换为方向，未声明的枚举值不更新上一帧方向。 */
  private readMotionGroupActionDirection(frame: DataFrame, group: RuntimeMotionGroup): number | undefined {
    const rawValue = this.readMotionGroupRawActionValue(frame, group);
    const key = this.createActionMapKey(rawValue);
    return key !== undefined ? group.actionMap.get(key) : undefined;
  }

  /** 生成动作映射键，避免 1 和 "1" 被当成两种协议码。 */
  private createActionMapKey(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  /** 读取本帧命中的所有 target 模式运动组数值。 */
  private readMotionGroupValues(frame: DataFrame, groups: RuntimeMotionGroup[]): Map<string, number> {
    const values = new Map<string, number>();
    groups.forEach((group) => {
      const value = this.readMotionGroupValue(frame, group);
      if (value !== undefined) {
        values.set(group.key, value);
      }
    });
    return values;
  }

  /** 读取本帧命中的所有 action 模式方向，未上报字段沿用上一帧。 */
  private readMotionGroupActionDirections(frame: DataFrame, groups: RuntimeMotionGroup[]): Map<string, number> {
    const directions = new Map<string, number>();
    groups.forEach((group) => {
      const direction = this.readMotionGroupActionDirection(frame, group);
      if (direction !== undefined && Number.isFinite(direction)) {
        directions.set(group.key, direction);
      }
    });
    return directions;
  }

  /** 创建运动组目标值缓存，未上报字段按 0 解释为基线姿态。 */
  private createInitialMotionValues(groups: RuntimeMotionGroup[]): Map<string, number> {
    return new Map(groups.map((group) => [group.key, 0]));
  }

  /** 创建 action 模式方向缓存，默认停止，收到动作帧后再持续积分。 */
  private createInitialMotionActionDirections(groups: RuntimeMotionGroup[]): Map<string, number> {
    return new Map(groups.filter((group) => group.valueMode === "action").map((group) => [group.key, 0]));
  }

  /** 读取当前已经渲染到的逻辑运动值，用于新帧按真实剩余距离计算速度时长。 */
  private createCurrentMotionValues(state: DataDrivenTargetState, now: number): Map<string, number> {
    const progress = this.calculateMotionProgress(state, now);
    const easedProgress = this.easeOutCubic(progress);
    return new Map(
      state.motionGroups.map((group) => {
        if (group.valueMode === "action") {
          return [group.key, state.motionValues.get(group.key) ?? 0];
        }
        const startValue = state.motionStartValues.get(group.key) ?? 0;
        const targetValue = state.motionValues.get(group.key) ?? startValue;
        return [group.key, this.lerp(startValue, targetValue, easedProgress)];
      })
    );
  }

  /** 更新运动组最近一次目标值，缺失字段沿用上一帧。 */
  private updateMotionValues(current: Map<string, number>, next: Map<string, number>, groups: RuntimeMotionGroup[]): void {
    next.forEach((value, key) => {
      const group = groups.find((item) => item.key === key);
      current.set(key, this.clampMotionGroupValue(value, group));
    });
  }

  /** 更新 action 模式方向，0 表示停止并保持当前位置。 */
  private updateMotionActionDirections(current: Map<string, number>, next: Map<string, number>): void {
    next.forEach((direction, key) => current.set(key, direction));
  }

  /** 按模型脚本声明的速度计算本帧运动时长，多个运动组取最长值保证同步到达。 */
  private createSpeedDrivenMotionDuration(
    current: Map<string, number>,
    next: Map<string, number>,
    groups: RuntimeMotionGroup[]
  ): number | undefined {
    let duration = 0;
    let hasSpeedDrivenGroup = false;
    next.forEach((rawValue, key) => {
      const group = groups.find((item) => item.key === key);
      if (!group?.speed || group.speed <= 0) {
        return;
      }

      const currentValue = current.get(key) ?? 0;
      const nextValue = this.clampMotionGroupValue(rawValue, group);
      const delta = Math.abs(nextValue - currentValue);
      if (delta <= 0) {
        return;
      }

      const groupDuration = (delta / group.speed) * 1000;
      if (!Number.isFinite(groupDuration)) {
        return;
      }

      hasSpeedDrivenGroup = true;
      duration = Math.max(duration, groupDuration);
    });

    return hasSpeedDrivenGroup ? duration : undefined;
  }

  /** 将 payload 目标值限制在运动组行程内，越界数据只截断不打断预览。 */
  private clampMotionGroupValue(value: number, group: RuntimeMotionGroup | undefined): number {
    const limit = group?.limits;
    if (!limit || group.kind !== "translate") {
      return value;
    }

    let result = value;
    if (limit.min !== undefined) {
      result = Math.max(limit.min, result);
    }
    if (limit.max !== undefined) {
      result = Math.min(limit.max, result);
    }
    return result;
  }

  /** 若节点属于某运动组的顶层参与节点，则按模型根节点局部轴合成世界位移。 */
  private addMotionGroupDelta(
    node: TransformNode,
    root: TransformNode,
    group: RuntimeMotionGroup,
    value: number,
    worldDelta: Vector3
  ): void {
    if (group.nodes.length === 0 || !group.nodes.some((item) => item.uniqueId === node.uniqueId)) {
      return;
    }

    if (this.hasAncestorInSet(node, group.nodes)) {
      return;
    }

    this.addModelLocalAxisDelta(worldDelta, root, group.axis, value);
  }

  /** 若节点属于某旋转组的顶层参与节点，则按节点自身局部轴合成目标旋转。 */
  private addMotionGroupRotation(
    node: TransformNode,
    group: RuntimeMotionGroup,
    value: number,
    current: MotionRotationSnapshot
  ): MotionRotationSnapshot {
    if (value === 0 || group.nodes.length === 0 || !group.nodes.some((item) => item.uniqueId === node.uniqueId)) {
      return current;
    }

    if (this.hasAncestorInSet(node, group.nodes)) {
      return current;
    }

    const radians = (value * Math.PI) / 180;
    if (current.quaternion) {
      return {
        euler: current.euler.clone(),
        quaternion: current.quaternion.multiply(Quaternion.RotationAxis(this.getLocalAxisVector(group.axis), radians))
      };
    }

    const euler = current.euler.clone();
    if (group.axis === "x") {
      euler.x += radians;
    } else if (group.axis === "y") {
      euler.y += radians;
    } else {
      euler.z += radians;
    }
    return { euler };
  }

  /** 读取局部坐标轴单位向量。 */
  private getLocalAxisVector(axis: ModelDataDrivenAxis): Vector3 {
    return axis === "x" ? new Vector3(1, 0, 0) : axis === "y" ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  }

  /** 按模型根节点局部轴累加世界位移，忽略根节点缩放以保持 payload 米制距离。 */
  private addModelLocalAxisDelta(target: Vector3, root: TransformNode, axis: ModelDataDrivenAxis, value: number): void {
    if (value === 0) {
      return;
    }

    const worldDirection = this.modelLocalAxisToWorldDirection(root, axis);
    if (worldDirection.lengthSquared() <= 0) {
      return;
    }

    target.addInPlace(worldDirection.scale(value));
  }

  /** 将模型根节点局部轴转换为世界方向，只保留方向并归一化，不携带根节点缩放。 */
  private modelLocalAxisToWorldDirection(root: TransformNode, axis: ModelDataDrivenAxis): Vector3 {
    const localAxis = this.getLocalAxisVector(axis);
    root.computeWorldMatrix(true);
    const worldAxis = Vector3.TransformNormal(localAxis, root.getWorldMatrix());
    const lengthSquared = worldAxis.lengthSquared();
    if (lengthSquared <= 1e-12) {
      return Vector3.Zero();
    }

    return worldAxis.scale(1 / Math.sqrt(lengthSquared));
  }

  /** 创建货箱吸附运行态配置；没有显式模型包声明时 Stacker 使用安全默认值。 */
  private createCargoHandlingConfig(
    target: SceneDataDrivenTarget,
    isStacker: boolean,
    motionGroups: RuntimeMotionGroup[]
  ): RuntimeCargoHandlingConfig | null {
    const config = target.dataDriven?.cargoHandling;
    if (!isStacker && !config) {
      return null;
    }

    return {
      actionFields: this.dedupeStrings([...(config?.actionFields ?? []), ...CARGO_ACTION_FIELDS]),
      cargoFields: this.dedupeStrings([...(config?.cargoFields ?? []), ...CARGO_TARGET_FIELDS]),
      targetFields: this.dedupeStrings([...(config?.targetFields ?? []), ...CARGO_DROP_TARGET_FIELDS]),
      pickupValues: new Set(this.dedupeStrings([...(config?.pickupValues ?? []), ...CARGO_PICKUP_VALUES]).map((value) => this.normalizeMatchValue(value))),
      dropValues: new Set(this.dedupeStrings([...(config?.dropValues ?? []), ...CARGO_DROP_VALUES]).map((value) => this.normalizeMatchValue(value))),
      pickupMinForkExtension: this.readOptionalNonNegativeNumber(config?.pickupMinForkExtension, DEFAULT_CARGO_PICKUP_MIN_FORK_EXTENSION),
      pickupMaxDistance: this.readOptionalNonNegativeNumber(config?.pickupMaxDistance, DEFAULT_CARGO_PICKUP_MAX_DISTANCE),
      anchorNodes: this.findCargoAnchorNodes(target.root, config, motionGroups),
      anchorOffset: this.readCargoAnchorOffset(config)
    };
  }

  /** 查找货叉吸附参考节点，优先模型包声明，其次复用 fork 运动组节点。 */
  private findCargoAnchorNodes(
    root: TransformNode,
    config: ModelDataDrivenCargoHandlingDefinition | undefined,
    motionGroups: RuntimeMotionGroup[]
  ): TransformNode[] {
    const nodes = this.getTransformSubtree(root).filter((node) => node !== root);
    if (config?.anchorNodes?.length) {
      const exactNames = new Set(config.anchorNodes);
      const exactMatches = nodes.filter((node) => exactNames.has(String(node.name ?? "")));
      if (exactMatches.length > 0) {
        return this.dedupeTransformNodes(exactMatches);
      }
    }

    if (config?.anchorFallbackPattern) {
      const fallbackMatches = nodes.filter((node) => this.matchesConfiguredFallbackPattern(String(node.name ?? ""), config.anchorFallbackPattern));
      if (fallbackMatches.length > 0) {
        return this.dedupeTransformNodes(fallbackMatches);
      }
    }

    const forkNodes = motionGroups
      .filter((group) => {
        const key = group.key.toLowerCase();
        return key.includes("fork") && !key.includes("side");
      })
      .flatMap((group) => group.nodes);
    return this.dedupeTransformNodes(forkNodes);
  }

  /** 读取货箱吸附点偏移，非法或缺省时使用货叉上方的默认承载高度。 */
  private readCargoAnchorOffset(config: ModelDataDrivenCargoHandlingDefinition | undefined): Vector3 {
    const offset = config?.anchorOffset;
    if (!offset || ![offset.x, offset.y, offset.z].every((item) => Number.isFinite(item))) {
      return DEFAULT_CARGO_ANCHOR_OFFSET.clone();
    }
    return new Vector3(offset.x, offset.y, offset.z);
  }

  /** 读取可选非负数，模型包填错时回退到默认保护值。 */
  private readOptionalNonNegativeNumber(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  /** 根据模型脚本或旧 Stacker 兜底规则创建最终生效的运动组。 */
  private createMotionGroups(
    target: SceneDataDrivenTarget,
    isStacker: boolean,
    legacyStackerGroups: LegacyStackerMotionGroups
  ): RuntimeMotionGroup[] {
    const motion = target.dataDriven?.motion;
    if (motion) {
      const fixedNodeNames = target.dataDriven?.fixedNodes?.length ? target.dataDriven.fixedNodes : [];
      return Object.entries(motion)
        .map(([key, group]) =>
          this.createRuntimeMotionGroup(
            key,
            target.root,
            group,
            [],
            group.axis,
            [],
            /$a/,
            fixedNodeNames,
            isStacker && key === "travel" ? fixedNodeNames : [],
            false
          )
        )
        .filter((group) => group.fields.length > 0 && (group.target === "root" || group.nodes.length > 0));
    }

    return isStacker ? Object.values(legacyStackerGroups).filter((group) => group.fields.length > 0 && (group.target === "root" || group.nodes.length > 0)) : [];
  }

  /** 根据模型脚本或旧 Stacker 兜底规则创建四类 Stacker 运动组。 */
  private createStackerMotionGroups(target: SceneDataDrivenTarget): LegacyStackerMotionGroups {
    const motion = target.dataDriven?.motion;
    const useLegacyFallback = !motion;
    const fixedNodeNames = target.dataDriven?.fixedNodes?.length ? target.dataDriven.fixedNodes : useLegacyFallback ? STACKER_TRACK_NODE_NAMES : [];
    return {
      travel: this.createRuntimeMotionGroup(
        "travel",
        target.root,
        motion?.travel,
        STACKER_TRAVEL_FIELDS,
        "z",
        STACKER_TRAVEL_NODE_NAMES,
        STACKER_TRAVEL_FALLBACK_PATTERN,
        fixedNodeNames,
        useLegacyFallback ? fixedNodeNames : [],
        useLegacyFallback
      ),
      lift: this.createRuntimeMotionGroup(
        "lift",
        target.root,
        motion?.lift,
        STACKER_LIFT_FIELDS,
        "y",
        STACKER_LIFT_NODE_NAMES,
        STACKER_LIFT_FALLBACK_PATTERN,
        fixedNodeNames,
        [],
        useLegacyFallback
      ),
      fork: this.createRuntimeMotionGroup(
        "fork",
        target.root,
        motion?.fork,
        STACKER_FORK_FIELDS,
        "x",
        STACKER_FORK_NODE_NAMES,
        STACKER_FORK_FALLBACK_PATTERN,
        fixedNodeNames,
        [],
        useLegacyFallback
      ),
      forkSide: this.createRuntimeMotionGroup(
        "forkSide",
        target.root,
        motion?.forkSide,
        STACKER_FORK_SIDE_FIELDS,
        "z",
        STACKER_FORK_NODE_NAMES,
        STACKER_FORK_FALLBACK_PATTERN,
        fixedNodeNames,
        [],
        useLegacyFallback
      )
    };
  }

  /** 创建一个运行时运动组；模型脚本存在时不再自动套用旧 Stacker 兜底节点。 */
  private createRuntimeMotionGroup(
    key: string,
    root: TransformNode,
    group: ModelDataDrivenMotionGroupDefinition | undefined,
    fallbackFields: string[],
    fallbackAxis: ModelDataDrivenAxis,
    fallbackNodeNames: string[],
    fallbackPattern: RegExp,
    fixedNodeNames: string[],
    fallbackLimitNodeNames: string[],
    useLegacyFallback: boolean
  ): RuntimeMotionGroup {
    const targetMode = group?.target ?? "nodes";
    const nodes = targetMode === "root" ? [] : this.findMotionGroupNodes(root, group, fallbackNodeNames, fallbackPattern, fixedNodeNames, useLegacyFallback);
    return {
      key,
      kind: group?.kind ?? "translate",
      fields: group?.fields?.length ? group.fields : useLegacyFallback ? fallbackFields : [],
      axis: group?.axis ?? fallbackAxis,
      nodes,
      valueMode: group?.valueMode ?? "target",
      actionMap: this.createRuntimeActionMap(group),
      target: targetMode,
      speed: group?.speed,
      limits: this.createRuntimeMotionLimit(root, nodes, group?.axis ?? fallbackAxis, group, targetMode === "nodes" ? fallbackLimitNodeNames : [])
    };
  }

  /** 创建 action 模式的协议枚举表，模型脚本可覆盖默认 0/1/2 方向。 */
  private createRuntimeActionMap(group: ModelDataDrivenMotionGroupDefinition | undefined): Map<string, number> {
    const map = new Map<string, number>(DEFAULT_ACTION_MAP_ENTRIES);
    Object.entries(group?.actionMap ?? {}).forEach(([key, value]) => {
      if (Number.isFinite(value)) {
        map.set(key, value);
      }
    });
    return map;
  }

  /** 创建运动组行程限制，显式 min/max 优先，缺省端点由防撞或固定节点包围盒推导。 */
  private createRuntimeMotionLimit(
    root: TransformNode,
    movingNodes: TransformNode[],
    axis: ModelDataDrivenAxis,
    group: ModelDataDrivenMotionGroupDefinition | undefined,
    fallbackLimitNodeNames: string[]
  ): RuntimeMotionLimit | undefined {
    const config = group?.limits;
    const blockerNodes = this.findMotionLimitBlockerNodes(root, config, fallbackLimitNodeNames);
    const clearance = this.readOptionalNonNegativeNumber(config?.clearance, 0);
    let min = typeof config?.min === "number" && Number.isFinite(config.min) ? config.min : undefined;
    let max = typeof config?.max === "number" && Number.isFinite(config.max) ? config.max : undefined;
    if ((min === undefined || max === undefined) && blockerNodes.length > 0 && movingNodes.length > 0) {
      const worldAxis = this.modelLocalAxisToWorldDirection(root, axis);
      const movingBounds = this.projectNodesBoundsOnAxis(movingNodes, worldAxis);
      const blockerBounds = this.projectMotionLimitInnerBounds(blockerNodes, worldAxis);
      if (movingBounds && blockerBounds) {
        min = min ?? blockerBounds.min + clearance - movingBounds.min;
        max = max ?? blockerBounds.max - clearance - movingBounds.max;
      }
    }

    if (min === undefined && max === undefined) {
      return undefined;
    }
    if (min !== undefined && max !== undefined && min > max) {
      return undefined;
    }

    return { min, max, blockerNodes, clearance };
  }

  /** 查找用于推导行程边界的防撞节点，模型包声明优先，旧 Stacker 使用固定轨道兜底。 */
  private findMotionLimitBlockerNodes(
    root: TransformNode,
    config: ModelDataDrivenMotionGroupDefinition["limits"] | undefined,
    fallbackLimitNodeNames: string[]
  ): TransformNode[] {
    const nodes = this.getTransformSubtree(root).filter((node) => node !== root);
    const configuredNames = config?.blockerNodes?.length ? config.blockerNodes : fallbackLimitNodeNames;
    if (configuredNames.length > 0) {
      const exactNameSet = new Set(configuredNames);
      const exactMatches = nodes.filter((node) => exactNameSet.has(String(node.name ?? "")));
      if (exactMatches.length >= 2) {
        return this.dedupeTransformNodes(exactMatches);
      }
    }

    if (config?.blockerFallbackPattern) {
      return this.dedupeTransformNodes(
        nodes.filter((node) => this.matchesConfiguredFallbackPattern(String(node.name ?? ""), config.blockerFallbackPattern))
      );
    }

    return [];
  }

  /** 从两端防撞物体推导可行走内侧边界，避免把挡块厚度也算进可通行区域。 */
  private projectMotionLimitInnerBounds(nodes: TransformNode[], worldAxis: Vector3): ProjectedBounds | null {
    const bounds = nodes
      .map((node) => this.projectNodesBoundsOnAxis([node], worldAxis))
      .filter((item): item is ProjectedBounds => Boolean(item))
      .sort((a, b) => (a.min + a.max) / 2 - (b.min + b.max) / 2);
    if (bounds.length < 2) {
      return null;
    }

    const lowerBlocker = bounds[0];
    const upperBlocker = bounds[bounds.length - 1];
    const min = lowerBlocker.max;
    const max = upperBlocker.min;
    return min <= max ? { min, max } : null;
  }

  /** 把节点几何包围盒投影到指定世界轴，TransformNode 会读取其子 Mesh 包围盒。 */
  private projectNodesBoundsOnAxis(nodes: TransformNode[], worldAxis: Vector3): ProjectedBounds | null {
    if (worldAxis.lengthSquared() <= 1e-12) {
      return null;
    }

    const meshes = this.getMotionLimitMeshes(nodes);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    meshes.forEach((mesh) => {
      mesh.computeWorldMatrix(true);
      mesh.getBoundingInfo().boundingBox.vectorsWorld.forEach((point) => {
        const projection = Vector3.Dot(point, worldAxis);
        min = Math.min(min, projection);
        max = Math.max(max, projection);
      });
    });
    return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
  }

  /** 收集用于行程限制的真实几何 Mesh，过滤没有顶点的空节点。 */
  private getMotionLimitMeshes(nodes: TransformNode[]): AbstractMesh[] {
    const meshes = nodes.flatMap((node) => (node instanceof AbstractMesh ? [node, ...node.getChildMeshes(false)] : node.getChildMeshes(false)));
    return this.dedupeAbstractMeshes(meshes).filter((mesh) => !mesh.isDisposed() && mesh.isEnabled() && mesh.getTotalVertices() > 0);
  }

  /** 查找运动组节点，配置节点精确匹配优先，配置 fallbackPattern 只做安全的子串匹配。 */
  private findMotionGroupNodes(
    root: TransformNode,
    group: ModelDataDrivenMotionGroupDefinition | undefined,
    fallbackNodeNames: string[],
    fallbackPattern: RegExp,
    fixedNodeNames: string[],
    useLegacyFallback: boolean
  ): TransformNode[] {
    const exactNames = group?.nodes?.length ? group.nodes : useLegacyFallback ? fallbackNodeNames : [];
    if (exactNames.length === 0) {
      return [];
    }

    const nodes = this.getTransformSubtree(root).filter((node) => node !== root);
    const fixedNameSet = new Set(fixedNodeNames);
    const exactNameSet = new Set(exactNames);
    const exactMatches = nodes.filter((node) => exactNameSet.has(String(node.name ?? "")));
    const generatedExactMatches =
      exactMatches.length > 0 ? nodes.filter((node) => this.isGeneratedMotionCloneFromExactNode(node, exactNameSet)) : [];
    const matches =
      exactMatches.length > 0
        ? [...exactMatches, ...generatedExactMatches]
        : group
          ? nodes.filter((node) => this.matchesConfiguredFallbackPattern(String(node.name ?? ""), group.fallbackPattern))
          : nodes.filter((node) => fallbackPattern.test(String(node.name ?? "")));
    return this.dedupeTransformNodes(matches).filter((node) => !fixedNameSet.has(String(node.name ?? "")));
  }

  /** 参数化运行态克隆保留源节点名，动画组需要把同源克隆一并纳入驱动。 */
  private isGeneratedMotionCloneFromExactNode(node: TransformNode, exactNameSet: Set<string>): boolean {
    const metadata = this.isRecord(node.metadata) ? node.metadata : {};
    if (metadata.generatedByMeshVertexModifyRuntime !== true || metadata.reason !== "rollerDensity") {
      return false;
    }

    const sourceNodeName = typeof metadata.sourceNodeName === "string" ? metadata.sourceNodeName : "";
    return exactNameSet.has(sourceNodeName);
  }

  /** 配置 fallbackPattern 不执行正则，只按 | 分隔的安全关键字做包含匹配。 */
  private matchesConfiguredFallbackPattern(nodeName: string, patternText: string | undefined): boolean {
    if (!patternText || patternText.length > MAX_CONFIGURED_FALLBACK_PATTERN_LENGTH) {
      return false;
    }

    const normalizedName = nodeName.toLowerCase();
    return patternText
      .split("|")
      .map((token) => token.replace(/\\d\*/g, "").replace(/[\\^$.*+?()[\]{}]/g, "").trim().toLowerCase())
      .filter((token) => token.length >= 2)
      .some((token) => normalizedName.includes(token));
  }

  /** 汇总所有参与内部运动的节点并去重。 */
  private getMotionNodes(groups: RuntimeMotionGroup[]): TransformNode[] {
    return this.dedupeTransformNodes(groups.filter((group) => group.target === "nodes").flatMap((group) => group.nodes));
  }

  /** 判断目标是否按模型内部部件驱动，避免普通模型包含 fork/platform 名称时误套 Stacker 逻辑。 */
  private isStackerTarget(target: SceneDataDrivenTarget, groups: LegacyStackerMotionGroups): boolean {
    if (
      target.dataDriven?.device?.devType === "stacker" ||
      target.dataDriven?.device?.defaultAssetCode === STACKER_DEMO_DEVICE_ID
    ) {
      return true;
    }

    if (groups.travel.nodes.some((node) => STACKER_TRAVEL_NODE_NAMES.includes(String(node.name ?? "")))) {
      return true;
    }

    return [
      target.matchFields.assetCode,
      target.matchFields.modelKey,
      target.matchFields.deviceId,
      target.matchFields.name,
      target.matchFields.sourceFile,
      target.matchFields.sourceFileStem
    ].some((value) => value && this.normalizeMatchValue(value).includes(STACKER_DEMO_DEVICE_ID));
  }

  /** 收集模型根节点和子树内的 TransformNode。 */
  private getTransformSubtree(root: TransformNode): TransformNode[] {
    const scene = root.getScene?.() ?? this.options.scene;
    const nodes = new Map<number, TransformNode>();
    [root, ...scene.transformNodes, ...scene.meshes].forEach((node) => {
      if (node instanceof TransformNode && (node === root || node.isDescendantOf?.(root))) {
        nodes.set(node.uniqueId, node);
      }
    });
    return [...nodes.values()];
  }

  /** 将世界米制位移换算成节点父级局部坐标，兼容毫米模型内部 0.001 缩放。 */
  private worldDeltaToParentLocalDelta(node: TransformNode, worldDelta: Vector3): Vector3 {
    if (worldDelta.lengthSquared() <= 0) {
      return Vector3.Zero();
    }

    const parent = node.parent;
    if (!(parent instanceof TransformNode)) {
      return worldDelta.clone();
    }

    parent.computeWorldMatrix(true);
    const inverseParentWorldMatrix = Matrix.Invert(parent.getWorldMatrix());
    return Vector3.TransformNormal(worldDelta, inverseParentWorldMatrix);
  }

  /** 按 uniqueId 去重 TransformNode，保证同一节点只应用一次最终合成位置。 */
  private dedupeTransformNodes(nodes: TransformNode[]): TransformNode[] {
    return [...new Map(nodes.map((node) => [node.uniqueId, node])).values()];
  }

  /** 按 uniqueId 去重 Mesh，避免父节点和子节点同时命中时重复计算包围盒。 */
  private dedupeAbstractMeshes(meshes: AbstractMesh[]): AbstractMesh[] {
    return [...new Map(meshes.map((mesh) => [mesh.uniqueId, mesh])).values()];
  }

  /** 去重并过滤空字符串，减少每帧匹配时的无效路径读取。 */
  private dedupeStrings(values: Array<string | undefined>): string[] {
    return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  }

  /** 判断节点是否在某个祖先节点集合之下。 */
  private hasAncestorInSet(node: TransformNode, ancestors: TransformNode[]): boolean {
    return ancestors.some((ancestor) => node !== ancestor && node.isDescendantOf?.(ancestor));
  }

  /** 三次缓出插值，让遥测低频刷新时运动更平滑。 */
  private easeOutCubic(value: number): number {
    return 1 - Math.pow(1 - value, 3);
  }

  /** 线性插值两个数值。 */
  private lerp(from: number, to: number, progress: number): number {
    return from + (to - from) * progress;
  }

  /** 判断未知值是否是普通对象。 */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  /** 归一化设备匹配值，兼容大小写和首尾空白差异。 */
  private normalizeMatchValue(value: string): string {
    return value.trim().toLowerCase();
  }
}

/** 本地 Stacker 模拟连接，只在预览内生成数据帧，不依赖网络和场景文件字段。 */
class StackerDemoSimulationConnection implements DataConnection {
  private timer = 0;
  private startedAt = 0;

  /** 创建模拟连接，生成的 JSON 文本复用真实数据源处理链路。 */
  public constructor(
    private readonly config: SceneDataDrivenSnapshot,
    private readonly onMessage: (text: string) => void,
    private readonly getSettings: () => StackerSimulationSettings
  ) {}

  /** 启动模拟循环，并立即发送首帧让模型马上开始运动。 */
  public start(): void {
    const settings = this.getSettings();
    this.startedAt = performance.now();
    this.emitFrame();
    this.timer = window.setInterval(() => this.emitFrame(), settings.intervalMs);
  }

  /** 停止模拟循环，退出预览时由运行时统一恢复姿态。 */
  public stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  /** 生成一帧 Stacker 动作数据，并在伸叉端点附带货箱取放事件。 */
  private emitFrame(): void {
    const settings = this.getSettings();
    const elapsedSeconds = (performance.now() - this.startedAt) / 1000;
    const travelPhase = elapsedSeconds * 0.55;
    const liftPhase = elapsedSeconds * 1.05;
    const cargoPhase = Math.sin(liftPhase + Math.PI / 3);
    const forkAction = this.createMovementAction(cargoPhase);
    const deviceIdField = this.config.deviceIdField.trim() || "deviceId";
    const ts = Date.now();
    const frame: Array<Record<string, unknown>> = [
      { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "movement_x", v: this.createMovementAction(Math.sin(travelPhase)), ts },
      { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "movement_y", v: this.createMovementAction(Math.sin(liftPhase)), ts },
      { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "front_movement_z", v: forkAction, ts },
      { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "back_movement_z", v: forkAction, ts }
    ];
    const cargoAction = cargoPhase > 0.92 ? "pickup" : cargoPhase < -0.92 ? "drop" : "";
    if (cargoAction) {
      frame.push(
        { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "cargo_action", v: cargoAction, ts },
        { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "cargo", v: STACKER_DEMO_CARGO_ID, ts }
      );
    }
    this.onMessage(JSON.stringify(frame));
  }

  /** 把周期函数转换为协议动作枚举：1 正向，2 反向，0 静止。 */
  private createMovementAction(value: number): number {
    if (value > 0.2) {
      return 1;
    }
    if (value < -0.2) {
      return 2;
    }
    return 0;
  }
}
