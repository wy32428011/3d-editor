# 右侧属性面板截图风格改版设计

## 背景

用户希望把右侧属性面板改成参考截图中的深色工业/Unity 风格：顶部显示当前对象名称，下方以折叠分组呈现“空间信息”“MeshVertexModifyComponent”“资产信息”“关节参数”“数据驱动”等内容。当前 `InspectorPanel` 只展示名称、类型、位置、尺寸、旋转、缩放、可见性和材质颜色，缺少截图中的组件参数和资产编号字段。

本设计采用用户确认的方案 A：截图风格 + metadata 字段落地。目标是在视觉接近截图的同时，让新增字段可以随节点保存和恢复，而不是只做无法持久化的 UI 假壳。

## 范围

### 本次实现

1. 改造 `InspectorPanel` 为深色折叠分组样式。
2. 顶部对象栏包含：
   - 可见性 checkbox。
   - 当前选中对象名称输入框。
3. “空间信息”分区包含：
   - 位置 X/Y/Z。
   - 旋转 X/Y/Z。
   - 缩放 X/Y/Z。
   - 三轴输入保持紧凑单行。
4. “MeshVertexModifyComponent”分区包含：
   - 显示腿A。
   - 显示腿B。
   - 辊轮皮。
   - 挡边。
   - 主体颜色。
   - 高度A。
   - 高度B。
   - 弯道宽度。
   - 半径。
   - 弯道角度。
   - 辊筒密度。
5. “资产信息”分区包含：
   - 资产编号。
   - 刷新按钮。
6. “关节参数”“数据驱动”作为折叠分区保留空状态，为后续功能预留。
7. 新增字段写入选中节点 metadata，确保随场景保存和重新加载恢复。
8. README 更新本次属性面板改版说明。

### 本次不实现

1. 不实现真实 Mesh 顶点几何修改。
2. 不实现关节参数的真实运动学逻辑。
3. 不实现数据驱动的外部数据源绑定。
4. 不把“刷新”按钮做成远程或磁盘资产重载功能。
5. 不修改左侧层级、底部资产浏览器或 Babylon 视口交互。

## 数据模型

在 `src/types/editor.ts` 中扩展快照与更新类型：

```ts
interface MeshVertexModifySnapshot {
  showLegA: boolean;
  showLegB: boolean;
  rollerSkin: boolean;
  sideGuard: boolean;
  mainColor?: string;
  heightA: number;
  heightB: number;
  curveWidth: number;
  radius: number;
  curveAngle: number;
  rollerDensity: number;
}

interface AssetInfoSnapshot {
  assetCode: string;
  sourceFile?: string;
}
```

`TransformSnapshot` 增加：

- `meshVertexModify: MeshVertexModifySnapshot`
- `assetInfo: AssetInfoSnapshot`

`TransformUpdate` 增加：

- `meshVertexModify?: Partial<MeshVertexModifySnapshot>`
- `assetInfo?: Partial<AssetInfoSnapshot>`

默认值建议：

- `showLegA: true`
- `showLegB: true`
- `rollerSkin: true`
- `sideGuard: true`
- `heightA: 0.3616738`
- `heightB: 0.3616731`
- `curveWidth: 1.185945`
- `radius: 1`
- `curveAngle: 90`
- `rollerDensity: 0.5`
- `assetCode: ""`

## Metadata 存储

在 `BabylonEditorEngine` 中读写节点 metadata：

```ts
node.metadata.editor.meshVertexModify
node.metadata.editor.assetInfo
```

读取策略：

- `createTransformSnapshot()` 从 metadata 读取并归一化字段。
- 如果旧场景没有字段，返回默认值。
- `mainColor` 默认使用现有 `materialColor`，确保“主体颜色”继续驱动真实材质颜色。
- `sourceFile` 从节点已有 metadata 中读取，仅作为只读上下文。

写入策略：

- `updateSelected()` 合并 `meshVertexModify` / `assetInfo` 到 `node.metadata.editor`。
- `meshVertexModify.mainColor` 同步调用现有材质颜色更新逻辑。
- 参数输入只更新 metadata，不直接修改 mesh 几何。

## UI 结构

`InspectorPanel.tsx` 拆出局部小组件：

- `InspectorSection`
- `CompactVectorEditor`
- `InspectorRow`
- `CheckboxRow`
- `NumberRow`
- `AssetInfoSection`

未选中对象时仍显示空状态。

选中对象时结构如下：

```text
[可见 checkbox] [对象名称输入框]
▼ 空间信息
  位置  X [ ] Y [ ] Z [ ]
  旋转  X [ ] Y [ ] Z [ ]
  缩放  X [ ] Y [ ] Z [ ]
▼ MeshVertexModifyComponent
  显示腿A [x]
  显示腿B [x]
  辊轮皮  [x]
  挡边    [x]
  主体颜色 [color]
  高度A [number]
  高度B [number]
  弯道宽度 [number]
  半径 [number]
  弯道角度 [number]
  辊筒密度 [number]
▼ 资产信息
  资产编号 [text]
  [刷新]
▶ 关节参数
▶ 数据驱动
```

“刷新”按钮第一版仅把 UI 中的资产编号字段恢复为当前快照值，或触发一次空操作提示，不执行磁盘重载。

## 样式

在 `src/styles/editor.css` 中新增 `.inspector-*` 前缀样式，避免污染全局表单：

- `.inspector-object-bar`
- `.inspector-object-name`
- `.inspector-section`
- `.inspector-section-summary`
- `.inspector-section-body`
- `.inspector-row`
- `.inspector-vector-row`
- `.inspector-axis-label`
- `.inspector-input`
- `.inspector-checkbox-box`
- `.inspector-color-input`
- `.inspector-refresh-button`
- `.inspector-empty-section`

视觉方向：

- 面板背景：深灰。
- 分区标题：中灰横条。
- 输入框：深色背景、细边框。
- 字体：12px 左右。
- 行高：紧凑。
- 数字输入启用 tabular numbers。

## 验证

1. 运行 `npm run build`。
2. 手动验证：
   - 选中模型后右侧面板样式接近截图。
   - 名称编辑同步层级树。
   - 位置 / 旋转 / 缩放编辑继续实时驱动 Babylon 模型。
   - 可见 checkbox 继续控制模型显隐。
   - 主体颜色继续控制模型材质颜色。
   - MeshVertexModifyComponent 参数编辑后切换选择再选回时仍保留。
   - 保存并重新打开场景后 metadata 字段可恢复。
   - 右侧输入框内复制粘贴文本不触发场景模型 Ctrl+C / Ctrl+V。

## 自检

- 无 TBD/TODO。
- 范围聚焦在右侧 Inspector UI 与 metadata 数据落地。
- 不承诺真实顶点修改、关节或数据驱动逻辑，避免伪功能扩大范围。
- 资产编号明确作为业务 `assetCode`，不混用文件资产 ID。
