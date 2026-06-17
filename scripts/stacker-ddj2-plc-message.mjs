import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";

const DEVICE_ID = process.env.STACKER_DDJ2_DEVICE_ID ?? "DDJ2";
const DEVICE_CODE = process.env.STACKER_DDJ2_DEVICE_CODE ?? "1";
const MQTT_HOST = process.env.STACKER_DDJ2_MQTT_HOST ?? "192.168.60.154";
const MQTT_PORT = readNumberOption("STACKER_DDJ2_MQTT_PORT", 1883, 1);
const MQTT_TOPIC = process.env.STACKER_DDJ2_TOPIC ?? `dt/factory/logistics/stacker/${DEVICE_ID}/twindatadriven/joint`;
const WS_HOST = process.env.STACKER_DDJ2_WS_HOST ?? "127.0.0.1";
const WS_PORT = readNumberOption("STACKER_DDJ2_WS_PORT", 18085, 1);
const WS_PATH = normalizeWebSocketPath(process.env.STACKER_DDJ2_WS_PATH ?? "/stacker-ddj2-plc");
const INTERVAL_MS = readNumberOption("STACKER_DDJ2_INTERVAL_MS", 1000, 100);
const MQTT_KEEP_ALIVE_SECONDS = 30;
const ONCE_MQTT_WAIT_MS = 3000;
const DRY_RUN = process.argv.includes("--dry-run") || process.env.STACKER_DDJ2_DRY_RUN === "1";
const ONCE_MODE = process.argv.includes("--once") || process.env.STACKER_DDJ2_ONCE === "1";
const NO_MQTT = process.argv.includes("--no-mqtt") || process.env.STACKER_DDJ2_NO_MQTT === "1";
const NO_WS = process.argv.includes("--no-ws") || process.env.STACKER_DDJ2_NO_WS === "1";

const textEncoder = new TextEncoder();
const websocketClients = new Set();
let mqttSocket = null;
let mqttReady = false;
let mqttReadBuffer = Buffer.alloc(0);
let reconnectTimer = null;
let publishTimer = null;
let onceFallbackTimer = null;
let webSocketServer = null;
let frameIndex = 0;
let isShuttingDown = false;

const BASE_RECORDS = [
  ["device_code", DEVICE_CODE],
  ["mode", "4"],
  ["stacker_error", "0"],
  ["move", "0"],
  ["action", "0"],
  ["special1", "0"],
  ["special2", "0"],
  ["stacker_electric Current", "0"],
  ["stacker_workingHours", "0"],
  ["stacker_runing time", "0"],
  ["front_command", "1"],
  ["front_task", "10721"],
  ["front_Yerror", "0"],
  ["front_Zerror", "0"],
  ["front_column", "31"],
  ["front_layer", "1"],
  ["front_row", "2"],
  ["front_cargoMove", "0"],
  ["front_cargoError", "0"],
  ["front_forkCargo", "0"],
  ["front_forkCargo1", "false"],
  ["front_forkLocation", "0"],
  ["front_forkAction", "0"],
  ["front_trayCode", ""],
  ["front_y_electric Current", "0"],
  ["front_y_workingHours", "0"],
  ["front_y_runingTimes", "0"],
  ["front_z_electric Current", "0"],
  ["front_z_workingHours", "0"],
  ["front_z_runingTimes", "0"],
  ["back_command", "9"],
  ["back_task", "0"],
  ["back_Yerror", "0"],
  ["back_Zerror", "0"],
  ["back_column", "31"],
  ["back_layer", "1"],
  ["back_row", "2"],
  ["back_cargoMove", "0"],
  ["back_action", "4"],
  ["back_cargoError", "0"],
  ["back_forkCargo", "0"],
  ["back_forkCargo1", "false"],
  ["back_forkLocation", "0"],
  ["back_forkAction", "0"],
  ["back_trayCode", ""],
  ["back_y_electric Current", "0"],
  ["back_y_workingHours", "0"],
  ["back_y_runingTimes", "0"],
  ["back_z_electric Current", "0"],
  ["back_z_workingHours", "0"],
  ["back_z_runingTimes", "0"],
  ["storage_cache", "0"]
];

const MOTION_STEPS = [
  {
    label: "附件原始状态：后叉升降上升",
    overrides: {}
  },
  {
    label: "行走前进",
    overrides: { action: "1", back_action: "0" }
  },
  {
    label: "行走停止",
    overrides: { action: "0", back_action: "0" }
  },
  {
    label: "载货台下降",
    overrides: { back_action: "8" }
  },
  {
    label: "货叉伸出",
    overrides: { back_action: "0", front_forkAction: "2", back_forkAction: "2" }
  },
  {
    label: "货叉停止",
    overrides: { front_forkAction: "0", back_forkAction: "0" }
  },
  {
    label: "货叉缩回",
    overrides: { front_forkAction: "4", back_forkAction: "4" }
  },
  {
    label: "全机构停止",
    overrides: { action: "0", back_action: "0", front_forkAction: "0", back_forkAction: "0" }
  }
];

/** 读取有限数字环境变量，非法值回退默认值，避免端口和间隔变成 NaN。 */
function readNumberOption(name, fallback, minimum) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

/** 规范化 WebSocket 路径，兼容环境变量漏写开头斜杠。 */
function normalizeWebSocketPath(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") {
    return "/stacker-ddj2-plc";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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
  const clientId = `stacker-ddj2-plc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

/** 连接普通 TCP MQTT broker；连接失败不阻断本地 WebSocket 验证。 */
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
  if (ONCE_MODE) {
    clearTimer(onceFallbackTimer);
    onceFallbackTimer = null;
    publishFrame();
  }
}

/** 生成一帧新现场报文，保留附件字段集合，只覆盖动作点位。 */
function createStackerPlcPayload(step, timestampMs) {
  const overrides = step.overrides ?? {};
  return {
    data: BASE_RECORDS.map(([pointName, value]) => ({
      e: DEVICE_ID,
      p: pointName,
      v: overrides[pointName] ?? (pointName === "device_code" ? DEVICE_CODE : value)
    })),
    ts: formatShanghaiTimestamp(timestampMs)
  };
}

/** 输出东八区时间字符串，便于和现场附件时间格式对齐。 */
function formatShanghaiTimestamp(timestampMs) {
  const shanghaiTime = new Date(timestampMs + 8 * 60 * 60 * 1000);
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return [
    `${shanghaiTime.getUTCFullYear()}-${pad(shanghaiTime.getUTCMonth() + 1)}-${pad(shanghaiTime.getUTCDate())}`,
    `T${pad(shanghaiTime.getUTCHours())}:${pad(shanghaiTime.getUTCMinutes())}:${pad(shanghaiTime.getUTCSeconds())}`,
    `.${pad(shanghaiTime.getUTCMilliseconds(), 3)}+08:00`
  ].join("");
}

/** dry-run 打印每个动作阶段的新报文内容。 */
function printDryRun() {
  console.log("DDJ2 Stacker 新 PLC 报文 dry-run：");
  MOTION_STEPS.forEach((step, index) => {
    const payload = createStackerPlcPayload(step, Date.now() + index * INTERVAL_MS);
    console.log(`\n# ${index + 1}. ${step.label}`);
    console.log(`Topic: ${MQTT_TOPIC}`);
    console.log(JSON.stringify(payload, null, 2));
  });
}

/** 启动本地 WebSocket 服务，供编辑器直接订阅新报文。 */
function startWebSocketServer() {
  if (NO_WS) {
    return;
  }

  const server = http.createServer((_request, response) => {
    response.writeHead(404);
    response.end("DDJ2 Stacker PLC WebSocket only.\n");
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
    console.log("编辑器已连接 DDJ2 Stacker PLC WebSocket。");
    socket.on("data", (data) => handleWebSocketClientFrame(socket, data));
    socket.on("close", () => websocketClients.delete(socket));
    socket.on("error", () => websocketClients.delete(socket));
  });

  server.listen(WS_PORT, WS_HOST, () => {
    console.log(`DDJ2 Stacker PLC WebSocket 已启动：ws://${WS_HOST}:${WS_PORT}${WS_PATH}`);
  });
  server.on("error", (error) => {
    console.error(`WebSocket 服务启动失败：${error.message}`);
    process.exitCode = 1;
    shutdown({ gracefulMqtt: false });
  });
  webSocketServer = server;
}

/** 处理编辑器发来的关闭帧。 */
function handleWebSocketClientFrame(socket, data) {
  const opcode = data[0] & 0x0f;
  if (opcode === 0x8) {
    socket.end();
    websocketClients.delete(socket);
  }
}

/** 定时发布新现场报文到 MQTT 和本地 WebSocket。 */
function startPublishing() {
  if (ONCE_MODE && !NO_MQTT) {
    onceFallbackTimer = setTimeout(() => {
      onceFallbackTimer = null;
      console.warn(`等待 MQTT 连接超过 ${ONCE_MQTT_WAIT_MS}ms，仍输出一次本地报文。`);
      publishFrame();
    }, ONCE_MQTT_WAIT_MS);
    return;
  }

  publishFrame();
  if (!ONCE_MODE) {
    publishTimer = setInterval(publishFrame, INTERVAL_MS);
  }
}

/** 发布单帧新现场报文。 */
function publishFrame() {
  const step = MOTION_STEPS[frameIndex % MOTION_STEPS.length];
  frameIndex += 1;
  const payloadText = JSON.stringify(createStackerPlcPayload(step, Date.now()));

  if (mqttReady && mqttSocket?.writable) {
    mqttSocket.write(createPublishPacket(MQTT_TOPIC, payloadText));
  } else if (!NO_MQTT) {
    console.warn(`MQTT 未连接，已跳过真实发布：${MQTT_TOPIC}`);
  }

  broadcastWebSocketText(payloadText);
  console.log(`发送：${step.label} -> ${MQTT_TOPIC} ${payloadText}`);
  if (ONCE_MODE) {
    shutdown({ gracefulMqtt: true });
  }
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
  clearTimer(reconnectTimer);
  clearTimer(publishTimer);
  clearTimer(onceFallbackTimer);
  reconnectTimer = null;
  publishTimer = null;
  onceFallbackTimer = null;
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
  console.log("正在停止 DDJ2 Stacker PLC 报文脚本。");
  shutdown({ gracefulMqtt: false });
  process.exit(0);
});

if (DRY_RUN) {
  printDryRun();
} else {
  connectMqtt();
  startWebSocketServer();
  startPublishing();
}
