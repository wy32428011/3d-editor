import type { Scene } from "@babylonjs/core/scene";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { Color3 } from "@babylonjs/core/Maths/math.color";
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
const STACKER_LEGACY_DEVICE_ID = "Stacker01";
const STACKER_DEMO_CARGO_ID = "Box01";
const STACKER_TRAVEL_FIELDS = ["travel_pos", "trackZ", "travelZ", "travel", "position.z", "pos.z", "location.z", "z"];
const STACKER_TRAVEL_LIMIT_FIELDS = new Set([...STACKER_TRAVEL_FIELDS, "movement_x"].map((field) => field.toLowerCase()));
const STACKER_DISTANCE_X_FIELD_COMPACT = "distancex";
const STACKER_DISTANCE_Y_FIELD_COMPACT = "distancey";
const STACKER_LIFT_FIELDS = ["lift_pos", "liftY", "lift", "platformY", "platform.y", "elevation"];
const STACKER_LIFT_LIMIT_FIELDS = new Set([...STACKER_LIFT_FIELDS, "movement_y"].map((field) => field.toLowerCase()));
const STACKER_FRONT_DISTANCE_Y_FIELD_COMPACT = "frontdistancey";
const STACKER_BACK_DISTANCE_Y_FIELD_COMPACT = "backdistancey";
const STACKER_FORK_FIELDS = ["fork_extend", "forkExtend", "forkX", "fork.x", "fork.extend"];
const STACKER_FORK_ACTION_FIELDS = ["front_movement_z", "back_movement_z", "forkState"];
const STACKER_FORK_DISTANCE_FIELD_COMPACTS = [
  "frontforkdistance",
  "backforkdistance",
  "frontforkdistancey",
  "backforkdistancey",
  "frontforkdistancez",
  "backforkdistancez",
  "frontdistancez",
  "backdistancez",
  "frontdistancex",
  "backdistancex",
  "frontforkextend",
  "backforkextend",
  "forkdistance",
  "forkextend"
];
const STACKER_FRONT_FORK_LOCATION_FIELD_COMPACT = "frontforklocation";
const STACKER_BACK_FORK_LOCATION_FIELD_COMPACT = "backforklocation";
const STACKER_FORK_SIDE_FIELDS = ["fork_side", "forkZ", "fork.z"];
const STACKER_PLC_DEVICE_CODE_FIELD = "device_code";
const CARGO_ACTION_FIELDS = ["cargo_action", "cargoAction", "cargo.action", "action"];
const CARGO_TARGET_FIELDS = ["cargo", "cargoId", "cargoCode", "payload", "box", "boxId", "boxCode", "targetCargo"];
const CARGO_DROP_TARGET_FIELDS = ["drop_target", "dropTarget", "target", "targetLocator", "locator", "locatorAssetCode", "slot"];
const STACKER_TRAVEL_TARGET_FIELDS = ["travel_target", "travelTarget", "move_target", "moveTarget", "targetDevice", "targetAsset"];
const STACKER_TARGET_ANCHOR_FIELDS = ["target_anchor", "targetAnchor", "travel_anchor", "travelAnchor", "anchor", "targetPort"];
const STACKER_FORK_TARGET_FIELDS = ["fork_target", "forkTarget", "forkTargetAsset", "fork_target_asset"];
const STACKER_FORK_ANCHOR_FIELDS = ["fork_anchor", "forkAnchor"];
const STACKER_HOME_TARGET_VALUES = ["home", "origin", "zero", "retract", "retracted", "缩回", "原位", "零位"];
const CHAIN_CONVEYOR_LENGTH_PARAMETER_FIELDS = ["chainLength", "chain_length", "length", "链条机长度"];
const CHAIN_CONVEYOR_FRONT_ENDPOINT_RATIO_FIELDS = [
  "chainFrontEndpointRatio",
  "frontEndpointRatio",
  "frontPositionRatio",
  "frontPortRatio",
  "前端位置比例"
];
const CHAIN_CONVEYOR_REAR_ENDPOINT_RATIO_FIELDS = [
  "chainRearEndpointRatio",
  "rearEndpointRatio",
  "rearPositionRatio",
  "rearPortRatio",
  "后端位置比例"
];
const TRANSPORT_CONTAINER_CODE_FIELDS = [
  "containerCode",
  "container_code",
  "container.code",
  "container_no",
  "containerNo",
  "container.no",
  "container_id",
  "containerId"
];
const TRANSPORT_TASK_CODE_FIELDS = ["task", "taskNo", "task_no", "taskId", "task_id"];
const TRANSPORT_FRONT_CARGO_FIELDS = [
  "front_has_cargo",
  "frontHasCargo",
  "frontCargo",
  "front_has_box",
  "frontHasBox",
  "hasFrontCargo",
  "front_photoelectric",
  "frontPhotoelectric",
  "前端有货"
];
const CARGO_PICKUP_VALUES = ["pickup", "pick", "attach", "load", "carry", "take", "取货", "吸附", "装载"];
const CARGO_DROP_VALUES = ["drop", "detach", "unload", "release", "put", "放货", "释放", "卸载"];
const DEFAULT_CARGO_PICKUP_MIN_FORK_EXTENSION = 0.45;
const DEFAULT_CARGO_PICKUP_MAX_DISTANCE = 2.5;
const DEFAULT_CARGO_ANCHOR_OFFSET = new Vector3(0, 0.32, 0);
// 辊筒模型只声明自转速度时，用该米/秒速度推进已绑定货箱。
const DEFAULT_CONVEYOR_CARGO_SPEED = 2;
const CHAIN_CONVEYOR_CHAIN_NODE_NAMES = ["Rail_01_M001", "Rail_02_M001"];
const CHAIN_CONVEYOR_CARGO_AXIS: ModelDataDrivenAxis = "z";
const CHAIN_CONVEYOR_CARGO_SPEED = 0.3;
const CHAIN_CONVEYOR_DIRECTION_ARROW_SPEED = 0.75;
const CHAIN_CONVEYOR_DIRECTION_ARROW_MIN_COUNT = 2;
const CHAIN_CONVEYOR_DIRECTION_ARROW_MAX_COUNT = 6;
const CHAIN_CONVEYOR_DIRECTION_ARROW_TRACK_SPACING = 1.05;
const CHAIN_CONVEYOR_DIRECTION_ARROW_TOP_OFFSET = 0.08;
const DEFAULT_RUNTIME_CARGO_BOX_SIZE = 1;
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
const STACKER_FORK_ACTION_MAP_ENTRIES: Array<[string, number]> = [["3", 1], ["4", -1]];
const DEFAULT_STACKER_FORK_ACTION_SPEED = 0.25;
const DEFAULT_STACKER_FORK_EXTENSION_LIMIT = 0.941;
const STACKER_FORK_LENGTH_PARAMETER_NAMES = ["forkLength", "fork_length", "货叉长度", "货叉总长度"];
const STACKER_FORK_FALLBACK_PATTERN_TEXT = "fork|叉|huocha|cha";

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
  /** 旋转类输送设备可单独声明货箱推进轴，避免把视觉旋转轴误当输送方向。 */
  cargoAxis?: ModelDataDrivenAxis;
  /** 旋转类输送设备可单独声明货箱米/秒速度，避免复用 deg/s 的视觉转速。 */
  cargoSpeed?: number;
  /** 仅消费动作字段和货箱输送语义，不把该组写回到模型节点变换。 */
  nodeTransformDisabled?: boolean;
  limits?: RuntimeMotionLimit;
  /** Stacker 货叉参数化后的最大伸出长度，作为左右双向行程的权威来源。 */
  stackerForkMaxExtension?: number;
}

/** 运行态运动行程限制，显式数值和防撞物体推导结果会合并成最终 min/max。 */
interface RuntimeMotionLimit {
  min?: number;
  max?: number;
  blockerNodes: TransformNode[];
  clearance: number;
}

/** Stacker 根节点位姿保护，使用进入预览时的轨道方向和行程范围限制 twinspawn 目标。 */
interface StackerTrackConstraint {
  horizontalAxis: Vector3;
  horizontalNormal: Vector3;
  baseAxisProjection: number;
  baseNormalProjection: number;
  minDelta?: number;
  maxDelta?: number;
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

/** 链条机端点参数使用的模型根节点本地基线。 */
interface ChainConveyorEndpointBaseline {
  minimum: Vector3;
  maximum: Vector3;
  size: Vector3;
}

/** 旧 Stacker 兜底规则生成的四类运动组。 */
type LegacyStackerMotionGroups = Record<StackerMotionGroupKey, RuntimeMotionGroup>;

/** 子部件旋转快照，保留原始欧拉角或四元数模式。 */
interface MotionRotationSnapshot {
  euler: Vector3;
  quaternion?: Quaternion;
}

/** 节点自转 pivot 快照，退出预览时恢复，避免运行态修改写回场景。 */
interface MotionPivotSnapshot {
  matrix: Matrix;
  postMultiply: boolean;
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
  /** 链条机按前后端点线段推进货箱，这里保存货箱中心在线段上的 0..1 进度。 */
  chainPathProgress?: number;
}

/** 货箱沿输送方向投影后的可用范围。 */
interface CargoTransportAxisRange {
  minimum: number;
  maximum: number;
}

/** 链条机货箱轨迹线段，front -> rear 对应 movement_x=1 的业务方向。 */
interface ChainConveyorCargoPath {
  front: Vector3;
  rear: Vector3;
  direction: Vector3;
  length: number;
}

/** 链条机输送方向箭头使用的模型本地轨迹。 */
interface ChainConveyorDirectionArrowTrack {
  centerX: number;
  topY: number;
  frontZ: number;
  rearZ: number;
  length: number;
}

/** 预览态链条机输送方向箭头，不写入场景文件。 */
interface ChainConveyorDirectionArrowVisual {
  root: TransformNode;
  arrowNodes: TransformNode[];
  materials: StandardMaterial[];
  arrowCount: number;
  arrowLength: number;
}

const DEFAULT_STACKER_SIMULATION_SETTINGS: StackerSimulationSettings = {
  deviceId: STACKER_DEMO_DEVICE_ID,
  intervalMs: STACKER_DEMO_INTERVAL_MS,
  travelRange: 2.8,
  liftBase: 0.35,
  liftRange: 2.1,
  forkRange: DEFAULT_STACKER_FORK_EXTENSION_LIMIT,
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

/** 运行态临时货箱创建请求，由宿主引擎负责真正实例化 Babylon 节点。 */
export interface RuntimeCargoBoxRequest {
  cargoCode: string;
  carrierRoot: TransformNode;
  position: Vector3;
  size: number;
}

/** 场景数据驱动运行时的宿主能力，由 Babylon 引擎提供。 */
interface SceneDataDrivenRuntimeOptions {
  scene: Scene;
  getConfig: () => SceneDataDrivenSnapshot;
  getTargets: () => SceneDataDrivenTarget[];
  getDropTargets: () => SceneDataDrivenDropTarget[];
  createRuntimeCargoBox?: (request: RuntimeCargoBoxRequest) => TransformNode | null;
  disposeRuntimeNode?: (node: TransformNode) => void;
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
  motionBasePivots: Map<number, MotionPivotSnapshot>;
  motionStartValues: Map<string, number>;
  motionValues: Map<string, number>;
  motionActionDirections: Map<string, number>;
  stackerTrackConstraint: StackerTrackConstraint | null;
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
  private readonly runtimeGeneratedCargoByCode = new Map<string, TransformNode>();
  private readonly transportFrontCargoPresence = new Map<number, boolean>();
  private readonly chainConveyorDirectionArrowVisuals = new Map<number, ChainConveyorDirectionArrowVisual>();
  private simulationConfig: SceneDataDrivenSnapshot | null = null;
  private connectionGeneration = 0;
  private lastMessageAt = 0;
  private staleStatusEmitted = false;
  private running = false;
  private runtimeCargoSequence = 0;

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
    this.disposeChainConveyorDirectionArrowVisuals();
    this.disposeRuntimeGeneratedCargoBoxes();
    this.cargoAttachments.clear();
    this.cargoTransports.clear();
    this.transportFrontCargoPresence.clear();
    this.targetStates.clear();
    this.running = false;
    this.lastMessageAt = 0;
    this.staleStatusEmitted = false;
    this.emitConnectionStatus({ state: "idle", label: "数据驱动已停止" });
  }

  /** 释放预览态自动生成的货箱，确保临时 cube 不残留到编辑态和保存文件。 */
  private disposeRuntimeGeneratedCargoBoxes(): void {
    this.runtimeGeneratedCargoByCode.forEach((node) => {
      if (node.isDisposed()) {
        return;
      }

      if (this.options.disposeRuntimeNode) {
        this.options.disposeRuntimeNode(node);
      } else {
        node.dispose(false, true);
      }
    });
    this.runtimeGeneratedCargoByCode.clear();
  }

  /** 释放预览态链条机方向箭头，避免临时光效节点和材质残留。 */
  private disposeChainConveyorDirectionArrowVisuals(): void {
    this.chainConveyorDirectionArrowVisuals.forEach((visual) => this.disposeChainConveyorDirectionArrowVisual(visual));
    this.chainConveyorDirectionArrowVisuals.clear();
  }

  /** 释放单个链条机方向箭头可视化实例。 */
  private disposeChainConveyorDirectionArrowVisual(visual: ChainConveyorDirectionArrowVisual): void {
    if (!visual.root.isDisposed()) {
      visual.root.dispose(false, true);
    }
    visual.materials.forEach((material) => material.dispose(false, true));
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
      const directionArrowChanged = this.updateChainConveyorDirectionArrowsForState(state, now, actionFramesAreStale);
      if (interpolatedChanged || actionChanged) {
        changedRoots.push(state.target.root);
      }
      if (directionArrowChanged) {
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
    const baseMotionGroups = legacyStackerGroups ? this.createMotionGroups(target, isStacker, legacyStackerGroups) : [];
    const motionGroups = this.createChainConveyorMotionGroups(target, baseMotionGroups);
    const motionNodes = this.getMotionNodes(motionGroups);
    const motionBasePivots = this.captureNodePivots(motionNodes);
    this.applyRollerConveyorMotionPivots(target, motionGroups);
    const motionBasePositions = this.captureNodePositions(motionNodes);
    const motionBaseRotations = this.captureNodeRotations(motionNodes);
    const initialMotionValues = this.createInitialMotionValues(motionGroups);
    const rotationY = target.root.rotationQuaternion ? undefined : target.root.rotation.y;
    const stackerTrackConstraint = isStacker ? this.createStackerTrackConstraint(target.root, motionGroups) : null;
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
      motionBasePivots,
      motionStartValues: new Map(initialMotionValues),
      motionValues: initialMotionValues,
      motionActionDirections: this.createInitialMotionActionDirections(motionGroups),
      stackerTrackConstraint,
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

  /** 捕获节点 pivot，辊筒自转会临时把 pivot 改到几何中心。 */
  private captureNodePivots(nodes: TransformNode[]): Map<number, MotionPivotSnapshot> {
    return new Map(
      nodes.map((node) => [
        node.uniqueId,
        {
          matrix: node.getPivotMatrix().clone(),
          postMultiply: node.isUsingPostMultiplyPivotMatrix()
        }
      ])
    );
  }

  /** 恢复节点原始 pivot，避免预览态的自转中心配置污染编辑态或保存结果。 */
  private restoreNodePivots(nodes: TransformNode[], pivots: Map<number, MotionPivotSnapshot>): void {
    nodes.forEach((node) => {
      const pivot = pivots.get(node.uniqueId);
      if (pivot) {
        node.setPivotMatrix(pivot.matrix, pivot.postMultiply);
      }
    });
  }

  /** opaque 辊道机的 GT 网格顶点使用绝对坐标，进入预览时把自转 pivot 放回每根辊筒几何中心。 */
  private applyRollerConveyorMotionPivots(target: SceneDataDrivenTarget, motionGroups: RuntimeMotionGroup[]): void {
    if (!this.isBoundedRollerConveyorTarget(target)) {
      return;
    }

    const rollerNodes = this.dedupeTransformNodes(
      motionGroups
        .filter((group) => group.kind === "rotate" && group.target === "nodes")
        .flatMap((group) => group.nodes)
        .filter((node) => this.isRollerConveyorMotionNode(node))
    );
    rollerNodes.forEach((node) => this.setNodePivotToGeometryCenter(node));
  }

  /** 链条机 Rail 是静态装配件，movement_x 只作为货箱输送动作，不再驱动 Rail 整体位移或旋转。 */
  private createChainConveyorMotionGroups(target: SceneDataDrivenTarget, motionGroups: RuntimeMotionGroup[]): RuntimeMotionGroup[] {
    if (!this.isChainConveyorTarget(target)) {
      return motionGroups;
    }

    const groups: RuntimeMotionGroup[] = motionGroups.map((group): RuntimeMotionGroup => {
      if (!this.isChainConveyorRailMotionGroup(group)) {
        return group;
      }

      return this.createChainConveyorCargoOnlyMotionGroup(group);
    });

    if (!groups.some((group) => this.motionGroupUsesField(group, "movement_x"))) {
      const fallbackGroup = this.createDefaultChainConveyorMotionGroup();
      groups.push(fallbackGroup);
    }
    return groups;
  }

  /** 旧链条机模型包缺少 dataDriven.motion 时，补一个只推进货箱的 movement_x 动作组。 */
  private createDefaultChainConveyorMotionGroup(): RuntimeMotionGroup {
    return {
      key: "chainConveyor",
      kind: "translate",
      fields: ["movement_x"],
      axis: CHAIN_CONVEYOR_CARGO_AXIS,
      nodes: [],
      valueMode: "action",
      actionMap: new Map(DEFAULT_ACTION_MAP_ENTRIES),
      target: "nodes",
      cargoAxis: CHAIN_CONVEYOR_CARGO_AXIS,
      cargoSpeed: CHAIN_CONVEYOR_CARGO_SPEED,
      nodeTransformDisabled: true,
      limits: undefined
    };
  }

  /** 把链条机 Rail 声明转换成货箱输送专用组，保留 movement_x action 语义。 */
  private createChainConveyorCargoOnlyMotionGroup(group: RuntimeMotionGroup): RuntimeMotionGroup {
    return {
      ...group,
      valueMode: "action",
      speed: undefined,
      cargoAxis: group.cargoAxis ?? CHAIN_CONVEYOR_CARGO_AXIS,
      cargoSpeed: group.cargoSpeed ?? CHAIN_CONVEYOR_CARGO_SPEED,
      nodeTransformDisabled: true,
      limits: undefined
    };
  }

  /** 判断运行时运动组是否会驱动链条机 Rail，避免影响其它输送设备。 */
  private isChainConveyorRailMotionGroup(group: RuntimeMotionGroup): boolean {
    return (
      group.target === "nodes" &&
      this.motionGroupUsesField(group, "movement_x") &&
      group.nodes.some((node) => this.isChainConveyorChainNode(node))
    );
  }

  /** 判断节点是否是链条机静态导轨/链条装配件。 */
  private isChainConveyorChainNode(node: TransformNode): boolean {
    const nodeName = String(node.name ?? "");
    const metadata = this.isRecord(node.metadata) ? node.metadata : {};
    const sourceNodeName = typeof metadata.sourceNodeName === "string" ? metadata.sourceNodeName : "";
    return [nodeName, sourceNodeName].some((name) => CHAIN_CONVEYOR_CHAIN_NODE_NAMES.includes(name));
  }

  /** 只处理 RollerConveyor 的 GT 辊筒和同源运行态克隆，避免影响其他输送设备的 rotate 组。 */
  private isRollerConveyorMotionNode(node: TransformNode): boolean {
    const nodeName = String(node.name ?? "");
    const metadata = this.isRecord(node.metadata) ? node.metadata : {};
    const sourceNodeName = typeof metadata.sourceNodeName === "string" ? metadata.sourceNodeName : "";
    return /^GT\d+$/i.test(nodeName) || /^GT\d+$/i.test(sourceNodeName);
  }

  /** 将节点 pivot 设置为当前几何中心；没有可渲染几何时保持原 pivot。 */
  private setNodePivotToGeometryCenter(node: TransformNode): void {
    const bounds = this.getNodeWorldBounds(node);
    if (!bounds) {
      return;
    }

    const worldCenter = bounds.minimum.add(bounds.maximum).scaleInPlace(0.5);
    node.computeWorldMatrix(true);
    const localCenter = Vector3.TransformCoordinates(worldCenter, Matrix.Invert(node.getWorldMatrix()));
    if (![localCenter.x, localCenter.y, localCenter.z].every(Number.isFinite)) {
      return;
    }

    node.setPivotPoint(localCenter, Space.LOCAL);
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
      this.restoreNodePivots(state.motionNodes, state.motionBasePivots);
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
    const nextTargetMotionValues = this.readStackerTargetMotionValues(frame, state, currentMotionValues);
    const nextDistanceMotionValues = this.readStackerDistanceMotionValues(frame, state);
    this.mergeMotionValues(nextMotionValues, nextDistanceMotionValues);
    // 目标定位由模型锚点实时计算，同帧出现历史距离字段时以模型目标为准。
    this.mergeMotionValues(nextMotionValues, nextTargetMotionValues);
    this.mergeMotionValues(nextActionDirections, this.readStackerForkActionDirections(frame, state, currentMotionValues));
    this.stopDistanceCalibratedActions(nextActionDirections, nextTargetMotionValues);
    this.stopDistanceCalibratedActions(nextActionDirections, nextDistanceMotionValues);
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
    return this.clampStackerRootTargetPosition(state, position);
  }

  /** 把 Stacker 整机位姿限制在进入预览时的轨道线上，避免 twinspawn 把主体推离上下轨道。 */
  private clampStackerRootTargetPosition(state: DataDrivenTargetState, position: Vector3): Vector3 {
    const constraint = state.stackerTrackConstraint;
    if (!constraint) {
      return position;
    }

    const next = position.clone();
    const axisProjection = Vector3.Dot(next, constraint.horizontalAxis);
    const normalProjection = constraint.baseNormalProjection;
    let delta = axisProjection - constraint.baseAxisProjection;
    if (constraint.minDelta !== undefined) {
      delta = Math.max(constraint.minDelta, delta);
    }
    if (constraint.maxDelta !== undefined) {
      delta = Math.min(constraint.maxDelta, delta);
    }

    const clampedAxisProjection = constraint.baseAxisProjection + delta;
    const clampedHorizontal = constraint.horizontalAxis
      .scale(clampedAxisProjection)
      .addInPlace(constraint.horizontalNormal.scale(normalProjection));
    next.x = clampedHorizontal.x;
    next.z = clampedHorizontal.z;
    return next;
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
          .filter((group) => this.shouldApplyMotionGroupToNodes(group) && group.kind === "translate")
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
          .filter((group) => this.shouldApplyMotionGroupToNodes(group) && group.kind === "rotate")
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

      if (this.shouldApplyMotionGroupToNodes(group)) {
        nodeMotionChanged = true;
      }
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
    this.applyTransportFrontCargoFrame(state, frame, now);

    if (!this.isCargoTransportCarrier(state)) {
      return;
    }

    if (this.isPayloadBindingFrame(frame)) {
      const cargoCode = this.readString(frame, CARGO_TARGET_FIELDS);
      if (cargoCode) {
        this.bindCargoToTransportCarrier(state, cargoCode, now);
      }
      return;
    }
  }

  /** 处理输送线前端有货信号，上升沿会按模型前端生成运行态货箱。 */
  private applyTransportFrontCargoFrame(state: DataDrivenTargetState, frame: DataFrame, now: number): void {
    if (!this.canCreateRuntimeCargoFromFrontSignal(state.target)) {
      return;
    }

    const frontPresent = this.isTransportFrontCargoPresent(frame);
    if (frontPresent === undefined) {
      return;
    }

    const carrierId = state.target.root.uniqueId;
    const wasPresent = this.transportFrontCargoPresence.get(carrierId) ?? false;
    if (!frontPresent) {
      this.transportFrontCargoPresence.set(carrierId, false);
      return;
    }
    if (wasPresent) {
      return;
    }

    const cargoCode = this.createTransportCargoCode(frame, state);
    const normalizedCargoCode = this.normalizeMatchValue(cargoCode);
    const existingCargo = this.findCargoTarget(cargoCode, state.target.root);
    if (existingCargo) {
      this.bindCargoRootToTransportCarrier(state, existingCargo.root, cargoCode, now);
      this.transportFrontCargoPresence.set(carrierId, true);
      return;
    }

    const cargoRoot = this.runtimeGeneratedCargoByCode.get(normalizedCargoCode);
    if (cargoRoot && !cargoRoot.isDisposed()) {
      this.bindCargoRootToTransportCarrier(state, cargoRoot, cargoCode, now);
      this.transportFrontCargoPresence.set(carrierId, true);
      return;
    }

    const createdRoot = this.createRuntimeCargoBoxForTransport(state, cargoCode);
    if (!createdRoot) {
      return;
    }

    this.runtimeGeneratedCargoByCode.set(normalizedCargoCode, createdRoot);
    this.bindCargoRootToTransportCarrier(state, createdRoot, cargoCode, now);
    this.transportFrontCargoPresence.set(carrierId, true);
    this.options.onTargetsChanged([createdRoot], now);
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

  /** 判断当前输送线是否支持由前端有货信号生成预览态货箱。 */
  private canCreateRuntimeCargoFromFrontSignal(target: SceneDataDrivenTarget): boolean {
    return this.isBoundedRollerConveyorTarget(target) || this.isChainConveyorTarget(target);
  }

  /** 读取输送线前端光电位；优先使用显式字段，新协议 signalBits bit0 和旧 PLC move bit0 都可触发。 */
  private isTransportFrontCargoPresent(frame: DataFrame): boolean | undefined {
    return this.readBoolean(frame, TRANSPORT_FRONT_CARGO_FIELDS) ?? this.readBitFlag(frame, "signalBits", 0) ?? this.readBitFlag(frame, "move", 0);
  }

  /** 从 Byte 位域字段中读取指定 bit，字段缺失或非法时返回 undefined。 */
  private readBitFlag(frame: DataFrame, fieldName: string, bitIndex: number): boolean | undefined {
    const normalizedFieldName = this.normalizeProtocolFieldName(fieldName);
    const fieldValue = Object.entries(frame).find(([key]) => this.normalizeProtocolFieldName(key) === normalizedFieldName)?.[1];
    const bitfield = this.readBitfieldNumber(fieldValue);
    if (bitfield === undefined || bitIndex < 0) {
      return undefined;
    }

    return (bitfield & (1 << bitIndex)) !== 0;
  }

  /** 为输送线运行态货箱生成稳定编号，优先使用托盘号，其次使用任务号。 */
  private createTransportCargoCode(frame: DataFrame, state: DataDrivenTargetState): string {
    const containerCode = this.readString(frame, TRANSPORT_CONTAINER_CODE_FIELDS);
    if (containerCode) {
      return containerCode;
    }

    const taskCode = this.readString(frame, TRANSPORT_TASK_CODE_FIELDS);
    if (taskCode && !this.isZeroLikeCode(taskCode)) {
      return `Task${taskCode}`;
    }

    const deviceCode =
      this.readString(frame, ["e", "deviceCode", "devId", "deviceId", "deviceID", "assetCode"]) ??
      state.target.matchFields.assetCode ??
      state.target.matchFields.name ??
      String(state.target.root.uniqueId);
    this.runtimeCargoSequence += 1;
    return `Cargo-${deviceCode}-${this.runtimeCargoSequence}`;
  }

  /** 判断业务编号是否是空任务号，兼容 PLC 常见的 0、000、0.0 字符串。 */
  private isZeroLikeCode(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
      return true;
    }

    const numberValue = Number(trimmed);
    return Number.isFinite(numberValue) && numberValue === 0;
  }

  /** 在输送线前端创建临时 cube，创建失败时保持运行态不变。 */
  private createRuntimeCargoBoxForTransport(state: DataDrivenTargetState, cargoCode: string): TransformNode | null {
    if (!this.options.createRuntimeCargoBox) {
      return null;
    }

    const position = this.createTransportFrontCargoPosition(state, DEFAULT_RUNTIME_CARGO_BOX_SIZE);
    return this.options.createRuntimeCargoBox({
      cargoCode,
      carrierRoot: state.target.root,
      position,
      size: DEFAULT_RUNTIME_CARGO_BOX_SIZE
    });
  }

  /** 计算输送线前端货箱中心点，保证 cube 一生成就在有效输送段内。 */
  private createTransportFrontCargoPosition(state: DataDrivenTargetState, cargoSize: number): Vector3 {
    const axis = this.resolveCargoTransportAxis(state);
    const axisDirection = this.modelLocalAxisToWorldDirection(state.target.root, axis);
    const carrierBounds = this.getNodeWorldBounds(state.target.root);
    const fallbackPosition = state.target.root.getAbsolutePosition();
    const basePosition = carrierBounds
      ? carrierBounds.minimum.add(carrierBounds.maximum).scale(0.5)
      : fallbackPosition.clone();
    const halfSize = cargoSize / 2;
    const topY = carrierBounds ? carrierBounds.maximum.y : fallbackPosition.y;

    if (this.isChainConveyorTarget(state.target)) {
      const chainPosition = this.createChainConveyorFrontCargoPosition(state, basePosition, topY, halfSize);
      if (chainPosition) {
        return chainPosition;
      }
    }

    if (axisDirection.lengthSquared() <= 0) {
      return new Vector3(basePosition.x, topY + halfSize, basePosition.z);
    }

    const trackRange = this.createCargoTransportTrackRange(state, axisDirection);
    if (!trackRange) {
      const positioned = basePosition.add(axisDirection.scale(halfSize));
      positioned.y = topY + halfSize;
      return positioned;
    }

    const trackLength = trackRange.maximum - trackRange.minimum;
    const targetProjection =
      trackLength >= cargoSize
        ? trackRange.minimum + halfSize
        : (trackRange.minimum + trackRange.maximum) / 2;
    const currentProjection = Vector3.Dot(basePosition, axisDirection);
    const positioned = basePosition.add(axisDirection.scale(targetProjection - currentProjection));
    positioned.y = topY + halfSize;
    return positioned;
  }

  /** 链条机使用模型包前端/后端参数放置货箱，不把投影最小端硬编码成前端。 */
  private createChainConveyorFrontCargoPosition(
    state: DataDrivenTargetState,
    fallbackPosition: Vector3,
    topY: number,
    halfSize: number
  ): Vector3 | null {
    const path = this.createChainConveyorCargoPath(state, fallbackPosition);
    if (!path) {
      return null;
    }

    const offsetDistance = Math.min(halfSize, path.length / 2);
    const positioned = path.front.add(path.direction.scale(offsetDistance));
    positioned.y = topY + halfSize;
    return [positioned.x, positioned.y, positioned.z].every(Number.isFinite) ? positioned : null;
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

    this.bindCargoRootToTransportCarrier(state, cargoTarget.root, cargoCode, now);
  }

  /** 将已拿到的货箱根节点绑定到输送线，避免运行态新建节点依赖目标列表刷新。 */
  private bindCargoRootToTransportCarrier(state: DataDrivenTargetState, cargoRoot: TransformNode, cargoCode: string, now: number): void {
    if (this.isAttachedCargoRoot(cargoRoot) || cargoRoot.isDisposed()) {
      return;
    }

    const chainPathProgress = this.isChainConveyorTarget(state.target)
      ? this.createChainConveyorCargoProgress(state, cargoRoot)
      : undefined;
    this.cargoTransports.set(cargoRoot.uniqueId, {
      carrierRootId: state.target.root.uniqueId,
      cargoRoot,
      cargoCode: this.normalizeMatchValue(cargoCode),
      axis: this.resolveCargoTransportAxis(state),
      speed: this.resolveCargoTransportSpeed(state),
      updatedAt: now,
      chainPathProgress
    });
    this.syncCargoTargetStateToCurrentPose(cargoRoot, now);
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

      const direction = stale ? 0 : this.resolveCargoTransportMovementDirection(state);
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

      const nextPosition = this.createCargoTransportNextPosition(state, transport, direction, elapsedSeconds);
      if (!nextPosition) {
        return;
      }
      if (this.setNodeAbsolutePosition(transport.cargoRoot, nextPosition)) {
        changedCargoRoots.push(transport.cargoRoot);
      }
      this.syncCargoTargetStateToCurrentPose(transport.cargoRoot, now);
    });
    return changedCargoRoots;
  }

  /** 按链条机 movement_x 状态更新输送面方向箭头，链条模型本体保持静止。 */
  private updateChainConveyorDirectionArrowsForState(state: DataDrivenTargetState, now: number, stale: boolean): boolean {
    if (!this.isChainConveyorTarget(state.target)) {
      return false;
    }

    const direction = stale ? 0 : this.resolveCargoTransportSemanticDirection(state);
    if (direction === 0) {
      return this.setChainConveyorDirectionArrowEnabled(state.target.root.uniqueId, false);
    }

    const track = this.createChainConveyorDirectionArrowTrack(state);
    if (!track) {
      return this.setChainConveyorDirectionArrowEnabled(state.target.root.uniqueId, false);
    }

    const visual = this.ensureChainConveyorDirectionArrowVisual(state, track);
    visual.root.setEnabled(true);
    this.updateChainConveyorDirectionArrowPositions(visual, track, direction, now);
    return true;
  }

  /** 显隐已创建的链条机方向箭头。 */
  private setChainConveyorDirectionArrowEnabled(rootId: number, enabled: boolean): boolean {
    const visual = this.chainConveyorDirectionArrowVisuals.get(rootId);
    if (!visual) {
      return false;
    }

    visual.root.setEnabled(enabled);
    return true;
  }

  /** 获取或重建链条机方向箭头，轨迹长度变化时同步调整箭头数量和尺寸。 */
  private ensureChainConveyorDirectionArrowVisual(
    state: DataDrivenTargetState,
    track: ChainConveyorDirectionArrowTrack
  ): ChainConveyorDirectionArrowVisual {
    const arrowCount = this.createChainConveyorDirectionArrowCount(track.length);
    const arrowLength = this.createChainConveyorDirectionArrowLength(track.length, arrowCount);
    const existing = this.chainConveyorDirectionArrowVisuals.get(state.target.root.uniqueId);
    if (existing && existing.arrowCount === arrowCount && Math.abs(existing.arrowLength - arrowLength) <= 1e-6) {
      return existing;
    }

    if (existing) {
      this.disposeChainConveyorDirectionArrowVisual(existing);
    }
    const visual = this.createChainConveyorDirectionArrowVisual(state.target.root, arrowCount, arrowLength);
    this.chainConveyorDirectionArrowVisuals.set(state.target.root.uniqueId, visual);
    return visual;
  }

  /** 创建链条机输送面的光晕箭头节点。 */
  private createChainConveyorDirectionArrowVisual(
    targetRoot: TransformNode,
    arrowCount: number,
    arrowLength: number
  ): ChainConveyorDirectionArrowVisual {
    const root = new TransformNode(`${targetRoot.name} / 链条机输送方向箭头`, this.options.scene);
    root.parent = targetRoot;
    root.doNotSerialize = true;
    root.metadata = { runtimeChainConveyorDirectionArrows: true };

    const bodyMaterial = this.createChainConveyorArrowMaterial(`${targetRoot.name} / 输送方向箭头材质`, 0.95, 0.1);
    const haloMaterial = this.createChainConveyorArrowMaterial(`${targetRoot.name} / 输送方向箭头光晕材质`, 0.24, 0.55);
    const arrowNodes = Array.from({ length: arrowCount }, (_unused, index) =>
      this.createChainConveyorDirectionArrowNode(root, index, arrowLength, bodyMaterial, haloMaterial)
    );

    root.setEnabled(false);
    return {
      root,
      arrowNodes,
      materials: [bodyMaterial, haloMaterial],
      arrowCount,
      arrowLength
    };
  }

  /** 创建一个箭头，由箭身、两段箭头和半透明外层组成。 */
  private createChainConveyorDirectionArrowNode(
    parent: TransformNode,
    index: number,
    arrowLength: number,
    bodyMaterial: StandardMaterial,
    haloMaterial: StandardMaterial
  ): TransformNode {
    const arrowNode = new TransformNode(`${parent.name} #${index + 1}`, this.options.scene);
    arrowNode.parent = parent;
    arrowNode.doNotSerialize = true;

    this.createChainConveyorArrowSegments(arrowNode, arrowLength * 1.22, 0.36, 0.018, haloMaterial, "光晕");
    this.createChainConveyorArrowSegments(arrowNode, arrowLength, 0.2, 0.026, bodyMaterial, "箭头");
    return arrowNode;
  }

  /** 创建箭头的三段几何，使用 Box 避免额外纹理和复杂网格。 */
  private createChainConveyorArrowSegments(
    parent: TransformNode,
    arrowLength: number,
    arrowWidth: number,
    arrowHeight: number,
    material: StandardMaterial,
    label: string
  ): void {
    const shaftDepth = arrowLength * 0.58;
    const headDepth = arrowLength * 0.44;
    const shaft = MeshBuilder.CreateBox(
      `${parent.name} / ${label} / 箭身`,
      { width: arrowWidth * 0.34, height: arrowHeight, depth: shaftDepth },
      this.options.scene
    );
    shaft.parent = parent;
    shaft.position.z = -arrowLength * 0.14;

    const leftHead = MeshBuilder.CreateBox(
      `${parent.name} / ${label} / 左箭头`,
      { width: arrowWidth * 0.28, height: arrowHeight, depth: headDepth },
      this.options.scene
    );
    leftHead.parent = parent;
    leftHead.position.x = -arrowWidth * 0.14;
    leftHead.position.z = arrowLength * 0.18;
    leftHead.rotation.y = -Math.PI / 4;

    const rightHead = MeshBuilder.CreateBox(
      `${parent.name} / ${label} / 右箭头`,
      { width: arrowWidth * 0.28, height: arrowHeight, depth: headDepth },
      this.options.scene
    );
    rightHead.parent = parent;
    rightHead.position.x = arrowWidth * 0.14;
    rightHead.position.z = arrowLength * 0.18;
    rightHead.rotation.y = Math.PI / 4;

    [shaft, leftHead, rightHead].forEach((mesh) => {
      mesh.material = material;
      mesh.isPickable = false;
      mesh.doNotSerialize = true;
    });
  }

  /** 创建输送方向箭头材质，自发光和透明外层共同形成光晕观感。 */
  private createChainConveyorArrowMaterial(name: string, alpha: number, glowBoost: number): StandardMaterial {
    const material = new StandardMaterial(name, this.options.scene);
    const color = new Color3(0.04, 0.9, 1);
    material.diffuseColor = color;
    material.emissiveColor = new Color3(
      Math.min(1, color.r + glowBoost),
      Math.min(1, color.g + glowBoost),
      Math.min(1, color.b + glowBoost)
    );
    material.alpha = alpha;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.doNotSerialize = true;
    return material;
  }

  /** 更新箭头在链条机本地轨迹上的循环位置。 */
  private updateChainConveyorDirectionArrowPositions(
    visual: ChainConveyorDirectionArrowVisual,
    track: ChainConveyorDirectionArrowTrack,
    direction: number,
    now: number
  ): void {
    const frontToRearSign = Math.sign(track.rearZ - track.frontZ) || 1;
    const travelSign = Math.sign(direction) * frontToRearSign;
    const minZ = Math.min(track.frontZ, track.rearZ);
    const maxZ = Math.max(track.frontZ, track.rearZ);
    const spacing = track.length / Math.max(1, visual.arrowCount);
    const phase = ((now / 1000) * CHAIN_CONVEYOR_DIRECTION_ARROW_SPEED) % spacing;
    visual.arrowNodes.forEach((arrowNode, index) => {
      const distance = (index * spacing + phase) % track.length;
      arrowNode.position.x = track.centerX;
      arrowNode.position.y = track.topY;
      arrowNode.position.z = travelSign >= 0 ? minZ + distance : maxZ - distance;
      arrowNode.rotation.y = travelSign >= 0 ? 0 : Math.PI;
    });
  }

  /** 读取链条机箭头所需的本地输送面轨迹。 */
  private createChainConveyorDirectionArrowTrack(state: DataDrivenTargetState): ChainConveyorDirectionArrowTrack | null {
    const baseline = this.readChainConveyorEndpointBaseline(state.target.root);
    if (!baseline) {
      return null;
    }

    const chainLength = this.readChainConveyorCurrentLength(state.target.root, baseline);
    const frontRatio = this.readChainConveyorEndpointRatio(state.target.root, "front");
    const rearRatio = this.readChainConveyorEndpointRatio(state.target.root, "rear");
    const frontZ = baseline.minimum.z + chainLength * frontRatio;
    const rearZ = baseline.minimum.z + chainLength * rearRatio;
    const length = Math.abs(rearZ - frontZ);
    if (!Number.isFinite(length) || length <= 1e-6) {
      return null;
    }

    return {
      centerX: this.averageFiniteNumbers(baseline.minimum.x, baseline.maximum.x, 0),
      topY: baseline.maximum.y + CHAIN_CONVEYOR_DIRECTION_ARROW_TOP_OFFSET,
      frontZ,
      rearZ,
      length
    };
  }

  /** 根据链条机长度生成箭头数量，长输送线显示更多箭头但保持上限。 */
  private createChainConveyorDirectionArrowCount(trackLength: number): number {
    const rawCount = Math.round(trackLength / CHAIN_CONVEYOR_DIRECTION_ARROW_TRACK_SPACING);
    return Math.round(
      this.clampNumber(rawCount, CHAIN_CONVEYOR_DIRECTION_ARROW_MIN_COUNT, CHAIN_CONVEYOR_DIRECTION_ARROW_MAX_COUNT)
    );
  }

  /** 根据轨迹间距生成单个箭头尺寸，避免短链条机上箭头互相重叠。 */
  private createChainConveyorDirectionArrowLength(trackLength: number, arrowCount: number): number {
    const spacing = trackLength / Math.max(1, arrowCount);
    return this.clampNumber(spacing * 0.5, 0.34, 0.62);
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

  /** 生成输送线货箱下一帧世界坐标；链条机沿配置端点线段插值，其他输送线沿轴位移。 */
  private createCargoTransportNextPosition(
    state: DataDrivenTargetState,
    transport: CargoTransportState,
    direction: number,
    elapsedSeconds: number
  ): Vector3 | null {
    if (this.shouldUseChainConveyorPathTransport(state)) {
      return this.createChainConveyorCargoNextPosition(state, transport, direction, elapsedSeconds);
    }

    const worldDelta = this.createCargoTransportWorldDelta(state, transport, direction, elapsedSeconds);
    return worldDelta.lengthSquared() <= 0 ? null : transport.cargoRoot.getAbsolutePosition().add(worldDelta);
  }

  /** 生成输送线本帧货箱位移，带端点语义的输送线会按有效输送段范围夹紧。 */
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

    const distance = this.shouldClampCargoTransportToTrack(state.target)
      ? this.clampBoundedCargoTransportDistance(state, transport, axisDirection, rawDistance)
      : rawDistance;
    return Math.abs(distance) <= 0 ? Vector3.Zero() : axisDirection.scale(distance);
  }

  /** 链条机货箱按前端到后端的真实端点线段推进，避免只沿根节点轴移动造成偏轨。 */
  private createChainConveyorCargoNextPosition(
    state: DataDrivenTargetState,
    transport: CargoTransportState,
    direction: number,
    elapsedSeconds: number
  ): Vector3 | null {
    const path = this.createChainConveyorCargoPath(state);
    if (!path || path.length <= 0) {
      return null;
    }

    const progressRange = this.createChainConveyorCargoProgressRange(transport.cargoRoot, path);
    if (!progressRange) {
      transport.blockedDirection = direction;
      transport.blockedBoundary = direction > 0 ? "end" : "start";
      return null;
    }

    const currentProgress =
      transport.chainPathProgress ??
      this.projectPositionToChainConveyorProgress(transport.cargoRoot.getAbsolutePosition(), path);
    const deltaProgress = (direction * transport.speed * elapsedSeconds) / path.length;
    const unclampedProgress = currentProgress + deltaProgress;
    const nextProgress = this.clampNumber(unclampedProgress, progressRange.minimum, progressRange.maximum);
    if (nextProgress === currentProgress) {
      transport.blockedDirection = direction;
      transport.blockedBoundary = direction > 0 ? "end" : "start";
      return null;
    }

    transport.chainPathProgress = nextProgress;
    transport.blockedDirection =
      nextProgress !== unclampedProgress ? direction : undefined;
    transport.blockedBoundary =
      nextProgress !== unclampedProgress ? (direction > 0 ? "end" : "start") : undefined;

    const pathPosition = path.front.add(path.direction.scale(path.length * nextProgress));
    const currentPosition = transport.cargoRoot.getAbsolutePosition();
    const nextPosition = new Vector3(pathPosition.x, currentPosition.y, pathPosition.z);
    return [nextPosition.x, nextPosition.y, nextPosition.z].every(Number.isFinite) ? nextPosition : null;
  }

  /** 计算链条机货箱中心允许进度范围，确保整箱不会越过前后端点。 */
  private createChainConveyorCargoProgressRange(cargoRoot: TransformNode, path: ChainConveyorCargoPath): CargoTransportAxisRange | null {
    const cargoRange = this.createNodeProjectionRange(cargoRoot, path.direction);
    const cargoLength = cargoRange ? cargoRange.maximum - cargoRange.minimum : DEFAULT_RUNTIME_CARGO_BOX_SIZE;
    if (!Number.isFinite(cargoLength) || cargoLength < 0 || cargoLength > path.length) {
      return null;
    }

    const margin = path.length > 0 ? cargoLength / (path.length * 2) : 0;
    const minimum = this.clampNumber(margin, 0, 0.5);
    const maximum = this.clampNumber(1 - margin, 0, 1);
    return minimum <= maximum ? { minimum, maximum } : null;
  }

  /** 判断输送线货箱是否需要按模型输送段夹紧，防止整箱越过端点。 */
  private shouldClampCargoTransportToTrack(target: SceneDataDrivenTarget): boolean {
    return this.isBoundedRollerConveyorTarget(target) || this.isChainConveyorTarget(target);
  }

  /** 货箱按当前输送段夹紧，整箱到末端后等待反向或重绑信号。 */
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

  /** 计算当前有效输送段；链条机优先使用端点参数，其他输送线优先使用运动节点几何。 */
  private createCargoTransportTrackRange(state: DataDrivenTargetState, axisDirection: Vector3): CargoTransportAxisRange | null {
    const chainRange = this.createChainConveyorCargoTrackRange(state, axisDirection);
    if (chainRange) {
      return chainRange;
    }

    const motionGroup = this.findCargoTransportMotionGroup(state);
    const ranges = (motionGroup?.nodes ?? [])
      .map((node) => this.createNodeProjectionRange(node, axisDirection))
      .filter((range): range is CargoTransportAxisRange => Boolean(range));
    if (ranges.length > 0) {
      return this.mergeProjectionRanges(ranges);
    }

    return this.createNodeProjectionRange(state.target.root, axisDirection);
  }

  /** 链条机输送段优先使用模型包前后端参数，确保 target_anchor 和货箱夹紧语义一致。 */
  private createChainConveyorCargoTrackRange(state: DataDrivenTargetState, axisDirection: Vector3): CargoTransportAxisRange | null {
    if (!this.isChainConveyorTarget(state.target) || axisDirection.lengthSquared() <= 0) {
      return null;
    }

    const fallbackPosition = state.target.root.getAbsolutePosition();
    const frontPosition = this.createChainConveyorEndpointWorldPosition(state.target.root, "front", fallbackPosition);
    const rearPosition = this.createChainConveyorEndpointWorldPosition(state.target.root, "rear", fallbackPosition);
    if (!frontPosition || !rearPosition) {
      return null;
    }

    const frontProjection = Vector3.Dot(frontPosition, axisDirection);
    const rearProjection = Vector3.Dot(rearPosition, axisDirection);
    const minimum = Math.min(frontProjection, rearProjection);
    const maximum = Math.max(frontProjection, rearProjection);
    return Number.isFinite(minimum) && Number.isFinite(maximum) && maximum >= minimum
      ? { minimum, maximum }
      : null;
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

  /** 判断目标是否是链条机模型，兼容模型 key、默认编号、资产编号和中文源文件名。 */
  private isChainConveyorTarget(target: SceneDataDrivenTarget): boolean {
    const matchValues = this.dedupeStrings([
      target.dataDriven?.device?.defaultAssetCode,
      target.matchFields.assetCode,
      target.matchFields.modelKey,
      target.matchFields.deviceId,
      target.matchFields.name,
      target.matchFields.sourceFile,
      target.matchFields.sourceFileStem
    ]).map((value) => this.compactProtocolFieldName(value));

    return matchValues.some(
      (value) =>
        value === "chainconveyor01" ||
        value === "chainconveyor" ||
        value.includes("chainconveyor") ||
        value.includes("链条机") ||
        value.includes("链条输送")
    );
  }

  /** 读取货箱移动方向；链条机使用 front -> rear 的业务方向，普通输送线使用轴向方向。 */
  private resolveCargoTransportMovementDirection(state: DataDrivenTargetState): number {
    return this.shouldUseChainConveyorPathTransport(state)
      ? this.resolveCargoTransportSemanticDirection(state)
      : this.resolveCargoTransportDirection(state);
  }

  /** 读取输送线当前动作方向，优先使用 movement_x 对应的 action 运动组。 */
  private resolveCargoTransportDirection(state: DataDrivenTargetState): number {
    const group = this.findCargoTransportMotionGroup(state);
    if (!group) {
      return 0;
    }

    const direction = state.motionActionDirections.get(group.key) ?? 0;
    const normalizedDirection = Number.isFinite(direction) ? Math.sign(direction) : 0;
    if (normalizedDirection === 0) {
      return 0;
    }

    return this.isChainConveyorTarget(state.target) && this.motionGroupUsesField(group, "movement_x")
      ? this.resolveChainConveyorCargoDirection(state, group, normalizedDirection)
      : normalizedDirection;
  }

  /** 读取输送线动作枚举的业务方向；movement_x=1 为正向，movement_x=2 为反向。 */
  private resolveCargoTransportSemanticDirection(state: DataDrivenTargetState): number {
    const group = this.findCargoTransportMotionGroup(state);
    if (!group) {
      return 0;
    }

    const direction = state.motionActionDirections.get(group.key) ?? 0;
    return Number.isFinite(direction) ? Math.sign(direction) : 0;
  }

  /** 链条机货箱使用显式端点线段输送，和 target_anchor=front/rear 使用同一套模型参数。 */
  private shouldUseChainConveyorPathTransport(state: DataDrivenTargetState): boolean {
    const group = this.findCargoTransportMotionGroup(state);
    return Boolean(
      group &&
      this.isChainConveyorTarget(state.target) &&
      this.motionGroupUsesField(group, "movement_x") &&
      this.createChainConveyorCargoPath(state)
    );
  }

  /** 链条机 movement_x=1 永远表示从配置的前端送向后端，端点比例反向时也能保持语义。 */
  private resolveChainConveyorCargoDirection(
    state: DataDrivenTargetState,
    group: RuntimeMotionGroup,
    direction: number
  ): number {
    const cargoAxis = group.cargoAxis ?? CHAIN_CONVEYOR_CARGO_AXIS;
    const axisDirection = this.modelLocalAxisToWorldDirection(state.target.root, cargoAxis);
    if (axisDirection.lengthSquared() <= 0) {
      return -direction;
    }

    const fallbackPosition = state.target.root.getAbsolutePosition();
    const frontPosition = this.createChainConveyorEndpointWorldPosition(state.target.root, "front", fallbackPosition);
    const rearPosition = this.createChainConveyorEndpointWorldPosition(state.target.root, "rear", fallbackPosition);
    if (!frontPosition || !rearPosition) {
      return -direction;
    }

    const endpointDirection = Math.sign(Vector3.Dot(rearPosition, axisDirection) - Vector3.Dot(frontPosition, axisDirection));
    return endpointDirection === 0 ? -direction : direction * endpointDirection;
  }

  /** 解析普通输送线的货箱轴；链条机命中端点路径时仅作为旧几何兜底轴。 */
  private resolveCargoTransportAxis(state: DataDrivenTargetState): ModelDataDrivenAxis {
    const group = this.findCargoTransportMotionGroup(state);
    if (!group) {
      return "x";
    }

    if (group.cargoAxis) {
      return group.cargoAxis;
    }
    if (this.isChainConveyorTarget(state.target) && this.motionGroupUsesField(group, "movement_x")) {
      return CHAIN_CONVEYOR_CARGO_AXIS;
    }
    if (group.target === "root" && group.kind === "translate") {
      return group.axis;
    }
    return this.resolveAxisFromMotionFields(group.fields);
  }

  /** 输送线载货速度优先使用 cargoSpeed 或平移速度，纯旋转模型使用运行态默认速度。 */
  private resolveCargoTransportSpeed(state: DataDrivenTargetState): number {
    const group = this.findCargoTransportMotionGroup(state);
    if (group?.cargoSpeed && group.cargoSpeed > 0) {
      return group.cargoSpeed;
    }
    if (group && this.isChainConveyorTarget(state.target) && this.motionGroupUsesField(group, "movement_x")) {
      return CHAIN_CONVEYOR_CARGO_SPEED;
    }
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

  /** 按 movement_x/y/z 点位名推导普通输送线货箱轴，特殊设备可在运动组上覆盖 cargoAxis。 */
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
    let extension = 0;
    for (const group of state.motionGroups) {
      const key = group.key.toLowerCase();
      if ((key.includes("fork") && !key.includes("side")) || group.fields.some((field) => this.isStackerForkActionField(field))) {
        extension = Math.max(extension, Math.abs(state.motionValues.get(group.key) ?? 0));
      }
    }
    return extension;
  }

  /** 按资产编号、节点名或 uniqueId 查找被取放的货箱根节点。 */
  private findCargoTarget(cargoCode: string, carrierRoot: TransformNode): SceneDataDrivenTarget | null {
    const normalizedCargoCode = this.normalizeMatchValue(cargoCode);
    const runtimeCargoRoot = this.runtimeGeneratedCargoByCode.get(normalizedCargoCode);
    if (runtimeCargoRoot?.isDisposed()) {
      this.runtimeGeneratedCargoByCode.delete(normalizedCargoCode);
    } else if (runtimeCargoRoot) {
      return {
        root: runtimeCargoRoot,
        matchFields: this.createRuntimeCargoMatchFields(cargoCode, runtimeCargoRoot)
      };
    }

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

  /** 为运行态临时货箱提供与普通货箱一致的匹配字段。 */
  private createRuntimeCargoMatchFields(cargoCode: string, cargoRoot: TransformNode): Record<string, string> {
    return {
      assetCode: cargoCode,
      cargoCode,
      boxCode: cargoCode,
      name: cargoRoot.name,
      uniqueId: String(cargoRoot.uniqueId)
    };
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
    const compactPointName = this.compactProtocolFieldName(pointName);
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
      if (frame.movement_x === undefined) {
        this.writeMotionAlias(frame, "movement_x", this.readBitfieldAction(pointValue, [0], [1]));
      }
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

  /** 压缩协议字段名用于点位匹配，点号字段和下划线字段按同一语义处理。 */
  private compactProtocolFieldName(value: string): string {
    return this.normalizeProtocolFieldName(value).replace(/[\s_.]/g, "");
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
      "distancex",
      "distanceX",
      "DistanceX",
      "distance_x",
      "distance_y",
      "front_distanceY",
      "back_distanceY",
      "front_distance_z",
      "back_distance_z",
      "front_movement_z",
      "back_movement_z",
      "front_action",
      "back_action",
      "front_forkAction",
      "back_forkAction",
      "front_forkLocation",
      "back_forkLocation",
      "front_forkDistance",
      "back_forkDistance",
      "frontForkLocation",
      "backForkLocation",
      "frontForkDistance",
      "backForkDistance",
      "front_distanceZ",
      "back_distanceZ",
      "front_distanceX",
      "back_distanceX",
      "frontDistanceZ",
      "backDistanceZ",
      "frontDistanceX",
      "backDistanceX",
      "forkState",
      "rotation",
      "front_has_cargo",
      "frontHasCargo",
      "frontCargo",
      "front_has_box",
      "frontHasBox",
      "hasFrontCargo",
      "front_photoelectric",
      "frontPhotoelectric",
      "rear_has_cargo",
      "rearHasCargo",
      "rearCargo",
      "rear_has_box",
      "rearHasBox",
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
      "travel_target",
      "travelTarget",
      "move_target",
      "moveTarget",
      "target_anchor",
      "targetAnchor",
      "travel_anchor",
      "travelAnchor",
      "fork_target",
      "forkTarget",
      "fork_anchor",
      "forkAnchor",
      "cargo_action",
      "cargoAction",
      "cargo",
      "cargoId",
      "cargoCode",
      "boxId",
      "boxCode",
      "drop_target",
      "dropTarget",
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
      "ts",
      "timestamp",
      "time",
      "assetCode",
      "modelKey",
      ...STACKER_TRAVEL_TARGET_FIELDS,
      ...STACKER_TARGET_ANCHOR_FIELDS,
      ...STACKER_FORK_TARGET_FIELDS,
      ...STACKER_FORK_ANCHOR_FIELDS,
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

  /** 读取布尔字段，兼容现场常见的 true/false、1/0 和 yes/no 字符串。 */
  private readBoolean(frame: DataFrame, paths: string[]): boolean | undefined {
    for (const path of paths.filter(Boolean)) {
      const value = this.readFrameValueByCompactField(frame, this.compactProtocolFieldName(path)) ?? this.readPath(frame, path);
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return value !== 0;
      }
      if (typeof value === "string" && value.trim()) {
        const normalized = this.normalizeMatchValue(value);
        if (["true", "1", "yes", "y", "on", "present", "has", "有", "有货"].includes(normalized)) {
          return true;
        }
        if (["false", "0", "no", "n", "off", "absent", "none", "无", "无货"].includes(normalized)) {
          return false;
        }
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
      ...this.getStackerDeviceAliasMatchValues(target),
      target.matchFields.modelKey,
      target.matchFields.deviceId,
      target.matchFields.name,
      target.matchFields.sourceFile,
      target.matchFields.sourceFileStem
    ]);
  }

  /** Stacker 现场报文默认使用 DDJ2，旧模型包默认使用 Stacker01；两者都作为兜底设备号匹配。 */
  private getStackerDeviceAliasMatchValues(target: SceneDataDrivenTarget): string[] {
    return this.isStackerDeviceTarget(target) ? [STACKER_DEMO_DEVICE_ID, STACKER_LEGACY_DEVICE_ID] : [];
  }

  /** 判断目标是否是 Stacker 设备定义，避免把 DDJ2 别名扩散到其它模型。 */
  private isStackerDeviceTarget(target: SceneDataDrivenTarget): boolean {
    const device = target.dataDriven?.device;
    if (device?.devType === "stacker") {
      return true;
    }

    const matchValues = this.dedupeStrings([
      device?.defaultAssetCode,
      target.matchFields.modelKey,
      target.matchFields.sourceFile,
      target.matchFields.sourceFileStem
    ]).map((value) => this.normalizeMatchValue(value));

    return matchValues.some((value) => value === "stacker01" || value === "ddj2" || value.includes("stacker"));
  }

  /** 读取 target 模式运动组绑定的 payload 数字目标值。 */
  private readMotionGroupValue(frame: DataFrame, group: RuntimeMotionGroup): number | undefined {
    return group.valueMode === "target" && group.fields.length > 0 ? this.readNumber(frame, group.fields) : undefined;
  }

  /** 汇总 Stacker 模型目标定位值；由资产编号和锚点实时推导 travel/fork 目标位置。 */
  private readStackerTargetMotionValues(
    frame: DataFrame,
    state: DataDrivenTargetState,
    currentValues: Map<string, number>
  ): Map<string, number> {
    const values = this.readStackerTravelTargetMotionValues(frame, state, currentValues);
    this.mergeMotionValues(values, this.readStackerForkTargetMotionValues(frame, state, currentValues));
    return values;
  }

  /** 根据 travel_target 指向的模型锚点，计算 Stacker 行走机构应到达的模型内目标值。 */
  private readStackerTravelTargetMotionValues(
    frame: DataFrame,
    state: DataDrivenTargetState,
    currentValues: Map<string, number>
  ): Map<string, number> {
    const values = new Map<string, number>();
    if (!state.isStacker) {
      return values;
    }

    const targetCode = this.readString(frame, STACKER_TRAVEL_TARGET_FIELDS);
    if (!targetCode) {
      return values;
    }

    const travelGroup = state.motionGroups.find((group) => this.isStackerTravelRuntimeMotionGroup(group));
    const targetRoot = this.findSceneMotionTargetRoot(targetCode, state.target.root);
    if (!travelGroup || !targetRoot) {
      return values;
    }

    const targetPosition = this.createSceneMotionTargetWorldPosition(
      targetRoot,
      this.readString(frame, STACKER_TARGET_ANCHOR_FIELDS)
    );
    const stackerAnchor = state.cargoHandling
      ? this.getCargoAnchorWorldPosition(state, state.cargoHandling)
      : state.target.root.getAbsolutePosition();
    const axisDirection = this.modelLocalAxisToWorldDirection(state.target.root, travelGroup.axis);
    const currentValue = currentValues.get(travelGroup.key) ?? state.motionValues.get(travelGroup.key) ?? 0;
    const nextValue = this.createTargetMotionValueFromWorldProjection(currentValue, stackerAnchor, targetPosition, axisDirection);
    if (nextValue !== undefined) {
      values.set(travelGroup.key, nextValue);
    }
    return values;
  }

  /** 根据 fork_target 指向的货箱或定位框，计算货叉伸缩应到达的模型内目标值。 */
  private readStackerForkTargetMotionValues(
    frame: DataFrame,
    state: DataDrivenTargetState,
    currentValues: Map<string, number>
  ): Map<string, number> {
    const values = new Map<string, number>();
    if (!state.isStacker) {
      return values;
    }

    const targetCode = this.readString(frame, STACKER_FORK_TARGET_FIELDS);
    if (!targetCode) {
      return values;
    }

    const forkGroup = state.motionGroups.find((group) => this.isStackerForkRuntimeMotionGroup(group));
    if (!forkGroup) {
      return values;
    }

    if (this.isStackerHomeTargetCode(targetCode)) {
      values.set(forkGroup.key, 0);
      return values;
    }

    const targetRoot = this.findSceneMotionTargetRoot(targetCode, state.target.root);
    if (!targetRoot || !state.cargoHandling) {
      return values;
    }

    const targetPosition = this.createSceneMotionTargetWorldPosition(
      targetRoot,
      this.readString(frame, STACKER_FORK_ANCHOR_FIELDS)
    );
    const stackerAnchor = this.getCargoAnchorWorldPosition(state, state.cargoHandling);
    const axisDirection = this.modelLocalAxisToWorldDirection(state.target.root, forkGroup.axis);
    const currentValue = currentValues.get(forkGroup.key) ?? state.motionValues.get(forkGroup.key) ?? 0;
    const nextValue = this.createTargetMotionValueFromWorldProjection(currentValue, stackerAnchor, targetPosition, axisDirection);
    if (nextValue !== undefined) {
      values.set(forkGroup.key, nextValue);
    }
    return values;
  }

  /** 判断 fork_target 是否表示回模型原位，避免缩叉继续依赖距离字段。 */
  private isStackerHomeTargetCode(targetCode: string): boolean {
    const normalizedCode = this.normalizeMatchValue(targetCode);
    return STACKER_HOME_TARGET_VALUES.some((value) => this.normalizeMatchValue(value) === normalizedCode);
  }

  /** 通过资产编号、节点名或定位框编号查找可作为运动目标的场景节点。 */
  private findSceneMotionTargetRoot(targetCode: string, carrierRoot: TransformNode): TransformNode | null {
    const normalizedTargetCode = this.normalizeMatchValue(targetCode);
    const runtimeCargoRoot = this.runtimeGeneratedCargoByCode.get(normalizedTargetCode);
    if (runtimeCargoRoot?.isDisposed()) {
      this.runtimeGeneratedCargoByCode.delete(normalizedTargetCode);
    } else if (runtimeCargoRoot && runtimeCargoRoot.uniqueId !== carrierRoot.uniqueId) {
      // 运行态货箱不会进入普通场景树缓存，Stacker 目标定位需要直接命中运行态索引。
      return runtimeCargoRoot;
    }

    const sceneTarget = this.options.getTargets().find((target) => {
      if (
        target.root.uniqueId === carrierRoot.uniqueId ||
        target.root.isDescendantOf?.(carrierRoot) ||
        carrierRoot.isDescendantOf?.(target.root)
      ) {
        return false;
      }
      return this.getCargoMatchValues(target).some((value) => this.normalizeMatchValue(value) === normalizedTargetCode);
    });
    if (sceneTarget) {
      return sceneTarget.root;
    }

    return this.findCargoDropTarget(targetCode)?.root ?? null;
  }

  /** 根据目标节点和锚点语义取世界坐标，链条机优先使用模型端点参数，其他模型沿用最长水平轴端点。 */
  private createSceneMotionTargetWorldPosition(targetRoot: TransformNode, anchorValue: string | undefined): Vector3 {
    const bounds = this.getNodeWorldBounds(targetRoot);
    const position = bounds
      ? bounds.minimum.add(bounds.maximum).scale(0.5)
      : targetRoot.getAbsolutePosition();
    const anchor = this.normalizeMatchValue(anchorValue ?? "center");
    if (!["front", "rear", "start", "end"].includes(anchor)) {
      return position;
    }

    const chainEndpointPosition = this.createChainConveyorEndpointWorldPosition(targetRoot, anchor, position);
    if (chainEndpointPosition) {
      return chainEndpointPosition;
    }

    const axisDirection = this.resolveTargetLongestHorizontalAxis(targetRoot);
    const range = axisDirection ? this.createNodeProjectionRange(targetRoot, axisDirection) : null;
    if (!axisDirection || !range) {
      return position;
    }

    const targetProjection = anchor === "front" || anchor === "end" ? range.maximum : range.minimum;
    const currentProjection = Vector3.Dot(position, axisDirection);
    return position.add(axisDirection.scale(targetProjection - currentProjection));
  }

  /** 创建当前链条机货箱轨迹，front -> rear 是 movement_x=1 的业务方向。 */
  private createChainConveyorCargoPath(state: DataDrivenTargetState, fallbackPosition = state.target.root.getAbsolutePosition()): ChainConveyorCargoPath | null {
    const front = this.createChainConveyorEndpointWorldPosition(state.target.root, "front", fallbackPosition);
    const rear = this.createChainConveyorEndpointWorldPosition(state.target.root, "rear", fallbackPosition);
    if (!front || !rear) {
      return null;
    }

    const delta = rear.subtract(front);
    const length = delta.length();
    if (!Number.isFinite(length) || length <= 1e-6) {
      return null;
    }

    return {
      front,
      rear,
      direction: delta.scale(1 / length),
      length
    };
  }

  /** 读取货箱中心在链条机轨迹上的进度，用于重绑已有货箱时不突然跳回前端。 */
  private createChainConveyorCargoProgress(state: DataDrivenTargetState, cargoRoot: TransformNode): number | undefined {
    const path = this.createChainConveyorCargoPath(state);
    if (!path) {
      return undefined;
    }

    return this.projectPositionToChainConveyorProgress(cargoRoot.getAbsolutePosition(), path);
  }

  /** 把世界坐标投影到链条机 front -> rear 线段，返回未夹紧的进度。 */
  private projectPositionToChainConveyorProgress(position: Vector3, path: ChainConveyorCargoPath): number {
    if (path.length <= 0) {
      return 0;
    }

    const projectedDistance = Vector3.Dot(position.subtract(path.front), path.direction);
    const progress = projectedDistance / path.length;
    return Number.isFinite(progress) ? progress : 0;
  }

  /** 按链条机本地输送段比例生成前后端世界坐标，缺少基线时交给旧几何兜底。 */
  private createChainConveyorEndpointWorldPosition(targetRoot: TransformNode, anchor: string, fallbackPosition: Vector3): Vector3 | null {
    const baseline = this.readChainConveyorEndpointBaseline(targetRoot);
    if (!baseline) {
      return null;
    }

    const ratio = this.readChainConveyorEndpointRatio(targetRoot, anchor);
    const chainLength = this.readChainConveyorCurrentLength(targetRoot, baseline);
    const localPoint = new Vector3(
      this.averageFiniteNumbers(baseline.minimum.x, baseline.maximum.x, 0),
      this.averageFiniteNumbers(baseline.minimum.y, baseline.maximum.y, 0),
      baseline.minimum.z + chainLength * ratio
    );

    targetRoot.computeWorldMatrix(true);
    const worldPoint = Vector3.TransformCoordinates(localPoint, targetRoot.getWorldMatrix());
    worldPoint.y = fallbackPosition.y;
    return [worldPoint.x, worldPoint.y, worldPoint.z].every(Number.isFinite) ? worldPoint : null;
  }

  /** 读取链条机基线 metadata，只有明确存在 opaqueChainConveyorBaseline 时才启用端点参数。 */
  private readChainConveyorEndpointBaseline(targetRoot: TransformNode): ChainConveyorEndpointBaseline | null {
    const editorMetadata = this.readNodeEditorMetadata(targetRoot);
    const runtimeMetadata = this.isRecord(editorMetadata.modelPackageRuntime) ? editorMetadata.modelPackageRuntime : {};
    const baselineMetadata = this.isRecord(runtimeMetadata.opaqueChainConveyorBaseline)
      ? runtimeMetadata.opaqueChainConveyorBaseline
      : null;
    if (!baselineMetadata) {
      return null;
    }

    const minimum = this.readVector3Metadata(baselineMetadata.minimum);
    const maximum = this.readVector3Metadata(baselineMetadata.maximum);
    const size = this.readVector3Metadata(baselineMetadata.size) ?? (minimum && maximum ? maximum.subtract(minimum) : null);
    if (!minimum || !maximum || !size || size.z <= 0) {
      return null;
    }
    return { minimum, maximum, size };
  }

  /** 读取链条机端点比例，front/end 默认 1，rear/start 默认 0，非法值会夹紧到 0..1。 */
  private readChainConveyorEndpointRatio(targetRoot: TransformNode, anchor: string): number {
    const values = this.readModelPackageInstanceValues(targetRoot);
    const fieldNames = anchor === "front" || anchor === "end"
      ? CHAIN_CONVEYOR_FRONT_ENDPOINT_RATIO_FIELDS
      : CHAIN_CONVEYOR_REAR_ENDPOINT_RATIO_FIELDS;
    const fallback = anchor === "front" || anchor === "end" ? 1 : 0;
    const value = this.readNumberParameterByFieldNames(values, fieldNames);
    return this.clampNumber(value ?? fallback, 0, 1);
  }

  /** 读取链条机当前有效长度，缺少实例参数时回退到原始基线长度。 */
  private readChainConveyorCurrentLength(targetRoot: TransformNode, baseline: ChainConveyorEndpointBaseline): number {
    const values = this.readModelPackageInstanceValues(targetRoot);
    const configuredLength = this.readNumberParameterByFieldNames(values, CHAIN_CONVEYOR_LENGTH_PARAMETER_FIELDS);
    return configuredLength !== undefined && configuredLength > 0 ? configuredLength : baseline.size.z;
  }

  /** 读取模型包实例参数字典，兼容 metadata 缺失或旧场景未保存 values 的情况。 */
  private readModelPackageInstanceValues(targetRoot: TransformNode): Record<string, unknown> {
    const editorMetadata = this.readNodeEditorMetadata(targetRoot);
    const instance = this.isRecord(editorMetadata.modelPackageInstance) ? editorMetadata.modelPackageInstance : {};
    return this.isRecord(instance.values) ? instance.values : {};
  }

  /** 读取节点 editor metadata，避免直接访问链在旧场景中抛错。 */
  private readNodeEditorMetadata(targetRoot: TransformNode): Record<string, unknown> {
    const metadata = this.isRecord(targetRoot.metadata) ? targetRoot.metadata : {};
    return this.isRecord(metadata.editor) ? metadata.editor : {};
  }

  /** 按字段名或字段别名读取数值参数，支持链条机旧键和中文标签兜底。 */
  private readNumberParameterByFieldNames(values: Record<string, unknown>, fieldNames: string[]): number | undefined {
    for (const fieldName of fieldNames) {
      const value = this.readFiniteNumberParameter(values[fieldName]);
      if (value !== undefined) {
        return value;
      }
    }

    const compactFieldNames = new Set(fieldNames.map((fieldName) => this.compactProtocolFieldName(fieldName)));
    for (const [key, value] of Object.entries(values)) {
      if (!compactFieldNames.has(this.compactProtocolFieldName(key))) {
        continue;
      }
      const numericValue = this.readFiniteNumberParameter(value);
      if (numericValue !== undefined) {
        return numericValue;
      }
    }
    return undefined;
  }

  /** 读取有限数字参数，支持裸数字、字符串数字和历史包装结构。 */
  private readFiniteNumberParameter(value: unknown): number | undefined {
    const numericValue = this.parseFiniteNumber(this.unwrapParameterValue(value));
    return Number.isFinite(numericValue) ? numericValue : undefined;
  }

  /** 读取序列化 Vector3 metadata，字段非法时返回 null 交给调用方兜底。 */
  private readVector3Metadata(value: unknown): Vector3 | null {
    if (!this.isRecord(value)) {
      return null;
    }
    const x = this.parseFiniteNumber(value.x);
    const y = this.parseFiniteNumber(value.y);
    const z = this.parseFiniteNumber(value.z);
    return [x, y, z].every(Number.isFinite) ? new Vector3(x, y, z) : null;
  }

  /** 计算两个有限数字的平均值，任一非法时使用兜底。 */
  private averageFiniteNumbers(left: number, right: number, fallback: number): number {
    return Number.isFinite(left) && Number.isFinite(right) ? (left + right) / 2 : fallback;
  }

  /** 将数值夹紧到指定区间，防止端点比例 NaN 或越界。 */
  private clampNumber(value: number, minimum: number, maximum: number): number {
    if (!Number.isFinite(value)) {
      return minimum;
    }
    return Math.max(minimum, Math.min(maximum, value));
  }

  /** 选择目标模型自身最长的水平局部轴，用于推导输送线等设备的前后端。 */
  private resolveTargetLongestHorizontalAxis(targetRoot: TransformNode): Vector3 | null {
    const candidates = (["x", "z"] as ModelDataDrivenAxis[])
      .map((axis) => this.normalizeHorizontalDirection(this.modelLocalAxisToWorldDirection(targetRoot, axis)))
      .filter((axis): axis is Vector3 => Boolean(axis))
      .map((axis) => ({ axis, range: this.createNodeProjectionRange(targetRoot, axis) }))
      .filter((item): item is { axis: Vector3; range: CargoTransportAxisRange } => Boolean(item.range));
    if (candidates.length === 0) {
      return null;
    }

    return candidates.sort((left, right) => (right.range.maximum - right.range.minimum) - (left.range.maximum - left.range.minimum))[0].axis;
  }

  /** 把当前锚点到目标锚点的世界投影差转换成运动组目标值。 */
  private createTargetMotionValueFromWorldProjection(
    currentValue: number,
    currentPosition: Vector3,
    targetPosition: Vector3,
    axisDirection: Vector3
  ): number | undefined {
    if (axisDirection.lengthSquared() <= 1e-12) {
      return undefined;
    }

    const delta = Vector3.Dot(targetPosition.subtract(currentPosition), axisDirection);
    const nextValue = currentValue + delta;
    return Number.isFinite(nextValue) ? nextValue : undefined;
  }

  /** 汇总 Stacker 绝对距离校准值；同帧校准值优先于对应 action 积分。 */
  private readStackerDistanceMotionValues(frame: DataFrame, state: DataDrivenTargetState): Map<string, number> {
    const values = this.readStackerDistanceTravelMotionValues(frame, state);
    this.mergeMotionValues(values, this.readStackerDistanceLiftMotionValues(frame, state));
    this.mergeMotionValues(values, this.readStackerDistanceForkMotionValues(frame, state));
    return values;
  }

  /** 读取 Stacker 行走距离校验值，现场 distancex 使用毫米原值，运行时不做单位换算。 */
  private readStackerDistanceTravelMotionValues(frame: DataFrame, state: DataDrivenTargetState): Map<string, number> {
    const values = new Map<string, number>();
    if (!state.isStacker) {
      return values;
    }

    const distanceValue = this.readStackerDistanceXValue(frame);
    if (distanceValue === undefined) {
      return values;
    }

    const travelGroup = state.motionGroups.find((group) => this.isStackerTravelRuntimeMotionGroup(group));
    if (!travelGroup) {
      return values;
    }

    values.set(travelGroup.key, this.createStackerTravelValueFromDistance(distanceValue, travelGroup));
    return values;
  }

  /** 读取 Stacker 载货台高度校准值，新协议 distance_y 用米，旧 front/back_distanceY 用毫米。 */
  private readStackerDistanceLiftMotionValues(frame: DataFrame, state: DataDrivenTargetState): Map<string, number> {
    const values = new Map<string, number>();
    if (!state.isStacker) {
      return values;
    }

    const distanceMeters = this.readStackerLiftDistanceMeters(frame);
    if (distanceMeters === undefined) {
      return values;
    }

    const liftGroup = state.motionGroups.find((group) => this.isStackerLiftRuntimeMotionGroup(group));
    if (!liftGroup) {
      return values;
    }

    values.set(liftGroup.key, this.createStackerLiftValueFromDistance(distanceMeters, liftGroup));
    return values;
  }

  /** 读取 Stacker 货叉绝对伸缩位置，兼容距离数值和 PLC 货叉位置位信号。 */
  private readStackerDistanceForkMotionValues(frame: DataFrame, state: DataDrivenTargetState): Map<string, number> {
    const values = new Map<string, number>();
    if (!state.isStacker) {
      return values;
    }

    const forkGroup = state.motionGroups.find((group) => this.isStackerForkRuntimeMotionGroup(group));
    if (!forkGroup) {
      return values;
    }

    const distanceValue = this.readStackerForkDistanceValue(frame, forkGroup);
    if (distanceValue === undefined) {
      return values;
    }

    values.set(forkGroup.key, distanceValue);
    return values;
  }

  /** 在任意对象帧中查找 distancex 变体，兼容大小写和下划线写法。 */
  private readStackerDistanceXValue(frame: DataFrame): number | undefined {
    for (const [fieldName, fieldValue] of Object.entries(frame)) {
      if (!this.isStackerDistanceXField(fieldName)) {
        continue;
      }

      const numberValue = this.parseFiniteNumber(fieldValue);
      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }
    return undefined;
  }

  /** 优先读取新协议米制 distance_y，缺失时兼容旧协议前/后叉毫米高度。 */
  private readStackerLiftDistanceMeters(frame: DataFrame): number | undefined {
    const directMeters = this.readStackerDistanceNumberByField(frame, STACKER_DISTANCE_Y_FIELD_COMPACT);
    if (directMeters !== undefined) {
      return directMeters;
    }

    const legacyMillimeters =
      this.readStackerDistanceNumberByField(frame, STACKER_FRONT_DISTANCE_Y_FIELD_COMPACT) ??
      this.readStackerDistanceNumberByField(frame, STACKER_BACK_DISTANCE_Y_FIELD_COMPACT);
    return legacyMillimeters !== undefined ? legacyMillimeters / 1000 : undefined;
  }

  /** 读取指定距离字段，兼容大小写、空格、下划线和横线写法。 */
  private readStackerDistanceNumberByField(frame: DataFrame, compactFieldName: string): number | undefined {
    const fieldValue = this.readFrameValueByCompactField(frame, compactFieldName);
    const numberValue = this.parseFiniteNumber(fieldValue);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  /** 按归一化字段名读取帧值，兼容大小写、空格、下划线和横线。 */
  private readFrameValueByCompactField(frame: DataFrame, compactFieldName: string): unknown {
    for (const [fieldName, fieldValue] of Object.entries(frame)) {
      if (this.compactProtocolFieldName(fieldName) === compactFieldName) {
        return fieldValue;
      }
    }
    return undefined;
  }

  /** 优先读取标准位置位信号；没有位置位时再兼容非标准连续货叉距离。 */
  private readStackerForkDistanceValue(frame: DataFrame, group: RuntimeMotionGroup): number | undefined {
    const locationValue = this.readStackerForkLocationValue(frame, group);
    if (locationValue !== undefined) {
      return locationValue;
    }

    const directValue = this.readStackerForkDistanceNumber(frame);
    if (directValue !== undefined) {
      return this.createStackerForkValueFromDistance(directValue, group, this.readStackerForkDistanceDirection(frame));
    }

    return undefined;
  }

  /** 读取 MQTT 中常见的货叉距离字段，按前叉、后叉和通用字段固定优先级解析。 */
  private readStackerForkDistanceNumber(frame: DataFrame): number | undefined {
    for (const compactFieldName of STACKER_FORK_DISTANCE_FIELD_COMPACTS) {
      const fieldValue = this.readFrameValueByCompactField(frame, compactFieldName);
      const numberValue = this.parseFiniteNumber(fieldValue);
      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }
    return undefined;
  }

  /** 连续距离通常只表达取货深浅，左右方向只从原始 forkAction 位域推导。 */
  private readStackerForkDistanceDirection(frame: DataFrame): number | undefined {
    const bitfieldDirection = this.readStackerForkBitfieldSideDirection(this.readStackerForkActionRawValue(frame));
    if (bitfieldDirection !== undefined) {
      return bitfieldDirection;
    }
    return undefined;
  }

  /** 读取前/后叉位置位信号，深浅位优先于原位，避免空闲叉覆盖工作叉。 */
  private readStackerForkLocationValue(frame: DataFrame, group: RuntimeMotionGroup): number | undefined {
    const candidates = [
      this.readStackerForkLocationValueByField(frame, STACKER_FRONT_FORK_LOCATION_FIELD_COMPACT, group),
      this.readStackerForkLocationValueByField(frame, STACKER_BACK_FORK_LOCATION_FIELD_COMPACT, group)
    ].filter((value): value is number => value !== undefined);
    if (candidates.length === 0) {
      return undefined;
    }

    const activeCandidates = candidates.filter((value) => Math.abs(value) > 1e-6);
    if (activeCandidates.length === 0) {
      return 0;
    }

    const sideDirection = this.readStackerForkBitfieldSideDirection(this.readStackerForkActionRawValue(frame));
    if (sideDirection !== undefined) {
      const directedValue = activeCandidates.find((value) => Math.sign(value) === sideDirection);
      if (directedValue !== undefined) {
        return directedValue;
      }
    }

    return activeCandidates[0];
  }

  /** 将 PLC 货叉位置位信号转换成以原点为中心的货叉伸缩目标。 */
  private readStackerForkLocationValueByField(frame: DataFrame, compactFieldName: string, group: RuntimeMotionGroup): number | undefined {
    for (const [fieldName, fieldValue] of Object.entries(frame)) {
      if (this.compactProtocolFieldName(fieldName) !== compactFieldName) {
        continue;
      }

      return this.createStackerForkValueFromLocation(fieldValue, group);
    }
    return undefined;
  }

  /** 将 PLC 上报的字符串或数字转换成有限数字。 */
  private parseFiniteNumber(value: unknown): number {
    return typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  }

  /** 判断字段是否是 Stacker X 向绝对距离，现场点位名为 distancex。 */
  private isStackerDistanceXField(fieldName: string): boolean {
    return this.compactProtocolFieldName(fieldName) === STACKER_DISTANCE_X_FIELD_COMPACT;
  }

  /** 根据距轨道起点的绝对距离生成 travel 运动组目标值，起点默认取当前限位 min 端。 */
  private createStackerTravelValueFromDistance(distanceValue: number, group: RuntimeMotionGroup): number {
    const travelOrigin = group.limits?.min ?? 0;
    return travelOrigin + distanceValue;
  }

  /** 载货台高度校准值进入此处前已统一为米。 */
  private createStackerLiftValueFromDistance(distanceValue: number, group: RuntimeMotionGroup): number {
    const liftOrigin = group.limits?.min ?? 0;
    return liftOrigin + distanceValue;
  }

  /** 货叉距离字段可直接发米，也可发毫米；无符号距离会结合同帧方向信号生成左右伸缩目标。 */
  private createStackerForkValueFromDistance(distanceValue: number, group: RuntimeMotionGroup, direction: number | undefined): number {
    const maxTravel = this.resolveStackerForkTravelLimit(group);
    const meters = Math.abs(distanceValue) > Math.max(10, maxTravel * 2) ? distanceValue / 1000 : distanceValue;
    const signedMeters = meters > 0 && direction === -1 ? -meters : meters;
    return Math.max(-maxTravel, Math.min(maxTravel, signedMeters));
  }

  /** PLC front/back_forkLocation 是位置位信号；换速位按半行程可视化，极限位按完整/半行程校准。 */
  private createStackerForkValueFromLocation(value: unknown, group: RuntimeMotionGroup): number | undefined {
    const bitfield = this.readBitfieldNumber(value);
    if (bitfield === undefined) {
      return undefined;
    }

    const travel = this.resolveStackerForkTravelLimit(group);
    const shallowTravel = travel * 0.5;
    const leftDeep = (bitfield & (1 << 6)) !== 0;
    const rightDeep = (bitfield & (1 << 5)) !== 0;
    const leftShallow = (bitfield & (1 << 4)) !== 0 || (bitfield & (1 << 3)) !== 0;
    const rightShallow = (bitfield & (1 << 0)) !== 0 || (bitfield & (1 << 1)) !== 0;
    const origin = (bitfield & (1 << 2)) !== 0;
    const leftTarget = leftDeep ? -travel : leftShallow ? -shallowTravel : undefined;
    const rightTarget = rightDeep ? travel : rightShallow ? shallowTravel : undefined;

    if (leftTarget !== undefined && rightTarget === undefined) {
      return leftTarget;
    }
    if (rightTarget !== undefined && leftTarget === undefined) {
      return rightTarget;
    }
    if (origin && leftTarget === undefined && rightTarget === undefined) {
      return 0;
    }
    return undefined;
  }

  /** 读取货叉左右伸缩最大行程，用于距离单位判断和位置位信号换算。 */
  private resolveStackerForkTravelLimit(group: RuntimeMotionGroup): number {
    if (group.stackerForkMaxExtension !== undefined && Number.isFinite(group.stackerForkMaxExtension) && group.stackerForkMaxExtension > 0) {
      return group.stackerForkMaxExtension;
    }

    const min = group.limits?.min;
    const max = group.limits?.max;
    const travel = Math.max(Math.abs(min ?? 0), Math.abs(max ?? 0), DEFAULT_STACKER_FORK_EXTENSION_LIMIT);
    return Number.isFinite(travel) && travel > 0 ? travel : DEFAULT_STACKER_FORK_EXTENSION_LIMIT;
  }

  /** 读取 action 模式运动组绑定的原始枚举值，字符串和数字都按协议码处理。 */
  private readMotionGroupRawActionValue(frame: DataFrame, group: RuntimeMotionGroup): unknown {
    if (group.valueMode !== "action") {
      return undefined;
    }

    let firstValue: unknown;
    let hasValue = false;
    let firstMappedValue: unknown;
    let hasMappedValue = false;
    for (const field of group.fields) {
      const value = this.readPath(frame, field);
      if (value !== undefined) {
        if (!hasValue) {
          firstValue = value;
          hasValue = true;
        }

        const key = this.createActionMapKey(value);
        const direction = key !== undefined ? group.actionMap.get(key) : undefined;
        if (direction !== undefined && !hasMappedValue) {
          firstMappedValue = value;
          hasMappedValue = true;
        }
        if (direction !== undefined && direction !== 0) {
          return value;
        }
      }
    }
    if (hasMappedValue) {
      return firstMappedValue;
    }
    return hasValue ? firstValue : undefined;
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

  /** 合并同一帧的目标值，后写入的距离校验值优先于普通 target 字段。 */
  private mergeMotionValues(target: Map<string, number>, source: Map<string, number>): void {
    source.forEach((value, key) => target.set(key, value));
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

  /** 根据 PLC 左/右伸缩位信号修正货叉动作方向，缩叉始终朝当前原点回收。 */
  private readStackerForkActionDirections(
    frame: DataFrame,
    state: DataDrivenTargetState,
    currentValues: Map<string, number>
  ): Map<string, number> {
    const directions = new Map<string, number>();
    if (!state.isStacker) {
      return directions;
    }

    const forkGroup = state.motionGroups.find((group) => this.isStackerForkRuntimeMotionGroup(group));
    if (!forkGroup) {
      return directions;
    }

    const rawValue = this.readStackerForkActionRawValue(frame);
    if (rawValue === undefined) {
      return directions;
    }

    const direction = this.readStackerForkBitfieldDirection(rawValue, currentValues.get(forkGroup.key) ?? 0);
    if (direction !== undefined && Number.isFinite(direction)) {
      directions.set(forkGroup.key, direction);
    }
    return directions;
  }

  /** 读取现场 PLC 前/后叉动作原始位域，前叉有效时优先使用前叉。 */
  private readStackerForkActionRawValue(frame: DataFrame): unknown {
    const frontValue = this.readFrameValueByCompactField(frame, "frontforkaction");
    const backValue = this.readFrameValueByCompactField(frame, "backforkaction");
    const frontBitfield = this.readBitfieldNumber(frontValue);
    const backBitfield = this.readBitfieldNumber(backValue);
    if (frontBitfield !== undefined && frontBitfield !== 0) {
      return frontValue;
    }
    if (backBitfield !== undefined && backBitfield !== 0) {
      return backValue;
    }
    if (frontBitfield === 0) {
      return frontValue;
    }
    if (backBitfield === 0) {
      return backValue;
    }
    return undefined;
  }

  /** 解析 V5.2 forkAction：bit1 右伸、bit2 左缩、bit3 左伸、bit4 右缩。 */
  private readStackerForkBitfieldDirection(value: unknown, currentValue: number): number | undefined {
    const bitfield = this.readBitfieldNumber(value);
    if (bitfield === undefined) {
      return undefined;
    }

    const rightExtend = (bitfield & (1 << 1)) !== 0;
    const leftExtend = (bitfield & (1 << 3)) !== 0;
    const leftRetract = (bitfield & (1 << 2)) !== 0;
    const rightRetract = (bitfield & (1 << 4)) !== 0;
    const candidates = new Set<number>();
    if (rightExtend) {
      candidates.add(1);
    }
    if (leftExtend) {
      candidates.add(-1);
    }
    if (leftRetract || rightRetract) {
      const retractDirection = this.createForkRetractDirection(currentValue);
      if (retractDirection !== 0) {
        candidates.add(retractDirection);
      }
    }

    if (candidates.size === 1) {
      return [...candidates][0];
    }
    return 0;
  }

  /** 从 V5.2 forkAction 位域读取货叉所在侧，连续距离字段用它把深浅距离转成正负目标。 */
  private readStackerForkBitfieldSideDirection(value: unknown): number | undefined {
    const bitfield = this.readBitfieldNumber(value);
    if (bitfield === undefined) {
      return undefined;
    }

    const rightSide = (bitfield & (1 << 1)) !== 0 || (bitfield & (1 << 4)) !== 0;
    const leftSide = (bitfield & (1 << 2)) !== 0 || (bitfield & (1 << 3)) !== 0;
    if (rightSide && !leftSide) {
      return 1;
    }
    if (leftSide && !rightSide) {
      return -1;
    }
    return undefined;
  }

  /** 缩叉信号没有左右位移量时，以当前伸出方向决定回原点方向。 */
  private createForkRetractDirection(currentValue: number): number {
    if (currentValue > 1e-6) {
      return -1;
    }
    if (currentValue < -1e-6) {
      return 1;
    }
    return 0;
  }

  /** 绝对距离校准是对应运动组的权威位置；同帧命中时停止 action，避免校准后继续积分漂移。 */
  private stopDistanceCalibratedActions(directions: Map<string, number>, distanceValues: Map<string, number>): void {
    distanceValues.forEach((_value, key) => directions.set(key, 0));
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
      const groups = Object.entries(motion)
        .map(([key, group]) => {
          const useStackerTrackLimit = isStacker && this.isStackerTravelMotionDefinition(key, group);
          return this.createRuntimeMotionGroup(
            key,
            target.root,
            group,
            [],
            group.axis,
            [],
            /$a/,
            fixedNodeNames,
            useStackerTrackLimit ? fixedNodeNames : [],
            false,
            useStackerTrackLimit,
            isStacker && this.isStackerForkMotionDefinition(key, group)
          );
        })
        .filter((group) => group.fields.length > 0 && (group.target === "root" || group.nodes.length > 0));
      if (isStacker && !this.hasStackerForkActionMotionGroup(groups)) {
        this.appendStackerForkActionMotionGroup(groups, target.root, fixedNodeNames);
      }
      return groups;
    }

    if (!isStacker) {
      return [];
    }

    const groups = Object.values(legacyStackerGroups).filter((group) => group.fields.length > 0 && (group.target === "root" || group.nodes.length > 0));
    if (!this.hasStackerForkActionMotionGroup(groups)) {
      const fixedNodeNames = target.dataDriven?.fixedNodes?.length ? target.dataDriven.fixedNodes : STACKER_TRACK_NODE_NAMES;
      this.appendStackerForkActionMotionGroup(groups, target.root, fixedNodeNames);
    }
    return groups;
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
        useLegacyFallback,
        true,
        false
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
        useLegacyFallback,
        false,
        false
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
        useLegacyFallback,
        false,
        true
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
        useLegacyFallback,
        false,
        false
      )
    };
  }

  /** 缺少模型包货叉动作组时，为 Stacker 追加协议兼容的伸缩动作组。 */
  private appendStackerForkActionMotionGroup(groups: RuntimeMotionGroup[], root: TransformNode, fixedNodeNames: string[]): void {
    const group = this.createStackerForkActionMotionGroup(root, fixedNodeNames);
    if (group.nodes.length > 0) {
      groups.push(group);
    }
  }

  /** 创建 Stacker 默认货叉伸缩动作组，兼容现场 front/back_forkAction 归一后的标准字段。 */
  private createStackerForkActionMotionGroup(root: TransformNode, fixedNodeNames: string[]): RuntimeMotionGroup {
    const group: ModelDataDrivenMotionGroupDefinition = {
      fields: STACKER_FORK_ACTION_FIELDS,
      axis: "x",
      nodes: STACKER_FORK_NODE_NAMES,
      valueMode: "action",
      speed: DEFAULT_STACKER_FORK_ACTION_SPEED,
      actionMap: Object.fromEntries(STACKER_FORK_ACTION_MAP_ENTRIES),
      fallbackPattern: STACKER_FORK_FALLBACK_PATTERN_TEXT,
      limits: {
        min: -DEFAULT_STACKER_FORK_EXTENSION_LIMIT,
        max: DEFAULT_STACKER_FORK_EXTENSION_LIMIT
      }
    };
    return this.createRuntimeMotionGroup(
      "forkAction",
      root,
      group,
      [],
      "x",
      STACKER_FORK_NODE_NAMES,
      STACKER_FORK_FALLBACK_PATTERN,
      fixedNodeNames,
      [],
      false,
      false,
      true
    );
  }

  /** 判断是否已有可消费标准货叉动作字段的 action 组。 */
  private hasStackerForkActionMotionGroup(groups: RuntimeMotionGroup[]): boolean {
    return groups.some(
      (group) =>
        group.valueMode === "action" &&
        group.kind === "translate" &&
        group.target === "nodes" &&
        group.fields.some((field) => this.isStackerForkActionField(field))
    );
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
    useLegacyFallback: boolean,
    allowTrackBoundsLimitFallback: boolean,
    forceBidirectionalForkLimit: boolean
  ): RuntimeMotionGroup {
    const targetMode = group?.target ?? "nodes";
    const nodes = targetMode === "root" ? [] : this.findMotionGroupNodes(root, group, fallbackNodeNames, fallbackPattern, fixedNodeNames, useLegacyFallback);
    const limits = this.createRuntimeMotionLimit(
      root,
      nodes,
      group?.axis ?? fallbackAxis,
      group,
      targetMode === "nodes" ? fallbackLimitNodeNames : [],
      targetMode === "nodes" && allowTrackBoundsLimitFallback
    );
    const stackerForkMaxExtension = forceBidirectionalForkLimit ? this.readStackerForkMaxExtensionFromModelPackage(root) : undefined;
    return {
      key,
      kind: group?.kind ?? "translate",
      fields: group?.fields?.length ? group.fields : useLegacyFallback ? fallbackFields : [],
      axis: group?.axis ?? fallbackAxis,
      nodes,
      valueMode: group?.valueMode ?? "target",
      actionMap: this.createRuntimeActionMap(key, group),
      target: targetMode,
      speed: group?.speed,
      limits: forceBidirectionalForkLimit ? this.createBidirectionalStackerForkMotionLimit(limits, stackerForkMaxExtension) : limits,
      stackerForkMaxExtension
    };
  }

  /** Stacker 货叉可向左右两侧伸出，参数化 forkLength 优先作为 -max..max 的最大行程。 */
  private createBidirectionalStackerForkMotionLimit(
    limit: RuntimeMotionLimit | undefined,
    configuredMaxExtension: number | undefined
  ): RuntimeMotionLimit {
    const fallbackTravel = Math.max(Math.abs(limit?.min ?? 0), Math.abs(limit?.max ?? 0), DEFAULT_STACKER_FORK_EXTENSION_LIMIT);
    const travel =
      configuredMaxExtension !== undefined && Number.isFinite(configuredMaxExtension) && configuredMaxExtension > 0 ? configuredMaxExtension : fallbackTravel;
    return {
      min: -travel,
      max: travel,
      blockerNodes: limit?.blockerNodes ?? [],
      clearance: limit?.clearance ?? 0
    };
  }

  /** 从模型包实例参数读取 Stacker 货叉最大伸出长度，兼容旧场景包装值和脚本 metadata。 */
  private readStackerForkMaxExtensionFromModelPackage(root: TransformNode): number | undefined {
    const metadata = this.isRecord(root.metadata) ? root.metadata : {};
    const editorMetadata = this.isRecord(metadata.editor) ? metadata.editor : {};
    const instance = this.isRecord(editorMetadata.modelPackageInstance) ? editorMetadata.modelPackageInstance : {};
    const values = this.isRecord(instance.values) ? instance.values : {};
    const instanceValue = this.readStackerForkMaxExtensionFromValues(values);
    if (instanceValue !== undefined) {
      return instanceValue;
    }

    const scripts = Array.isArray(metadata.scripts) ? metadata.scripts : [];
    for (const script of scripts) {
      const scriptRecord = this.isRecord(script) ? script : {};
      const scriptValues = this.isRecord(scriptRecord.values) ? scriptRecord.values : {};
      const scriptValue =
        this.readStackerForkMaxExtensionFromValues(scriptValues) ??
        this.readStackerForkMaxExtensionFromScriptFields(scriptRecord, scriptValues);
      if (scriptValue !== undefined) {
        return scriptValue;
      }
    }
    return undefined;
  }

  /** 从参数值字典读取 Stacker 货叉长度，兼容英文键、旧下划线键和中文键。 */
  private readStackerForkMaxExtensionFromValues(values: Record<string, unknown>): number | undefined {
    for (const [key, value] of Object.entries(values)) {
      if (!this.isStackerForkLengthParameterName(key)) {
        continue;
      }

      const parameterValue = this.readPositiveNumberParameter(value);
      if (parameterValue !== undefined) {
        return parameterValue;
      }
    }
    return undefined;
  }

  /** 从脚本字段声明兜底读取货叉长度默认值，避免旧场景缺少 values 时退回固定默认行程。 */
  private readStackerForkMaxExtensionFromScriptFields(script: Record<string, unknown>, values: Record<string, unknown>): number | undefined {
    const fields = Array.isArray(script.fields) ? script.fields : [];
    for (const field of fields) {
      const fieldRecord = this.isRecord(field) ? field : {};
      if (![fieldRecord.key, fieldRecord.propertyKey, fieldRecord.label].some((name) => this.isStackerForkLengthParameterName(name))) {
        continue;
      }

      for (const key of [fieldRecord.key, fieldRecord.propertyKey]) {
        if (typeof key !== "string") {
          continue;
        }

        const value = this.readPositiveNumberParameter(values[key]);
        if (value !== undefined) {
          return value;
        }
      }

      const fieldDefaultValue = this.readPositiveNumberParameter(fieldRecord.defaultValue);
      if (fieldDefaultValue !== undefined) {
        return fieldDefaultValue;
      }

      const configuration = this.isRecord(fieldRecord.configuration) ? fieldRecord.configuration : {};
      const configurationDefaultValue = this.readPositiveNumberParameter(configuration.defaultValue);
      if (configurationDefaultValue !== undefined) {
        return configurationDefaultValue;
      }
    }
    return undefined;
  }

  /** 判断字段名是否表达 Stacker 参数面板中的货叉长度。 */
  private isStackerForkLengthParameterName(value: unknown): boolean {
    if (typeof value !== "string") {
      return false;
    }

    const normalizedValue = this.compactProtocolFieldName(value);
    return STACKER_FORK_LENGTH_PARAMETER_NAMES.some((name) => this.compactProtocolFieldName(name) === normalizedValue);
  }

  /** 读取参数面板中的正数值，支持裸数字、字符串数字和 { value/currentValue/defaultValue } 包装。 */
  private readPositiveNumberParameter(value: unknown): number | undefined {
    const numericValue = this.parseFiniteNumber(this.unwrapParameterValue(value));
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined;
  }

  /** 解开历史模型包参数包装，避免旧场景参数无法参与运行态行程计算。 */
  private unwrapParameterValue(value: unknown): unknown {
    let current = value;
    for (let depth = 0; depth < 4 && this.isRecord(current); depth += 1) {
      if ("value" in current) {
        current = current.value;
        continue;
      }
      if ("currentValue" in current) {
        current = current.currentValue;
        continue;
      }
      if ("defaultValue" in current) {
        current = current.defaultValue;
        continue;
      }
      break;
    }
    return current;
  }

  /** 创建 action 模式的协议枚举表，模型脚本可覆盖默认 0/1/2 方向。 */
  private createRuntimeActionMap(key: string, group: ModelDataDrivenMotionGroupDefinition | undefined): Map<string, number> {
    const map = new Map<string, number>(DEFAULT_ACTION_MAP_ENTRIES);
    if (this.isStackerForkMotionDefinition(key, group)) {
      STACKER_FORK_ACTION_MAP_ENTRIES.forEach(([actionKey, direction]) => map.set(actionKey, direction));
    }
    Object.entries(group?.actionMap ?? {}).forEach(([key, value]) => {
      if (Number.isFinite(value)) {
        map.set(key, value);
      }
    });
    return map;
  }

  /** 判断运动组是否表达 Stacker 货叉伸缩，用于补齐 3/4 动作枚举。 */
  private isStackerForkMotionDefinition(key: string, group: ModelDataDrivenMotionGroupDefinition | undefined): boolean {
    const normalizedKey = key.toLowerCase();
    return (
      (normalizedKey.includes("fork") && !normalizedKey.includes("side")) ||
      Boolean(group?.fields?.some((field) => this.isStackerForkActionField(field)))
    );
  }

  /** 判断模型包声明的运动组是否是 Stacker 行走组，兼容自定义组名但复用标准行走字段。 */
  private isStackerTravelMotionDefinition(key: string, group: ModelDataDrivenMotionGroupDefinition): boolean {
    if ((group.kind ?? "translate") !== "translate") {
      return false;
    }
    return key === "travel" || (group.fields ?? []).some((field) => this.isStackerTravelField(field));
  }

  /** 判断运行时运动组是否是 Stacker 行走组，用于 root 位姿约束复用同一条轨道边界。 */
  private isStackerTravelRuntimeMotionGroup(group: RuntimeMotionGroup): boolean {
    return group.kind === "translate" && (group.key === "travel" || group.fields.some((field) => this.isStackerTravelField(field)));
  }

  /** 判断点位字段是否表达 Stacker 沿轨道行走。 */
  private isStackerTravelField(field: string): boolean {
    return STACKER_TRAVEL_LIMIT_FIELDS.has(field.trim().toLowerCase());
  }

  /** 判断运行时运动组是否是 Stacker 载台升降组，用于 front/back_distanceY 绝对校准。 */
  private isStackerLiftRuntimeMotionGroup(group: RuntimeMotionGroup): boolean {
    return group.kind === "translate" && (group.key === "lift" || group.fields.some((field) => this.isStackerLiftField(field)));
  }

  /** 判断点位字段是否表达 Stacker 载台升降。 */
  private isStackerLiftField(field: string): boolean {
    return STACKER_LIFT_LIMIT_FIELDS.has(field.trim().toLowerCase());
  }

  /** 判断运行时运动组是否是 Stacker 货叉伸缩组，用于距离、位置和动作共同驱动同一逻辑值。 */
  private isStackerForkRuntimeMotionGroup(group: RuntimeMotionGroup): boolean {
    const key = group.key.toLowerCase();
    return (
      group.kind === "translate" &&
      group.target === "nodes" &&
      !key.includes("side") &&
      ((key.includes("fork") && group.nodes.length > 0) || group.fields.some((field) => this.isStackerForkActionField(field)))
    );
  }

  /** 判断点位字段是否表达 Stacker 货叉伸缩动作。 */
  private isStackerForkActionField(field: string): boolean {
    const normalizedField = this.normalizeMatchValue(field);
    return STACKER_FORK_ACTION_FIELDS.some((item) => this.normalizeMatchValue(item) === normalizedField);
  }

  /** 为 Stacker 整机 twinspawn 创建水平轨道约束，只限制 X/Z 平面，不改变高度。 */
  private createStackerTrackConstraint(root: TransformNode, groups: RuntimeMotionGroup[]): StackerTrackConstraint | null {
    const travelGroup = groups.find((group) => this.isStackerTravelRuntimeMotionGroup(group));
    const limit = travelGroup?.limits;
    if (!travelGroup || !limit || (limit.min === undefined && limit.max === undefined)) {
      return null;
    }

    const horizontalAxis = this.normalizeHorizontalDirection(this.modelLocalAxisToWorldDirection(root, travelGroup.axis));
    if (!horizontalAxis) {
      return null;
    }

    const horizontalNormal = new Vector3(-horizontalAxis.z, 0, horizontalAxis.x);
    const rootPosition = root.position.clone();
    return {
      horizontalAxis,
      horizontalNormal,
      baseAxisProjection: Vector3.Dot(rootPosition, horizontalAxis),
      baseNormalProjection: Vector3.Dot(rootPosition, horizontalNormal),
      minDelta: limit.min,
      maxDelta: limit.max
    };
  }

  /** 提取水平面方向并归一化，避免轨道保护误改垂直高度。 */
  private normalizeHorizontalDirection(direction: Vector3): Vector3 | null {
    const horizontal = new Vector3(direction.x, 0, direction.z);
    const lengthSquared = horizontal.lengthSquared();
    if (lengthSquared <= 1e-12) {
      return null;
    }
    return horizontal.scale(1 / Math.sqrt(lengthSquared));
  }

  /** 创建运动组行程限制，显式 min/max 优先，缺省端点由防撞或固定节点包围盒推导。 */
  private createRuntimeMotionLimit(
    root: TransformNode,
    movingNodes: TransformNode[],
    axis: ModelDataDrivenAxis,
    group: ModelDataDrivenMotionGroupDefinition | undefined,
    fallbackLimitNodeNames: string[],
    allowTrackBoundsFallback: boolean
  ): RuntimeMotionLimit | undefined {
    const config = group?.limits;
    const blockerNodes = this.findMotionLimitBlockerNodes(root, config, fallbackLimitNodeNames);
    const clearance = this.readOptionalNonNegativeNumber(config?.clearance, 0);
    const canUseTrackBoundsFallback = allowTrackBoundsFallback && !config?.blockerNodes?.length && fallbackLimitNodeNames.length > 0;
    let min = typeof config?.min === "number" && Number.isFinite(config.min) ? config.min : undefined;
    let max = typeof config?.max === "number" && Number.isFinite(config.max) ? config.max : undefined;
    if ((min === undefined || max === undefined) && blockerNodes.length > 0 && movingNodes.length > 0) {
      const worldAxis = this.modelLocalAxisToWorldDirection(root, axis);
      const movingBounds = this.projectNodesBoundsOnAxis(movingNodes, worldAxis);
      const blockerBounds =
        this.projectMotionLimitInnerBounds(blockerNodes, worldAxis) ??
        (canUseTrackBoundsFallback ? this.projectNodesBoundsOnAxis(blockerNodes, worldAxis) : null);
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

  /** 参数化和编辑器运行态克隆保留源节点名，辊筒动画组需要把同源克隆一并纳入驱动。 */
  private isGeneratedMotionCloneFromExactNode(node: TransformNode, exactNameSet: Set<string>): boolean {
    const metadata = this.isRecord(node.metadata) ? node.metadata : {};
    const sourceNodeName = typeof metadata.sourceNodeName === "string" ? metadata.sourceNodeName : "";
    if (!exactNameSet.has(sourceNodeName)) {
      return false;
    }

    if (metadata.generatedByMeshVertexModifyRuntime === true) {
      return metadata.reason === "rollerDensity";
    }

    if (metadata.generatedByParametricRuntime !== true || !/^GT\d+$/i.test(sourceNodeName)) {
      return false;
    }

    return metadata.reason === "roller" || metadata.reason === "rollerDensity";
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
    return this.dedupeTransformNodes(groups.filter((group) => this.shouldApplyMotionGroupToNodes(group)).flatMap((group) => group.nodes));
  }

  /** 判断运动组是否应该真实写入模型节点变换。 */
  private shouldApplyMotionGroupToNodes(group: RuntimeMotionGroup): boolean {
    return group.target === "nodes" && group.nodeTransformDisabled !== true;
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
