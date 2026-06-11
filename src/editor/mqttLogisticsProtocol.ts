export const LOGISTICS_MQTT_TWINSPAWN_TOPIC = "dt/factory/logistics/+/+/twinspawn";
export const LOGISTICS_MQTT_DATA_DRIVEN_TOPIC = "dt/factory/logistics/+/+/twindatadriven/#";
export const LEGACY_LOGISTICS_MQTT_JOINT_TOPIC = "dt/factory/logistics/+/+/twindatadriven/joint";
export const DEFAULT_LOGISTICS_MQTT_DATA_CHANNEL = `${LOGISTICS_MQTT_TWINSPAWN_TOPIC}\n${LOGISTICS_MQTT_DATA_DRIVEN_TOPIC}`;

/** 中鼎物流 MQTT 规范的 topic 路径元数据。 */
export interface LogisticsMqttTopicMetadata {
  topic: string;
  devType: string;
  devId: string;
  msgFlag: string;
  subRes: string;
}

/** 解析 dt/factory/logistics/{devType}/{devId}/{msgFlag}/{subRes} 结构。 */
export function parseLogisticsMqttTopic(topic: string | undefined): LogisticsMqttTopicMetadata | null {
  const segments = topic?.trim().split("/").filter(Boolean) ?? [];
  if (segments.length < 6) {
    return null;
  }

  const [dt, factory, logistics, devType, devId, msgFlag, ...subResSegments] = segments;
  if (dt !== "dt" || factory !== "factory" || logistics !== "logistics" || !devType || !devId || !msgFlag) {
    return null;
  }

  return {
    topic: segments.join("/"),
    devType,
    devId,
    msgFlag,
    subRes: subResSegments.join("/")
  };
}

/** 判断当前 MQTT Topic 是否仍是旧自动默认值，可安全升级为规范默认订阅。 */
export function isLegacyDefaultLogisticsMqttChannel(channel: string): boolean {
  const topics = parseTopicList(channel);
  if (topics.length === 1) {
    return topics[0] === LEGACY_LOGISTICS_MQTT_JOINT_TOPIC;
  }

  return (
    topics.length === 2 &&
    topics.includes(LOGISTICS_MQTT_TWINSPAWN_TOPIC) &&
    topics.includes(LOGISTICS_MQTT_DATA_DRIVEN_TOPIC)
  );
}

/** 展示多 Topic 默认订阅时压成一行，避免属性面板摘要过高。 */
export function formatLogisticsMqttChannelSummary(channel: string): string {
  return parseTopicList(channel).join("、");
}

/** 从规范 topic 给业务帧补设备号和 topic 上下文，不覆盖 payload 自带字段。 */
export function applyLogisticsMqttFrameDefaults(frame: Record<string, unknown>, metadata: LogisticsMqttTopicMetadata | null): void {
  if (metadata) {
    if (frame.e === undefined) {
      frame.e = metadata.devId;
    }
    if (frame.devId === undefined) {
      frame.devId = metadata.devId;
    }
    if (frame.devType === undefined) {
      frame.devType = metadata.devType;
    }
    if (frame.mqttTopic === undefined) {
      frame.mqttTopic = metadata.topic;
    }
    if (frame.msgFlag === undefined) {
      frame.msgFlag = metadata.msgFlag;
    }
    if (metadata.subRes && frame.subRes === undefined) {
      frame.subRes = metadata.subRes;
    }
  }

  const pointName = readStringValue(frame.p);
  if (!pointName || frame.v === undefined) {
    return;
  }

  if (frame[pointName] === undefined) {
    frame[pointName] = frame.v;
  }
  if (pointName === "payload") {
    if (frame.cargo === undefined) {
      frame.cargo = frame.v;
    }
    if (frame.cargoId === undefined) {
      frame.cargoId = frame.v;
    }
  }
}

/** 把字符串或数字字段读成规范字段名，避免对象和空白值参与归一化。 */
function readStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/** 按编辑器约定解析换行或逗号分隔的 topic 列表。 */
function parseTopicList(channel: string): string[] {
  return channel
    .split(/\r?\n|,/)
    .map((topic) => topic.trim())
    .filter(Boolean);
}
