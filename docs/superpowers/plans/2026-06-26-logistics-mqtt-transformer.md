# Logistics MQTT Transformer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个多设备配置驱动的物流 MQTT 报文转换器，把现场 PLC `{data:[{e,p,v}],ts}` 报文转换成编辑器数据驱动运行时可直接消费的标准 `dt/factory/logistics/{devType}/{deviceId}/twindatadriven/joint` 报文。

**Architecture:** 使用单个 Node.js `.mjs` 脚本作为转换引擎，读取 JSON 配置中的 `profiles/devices/maps`。转换逻辑保持独立纯函数，CLI 只负责 MQTT 订阅/发布、dry-run、一次性样例转换和进程清理。

**Tech Stack:** Node.js ESM、内置 `fs/http/net/crypto`，不新增 npm 依赖；验证以 `node --check`、dry-run/sample 转换和必要的 `npm run build` 为主。

---

## File Structure

- Create: `scripts/logistics-mqtt-transformer.config.json`
  - 多设备配置样例：连接、routing、profile、device、maps。
- Create: `scripts/logistics-mqtt-transformer.mjs`
  - 多设备转换器脚本，包含纯转换函数、MQTT 最小客户端、dry-run/sample 转换、可选 WebSocket 广播。
- Modify: `package.json`
  - 增加 `demo:logistics-transformer` 与 `demo:logistics-transformer:dry-run` 命令。
- Modify: `README.md`
  - 在 Stacker/DDJ2 MQTT demo 附近补充“多设备 MQTT 转换器”说明和配置策略。

## Task 1: Add config-driven pure transformer

**Files:**
- Create: `scripts/logistics-mqtt-transformer.config.json`
- Create: `scripts/logistics-mqtt-transformer.mjs`

- [ ] **Step 1: Create default config**

Create `scripts/logistics-mqtt-transformer.config.json` with:

```json
{
  "version": 1,
  "scene": {
    "name": "test2",
    "description": "多设备 MQTT 报文转换配置：现场 PLC 原始报文转换为编辑器物流数据驱动 Topic。"
  },
  "connections": {
    "sourceMqtt": {
      "host": "192.168.60.154",
      "port": 1883,
      "clientIdPrefix": "logistics-transformer-source"
    },
    "targetMqtt": {
      "host": "192.168.60.154",
      "port": 1883,
      "clientIdPrefix": "logistics-transformer-target"
    },
    "webSocket": {
      "host": "127.0.0.1",
      "port": 18086,
      "path": "/logistics-transformer"
    }
  },
  "routing": {
    "sourceTopics": [
      "dt/factory/plc/raw/+/+"
    ],
    "targetTopicTemplate": "dt/factory/logistics/{devType}/{deviceId}/twindatadriven/{subRes}",
    "defaultSubRes": "joint",
    "unknownDevicePolicy": "warn-and-skip"
  },
  "profiles": {
    "stacker-ddj2-plc": {
      "devType": "stacker",
      "subRes": "joint",
      "passthroughFields": [
        "deviceCode",
        "movement_x",
        "movement_y",
        "front_movement_z",
        "back_movement_z",
        "distance_x",
        "distance_y",
        "front_distance_z",
        "back_distance_z",
        "normal",
        "errorCode",
        "message"
      ],
      "distanceScale": {
        "distance_x": 1,
        "distance_y": 1,
        "front_distance_z": 1,
        "back_distance_z": 1
      },
      "cargo": {
        "enabled": true,
        "pickupCommandFields": ["front_command", "back_command"],
        "pickupCommandValues": [2],
        "dropCommandFields": ["front_command", "back_command"],
        "dropCommandValues": [5],
        "containerFields": ["front_containerCode", "back_containerCode"],
        "taskFields": ["front_task", "back_task"],
        "defaultCargo": "Box01",
        "emitOnRisingEdgeOnly": true
      },
      "locator": {
        "enabled": true,
        "keyFields": ["to_z", "to_x", "to_y"],
        "mapRef": "asrsLocators",
        "missingTargetPolicy": "warn-and-skip"
      }
    },
    "chain-conveyor-plc": {
      "devType": "conveyor",
      "subRes": "joint",
      "passthroughFields": [
        "deviceCode",
        "movement_x",
        "movement_y",
        "signalBits",
        "containerCode",
        "container_no",
        "task",
        "container_quantity",
        "normal",
        "errorCode",
        "message"
      ],
      "payloadBinding": {
        "enabled": true,
        "signalField": "signalBits",
        "frontSignalValues": [0],
        "containerFields": ["containerCode", "container_no"],
        "taskFields": ["task"],
        "taskPrefix": "Task"
      }
    },
    "rgv-standard": {
      "devType": "rgv",
      "subRes": "joint",
      "passthroughFields": [
        "movement_x",
        "movement_y",
        "distance_x",
        "distance_y",
        "normal",
        "errorCode",
        "message"
      ]
    }
  },
  "devices": [
    {
      "deviceId": "DDJ2",
      "assetCode": "DDJ2",
      "profile": "stacker-ddj2-plc",
      "enabled": true,
      "overrides": {
        "cargo.defaultCargo": "Box01",
        "locator.mapRef": "asrsLocators"
      }
    },
    {
      "deviceId": "1004",
      "assetCode": "1004",
      "profile": "chain-conveyor-plc",
      "enabled": true
    },
    {
      "deviceId": "RGV01",
      "assetCode": "RGV01",
      "profile": "rgv-standard",
      "enabled": true
    }
  ],
  "maps": {
    "asrsLocators": {
      "1:9:3": "1-9-3",
      "1:10:3": "1-10-3",
      "1:11:3": "1-11-3",
      "2:1:1": "2-1-1"
    }
  }
}
```

- [ ] **Step 2: Write transformer skeleton with pure functions**

Create `scripts/logistics-mqtt-transformer.mjs` with these public responsibilities:

```js
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.join(__dirname, "logistics-mqtt-transformer.config.json");
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

// 后续步骤补齐 parseArgs/loadConfig/transformPayload 等函数。
```

- [ ] **Step 3: Implement parsing and normalization**

Add functions:

```js
/** 解析命令行参数，支持 dry-run、once、no-mqtt、no-ws 和自定义配置文件。 */
function parseArgs(argv) { /* implementation */ }

/** 读取 JSON 配置文件，保留明确错误信息便于现场排查配置问题。 */
function loadConfig(configPath) { /* implementation */ }

/** 从 {data:[{e,p,v}]} 或裸数组中提取点位记录。 */
function extractRecords(payload) { /* implementation */ }

/** 将点位数组折叠成按设备分组的 frame。 */
function recordsToFrames(records, fallbackDeviceId) { /* implementation */ }
```

- [ ] **Step 4: Implement device/profile resolution**

Add functions:

```js
/** 通过 payload 设备号或 topic 设备号查找设备配置。 */
function findDevice(config, deviceId) { /* implementation */ }

/** 合并 profile 与 device overrides，device overrides 使用点路径覆盖。 */
function resolveProfile(config, device) { /* implementation */ }

/** 用 devType/deviceId/subRes 生成目标 Topic。 */
function buildTargetTopic(config, profile, device) { /* implementation */ }
```

- [ ] **Step 5: Implement conversion rules**

Add functions:

```js
/** 按 profile 透传 movement/distance/status 字段，并应用距离比例。 */
function buildPassthroughRecords(frame, profile, deviceId) { /* implementation */ }

/** 从 containerCode/task/defaultCargo 推导货箱编号。 */
function deriveCargoCode(frame, cargoConfig) { /* implementation */ }

/** 根据 command 上升沿生成 pickup/drop 事件。 */
function deriveCargoAction(frame, previousFrame, cargoConfig) { /* implementation */ }

/** 通过 locator map 将 to_z/to_x/to_y 转为 target。 */
function deriveLocatorTarget(config, frame, locatorConfig) { /* implementation */ }

/** 输送线收到前端有货信号时补 payload 绑定。 */
function deriveConveyorPayload(frame, payloadBindingConfig) { /* implementation */ }
```

- [ ] **Step 6: Implement top-level transformPayload**

Add:

```js
/** 转换一条输入 payload，返回可发布的多设备输出列表。 */
function transformPayload(payload, metadata, config, stateByDevice) { /* implementation */ }
```

Expected behavior:
- DDJ2 frame outputs passthrough movement/distance records.
- `front_command/back_command` entering `2` emits `cargo_action=pickup` and `cargo`.
- entering `5` emits `cargo_action=drop`、`cargo`、mapped `target` when map exists.
- 1004 conveyor with `signalBits=0` and `task=202` emits `payload=Task202`.
- Unknown devices warn and skip by default.

## Task 2: Add dry-run/sample conversion and MQTT runtime

**Files:**
- Modify: `scripts/logistics-mqtt-transformer.mjs`

- [ ] **Step 1: Add dry-run output**

Add:

```js
/** 打印内置样例和转换结果，用于不连接 broker 的本地核对。 */
function printDryRun(config, options) { /* implementation */ }
```

Expected dry-run includes:

```text
Logistics MQTT 转换器 dry-run：
# 1. 输入 payload
# 2. 输出 Topic: dt/factory/logistics/stacker/DDJ2/twindatadriven/joint
# 3. 输出 payload
```

- [ ] **Step 2: Add minimal MQTT helpers by reusing existing script style**

Add functions equivalent to existing scripts:

```js
function encodeMqttString(value) { /* implementation */ }
function encodeRemainingLength(length) { /* implementation */ }
function createMqttPacket(header, payload) { /* implementation */ }
function createConnectPacket(clientIdPrefix) { /* implementation */ }
function createSubscribePacket(topicFilters, packetId) { /* implementation */ }
function createPublishPacket(topic, payloadText) { /* implementation */ }
function readMqttPacketLength(buffer) { /* implementation */ }
```

- [ ] **Step 3: Add MQTT runtime**

Implement:

```js
/** 连接源 broker 并订阅配置中的 sourceTopics。 */
function connectSourceMqtt(runtime) { /* implementation */ }

/** 连接目标 broker，用于发布转换后的标准 Topic。 */
function connectTargetMqtt(runtime) { /* implementation */ }

/** 处理 MQTT PUBLISH，执行转换并发布。 */
function handleSourcePublish(runtime, topic, payloadText) { /* implementation */ }
```

- [ ] **Step 4: Add optional WebSocket mirror**

Add a local WebSocket mirror at config `connections.webSocket` so editor can use WebSocket data source during local verification.

- [ ] **Step 5: Add shutdown handling**

Follow existing script style:

```js
process.on("SIGINT", () => {
  console.log("正在停止 Logistics MQTT 转换器。");
  shutdown({ gracefulMqtt: false });
  process.exit(0);
});
```

## Task 3: Add package scripts and docs

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add package scripts**

Add:

```json
"demo:logistics-transformer": "node scripts/logistics-mqtt-transformer.mjs",
"demo:logistics-transformer:dry-run": "node scripts/logistics-mqtt-transformer.mjs --dry-run"
```

- [ ] **Step 2: Update README**

Add a section near MQTT demo docs:

```markdown
### 多设备 MQTT 转换器

`scripts/logistics-mqtt-transformer.mjs` 用于把现场 PLC 原始报文转换成编辑器规范 Topic。配置文件为 `scripts/logistics-mqtt-transformer.config.json`，按 `profiles/devices/maps` 分层：`profiles` 描述一类设备怎么转换，`devices` 描述场景中的设备实例，`maps` 保存货位和资产映射。

```bash
npm run demo:logistics-transformer:dry-run
```

默认样例会把 DDJ2 的 `front_command=5`、`front_containerCode=BOX001`、`to_z/to_x/to_y=1/9/3` 转换成 `cargo_action=drop`、`cargo=BOX001`、`target=1-9-3`，并保留 `movement_x/distance_x/movement_y/distance_y/front_movement_z/front_distance_z` 等动画字段。
```

## Task 4: Verification

**Files:**
- No source changes unless verification reveals issues.

- [ ] **Step 1: Syntax check scripts**

Run:

```bash
node --check scripts/logistics-mqtt-transformer.mjs
```

Expected: no output and exit code 0.

- [ ] **Step 2: Dry-run conversion**

Run:

```bash
npm run demo:logistics-transformer:dry-run
```

Expected output includes:
- `dt/factory/logistics/stacker/DDJ2/twindatadriven/joint`
- `"p":"cargo_action","v":"drop"`
- `"p":"cargo","v":"BOX001"`
- `"p":"target","v":"1-9-3"`

- [ ] **Step 3: Build**

Run:

```bash
npm run build
```

Expected: TypeScript/Vite/Electron build succeeds; existing large chunk warnings are acceptable if unchanged.

- [ ] **Step 4: Update README verification record**

Add one line to README build verification record describing the transformer and commands actually run.

## Self-Review Notes

- The plan covers multi-device configuration, Stacker cargo/locator conversion, conveyor payload binding, package scripts, docs, and verification.
- No placeholders remain in the desired behavior; implementation details are intentionally assigned to functions with clear responsibilities.
- The project has no test script, so verification uses `node --check`, dry-run output assertions, and `npm run build` per existing project guidance.
