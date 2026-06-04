import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { LENGTH_UNIT_SYMBOL, ROTATION_UNIT_SYMBOL, SCALE_UNIT_SYMBOL } from "../editor/units";
import type {
  AssetInfoSnapshot,
  Color3Snapshot,
  DynamicInspectorField,
  DynamicParameterSnapshot,
  DynamicParameterUpdate,
  DynamicParameterValue,
  InspectorTarget,
  MeshVertexModifySnapshot,
  SceneDataDrivenSnapshot,
  SceneInspectorSnapshot,
  SceneInspectorUpdate,
  TransformSnapshot,
  TransformUpdate,
  Vector3Snapshot
} from "../types/editor";

interface InspectorPanelProps {
  target: InspectorTarget | null;
  onNodeChange: (update: TransformUpdate) => void;
  onSceneChange: (update: SceneInspectorUpdate) => void | Promise<void>;
  onSceneInitialize: () => void;
  onImportCadDrawing: (file: File) => void | Promise<void>;
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

const dataDrivenModeOptions = ["RuntimeDataDrivenZD"];
const defaultGeneratorOptions = ["注塑托盘（实体）", "空托盘", "默认实体"];
const deviceInitializationOptions = ["不初始化", "初始化"];
const robotArmDriveModeOptions = ["全部新能源库", "手动配置", "禁用"];

/** 右侧属性面板负责按当前目标编辑对象属性或场景级属性。 */
export function InspectorPanel({ target, onNodeChange, onSceneChange, onSceneInitialize, onImportCadDrawing }: InspectorPanelProps) {
  const cadInputRef = useRef<HTMLInputElement | null>(null);

  /** 从右侧场景面板选择 CAD 文件后复用外层导入逻辑。 */
  const handleCadFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) {
      void onImportCadDrawing(file);
    }
  };

  if (!target) {
    return (
      <aside className="panel inspector-panel inspector-panel-redesign">
        <div className="inspector-empty-state">场景尚未准备好</div>
      </aside>
    );
  }

  if (target.type === "scene") {
    return (
      <aside className="panel inspector-panel inspector-panel-redesign">
        <SceneInspector
          scene={target.scene}
          onChange={onSceneChange}
          onImportCad={() => cadInputRef.current?.click()}
          onInitialize={onSceneInitialize}
        />
        <input ref={cadInputRef} className="hidden-input" type="file" accept=".dxf,.dwg" onChange={handleCadFileChange} />
      </aside>
    );
  }

  return <NodeInspector selection={target.node} onChange={onNodeChange} />;
}

interface NodeInspectorProps {
  selection: TransformSnapshot;
  onChange: (update: TransformUpdate) => void;
}

/** 对象属性分支，保留原有模型、组件参数和资产编号编辑能力。 */
function NodeInspector({ selection, onChange }: NodeInspectorProps) {
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

interface SceneInspectorProps {
  scene: SceneInspectorSnapshot;
  onChange: (update: SceneInspectorUpdate) => void | Promise<void>;
  onImportCad: () => void;
  onInitialize: () => void;
}

/** 场景属性分支，点击非模型区域后显示并编辑场景级配置。 */
function SceneInspector({ scene, onChange, onImportCad, onInitialize }: SceneInspectorProps) {
  return (
    <>
      <InspectorSection title="场景" defaultOpen>
        <SceneNameEditor name={scene.name} onCommit={(name) => void onChange({ name })} />
        <div className="inspector-button-row">
          <button className="inspector-action-button" type="button" onClick={onInitialize}>
            场景初始化
          </button>
          <button className="inspector-action-button" type="button" onClick={onImportCad}>
            导入CAD
          </button>
        </div>
      </InspectorSection>

      <InspectorSection title="相机" defaultOpen>
        <InspectorNumberRow
          label="可视距离"
          step="100"
          value={scene.camera.visibleDistance}
          onChange={(visibleDistance) => void onChange({ camera: { visibleDistance } })}
        />
      </InspectorSection>

      <InspectorSection title="编辑器设置" defaultOpen>
        <InspectorNumberRow
          label="缩放灵敏度"
          step="1"
          value={scene.editorSettings.zoomSensitivity}
          onChange={(zoomSensitivity) => void onChange({ editorSettings: { zoomSensitivity } })}
        />
        <InspectorNumberRow
          label="移动灵敏度"
          step="1"
          value={scene.editorSettings.moveSensitivity}
          onChange={(moveSensitivity) => void onChange({ editorSettings: { moveSensitivity } })}
        />
        <InspectorNumberRow
          label="旋转灵敏度"
          step="1"
          value={scene.editorSettings.rotateSensitivity}
          onChange={(rotateSensitivity) => void onChange({ editorSettings: { rotateSensitivity } })}
        />
      </InspectorSection>

      <InspectorSection title="环境属性" defaultOpen>
        <div className="inspector-row">
          <span className="inspector-row-label">环境模型</span>
          <div className="inspector-environment-preview" style={{ backgroundColor: scene.environment.backgroundColor }}>
            <span>Scene</span>
          </div>
        </div>
        <div className="inspector-row">
          <span className="inspector-row-label">背景颜色</span>
          <input
            className="inspector-color-input"
            type="color"
            value={scene.environment.backgroundColor}
            onInput={(event) => void onChange({ environment: { backgroundColor: event.currentTarget.value } })}
          />
        </div>
      </InspectorSection>

      <InspectorSection title="预设效果" defaultOpen>
        <div className="inspector-effect-grid">
          <div className="inspector-effect-tile is-active">默认预设</div>
          <div className="inspector-effect-tile">效果A</div>
        </div>
      </InspectorSection>

      <InspectorSection title="SceneDataDrivenComponent" defaultOpen>
        <SceneDataDrivenEditor
          value={scene.dataDriven}
          onChange={(dataDriven) => void onChange({ dataDriven })}
        />
      </InspectorSection>
    </>
  );
}

interface SceneNameEditorProps {
  name: string;
  onCommit: (name: string) => void;
}

/** 场景名称编辑器在失焦或回车时提交，避免每次键入都触发主进程重命名。 */
function SceneNameEditor({ name, onCommit }: SceneNameEditorProps) {
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  /** 提交当前草稿，空名称回退到外层传入的有效场景名。 */
  const commitDraft = () => {
    const nextName = draft.trim();
    if (!nextName) {
      setDraft(name);
      return;
    }

    if (nextName !== name) {
      onCommit(nextName);
    }
    setDraft(nextName);
  };

  return (
    <label className="inspector-row">
      <span className="inspector-row-label">场景名称</span>
      <input
        className="inspector-input"
        value={draft}
        onBlur={commitDraft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

interface SceneDataDrivenEditorProps {
  value: SceneDataDrivenSnapshot;
  onChange: (update: Partial<SceneDataDrivenSnapshot>) => void;
}

/** SceneDataDrivenComponent 配置编辑器，本次只写入场景 metadata，不启动运行时。 */
function SceneDataDrivenEditor({ value, onChange }: SceneDataDrivenEditorProps) {
  return (
    <>
      <InspectorSelectRow
        label="数据驱动方式"
        options={dataDrivenModeOptions}
        value={value.dataDrivenMode}
        onChange={(dataDrivenMode) => onChange({ dataDrivenMode })}
      />
      <InspectorSelectRow
        label="默认产生器"
        options={defaultGeneratorOptions}
        value={value.defaultGenerator}
        onChange={(defaultGenerator) => onChange({ defaultGenerator })}
      />
      <InspectorSelectRow
        label="设备属性初始化"
        options={deviceInitializationOptions}
        value={value.devicePropertyInitialization}
        onChange={(devicePropertyInitialization) => onChange({ devicePropertyInitialization })}
      />
      <InspectorSelectRow
        label="机械手驱动方式"
        options={robotArmDriveModeOptions}
        value={value.robotArmDriveMode}
        onChange={(robotArmDriveMode) => onChange({ robotArmDriveMode })}
      />
      <InspectorTextRow
        label="箱式线产生器"
        value={value.boxLineGenerator}
        onChange={(boxLineGenerator) => onChange({ boxLineGenerator })}
      />
      <InspectorNumberRow label="Size" step="1" value={value.size} onChange={(size) => onChange({ size })} />
    </>
  );
}

interface InspectorSelectRowProps {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** 紧凑下拉行，沿用属性面板输入框视觉。 */
function InspectorSelectRow({ label, options, value, onChange }: InspectorSelectRowProps) {
  const normalizedOptions = options.includes(value) ? options : [value, ...options].filter((item) => item.length > 0);
  return (
    <label className="inspector-row">
      <span className="inspector-row-label">{label}</span>
      <select className="inspector-input" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {normalizedOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

interface InspectorTextRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** 紧凑文本行，供场景级字符串配置实时写入 metadata。 */
function InspectorTextRow({ label, value, onChange }: InspectorTextRowProps) {
  return (
    <label className="inspector-row">
      <span className="inspector-row-label">{label}</span>
      <input className="inspector-input" value={value} onInput={(event) => onChange(event.currentTarget.value)} />
    </label>
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
