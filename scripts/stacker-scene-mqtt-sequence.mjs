import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const MQTT_HOST = process.env.STACKER_SCENE_MQTT_HOST ?? "192.168.60.154";
const MQTT_PORT = readNumberOption("STACKER_SCENE_MQTT_PORT", 1883, 1);
const WS_HOST = process.env.STACKER_SCENE_WS_HOST ?? "127.0.0.1";
const WS_PORT = readNumberOption("STACKER_SCENE_WS_PORT", 18084, 1);
const WS_PATH = normalizeWebSocketPath(process.env.STACKER_SCENE_WS_PATH ?? "/stacker-scene");
const SCENE_PROTOCOL = normalizeSceneProtocol(process.env.STACKER_SCENE_PROTOCOL ?? (process.argv.includes("--plc") ? "plc" : "standard"));
const PLC_MODE = SCENE_PROTOCOL === "plc";
const STACKER_ID = process.env.STACKER_SCENE_STACKER_ID ?? "DDJ2";
const STACKER_DEVICE_CODE = process.env.STACKER_SCENE_DEVICE_CODE ?? "1";
const CONVEYOR_ID = process.env.STACKER_SCENE_CONVEYOR_ID ?? "1004";
const CONVEYOR_TASK_CODE = readNumberOption("STACKER_SCENE_CONVEYOR_TASK", 202, 0);
const CONVEYOR_CONTAINER_CODE = process.env.STACKER_SCENE_CONVEYOR_CONTAINER_CODE ?? "";
const DEFAULT_BOX_ID = CONVEYOR_CONTAINER_CODE.trim() || (CONVEYOR_TASK_CODE > 0 ? `Task${CONVEYOR_TASK_CODE}` : `Cargo-${CONVEYOR_ID}-001`);
const BOX_ID = process.env.STACKER_SCENE_BOX_ID ?? DEFAULT_BOX_ID;
const LOCATOR_ID = process.env.STACKER_SCENE_LOCATOR_ID ?? "1-1-1";
const CONVEYOR_PLC_FIELD_ORDER = [
  "deviceCode",
  "mode",
  "action",
  "task",
  "movement_x",
  "movement_y",
  "signalBits",
  "containerCode",
  "workingHours_x",
  "workingHours_y",
  "normal",
  "errorCode",
  "message",
  "layer",
  "rotation",
  "container_quantity",
  "folding",
  "flip",
  "fork",
  "result",
  "result2"
];
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
const PROJECT_PATH = process.env.STACKER_SCENE_PROJECT_PATH ?? "C:\\Users\\WY\\Documents\\test2\\test2";
const SCENE_FILE_PATH = process.env.STACKER_SCENE_FILE_PATH ?? "";
const CHAIN_CONVEYOR_CARGO_SPEED_MPS = readNumberOption("STACKER_SCENE_CONVEYOR_CARGO_SPEED", 0.3, 0.01);
const CONVEYOR_TRANSFER_PADDING_MS = readNumberOption("STACKER_SCENE_CONVEYOR_PADDING_MS", 800, 0);
const CONVEYOR_ACTION_HEARTBEAT_MS = readNumberOption("STACKER_SCENE_CONVEYOR_ACTION_HEARTBEAT_MS", 2000, 500);
const STATIC_BASE_TS = readNumberOption("STACKER_SCENE_BASE_TS", 1781596800000, 0);
const START_DELAY_MS = readNumberOption("STACKER_SCENE_START_DELAY_MS", 1500, 0);
const TIME_SCALE = readNumberOption("STACKER_SCENE_TIME_SCALE", 1, 0.01);
const PAYLOAD_WRAP = normalizePayloadWrap(process.env.STACKER_SCENE_PAYLOAD_WRAP ?? (PLC_MODE ? "data" : "none"));
const MQTT_KEEP_ALIVE_SECONDS = 30;
const DRY_RUN = process.argv.includes("--dry-run") || process.env.STACKER_SCENE_DRY_RUN === "1";
const LOOP_PLAYBACK = process.argv.includes("--loop") || process.env.STACKER_SCENE_LOOP === "1";
const AUTOSTART = process.argv.includes("--autostart") || process.env.STACKER_SCENE_AUTOSTART === "1";
const NO_MQTT = process.argv.includes("--no-mqtt") || process.env.STACKER_SCENE_NO_MQTT === "1";
const NO_WS = process.argv.includes("--no-ws") || process.env.STACKER_SCENE_NO_WS === "1";
const DYNAMIC_TS = process.argv.includes("--dynamic-ts") || process.env.STACKER_SCENE_DYNAMIC_TS === "1";

const textEncoder = new TextEncoder();
const websocketClients = new Set();
const scheduledTimers = new Set();
let mqttSocket = null;
let mqttReady = false;
let mqttReadBuffer = Buffer.alloc(0);
let reconnectTimer = null;
let startTimer = null;
let webSocketServer = null;
let playbackStarted = false;
let playbackGeneration = 0;
let isShuttingDown = false;

const stackerPoseTopic = `dt/factory/logistics/stacker/${STACKER_ID}/twinspawn`;
const stackerJointTopic = `dt/factory/logistics/stacker/${STACKER_ID}/twindatadriven/joint`;
const conveyorPayloadTopic = `dt/factory/logistics/conveyor/${CONVEYOR_ID}/twindatadriven/payload`;
const conveyorJointTopic = `dt/factory/logistics/conveyor/${CONVEYOR_ID}/twindatadriven/joint`;
const sceneLayout = loadSceneLayout();

/** 读取有限数字环境变量，非法值回退默认值，避免调度或端口变成 NaN。 */
function readNumberOption(name, fallback, minimum) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

/** 读取 test2 场景模型快照，后续所有定位都由模型位置和模型参数推导。 */
function loadSceneLayout() {
  const scenePath = resolveSceneFilePath();
  const sceneFile = readJsonFile(scenePath);
  const babylonScene = sceneFile?.babylonScene;
  if (!babylonScene || typeof babylonScene !== "object") {
    throw new Error(`场景文件缺少 babylonScene：${scenePath}`);
  }

  const nodes = collectSceneNodes(babylonScene);
  const conveyorNode = findSceneNodeByAssetCode(nodes, CONVEYOR_ID);
  const stackerNode = findSceneNodeByAssetCode(nodes, STACKER_ID);
  const locatorNode = findSceneNodeByAssetCode(nodes, LOCATOR_ID);
  if (!conveyorNode || !stackerNode || !locatorNode) {
    const missing = [
      [CONVEYOR_ID, conveyorNode],
      [STACKER_ID, stackerNode],
      [LOCATOR_ID, locatorNode]
    ]
      .filter(([, node]) => !node)
      .map(([assetCode]) => assetCode)
      .join("、");
    throw new Error(`场景 ${scenePath} 缺少资产编号：${missing}`);
  }

  return {
    scenePath,
    conveyorTransferDurationMs: createConveyorTransferDurationMs(conveyorNode)
  };
}

/** 解析项目当前主场景路径，优先使用显式环境变量，其次使用项目清单 activeScene。 */
function resolveSceneFilePath() {
  if (SCENE_FILE_PATH.trim()) {
    return path.resolve(SCENE_FILE_PATH);
  }

  const projectJsonPath = path.join(PROJECT_PATH, ".babylon-editor", "project.json");
  const projectJson = fs.existsSync(projectJsonPath) ? readJsonFile(projectJsonPath) : null;
  const activeSceneId = typeof projectJson?.activeSceneId === "string" ? projectJson.activeSceneId : "";
  const scenes = Array.isArray(projectJson?.scenes) ? projectJson.scenes : [];
  const activeScene = scenes.find((scene) => scene?.id === activeSceneId) ?? scenes[0];
  if (activeScene?.file) {
    return path.resolve(PROJECT_PATH, String(activeScene.file));
  }

  const sceneDirectory = path.join(PROJECT_PATH, "scenes");
  const sceneFiles = fs
    .readdirSync(sceneDirectory)
    .filter((file) => file.endsWith(".scene.json"))
    .map((file) => path.join(sceneDirectory, file))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (sceneFiles.length === 0) {
    throw new Error(`未找到 test2 场景文件：${sceneDirectory}`);
  }
  return sceneFiles[0];
}

/** 读取 JSON 文件并给出明确错误，避免 dry-run 静默使用过期坐标。 */
function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 JSON 失败：${filePath}，${message}`);
  }
}

/** 汇总 Babylon 序列化里的 TransformNode 和 Mesh，保留节点类型便于后续读取几何。 */
function collectSceneNodes(babylonScene) {
  return [
    ...(Array.isArray(babylonScene.transformNodes) ? babylonScene.transformNodes.map((node) => ({ ...node, kind: "transform" })) : []),
    ...(Array.isArray(babylonScene.meshes) ? babylonScene.meshes.map((node) => ({ ...node, kind: "mesh" })) : [])
  ];
}

/** 按右侧资产编号查找场景节点。 */
function findSceneNodeByAssetCode(nodes, assetCode) {
  return nodes.find((node) => getSceneNodeAssetCode(node) === assetCode) ?? null;
}

/** 读取节点资产编号，兼容普通资产信息和模型包实例资产编号。 */
function getSceneNodeAssetCode(node) {
  return (
    node?.metadata?.editor?.assetInfo?.assetCode ??
    node?.metadata?.editor?.assetCode ??
    node?.metadata?.editor?.modelPackageInstance?.assetCode ??
    ""
  );
}

/** 按链条机模型参数估算输送等待时间，不生成或发送任何货箱坐标。 */
function createConveyorTransferDurationMs(conveyorNode) {
  const baseline = conveyorNode.metadata?.editor?.modelPackageRuntime?.opaqueChainConveyorBaseline;
  const values = conveyorNode.metadata?.editor?.modelPackageInstance?.values ?? {};
  const minimum = baseline?.minimum ?? {};
  const maximum = baseline?.maximum ?? {};
  const chainLength = readPositiveNumberByFieldNames(
    values,
    CHAIN_CONVEYOR_LENGTH_PARAMETER_FIELDS,
    Number(maximum.z) - Number(minimum.z)
  );
  const frontRatio = readConveyorEndpointRatio(values, "front");
  const rearRatio = readConveyorEndpointRatio(values, "rear");
  const travelDistance = Math.max(0.1, Math.abs(frontRatio - rearRatio) * chainLength);
  return Math.ceil((travelDistance / CHAIN_CONVEYOR_CARGO_SPEED_MPS) * 1000) + CONVEYOR_TRANSFER_PADDING_MS;
}

/** 读取链条机端点比例，旧场景缺失时 front=1、rear=0。 */
function readConveyorEndpointRatio(values, endpoint) {
  const fieldNames = endpoint === "front"
    ? CHAIN_CONVEYOR_FRONT_ENDPOINT_RATIO_FIELDS
    : CHAIN_CONVEYOR_REAR_ENDPOINT_RATIO_FIELDS;
  const fallback = endpoint === "front" ? 1 : 0;
  const value = readNumberByFieldNames(values, fieldNames);
  return clampNumber(value ?? fallback, 0, 1);
}

/** 按字段别名读取正数参数，非法时回退指定默认值。 */
function readPositiveNumberByFieldNames(values, fieldNames, fallback) {
  return readPositiveNumber(readNumberByFieldNames(values, fieldNames), fallback);
}

/** 按字段名和兼容别名读取数值，支持 meta 参数包装结构。 */
function readNumberByFieldNames(values, fieldNames) {
  if (!values || typeof values !== "object") {
    return undefined;
  }

  for (const fieldName of fieldNames) {
    const value = readFiniteNumber(values[fieldName]);
    if (value !== undefined) {
      return value;
    }
  }

  const compactFieldNames = new Set(fieldNames.map(compactFieldName));
  for (const [key, value] of Object.entries(values)) {
    if (!compactFieldNames.has(compactFieldName(key))) {
      continue;
    }
    const numericValue = readFiniteNumber(value);
    if (numericValue !== undefined) {
      return numericValue;
    }
  }
  return undefined;
}

/** 读取有限正数，非法时使用兜底。 */
function readPositiveNumber(value, fallback) {
  const numberValue = readFiniteNumber(value);
  const fallbackValue = Number(fallback);
  if (numberValue !== undefined && numberValue > 0) {
    return numberValue;
  }
  return Number.isFinite(fallbackValue) && fallbackValue > 0 ? fallbackValue : 1;
}

/** 读取有限数字，兼容裸数字、字符串数字和 { value/currentValue/defaultValue } 包装。 */
function readFiniteNumber(value) {
  const unwrappedValue = unwrapParameterValue(value);
  const numericValue = typeof unwrappedValue === "number"
    ? unwrappedValue
    : typeof unwrappedValue === "string" && unwrappedValue.trim()
      ? Number(unwrappedValue)
      : Number.NaN;
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

/** 解开模型包参数包装，避免旧场景保存的对象值无法参与端点计算。 */
function unwrapParameterValue(value) {
  let current = value;
  for (let depth = 0; depth < 4 && current && typeof current === "object" && !Array.isArray(current); depth += 1) {
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

/** 压缩字段名，兼容下划线、点号、横线和空格差异。 */
function compactFieldName(value) {
  return String(value).trim().replace(/-/g, "_").toLowerCase().replace(/[\s_.]/g, "");
}

/** 将数值夹紧到指定范围，防止比例越界。 */
function clampNumber(value, minimum, maximum) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum;
}

/** 规范化 WebSocket 路径，兼容用户环境变量漏写开头斜杠。 */
function normalizeWebSocketPath(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") {
    return "/stacker-scene";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** 归一化场景脚本协议模式，standard 保留旧语义，plc 输出现场 DDJ2 点位。 */
function normalizeSceneProtocol(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "plc" ? "plc" : "standard";
}

/** 归一化 payload 外层包装；PLC 模式默认使用附件同款 data 包装。 */
function normalizePayloadWrap(value) {
  const normalized = value.trim().toLowerCase();
  return ["none", "data", "payload", "message"].includes(normalized) ? normalized : "none";
}

/** 编码 MQTT UTF-8 字符串，前两个字节保存字符串长度。 */
function encodeMqttString(value) {
  const encoded = textEncoder.encode(value);
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
function createConnectPacket() {
  const clientId = `stacker-scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const variableHeader = Buffer.concat([
    encodeMqttString("MQTT"),
    Buffer.from([0x04, 0x02, 0x00, MQTT_KEEP_ALIVE_SECONDS])
  ]);
  return createMqttPacket(0x10, Buffer.concat([variableHeader, encodeMqttString(clientId)]));
}

/** 创建 MQTT QoS0 PUBLISH 包。 */
function createPublishPacket(topic, payloadText) {
  const payload = Buffer.from(payloadText, "utf8");
  return createMqttPacket(0x30, Buffer.concat([encodeMqttString(topic), payload]));
}

/** 连接普通 TCP MQTT broker；连接失败不阻断本地 WebSocket 演示。 */
function connectMqtt() {
  if (NO_MQTT || isShuttingDown) {
    return;
  }

  clearTimer(reconnectTimer);
  mqttReady = false;
  mqttReadBuffer = Buffer.alloc(0);
  mqttSocket?.destroy();
  mqttSocket = net.createConnection({ host: MQTT_HOST, port: MQTT_PORT });
  mqttSocket.setKeepAlive(true);
  mqttSocket.on("connect", () => mqttSocket.write(createConnectPacket()));
  mqttSocket.on("data", handleMqttPacket);
  mqttSocket.on("error", (error) => {
    if (!isShuttingDown) {
      console.warn(`MQTT 连接失败：${error.message}`);
    }
  });
  mqttSocket.on("close", () => {
    mqttReady = false;
    if (!isShuttingDown) {
      reconnectTimer = setTimeout(connectMqtt, 2000);
    }
  });
}

/** 按 MQTT 剩余长度字段读取一个完整控制包长度。 */
function readMqttPacketLength(buffer) {
  let multiplier = 1;
  let remainingLength = 0;
  let offset = 1;

  while (offset < buffer.length) {
    const encodedByte = buffer[offset];
    remainingLength += (encodedByte & 0x7f) * multiplier;
    offset += 1;
    if ((encodedByte & 0x80) === 0) {
      return {
        fixedHeaderLength: offset,
        packetLength: offset + remainingLength,
        remainingLength
      };
    }

    multiplier *= 128;
    if (multiplier > 128 * 128 * 128) {
      throw new Error("MQTT 剩余长度字段非法。");
    }
  }

  return null;
}

/** 缓冲并处理 MQTT 控制包，兼容 TCP 分片。 */
function handleMqttPacket(data) {
  mqttReadBuffer = Buffer.concat([mqttReadBuffer, data]);

  while (mqttReadBuffer.length >= 2) {
    let packetInfo;
    try {
      packetInfo = readMqttPacketLength(mqttReadBuffer);
    } catch (error) {
      console.warn(error instanceof Error ? error.message : "MQTT 控制包解析失败。");
      mqttSocket?.destroy();
      return;
    }

    if (!packetInfo || mqttReadBuffer.length < packetInfo.packetLength) {
      return;
    }

    const packet = mqttReadBuffer.subarray(0, packetInfo.packetLength);
    mqttReadBuffer = mqttReadBuffer.subarray(packetInfo.packetLength);
    handleCompleteMqttPacket(packet, packetInfo.fixedHeaderLength, packetInfo.remainingLength);
  }
}

/** 处理完整 MQTT CONNACK。 */
function handleCompleteMqttPacket(packet, fixedHeaderLength, remainingLength) {
  const packetType = packet[0] >> 4;
  if (packetType !== 2) {
    return;
  }

  if (remainingLength < 2) {
    console.warn("MQTT CONNACK 长度非法。");
    mqttSocket?.destroy();
    return;
  }

  const returnCode = packet[fixedHeaderLength + 1];
  if (returnCode !== 0) {
    console.warn(`MQTT broker 拒绝连接，返回码 ${returnCode}。`);
    mqttSocket?.destroy();
    return;
  }

  mqttReady = true;
  console.log(`已连接 MQTT broker：${MQTT_HOST}:${MQTT_PORT}`);
}

/** 创建计划中的完整动画报文序列。 */
function createSceneMessages(baseTimestamp) {
  const ts = (offsetMs) => baseTimestamp + offsetMs;
  const frontSignalMs = 100;
  const bindCargoMs = 300;
  const conveyorStartMs = 500;
  const conveyorRearMs = conveyorStartMs + sceneLayout.conveyorTransferDurationMs;
  const stackerTravelStartMs = conveyorRearMs + 300;
  const stackerTravelStopMs = stackerTravelStartMs + 3800;
  const forkOutStartMs = stackerTravelStopMs + 200;
  const pickupMs = forkOutStartMs + 6600;
  const pickupConfirmMs = pickupMs + 200;
  const forkRetractStartMs = pickupConfirmMs + 200;
  const forkRetractStopMs = forkRetractStartMs + 6800;
  const locatorTravelStartMs = forkRetractStopMs + 200;
  const locatorTravelStopMs = locatorTravelStartMs + 4000;
  const locatorForkOutMs = locatorTravelStopMs + 200;
  const dropMs = locatorForkOutMs + 6600;
  const finalRetractStartMs = dropMs + 200;
  const finalRetractStopMs = finalRetractStartMs + 7000;
  const resetMs = finalRetractStopMs + 200;
  const conveyorKeepAliveMessages = createConveyorTransferKeepAliveMessages({
    startMs: conveyorStartMs,
    stopMs: conveyorRearMs,
    timestampAt: ts
  });

  return [
    {
      atMs: 0,
      label: "初始化 DDJ2 位姿",
      topic: stackerPoseTopic,
      payload: { s: "ddj2-ready", e: STACKER_ID, ts: ts(0) }
    },
    {
      atMs: frontSignalMs,
      label: `${CONVEYOR_ID} 前端有货，按运行态模型生成货箱 ${BOX_ID}`,
      topic: conveyorJointTopic,
      payload: createConveyorFrontCargoPayload(ts(frontSignalMs))
    },
    {
      atMs: bindCargoMs,
      label: `${CONVEYOR_ID} 绑定货箱 ${BOX_ID}`,
      topic: conveyorPayloadTopic,
      payload: [{ e: CONVEYOR_ID, p: "payload", v: BOX_ID, ts: ts(bindCargoMs) }]
    },
    {
      atMs: conveyorStartMs,
      label: `${CONVEYOR_ID} 启动链条输送`,
      topic: conveyorJointTopic,
      payload: createConveyorPlcPayload({ movement_x: 1, signalBits: 1, container_quantity: 1 }, ts(conveyorStartMs))
    },
    ...conveyorKeepAliveMessages,
    {
      atMs: conveyorRearMs,
      label: `${CONVEYOR_ID} 后端有货并停止`,
      topic: conveyorJointTopic,
      payload: createConveyorPlcPayload({ movement_x: 0, signalBits: 1 << 3, container_quantity: 1 }, ts(conveyorRearMs))
    },
    {
      atMs: stackerTravelStartMs,
      label: `DDJ2 按模型目标移动到 ${CONVEYOR_ID} 后端取货位`,
      topic: stackerJointTopic,
      payload: createStackerTravelTargetPayload({
        target: CONVEYOR_ID,
        anchor: "rear",
        movementX: 2,
        timestamp: ts(stackerTravelStartMs)
      }),
      plcConvertible: true
    },
    {
      atMs: stackerTravelStopMs,
      label: `DDJ2 到达 ${CONVEYOR_ID} 后端并停止`,
      topic: stackerJointTopic,
      payload: createStackerTravelTargetPayload({
        target: CONVEYOR_ID,
        anchor: "rear",
        movementX: 0,
        timestamp: ts(stackerTravelStopMs)
      }),
      plcConvertible: true
    },
    {
      atMs: forkOutStartMs,
      label: `DDJ2 货叉按运行态货箱 ${BOX_ID} 伸出到 ${CONVEYOR_ID} 后端`,
      topic: stackerJointTopic,
      payload: createStackerForkTargetPayload({ target: BOX_ID, anchor: "center", action: 1, timestamp: ts(forkOutStartMs) }),
      plcConvertible: true
    },
    {
      atMs: pickupMs,
      label: "DDJ2 货叉接触货箱并绑定到载货台",
      topic: stackerJointTopic,
      payload: [
        { e: STACKER_ID, p: "fork_target", v: BOX_ID, ts: ts(pickupMs) },
        { e: STACKER_ID, p: "fork_anchor", v: "center", ts: ts(pickupMs) },
        { e: STACKER_ID, p: "front_movement_z", v: 0, ts: ts(pickupMs) },
        { e: STACKER_ID, p: "back_movement_z", v: 0, ts: ts(pickupMs) },
        { e: STACKER_ID, p: "payload", v: BOX_ID, ts: ts(pickupMs) }
      ],
      plcConvertible: true
    },
    {
      atMs: pickupConfirmMs,
      label: "DDJ2 取货确认",
      topic: stackerJointTopic,
      payload: [
        { e: STACKER_ID, p: "cargo_action", v: "pickup", ts: ts(pickupConfirmMs) },
        { e: STACKER_ID, p: "cargo", v: BOX_ID, ts: ts(pickupConfirmMs) }
      ],
      plcConvertible: true
    },
    {
      atMs: forkRetractStartMs,
      label: "DDJ2 货叉缩回到载货台",
      topic: stackerJointTopic,
      payload: createStackerForkTargetPayload({ target: "home", anchor: "center", action: 2, timestamp: ts(forkRetractStartMs) }),
      plcConvertible: true
    },
    {
      atMs: forkRetractStopMs,
      label: "DDJ2 货叉缩回后停止",
      topic: stackerJointTopic,
      payload: createStackerForkTargetPayload({ target: "home", anchor: "center", action: 0, timestamp: ts(forkRetractStopMs) }),
      plcConvertible: true
    },
    {
      atMs: locatorTravelStartMs,
      label: `DDJ2 按模型目标移动到定位线框 ${LOCATOR_ID}`,
      topic: stackerJointTopic,
      payload: createStackerTravelTargetPayload({
        target: LOCATOR_ID,
        anchor: "center",
        movementX: 1,
        timestamp: ts(locatorTravelStartMs)
      }),
      plcConvertible: true
    },
    {
      atMs: locatorTravelStopMs,
      label: `DDJ2 到达定位线框 ${LOCATOR_ID} 并停止`,
      topic: stackerJointTopic,
      payload: createStackerTravelTargetPayload({
        target: LOCATOR_ID,
        anchor: "center",
        movementX: 0,
        timestamp: ts(locatorTravelStopMs)
      }),
      plcConvertible: true
    },
    {
      atMs: locatorForkOutMs,
      label: `DDJ2 对准 ${LOCATOR_ID} 后按定位框模型伸叉`,
      topic: stackerJointTopic,
      payload: createStackerForkTargetPayload({ target: LOCATOR_ID, anchor: "center", action: 1, timestamp: ts(locatorForkOutMs) }),
      plcConvertible: true
    },
    {
      atMs: dropMs,
      label: `放入定位线框 ${LOCATOR_ID}`,
      topic: stackerJointTopic,
      payload: [
        { e: STACKER_ID, p: "fork_target", v: LOCATOR_ID, ts: ts(dropMs) },
        { e: STACKER_ID, p: "fork_anchor", v: "center", ts: ts(dropMs) },
        { e: STACKER_ID, p: "front_movement_z", v: 0, ts: ts(dropMs) },
        { e: STACKER_ID, p: "back_movement_z", v: 0, ts: ts(dropMs) },
        { e: STACKER_ID, p: "cargo_action", v: "drop", ts: ts(dropMs) },
        { e: STACKER_ID, p: "cargo", v: BOX_ID, ts: ts(dropMs) },
        { e: STACKER_ID, p: "drop_target", v: LOCATOR_ID, ts: ts(dropMs) }
      ],
      plcConvertible: true
    },
    {
      atMs: finalRetractStartMs,
      label: "DDJ2 放货后货叉缩回",
      topic: stackerJointTopic,
      payload: createStackerForkTargetPayload({ target: "home", anchor: "center", action: 2, timestamp: ts(finalRetractStartMs) }),
      plcConvertible: true
    },
    {
      atMs: finalRetractStopMs,
      label: "DDJ2 货叉缩回后停止",
      topic: stackerJointTopic,
      payload: createStackerForkTargetPayload({ target: "home", anchor: "center", action: 0, timestamp: ts(finalRetractStopMs) }),
      plcConvertible: true
    },
    {
      atMs: resetMs,
      label: `${CONVEYOR_ID} 后端有货信号复位`,
      topic: conveyorJointTopic,
      payload: createConveyorCargoSignalPayload({ frontHasCargo: false, rearHasCargo: false, timestamp: ts(resetMs) })
    }
  ];
}

/** 输送期间周期刷新 movement_x，避免运行时 5 秒断流保护让货箱停在半程。 */
function createConveyorTransferKeepAliveMessages({ startMs, stopMs, timestampAt }) {
  const messages = [];
  for (let atMs = startMs + CONVEYOR_ACTION_HEARTBEAT_MS; atMs < stopMs; atMs += CONVEYOR_ACTION_HEARTBEAT_MS) {
    messages.push({
      atMs,
      label: `${CONVEYOR_ID} 链条输送动作保活`,
      topic: conveyorJointTopic,
      payload: createConveyorPlcPayload({ movement_x: 1, signalBits: 1, container_quantity: 1 }, timestampAt(atMs))
    });
  }
  return messages;
}

/** 创建前端有货来箱信号；signalBits bit0 让运行态 cube 使用新协议前端光电触发。 */
function createConveyorFrontCargoPayload(timestamp) {
  return createConveyorPlcPayload({ signalBits: 1, container_quantity: 1 }, timestamp);
}

/** 创建链条机前后端有货状态，新协议 signalBits bit0/bit3 对应前后端光电。 */
function createConveyorCargoSignalPayload({ frontHasCargo, rearHasCargo, timestamp }) {
  const signalBits = (frontHasCargo ? 1 : 0) | (rearHasCargo ? 1 << 3 : 0);
  return createConveyorPlcPayload({ signalBits, container_quantity: signalBits === 0 ? 0 : 1 }, timestamp);
}

/** 创建辊道机/链条机现场 PLC 完整点位包，外层保持 data + ts 形态供 dry-run 和实发复核。 */
function createConveyorPlcPayload(overrides, timestamp) {
  const values = {
    deviceCode: CONVEYOR_ID,
    mode: 2,
    action: 0,
    task: CONVEYOR_TASK_CODE,
    movement_x: 0,
    movement_y: 0,
    signalBits: 0,
    containerCode: CONVEYOR_CONTAINER_CODE,
    workingHours_x: 0,
    workingHours_y: 0,
    normal: true,
    errorCode: 0,
    message: "正常",
    layer: 0,
    rotation: 0,
    container_quantity: 0,
    folding: 0,
    flip: 0,
    fork: 0,
    result: 0,
    result2: 0,
    ...overrides
  };

  return {
    data: CONVEYOR_PLC_FIELD_ORDER.map((pointName) => ({ e: CONVEYOR_ID, p: pointName, v: values[pointName] })),
    ts: createIsoTimestamp(timestamp)
  };
}

/** 创建 DDJ2 行走目标帧，目标资产和锚点由运行时按场景模型实时推导。 */
function createStackerTravelTargetPayload({ target, anchor, movementX, timestamp }) {
  return [
    { e: STACKER_ID, p: "movement_x", v: movementX, ts: timestamp },
    { e: STACKER_ID, p: "travel_target", v: target, ts: timestamp },
    { e: STACKER_ID, p: "target_anchor", v: anchor, ts: timestamp }
  ];
}

/** 创建 DDJ2 货叉目标帧；target=home 表示回到模型原位。 */
function createStackerForkTargetPayload({ target, anchor, action, timestamp }) {
  return [
    { e: STACKER_ID, p: "front_movement_z", v: action, ts: timestamp },
    { e: STACKER_ID, p: "back_movement_z", v: action, ts: timestamp },
    { e: STACKER_ID, p: "fork_target", v: target, ts: timestamp },
    { e: STACKER_ID, p: "fork_anchor", v: anchor, ts: timestamp }
  ];
}

/** 输出完整报文序列，供现场实施人员复制或审阅。 */
function printDryRun() {
  const messages = createSceneMessages(STATIC_BASE_TS);
  console.log(
    `${CONVEYOR_ID}-${STACKER_ID}-${LOCATOR_ID} 场景 MQTT 报文 dry-run（${SCENE_PROTOCOL}，wrap=${PAYLOAD_WRAP}，conveyor=${CONVEYOR_ID}，stacker=${STACKER_ID}）：`
  );
  console.log(`场景文件：${sceneLayout.scenePath}`);
  console.log(`运行态货箱：${BOX_ID}；链条机输送等待：${sceneLayout.conveyorTransferDurationMs}ms；脚本不发布货箱位姿帧。`);
  messages.forEach((message, index) => {
    const payload = createPublishPayload(message);
    console.log(`\n# ${index + 1}. ${message.label} (+${message.atMs}ms)`);
    console.log(`Topic: ${message.topic}`);
    console.log(JSON.stringify(payload, null, 2));
  });
}

/** 启动本地 WebSocket 服务，供编辑器 WebSocket 数据源订阅。 */
function startWebSocketServer() {
  if (NO_WS) {
    return null;
  }

  const server = http.createServer((request, response) => {
    response.writeHead(404);
    response.end("Stacker scene demo WebSocket only.\n");
  });

  server.on("upgrade", (request, socket) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `${WS_HOST}:${WS_PORT}`}`);
    if (requestUrl.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }

    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }

    const acceptKey = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey}`,
        "",
        ""
      ].join("\r\n")
    );
    websocketClients.add(socket);
    console.log(`编辑器已连接 Stacker 场景 WebSocket，${START_DELAY_MS}ms 后开始播放。`);
    socket.on("data", (data) => handleWebSocketClientFrame(socket, data));
    socket.on("close", () => websocketClients.delete(socket));
    socket.on("error", () => websocketClients.delete(socket));
    requestPlaybackStart();
  });

  server.listen(WS_PORT, WS_HOST, () => {
    console.log(`Stacker 场景 WebSocket 已启动：ws://${WS_HOST}:${WS_PORT}${WS_PATH}`);
    console.log("推荐在编辑器中使用 WebSocket 数据源连接该地址；脚本会在首个客户端连接后播放一次。");
  });
  server.on("error", (error) => {
    console.error(`WebSocket 服务启动失败：${error.message}`);
    process.exitCode = 1;
    shutdown({ gracefulMqtt: false });
  });
  webSocketServer = server;
  return server;
}

/** 处理编辑器发来的订阅请求和关闭帧。 */
function handleWebSocketClientFrame(socket, data) {
  const opcode = data[0] & 0x0f;
  if (opcode === 0x8) {
    socket.end();
    websocketClients.delete(socket);
  }
}

/** 请求启动播放，避免多个 WebSocket 客户端重复触发。 */
function requestPlaybackStart() {
  if (playbackStarted || startTimer) {
    return;
  }

  startTimer = setTimeout(() => {
    startTimer = null;
    startPlayback();
  }, START_DELAY_MS);
}

/** 按相对时间调度完整报文流程。 */
function startPlayback() {
  if (playbackStarted && !LOOP_PLAYBACK) {
    return;
  }

  playbackStarted = true;
  playbackGeneration += 1;
  const generation = playbackGeneration;
  const baseTimestamp = DYNAMIC_TS ? Date.now() : STATIC_BASE_TS;
  const messages = createSceneMessages(baseTimestamp);
  console.log(`开始播放 Stacker 场景报文，共 ${messages.length} 帧。`);

  messages.forEach((message) => {
    const timer = setTimeout(() => {
      scheduledTimers.delete(timer);
      if (generation !== playbackGeneration || isShuttingDown) {
        return;
      }
      publishSceneMessage(message);
    }, Math.round(message.atMs / TIME_SCALE));
    scheduledTimers.add(timer);
  });

  const lastAtMs = messages[messages.length - 1]?.atMs ?? 0;
  const finishTimer = setTimeout(() => {
    scheduledTimers.delete(finishTimer);
    if (generation !== playbackGeneration || isShuttingDown) {
      return;
    }
    console.log("Stacker 场景报文播放完成。");
    if (LOOP_PLAYBACK) {
      playbackStarted = false;
      requestPlaybackStart();
      return;
    }
    shutdown({ gracefulMqtt: true });
  }, Math.round((lastAtMs + 600) / TIME_SCALE));
  scheduledTimers.add(finishTimer);
}

/** 发布单帧报文到 MQTT，并向本地 WebSocket 广播同一份 JSON。 */
function publishSceneMessage(message) {
  const payload = createPublishPayload(message);
  const payloadText = JSON.stringify(payload);
  if (mqttReady && mqttSocket?.writable) {
    mqttSocket.write(createPublishPacket(message.topic, payloadText));
  } else if (!NO_MQTT) {
    console.warn(`MQTT 未连接，已跳过真实发布：${message.topic}`);
  }

  broadcastWebSocketText(payloadText);
  console.log(`发送：${message.label} -> ${message.topic} ${payloadText}`);
}

/** 创建实际发送 payload，PLC 模式会把标准点位转换成现场 bitfield。 */
function createPublishPayload(message) {
  const payload = PLC_MODE && message.plcConvertible ? convertPayloadToPlc(message.payload) : message.payload;
  if (isWrappedPayload(payload)) {
    return payload;
  }
  if (PAYLOAD_WRAP === "none") {
    return payload;
  }
  return {
    [PAYLOAD_WRAP]: payload,
    ts: createPayloadTimestamp(message.payload)
  };
}

/** 判断 payload 是否已经是现场 data/payload/message 外层包，避免二次包装破坏示例结构。 */
function isWrappedPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return ["data", "payload", "message"].some((key) => Array.isArray(value[key])) && value.ts !== undefined;
}

/** 将标准 joint 数组转换为 DDJ2 PLC 点位数组，非数组位姿帧保持原字段。 */
function convertPayloadToPlc(payload) {
  if (!Array.isArray(payload)) {
    return payload;
  }

  const records = [{ e: STACKER_ID, p: "deviceCode", v: STACKER_DEVICE_CODE }];
  payload.forEach((record) => {
    if (!record || typeof record !== "object") {
      return;
    }

    const pointName = String(record.p ?? "");
    if (pointName === "movement_x") {
      records.push(createPlcRecord("action", createTravelBitfieldFromAction(record.v)));
      return;
    }
    if (pointName === "movement_y") {
      const liftBitfield = createLiftBitfieldFromAction(record.v);
      records.push(createPlcRecord("front_action", liftBitfield), createPlcRecord("back_action", liftBitfield));
      return;
    }
    if (pointName === "front_movement_z") {
      records.push(createPlcRecord("front_forkAction", createForkBitfieldFromAction(record.v)));
      return;
    }
    if (pointName === "back_movement_z") {
      records.push(createPlcRecord("back_forkAction", createForkBitfieldFromAction(record.v)));
      return;
    }

    records.push(createPlcRecord(pointName, record.v));
  });
  return records;
}

/** 创建单条 PLC 点位记录，保持 e=DDJ2 作为模型匹配号。 */
function createPlcRecord(pointName, value) {
  return { e: STACKER_ID, p: pointName, v: value };
}

/** 标准 action 1/2/0 转 PLC 行走位域：bit0 前进，bit1 后退。 */
function createTravelBitfieldFromAction(value) {
  const action = readActionNumber(value);
  if (action === 1) {
    return 1 << 0;
  }
  if (action === 2) {
    return 1 << 1;
  }
  return 0;
}

/** 标准 action 1/2/0 转 PLC 升降位域：bit2 上升，bit3 下降。 */
function createLiftBitfieldFromAction(value) {
  const action = readActionNumber(value);
  if (action === 1) {
    return 1 << 2;
  }
  if (action === 2) {
    return 1 << 3;
  }
  return 0;
}

/** 标准伸缩 action 转 PLC 货叉位域：bit1 向右伸叉，bit4 向右缩叉。 */
function createForkBitfieldFromAction(value) {
  const action = readActionNumber(value);
  if (action === 1 || action === 3) {
    return 1 << 1;
  }
  if (action === 2 || action === 4) {
    return 1 << 4;
  }
  return 0;
}

/** 读取 action 枚举，非法值按停止处理，避免 dry-run 生成 NaN。 */
function readActionNumber(value) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : 0;
}

/** 从原始 payload 提取时间戳并输出附件同款 ISO 字符串。 */
function createPayloadTimestamp(payload) {
  const value = Array.isArray(payload) ? payload.find((record) => record && typeof record === "object" && record.ts !== undefined)?.ts : payload?.ts;
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  const timestamp = Number.isFinite(numericValue) ? numericValue : STATIC_BASE_TS;
  return createIsoTimestamp(timestamp);
}

/** 按脚本统一格式输出 ISO 时间字符串，便于和现场 ts 字段对齐。 */
function createIsoTimestamp(timestamp) {
  return new Date(timestamp).toISOString();
}

/** 向所有已连接编辑器广播文本消息。 */
function broadcastWebSocketText(text) {
  if (NO_WS || websocketClients.size === 0) {
    return;
  }

  const frame = createWebSocketTextFrame(text);
  websocketClients.forEach((socket) => {
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

/** 清理计时器、MQTT 连接和 WebSocket 客户端。 */
function shutdown({ gracefulMqtt = false } = {}) {
  isShuttingDown = true;
  clearTimer(startTimer);
  clearTimer(reconnectTimer);
  startTimer = null;
  reconnectTimer = null;
  scheduledTimers.forEach((timer) => clearTimeout(timer));
  scheduledTimers.clear();
  websocketClients.forEach((socket) => socket.destroy());
  websocketClients.clear();
  webSocketServer?.close();
  webSocketServer = null;
  if (gracefulMqtt) {
    mqttSocket?.end();
  } else {
    mqttSocket?.destroy();
  }
  mqttSocket = null;
  mqttReadBuffer = Buffer.alloc(0);
}

/** 清理单个计时器。 */
function clearTimer(timer) {
  if (timer) {
    clearTimeout(timer);
  }
}

process.on("SIGINT", () => {
  console.log("正在停止 Stacker 场景 MQTT 报文脚本。");
  shutdown({ gracefulMqtt: false });
  process.exit(0);
});

if (DRY_RUN) {
  printDryRun();
} else {
  connectMqtt();
  startWebSocketServer();
  if (AUTOSTART || NO_WS) {
    requestPlaybackStart();
  }
}
