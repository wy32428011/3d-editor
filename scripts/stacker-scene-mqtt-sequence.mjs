import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";

const MQTT_HOST = process.env.STACKER_SCENE_MQTT_HOST ?? "192.168.60.154";
const MQTT_PORT = readNumberOption("STACKER_SCENE_MQTT_PORT", 1883, 1);
const WS_HOST = process.env.STACKER_SCENE_WS_HOST ?? "127.0.0.1";
const WS_PORT = readNumberOption("STACKER_SCENE_WS_PORT", 18084, 1);
const WS_PATH = normalizeWebSocketPath(process.env.STACKER_SCENE_WS_PATH ?? "/stacker-scene");
const SCENE_PROTOCOL = normalizeSceneProtocol(process.env.STACKER_SCENE_PROTOCOL ?? (process.argv.includes("--plc") ? "plc" : "standard"));
const PLC_MODE = SCENE_PROTOCOL === "plc";
const STACKER_ID = process.env.STACKER_SCENE_STACKER_ID ?? "DDJ2";
const STACKER_DEVICE_CODE = process.env.STACKER_SCENE_DEVICE_CODE ?? "1";
const CONVEYOR_ID = process.env.STACKER_SCENE_CONVEYOR_ID ?? "1005";
const BOX_ID = process.env.STACKER_SCENE_BOX_ID ?? "Box01";
const LOCATOR_ID = process.env.STACKER_SCENE_LOCATOR_ID ?? "1-1-1";
const BOX_FRONT_POSITION = readVectorOption("STACKER_SCENE_BOX_FRONT", { x: 11.85, y: 0.95, z: 1.39 });
const BOX_REAR_POSITION = readVectorOption("STACKER_SCENE_BOX_REAR", { x: 15.1, y: 0.95, z: 1.39 });
const STACKER_PICKUP_DISTANCE_X = readNumberOption("STACKER_SCENE_PICKUP_DISTANCE_X", -4.65, Number.NEGATIVE_INFINITY);
const STACKER_DROP_DISTANCE_X = readNumberOption("STACKER_SCENE_DROP_DISTANCE_X", 9.02, Number.NEGATIVE_INFINITY);
const STACKER_PICKUP_DISTANCE_Y = readNumberOption("STACKER_SCENE_PICKUP_DISTANCE_Y", 0, Number.NEGATIVE_INFINITY);
const STACKER_DROP_DISTANCE_Y = readNumberOption("STACKER_SCENE_DROP_DISTANCE_Y", 0, Number.NEGATIVE_INFINITY);
const STACKER_FORK_EXTEND = readNumberOption("STACKER_SCENE_FORK_EXTEND", 0.72, 0);
const STACKER_FORK_RETRACT = readNumberOption("STACKER_SCENE_FORK_RETRACT", 0, 0);
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
const conveyorStatusTopic = `dt/factory/logistics/conveyor/${CONVEYOR_ID}/twindatadriven/status`;
const boxPoseTopic = `dt/factory/logistics/material/${BOX_ID}/twinspawn`;

/** 读取有限数字环境变量，非法值回退默认值，避免调度或端口变成 NaN。 */
function readNumberOption(name, fallback, minimum) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

/** 读取 x,y,z 三轴位置环境变量，支持 JSON 或逗号分隔，非法值回退默认现场坐标。 */
function readVectorOption(name, fallback) {
  const rawValue = process.env[name];
  if (!rawValue || !rawValue.trim()) {
    return fallback;
  }

  const parsed = parseVectorOption(rawValue.trim());
  return parsed ?? fallback;
}

/** 解析位置环境变量，兼容 {"x":1,"y":2,"z":3} 和 "1,2,3" 两种写法。 */
function parseVectorOption(rawValue) {
  if (rawValue.startsWith("{")) {
    try {
      const value = JSON.parse(rawValue);
      const x = Number(value.x);
      const y = Number(value.y);
      const z = Number(value.z);
      return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
    } catch {
      return null;
    }
  }

  const parts = rawValue.split(",").map((part) => Number(part.trim()));
  return parts.length === 3 && parts.every(Number.isFinite) ? { x: parts[0], y: parts[1], z: parts[2] } : null;
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
  return [
    {
      atMs: 0,
      label: "初始化 DDJ2 位姿",
      topic: stackerPoseTopic,
      payload: { s: "ddj2-ready", e: STACKER_ID, ts: ts(0) }
    },
    {
      atMs: 100,
      label: `货箱 ${BOX_ID} 出现在链条机 ${CONVEYOR_ID} 前端`,
      topic: boxPoseTopic,
      payload: createBoxPosePayload("box-1005-front", BOX_FRONT_POSITION, ts(100))
    },
    {
      atMs: 200,
      label: `${CONVEYOR_ID} 前端有货信号`,
      topic: conveyorStatusTopic,
      payload: createConveyorStatusPayload({ frontHasCargo: true, rearHasCargo: false, timestamp: ts(200) })
    },
    {
      atMs: 300,
      label: `${CONVEYOR_ID} 绑定货箱 ${BOX_ID}`,
      topic: conveyorPayloadTopic,
      payload: [{ e: CONVEYOR_ID, p: "payload", v: BOX_ID, ts: ts(300) }]
    },
    {
      atMs: 500,
      label: `${CONVEYOR_ID} 启动链条输送`,
      topic: conveyorJointTopic,
      payload: [
        { e: CONVEYOR_ID, p: "movement_x", v: 1, ts: ts(500) },
        { e: CONVEYOR_ID, p: "front_has_cargo", v: true, ts: ts(500) },
        { e: CONVEYOR_ID, p: "rear_has_cargo", v: false, ts: ts(500) }
      ]
    },
    {
      atMs: 2300,
      label: `${CONVEYOR_ID} 后端有货并停止`,
      topic: conveyorJointTopic,
      payload: [
        { e: CONVEYOR_ID, p: "movement_x", v: 0, ts: ts(2300) },
        { e: CONVEYOR_ID, p: "front_has_cargo", v: false, ts: ts(2300) },
        { e: CONVEYOR_ID, p: "rear_has_cargo", v: true, ts: ts(2300) }
      ]
    },
    {
      atMs: 2400,
      label: `${BOX_ID} 到达 ${CONVEYOR_ID} 后端取货位`,
      topic: boxPoseTopic,
      payload: createBoxPosePayload("box-1005-rear", BOX_REAR_POSITION, ts(2400))
    },
    {
      atMs: 2600,
      label: "DDJ2 移动到 1005 后端取货位",
      topic: stackerJointTopic,
      payload: createStackerTravelPayload({
        movementX: 2,
        distanceX: STACKER_PICKUP_DISTANCE_X,
        distanceY: STACKER_PICKUP_DISTANCE_Y,
        timestamp: ts(2600)
      }),
      plcConvertible: true
    },
    {
      atMs: 8600,
      label: "DDJ2 到达 1005 后端并停止",
      topic: stackerJointTopic,
      payload: createStackerTravelPayload({
        movementX: 0,
        distanceX: STACKER_PICKUP_DISTANCE_X,
        distanceY: STACKER_PICKUP_DISTANCE_Y,
        timestamp: ts(8600)
      }),
      plcConvertible: true
    },
    {
      atMs: 8800,
      label: "DDJ2 货叉伸出到 1005 后端",
      topic: stackerJointTopic,
      payload: createStackerForkPayload({ action: 1, distance: STACKER_FORK_EXTEND, timestamp: ts(8800) }),
      plcConvertible: true
    },
    {
      atMs: 11200,
      label: "DDJ2 货叉接触货箱并绑定到载货台",
      topic: stackerJointTopic,
      payload: [
        { e: STACKER_ID, p: "front_movement_z", v: 0, ts: ts(11200) },
        { e: STACKER_ID, p: "back_movement_z", v: 0, ts: ts(11200) },
        { e: STACKER_ID, p: "front_distance_z", v: STACKER_FORK_EXTEND, ts: ts(11200) },
        { e: STACKER_ID, p: "back_distance_z", v: STACKER_FORK_EXTEND, ts: ts(11200) },
        { e: STACKER_ID, p: "payload", v: BOX_ID, ts: ts(11200) }
      ],
      plcConvertible: true
    },
    {
      atMs: 11400,
      label: "DDJ2 取货确认",
      topic: stackerJointTopic,
      payload: [
        { e: STACKER_ID, p: "cargo_action", v: "pickup", ts: ts(11400) },
        { e: STACKER_ID, p: "cargo", v: BOX_ID, ts: ts(11400) }
      ],
      plcConvertible: true
    },
    {
      atMs: 11600,
      label: "DDJ2 货叉缩回到载货台",
      topic: stackerJointTopic,
      payload: createStackerForkPayload({ action: 2, distance: STACKER_FORK_RETRACT, timestamp: ts(11600) }),
      plcConvertible: true
    },
    {
      atMs: 14000,
      label: "DDJ2 货叉缩回后停止",
      topic: stackerJointTopic,
      payload: createStackerForkPayload({ action: 0, distance: STACKER_FORK_RETRACT, timestamp: ts(14000) }),
      plcConvertible: true
    },
    {
      atMs: 14200,
      label: `DDJ2 移动到定位线框 ${LOCATOR_ID}`,
      topic: stackerJointTopic,
      payload: createStackerTravelPayload({
        movementX: 1,
        distanceX: STACKER_DROP_DISTANCE_X,
        distanceY: STACKER_DROP_DISTANCE_Y,
        timestamp: ts(14200)
      }),
      plcConvertible: true
    },
    {
      atMs: 31600,
      label: `DDJ2 到达定位线框 ${LOCATOR_ID} 并停止`,
      topic: stackerJointTopic,
      payload: createStackerTravelPayload({
        movementX: 0,
        distanceX: STACKER_DROP_DISTANCE_X,
        distanceY: STACKER_DROP_DISTANCE_Y,
        timestamp: ts(31600)
      }),
      plcConvertible: true
    },
    {
      atMs: 31800,
      label: `DDJ2 对准 ${LOCATOR_ID} 后伸叉`,
      topic: stackerJointTopic,
      payload: createStackerForkPayload({ action: 1, distance: STACKER_FORK_EXTEND, timestamp: ts(31800) }),
      plcConvertible: true
    },
    {
      atMs: 34400,
      label: `放入定位线框 ${LOCATOR_ID}`,
      topic: stackerJointTopic,
      payload: [
        { e: STACKER_ID, p: "front_movement_z", v: 0, ts: ts(34400) },
        { e: STACKER_ID, p: "back_movement_z", v: 0, ts: ts(34400) },
        { e: STACKER_ID, p: "front_distance_z", v: STACKER_FORK_EXTEND, ts: ts(34400) },
        { e: STACKER_ID, p: "back_distance_z", v: STACKER_FORK_EXTEND, ts: ts(34400) },
        { e: STACKER_ID, p: "cargo_action", v: "drop", ts: ts(34400) },
        { e: STACKER_ID, p: "cargo", v: BOX_ID, ts: ts(34400) },
        { e: STACKER_ID, p: "target", v: LOCATOR_ID, ts: ts(34400) }
      ],
      plcConvertible: true
    },
    {
      atMs: 34600,
      label: "DDJ2 放货后货叉缩回",
      topic: stackerJointTopic,
      payload: createStackerForkPayload({ action: 2, distance: STACKER_FORK_RETRACT, timestamp: ts(34600) }),
      plcConvertible: true
    },
    {
      atMs: 37000,
      label: "DDJ2 货叉缩回后停止",
      topic: stackerJointTopic,
      payload: createStackerForkPayload({ action: 0, distance: STACKER_FORK_RETRACT, timestamp: ts(37000) }),
      plcConvertible: true
    },
    {
      atMs: 37200,
      label: `${CONVEYOR_ID} 后端有货信号复位`,
      topic: conveyorStatusTopic,
      payload: createConveyorStatusPayload({ frontHasCargo: false, rearHasCargo: false, timestamp: ts(37200) })
    }
  ];
}

/** 创建货箱位姿帧；Box01 是编辑器 cube，使用 Babylon 世界坐标 x/y/z。 */
function createBoxPosePayload(sequenceId, position, timestamp) {
  return {
    s: sequenceId,
    e: BOX_ID,
    x: position.x,
    y: position.y,
    z: position.z,
    r: 0,
    ts: timestamp
  };
}

/** 创建链条机前后端有货状态，状态字段保留业务语义，运动仍由 movement_x 驱动。 */
function createConveyorStatusPayload({ frontHasCargo, rearHasCargo, timestamp }) {
  return [
    { e: CONVEYOR_ID, p: "front_has_cargo", v: frontHasCargo, ts: timestamp },
    { e: CONVEYOR_ID, p: "rear_has_cargo", v: rearHasCargo, ts: timestamp }
  ];
}

/** 创建 DDJ2 行走/升降校准帧，distance_x 使用当前编辑器运行时的米制偏移语义。 */
function createStackerTravelPayload({ movementX, distanceX, distanceY, timestamp }) {
  return [
    { e: STACKER_ID, p: "movement_x", v: movementX, ts: timestamp },
    { e: STACKER_ID, p: "distance_x", v: distanceX, ts: timestamp },
    { e: STACKER_ID, p: "movement_y", v: 0, ts: timestamp },
    { e: STACKER_ID, p: "distance_y", v: distanceY, ts: timestamp }
  ];
}

/** 创建 DDJ2 货叉伸缩帧，距离字段用于稳定落到伸出/缩回终点。 */
function createStackerForkPayload({ action, distance, timestamp }) {
  return [
    { e: STACKER_ID, p: "front_movement_z", v: action, ts: timestamp },
    { e: STACKER_ID, p: "back_movement_z", v: action, ts: timestamp },
    { e: STACKER_ID, p: "front_distance_z", v: distance, ts: timestamp },
    { e: STACKER_ID, p: "back_distance_z", v: distance, ts: timestamp }
  ];
}

/** 输出完整报文序列，供现场实施人员复制或审阅。 */
function printDryRun() {
  const messages = createSceneMessages(STATIC_BASE_TS);
  console.log(
    `1005-DDJ2-1-1-1 场景 MQTT 报文 dry-run（${SCENE_PROTOCOL}，wrap=${PAYLOAD_WRAP}，conveyor=${CONVEYOR_ID}，stacker=${STACKER_ID}）：`
  );
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
  if (PAYLOAD_WRAP === "none") {
    return payload;
  }
  return {
    [PAYLOAD_WRAP]: payload,
    ts: createPayloadTimestamp(message.payload)
  };
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
