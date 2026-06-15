import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";

const MQTT_HOST = process.env.STACKER_DEMO_MQTT_HOST ?? "192.168.60.154";
const MQTT_PORT = Number(process.env.STACKER_DEMO_MQTT_PORT ?? 1883);
const MQTT_TOPIC = process.env.STACKER_DEMO_TOPIC ?? "dt/factory/logistics/stacker/Stacker01/twindatadriven/joint";
const WS_HOST = process.env.STACKER_DEMO_WS_HOST ?? "127.0.0.1";
const WS_PORT = Number(process.env.STACKER_DEMO_WS_PORT ?? 18083);
const WS_PATH = process.env.STACKER_DEMO_WS_PATH ?? "/stacker";
const DEVICE_ID = process.env.STACKER_DEMO_DEVICE_ID ?? "Stacker01";
const DEMO_CARGO_ID = process.env.STACKER_DEMO_CARGO_ID ?? "Box01";
const PUBLISH_INTERVAL_MS = Number(process.env.STACKER_DEMO_INTERVAL_MS ?? 500);
const MQTT_KEEP_ALIVE_SECONDS = 30;
const ONCE_MODE = process.argv.includes("--once") || process.env.STACKER_DEMO_ONCE === "1";

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
function createStackerFrame() {
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const travelPhase = elapsedSeconds * 0.65;
  const liftPhase = elapsedSeconds * 1.1;
  const cargoPhase = Math.sin(liftPhase + Math.PI / 3);
  const forkAction = createMovementAction(cargoPhase);
  const ts = Date.now();
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

/** 发布并广播一帧 demo 数据。 */
function publishDemoFrame() {
  const payloadText = JSON.stringify(createStackerFrame());
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
