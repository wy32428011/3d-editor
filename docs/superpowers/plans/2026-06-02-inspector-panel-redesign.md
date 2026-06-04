# Inspector Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将右侧属性面板改造成截图风格的深色折叠面板，并让 `MeshVertexModifyComponent` 与资产编号字段通过节点 metadata 保存和恢复。

**Architecture:** 类型层扩展 `TransformSnapshot` / `TransformUpdate`，引擎层负责从 Babylon 节点 metadata 读取和写回可持久化组件数据，React `InspectorPanel` 只负责展示与分发局部更新。样式全部使用 `.inspector-*` 前缀，避免污染当前全局 `.field` / `.vector-grid` 表单样式。

**Tech Stack:** React 19、TypeScript、Babylon.js 9、Vite、Electron、本地 Babylon 节点 metadata 序列化。

---

## File Structure

- Modify: `src/types/editor.ts`
  - 增加 `MeshVertexModifySnapshot`、`AssetInfoSnapshot`。
  - 扩展 `TransformSnapshot` 和 `TransformUpdate`。

- Modify: `src/engine/BabylonEditorEngine.ts`
  - 在 `createTransformSnapshot()` 中填充新字段。
  - 在 `updateSelected()` 中合并写回 metadata。
  - 新增 metadata 归一化和写回 helper。
  - 继续复用现有材质颜色逻辑。

- Replace/Modify: `src/components/InspectorPanel.tsx`
  - 重构为对象头部 + 折叠分区布局。
  - 使用局部组件降低 JSX 混乱度。
  - 保持已有变换编辑实时更新。

- Modify: `src/styles/editor.css`
  - 新增 `.inspector-*` 样式。
  - 保留旧全局表单样式，避免影响其它 UI。

- Modify: `README.md`
  - 补充右侧属性面板改版和新增 metadata 参数说明。

- Existing spec: `docs/superpowers/specs/2026-06-02-inspector-panel-redesign.md`
  - 已确认设计，不需要再改，除非实现中发现设计矛盾。

---

### Task 1: 扩展 Inspector 数据类型

**Files:**
- Modify: `src/types/editor.ts:22-44`

- [ ] **Step 1: 在 `Vector3Snapshot` 后新增组件与资产快照类型**

在 `src/types/editor.ts` 的 `Vector3Snapshot` 后插入：

```ts
/** MeshVertexModifyComponent 的可编辑参数快照，当前先持久化配置，不直接修改网格顶点。 */
export interface MeshVertexModifySnapshot {
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

/** 选中对象的业务资产信息，assetCode 与文件资产 ID 分离。 */
export interface AssetInfoSnapshot {
  assetCode: string;
  sourceFile?: string;
}
```

- [ ] **Step 2: 扩展 `TransformSnapshot`**

把 `TransformSnapshot` 改为包含新字段：

```ts
/** 当前选中对象的可编辑属性快照。 */
export interface TransformSnapshot {
  id: number;
  name: string;
  kind: SceneNodeKind;
  position: Vector3Snapshot;
  /** 节点世界包围盒尺寸，单位为米；无可渲染网格时为空。 */
  dimensions?: Vector3Snapshot;
  rotation: Vector3Snapshot;
  scaling: Vector3Snapshot;
  visible: boolean;
  materialColor?: string;
  meshVertexModify: MeshVertexModifySnapshot;
  assetInfo: AssetInfoSnapshot;
}
```

- [ ] **Step 3: 扩展 `TransformUpdate`**

把 `TransformUpdate` 改为：

```ts
/** 属性面板向 Babylon 场景提交的部分更新。 */
export interface TransformUpdate {
  name?: string;
  position?: Vector3Snapshot;
  rotation?: Vector3Snapshot;
  scaling?: Vector3Snapshot;
  visible?: boolean;
  materialColor?: string;
  meshVertexModify?: Partial<MeshVertexModifySnapshot>;
  assetInfo?: Partial<AssetInfoSnapshot>;
}
```

- [ ] **Step 4: 运行类型检查构建**

Run:

```bash
npm run build
```

Expected:

- 预计会失败，因为引擎和 Inspector 尚未提供新增字段。
- 失败位置应集中在 `TransformSnapshot` 构造或 `InspectorPanel` 类型使用。

---

### Task 2: 在 Babylon 引擎中读写 metadata 字段

**Files:**
- Modify: `src/engine/BabylonEditorEngine.ts`
- Depends on: Task 1

- [ ] **Step 1: 扩展类型 import**

在 `src/engine/BabylonEditorEngine.ts` 当前 `../types/editor` import 中加入：

```ts
  AssetInfoSnapshot,
```

和：

```ts
  MeshVertexModifySnapshot,
```

最终 import 片段应包含：

```ts
import type {
  AssetInfoSnapshot,
  AssetRecord,
  EditorEngineCallbacks,
  EditorStats,
  EditorTool,
  MeshVertexModifySnapshot,
  PoiKind,
  PrimitiveKind,
  SceneNodeKind,
  SceneNodeSummary,
  TransformSnapshot,
  TransformUpdate
} from "../types/editor";
```

- [ ] **Step 2: 在常量区新增 metadata 默认值**

在 POI 常量后或其它 metadata 常量附近加入：

```ts
const DEFAULT_MESH_VERTEX_MODIFY: MeshVertexModifySnapshot = {
  showLegA: true,
  showLegB: true,
  rollerSkin: true,
  sideGuard: true,
  heightA: 0.3616738,
  heightB: 0.3616731,
  curveWidth: 1.185945,
  radius: 1,
  curveAngle: 90,
  rollerDensity: 0.5
};
```

不要在默认值里写 `mainColor`，它由当前材质颜色填充。

- [ ] **Step 3: 在 `updateSelected()` 中写回新字段**

在 `updateSelected()` 的 `materialColor` 处理后、刷新矩阵前加入：

```ts
    if (update.meshVertexModify) {
      this.updateSelectedMeshVertexModify(update.meshVertexModify);
      if (update.meshVertexModify.mainColor) {
        this.updateNodeMaterialColor(this.selectedNode, update.meshVertexModify.mainColor);
      }
    }

    if (update.assetInfo) {
      this.updateSelectedAssetInfo(update.assetInfo);
    }
```

完整顺序要求：

1. name。
2. transform。
3. visible。
4. materialColor。
5. meshVertexModify + mainColor 同步材质。
6. assetInfo。
7. refresh / snapshot / scene graph / render。

- [ ] **Step 4: 在 `createTransformSnapshot()` 中填充新字段**

把 `createTransformSnapshot(node)` 中 return 对象改为先计算颜色：

```ts
    const materialColor = this.getNodeMaterialColor(node);
    return {
      id: node.uniqueId,
      name: node.name,
      kind: this.getNodeKind(node),
      position: snapshotVector(node.position),
      dimensions: bounds ? snapshotVector(bounds.size) : undefined,
      rotation: snapshotVector(rotation, "degrees"),
      scaling: snapshotVector(node.scaling),
      visible: this.getNodeVisibility(node),
      materialColor,
      meshVertexModify: this.getNodeMeshVertexModify(node, materialColor),
      assetInfo: this.getNodeAssetInfo(node)
    };
```

- [ ] **Step 5: 新增 metadata 读取 helper**

在 `createTransformSnapshot()` 后或 metadata helper 附近加入：

```ts
  /** 读取 MeshVertexModifyComponent 参数，旧场景没有记录时回退默认值。 */
  private getNodeMeshVertexModify(node: TransformNode, materialColor?: string): MeshVertexModifySnapshot {
    const editorMetadata = this.getNodeEditorMetadata(node);
    const stored = this.asMetadataObject(editorMetadata.meshVertexModify);
    return {
      showLegA: this.getBooleanMetadata(stored.showLegA, DEFAULT_MESH_VERTEX_MODIFY.showLegA),
      showLegB: this.getBooleanMetadata(stored.showLegB, DEFAULT_MESH_VERTEX_MODIFY.showLegB),
      rollerSkin: this.getBooleanMetadata(stored.rollerSkin, DEFAULT_MESH_VERTEX_MODIFY.rollerSkin),
      sideGuard: this.getBooleanMetadata(stored.sideGuard, DEFAULT_MESH_VERTEX_MODIFY.sideGuard),
      mainColor: typeof stored.mainColor === "string" ? stored.mainColor : materialColor,
      heightA: this.getNumberMetadata(stored.heightA, DEFAULT_MESH_VERTEX_MODIFY.heightA),
      heightB: this.getNumberMetadata(stored.heightB, DEFAULT_MESH_VERTEX_MODIFY.heightB),
      curveWidth: this.getNumberMetadata(stored.curveWidth, DEFAULT_MESH_VERTEX_MODIFY.curveWidth),
      radius: this.getNumberMetadata(stored.radius, DEFAULT_MESH_VERTEX_MODIFY.radius),
      curveAngle: this.getNumberMetadata(stored.curveAngle, DEFAULT_MESH_VERTEX_MODIFY.curveAngle),
      rollerDensity: this.getNumberMetadata(stored.rollerDensity, DEFAULT_MESH_VERTEX_MODIFY.rollerDensity)
    };
  }

  /** 读取当前节点的资产业务信息，资产编号与文件来源分开保存。 */
  private getNodeAssetInfo(node: TransformNode): AssetInfoSnapshot {
    const editorMetadata = this.getNodeEditorMetadata(node);
    const stored = this.asMetadataObject(editorMetadata.assetInfo);
    return {
      assetCode: typeof stored.assetCode === "string" ? stored.assetCode : "",
      sourceFile: this.getNodeSourceFileName(node)
    };
  }

  /** 读取节点 metadata.editor，统一兼容旧场景中的空 metadata。 */
  private getNodeEditorMetadata(node: Node): Record<string, unknown> {
    return this.asMetadataObject(this.asMetadataObject(node.metadata).editor);
  }

  /** 从 metadata 中读取布尔值，缺失或类型不符时使用默认值。 */
  private getBooleanMetadata(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
  }

  /** 从 metadata 中读取有限数字，缺失或类型不符时使用默认值。 */
  private getNumberMetadata(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
```

- [ ] **Step 6: 新增 metadata 写回 helper**

在读取 helper 后加入：

```ts
  /** 合并写回 MeshVertexModifyComponent 参数，不直接修改真实 mesh 顶点。 */
  private updateSelectedMeshVertexModify(update: Partial<MeshVertexModifySnapshot>): void {
    if (!this.selectedNode) {
      return;
    }

    const current = this.getNodeMeshVertexModify(this.selectedNode, this.getNodeMaterialColor(this.selectedNode));
    this.mergeNodeEditorMetadata(this.selectedNode, {
      meshVertexModify: {
        ...current,
        ...update
      }
    });
  }

  /** 合并写回业务资产信息，assetCode 不与文件资产 ID 混用。 */
  private updateSelectedAssetInfo(update: Partial<AssetInfoSnapshot>): void {
    if (!this.selectedNode) {
      return;
    }

    const current = this.getNodeAssetInfo(this.selectedNode);
    this.mergeNodeEditorMetadata(this.selectedNode, {
      assetInfo: {
        ...current,
        ...update
      }
    });
  }

  /** 合并写回 node.metadata.editor，保留已有单位、资产和运行时 metadata。 */
  private mergeNodeEditorMetadata(node: Node, editorPatch: Record<string, unknown>): void {
    const metadata = this.asMetadataObject(node.metadata);
    const editorMetadata = this.asMetadataObject(metadata.editor);
    node.metadata = {
      ...metadata,
      editor: {
        ...editorMetadata,
        ...editorPatch
      }
    };
  }
```

- [ ] **Step 7: 运行构建验证**

Run:

```bash
npm run build
```

Expected:

- 可能仍失败，因为 `InspectorPanel` 还没使用新字段或当前 JSX 未重构。
- 不应出现 `BabylonEditorEngine.ts` 中新增 helper 的类型错误。

---

### Task 3: 重构 InspectorPanel UI

**Files:**
- Replace/Modify: `src/components/InspectorPanel.tsx`
- Depends on: Task 1, Task 2

- [ ] **Step 1: 替换 import**

把 `src/components/InspectorPanel.tsx` 顶部 import 改为：

```ts
import type {
  AssetInfoSnapshot,
  MeshVertexModifySnapshot,
  TransformSnapshot,
  TransformUpdate,
  Vector3Snapshot
} from "../types/editor";
```

保留：

```ts
import { LENGTH_UNIT_SYMBOL, ROTATION_UNIT_SYMBOL, SCALE_UNIT_SYMBOL } from "../editor/units";
```

- [ ] **Step 2: 保留常量并增加数值字段配置**

在 `DISPLAY_DECIMAL_PLACES` 后增加：

```ts
const meshNumberFields: Array<{ key: keyof Pick<MeshVertexModifySnapshot, "heightA" | "heightB" | "curveWidth" | "radius" | "curveAngle" | "rollerDensity">; label: string; step: string }> = [
  { key: "heightA", label: "高度A", step: "0.0001" },
  { key: "heightB", label: "高度B", step: "0.0001" },
  { key: "curveWidth", label: "弯道宽度", step: "0.0001" },
  { key: "radius", label: "半径", step: "0.1" },
  { key: "curveAngle", label: "弯道角度", step: "1" },
  { key: "rollerDensity", label: "辊筒密度", step: "0.1" }
];
```

- [ ] **Step 3: 替换 `InspectorPanel` 主 JSX**

将 `InspectorPanel` 函数替换为：

```tsx
/** 右侧属性面板负责编辑当前选中对象的名称、变换、显隐、组件参数和资产编号。 */
export function InspectorPanel({ selection, onChange }: InspectorPanelProps) {
  if (!selection) {
    return (
      <aside className="panel inspector-panel inspector-panel-redesign">
        <div className="inspector-empty-state">未选中对象</div>
      </aside>
    );
  }

  return (
    <aside className="panel inspector-panel inspector-panel-redesign">
      <div className="inspector-object-bar">
        <input
          aria-label="对象可见性"
          checked={selection.visible}
          className="inspector-object-visible"
          type="checkbox"
          onChange={(event) => onChange({ visible: event.target.checked })}
        />
        <input
          aria-label="对象名称"
          className="inspector-object-name"
          value={selection.name}
          onInput={(event) => onChange({ name: event.currentTarget.value })}
        />
      </div>

      <InspectorSection title="空间信息" defaultOpen showRefreshIcon>
        <CompactVectorEditor label="位置" unit={LENGTH_UNIT_SYMBOL} value={selection.position} onChange={(value) => onChange({ position: value })} />
        <CompactVectorEditor label="旋转" unit={ROTATION_UNIT_SYMBOL} value={selection.rotation} onChange={(value) => onChange({ rotation: value })} />
        <CompactVectorEditor label="缩放" unit={SCALE_UNIT_SYMBOL} value={selection.scaling} onChange={(value) => onChange({ scaling: value })} />
      </InspectorSection>

      <InspectorSection title="MeshVertexModifyComponent" defaultOpen>
        <MeshVertexModifyEditor
          value={selection.meshVertexModify}
          materialColor={selection.materialColor}
          onChange={(meshVertexModify) => onChange({ meshVertexModify })}
        />
      </InspectorSection>

      <InspectorSection title="资产信息" defaultOpen>
        <AssetInfoEditor value={selection.assetInfo} onChange={(assetInfo) => onChange({ assetInfo })} />
      </InspectorSection>

      <InspectorSection title="关节参数">
        <div className="inspector-empty-section">暂无关节参数</div>
      </InspectorSection>

      <InspectorSection title="数据驱动">
        <div className="inspector-empty-section">暂无数据驱动配置</div>
      </InspectorSection>
    </aside>
  );
}
```

- [ ] **Step 4: 新增 `InspectorSection` 组件**

在 `InspectorPanel` 后加入：

```tsx
interface InspectorSectionProps {
  title: string;
  defaultOpen?: boolean;
  showRefreshIcon?: boolean;
  children: React.ReactNode;
}

/** 折叠分区复刻截图中的三角标题条，便于后续组件继续扩展。 */
function InspectorSection({ title, defaultOpen = false, showRefreshIcon = false, children }: InspectorSectionProps) {
  return (
    <details className="inspector-section" open={defaultOpen}>
      <summary className="inspector-section-summary">
        <span className="inspector-section-title">{title}</span>
        {showRefreshIcon && <span className="inspector-section-refresh" aria-hidden="true">↻</span>}
      </summary>
      <div className="inspector-section-body">{children}</div>
    </details>
  );
}
```

- [ ] **Step 5: 新增紧凑三轴编辑器**

用以下组件替换旧 `VectorEditor` 调用；保留旧 `formatDisplayNumber` 给只读提示使用：

```tsx
interface CompactVectorEditorProps {
  label: string;
  unit: string;
  value: Vector3Snapshot;
  onChange: (value: Vector3Snapshot) => void;
}

/** 紧凑三轴编辑器让 X/Y/Z 在右侧窄面板中保持单行。 */
function CompactVectorEditor({ label, unit, value, onChange }: CompactVectorEditorProps) {
  /** 修改单个轴向数值，并保留其他轴向不变。 */
  const updateAxis = (axis: keyof Vector3Snapshot, nextValue: string) => {
    const parsed = Number(nextValue);
    onChange({
      ...value,
      [axis]: Number.isFinite(parsed) ? parsed : 0
    });
  };

  return (
    <div className="inspector-row inspector-vector-row">
      <span className="inspector-row-label">{label}</span>
      <div className="inspector-axis-grid">
        {vectorKeys.map((axis) => (
          <label className="inspector-axis-cell" key={axis}>
            <span className="inspector-axis-label">{axis.toUpperCase()}</span>
            <input
              className="inspector-input inspector-axis-input"
              title={`${axis.toUpperCase()}: ${value[axis]} ${unit}`}
              type="number"
              step="0.1"
              value={value[axis]}
              onInput={(event) => updateAxis(axis, event.currentTarget.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 新增 `MeshVertexModifyEditor`**

加入：

```tsx
interface MeshVertexModifyEditorProps {
  value: MeshVertexModifySnapshot;
  materialColor?: string;
  onChange: (update: Partial<MeshVertexModifySnapshot>) => void;
}

/** MeshVertexModifyComponent 参数编辑器，当前把参数保存到节点 metadata。 */
function MeshVertexModifyEditor({ value, materialColor, onChange }: MeshVertexModifyEditorProps) {
  const colorValue = value.mainColor ?? materialColor ?? "#ffffff";
  return (
    <>
      <InspectorCheckboxRow label="显示腿A" checked={value.showLegA} onChange={(checked) => onChange({ showLegA: checked })} />
      <InspectorCheckboxRow label="显示腿B" checked={value.showLegB} onChange={(checked) => onChange({ showLegB: checked })} />
      <InspectorCheckboxRow label="辊轮皮" checked={value.rollerSkin} onChange={(checked) => onChange({ rollerSkin: checked })} />
      <InspectorCheckboxRow label="挡边" checked={value.sideGuard} onChange={(checked) => onChange({ sideGuard: checked })} />
      <div className="inspector-row">
        <span className="inspector-row-label">主体颜色</span>
        <input
          className="inspector-color-input"
          type="color"
          value={colorValue}
          onInput={(event) => onChange({ mainColor: event.currentTarget.value })}
        />
      </div>
      {meshNumberFields.map((field) => (
        <InspectorNumberRow
          key={field.key}
          label={field.label}
          step={field.step}
          value={value[field.key]}
          onChange={(nextValue) => onChange({ [field.key]: nextValue })}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 7: 新增 checkbox / number / asset 子组件**

加入：

```tsx
interface InspectorCheckboxRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** 紧凑 checkbox 行，模拟截图中方形勾选框。 */
function InspectorCheckboxRow({ label, checked, onChange }: InspectorCheckboxRowProps) {
  return (
    <label className="inspector-row inspector-checkbox-row">
      <span className="inspector-row-label">{label}</span>
      <span className="inspector-checkbox-box">
        <input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
      </span>
    </label>
  );
}

interface InspectorNumberRowProps {
  label: string;
  step: string;
  value: number;
  onChange: (value: number) => void;
}

/** 紧凑数字输入行，清空或非法输入时回退为 0，保持现有属性面板行为。 */
function InspectorNumberRow({ label, step, value, onChange }: InspectorNumberRowProps) {
  return (
    <label className="inspector-row">
      <span className="inspector-row-label">{label}</span>
      <input
        className="inspector-input"
        type="number"
        step={step}
        value={value}
        onInput={(event) => {
          const parsed = Number(event.currentTarget.value);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
    </label>
  );
}

interface AssetInfoEditorProps {
  value: AssetInfoSnapshot;
  onChange: (update: Partial<AssetInfoSnapshot>) => void;
}

/** 业务资产编号编辑器；刷新按钮仅恢复当前快照值，不执行磁盘重载。 */
function AssetInfoEditor({ value, onChange }: AssetInfoEditorProps) {
  return (
    <>
      <label className="inspector-row">
        <span className="inspector-row-label">资产编号</span>
        <input
          className="inspector-input"
          value={value.assetCode}
          onInput={(event) => onChange({ assetCode: event.currentTarget.value })}
        />
      </label>
      {value.sourceFile && <div className="inspector-source-file">来源：{value.sourceFile}</div>}
      <div className="inspector-asset-actions">
        <button className="inspector-refresh-button" type="button" onClick={() => onChange({ assetCode: value.assetCode })}>
          刷新
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 8: 删除旧 `VectorEditor` / `VectorDisplay` 组件**

从 `InspectorPanel.tsx` 移除：

- `VectorEditorProps`
- `VectorEditor`
- `VectorDisplayProps`
- `VectorDisplay`

保留 `formatDisplayNumber` 只在仍使用时保留；如果不再使用，删除 `DISPLAY_DECIMAL_PLACES` 和 `formatDisplayNumber`。

- [ ] **Step 9: 运行构建验证**

Run:

```bash
npm run build
```

Expected:

- 如果 TS 报 `React` 命名空间缺失，在文件顶部增加：

```ts
import type { ReactNode } from "react";
```

并把 `children: React.ReactNode` 改成 `children: ReactNode`。

---

### Task 4: 添加截图风格 Inspector 样式

**Files:**
- Modify: `src/styles/editor.css`
- Depends on: Task 3

- [ ] **Step 1: 在 `.inspector-panel` 附近新增 redesign 基础样式**

在当前 `.inspector-panel` 定义后加入：

```css
.inspector-panel-redesign {
  background: #2d2d2d;
  color: #d8d8d8;
  font-size: 12px;
  overflow: auto;
}

.inspector-panel-redesign .inspector-empty-state {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: #8c928c;
}

.inspector-object-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  background: #242424;
  border-bottom: 1px solid #111;
}

.inspector-object-visible {
  width: 15px;
  height: 15px;
  accent-color: #7f9b71;
}

.inspector-object-name {
  flex: 1;
  min-width: 0;
  height: 24px;
  border: 1px solid #484848;
  border-radius: 3px;
  background: #303030;
  color: #dcdcdc;
  text-align: center;
  font: inherit;
}
```

- [ ] **Step 2: 新增折叠分区样式**

继续加入：

```css
.inspector-section {
  border-top: 1px solid #1c1c1c;
}

.inspector-section-summary {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  background: #3a3a3a;
  color: #f1f1f1;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.inspector-section-summary::-webkit-details-marker {
  display: none;
}

.inspector-section-summary::before {
  content: "▶";
  width: 12px;
  color: #ffffff;
  font-size: 12px;
}

.inspector-section[open] > .inspector-section-summary::before {
  content: "▼";
}

.inspector-section-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-section-refresh {
  margin-left: auto;
  color: #5a5a5a;
  font-size: 15px;
}

.inspector-section-body {
  padding: 6px 8px 8px;
  background: #2f2f2f;
}
```

- [ ] **Step 3: 新增字段行与输入框样式**

继续加入：

```css
.inspector-row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  min-height: 24px;
  align-items: center;
}

.inspector-row + .inspector-row {
  margin-top: 3px;
}

.inspector-row-label {
  color: #d6d6d6;
  white-space: nowrap;
}

.inspector-input {
  box-sizing: border-box;
  width: 100%;
  height: 22px;
  border: 1px solid #4c4c4c;
  border-radius: 2px;
  background: #2a2a2a;
  color: #dcdcdc;
  padding: 0 5px;
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.inspector-input:focus,
.inspector-object-name:focus {
  outline: 1px solid #7f9b71;
  outline-offset: 0;
}
```

- [ ] **Step 4: 新增三轴输入样式**

继续加入：

```css
.inspector-vector-row {
  grid-template-columns: 72px minmax(0, 1fr);
}

.inspector-axis-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
}

.inspector-axis-cell {
  min-width: 0;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 3px;
  align-items: center;
}

.inspector-axis-label {
  color: #cfcfcf;
  text-align: right;
  font-size: 12px;
}

.inspector-axis-input {
  padding: 0 4px;
}
```

- [ ] **Step 5: 新增 checkbox、颜色、资产样式**

继续加入：

```css
.inspector-checkbox-row {
  cursor: pointer;
}

.inspector-checkbox-box {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #4c4c4c;
  background: #242424;
  border-radius: 2px;
}

.inspector-checkbox-box input {
  width: 14px;
  height: 14px;
  accent-color: #808080;
}

.inspector-color-input {
  width: 100%;
  height: 24px;
  padding: 0;
  border: 1px solid #777;
  border-radius: 2px;
  background: #eeeeee;
}

.inspector-source-file {
  margin: 6px 0 0 80px;
  color: #9ca69c;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-asset-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.inspector-refresh-button {
  min-width: 58px;
  height: 25px;
  border: 1px solid #686868;
  border-radius: 3px;
  background: #3b3b3b;
  color: #d9d9d9;
  font: inherit;
  cursor: pointer;
}

.inspector-refresh-button:hover {
  border-color: #8c9a8a;
  color: #ffffff;
}

.inspector-empty-section {
  color: #8c928c;
  padding: 4px 0 6px 20px;
}
```

- [ ] **Step 6: 运行构建验证**

Run:

```bash
npm run build
```

Expected: PASS。

---

### Task 5: 更新 README 文档

**Files:**
- Modify: `README.md`
- Depends on: Task 1-4

- [ ] **Step 1: 更新当前功能列表中的属性编辑说明**

在 `README.md` 当前功能列表中找到属性编辑 bullet，替换为：

```md
- 属性编辑：右侧属性面板采用深色折叠分组样式，支持对象名称、显隐、位置、旋转、缩放、主体颜色、MeshVertexModifyComponent 参数和业务资产编号编辑；变换与颜色会实时驱动视口模型变化，组件参数和资产编号会写入节点 metadata 并随场景保存恢复
```

- [ ] **Step 2: 更新构建验证记录**

在“构建验证记录”末尾追加：

```md
- 2026-06-02：右侧属性面板改为截图风格的深色折叠分组布局，新增 MeshVertexModifyComponent 参数和业务资产编号 metadata 落地；已执行 `npm run build`，构建通过。
```

- [ ] **Step 3: 运行构建验证**

Run:

```bash
npm run build
```

Expected: PASS。

---

### Task 6: 最终验证与回归检查

**Files:**
- Verify only; no source edits unless previous tasks reveal issues.

- [ ] **Step 1: 构建验证**

Run:

```bash
npm run build
```

Expected: PASS。

- [ ] **Step 2: 手动交互验证**

Run:

```bash
npm run electron:dev
```

Manual checks:

1. 打开项目并进入编辑器。
2. 选中一个模型。
3. 确认右侧面板显示：对象栏、空间信息、MeshVertexModifyComponent、资产信息、关节参数、数据驱动。
4. 修改名称，确认左侧层级树同步。
5. 修改位置/旋转/缩放，确认视口模型实时变化。
6. 修改主体颜色，确认模型颜色变化。
7. 修改 MeshVertexModifyComponent 数值，切换选择后再选回，确认值保留。
8. 修改资产编号，保存场景后重新打开，确认值恢复。
9. 在右侧输入框里使用 Ctrl+C / Ctrl+V，确认只复制粘贴文本，不触发场景模型复制粘贴。
10. 停止 Electron 开发进程。

If Electron smoke is preferred instead of manual run, use PowerShell:

```powershell
$env:ELECTRON_DEV_SMOKE_EXIT_MS='3000'; npm run electron:dev
```

- [ ] **Step 3: 代码审查**

Dispatch code review subagent with this prompt:

```text
只读审查 Inspector 面板改版实现。重点检查：TransformSnapshot/TransformUpdate 新字段是否一致；BabylonEditorEngine metadata 读写是否会覆盖已有 editor metadata；InspectorPanel 是否只做 UI 分发；CSS 是否局限在 .inspector-* 前缀；输入框 Ctrl+C/Ctrl+V 是否仍不触发场景复制粘贴；README 是否准确。不要修改文件。
```

Expected: reviewer reports no blocking issues。

- [ ] **Step 4: 清理残留进程**

Check:

```powershell
Get-Process node,electron,chrome -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Path
```

Only stop processes that were started by this task. Do not kill the user's existing browser, IDE, Codex, or Claude processes.

- [ ] **Step 5: 最终状态报告**

Report:

- Modified files.
- Build result.
- Manual/Electron verification result or reason skipped.
- Any known limitations: MeshVertexModify parameters are saved metadata only; they do not yet modify mesh geometry.

---

## Self-Review

### Spec coverage

- 截图风格深色折叠面板：Task 3 + Task 4。
- 空间信息三轴紧凑输入：Task 3 Step 5 + Task 4 Step 4。
- MeshVertexModifyComponent 字段：Task 1 + Task 2 + Task 3 Step 6。
- 资产信息/资产编号：Task 1 + Task 2 + Task 3 Step 7。
- 关节参数/数据驱动折叠空状态：Task 3 Step 3。
- metadata 保存恢复：Task 2。
- README：Task 5。
- 验证：Task 6。

### Placeholder scan

No TBD/TODO/placeholders. All implementation steps include concrete file paths and code blocks.

### Type consistency

- `MeshVertexModifySnapshot` and `AssetInfoSnapshot` are defined in Task 1 and imported consistently in Task 2/3.
- `meshVertexModify` and `assetInfo` property names are consistent across snapshot, update, engine and UI.
- `assetCode` is consistently treated as business asset code, not file asset ID.
