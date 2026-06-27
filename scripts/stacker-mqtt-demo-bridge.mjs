import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";

const MQTT_HOST = process.env.STACKER_DEMO_MQTT_HOST ?? "192.168.60.154";
const MQTT_PORT = Number(process.env.STACKER_DEMO_MQTT_PORT ?? 1883);
const WS_HOST = process.env.STACKER_DEMO_WS_HOST ?? "127.0.0.1";
const WS_PORT = Number(process.env.STACKER_DEMO_WS_PORT ?? 18083);
const WS_PATH = process.env.STACKER_DEMO_WS_PATH ?? "/stacker";
const DEVICE_ID = process.env.STACKER_DEMO_DEVICE_ID ?? "DDJ2";
const MQTT_TOPIC = process.env.STACKER_DEMO_TOPIC ?? `dt/factory/logistics/stacker/${DEVICE_ID}/twindatadriven/joint`;
const DEMO_DEVICE_CODE = process.env.STACKER_DEMO_DEVICE_CODE ?? "1";
const DEMO_CARGO_ID = process.env.STACKER_DEMO_CARGO_ID ?? "Box01";
const PUBLISH_INTERVAL_MS = Number(process.env.STACKER_DEMO_INTERVAL_MS ?? 500);
const DEMO_PROTOCOL = normalizeDemoProtocol(process.env.STACKER_DEMO_PROTOCOL ?? "plc");
const PAYLOAD_WRAP = normalizePayloadWrap(process.env.STACKER_DEMO_PAYLOAD_WRAP ?? "data");
const MQTT_KEEP_ALIVE_SECONDS = 30;
const ONCE_MODE = process.argv.includes("--once") || process.env.STACKER_DEMO_ONCE === "1";
const STACKER_BASE_FRONT_SIGNAL_BITS = 512;
const STACKER_BASE_RPM_X = 10;
const STACKER_BASE_DISTANCE_X = 52.1954;
const STACKER_BASE_DISTANCE_Y = 0.3563;
const STACKER_PLC_FIELD_ORDER = [
  "deviceCode",
  "front_command",
  "mode",
  "back_command",
  "front_z",
  "front_x",
  "front_y",
  "front_task",
  "back_task",
  "front_containerCode",
  "back_containerCode",
  "signalBits",
  "front_signalBits",
  "back_signalBits",
  "movement_x",
  "movement_y",
  "front_movement_z",
  "back_movement_z",
  "rpm_x",
  "rpm_y",
  "front_rpm_z",
  "back_rpm_z",
  "distance_x",
  "distance_y",
  "front_distance_z",
  "back_distance_z",
  "workingHours_x",
  "workingHours_y",
  "front_workingHours_z",
  "back_workingHours_z",
  "normal",
  "errorCode",
  "message",
  "to_z",
  "to_x",
  "to_y"
];
const STACKER_PLC_DEFAULT_VALUES = {
  deviceCode: DEMO_DEVICE_CODE,
  front_command: 0,
  mode: 4,
  back_command: 9,
  front_z: 0,
  front_x: 43,
  front_y: 1,
  front_task: 0,
  back_task: 0,
  front_containerCode: "",
  back_containerCode: "",
  signalBits: 0,
  front_signalBits: STACKER_BASE_FRONT_SIGNAL_BITS,
  back_signalBits: 0,
  movement_x: 0,
  movement_y: 0,
  front_movement_z: 0,
  back_movement_z: 0,
  rpm_x: STACKER_BASE_RPM_X,
  rpm_y: 0,
  front_rpm_z: 0,
  back_rpm_z: 0,
  distance_x: STACKER_BASE_DISTANCE_X,
  distance_y: STACKER_BASE_DISTANCE_Y,
  front_distance_z: 0,
  back_distance_z: 0,
  workingHours_x: 0,
  workingHours_y: 0,
  front_workingHours_z: 0,
  back_workingHours_z: 0,
  normal: true,
  errorCode: 0,
  message: "正常",
  to_z: 0,
  to_x: 0,
  to_y: 0
};

const textEncoder = new TextEncoder();
const websocketClients = new Set();
let mqttSocket = null;
let mqttReady = false;
let reconnectTimer = null;
let publishTimer = null;
let webSocketServer = null;
let onceTimeout = null;
let mqttReadBuffer = Buffer.alloc(0);
let isShuttingDown = false;
let startedAt = Date.now();
let publishCount = 0;

/** 归一化 demo 协议模式，默认按现场 DDJ2 PLC 点位输出。 */
function normalizeDemoProtocol(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === "standard" || normalized === "legacy" ? "standard" : "plc";
}

/** 归一化 payload 外层包装，none 可恢复旧裸数组格式。 */
function normalizePayloadWrap(value) {
  const normalized = value.trim().toLowerCase();
  return ["none", "data", "payload", "message"].includes(normalized) ? normalized : "data";
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
  const clientId = `stacker-demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

/** 连接普通 TCP MQTT broker，用于把 demo 数据发布到真实 topic。 */
function connectMqtt() {
  if (isShuttingDown) {
    return;
  }

  windowClearTimeout(reconnectTimer);
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
    if (!ONCE_MODE && !isShuttingDown) {
      reconnectTimer = setTimeout(connectMqtt, 2000);
    }
  });
}

/** 按 MQTT 剩余长度字段读取一个完整控制包长度；TCP 分片时返回 null 等待后续数据。 */
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

/** 缓冲并处理 MQTT 控制包，避免 TCP 分片导致 CONNACK 解析失败。 */
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

/** 处理完整 MQTT CONNACK，连接成功后开始发布 demo 数据。 */
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
  if (ONCE_MODE) {
    windowClearTimeout(onceTimeout);
    publishDemoFrame();
    shutdown({ gracefulMqtt: true });
  }
}

/** 根据时间生成可视化明显的 Stacker 动作帧，并在伸叉端点发送货箱取放事件。 */
function createStackerFrame(ts = Date.now()) {
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const travelPhase = elapsedSeconds * 0.65;
  const liftPhase = elapsedSeconds * 1.1;
  const cargoPhase = Math.sin(liftPhase + Math.PI / 3);
  const forkAction = createMovementAction(cargoPhase);
  if (DEMO_PROTOCOL === "plc") {
    return createPlcStackerFrame(ts, travelPhase, liftPhase, forkAction, cargoPhase);
  }

  const frame = [
    { e: DEVICE_ID, p: "movement_x", v: createMovementAction(Math.sin(travelPhase)), ts },
    { e: DEVICE_ID, p: "movement_y", v: createMovementAction(Math.sin(liftPhase)), ts },
    { e: DEVICE_ID, p: "front_movement_z", v: forkAction, ts },
    { e: DEVICE_ID, p: "back_movement_z", v: forkAction, ts }
  ];
  const cargoAction = cargoPhase > 0.92 ? "pickup" : cargoPhase < -0.92 ? "drop" : "";
  if (cargoAction) {
    frame.push({ e: DEVICE_ID, p: "cargo_action", v: cargoAction, ts }, { e: DEVICE_ID, p: "cargo", v: DEMO_CARGO_ID, ts });
  }
  return frame;
}

/** 按现场 DDJ2 点位表生成完整报文，动作字段直接使用 movement_* 新协议。 */
function createPlcStackerFrame(ts, travelPhase, liftPhase, forkAction, cargoPhase) {
  const extensionRecords = [];
  const cargoAction = cargoPhase > 0.92 ? "pickup" : cargoPhase < -0.92 ? "drop" : "";
  if (cargoAction) {
    extensionRecords.push(createStackerPlcRecord("cargo_action", cargoAction), createStackerPlcRecord("cargo", DEMO_CARGO_ID));
  }
  return createStackerPlcPayload(
    {
      movement_x: createMovementAction(Math.sin(travelPhase)),
      movement_y: createMovementAction(Math.sin(liftPhase)),
      front_movement_z: forkAction,
      back_movement_z: forkAction,
      distance_x: createTravelDistanceValue(travelPhase),
      distance_y: createLiftDistanceMeters(liftPhase),
      front_distance_z: createForkDistanceMeters(cargoPhase),
      back_distance_z: createForkDistanceMeters(cargoPhase)
    },
    ts,
    extensionRecords
  );
}

/** 创建 DDJ2 现场完整点位包，业务扩展点位附加在 data 末尾。 */
function createStackerPlcPayload(overrides, ts, extensionRecords = []) {
  const values = {
    ...STACKER_PLC_DEFAULT_VALUES,
    deviceCode: DEMO_DEVICE_CODE,
    ...overrides
  };
  return {
    data: [
      ...STACKER_PLC_FIELD_ORDER.map((pointName) => createStackerPlcRecord(pointName, values[pointName])),
      ...extensionRecords
    ],
    ts: formatShanghaiTimestamp(ts)
  };
}

/** 创建单条 DDJ2 点位记录，保持 e=DDJ2 作为模型匹配号。 */
function createStackerPlcRecord(pointName, value) {
  return { e: DEVICE_ID, p: pointName, v: value };
}

/** 生成 Stacker 行走绝对距离，围绕现场基准值小范围变化。 */
function createTravelDistanceValue(travelPhase) {
  return Number((STACKER_BASE_DISTANCE_X + 0.8 * Math.sin(travelPhase)).toFixed(4));
}

/** 生成载货台米制高度，保持为新协议 distance_y 浮点值。 */
function createLiftDistanceMeters(liftPhase) {
  return Number((STACKER_BASE_DISTANCE_Y + 0.3 * ((Math.sin(liftPhase) + 1) / 2)).toFixed(4));
}

/** 生成货叉米制伸缩距离，当前 demo 前后叉同值便于观察。 */
function createForkDistanceMeters(cargoPhase) {
  return Number((0.55 * ((cargoPhase + 1) / 2)).toFixed(4));
}

/** 把周期函数转换为协议动作枚举：1 正向，2 反向，0 静止。 */
function createMovementAction(value) {
  if (value > 0.2) {
    return 1;
  }
  if (value < -0.2) {
    return 2;
  }
  return 0;
}

/** 按现场附件格式包装 payload，必要时可通过环境变量恢复裸数组。 */
function wrapDemoPayload(payload, ts) {
  if (PAYLOAD_WRAP === "none") {
    return payload;
  }
  return {
    [PAYLOAD_WRAP]: payload,
    ts: formatShanghaiTimestamp(ts)
  };
}

/** 按东八区输出现场报文时间，便于和 DDJ2 实际 ts 格式对齐。 */
function formatShanghaiTimestamp(timestamp) {
  const shanghaiTime = new Date(timestamp + 8 * 60 * 60 * 1000);
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return [
    `${shanghaiTime.getUTCFullYear()}-${pad(shanghaiTime.getUTCMonth() + 1)}-${pad(shanghaiTime.getUTCDate())}`,
    `T${pad(shanghaiTime.getUTCHours())}:${pad(shanghaiTime.getUTCMinutes())}:${pad(shanghaiTime.getUTCSeconds())}`,
    `.${pad(shanghaiTime.getUTCMilliseconds(), 3)}+08:00`
  ].join("");
}

/** 发布并广播一帧 demo 数据。 */
function publishDemoFrame() {
  const ts = Date.now();
  const payload = createStackerFrame(ts);
  const payloadText = JSON.stringify(PAYLOAD_WRAP === "none" || DEMO_PROTOCOL === "plc" ? payload : wrapDemoPayload(payload, ts));
  if (mqttReady) {
    mqttSocket.write(createPublishPacket(MQTT_TOPIC, payloadText));
  }
  broadcastWebSocketText(payloadText);
  publishCount += 1;
  if (ONCE_MODE || publishCount % 10 === 0) {
    console.log(`发送 Stacker demo 数据：${payloadText}`);
  }
}

/** 启动本地 WebSocket 服务，供编辑器 WebSocket 数据源订阅。 */
function startWebSocketServer() {
  const server = http.createServer((request, response) => {
    response.writeHead(404);
    response.end("Stacker demo WebSocket only.\n");
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
    socket.on("data", (data) => handleWebSocketClientFrame(socket, data));
    socket.on("close", () => websocketClients.delete(socket));
    socket.on("error", () => websocketClients.delete(socket));
  });

  server.listen(WS_PORT, WS_HOST, () => {
    console.log(`Stacker demo WebSocket 已启动：ws://${WS_HOST}:${WS_PORT}${WS_PATH}`);
    console.log(`编辑器 Topic 可填：${MQTT_TOPIC}`);
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

/** 向所有已连接编辑器广播文本消息。 */
function broadcastWebSocketText(text) {
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
  windowClearInterval(publishTimer);
  windowClearTimeout(reconnectTimer);
  windowClearTimeout(onceTimeout);
  publishTimer = null;
  reconnectTimer = null;
  onceTimeout = null;
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

/** 兼容 Node 环境的 clearTimeout 包装。 */
function windowClearTimeout(timer) {
  if (timer) {
    clearTimeout(timer);
  }
}

/** 兼容 Node 环境的 clearInterval 包装。 */
function windowClearInterval(timer) {
  if (timer) {
    clearInterval(timer);
  }
}

process.on("SIGINT", () => {
  console.log("正在停止 Stacker demo 桥接。");
  shutdown({ gracefulMqtt: false });
  process.exit(0);
});

connectMqtt();
if (!ONCE_MODE) {
  startWebSocketServer();
  publishTimer = setInterval(publishDemoFrame, PUBLISH_INTERVAL_MS);
} else {
  onceTimeout = setTimeout(() => {
    console.error("一次性 Stacker demo 发布超时，请检查 MQTT broker 是否可用。");
    shutdown();
    process.exit(1);
  }, 5000);
}
