import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type {
  ModelDataDrivenAxis,
  ModelDataDrivenDefinition,
  ModelDataDrivenMotionGroupDefinition,
  ModelDataDrivenMotionKind,
  ModelDataDrivenSimulationDefinition,
  SceneDataDrivenSnapshot
} from "../types/editor";

const MAX_DATA_MESSAGE_BYTES = 1024 * 1024;
const MAX_FRAMES_PER_MESSAGE = 200;
const MQTT_KEEP_ALIVE_SECONDS = 30;
const MQTT_PROTOCOL_LEVEL = 4;
const MQTT_CLEAN_SESSION_FLAG = 0x02;
const MQTT_QOS0 = 0;
const DEFAULT_RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 8000;
const STACKER_DEMO_INTERVAL_MS = 250;
const STACKER_DEMO_DEVICE_ID = "Stacker01";
const STACKER_TRAVEL_FIELDS = ["travel_pos", "trackZ", "travelZ", "travel", "position.z", "pos.z", "location.z", "z"];
const STACKER_LIFT_FIELDS = ["lift_pos", "liftY", "lift", "platformY", "platform.y", "elevation"];
const STACKER_FORK_FIELDS = ["fork_extend", "forkExtend", "forkX", "fork.x", "fork.extend"];
const STACKER_FORK_SIDE_FIELDS = ["fork_side", "forkZ", "fork.z"];
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

type StackerMotionGroupKey = "travel" | "lift" | "fork" | "forkSide";

/** 运行时归一化后的运动组，节点来源可来自模型脚本或 Stacker 兜底配置。 */
interface RuntimeMotionGroup {
  key: string;
  kind: ModelDataDrivenMotionKind;
  fields: string[];
  axis: ModelDataDrivenAxis;
  nodes: TransformNode[];
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

const DEFAULT_STACKER_SIMULATION_SETTINGS: StackerSimulationSettings = {
  deviceId: STACKER_DEMO_DEVICE_ID,
  intervalMs: STACKER_DEMO_INTERVAL_MS,
  travelRange: 2.8,
  liftBase: 0.35,
  liftRange: 2.1,
  forkRange: 0.75,
  forkSideRange: 0.18
};

/** 可被场景数据驱动运行时匹配和驱动的模型根节点。 */
export interface SceneDataDrivenTarget {
  root: TransformNode;
  matchFields: Record<string, string>;
  dataDriven?: ModelDataDrivenDefinition;
}

/** 场景数据驱动运行时的宿主能力，由 Babylon 引擎提供。 */
interface SceneDataDrivenRuntimeOptions {
  scene: Scene;
  getConfig: () => SceneDataDrivenSnapshot;
  getTargets: () => SceneDataDrivenTarget[];
  onTargetsChanged: (roots: TransformNode[], now: number) => void;
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
  motionValues: Map<string, number>;
  motionStartedAt: number;
  motionDurationMs: number;
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
  private simulationConfig: SceneDataDrivenSnapshot | null = null;
  private connectionGeneration = 0;
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
      deviceId: target?.dataDriven?.device?.defaultAssetCode?.trim() || DEFAULT_STACKER_SIMULATION_SETTINGS.deviceId,
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
    this.targetStates.clear();
    this.running = false;
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

    const changedRoots: TransformNode[] = [];
    this.targetStates.forEach((state) => {
      if (this.applyInterpolatedState(state, now)) {
        changedRoots.push(state.target.root);
      }
    });
    return changedRoots;
  }

  /** 将连接收到的原始消息解析为业务帧并写入目标运动状态。 */
  private handleMessage(text: string, generation: number): void {
    if (!this.running || generation !== this.connectionGeneration) {
      return;
    }

    if (text.length > MAX_DATA_MESSAGE_BYTES) {
      console.warn("数据驱动消息超过大小上限，已忽略。");
      return;
    }

    const payload = this.parsePayload(text);
    if (payload === undefined) {
      return;
    }

    const config = this.simulationConfig ?? this.options.getConfig();
    const frames = this.extractPayloadFrames(payload, config);
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
    if (config.dataSourceType === "websocket") {
      return new JsonWebSocketConnection(config, (text) => this.handleMessage(text, generation));
    }

    if (config.dataSourceType === "mqtt") {
      return new MqttWebSocketConnection(config, (text) => this.handleMessage(text, generation));
    }

    return null;
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

    const legacyStackerGroups = this.createStackerMotionGroups(target);
    const isStacker = this.isStackerTarget(target, legacyStackerGroups);
    const motionGroups = this.createMotionGroups(target, isStacker, legacyStackerGroups);
    const motionNodes = this.getMotionNodes(motionGroups);
    const motionBasePositions = this.captureNodePositions(motionNodes);
    const motionBaseRotations = this.captureNodeRotations(motionNodes);
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
      motionValues: this.createInitialMotionValues(motionGroups),
      motionStartedAt: now,
      motionDurationMs: 0
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

    const state = this.ensureTargetState(target, now);
    const configuredDuration = state.target.dataDriven?.device?.interpolationMs;
    const duration = Math.max(0, Number(configuredDuration ?? config.interpolationMs) || 0);
    state.motionStartedAt = now;
    state.motionDurationMs = duration;
    state.rootStartPosition = state.target.root.position.clone();
    state.rootTargetPosition = this.createRootTargetPosition(state, frame);
    if (state.rootBaseRotationY !== undefined && !state.target.root.rotationQuaternion) {
      state.rootStartRotationY = state.target.root.rotation.y;
      state.rootTargetRotationY = this.createRootTargetRotationY(state, frame);
    }
    const nextMotionValues = this.readMotionGroupValues(frame, state.motionGroups);
    if (nextMotionValues.size > 0) {
      this.updateMotionValues(state.motionValues, nextMotionValues);
      state.motionStartPositions = this.captureNodePositions(state.motionNodes);
      state.motionTargetPositions = this.createMotionTargetPositions(state);
      state.motionStartRotations = this.captureNodeRotations(state.motionNodes);
      state.motionTargetRotations = this.createMotionTargetRotations(state);
    }

    if (duration === 0) {
      this.applyInterpolatedState(state, now + 1);
    }
  }

  /** 根据数据帧创建整机根节点目标位置，文档坐标的 X/Y/H 对应 Babylon 的 X/Z/Y。 */
  private createRootTargetPosition(state: DataDrivenTargetState, frame: DataFrame): Vector3 {
    const position = state.target.root.position.clone();
    const x = this.readNumber(frame, ["x", "position.x", "pos.x", "location.x", "root.x"]);
    const yFields = state.usesDocumentCoordinateMapping
      ? ["h", "height", "position.z", "pos.z", "location.z", "root.z"]
      : ["y", "position.y", "pos.y", "location.y", "root.y"];
    const zFields = state.usesDocumentCoordinateMapping ? ["y"] : ["z", "h", "height", "position.z", "pos.z", "location.z", "root.z"];
    const y = this.readNumber(frame, yFields);
    const z = this.readNumber(frame, zFields);
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
    const rotationY = this.readNumber(frame, ["r", "yaw", "rotationY", "rotation.y", "heading"]);
    if (rotationY === undefined) {
      return state.rootTargetRotationY;
    }

    return (rotationY * Math.PI) / 180;
  }

  /** 根据所有 translate 运动组合成内部部件目标位置。 */
  private createMotionTargetPositions(state: DataDrivenTargetState): Map<number, Vector3> {
    return new Map(
      state.motionNodes.map((node) => {
        const base = state.motionBasePositions.get(node.uniqueId) ?? node.position;
        const position = base.clone();
        const worldDelta = Vector3.Zero();
        state.motionGroups
          .filter((group) => group.kind === "translate")
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
          .filter((group) => group.kind === "rotate")
          .forEach((group) => {
            rotation = this.addMotionGroupRotation(node, group, state.motionValues.get(group.key) ?? 0, rotation);
          });
        return [node.uniqueId, rotation];
      })
    );
  }

  /** 应用当前插值进度，返回节点是否发生变化。 */
  private applyInterpolatedState(state: DataDrivenTargetState, now: number): boolean {
    const progress =
      state.motionDurationMs <= 0 ? 1 : Math.min(1, Math.max(0, (now - state.motionStartedAt) / state.motionDurationMs));
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

    return !frameContainsDeviceId && targets.length === 1 ? targets[0] : null;
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
  private extractPayloadFrames(payload: unknown, config: SceneDataDrivenSnapshot): DataFrame[] {
    const scopedPayload = config.payloadPath.trim() ? this.readPath(payload, config.payloadPath.trim()) : payload;
    const normalizedPayload = this.normalizeDocumentJointPayload(scopedPayload);
    const frames: DataFrame[] = [];
    this.collectFrames(normalizedPayload, frames, this.getCommonFrameFieldNames(config));
    return frames;
  }

  /** 将 MQTT 文档的 {e,p,v} 关节点位格式归一化为运行时可直接读取的 {e,[p]:v} 帧。 */
  private normalizeDocumentJointPayload(value: unknown): unknown {
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
        const frameKey = deviceId ?? `__anonymous_${groupedFrames.size}`;
        const frame = groupedFrames.get(frameKey) ?? {};
        if (deviceId) {
          frame.e = deviceId;
        }
        if (record.ts !== undefined) {
          frame.ts = record.ts;
        }
        frame[pointName] = record.v;
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
    const deviceId = this.readJointDeviceId(value);
    if (deviceId) {
      frame.e = deviceId;
    }
    if (value.ts !== undefined) {
      frame.ts = value.ts;
    }
    return frame;
  }

  /** 判断对象是否符合文档 twindatadriven/joint 的单点位格式。 */
  private isDocumentJointRecord(value: unknown): value is Record<string, unknown> & { v: unknown } {
    if (!this.isRecord(value)) {
      return false;
    }
    return Boolean(this.readJointPointName(value) && value.v !== undefined);
  }

  /** 读取文档 joint 消息中的设备编号，支持字符串和数字编号。 */
  private readJointDeviceId(record: Record<string, unknown>): string | undefined {
    const value = record.e;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
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
  private collectFrames(value: unknown, output: DataFrame[], commonFieldNames: string[]): void {
    if (output.length >= MAX_FRAMES_PER_MESSAGE) {
      return;
    }

    const normalizedValue = this.normalizeDocumentJointPayload(value);
    if (normalizedValue !== value) {
      this.collectFrames(normalizedValue, output, commonFieldNames);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectFrames(item, output, commonFieldNames);
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
      output.push(value);
      return;
    }

    const nestedFrames: DataFrame[] = [];
    ["data", "payload", "message"].forEach((key) => this.collectFrames(value[key], nestedFrames, commonFieldNames));
    if (nestedFrames.length > 0) {
      const commonFields = this.pickCommonFrameFields(value, commonFieldNames);
      for (const frame of nestedFrames) {
        if (output.length >= MAX_FRAMES_PER_MESSAGE) {
          return;
        }
        output.push({ ...commonFields, ...frame });
      }
      return;
    }

    output.push(value);
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
    return this.dedupeStrings([
      config.deviceIdField,
      ...this.options.getTargets().map((target) => target.dataDriven?.device?.deviceIdField),
      "e",
      "devId",
      "deviceId",
      "deviceID",
      "id",
      "assetCode",
      "modelKey"
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

  /** 读取运动组绑定的 payload 数字值。 */
  private readMotionGroupValue(frame: DataFrame, group: RuntimeMotionGroup): number | undefined {
    return group.fields.length > 0 ? this.readNumber(frame, group.fields) : undefined;
  }

  /** 读取本帧命中的所有运动组数值。 */
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

  /** 创建运动组目标值缓存，未上报字段按 0 解释为基线姿态。 */
  private createInitialMotionValues(groups: RuntimeMotionGroup[]): Map<string, number> {
    return new Map(groups.map((group) => [group.key, 0]));
  }

  /** 更新运动组最近一次目标值，缺失字段沿用上一帧。 */
  private updateMotionValues(current: Map<string, number>, next: Map<string, number>): void {
    next.forEach((value, key) => current.set(key, value));
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
        .map(([key, group]) => this.createRuntimeMotionGroup(key, target.root, group, [], group.axis, [], /$a/, fixedNodeNames, false))
        .filter((group) => group.fields.length > 0 && group.nodes.length > 0);
    }

    return isStacker ? Object.values(legacyStackerGroups).filter((group) => group.fields.length > 0 && group.nodes.length > 0) : [];
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
    useLegacyFallback: boolean
  ): RuntimeMotionGroup {
    return {
      key,
      kind: group?.kind ?? "translate",
      fields: group?.fields?.length ? group.fields : useLegacyFallback ? fallbackFields : [],
      axis: group?.axis ?? fallbackAxis,
      nodes: this.findMotionGroupNodes(root, group, fallbackNodeNames, fallbackPattern, fixedNodeNames, useLegacyFallback)
    };
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
    const matches =
      exactMatches.length > 0
        ? exactMatches
        : group
          ? nodes.filter((node) => this.matchesConfiguredFallbackPattern(String(node.name ?? ""), group.fallbackPattern))
          : nodes.filter((node) => fallbackPattern.test(String(node.name ?? "")));
    return this.dedupeTransformNodes(matches).filter((node) => !fixedNameSet.has(String(node.name ?? "")));
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
    return this.dedupeTransformNodes(groups.flatMap((group) => group.nodes));
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

  /** 生成一帧 Stacker 往返运动数据。 */
  private emitFrame(): void {
    const settings = this.getSettings();
    const elapsedSeconds = (performance.now() - this.startedAt) / 1000;
    const travelPhase = elapsedSeconds * 0.55;
    const liftPhase = elapsedSeconds * 1.05;
    const deviceIdField = this.config.deviceIdField.trim() || "deviceId";
    const ts = Date.now();
    this.onMessage(
      JSON.stringify([
        { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "travel_pos", v: this.round(Math.sin(travelPhase) * settings.travelRange), ts },
        {
          e: settings.deviceId,
          [deviceIdField]: settings.deviceId,
          p: "lift_pos",
          v: this.round(settings.liftBase + ((Math.sin(liftPhase) + 1) / 2) * settings.liftRange),
          ts
        },
        {
          e: settings.deviceId,
          [deviceIdField]: settings.deviceId,
          p: "fork_extend",
          v: this.round(((Math.sin(liftPhase + Math.PI / 3) + 1) / 2) * settings.forkRange),
          ts
        },
        { e: settings.deviceId, [deviceIdField]: settings.deviceId, p: "fork_side", v: this.round(Math.sin(travelPhase * 1.35) * settings.forkSideRange), ts }
      ])
    );
  }

  /** 控制小数位，避免高频模拟数据产生过长字符串。 */
  private round(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}

/** 浏览器原生 WebSocket JSON 数据连接。 */
class JsonWebSocketConnection implements DataConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer = 0;
  private reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  private stopped = true;

  /** 创建 WebSocket 连接，收到文本或二进制文本后交给上层解析。 */
  public constructor(private readonly config: SceneDataDrivenSnapshot, private readonly onMessage: (text: string) => void) {}

  /** 建立 WebSocket 连接。 */
  public start(): void {
    this.stopped = false;
    this.connect();
  }

  /** 停止 WebSocket 并清理重连计时器。 */
  public stop(): void {
    this.stopped = true;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.socket?.close();
    this.socket = null;
  }

  /** 执行一次连接尝试。 */
  private connect(): void {
    try {
      this.socket = new WebSocket(this.config.dataEndpoint.trim());
      this.socket.binaryType = "arraybuffer";
      this.socket.onopen = () => this.handleOpen();
      this.socket.onmessage = (event) => void this.handleMessage(event.data);
      this.socket.onclose = () => this.scheduleReconnect();
      this.socket.onerror = () => {
        this.socket?.close();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.warn("WebSocket 数据驱动连接创建失败。", error);
      this.scheduleReconnect();
    }
  }

  /** 连接建立后按约定发送轻量订阅消息。 */
  private handleOpen(): void {
    this.reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
    if (this.config.dataChannel.trim() && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "subscribe", channel: this.config.dataChannel.trim() }));
    }
  }

  /** 统一处理 WebSocket 收到的文本或 ArrayBuffer。 */
  private async handleMessage(data: unknown): Promise<void> {
    if (typeof data === "string") {
      this.onMessage(data);
      return;
    }

    if (data instanceof ArrayBuffer) {
      if (data.byteLength > MAX_DATA_MESSAGE_BYTES) {
        console.warn("WebSocket 数据驱动二进制消息超过大小上限，已忽略。");
        return;
      }
      this.onMessage(new TextDecoder("utf-8").decode(data));
      return;
    }

    if (data instanceof Blob) {
      if (data.size > MAX_DATA_MESSAGE_BYTES) {
        console.warn("WebSocket 数据驱动 Blob 消息超过大小上限，已忽略。");
        return;
      }
      this.onMessage(await data.text());
    }
  }

  /** 在连接断开后按退避延迟重连。 */
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, this.reconnectDelayMs * 1.5);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0;
      this.connect();
    }, delay);
  }
}

/** MQTT 3.1.1 over WebSocket 的最小订阅客户端，只支持订阅 JSON payload。 */
class MqttWebSocketConnection implements DataConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer = 0;
  private reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  private pingTimer = 0;
  private packetId = 1;
  private stopped = true;
  private readonly decoder = new TextDecoder("utf-8");

  /** 创建 MQTT over WebSocket 连接。 */
  public constructor(private readonly config: SceneDataDrivenSnapshot, private readonly onMessage: (text: string) => void) {}

  /** 建立 MQTT WebSocket 连接。 */
  public start(): void {
    this.stopped = false;
    this.connect();
  }

  /** 发送断开包并释放 MQTT 连接资源。 */
  public stop(): void {
    this.stopped = true;
    window.clearTimeout(this.reconnectTimer);
    window.clearInterval(this.pingTimer);
    this.reconnectTimer = 0;
    this.pingTimer = 0;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(new Uint8Array([0xe0, 0x00]));
    }
    this.socket?.close();
    this.socket = null;
  }

  /** 执行一次 MQTT WebSocket 连接尝试。 */
  private connect(): void {
    try {
      const endpoint = normalizeMqttWebSocketEndpoint(this.config.dataEndpoint.trim());
      this.socket = new WebSocket(endpoint, ["mqtt"]);
      this.socket.binaryType = "arraybuffer";
      this.socket.onopen = () => this.sendConnectPacket();
      this.socket.onmessage = (event) => this.handlePacket(event.data);
      this.socket.onclose = () => this.scheduleReconnect();
      this.socket.onerror = () => {
        this.socket?.close();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.warn("MQTT 数据驱动连接创建失败。", error);
      this.scheduleReconnect();
    }
  }

  /** 发送 MQTT CONNECT 包。 */
  private sendConnectPacket(): void {
    const clientId = `babylon-editor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const variableHeader = concatBytes([
      encodeMqttString("MQTT"),
      new Uint8Array([MQTT_PROTOCOL_LEVEL, MQTT_CLEAN_SESSION_FLAG, 0x00, MQTT_KEEP_ALIVE_SECONDS])
    ]);
    const payload = encodeMqttString(clientId);
    this.sendMqttPacket(0x10, concatBytes([variableHeader, payload]));
  }

  /** 处理 MQTT 二进制包。 */
  private handlePacket(data: unknown): void {
    if (!(data instanceof ArrayBuffer)) {
      return;
    }

    const bytes = new Uint8Array(data);
    if (bytes.length < 2) {
      return;
    }

    const packetType = bytes[0] >> 4;
    const remaining = decodeRemainingLength(bytes, 1);
    if (!remaining) {
      return;
    }

    const offset = remaining.offset;
    if (packetType === 2) {
      this.handleConnAck(bytes, offset);
      return;
    }

    if (packetType === 3) {
      this.handlePublish(bytes, offset, remaining.length, bytes[0]);
    }
  }

  /** 处理 MQTT CONNACK，成功后订阅配置 topic。 */
  private handleConnAck(bytes: Uint8Array, offset: number): void {
    const returnCode = bytes[offset + 1];
    if (returnCode !== 0) {
      console.warn(`MQTT broker 拒绝连接，返回码 ${returnCode}。`);
      this.socket?.close();
      return;
    }

    this.reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
    this.sendSubscribePacket(this.config.dataChannel.trim());
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.sendMqttPacket(0xc0, new Uint8Array()), MQTT_KEEP_ALIVE_SECONDS * 500);
  }

  /** 发送 MQTT SUBSCRIBE 包，当前只使用 QoS 0。 */
  private sendSubscribePacket(topic: string): void {
    const packetId = this.nextPacketId();
    const payload = concatBytes([encodeMqttString(topic), new Uint8Array([MQTT_QOS0])]);
    const variableHeader = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
    this.sendMqttPacket(0x82, concatBytes([variableHeader, payload]));
  }

  /** 解析 MQTT PUBLISH 包并提取文本 payload。 */
  private handlePublish(bytes: Uint8Array, offset: number, remainingLength: number, fixedHeader: number): void {
    const qos = (fixedHeader >> 1) & 0x03;
    const topicLength = (bytes[offset] << 8) | bytes[offset + 1];
    let cursor = offset + 2 + topicLength;
    if (qos > 0) {
      const packetId = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      if (qos === 1) {
        this.sendMqttPacket(0x40, new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]));
      }
    }

    const payloadEnd = offset + remainingLength;
    if (cursor > payloadEnd) {
      return;
    }

    if (payloadEnd - cursor > MAX_DATA_MESSAGE_BYTES) {
      console.warn("MQTT 数据驱动 payload 超过大小上限，已忽略。");
      return;
    }

    this.onMessage(this.decoder.decode(bytes.slice(cursor, payloadEnd)));
  }

  /** 发送 MQTT 固定头和剩余内容。 */
  private sendMqttPacket(header: number, payload: Uint8Array): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(concatBytes([new Uint8Array([header]), encodeRemainingLength(payload.length), payload]));
  }

  /** 获取下一个 MQTT 包编号。 */
  private nextPacketId(): number {
    this.packetId = this.packetId >= 65535 ? 1 : this.packetId + 1;
    return this.packetId;
  }

  /** 在连接断开后按退避延迟重连。 */
  private scheduleReconnect(): void {
    window.clearInterval(this.pingTimer);
    this.pingTimer = 0;
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, this.reconnectDelayMs * 1.5);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0;
      this.connect();
    }, delay);
  }
}

/** 把 mqtt:// 便捷写法转换成浏览器 WebSocket URL。 */
function normalizeMqttWebSocketEndpoint(endpoint: string): string {
  if (endpoint.startsWith("mqtt://")) {
    return `ws://${endpoint.slice("mqtt://".length)}`;
  }

  if (endpoint.startsWith("mqtts://")) {
    return `wss://${endpoint.slice("mqtts://".length)}`;
  }

  return endpoint;
}

/** 编码 MQTT UTF-8 字符串，前两个字节保存长度。 */
function encodeMqttString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const result = new Uint8Array(encoded.length + 2);
  result[0] = (encoded.length >> 8) & 0xff;
  result[1] = encoded.length & 0xff;
  result.set(encoded, 2);
  return result;
}

/** 编码 MQTT Remaining Length 可变整数。 */
function encodeRemainingLength(length: number): Uint8Array {
  const encoded: number[] = [];
  let value = length;
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) {
      digit |= 0x80;
    }
    encoded.push(digit);
  } while (value > 0);
  return new Uint8Array(encoded);
}

/** 解码 MQTT Remaining Length 可变整数。 */
function decodeRemainingLength(bytes: Uint8Array, startOffset: number): { length: number; offset: number } | null {
  let multiplier = 1;
  let value = 0;
  let offset = startOffset;
  let digit = 0;
  let bytesRead = 0;
  do {
    if (offset >= bytes.length) {
      return null;
    }

    digit = bytes[offset];
    value += (digit & 0x7f) * multiplier;
    multiplier *= 128;
    offset += 1;
    bytesRead += 1;
    if (bytesRead > 4) {
      return null;
    }
  } while ((digit & 0x80) !== 0);
  return { length: value, offset };
}

/** 拼接多个 Uint8Array，避免在高频消息中创建嵌套数组结构。 */
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}
