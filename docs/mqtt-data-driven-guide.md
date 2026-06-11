# MQTT 数据驱动接入指南：让模型按真实场景运动

本文档面向**数据服务方**和**现场实施人员**，完整说明编辑器连接 MQTT/WebSocket 数据源后，如何让场景中的设备模型按照真实业务数据运动。内容覆盖前置条件、编辑器配置步骤、主题与 payload 协议、全部已支持设备的运动语义、行程保护、货箱吸附、新模型接入和常见问题排查。

适用版本：与本仓库当前代码一致（`src/editor/businessDataConnection.ts`、`src/editor/sceneDataDrivenRuntime.ts`、`src/editor/modelPackageDataDriven.ts`）。

---

## 1. 概述与架构

### 1.1 数据流转链路

```
MQTT broker（WebSocket 端口）或 普通 WebSocket 服务
        │
        │  businessDataConnection.ts
        │  MQTT 3.1.1 over WebSocket 最小客户端（订阅 QoS1、自动重连；发布仍 QoS0）/ 原生 WebSocket JSON
        ▼
SceneDataDrivenRuntime（场景数据驱动运行时）
        │  ① 解析 JSON payload（非 JSON 忽略，单条消息 ≤ 1MB）
        │  ② MQTT topic 解析 devType/devId/msgFlag/subRes，payload 缺 e 时用 topic devId 兜底
        │  ③ {e,p,v} 点位格式归一化为 {e, 点位名: 值}
        │  ④ 按「数据路径」和 data/payload/message 包装递归提取业务帧（单条消息 ≤ 200 帧）
        │  ⑤ 按设备号把帧匹配到场景中的模型实例
        ▼
运动组应用（优先模型包 dataDriven.motion 声明，旧 Stacker 模型走内置兜底）
        │  translate：v = 相对进入预览基线的米制位移，沿模型根节点局部轴
        │  rotate：  v = 相对进入预览基线的角度（度），绕参与节点自身局部轴
        │  行程限制截断 → speed 计算或默认 200ms 插值 → 货箱吸附联动
        ▼
Babylon 场景节点位姿变化（模型按真实数据运动）
```

### 1.2 预览态语义（重要）

- 数据驱动**只在预览模式下运行**。点击工具栏「预览」进入预览后，编辑器才会建立连接并订阅数据；编辑态不订阅。
- 进入预览时会捕获每个可驱动模型的**基线姿态**；内部动作点位的数值都表示**相对该基线**的目标值。
- **退出预览会断开连接并恢复模型进入预览前的姿态**，实时数据中间帧不会写入场景文件。
- 真实连接超过 **5 秒**没有收到数据时，状态栏标记为「离线（stale）」，但模型**保持最后姿态**不跳变，现场短暂断流不会导致模型复位。
- 连接配置（地址、Topic、字段名等非敏感信息）保存在场景的 `metadata.editor.sceneDataDriven` 中，随场景文件保存和恢复；连接运行状态不会写入场景文件。

---

## 2. 前置条件

### 2.1 broker 必须开启 WebSocket 端口

编辑器属性面板运行在 Electron renderer（浏览器环境）中，**只能通过 WebSocket 连接 MQTT broker，不能直连 1883 普通 TCP 端口**。在编辑器 MQTT 配置界面只需要填写 Broker IP/域名和 MQTT over WebSocket 端口；系统会自动生成 `ws://<IP>:<端口>/mqtt` 并补齐默认订阅 Topic、设备字段和匹配字段。

| 写法 | 是否可用 | 说明 |
|---|---|---|
| `ws://192.168.1.10:8083/mqtt` | ✅ | broker 的 MQTT over WebSocket 监听地址 |
| `wss://broker.example.com/mqtt` | ✅ | TLS 加密的 WebSocket 地址 |
| `mqtt://192.168.1.10:8083/mqtt` | ✅ | 便捷写法，编辑器自动转换为 `ws://` |
| `mqtts://broker.example.com/mqtt` | ✅ | 便捷写法，自动转换为 `wss://` |
| `192.168.1.10:1883` / `mqtt://host:1883` | ❌ | 普通 TCP 端口，浏览器环境无法连接 |

如果现场 broker 只开放了 1883 TCP，有两条出路：

1. **推荐：在 broker 上开启 WebSocket 监听**。EMQX 默认 WebSocket 端口为 `8083`（路径 `/mqtt`）；Mosquitto 需在配置中增加 `listener 8083` + `protocol websockets`。
2. **临时：使用桥接脚本**。仓库自带 `scripts/stacker-mqtt-demo-bridge.mjs` 演示了「TCP MQTT 发布 + 本地 WebSocket 转发」的桥接模式（见 [第 9 章](#9-本地验证与常见问题排查)），可参照实现自己的生产桥接服务。

### 2.2 当前 MQTT 连接为匿名连接

编辑器内置 MQTT 客户端按 MQTT 3.1.1 协议发送 CONNECT 包（clean session，keepalive 30 秒，clientId 形如 `babylon-editor-xxxx`），**当前版本不携带用户名/密码**。broker 需要允许匿名访问，或为编辑器来源 IP 配置免认证规则。属性面板中的「凭证引用」字段为预留设计（场景文件不保存真实密钥），当前连接时尚未使用。

### 2.3 payload 必须是 JSON 文本

订阅收到的消息体必须是合法 JSON（文本或 UTF-8 二进制）。非 JSON 消息会被忽略并在控制台输出告警；单条消息超过 **1MB** 会被丢弃。

### 2.4 订阅 QoS

编辑器以 **QoS1** 订阅配置的 Topic，兼容规范中的位姿、状态、告警和关节数据上报等级；如 broker 下发 QoS1 消息会回复 PUBACK。编辑器当前只作为展示端消费上报数据，POI 发送器的 MQTT publish 仍为 QoS0，不实现 `cmd/control`、`twinmove` 要求的 QoS2 控制链路。

---

## 3. 编辑器配置步骤（操作手册）

### 3.1 三个配置入口，共用同一份配置

以下三个入口编辑的是**同一份**场景级 `SceneDataDrivenComponent` 配置，任意一处修改即时全局生效：

| 入口 | 打开方式 | 适用场景 |
|---|---|---|
| 统一数据源配置 | 顶部工具栏「统一数据源配置」按钮 | 快速配置连接参数 |
| 场景属性 → SceneDataDrivenComponent | 点击视口空白处，右侧面板切换为场景属性 | 配置连接 + 查看数据驱动方式等场景级选项 |
| 对象属性 → 数据驱动 | 选中场景中的模型实例 | 为该模型填「绑定设备」，同时可就地编辑连接参数 |

> 「数据驱动」分区仅对**模型节点**开放；选中 Group、POI、CAD 图纸时会提示「请选择拖入场景的模型实例」。

### 3.2 连接字段逐项说明

| 字段 | 默认值 | 说明 |
|---|---|---|
| 启用连接 | 关闭 | 勾选后进入预览才会建立订阅；不勾选时预览只播放场景动画 |
| 数据源 | 无 | `WebSocket` 或 `MQTT(WebSocket)`；选「无」等于不启用 |
| Broker IP | 空 | 仅 MQTT 模式显示；填写 broker 的 IP 或域名，例如 `192.168.1.10` 或 `broker.example.com` |
| WS端口 | 空 | 仅 MQTT 模式显示；填写 broker 的 MQTT over WebSocket 端口，例如 EMQX 常见 `8083`。填写 `1883` 时面板会显示黄色警告，因为这是普通 TCP MQTT 端口 |
| 连接地址 | 空 | 仅 WebSocket 模式显示；填写普通 WebSocket 服务地址 |
| 通道/Topic | 空 | WebSocket 模式下手动填写通道；MQTT 模式自动订阅 `dt/factory/logistics/+/+/twinspawn` 和 `dt/factory/logistics/+/+/twindatadriven/#`，旧自定义 Topic 会保留，旧 joint 默认值会升级为新默认 |
| 设备字段 | `deviceId` | MQTT 模式自动补齐为 `e`；payload 中携带设备号的字段名。运行时除此字段外还会兜底尝试 `e`、`devId`、`deviceId`、`deviceID`、`id`、`assetCode`、`modelKey` |
| 匹配字段 | `assetCode` | MQTT 模式自动补齐为 `assetCode`；场景对象侧参与匹配的属性字段名，默认用对象的「资产编号」 |
| 数据路径 | 空 | MQTT 模式默认留空；payload 外层包装的点路径。如服务端把业务数据包在 `{"data": {...}}` 里，WebSocket 模式可填 `data`；支持 `a.b.c` 多级。运行时也会自动递归展开 `data`/`payload`/`message` 包装 |
| 插值(ms) | `200` | MQTT 模式自动使用 200ms；收到新数据后模型从当前姿态过渡到目标姿态的时长。模型包 `device.interpolationMs` 声明会优先于此值 |
| 凭证引用 | 空 | MQTT 模式自动留空，预留字段见 2.2 |

### 3.3 为模型绑定设备号

选中模型 → 右侧「数据驱动」分区 →「绑定设备」输入框，填写与 payload 设备号一致的编号（如 `Stacker01`）。该值写入对象的**资产编号**（`metadata.editor.assetInfo.assetCode`），随场景保存。

设备匹配的完整优先级见 [5.8 节](#58-设备匹配优先级)。

### 3.4 启动与状态确认

1. 完成连接配置并启用连接；
2. 点击工具栏「预览」进入预览模式，编辑器开始连接并订阅；
3. 观察属性面板数据源区域顶部的**运行状态条**：

| 状态 | 含义 |
|---|---|
| 连接中 | 正在建立 WebSocket/MQTT 连接 |
| 已连接 | 连接成功（未配置订阅通道时停在此状态） |
| 已订阅 / 已收到数据 | 订阅成功；收到数据后显示最近消息时间 |
| n ms 后重连 | 连接断开，按退避延迟自动重连（1.5s 起步，最大 8s） |
| 超过 5 秒未收到数据，保持最后姿态 | 数据流中断（stale），模型保持最后姿态 |
| MQTT broker 拒绝连接 | CONNACK 返回非 0（常见为 broker 要求认证，见 2.2） |
| 连接已停止 / 数据驱动已停止 | 退出预览或停止连接 |

4. 数据正常到达且设备号匹配后，模型立即按数据运动；
5. 退出预览：断开连接，模型恢复进入预览前姿态。

> 预览中修改任意连接字段会自动重建连接，无需手动重启预览。

---

## 4. MQTT 主题规范

所有 MQTT 主题统一使用根前缀 `dt/factory/logistics/`，完整层级为：

```text
dt/factory/logistics/{devType}/{devId}/{msgFlag}/{subRes}
```

其中 `{subRes}` 可选。编辑器 MQTT 模式默认订阅两条 broker 通配 Topic：

```text
dt/factory/logistics/+/+/twinspawn
dt/factory/logistics/+/+/twindatadriven/#
```

这样既能接收整机位姿，又能接收负载、状态、告警和关节/点位上报；`cmd/control`、`twinmove`、`status/heartbeat` 属于规范范围，但不是编辑器默认消费的运动数据流。

| 用途 | Topic 模板 | payload 格式 |
|---|---|---|
| 整机生成/位姿（设备整体在场景中的绝对位置和朝向） | `dt/factory/logistics/{devType}/{deviceId}/twinspawn` | 单对象 `{s,e,x,y,h,r,ts}` |
| 负载绑定 | `dt/factory/logistics/{devType}/{deviceId}/twindatadriven/payload` | 单对象 `{e,p,v,ts}`，其中 `p="payload"` |
| 设备状态 | `dt/factory/logistics/{devType}/{deviceId}/twindatadriven/status` | 单对象 `{e,p,v,ts}`，其中 `p="state"` |
| 故障告警 | `dt/factory/logistics/{devType}/{deviceId}/twindatadriven/alarm` | 单对象 `{e,alarmCode,alarmMsg,level,ts}` |
| 内部物理动作（行走、升降、伸叉、辊筒转动等机构运动） | `dt/factory/logistics/{devType}/{deviceId}/twindatadriven/joint` | 点位数组 `[{e,p,v,ts}, ...]` |

- `{devType}` 为设备类型编码，按下表固定取值。
- `{deviceId}` 为设备编号（`Stacker01` 等）。payload 建议携带设备字段（默认 `e`）；如果 MQTT topic 符合上述规范且 payload 缺少 `e`，运行时会用 topic 中的 `{deviceId}` 兜底匹配模型。
- 动作 payload 应表达**业务语义**（`travel_pos`、`lift_pos`、`roller_angle`、`chain_pos`），不要直接发送 Babylon 节点路径或材质字段；点位名到模型节点的映射由模型包 `dataDriven.motion` 声明负责（见第 8 章）。

| 设备名称 | devType |
|---|---|
| AGV/AMR 小车 | `agv` |
| 堆垛机 | `stacker` |
| 辊道/皮带输送机 | `conveyor` |
| 垂直提升机 | `lifter` |
| 穿梭车 | `shuttle` |
| 工业机械臂 | `robot` |
| 分拣机 | `sorter` |
| 立体库货架 | `asrs` |
| 厂内叉车 | `forklift` |
| 月台/门禁 | `gate` |
| 货位/库位 | `shelf` |

---

## 5. Payload 协议详解

### 5.1 整机位姿帧（twinspawn）

```json
{"s":"spawn01","e":"Stacker01","x":12.5,"y":8.3,"h":0,"r":90,"ts":1746991234567}
```

| 字段 | 含义 | 单位 | 映射到 Babylon |
|---|---|---|---|
| `s` | 生成批次/会话标识（可选，运行时不消费） | — | — |
| `e` | 设备编号 | — | 设备匹配 |
| `x` | 文档坐标 X | m | `position.x` |
| `y` | 文档坐标 Y（平面深度） | m | `position.z` |
| `h` | 文档坐标高度 H | m | `position.y` |
| `r` | 朝向角 | 度 | `rotation.y`（运行时转弧度） |
| `ts` | 毫秒时间戳（可选） | ms | — |

**坐标映射规则**：文档平面 `x/y` 落到编辑器地面 `x/z`，文档高度 `h` 落到编辑器垂直 `y`。该映射对**声明了 `dataDriven.device` 的模型包**（本仓库 9 个设备模型全部声明）和识别为 Stacker 的模型自动生效。

**数值语义**：整机位姿是**世界绝对坐标**（不是相对基线），数据服务直接发设备在场景坐标系中的真实位置；`r` 为绝对朝向角。字段可缺省——缺省的轴保持当前值不变。

兜底字段：除 `x/y/h/r` 外，运行时还接受 `position.x`、`pos.x`、`location.x`、`height`、`yaw`、`rotationY`、`heading` 等常见别名。

### 5.2 内部动作点位帧（twindatadriven/joint）

```json
[
  {"e":"Stacker01","p":"travel_pos","v":2.4,"ts":1746991234567},
  {"e":"Stacker01","p":"lift_pos","v":1.2,"ts":1746991234567},
  {"e":"Stacker01","p":"fork_extend","v":0.6,"ts":1746991234567}
]
```

| 字段 | 含义 |
|---|---|
| `e` | 设备编号（字符串或数字） |
| `p` | 点位名（业务语义字段，如 `travel_pos`） |
| `v` | 点位值（数字；货箱动作类点位为字符串） |
| `ts` | 毫秒时间戳（可选） |

运行时会把 `{e,p,v}` 数组**按设备编号分组归一化**为 `{e, travel_pos: 2.4, lift_pos: 1.2, fork_extend: 0.6}` 形式的帧再驱动模型；同一数组里多个设备的点位会拆成多帧分别匹配。也接受单对象 `{e,p,v}`（不必是数组）。

**数值语义（与整机位姿的关键区别）**：

- `kind: "translate"`（位移类，如 `travel_pos`、`lift_pos`、`chain_pos`）：`v` 表示**相对进入预览基线姿态的米制位移目标值**，沿模型根节点**局部轴**方向。模型在场景中旋转过也不需要改 payload——运行时先把局部轴转换为世界方向再应用，运动方向始终跟随模型自身朝向。
- `kind: "rotate"`（旋转类，如 `roller_angle`）：`v` 表示**相对基线的角度目标值（单位：度）**，绕参与节点**自身局部轴**旋转，适合辊筒、移载辊等内部机构。
- 点位值是**目标值不是增量**：连续发 `v:2.4`、`v:2.4` 模型保持在 2.4m 处；发 `v:0` 回到基线位置。
- 点位值也**不是速度**：速度由模型脚本 `dataDriven.motion.<group>.speed` 定义，`translate` 单位为 `m/s`，`rotate` 单位为 `deg/s`；payload 不需要额外携带速度字段。
- 缺省点位沿用上一帧值；从未上报过的点位按 `0`（基线姿态）处理。

### 5.3 负载、状态与告警帧

负载绑定用于同步载体设备与负载的关系。模型包配置了货箱吸附语义时，`twindatadriven/payload` 会被归一为现有货箱字段并在预览态同步到载体锚点：

```json
{"e":"Stacker01","p":"payload","v":"BOX008","ts":1746991234567}
```

状态与告警用于 POI 图表、报警面板和数据条件触发，不会被场景数据驱动运行时当作模型运动帧：

```json
{"e":"Conveyor02","p":"state","v":2,"ts":1746991234567}
```

```json
{"e":"Lifter01","alarmCode":"E03","alarmMsg":"卡料","level":2,"ts":1746991234567}
```

状态码按规范取值：`0=离线`、`1=待机`、`2=运行`、`3=故障`、`4=维护中`。告警等级：`1=警告`、`2=故障`、`3=紧急`。

### 5.4 物料生成与销毁帧

规范中的物料/料箱生成与销毁使用特例 Topic：

```text
dt/factory/logistics/material/{boxId}/twinspawn
```

payload 示例：

```json
{"s":"tool","e":"BOX008","location":"ShelfA05","action":"create","ts":1746991234567}
```

`action` 取 `create` 或 `destroy`。该消息目前作为业务帧保留给 POI/后续物料管理能力，默认不会驱动已有设备运动。

### 5.5 包装格式与数据路径

服务端 payload 外面有包装时按以下顺序解包：

1. 配置了「数据路径」时，先按点路径取出内层（如 `data` 或 `result.body`）；
2. 运行时自动递归展开 `data`、`payload`、`message` 三种常见包装 key，并把外层的设备标识字段透传给内层帧；
3. 解出的对象/数组继续按 5.1/5.2 规则处理（包装内的 `{e,p,v}` 数组同样会被归一化）。

### 5.6 频率与容量限制

| 限制 | 数值 | 超出行为 |
|---|---|---|
| 单条消息大小 | 1 MB | 整条丢弃 + 控制台告警 |
| 单条消息帧数 | 200 帧 | 超出部分不消费 |
| 插值时长 | 运动组 speed 或配置决定（默认 200ms） | — |

发布频率建议 100–500ms 一帧；编辑器用 easeOutCubic 插值平滑低频数据，无需高频轰炸。

### 5.7 插值与平滑

收到新数据后，模型从当前姿态向目标姿态做 **easeOutCubic 缓动插值**，时长取值优先级：

1. 模型包 `dataDriven.motion.<group>.speed`：本帧目标值有变化时，按 `abs(新目标值 - 当前已渲染值) / speed * 1000` 计算毫秒数；同一帧多个运动组变化时取最长时长，让载货台、货叉等部件同步到目标，且不会短于设备或场景插值时长；
2. 定位框「插值(ms)」（仅定位框）；
3. 模型包 `dataDriven.device.interpolationMs`；
4. 场景配置「插值(ms)」（默认 200）。

没有声明 `speed` 的运动组继续按设备或场景插值时长运行；如果本帧存在 speed 运动组，未声明 speed 的其它运动组也会跟随本帧最长时长同步到达。`0` 表示收到数据立即跳转到目标姿态。

### 5.8 设备匹配优先级

一帧数据按以下顺序确定驱动哪个模型：

**第一步：从帧中读设备号**，依次尝试字段：模型包 `device.deviceIdField` → 场景配置「设备字段」→ 兜底 `e` / `devId` / `deviceId` / `deviceID` / `id` / `assetCode` / `modelKey`。如果 MQTT topic 符合 `dt/factory/logistics/{devType}/{devId}/{msgFlag}/{subRes}` 且 payload 没有设备字段，运行时会先把 topic 里的 `{devId}` 补成 `e/devId`。

**第二步：与场景对象侧候选值比较**（大小写、首尾空格不敏感），依次为：

1. 对象属性中「匹配字段」指定的字段值（默认即资产编号）；
2. 对象「资产编号」（绑定设备写入处）；
3. 模型包 `device.defaultAssetCode`（如 `Stacker01`——即不填绑定设备，模型包默认编号也能匹配）；
4. 模型包动态参数 `modelKey`；
5. 节点名、源文件名、源文件名去扩展名。

**兜底规则**：规范 MQTT topic 会把 `{devId}` 注入为设备字段；普通 WebSocket 或非规范 topic 如果帧里**完全没有**设备字段，且场景中只有 1 个可驱动模型（定位框除外），则默认驱动该模型——便于单设备调试。多设备 WebSocket 场景必须携带设备字段。

---

## 6. 设备语义速查表（全部已支持设备）

以下 9 个模型包（`E:\公司文件\数字孪生\模型文件\models`）已内置 `dataDriven` 声明，导入编辑器后即可按下述点位驱动。`Shelf`（静态货架）与 `LED`（状态灯）无物理动作语义，不在本表内。

### 6.1 Stacker 堆垛机（最完整链路）

| 项 | 值 |
|---|---|
| devType / 默认编号 | `stacker` / `Stacker01` |
| 位姿 Topic | `dt/factory/logistics/stacker/Stacker01/twinspawn` |
| 动作 Topic | `dt/factory/logistics/stacker/Stacker01/twindatadriven/joint` |

| 点位 | 动作 | kind/axis | 默认速度 | 效果 |
|---|---|---|---|---|
| `travel_pos` | 行走 | translate / z | `0.8m/s` | 行走机构（立柱、顶底部、操作台、载货台、货叉）沿轨道方向位移；上下轨道 `fixedNodes` 保持固定 |
| `lift_pos` | 升降 | translate / y | `0.3m/s` | 载货台 + 货叉垂直升降 |
| `fork_extend` | 伸叉 | translate / x | `0.25m/s` | 货叉水平伸出 |
| `fork_side` | 叉侧移 | translate / z | `0.15m/s` | 货叉侧向微调 |
| `cargo_action` | 货箱动作 | 字符串 | — | `pickup`/`drop`，见第 7 章 |
| `cargo` | 货箱编号 | 字符串 | — | 被取放货箱的资产编号 |

```json
[
  {"e":"Stacker01","p":"travel_pos","v":2.4,"ts":1746991234567},
  {"e":"Stacker01","p":"lift_pos","v":1.2,"ts":1746991234567},
  {"e":"Stacker01","p":"fork_extend","v":0.6,"ts":1746991234567},
  {"e":"Stacker01","p":"fork_side","v":0.1,"ts":1746991234567},
  {"e":"Stacker01","p":"cargo_action","v":"pickup","ts":1746991234567},
  {"e":"Stacker01","p":"cargo","v":"Box01","ts":1746991234567}
]
```

`travel_pos` 带行程限制：未显式声明 `limits` 时，运行时按固定轨道节点包围盒推导行走范围，越界值截断（见第 7 章）。`lift_pos` 从 `0` 到 `1.2` 时会按 `0.3m/s` 约 4 秒完成，payload 中的 `v` 仍表示目标位置。

### 6.2 多穿小车 Shuttle

| 项 | 值 |
|---|---|
| devType / 默认编号 | `shuttle` / `Shuttle01` |
| 整车运动 | 走 `twinspawn` 整机位姿帧（小车沿轨道行驶由 `x/y/h/r` 表达） |

| 点位 | 动作 | kind/axis |
|---|---|---|
| `fork_extend` | 货叉伸缩 | translate / x |
| `fork_side` | 货叉侧移 | translate / z |

```json
{"s":"spawn-shuttle","e":"Shuttle01","x":6.0,"y":2.0,"h":1.5,"r":0,"ts":1746991234567}
```
```json
[
  {"e":"Shuttle01","p":"fork_extend","v":0.5,"ts":1746991234567},
  {"e":"Shuttle01","p":"fork_side","v":0.05,"ts":1746991234567}
]
```

### 6.3 RGV 环穿车

| 项 | 值 |
|---|---|
| devType / 默认编号 | `shuttle` / `RGV01` |
| 运动方式 | 仅声明设备匹配，**整车位姿全部走 `twinspawn`**，无内部点位 |

```json
{"s":"spawn-rgv","e":"RGV01","x":6.2,"y":1.4,"h":0,"r":0,"ts":1746991234567}
```

### 6.4 辊道机 RollerConveyor

| 项 | 值 |
|---|---|
| devType / 默认编号 | `conveyor` / `RollerConveyor01` |

| 点位 | 动作 | kind/axis |
|---|---|---|
| `roller_angle` | 辊筒旋转 | rotate / z（度） |

```json
[{"e":"RollerConveyor01","p":"roller_angle","v":180,"ts":1746991234567}]
```

> 旋转类点位的 `v` 是相对基线的**绝对角度目标**。要表现持续转动，服务端按时间递增角度即可（如每 200ms 加 36°）；角度可超 360 持续累加。

### 6.5 有电机辊道 MotorConveyor

| 项 | 值 |
|---|---|
| devType / 默认编号 | `conveyor` / `MotorConveyor01` |

| 点位 | 动作 | kind/axis |
|---|---|---|
| `roller_angle` | 辊筒旋转 | rotate / y（度） |

```json
[{"e":"MotorConveyor01","p":"roller_angle","v":180,"ts":1746991234567}]
```

### 6.6 弯道输送机 WLTS

| 项 | 值 |
|---|---|
| devType / 默认编号 | `conveyor` / `WLTS01` |

| 点位 | 动作 | kind/axis |
|---|---|---|
| `roller_angle` | 辊筒旋转 | rotate / z（度） |

```json
[{"e":"WLTS01","p":"roller_angle","v":90,"ts":1746991234567}]
```

### 6.7 链条机 ChainConveyor

| 项 | 值 |
|---|---|
| devType / 默认编号 | `conveyor` / `ChainConveyor01` |

| 点位 | 动作 | kind/axis |
|---|---|---|
| `chain_pos` | 链条轨道位移 | translate / z（米） |

```json
[{"e":"ChainConveyor01","p":"chain_pos","v":0.35,"ts":1746991234567}]
```

### 6.8 一体式顶升移载 YZJ

| 项 | 值 |
|---|---|
| devType / 默认编号 | `conveyor` / `YZJ01` |

| 点位 | 动作 | kind/axis |
|---|---|---|
| `lift_pos` | 顶升 | translate / y（米） |
| `roller_angle` | 移载辊旋转 | rotate / x（度） |

```json
[
  {"e":"YZJ01","p":"lift_pos","v":0.45,"ts":1746991234567},
  {"e":"YZJ01","p":"roller_angle","v":120,"ts":1746991234567}
]
```

### 6.9 换层提升机 HCTS

| 项 | 值 |
|---|---|
| devType / 默认编号 | `lifter` / `HCTS01` |

| 点位 | 动作 | kind/axis |
|---|---|---|
| `lift_pos` | 轿厢/平台升降 | translate / y（米） |

```json
[{"e":"HCTS01","p":"lift_pos","v":1.8,"ts":1746991234567}]
```

> HCTS 只驱动精确声明的轿厢/平台节点，不配置名称兜底匹配，避免误动其它结构件。

### 6.10 定位线框立方体（通用位姿接收端）

定位框是编辑器内置 primitive（非模型包），可作为任意自定义设备的整体位姿接收端：

1. 创建定位线框立方体并选中；
2. 右侧「动画连接」→ 勾选「启用定位框」→ 填「绑定设备」；
3. 可自定义设备字段与 X/Y/Z/朝向字段（默认 `e` 和 `x/h/y/r`，即文档坐标映射），以及独立插值时长。

```json
{"e":"BoxLocator01","x":2.4,"y":5.1,"h":0.8,"r":90,"ts":1746991234567}
```

定位框**必须显式启用且填写绑定设备**才会被驱动；它不会被无设备字段的数据帧兜底命中。

---

## 7. 行程限制与货箱吸附

### 7.1 行程限制（motion.*.limits）

位移类运动组可声明行程限制，防止行走机构越过端部防撞物体：

```ts
motion: {
  travel: {
    fields: ["travel_pos"],
    axis: "z",
    nodes: [...],
    limits: {
      min: -3.0,               // 显式最小行程（米，相对基线）
      max: 3.0,                // 显式最大行程
      blockerNodes: ["挡块A", "挡块B"],  // 或：用两端防撞物体推导
      blockerFallbackPattern: "挡块|stopper",
      clearance: 0.05          // 距防撞物体内侧的安全间隙（米）
    }
  }
}
```

规则：

- 显式 `min`/`max` 优先；缺省端点时，运行时沿运动轴投影**移动部件**和**防撞物体**的几何包围盒，取防撞物体内侧面（含 `clearance`）作为边界；
- 超范围的 payload 值**只截断不报错**，预览不中断；
- 仅对 `translate` 运动组生效；
- 旧 Stacker 模型未声明 `limits` 时自动用固定轨道节点推导行走范围，推导失败则不启用限制。

### 7.2 货箱吸附（cargo_action / cargo）

Stacker（及声明了 `cargoHandling` 的模型包）支持运行态货箱取放联动：

| 点位 | 值 | 效果 |
|---|---|---|
| `cargo_action` | `pickup`（兼容 `pick`/`attach`/`load`/`carry`/`take`/取货/吸附/装载） | 把 `cargo` 指定的货箱吸附到货叉吸附点，跟随设备运动 |
| `cargo_action` | `drop`（兼容 `detach`/`unload`/`release`/`put`/放货/释放/卸载） | 解除吸附，货箱保持当前位置；不带 `cargo` 时解除该设备全部吸附 |
| `cargo` | 货箱资产编号（如 `Box01`） | 按资产编号查找场景中的货箱模型；也兜底匹配节点名 |

取货保护阈值（模型包 `cargoHandling` 可覆盖默认值）：

| 条件 | 默认值 | 说明 |
|---|---|---|
| 货叉伸出量下限 | ≥ 0.45 m | `fork_extend` 当前值达到该值才允许吸附 |
| 货箱与吸附点距离上限 | ≤ 2.5 m | 超距不吸附；配置为 0 表示不检查距离 |
| 吸附点位置 | 货叉节点世界中心 + 竖向偏移 (0, 0.32, 0) | 偏移按模型根局部方向计算 |

吸附关系**只存在于预览运行态内存中**，停止预览统一清除，不写入场景文件。

操作前提：场景中需要有一个资产编号与 `cargo` 值一致的货箱模型，且摆放在吸附点距离阈值内。

---

## 8. 新模型接入指引

让一个新设备模型支持数据驱动，只需在模型包脚本（`*.model.ts`）中导出 `dataDriven` 声明，**不需要改编辑器代码**。

### 8.1 声明方式

```ts
export const dataDriven = {
  device: {
    devType: "conveyor",          // 设备类型，用于 Topic 模板
    defaultAssetCode: "MyDev01",  // 默认设备编号（不填绑定设备时的匹配兜底）
    deviceIdField: "e",           // payload 设备字段名
    assetCodeField: "assetCode",  // 对象侧匹配字段名
    interpolationMs: 200          // 该设备专属插值时长
  },
  motion: {
    lift: {                        // 运动组名（任意业务命名）
      fields: ["lift_pos"],        // 绑定的 payload 点位名（可多个别名）
      kind: "translate",          // translate=位移(米) / rotate=旋转(度)，缺省按 translate
      axis: "y",                  // 运动轴：translate 为模型根局部轴，rotate 为节点自身局部轴
      nodes: ["平台", "护栏"],      // 参与运动的节点名（精确匹配 glTF 节点名）
      speed: 0.3,                 // 可选：translate 为 m/s，rotate 为 deg/s；不填则用插值(ms)
      fallbackPattern: "平台|platform",  // 可选：精确名匹配不到时按 | 分隔关键字包含匹配
      limits: { min: 0, max: 2.5 }       // 可选：行程限制（见 7.1）
    }
  },
  fixedNodes: ["轨道上", "轨道下"],   // 可选：明确保持固定的节点（从运动组中排除）
  simulation: {                      // 可选：内置本地模拟的数据范围（Stacker 验证用）
    intervalMs: 250, travelRange: 2.8, liftBase: 0.35,
    liftRange: 2.1, forkRange: 0.75, forkSideRange: 0.18
  },
  cargoHandling: {                   // 可选：货箱吸附语义（见 7.2）
    actionFields: ["cargo_action"], cargoFields: ["cargo"],
    pickupValues: ["pickup"], dropValues: ["drop"],
    pickupMinForkExtension: 0.45, pickupMaxDistance: 2.5,
    anchorNodes: ["货叉1", "货叉2"], anchorOffset: { x: 0, y: 0.32, z: 0 }
  }
} as const;
```

### 8.2 硬性约束

- **只允许纯字面量**：字符串、数字、布尔、数组、普通对象。编辑器导入时**静态解析**该声明（不执行脚本），出现展开语法、函数调用、变量引用等会整体忽略并告警；
- `motion.*` 必须同时具备有效的 `fields`、`axis`、`nodes`，缺一该运动组被忽略；
- `nodes` 填 glTF 场景树中的**节点名**（可在编辑器层级面板核对）；精确名匹配优先，全部失配才尝试 `fallbackPattern` 关键字包含匹配（按 `|` 分隔，不执行正则）；
- `translate` 的 `axis` 指**模型根节点局部轴**；`rotate` 的 `axis` 指**参与节点自身局部轴**；
- `speed` 必须是大于 0 的数字；`translate` 解释为 `m/s`，`rotate` 解释为 `deg/s`，用于运行时按当前已渲染值到目标值的差值计算过渡时长；
- 子节点已包含在某运动组父节点下时只应用一次（运行时自动按层级去顶层节点）；
- 修改 `dataDriven` 后需**重新导入模型包**让编辑器重新解析 manifest。

字段完整定义见 `src/types/editor.ts` 中 `ModelDataDrivenDefinition` 及其子接口。

---

## 9. 本地验证与常见问题排查

### 9.1 内置 Stacker 模拟（零依赖验证）

不需要任何 MQTT/WebSocket 服务即可验证驱动链路：

1. 拖入 Stacker 模型包，再拖入/创建一个货箱模型，把货箱「资产编号」填 `Box01`，摆在货叉约 2.5m 范围内；
2. 选中 Stacker → 右侧「数据驱动」→ 点击「**启动 Stacker 模拟**」；
3. 按钮自动写入绑定设备 `Stacker01` 并进入预览，编辑器内部生成 `travel_pos/lift_pos/fork_extend/fork_side` 往返数据；伸叉端点会发送 `cargo_action=pickup/drop`，可观察货箱吸附与释放；
4. 停止预览后模型恢复原姿态。

### 9.2 MQTT 桥接演示脚本

`scripts/stacker-mqtt-demo-bridge.mjs` 同时做两件事：向真实 TCP broker 发布 demo 数据 + 在本地起 WebSocket 服务转发同一份数据给编辑器：

```bash
node scripts/stacker-mqtt-demo-bridge.mjs
```

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `STACKER_DEMO_MQTT_HOST` | `192.168.60.154` | TCP broker 地址 |
| `STACKER_DEMO_MQTT_PORT` | `1883` | TCP broker 端口 |
| `STACKER_DEMO_TOPIC` | `dt/factory/logistics/stacker/Stacker01/twindatadriven/joint` | 发布 Topic |
| `STACKER_DEMO_WS_HOST` / `WS_PORT` / `WS_PATH` | `127.0.0.1` / `18083` / `/stacker` | 编辑器订阅的本地 WebSocket |
| `STACKER_DEMO_DEVICE_ID` | `Stacker01` | 设备编号 |
| `STACKER_DEMO_CARGO_ID` | `Box01` | 演示货箱编号 |
| `STACKER_DEMO_INTERVAL_MS` | `500` | 发布间隔 |

配套操作：选中 Stacker → 点击「**填入 Stacker Demo**」自动写入 `ws://127.0.0.1:18083/stacker` 等连接配置 → 手动进入预览。该按钮只填配置不生成数据，需先启动脚本。`--once` 参数（或 `STACKER_DEMO_ONCE=1`）可做一次性发布验证 broker 连通性。

### 9.3 排错清单：模型不动怎么查

按从外到内顺序排查：

| # | 现象/状态 | 原因 | 解决 |
|---|---|---|---|
| 1 | 预览后状态条无变化 | 未勾选「启用连接」或数据源为「无」 | 启用连接并选择数据源 |
| 2 | 控制台提示「数据驱动连接地址为空」 | WebSocket 地址未填，或 MQTT 模式未填写 Broker IP | WebSocket 模式填写完整地址；MQTT 模式填写 Broker IP/域名和 WS端口 |
| 3 | 控制台提示「MQTT 数据驱动需要配置 Topic」 | 旧场景或手写 metadata 中 MQTT Topic 为空 | 在统一数据源配置中重新保存 Broker IP/端口，系统会自动补齐默认 Topic |
| 4 | 一直「连接中→重连」循环 | WS端口填了 1883 TCP 端口；或网络不通、端口未开 | 改用 broker MQTT over WebSocket 端口（面板会对 1883 显示黄色警告）；核对防火墙 |
| 5 | 「MQTT broker 拒绝连接」+ 返回码 | broker 要求认证（当前客户端匿名，见 2.2）或 clientId/ACL 限制 | broker 放开匿名访问或配置免认证规则 |
| 6 | 已订阅但「无实时数据」，5 秒后转 stale | 服务端没发数据，或 Topic 不匹配 | 用 MQTTX 等工具订阅同一 Topic 核对数据流 |
| 7 | 「已收到数据」但模型不动 | 设备号不匹配 | 核对 payload 设备字段值与模型「绑定设备」（大小写不敏感）；检查「设备字段」配置（推荐 `e`） |
| 8 | 同上 | 普通 WebSocket 或非规范 topic 下 payload 无设备字段且场景有多个模型 | 携带设备字段；规范 MQTT topic 可用 `{devId}` 兜底（见 5.8 兜底规则） |
| 9 | 控制台提示「不是合法 JSON」 | payload 非 JSON 文本 | 服务端改发 JSON |
| 10 | 控制台提示「超过大小上限」 | 单条消息 > 1MB | 拆分消息；单条 ≤ 200 帧 |
| 11 | 整机动但内部机构不动（或反之） | 点位名与模型包 `motion.*.fields` 不一致；或运动组节点名失配 | 核对第 6 章点位名；用层级面板核对 glTF 节点名与 `dataDriven.motion.*.nodes` |
| 12 | 数据包了一层 `data`/`result` | 包装未解开 | 设置「数据路径」；`data`/`payload`/`message` 包装会自动递归展开 |
| 13 | 模型瞬移不平滑 | 插值设为 0，或发布间隔远大于插值时长 | 调大「插值(ms)」（如 200–500） |
| 14 | 行走到一半停住 | 触发行程限制截断（不是故障） | 核对 `limits` 配置与轨道长度；越界值按边界截断 |
| 15 | 货箱不吸附 | 伸叉量 < 0.45m、货箱超 2.5m、编号不匹配 | 核对 7.2 阈值与货箱资产编号 |
| 16 | 「启动 Stacker 模拟」按钮置灰 | 模型被锁定 | 层级面板解锁后重试 |
| 17 | 选中后没有「数据驱动」分区 | 选中的是 Group/POI/CAD 节点 | 选择拖入场景的模型实例本体 |
| 18 | 编辑态发数据没反应 | 数据驱动只在预览态运行 | 进入预览模式 |
| 19 | 定位框不动 | 未启用「启用定位框」或未填绑定设备 | 启用并绑定设备（定位框不参与无设备号兜底） |
| 20 | 退出预览后位置「丢了」 | 预览姿态按设计不保存 | 属于正常语义；需要持久位置请在编辑态摆放 |

### 9.4 验证清单（交付前自检）

- [ ] broker WebSocket 端口可达（浏览器/MQTTX over WS 可连）；
- [ ] broker 允许编辑器匿名连接；
- [ ] Topic 命名符合第 4 章规范；payload 建议带 `e`，缺省时规范 MQTT topic 可用 `{devId}` 兜底；
- [ ] payload 与第 5/6 章协议一致（坐标映射、相对基线语义、单位米/度）；
- [ ] 模型「绑定设备」与 payload 设备号一致；
- [ ] 预览态状态条出现「已订阅 → 已收到数据」，模型按数据运动；
- [ ] 退出预览后模型恢复原姿态，场景保存内容不含运动中间帧。
