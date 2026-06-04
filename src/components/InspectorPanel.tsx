import { useEffect, useState, type ReactNode } from "react";
import { LENGTH_UNIT_SYMBOL, ROTATION_UNIT_SYMBOL, SCALE_UNIT_SYMBOL } from "../editor/units";
import type {
  AssetInfoSnapshot,
  Color3Snapshot,
  DynamicInspectorField,
  DynamicParameterSnapshot,
  DynamicParameterUpdate,
  DynamicParameterValue,
  MeshVertexModifySnapshot,
  TransformSnapshot,
  TransformUpdate,
  Vector3Snapshot
} from "../types/editor";

interface InspectorPanelProps {
  selection: TransformSnapshot | null;
  onChange: (update: TransformUpdate) => void;
}

const vectorKeys: Array<keyof Vector3Snapshot> = ["x", "y", "z"];
const meshNumberFields: Array<{
  key: keyof Pick<MeshVertexModifySnapshot, "heightA" | "heightB" | "curveWidth" | "radius" | "curveAngle" | "rollerDensity">;
  label: string;
  step: string;
}> = [
  { key: "heightA", label: "高度A", step: "0.0001" },
  { key: "heightB", label: "高度B", step: "0.0001" },
  { key: "curveWidth", label: "弯道宽度", step: "0.0001" },
  { key: "radius", label: "半径", step: "0.1" },
  { key: "curveAngle", label: "弯道角度", step: "1" },
  { key: "rollerDensity", label: "辊筒密度", step: "0.1" }
];

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

      {selection.dynamicParameters && (
        <InspectorSection title={`${selection.dynamicParameters.displayName} 参数`} defaultOpen>
          <DynamicParameterEditor
            snapshot={selection.dynamicParameters}
            onChange={(dynamicParameter) => onChange({ dynamicParameter })}
          />
        </InspectorSection>
      )}

      {!selection.dynamicParameters && (
        <InspectorSection title="MeshVertexModifyComponent" defaultOpen>
          <MeshVertexModifyEditor
            value={selection.meshVertexModify}
            materialColor={selection.materialColor}
            onChange={(meshVertexModify) => onChange({ meshVertexModify })}
          />
        </InspectorSection>
      )}

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

interface InspectorSectionProps {
  title: string;
  defaultOpen?: boolean;
  showRefreshIcon?: boolean;
  children: ReactNode;
}

/** 折叠分区复刻截图中的三角标题条，便于后续组件继续扩展。 */
function InspectorSection({ title, defaultOpen = false, showRefreshIcon = false, children }: InspectorSectionProps) {
  return (
    <details className="inspector-section" open={defaultOpen}>
      <summary className="inspector-section-summary">
        <span className="inspector-section-title">{title}</span>
        {showRefreshIcon && (
          <span className="inspector-section-refresh" aria-hidden="true">
            ↻
          </span>
        )}
      </summary>
      <div className="inspector-section-body">{children}</div>
    </details>
  );
}

interface CompactVectorEditorProps {
  label: string;
  unit: string;
  value: Vector3Snapshot;
  onChange: (value: Vector3Snapshot) => void;
}

/** 紧凑三轴编辑器让 X/Y/Z 在右侧窄面板中保持单行。 */
function CompactVectorEditor({ label, unit, value, onChange }: CompactVectorEditorProps) {
  /** 修改单个轴向数值，并保留其他轴向不变。 */
  const updateAxis = (axis: keyof Vector3Snapshot, nextValue: number) => {
    onChange({
      ...value,
      [axis]: nextValue
    });
  };

  return (
    <div className="inspector-row inspector-vector-row">
      <span className="inspector-row-label">{label}</span>
      <div className="inspector-axis-grid">
        {vectorKeys.map((axis) => (
          <label className="inspector-axis-cell" key={axis}>
            <span className="inspector-axis-label">{axis.toUpperCase()}</span>
            <InspectorNumberInput
              className="inspector-axis-input"
              title={`${axis.toUpperCase()}: ${value[axis]} ${unit}`}
              step="0.1"
              value={value[axis]}
              onChange={(nextValue) => updateAxis(axis, nextValue)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

interface DynamicParameterEditorProps {
  snapshot: DynamicParameterSnapshot;
  onChange: (update: DynamicParameterUpdate) => void;
}

/** 根据模型包 manifest 动态渲染参数字段，不硬编码具体模型字段。 */
function DynamicParameterEditor({ snapshot, onChange }: DynamicParameterEditorProps) {
  return (
    <>
      {snapshot.runtimeWarning && <div className="inspector-runtime-warning">{snapshot.runtimeWarning}</div>}
      {snapshot.fields.map((field) => (
        <DynamicParameterField
          key={field.id}
          field={field}
          value={snapshot.values[field.key] ?? field.defaultValue}
          onChange={(value) => onChange({ packageId: snapshot.packageId, key: field.key, value })}
        />
      ))}
      {snapshot.fields.length === 0 && <div className="inspector-empty-section">未解析到可编辑参数</div>}
    </>
  );
}

interface DynamicParameterFieldProps {
  field: DynamicInspectorField;
  value: DynamicParameterValue;
  onChange: (value: DynamicParameterValue) => void;
}

/** 渲染单个模型包动态字段。 */
function DynamicParameterField({ field, value, onChange }: DynamicParameterFieldProps) {
  if (field.kind === "number") {
    return (
      <label className="inspector-row">
        <span className="inspector-row-label">{field.label}</span>
        <InspectorNumberInput
          step={String(field.step ?? 0.1)}
          value={typeof value === "number" ? value : Number(field.defaultValue)}
          onChange={(nextValue) => onChange(clampNumberValue(nextValue, field.min, field.max))}
        />
      </label>
    );
  }

  if (field.kind === "string") {
    return (
      <label className="inspector-row">
        <span className="inspector-row-label">{field.label}</span>
        <input
          className="inspector-input"
          value={typeof value === "string" ? value : String(field.defaultValue)}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    );
  }

  if (field.kind === "boolean") {
    return (
      <InspectorCheckboxRow
        label={field.label}
        checked={typeof value === "boolean" ? value : Boolean(field.defaultValue)}
        onChange={onChange}
      />
    );
  }

  if (field.kind === "color3") {
    const color = isColor3Snapshot(value) ? value : (field.defaultValue as Color3Snapshot);
    return (
      <div className="inspector-row">
        <span className="inspector-row-label">{field.label}</span>
        <input
          className="inspector-color-input"
          type="color"
          value={color3ToHex(color)}
          onInput={(event) => onChange(hexToColor3(event.currentTarget.value))}
        />
      </div>
    );
  }

  return <div className="inspector-empty-section">不支持的参数类型：{field.kind}</div>;
}

/** 限制数字参数在装饰器声明的范围内。 */
function clampNumberValue(value: number, min?: number, max?: number): number {
  if (typeof min === "number" && value < min) {
    return min;
  }

  if (typeof max === "number" && value > max) {
    return max;
  }

  return value;
}

/** 判断值是否为可渲染的 Color3 快照。 */
function isColor3Snapshot(value: DynamicParameterValue): value is Color3Snapshot {
  return typeof value === "object" && value !== null && "r" in value && "g" in value && "b" in value;
}

/** 将 0-1 Color3 转换为 #rrggbb。 */
function color3ToHex(color: Color3Snapshot): string {
  const toHex = (component: number) => Math.round(Math.min(1, Math.max(0, component)) * 255).toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/** 将 #rrggbb 转换为 0-1 Color3。 */
function hexToColor3(value: string): Color3Snapshot {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    g: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    b: Number.parseInt(normalized.slice(4, 6), 16) / 255
  };
}

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

/** 紧凑数字输入行，允许小数和负数的键入中间态，合法数字才提交给引擎。 */
function InspectorNumberRow({ label, step, value, onChange }: InspectorNumberRowProps) {
  return (
    <label className="inspector-row">
      <span className="inspector-row-label">{label}</span>
      <InspectorNumberInput step={step} value={value} onChange={onChange} />
    </label>
  );
}

interface InspectorNumberInputProps {
  className?: string;
  title?: string;
  step: string;
  value: number;
  onChange: (value: number) => void;
}

/** 保留输入草稿，避免用户键入 `-`、`.`、`1.` 时被立即重置。 */
function InspectorNumberInput({ className = "", title, step, value, onChange }: InspectorNumberInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  /** 提交合法数字；非法中间态在失焦时恢复到当前有效值。 */
  const commitDraft = () => {
    if (draft.trim() === "") {
      setDraft(String(value));
      return;
    }

    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
      setDraft(String(parsed));
      return;
    }

    setDraft(String(value));
  };

  return (
    <input
      className={`inspector-input ${className}`.trim()}
      title={title}
      type="number"
      step={step}
      value={draft}
      onBlur={commitDraft}
      onChange={(event) => {
        const nextDraft = event.currentTarget.value;
        setDraft(nextDraft);
        const parsed = Number(nextDraft);
        if (nextDraft !== "" && Number.isFinite(parsed)) {
          onChange(parsed);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface AssetInfoEditorProps {
  value: AssetInfoSnapshot;
  onChange: (update: Partial<Pick<AssetInfoSnapshot, "assetCode">>) => void;
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
