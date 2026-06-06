import type { PoiConfigSnapshot, PoiKind, Vector3Snapshot } from "../types/editor";

/** 当前 POI 库面向业务展示的 11 类组件，不包含旧版兼容类型。 */
export type BusinessPoiKind = Exclude<PoiKind, "marker" | "info" | "warning" | "camera" | "device" | "label">;

/** POI 缩略图和三维外观共用的基础图形类型。 */
export type PoiVisualShape = "trigger" | "sender" | "receiver" | "chart" | "panel" | "roam" | "alarm" | "spawner" | "group" | "inspection" | "path";

/** POI catalog 条目是 UI、拖拽校验和引擎创建的唯一数据源。 */
export interface PoiCatalogItem {
  kind: BusinessPoiKind;
  title: string;
  description: string;
  keywords: string[];
  iconKey: string;
  colorHex: string;
  emissiveHex: string;
  shape: PoiVisualShape;
  defaultConfig: Omit<PoiConfigSnapshot, "version" | "kind" | "title" | "description" | "colorHex">;
}

/** 默认路径点列按米保存，路径 POI 拖入后可直接看到运行闭环。 */
const DEFAULT_PATH_POINTS: Vector3Snapshot[] = [
  { x: -1.5, y: 0, z: -1.5 },
  { x: 1.5, y: 0, z: -1.5 },
  { x: 1.5, y: 0, z: 1.5 }
];

/** 生成 POI 默认配置的公共字段，避免每个 catalog 条目重复声明。 */
function createBaseConfig(eventName: string): Omit<PoiConfigSnapshot, "version" | "kind" | "title" | "description" | "colorHex"> {
  return {
    enabled: true,
    eventName,
    triggerMode: "click",
    triggerIntervalMs: 3000,
    dataField: "",
    conditionOperator: "exists",
    conditionValue: "",
    outputType: "internal",
    outputEventName: eventName,
    websocketEndpoint: "",
    mqttTopic: "",
    bindingField: "deviceId",
    displayField: "value",
    statusField: "status",
    alarmField: "alarm",
    alarmLevel: "warning",
    alarmMessage: "",
    assetId: "",
    reuseKey: eventName,
    maxInstances: 100,
    targetSelector: "",
    speedMetersPerSecond: 1,
    progress: 0,
    loop: true,
    dwellMs: 1200,
    pathPoints: DEFAULT_PATH_POINTS
  };
}

/** 截图中的 11 类 POI 组件定义，后续扩展只需在这里追加配置。 */
export const POI_CATALOG_ITEMS: PoiCatalogItem[] = [
  {
    kind: "eventTrigger",
    title: "事件触发器",
    description: "点击、数据条件或定时触发内部事件",
    keywords: ["event", "trigger", "事件", "触发", "点击", "定时"],
    iconKey: "zap",
    colorHex: "#33a4ff",
    emissiveHex: "#6ac4ff",
    shape: "trigger",
    defaultConfig: createBaseConfig("poi.event.trigger")
  },
  {
    kind: "sender",
    title: "发送器",
    description: "订阅内部事件并输出到内部、WebSocket 或 MQTT",
    keywords: ["sender", "emit", "websocket", "mqtt", "发送", "发布"],
    iconKey: "send",
    colorHex: "#4f8cff",
    emissiveHex: "#82aaff",
    shape: "sender",
    defaultConfig: {
      ...createBaseConfig("poi.sender"),
      outputEventName: "poi.sender.forward"
    }
  },
  {
    kind: "receiver",
    title: "回收器",
    description: "按事件或数据条件清理运行态生成物",
    keywords: ["receiver", "recycle", "回收", "清理", "删除"],
    iconKey: "archive-restore",
    colorHex: "#39b6c8",
    emissiveHex: "#69d7e6",
    shape: "receiver",
    defaultConfig: createBaseConfig("poi.receiver.recycle")
  },
  {
    kind: "chartMarker",
    title: "图表立标",
    description: "绑定字段后在场景中显示最新值和状态色",
    keywords: ["chart", "marker", "图表", "立标", "数值"],
    iconKey: "bar-chart-3",
    colorHex: "#5fc26e",
    emissiveHex: "#86e295",
    shape: "chart",
    defaultConfig: {
      ...createBaseConfig("poi.chart.marker"),
      displayField: "value",
      statusField: "status"
    }
  },
  {
    kind: "chartPanel",
    title: "图表面板",
    description: "显示字段值、状态和简单趋势面板",
    keywords: ["panel", "trend", "图表", "面板", "趋势"],
    iconKey: "line-chart",
    colorHex: "#2ec6a6",
    emissiveHex: "#65dfc6",
    shape: "panel",
    defaultConfig: createBaseConfig("poi.chart.panel")
  },
  {
    kind: "manualRoam",
    title: "手动漫游",
    description: "运行态启用相机漫游，退出后恢复编辑相机",
    keywords: ["roam", "camera", "漫游", "相机", "手动"],
    iconKey: "navigation",
    colorHex: "#b58cff",
    emissiveHex: "#c9a8ff",
    shape: "roam",
    defaultConfig: createBaseConfig("poi.manual.roam")
  },
  {
    kind: "alarmManager",
    title: "报警管理器",
    description: "按字段匹配报警级别和消息并驱动闪烁",
    keywords: ["alarm", "warning", "报警", "告警", "闪烁"],
    iconKey: "triangle-alert",
    colorHex: "#ff5f57",
    emissiveHex: "#ff8b7f",
    shape: "alarm",
    defaultConfig: {
      ...createBaseConfig("poi.alarm"),
      alarmField: "alarm",
      alarmLevel: "warning",
      alarmMessage: "报警已激活"
    }
  },
  {
    kind: "modelSpawner",
    title: "模型产生器",
    description: "按资产 id 和 reuseKey 生成或复用模型",
    keywords: ["model", "spawn", "模型", "产生", "实例"],
    iconKey: "package-plus",
    colorHex: "#f0a94a",
    emissiveHex: "#ffc56c",
    shape: "spawner",
    defaultConfig: createBaseConfig("poi.model.spawn")
  },
  {
    kind: "groupEventBinding",
    title: "群组事件绑定",
    description: "把事件级联给 group 下的业务根节点",
    keywords: ["group", "binding", "群组", "绑定", "级联"],
    iconKey: "git-branch",
    colorHex: "#d2b84f",
    emissiveHex: "#eedb75",
    shape: "group",
    defaultConfig: createBaseConfig("poi.group.binding")
  },
  {
    kind: "autoInspection",
    title: "自动巡检",
    description: "按路径或航点顺序移动相机并支持循环",
    keywords: ["inspection", "巡检", "路径", "航点", "循环"],
    iconKey: "route",
    colorHex: "#8ec85a",
    emissiveHex: "#b3ea7a",
    shape: "inspection",
    defaultConfig: createBaseConfig("poi.auto.inspection")
  },
  {
    kind: "path",
    title: "路径",
    description: "保存米制点列并渲染路径线",
    keywords: ["path", "route", "路径", "点列", "跟随"],
    iconKey: "waypoints",
    colorHex: "#56b9ff",
    emissiveHex: "#85d0ff",
    shape: "path",
    defaultConfig: createBaseConfig("poi.path")
  }
];

/** 旧版 POI 类型恢复时映射到最接近的新业务组件。 */
export const LEGACY_POI_KIND_MAP: Record<Extract<PoiKind, "marker" | "info" | "warning" | "camera" | "device" | "label">, BusinessPoiKind> = {
  marker: "eventTrigger",
  info: "chartMarker",
  warning: "alarmManager",
  camera: "manualRoam",
  device: "modelSpawner",
  label: "chartPanel"
};

/** 判断字符串是否是当前 catalog 支持的业务 POI 类型。 */
export function isBusinessPoiKind(value: string): value is BusinessPoiKind {
  return POI_CATALOG_ITEMS.some((item) => item.kind === value);
}

/** 判断字符串是否可作为 POI 拖拽或旧场景恢复类型。 */
export function isPoiKind(value: string): value is PoiKind {
  return isBusinessPoiKind(value) || Object.prototype.hasOwnProperty.call(LEGACY_POI_KIND_MAP, value);
}

/** 把旧版 POI 类型转换为新业务类型，其它未知值回退事件触发器。 */
export function normalizePoiKind(kind: PoiKind | string | undefined): BusinessPoiKind {
  if (kind && isBusinessPoiKind(kind)) {
    return kind;
  }

  if (kind && Object.prototype.hasOwnProperty.call(LEGACY_POI_KIND_MAP, kind)) {
    return LEGACY_POI_KIND_MAP[kind as keyof typeof LEGACY_POI_KIND_MAP];
  }

  return "eventTrigger";
}

/** 按类型读取 POI catalog 条目，旧类型会先完成映射。 */
export function getPoiCatalogItem(kind: PoiKind | string | undefined): PoiCatalogItem {
  const normalizedKind = normalizePoiKind(kind);
  return POI_CATALOG_ITEMS.find((item) => item.kind === normalizedKind) ?? POI_CATALOG_ITEMS[0];
}

/** 生成可保存的 POI 默认配置，调用方可以覆盖部分字段。 */
export function createDefaultPoiConfig(kind: PoiKind | string | undefined, overrides: Partial<PoiConfigSnapshot> = {}): PoiConfigSnapshot {
  const item = getPoiCatalogItem(kind);
  return {
    version: 1,
    kind: item.kind,
    title: item.title,
    description: item.description,
    colorHex: item.colorHex,
    ...item.defaultConfig,
    ...overrides,
    pathPoints: clonePathPoints(overrides.pathPoints ?? item.defaultConfig.pathPoints)
  };
}

/** 合并历史 metadata 和默认配置，确保旧场景打开后 Inspector 字段完整。 */
export function normalizePoiConfig(kind: PoiKind | string | undefined, stored: unknown): PoiConfigSnapshot {
  const storedConfig = isRecord(stored) ? stored : {};
  const configKind = typeof storedConfig.kind === "string" ? storedConfig.kind : kind;
  return createDefaultPoiConfig(configKind, {
    ...storedConfig,
    kind: normalizePoiKind(configKind),
    pathPoints: normalizePathPoints(storedConfig.pathPoints)
  } as Partial<PoiConfigSnapshot>);
}

/** 判断未知值是否是普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** 复制路径点列，避免 catalog 默认值被运行态误改。 */
function clonePathPoints(points: Vector3Snapshot[]): Vector3Snapshot[] {
  return points.map((point) => ({ x: point.x, y: point.y, z: point.z }));
}

/** 从 metadata 中恢复合法路径点列，非法数据回退默认路径。 */
function normalizePathPoints(value: unknown): Vector3Snapshot[] {
  if (!Array.isArray(value)) {
    return clonePathPoints(DEFAULT_PATH_POINTS);
  }

  const points = value
    .map((point) => (isRecord(point) ? { x: Number(point.x), y: Number(point.y), z: Number(point.z) } : null))
    .filter((point): point is Vector3Snapshot => Boolean(point && [point.x, point.y, point.z].every(Number.isFinite)));
  return points.length >= 2 ? points : clonePathPoints(DEFAULT_PATH_POINTS);
}
