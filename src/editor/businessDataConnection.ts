import type { SceneDataConnectionStatusSnapshot, SceneDataDrivenSnapshot } from "../types/editor";

const MAX_DATA_MESSAGE_BYTES = 1024 * 1024;
const MQTT_KEEP_ALIVE_SECONDS = 30;
const MQTT_PROTOCOL_LEVEL = 4;
const MQTT_CLEAN_SESSION_FLAG = 0x02;
const MQTT_QOS1 = 1;
const DEFAULT_RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 8000;

/** 业务数据连接的统一能力，订阅和外发都走同一个生命周期。 */
export interface BusinessDataConnection {
  start: () => void;
  stop: () => void;
  sendJson: (payload: unknown) => void;
  publish: (topic: string, payload: unknown) => void;
}

/** 业务数据连接消息元数据，MQTT 会携带实际 PUBLISH topic 供上层归一化。 */
export interface BusinessDataMessageMetadata {
  mqttTopic?: string;
}

/** 业务数据连接回调，收到文本后交给调用方解析 JSON。 */
export interface BusinessDataConnectionOptions {
  onMessage: (text: string, metadata?: BusinessDataMessageMetadata) => void;
  onStatusChange?: (status: SceneDataConnectionStatusSnapshot) => void;
}

/** 按场景数据源配置创建 WebSocket 或 MQTT over WebSocket 连接。 */
export function createBusinessDataConnection(
  config: SceneDataDrivenSnapshot,
  options: BusinessDataConnectionOptions
): BusinessDataConnection | null {
  if (config.dataSourceType === "websocket") {
    return new JsonWebSocketBusinessConnection(config, options);
  }

  if (config.dataSourceType === "mqtt") {
    return new MqttWebSocketBusinessConnection(config, options);
  }

  return null;
}

/** 浏览器原生 WebSocket JSON 数据连接，兼容订阅和发送器 JSON 外发。 */
class JsonWebSocketBusinessConnection implements BusinessDataConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer = 0;
  private reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  private stopped = true;

  /** 创建 WebSocket 连接，收到文本或二进制文本后交给上层解析。 */
  public constructor(private readonly config: SceneDataDrivenSnapshot, private readonly options: BusinessDataConnectionOptions) {}

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
    this.emitStatus({ state: "idle", label: "连接已停止" });
  }

  /** 向已连接的 WebSocket 发送 JSON；未连接时丢弃，避免运行态阻塞编辑器。 */
  public sendJson(payload: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(payload));
  }

  /** WebSocket 没有 topic 发布语义，发送器会把 topic 包在 JSON 内。 */
  public publish(topic: string, payload: unknown): void {
    this.sendJson({ type: "publish", topic, payload });
  }

  /** 执行一次连接尝试。 */
  private connect(): void {
    try {
      this.emitStatus({ state: "connecting", label: "WebSocket 连接中" });
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
      console.warn("WebSocket 业务数据连接创建失败。", error);
      this.emitStatus({ state: "error", label: "WebSocket 连接失败", lastError: getConnectionErrorMessage(error) });
      this.scheduleReconnect();
    }
  }

  /** 连接建立后按约定发送轻量订阅消息。 */
  private handleOpen(): void {
    this.reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
    if (this.config.dataChannel.trim() && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "subscribe", channel: this.config.dataChannel.trim() }));
      this.emitStatus({ state: "subscribed", label: "WebSocket 已订阅" });
      return;
    }
    this.emitStatus({ state: "connected", label: "WebSocket 已连接" });
  }

  /** 统一处理 WebSocket 收到的文本或 ArrayBuffer。 */
  private async handleMessage(data: unknown): Promise<void> {
    if (typeof data === "string") {
      this.handleTextMessage(data);
      return;
    }

    if (data instanceof ArrayBuffer) {
      if (data.byteLength > MAX_DATA_MESSAGE_BYTES) {
        console.warn("WebSocket 业务数据二进制消息超过大小上限，已忽略。");
        return;
      }
      this.handleTextMessage(new TextDecoder("utf-8").decode(data));
      return;
    }

    if (data instanceof Blob) {
      if (data.size > MAX_DATA_MESSAGE_BYTES) {
        console.warn("WebSocket 业务数据 Blob 消息超过大小上限，已忽略。");
        return;
      }
      this.handleTextMessage(await data.text());
    }
  }

  /** 上报收到消息的时间，再把文本交给数据驱动运行时。 */
  private handleTextMessage(text: string): void {
    this.emitStatus({ state: "subscribed", label: "WebSocket 已收到数据", lastMessageAt: Date.now() });
    this.options.onMessage(text);
  }

  /** 在连接断开后按退避延迟重连。 */
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delay = this.reconnectDelayMs;
    this.emitStatus({ state: "reconnecting", label: `WebSocket ${Math.round(delay)}ms 后重连` });
    this.reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, this.reconnectDelayMs * 1.5);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0;
      this.connect();
    }, delay);
  }

  /** 连接状态只用于运行态界面展示，不进入场景文件。 */
  private emitStatus(status: SceneDataConnectionStatusSnapshot): void {
    this.options.onStatusChange?.(status);
  }
}

/** MQTT 3.1.1 over WebSocket 的最小业务客户端，支持订阅 JSON payload 和 QoS0 发布。 */
class MqttWebSocketBusinessConnection implements BusinessDataConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer = 0;
  private reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  private pingTimer = 0;
  private packetId = 1;
  private stopped = true;
  private connected = false;
  private readonly decoder = new TextDecoder("utf-8");

  /** 创建 MQTT over WebSocket 连接。 */
  public constructor(private readonly config: SceneDataDrivenSnapshot, private readonly options: BusinessDataConnectionOptions) {}

  /** 建立 MQTT WebSocket 连接。 */
  public start(): void {
    this.stopped = false;
    this.connect();
  }

  /** 发送断开包并释放 MQTT 连接资源。 */
  public stop(): void {
    this.stopped = true;
    this.connected = false;
    window.clearTimeout(this.reconnectTimer);
    window.clearInterval(this.pingTimer);
    this.reconnectTimer = 0;
    this.pingTimer = 0;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(new Uint8Array([0xe0, 0x00]));
    }
    this.socket?.close();
    this.socket = null;
    this.emitStatus({ state: "idle", label: "连接已停止" });
  }

  /** 按配置 topic 发布 JSON，供 POI 发送器复用。 */
  public sendJson(payload: unknown): void {
    this.publish(this.config.dataChannel.trim(), payload);
  }

  /** 发送 MQTT QoS0 PUBLISH 包，topic 为空时直接丢弃。 */
  public publish(topic: string, payload: unknown): void {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic || !this.connected || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    if (payloadBytes.byteLength > MAX_DATA_MESSAGE_BYTES) {
      console.warn("MQTT 业务数据发布 payload 超过大小上限，已忽略。");
      return;
    }

    this.sendMqttPacket(0x30, concatBytes([encodeMqttString(normalizedTopic), payloadBytes]));
  }

  /** 执行一次 MQTT WebSocket 连接尝试。 */
  private connect(): void {
    try {
      const endpoint = normalizeMqttWebSocketEndpoint(this.config.dataEndpoint.trim());
      this.emitStatus({ state: "connecting", label: "MQTT WebSocket 连接中" });
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
      console.warn("MQTT 业务数据连接创建失败。", error);
      this.emitStatus({ state: "error", label: "MQTT 连接失败", lastError: getConnectionErrorMessage(error) });
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
      this.emitStatus({ state: "error", label: "MQTT broker 拒绝连接", lastError: `CONNACK 返回码 ${returnCode}` });
      this.socket?.close();
      return;
    }

    this.connected = true;
    this.reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
    const topics = parseMqttTopicFilters(this.config.dataChannel);
    if (topics.length > 0) {
      this.sendSubscribePacket(topics);
      this.emitStatus({ state: "subscribed", label: topics.length > 1 ? `MQTT 已订阅 ${topics.length} 个 Topic` : "MQTT 已订阅 Topic" });
    } else {
      this.emitStatus({ state: "connected", label: "MQTT 已连接" });
    }
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.sendMqttPacket(0xc0, new Uint8Array()), MQTT_KEEP_ALIVE_SECONDS * 500);
  }

  /** 发送 MQTT SUBSCRIBE 包，数据驱动订阅按规范请求 QoS 1。 */
  private sendSubscribePacket(topics: string[]): void {
    const packetId = this.nextPacketId();
    const payload = concatBytes(topics.flatMap((topic) => [encodeMqttString(topic), new Uint8Array([MQTT_QOS1])]));
    const variableHeader = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
    this.sendMqttPacket(0x82, concatBytes([variableHeader, payload]));
  }

  /** 解析 MQTT PUBLISH 包并提取实际 topic 与文本 payload。 */
  private handlePublish(bytes: Uint8Array, offset: number, remainingLength: number, fixedHeader: number): void {
    const qos = (fixedHeader >> 1) & 0x03;
    const payloadEnd = offset + remainingLength;
    if (offset + 2 > bytes.length || offset + 2 > payloadEnd) {
      return;
    }

    const topicLength = (bytes[offset] << 8) | bytes[offset + 1];
    const topicStart = offset + 2;
    const topicEnd = topicStart + topicLength;
    if (topicEnd > payloadEnd || topicEnd > bytes.length) {
      return;
    }

    const topic = this.decoder.decode(bytes.slice(topicStart, topicEnd));
    let cursor = offset + 2 + topicLength;
    if (qos > 0) {
      if (cursor + 2 > payloadEnd || cursor + 2 > bytes.length) {
        return;
      }
      const packetId = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      if (qos === 1) {
        this.sendMqttPacket(0x40, new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]));
      }
    }

    if (cursor > payloadEnd) {
      return;
    }

    if (payloadEnd - cursor > MAX_DATA_MESSAGE_BYTES) {
      console.warn("MQTT 业务数据 payload 超过大小上限，已忽略。");
      return;
    }

    this.emitStatus({ state: "subscribed", label: "MQTT 已收到数据", lastMessageAt: Date.now() });
    this.options.onMessage(this.decoder.decode(bytes.slice(cursor, payloadEnd)), { mqttTopic: topic });
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
    this.connected = false;
    window.clearInterval(this.pingTimer);
    this.pingTimer = 0;
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    const delay = this.reconnectDelayMs;
    this.emitStatus({ state: "reconnecting", label: `MQTT ${Math.round(delay)}ms 后重连` });
    this.reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, this.reconnectDelayMs * 1.5);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = 0;
      this.connect();
    }, delay);
  }

  /** 连接状态只用于运行态界面展示，不进入场景文件。 */
  private emitStatus(status: SceneDataConnectionStatusSnapshot): void {
    this.options.onStatusChange?.(status);
  }
}

/** 提取连接异常文本，避免把未知对象直接显示到界面。 */
function getConnectionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "未知连接错误";
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

/** 解析 MQTT topic filter 列表，默认配置使用换行保存多个订阅。 */
function parseMqttTopicFilters(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n|,/)
        .map((topic) => topic.trim())
        .filter(Boolean)
    )
  ];
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
