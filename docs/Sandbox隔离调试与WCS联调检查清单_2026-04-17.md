# Sandbox隔离调试与WCS联调检查清单

版本日期：2026-04-17

---

## 1. 使用说明

本文用于现场联调时逐项勾选，建议按照顺序执行。

使用方法：

- `[ ]` 未完成
- `[x]` 已完成
- `[N/A]` 本次不适用

建议联调信息先填写：

- 命名空间（namespace）：`____________`
- 工厂（factory）：`____________`
- 设备编号（PLC）：`____________`
- 设备编号（扫码器）：`____________`
- MQTT Broker：`____________`
- 联调日期：`____________`
- 联调人员：`____________`

---

## 2. sandbox 开启检查

### 2.1 页面配置检查

- [ ] 已打开 `/ops/sandbox-config`
- [ ] 已为目标租户新建或编辑 sandbox 配置：`namespace + factory`
- [ ] 已确认 `enabled = 1`
- [ ] 已确认 `topicPrefix = sandbox/wcs`
- [ ] 已确认 `strictTenant = 1`

如现场页面暂不可用，再做下面数据库兜底检查。

### 2.2 数据库兜底检查（页面不可用时）

- [ ] 已确认存在表 `runtime_sandbox_profile`
- [ ] 已为目标租户插入/更新记录：`namespace + factory`
- [ ] 已确认 `enabled = 1`
- [ ] 已确认 `topic_prefix = sandbox/wcs`
- [ ] 已确认 `strict_tenant = 1`

建议校验 SQL：

```sql
SELECT id, namespace, factory, enabled, topic_prefix, strict_tenant, options_json, updated_at
FROM runtime_sandbox_profile
WHERE namespace = '<namespace>'
  AND factory = '<factory>';
```

---

### 2.3 基础隔离检查

- [ ] 已明确本次联调用的租户：`namespace + factory`
- [ ] 已确认本次联调只使用 sandbox topic
- [ ] 已确认不会混用真实 topic：`wcs/...`

---

## 3. 平台基础环境检查

### 3.1 MQTT 环境

- [ ] 平台 MQTT 已开启
- [ ] 平台 MQTT Broker 已配置
- [ ] 平台能正常连接 MQTT Broker
- [ ] WCS / 上位系统能连上同一个 Broker

### 3.2 订阅检查

- [ ] WCS 已订阅：`sandbox/wcs/<namespace>/<factory>/#`
- [ ] 能观察到 response topic 消息
- [ ] 能观察到上行 event topic 消息

建议订阅：

```text
sandbox/wcs/<namespace>/<factory>/#
```

---

## 4. 下行规则配置检查

### 4.1 规则存在性

- [ ] 已配置 `point.read` 规则
- [ ] 已配置 `point.write` 规则
- [ ] 已配置 `bcr.send_text` 规则

### 4.2 规则字段检查

- [ ] rule 的 `namespace` 与联调租户一致
- [ ] rule 的 `factory` 与联调租户一致
- [ ] requestTopic 配置正确
- [ ] action 配置正确
- [ ] rule 已启用（`enabled = 1`）

建议 requestTopic：

- [ ] `sandbox/wcs/<namespace>/<factory>/downlink/request/point.read`
- [ ] `sandbox/wcs/<namespace>/<factory>/downlink/request/point.write`
- [ ] `sandbox/wcs/<namespace>/<factory>/downlink/request/bcr.send_text`

固定 responseTopic（sandbox 实际收口）：

- [ ] `sandbox/wcs/<namespace>/<factory>/downlink/response`

---

## 5. MQTT request / response 联调检查

### 5.1 通用字段检查

每次下行请求都检查：

- [ ] 已传 `correlationId`
- [ ] 已传 `namespace`
- [ ] 已传 `factory`
- [ ] 已传 `deviceCode`
- [ ] 已传 `action`
- [ ] 请求体字段名与 action 匹配

---

### 5.2 point.write 联调

#### 请求检查

- [ ] request topic 正确
- [ ] 请求使用字段 `writePoints`
- [ ] `writePoints[].eventTag` 正确
- [ ] `writePoints[].dataVal` 已填写

#### 响应检查

- [ ] 收到 response topic 消息
- [ ] `correlationId` 与请求一致
- [ ] `success = true`
- [ ] `action = point.write`

#### 结果检查

- [ ] 平台未连接真实 PLC
- [ ] 写入后没有真实设备动作
- [ ] sandbox 内部状态已更新

---

### 5.3 point.read 联调

#### 请求检查

- [ ] request topic 正确
- [ ] 请求使用字段 `points`
- [ ] `points[].eventTag` 正确
- [ ] 需要读取的点位已存在

#### 响应检查

- [ ] 收到 response topic 消息
- [ ] `correlationId` 与请求一致
- [ ] `success = true`
- [ ] `action = point.read`
- [ ] `data` 返回数组结构
- [ ] `data[].eventTag` 正确
- [ ] `data[].dataVal` 与预期一致

#### 结果检查

- [ ] 读到了刚才 `point.write` 写入的值
- [ ] 若未写过该点，返回空字符串可接受

---

### 5.4 bcr.send_text 联调

#### 请求检查

- [ ] request topic 正确
- [ ] 请求使用字段 `text`
- [ ] `deviceCode` 为扫码器设备编号
- [ ] `text` 内容正确

#### 响应检查

- [ ] 收到 response topic 消息
- [ ] `correlationId` 与请求一致
- [ ] `success = true`
- [ ] `action = bcr.send_text`
- [ ] `data.deviceCode` 正确
- [ ] `data.text` 正确

#### 结果检查

- [ ] 平台未连接真实扫码器
- [ ] 平台内部已记录扫码文本

---

## 6. 上行事件检查

### 6.1 point.changed 检查

- [ ] 已订阅 `sandbox/wcs/<namespace>/<factory>/plc/<deviceCode>/point.changed`
- [ ] 在 `point.write` 后能收到 `point.changed`
- [ ] `eventId` 存在
- [ ] `bizType = plc`
- [ ] `eventTag = point.changed`
- [ ] `data` 为数组
- [ ] `data[].pointCode` 正确
- [ ] `data[].dataVal` 正确

注意：

- [ ] 已知只有 `reportMode=on_change` 的点位才会进入 `point.changed` 事件
- [ ] 若写入成功但未收到 `point.changed`，已先确认是否属于点位上报策略问题

---

### 6.2 scanner.changed 检查

- [ ] 已订阅 `sandbox/wcs/<namespace>/<factory>/scanner/<deviceCode>/scanner.changed`
- [ ] 在 `bcr.send_text` 后能收到 `scanner.changed`
- [ ] `bizType = scanner`
- [ ] `eventTag = scanner.changed`
- [ ] `data.deviceCode` 正确
- [ ] `data.txt` 正确

注意：

- [ ] 已知事件字段名是 `txt`
- [ ] 已知不是 `text`

---

### 6.3 device.online / device.offline 检查

- [ ] 已订阅 `sandbox/wcs/<namespace>/<factory>/device/<deviceCode>/#`
- [ ] 已观察到 `device.online` 事件
- [ ] 已观察到 `device.offline` 事件（如本次联调有做停机/断开动作）
- [ ] `data.online` 字段正确
- [ ] `data.status` 字段正确

---

## 7. HTTP 联调检查（如本次使用）

### 7.1 `/api/device/point/write`

- [ ] 已传 `namespace`
- [ ] 已传 `factory`
- [ ] 已传 `deviceCode`
- [ ] 已传 `points[]`
- [ ] `success = true`
- [ ] `code = 200`

注意：

- [ ] HTTP 写接口字段叫 `points`
- [ ] MQTT 写接口字段叫 `writePoints`
- [ ] 已确认两者没有混用

---

### 7.2 `/api/device/point/read`

- [ ] 已传 `namespace`
- [ ] 已传 `factory`
- [ ] 已传 `deviceCode`
- [ ] 已传 `points[]`
- [ ] `success = true`
- [ ] `code = 200`
- [ ] 返回值与预期一致

---

### 7.3 `/api/device/bcrScanner`

- [ ] 已传 `namespace`
- [ ] 已传 `factory`
- [ ] 已传 `deviceCode`
- [ ] 已传 `bcrTxt`
- [ ] `success = true`
- [ ] `code = 200`
- [ ] 响应里 `data.text` 正确

注意：

- [ ] HTTP 请求字段叫 `bcrTxt`
- [ ] HTTP 响应字段叫 `text`

---

## 8. 常见失败排查清单

### 8.1 请求直接失败

- [ ] 已检查是否缺少 `namespace`
- [ ] 已检查是否缺少 `factory`
- [ ] 已检查 `deviceCode` 是否为空
- [ ] 已检查 `action` 是否在支持范围内

支持 action：

- [ ] `point.read`
- [ ] `point.write`
- [ ] `bcr.send_text`

---

### 8.2 收到 response，但收不到上行事件

- [ ] 已检查平台 MQTT 是否正常
- [ ] 已检查 Broker 是否可达
- [ ] 已检查 WCS 订阅 topic 是否正确
- [ ] 已检查当前租户是否真的处于 sandbox 模式
- [ ] 已检查 `point.changed` 是否因为点位上报策略未触发

---

### 8.3 point.write 失败

- [ ] 已检查传入点位是否为输出类点位
- [ ] 已检查 `eventTag` 是否存在于设备点位台账
- [ ] 已检查 `dataVal` 是否为空

---

### 8.4 point.read 返回空值

- [ ] 已确认该点是否曾在 sandbox 内被写过
- [ ] 已确认不是读了错误租户/错误设备
- [ ] 已确认读取的是正确 `eventTag`

---

### 8.5 bcr.send_text 未收到 scanner.changed

- [ ] 已确认当前租户在 sandbox 中
- [ ] 已确认订阅了正确的 scanner topic
- [ ] 已确认 MQTT 正常

---

## 9. 仅用 Postman + MQTT 客户端的自测清单

### 9.1 Postman 自测

- [ ] 已用 Postman 调 `POST /api/device/point/write`
- [ ] 已确认返回 `success = true`
- [ ] 已用 Postman 调 `POST /api/device/point/read`
- [ ] 已确认读回刚写入的值
- [ ] 已用 Postman 调 `POST /api/device/bcrScanner`
- [ ] 已确认返回 `success = true`
- [ ] 已确认返回 `data.text` 正确

### 9.2 MQTT 客户端自测

- [ ] 已订阅 `sandbox/wcs/<namespace>/<factory>/#`
- [ ] 已发送 `point.write` 请求
- [ ] 已收到 `downlink/response`
- [ ] 已发送 `point.read` 请求
- [ ] 已确认 response 读回刚写入的值
- [ ] 已发送 `bcr.send_text` 请求
- [ ] 已收到 `scanner.changed`

### 9.3 自测通过标准

- [ ] HTTP 主链路已通过
- [ ] MQTT request/response 已通过
- [ ] MQTT 至少一种上行事件已通过
- [ ] 可以进入 WCS 正式联调

## 10. 联调结论

### 9.1 基础结论

- [ ] sandbox 已成功开启
- [ ] request / response 跑通
- [ ] point.write / point.read 跑通
- [ ] bcr.send_text 跑通
- [ ] point.changed 跑通
- [ ] scanner.changed 跑通
- [ ] 未触达真实 PLC
- [ ] 未触达真实扫码器
- [ ] 全流程 topic 均在 `sandbox/wcs/...` 下

### 9.2 需要跟进的问题

- [ ] 无
- [ ] 有，问题列表如下：

```text
1.
2.
3.
```

---

## 11. 现场备注

```text
联调备注：



```
