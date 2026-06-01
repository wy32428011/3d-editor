import { LENGTH_UNIT_SYMBOL, ROTATION_UNIT_SYMBOL, SCALE_UNIT_SYMBOL } from "../editor/units";
import type { TransformSnapshot, TransformUpdate, Vector3Snapshot } from "../types/editor";

interface InspectorPanelProps {
  selection: TransformSnapshot | null;
  onChange: (update: TransformUpdate) => void;
}

const vectorKeys: Array<keyof Vector3Snapshot> = ["x", "y", "z"];

/** 右侧属性面板负责编辑当前选中对象的名称、变换、显隐和材质颜色。 */
export function InspectorPanel({ selection, onChange }: InspectorPanelProps) {
  if (!selection) {
    return (
      <aside className="panel inspector-panel">
        <div className="panel-title">属性</div>
        <div className="empty-state">未选中对象</div>
      </aside>
    );
  }

  return (
    <aside className="panel inspector-panel">
      <div className="panel-title">属性</div>
      <label className="field">
        <span>名称</span>
        <input value={selection.name} onInput={(event) => onChange({ name: event.currentTarget.value })} />
      </label>

      <div className="property-badge">{selection.kind}</div>

      <VectorEditor label="位置" unit={LENGTH_UNIT_SYMBOL} value={selection.position} onChange={(value) => onChange({ position: value })} />
      <VectorEditor label="旋转" unit={ROTATION_UNIT_SYMBOL} value={selection.rotation} onChange={(value) => onChange({ rotation: value })} />
      <VectorEditor label="缩放" unit={SCALE_UNIT_SYMBOL} value={selection.scaling} onChange={(value) => onChange({ scaling: value })} />

      <label className="toggle-field">
        <input checked={selection.visible} type="checkbox" onChange={(event) => onChange({ visible: event.target.checked })} />
        <span>可见</span>
      </label>

      {selection.materialColor && (
        <label className="field">
          <span>材质色</span>
          <input type="color" value={selection.materialColor} onInput={(event) => onChange({ materialColor: event.currentTarget.value })} />
        </label>
      )}
    </aside>
  );
}

interface VectorEditorProps {
  label: string;
  unit: string;
  value: Vector3Snapshot;
  onChange: (value: Vector3Snapshot) => void;
}

/** 三维向量编辑器将 x/y/z 三个数值保持在稳定布局中。 */
function VectorEditor({ label, unit, value, onChange }: VectorEditorProps) {
  /** 修改单个轴向数值，并保留其他轴向不变。 */
  const updateAxis = (axis: keyof Vector3Snapshot, nextValue: string) => {
    const parsed = Number(nextValue);
    onChange({
      ...value,
      [axis]: Number.isFinite(parsed) ? parsed : 0
    });
  };

  return (
    <div className="vector-field">
      <span className="vector-label">{label}</span>
      <div className="vector-grid">
        {vectorKeys.map((axis) => (
          <label key={axis}>
            <span>{axis.toUpperCase()}</span>
            <input type="number" step="0.1" value={value[axis]} onInput={(event) => updateAxis(axis, event.currentTarget.value)} />
            <span className="axis-unit">{unit}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
