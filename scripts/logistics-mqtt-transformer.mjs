import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.join(__dirname, "logistics-mqtt-transformer.config.json");
const MQTT_KEEP_ALIVE_SECONDS = 30;
const ONCE_MQTT_WAIT_MS = 3000;
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_OUTPUT_RECORDS = 200;
const DEFAULT_SAMPLE_PAYLOAD = {
  data: [
    { e: "DDJ2", p: "deviceCode", v: "1" },
    { e: "DDJ2", p: "front_command", v: 5 },
    { e: "DDJ2", p: "front_containerCode", v: "BOX001" },
    { e: "DDJ2", p: "movement_x", v: 0 },
    { e: "DDJ2", p: "distance_x", v: 12.8285 },
    { e: "DDJ2", p: "movement_y", v: 0 },
    { e: "DDJ2", p: "distance_y", v: 2.5008 },
    { e: "DDJ2", p: "front_movement_z", v: 0 },
    { e: "DDJ2", p: "front_distance_z", v: 0.55 },
    { e: "DDJ2", p: "to_z", v: 1 },
    { e: "DDJ2", p: "to_x", v: 9 },
    { e: "DDJ2", p: "to_y", v: 3 }
  ],
  ts: "2026-06-26T10:10:46.400+08:00"
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const runtime = {
  options: parseArgs(process.argv.slice(2)),
  config: null,
  sourceSocket: null,
  targetSocket: null,
  sourceReady: false,
  targetReady: false,
  sourceReadBuffer: Buffer.alloc(0),
  targetReadBuffer: Buffer.alloc(0),
  sourceReconnectTimer: null,
  targetReconnectTimer: null,
  onceFallbackTimer: null,
  webSocketServer: null,
  webSocketClients: new Set(),
  stateByDevice: new Map(),
  nextPacketId: 1,
  isShuttingDown: false
};

/** 解析命令行参数，保持脚本与现有 demo 脚本一致的轻量 CLI 风格。 */
function parseArgs(argv) {
  const options = {
    configPath: process.env.LOGISTICS_TRANSFORMER_CONFIG ?? DEFAULT_CONFIG_PATH,
    dryRun: process.env.LOGISTICS_TRANSFORMER_DRY_RUN === "1",
    once: process.env.LOGISTICS_TRANSFORMER_ONCE === "1",
    noMqtt: process.env.LOGISTICS_TRANSFORMER_NO_MQTT === "1",
    noWs: process.env.LOGISTICS_TRANSFORMER_NO_WS === "1",
    samplePath: process.env.LOGISTICS_TRANSFORMER_SAMPLE ?? ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--once") {
      options.once = true;
    } else if (arg === "--no-mqtt") {
      options.noMqtt = true;
    } else if (arg === "--no-ws") {
      options.noWs = true;
    } else if (arg === "--config" && argv[index + 1]) {
      options.configPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = path.resolve(arg.slice("--config=".length));
    } else if (arg === "--sample" && argv[index + 1]) {
      options.samplePath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--sample=")) {
      options.samplePath = path.resolve(arg.slice("--sample=".length));
    }
  }

  return options;
}

/** 读取 JSON 配置文件，失败时输出明确文件路径，方便现场联调定位。 */
function loadConfig(configPath) {
  let text;
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    throw new Error(`读取配置失败：${configPath}，${formatError(error)}`);
  }

  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`配置不是合法 JSON：${configPath}，${formatError(error)}`);
  }

  validateConfig(config, configPath);
  applyEnvOverrides(config);
  return config;
}

/** 校验转换器运行必需的配置字段，不引入额外 schema 依赖。 */
function validateConfig(config, configPath) {
  if (!isRecord(config)) {
    throw new Error(`配置根节点必须是对象：${configPath}`);
  }
  if (!isRecord(config.connections?.sourceMqtt) || !isRecord(config.connections?.targetMqtt)) {
    throw new Error("配置缺少 connections.sourceMqtt 或 connections.targetMqtt。 ");
  }
  if (!Array.isArray(config.routing?.sourceTopics) || config.routing.sourceTopics.length === 0) {
    throw new Error("配置 routing.sourceTopics 必须是非空数组。 ");
  }
  if (!isRecord(config.profiles)) {
    throw new Error("配置 profiles 必须是对象。 ");
  }
  if (!Array.isArray(config.devices)) {
    throw new Error("配置 devices 必须是数组。 ");
  }
  config.devices.forEach((device, index) => {
    if (!isRecord(device) || !readNonEmptyString(device.deviceId) || !readNonEmptyString(device.profile)) {
      throw new Error(`devices[${index}] 必须包含 deviceId 和 profile。`);
    }
    if (!config.profiles[device.profile]) {
      throw new Error(`devices[${index}] 引用了不存在的 profile：${device.profile}`);
    }
  });
  [config.connections.sourceMqtt, config.connections.targetMqtt, config.connections.webSocket].filter(Boolean).forEach((connection) => {
    if (connection.port !== undefined && !isValidPort(connection.port)) {
      throw new Error(`连接端口非法：${connection.port}`);
    }
  });
}

/** 使用环境变量覆盖常用连接项，方便现场不改配置文件临时切换 broker。 */
function applyEnvOverrides(config) {
  const source = config.connections.sourceMqtt;
  const target = config.connections.targetMqtt;
  const ws = config.connections.webSocket;
  source.host = process.env.LOGISTICS_SOURCE_MQTT_HOST ?? source.host;
  source.port = readNumberEnv("LOGISTICS_SOURCE_MQTT_PORT", source.port, 1);
  target.host = process.env.LOGISTICS_TARGET_MQTT_HOST ?? target.host;
  target.port = readNumberEnv("LOGISTICS_TARGET_MQTT_PORT", target.port, 1);
  if (ws) {
    ws.host = process.env.LOGISTICS_WS_HOST ?? ws.host;
    ws.port = readNumberEnv("LOGISTICS_WS_PORT", ws.port, 1);
    ws.path = normalizeWebSocketPath(process.env.LOGISTICS_WS_PATH ?? ws.path ?? "/logistics-transformer");
  }
}

/** 读取数字环境变量，非法值回退，避免端口变成 NaN。 */
function readNumberEnv(name, fallback, minimum) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

/** 规范化 WebSocket 路径，兼容漏写开头斜杠。 */
function normalizeWebSocketPath(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "/logistics-transformer";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** 从 JSON payload 中提取 data/payload/message 包装内的点位记录。 */
function extractRecords(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(isPointRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ["data", "payload", "message"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isPointRecord);
    }
  }
  return isPointRecord(payload) ? [payload] : [];
}

/** 将点位数组折叠成按设备分组的 frame，便于 profile 统一处理。 */
function recordsToFrames(records, fallbackDeviceId) {
  const frames = new Map();
  records.forEach((record) => {
    const pointName = readNonEmptyString(record.p);
    if (!pointName) {
      return;
    }
    const deviceId = readNonEmptyString(record.e) ?? readNonEmptyString(record.deviceCode) ?? fallbackDeviceId;
    const frameKey = deviceId ?? `__anonymous_${frames.size}`;
    const frame = frames.get(frameKey) ?? { __deviceId: deviceId };
    if (deviceId) {
      frame.e = deviceId;
    }
    if (record.ts !== undefined) {
      frame.ts = record.ts;
    }
    frame[pointName] = record.v;
    frames.set(frameKey, frame);
  });
  return [...frames.values()];
}

/** 解析规范 logistics topic 中的设备类型和设备编号。 */
function parseTopicMetadata(topic) {
  const parts = String(topic ?? "").split("/").filter(Boolean);
  const logisticsIndex = parts.findIndex((part, index) => part === "logistics" && parts[index - 1] === "factory");
  if (logisticsIndex >= 0 && parts.length >= logisticsIndex + 4) {
    return {
      devType: parts[logisticsIndex + 1],
      deviceId: parts[logisticsIndex + 2],
      msgFlag: parts[logisticsIndex + 3],
      subRes: parts[logisticsIndex + 4]
    };
  }
  return null;
}

/** 按 payload 设备号或 topic 设备号查找设备实例。 */
function findDevice(config, deviceId) {
  const normalized = normalizeMatchValue(deviceId);
  return config.devices.find((device) => {
    if (device.enabled === false) {
      return false;
    }
    return [device.deviceId, device.assetCode, device.deviceCode].some((value) => normalizeMatchValue(value) === normalized);
  });
}

/** 合并 profile 与设备覆盖项；覆盖项使用点路径，例如 cargo.defaultCargo。 */
function resolveProfile(config, device) {
  const baseProfile = structuredCloneCompat(config.profiles[device.profile]);
  const overrides = isRecord(device.overrides) ? device.overrides : {};
  Object.entries(overrides).forEach(([pathText, value]) => setPath(baseProfile, pathText, value));
  return baseProfile;
}

/** 根据统一模板生成编辑器可订阅的目标 Topic。 */
function buildTargetTopic(config, profile, device) {
  const template = config.routing?.targetTopicTemplate ?? "dt/factory/logistics/{devType}/{deviceId}/twindatadriven/{subRes}";
  const subRes = profile.subRes ?? config.routing?.defaultSubRes ?? "joint";
  return template
    .replaceAll("{devType}", String(profile.devType ?? "device"))
    .replaceAll("{deviceId}", String(device.assetCode ?? device.deviceId))
    .replaceAll("{subRes}", String(subRes));
}

/** 透传 profile 声明的字段，并对距离字段应用比例。 */
function buildPassthroughRecords(frame, profile, deviceId) {
  const fields = Array.isArray(profile.passthroughFields) ? profile.passthroughFields : [];
  const distanceScale = isRecord(profile.distanceScale) ? profile.distanceScale : {};
  return fields
    .filter((fieldName) => frame[fieldName] !== undefined)
    .map((fieldName) => createRecord(deviceId, fieldName, scaleValue(frame[fieldName], distanceScale[fieldName])));
}

/** 从条码、任务号或默认值推导货箱编号。 */
function deriveCargoCode(frame, cargoConfig = {}) {
  for (const fieldName of asArray(cargoConfig.containerFields)) {
    const value = readNonEmptyString(frame[fieldName]);
    if (value) {
      return value;
    }
  }
  for (const fieldName of asArray(cargoConfig.taskFields)) {
    const value = frame[fieldName];
    if (value !== undefined && value !== null && String(value).trim() !== "" && Number(value) !== 0) {
      return `Task${String(value).trim()}`;
    }
  }
  return readNonEmptyString(cargoConfig.defaultCargo);
}

/** 根据 command 完成态的上升沿生成取放货动作，避免同一状态每帧重复触发。 */
function deriveCargoAction(frame, previousFrame, cargoConfig = {}) {
  if (cargoConfig.enabled === false) {
    return "";
  }
  const pickup = detectCommandEdge(frame, previousFrame, asArray(cargoConfig.pickupCommandFields), asArray(cargoConfig.pickupCommandValues), cargoConfig.emitOnRisingEdgeOnly !== false);
  if (pickup) {
    return "pickup";
  }
  const drop = detectCommandEdge(frame, previousFrame, asArray(cargoConfig.dropCommandFields), asArray(cargoConfig.dropCommandValues), cargoConfig.emitOnRisingEdgeOnly !== false);
  return drop ? "drop" : "";
}

/** 判断命令字段是否进入指定状态。 */
function detectCommandEdge(frame, previousFrame, fields, values, risingEdgeOnly) {
  const allowed = new Set(values.map((value) => String(value)));
  return fields.some((fieldName) => {
    const current = frame[fieldName];
    if (!allowed.has(String(current))) {
      return false;
    }
    if (!risingEdgeOnly) {
      return true;
    }
    return String(previousFrame?.[fieldName]) !== String(current);
  });
}

/** 通过 locator map 将 to_z/to_x/to_y 转为场景定位线框资产编号。 */
function deriveLocatorTarget(config, frame, locatorConfig = {}) {
  if (locatorConfig.enabled === false) {
    return "";
  }
  const keyFields = asArray(locatorConfig.keyFields);
  if (keyFields.length === 0 || keyFields.some((fieldName) => frame[fieldName] === undefined || frame[fieldName] === null || String(frame[fieldName]).trim() === "")) {
    return "";
  }
  const key = keyFields.map((fieldName) => String(frame[fieldName]).trim()).join(":");
  const mapName = readNonEmptyString(locatorConfig.mapRef);
  const locatorMap = mapName ? config.maps?.[mapName] : null;
  const mapped = isRecord(locatorMap) ? readNonEmptyString(locatorMap[key]) : "";
  if (mapped) {
    return mapped;
  }
  if (locatorConfig.missingTargetPolicy === "fallback-key") {
    return key.replaceAll(":", "-");
  }
  if (locatorConfig.missingTargetPolicy !== "silent") {
    console.warn(`定位映射缺失：${mapName ?? "<none>"}[${key}]，已跳过 target。`);
  }
  return "";
}

/** 输送线前端有货时补充 payload 绑定，便于编辑器生成或绑定运行态货箱。 */
function deriveConveyorPayload(frame, payloadBindingConfig = {}) {
  if (payloadBindingConfig.enabled === false) {
    return "";
  }
  const signalField = payloadBindingConfig.signalField ?? "signalBits";
  const signalValue = frame[signalField];
  const allowedSignals = new Set(asArray(payloadBindingConfig.frontSignalValues).map((value) => String(value)));
  if (!allowedSignals.has(String(signalValue))) {
    return "";
  }
  for (const fieldName of asArray(payloadBindingConfig.containerFields)) {
    const value = readNonEmptyString(frame[fieldName]);
    if (value) {
      return value;
    }
  }
  for (const fieldName of asArray(payloadBindingConfig.taskFields)) {
    const value = frame[fieldName];
    if (value !== undefined && value !== null && String(value).trim() !== "" && Number(value) !== 0) {
      return `${payloadBindingConfig.taskPrefix ?? "Task"}${String(value).trim()}`;
    }
  }
  return "";
}

/** 转换一条输入 payload，返回按目标 Topic 分组的输出消息。 */
function transformPayload(payload, metadata, config, stateByDevice) {
  const records = extractRecords(payload);
  const fallbackDeviceId = metadata?.deviceId;
  const frames = recordsToFrames(records, fallbackDeviceId);
  const outputs = [];

  frames.forEach((frame) => {
    const deviceId = readNonEmptyString(frame.e) ?? readNonEmptyString(frame.__deviceId) ?? fallbackDeviceId;
    const device = findDevice(config, deviceId);
    if (!device) {
      if (config.routing?.unknownDevicePolicy !== "silent") {
        console.warn(`未配置设备 ${deviceId ?? "<unknown>"}，已跳过。`);
      }
      return;
    }

    const profile = resolveProfile(config, device);
    const outputDeviceId = String(device.assetCode ?? device.deviceId);
    const previousFrame = stateByDevice.get(device.deviceId)?.lastFrame;
    const outputRecords = buildPassthroughRecords(frame, profile, outputDeviceId);
    const cargoAction = deriveCargoAction(frame, previousFrame, profile.cargo);
    if (cargoAction) {
      const cargoCode = deriveCargoCode(frame, profile.cargo);
      outputRecords.push(createRecord(outputDeviceId, "cargo_action", cargoAction));
      if (cargoCode) {
        outputRecords.push(createRecord(outputDeviceId, "cargo", cargoCode));
      }
      if (cargoAction === "drop") {
        const target = deriveLocatorTarget(config, frame, profile.locator);
        if (target) {
          outputRecords.push(createRecord(outputDeviceId, "target", target));
        }
      }
    }

    const conveyorPayload = deriveConveyorPayload(frame, profile.payloadBinding);
    if (conveyorPayload) {
      outputRecords.push(createRecord(outputDeviceId, "payload", conveyorPayload));
    }

    stateByDevice.set(device.deviceId, { lastFrame: frame, lastPublishedAt: Date.now() });
    if (outputRecords.length === 0) {
      return;
    }
    if (outputRecords.length > MAX_OUTPUT_RECORDS) {
      console.warn(`设备 ${device.deviceId} 输出点位超过 ${MAX_OUTPUT_RECORDS}，已截断。`);
      outputRecords.length = MAX_OUTPUT_RECORDS;
    }
    const outputPayload = { data: outputRecords, ts: readNonEmptyString(payload?.ts) ?? formatShanghaiTimestamp(Date.now()) };
    outputs.push({ topic: buildTargetTopic(config, profile, device), payload: outputPayload });
  });

  return outputs;
}

/** 创建规范点位记录，始终保留 e 作为模型匹配号。 */
function createRecord(deviceId, pointName, value) {
  return { e: deviceId, p: pointName, v: value };
}

/** dry-run 打印内置样例转换结果。 */
function printDryRun(config, options) {
  const samplePayload = loadSamplePayload(options.samplePath);
  const stateByDevice = new Map();
  const outputs = transformPayload(samplePayload, { deviceId: "DDJ2" }, config, stateByDevice);
  console.log("Logistics MQTT 转换器 dry-run：");
  console.log("\n# 1. 输入 payload");
  console.log(JSON.stringify(samplePayload, null, 2));
  outputs.forEach((output, index) => {
    console.log(`\n# ${index + 2}. 输出 Topic: ${output.topic}`);
    console.log(JSON.stringify(output.payload, null, 2));
  });
  if (outputs.length === 0) {
    console.warn("dry-run 未生成任何输出，请检查 devices/profile/maps 配置。 ");
  }
}

/** 读取 dry-run 样例文件；未传入时使用内置 DDJ2 放货样例。 */
function loadSamplePayload(samplePath) {
  if (!samplePath) {
    return DEFAULT_SAMPLE_PAYLOAD;
  }
  try {
    return JSON.parse(fs.readFileSync(samplePath, "utf8"));
  } catch (error) {
    throw new Error(`读取样例 payload 失败：${samplePath}，${formatError(error)}`);
  }
}

/** 编码 MQTT UTF-8 字符串。 */
function encodeMqttString(value) {
  const encoded = textEncoder.encode(String(value));
  return Buffer.concat([Buffer.from([(encoded.length >> 8) & 0xff, encoded.length & 0xff]), Buffer.from(encoded)]);
}

/** 编码 MQTT 剩余长度字段。 */
function encodeRemainingLength(length) {
  const bytes = [];
  let value = length;
  do {
    let encodedByte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) {
      encodedByte |= 0x80;
    }
    bytes.push(encodedByte);
  } while (value > 0);
  return Buffer.from(bytes);
}

/** 创建完整 MQTT 控制包。 */
function createMqttPacket(header, payload) {
  return Buffer.concat([Buffer.from([header]), encodeRemainingLength(payload.length), payload]);
}

/** 创建 MQTT CONNECT 包。 */
function createConnectPacket(clientIdPrefix) {
  const clientId = `${clientIdPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const variableHeader = Buffer.concat([
    encodeMqttString("MQTT"),
    Buffer.from([0x04, 0x02, 0x00, MQTT_KEEP_ALIVE_SECONDS])
  ]);
  return createMqttPacket(0x10, Buffer.concat([variableHeader, encodeMqttString(clientId)]));
}

/** 创建 MQTT SUBSCRIBE 包，按 QoS0 订阅源 Topic。 */
function createSubscribePacket(topicFilters, packetId) {
  const variableHeader = Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]);
  const payload = Buffer.concat(topicFilters.map((topic) => Buffer.concat([encodeMqttString(topic), Buffer.from([0x00])]))) ;
  return createMqttPacket(0x82, Buffer.concat([variableHeader, payload]));
}

/** 创建 MQTT QoS0 PUBLISH 包。 */
function createPublishPacket(topic, payloadText) {
  const payload = Buffer.from(payloadText, "utf8");
  return createMqttPacket(0x30, Buffer.concat([encodeMqttString(topic), payload]));
}

/** 创建 MQTT PUBACK 包，兼容源 broker 下发 QoS1 消息。 */
function createPubAckPacket(packetId) {
  return createMqttPacket(0x40, Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]));
}

/** 读取 MQTT 剩余长度字段，兼容 TCP 分片。 */
function readMqttPacketLength(buffer) {
  let multiplier = 1;
  let remainingLength = 0;
  let offset = 1;
  while (offset < buffer.length) {
    const encodedByte = buffer[offset];
    remainingLength += (encodedByte & 0x7f) * multiplier;
    offset += 1;
    if ((encodedByte & 0x80) === 0) {
      return { fixedHeaderLength: offset, packetLength: offset + remainingLength, remainingLength };
    }
    multiplier *= 128;
    if (multiplier > 128 * 128 * 128) {
      throw new Error("MQTT 剩余长度字段非法。 ");
    }
  }
  return null;
}

/** 连接源 MQTT broker 并订阅原始 Topic。 */
function connectSourceMqtt(rt) {
  if (rt.options.noMqtt || rt.isShuttingDown) {
    return;
  }
  const source = rt.config.connections.sourceMqtt;
  clearTimer(rt.sourceReconnectTimer);
  rt.sourceReady = false;
  rt.sourceReadBuffer = Buffer.alloc(0);
  rt.sourceSocket?.destroy();
  rt.sourceSocket = net.createConnection({ host: source.host, port: Number(source.port) });
  rt.sourceSocket.setKeepAlive(true);
  rt.sourceSocket.on("connect", () => rt.sourceSocket.write(createConnectPacket(source.clientIdPrefix ?? "logistics-transformer-source")));
  rt.sourceSocket.on("data", (data) => handleMqttData(rt, "source", data));
  rt.sourceSocket.on("error", (error) => {
    if (!rt.isShuttingDown) {
      console.warn(`源 MQTT 连接失败：${formatError(error)}`);
    }
  });
  rt.sourceSocket.on("close", () => {
    rt.sourceReady = false;
    if (!rt.isShuttingDown) {
      rt.sourceReconnectTimer = setTimeout(() => connectSourceMqtt(rt), 2000);
    }
  });
}

/** 连接目标 MQTT broker，用于发布转换后的标准 Topic。 */
function connectTargetMqtt(rt) {
  if (rt.options.noMqtt || rt.isShuttingDown) {
    return;
  }
  const target = rt.config.connections.targetMqtt;
  clearTimer(rt.targetReconnectTimer);
  rt.targetReady = false;
  rt.targetReadBuffer = Buffer.alloc(0);
  rt.targetSocket?.destroy();
  rt.targetSocket = net.createConnection({ host: target.host, port: Number(target.port) });
  rt.targetSocket.setKeepAlive(true);
  rt.targetSocket.on("connect", () => rt.targetSocket.write(createConnectPacket(target.clientIdPrefix ?? "logistics-transformer-target")));
  rt.targetSocket.on("data", (data) => handleMqttData(rt, "target", data));
  rt.targetSocket.on("error", (error) => {
    if (!rt.isShuttingDown) {
      console.warn(`目标 MQTT 连接失败：${formatError(error)}`);
    }
  });
  rt.targetSocket.on("close", () => {
    rt.targetReady = false;
    if (!rt.isShuttingDown) {
      rt.targetReconnectTimer = setTimeout(() => connectTargetMqtt(rt), 2000);
    }
  });
}

/** 缓冲并处理 MQTT 控制包。 */
function handleMqttData(rt, role, data) {
  const bufferName = role === "source" ? "sourceReadBuffer" : "targetReadBuffer";
  rt[bufferName] = Buffer.concat([rt[bufferName], data]);
  while (rt[bufferName].length >= 2) {
    let packetInfo;
    try {
      packetInfo = readMqttPacketLength(rt[bufferName]);
    } catch (error) {
      console.warn(formatError(error));
      getSocket(rt, role)?.destroy();
      return;
    }
    if (!packetInfo || rt[bufferName].length < packetInfo.packetLength) {
      return;
    }
    const packet = rt[bufferName].subarray(0, packetInfo.packetLength);
    rt[bufferName] = rt[bufferName].subarray(packetInfo.packetLength);
    handleCompleteMqttPacket(rt, role, packet, packetInfo.fixedHeaderLength, packetInfo.remainingLength);
  }
}

/** 处理完整 MQTT 包：CONNACK、PUBLISH、PINGRESP、SUBACK。 */
function handleCompleteMqttPacket(rt, role, packet, fixedHeaderLength, remainingLength) {
  const packetType = packet[0] >> 4;
  if (packetType === 2) {
    handleConnAck(rt, role, packet, fixedHeaderLength, remainingLength);
  } else if (packetType === 3 && role === "source") {
    handlePublishPacket(rt, packet, fixedHeaderLength);
  } else if (packetType === 9 && role === "source") {
    console.log("源 MQTT 已订阅原始 Topic。 ");
  }
}

/** CONNACK 成功后源连接订阅，目标连接等待发布。 */
function handleConnAck(rt, role, packet, fixedHeaderLength, remainingLength) {
  if (remainingLength < 2) {
    console.warn("MQTT CONNACK 长度非法。 ");
    getSocket(rt, role)?.destroy();
    return;
  }
  const returnCode = packet[fixedHeaderLength + 1];
  if (returnCode !== 0) {
    console.warn(`${role === "source" ? "源" : "目标"} MQTT broker 拒绝连接，返回码 ${returnCode}。`);
    getSocket(rt, role)?.destroy();
    return;
  }
  if (role === "source") {
    rt.sourceReady = true;
    const packetId = nextPacketId(rt);
    rt.sourceSocket.write(createSubscribePacket(rt.config.routing.sourceTopics, packetId));
    console.log(`已连接源 MQTT broker：${rt.config.connections.sourceMqtt.host}:${rt.config.connections.sourceMqtt.port}`);
  } else {
    rt.targetReady = true;
    console.log(`已连接目标 MQTT broker：${rt.config.connections.targetMqtt.host}:${rt.config.connections.targetMqtt.port}`);
  }
}

/** 解析源 PUBLISH 包并执行转换。 */
function handlePublishPacket(rt, packet, fixedHeaderLength) {
  let offset = fixedHeaderLength;
  const topicLength = packet.readUInt16BE(offset);
  offset += 2;
  const topic = textDecoder.decode(packet.subarray(offset, offset + topicLength));
  offset += topicLength;
  const qos = (packet[0] & 0x06) >> 1;
  let packetId = 0;
  if (qos > 0) {
    packetId = packet.readUInt16BE(offset);
    offset += 2;
  }
  const payloadText = packet.subarray(offset).toString("utf8");
  if (qos === 1 && packetId) {
    rt.sourceSocket.write(createPubAckPacket(packetId));
  }
  handleSourcePublish(rt, topic, payloadText);
}

/** 处理源 MQTT 消息，转换后发布到目标 MQTT 与本地 WebSocket。 */
function handleSourcePublish(rt, topic, payloadText) {
  if (Buffer.byteLength(payloadText, "utf8") > MAX_PAYLOAD_BYTES) {
    console.warn(`源消息超过 ${MAX_PAYLOAD_BYTES} bytes，已跳过：${topic}`);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch (error) {
    console.warn(`源消息不是合法 JSON，已跳过：${topic}，${formatError(error)}`);
    return;
  }
  const metadata = parseTopicMetadata(topic);
  const outputs = transformPayload(payload, { deviceId: metadata?.deviceId, topic }, rt.config, rt.stateByDevice);
  outputs.forEach((output) => publishOutput(rt, output));
  if (rt.options.once) {
    shutdown({ gracefulMqtt: true });
  }
}

/** 发布转换结果。 */
function publishOutput(rt, output) {
  const payloadText = JSON.stringify(output.payload);
  if (rt.targetReady && rt.targetSocket?.writable) {
    rt.targetSocket.write(createPublishPacket(output.topic, payloadText));
  } else if (!rt.options.noMqtt) {
    console.warn(`目标 MQTT 未连接，已跳过真实发布：${output.topic}`);
  }
  broadcastWebSocketText(rt, JSON.stringify({ topic: output.topic, ...output.payload }));
  console.log(`转换发布：${output.topic} ${payloadText}`);
}

/** 启动本地 WebSocket mirror，便于编辑器以 WebSocket 数据源联调转换结果。 */
function startWebSocketServer(rt) {
  if (rt.options.noWs) {
    return;
  }
  const wsConfig = rt.config.connections.webSocket;
  if (!wsConfig) {
    return;
  }
  const server = http.createServer((_request, response) => {
    response.writeHead(404);
    response.end("Logistics MQTT transformer WebSocket only.\n");
  });
  server.on("upgrade", (request, socket) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `${wsConfig.host}:${wsConfig.port}`}`);
    if (requestUrl.pathname !== normalizeWebSocketPath(wsConfig.path)) {
      socket.destroy();
      return;
    }
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    const acceptKey = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      ""
    ].join("\r\n"));
    rt.webSocketClients.add(socket);
    console.log("编辑器已连接 Logistics MQTT 转换器 WebSocket。 ");
    socket.on("data", (data) => handleWebSocketClientFrame(rt, socket, data));
    socket.on("close", () => rt.webSocketClients.delete(socket));
    socket.on("error", () => rt.webSocketClients.delete(socket));
  });
  server.listen(Number(wsConfig.port), wsConfig.host, () => {
    console.log(`Logistics MQTT 转换器 WebSocket 已启动：ws://${wsConfig.host}:${wsConfig.port}${normalizeWebSocketPath(wsConfig.path)}`);
  });
  server.on("error", (error) => {
    console.error(`WebSocket 服务启动失败：${formatError(error)}`);
    process.exitCode = 1;
    shutdown({ gracefulMqtt: false });
  });
  rt.webSocketServer = server;
}

/** 处理编辑器 WebSocket 关闭帧。 */
function handleWebSocketClientFrame(rt, socket, data) {
  const opcode = data[0] & 0x0f;
  if (opcode === 0x8) {
    socket.end();
    rt.webSocketClients.delete(socket);
  }
}

/** 向所有 WebSocket 客户端广播转换结果。 */
function broadcastWebSocketText(rt, text) {
  if (rt.options.noWs || rt.webSocketClients.size === 0) {
    return;
  }
  const frame = createWebSocketTextFrame(text);
  rt.webSocketClients.forEach((socket) => {
    if (socket.writable) {
      socket.write(frame);
    }
  });
}

/** 编码服务端到客户端的 WebSocket 文本帧。 */
function createWebSocketTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  if (payload.length <= 0xffff) {
    const header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.allocUnsafe(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

/** 停止计时器、MQTT socket 和 WebSocket 客户端。 */
function shutdown({ gracefulMqtt = false } = {}) {
  runtime.isShuttingDown = true;
  clearTimer(runtime.sourceReconnectTimer);
  clearTimer(runtime.targetReconnectTimer);
  clearTimer(runtime.onceFallbackTimer);
  runtime.webSocketClients.forEach((socket) => socket.destroy());
  runtime.webSocketClients.clear();
  runtime.webSocketServer?.close();
  runtime.webSocketServer = null;
  if (gracefulMqtt) {
    runtime.sourceSocket?.end();
    runtime.targetSocket?.end();
  } else {
    runtime.sourceSocket?.destroy();
    runtime.targetSocket?.destroy();
  }
  runtime.sourceSocket = null;
  runtime.targetSocket = null;
  runtime.sourceReadBuffer = Buffer.alloc(0);
  runtime.targetReadBuffer = Buffer.alloc(0);
}

/** 获取 MQTT socket。 */
function getSocket(rt, role) {
  return role === "source" ? rt.sourceSocket : rt.targetSocket;
}

/** 获取递增 MQTT 包 ID。 */
function nextPacketId(rt) {
  const packetId = rt.nextPacketId;
  rt.nextPacketId = rt.nextPacketId >= 0xffff ? 1 : rt.nextPacketId + 1;
  return packetId;
}

/** 按东八区输出现场时间格式。 */
function formatShanghaiTimestamp(timestampMs) {
  const shanghaiTime = new Date(timestampMs + 8 * 60 * 60 * 1000);
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return [
    `${shanghaiTime.getUTCFullYear()}-${pad(shanghaiTime.getUTCMonth() + 1)}-${pad(shanghaiTime.getUTCDate())}`,
    `T${pad(shanghaiTime.getUTCHours())}:${pad(shanghaiTime.getUTCMinutes())}:${pad(shanghaiTime.getUTCSeconds())}`,
    `.${pad(shanghaiTime.getUTCMilliseconds(), 3)}+08:00`
  ].join("");
}

/** 工具：判断对象。 */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 工具：判断点位记录。 */
function isPointRecord(value) {
  return isRecord(value) && readNonEmptyString(value.p) && Object.prototype.hasOwnProperty.call(value, "v");
}

/** 工具：读取非空字符串。 */
function readNonEmptyString(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const text = String(value).trim();
  return text ? text : undefined;
}

/** 工具：归一化匹配值。 */
function normalizeMatchValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** 工具：将值转数组。 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** 工具：端口校验。 */
function isValidPort(value) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 && numberValue <= 65535;
}

/** 工具：按比例缩放数字值。 */
function scaleValue(value, scale) {
  const numberScale = Number(scale);
  if (!Number.isFinite(numberScale) || numberScale === 1 || typeof value !== "number") {
    return value;
  }
  return Number((value * numberScale).toFixed(6));
}

/** 工具：深拷贝配置对象。 */
function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 工具：点路径写入对象。 */
function setPath(target, pathText, value) {
  const parts = String(pathText).split(".").filter(Boolean);
  if (parts.length === 0) {
    return;
  }
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!isRecord(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
}

/** 工具：错误格式化。 */
function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

/** 工具：清理计时器。 */
function clearTimer(timer) {
  if (timer) {
    clearTimeout(timer);
  }
}

process.on("SIGINT", () => {
  console.log("正在停止 Logistics MQTT 转换器。 ");
  shutdown({ gracefulMqtt: false });
  process.exit(0);
});

try {
  runtime.config = loadConfig(runtime.options.configPath);
  if (runtime.options.dryRun) {
    printDryRun(runtime.config, runtime.options);
  } else {
    startWebSocketServer(runtime);
    connectTargetMqtt(runtime);
    connectSourceMqtt(runtime);
    if (runtime.options.once && !runtime.options.noMqtt) {
      runtime.onceFallbackTimer = setTimeout(() => {
        console.warn(`等待源 MQTT 消息超过 ${ONCE_MQTT_WAIT_MS}ms，转换器继续保持运行等待消息。`);
      }, ONCE_MQTT_WAIT_MS);
    }
  }
} catch (error) {
  console.error(formatError(error));
  shutdown({ gracefulMqtt: false });
  process.exit(1);
}
