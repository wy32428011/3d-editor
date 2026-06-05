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
  SceneDataSourceType,
  SceneInspectorSnapshot,
  SceneInspectorUpdate,
  TransformSnapshot,
  TransformUpdate,
  Vector3Snapshot
} from "../types/editor";

interface InspectorPanelProps {
  target: InspectorTarget | null;
  sceneDataDriven: SceneDataDrivenSnapshot;
  onNodeChange: (update: TransformUpdate) => void;
  onSceneChange: (update: SceneInspectorUpdate) => void | Promise<void>;
  onSceneDataDrivenChange: (update: Partial<SceneDataDrivenSnapshot>) => void | Promise<void>;
  onStartStackerDemoPreview: (nodeId: number) => void;
  onSceneInitialize: () => void;
  onImportCadDrawing: (files: FileList | File[]) => void | Promise<void>;
  cadImportDisabled?: boolean;
  cadImportDisabledReason?: string;
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
const dataSourceTypeOptions: SceneDataSourceType[] = ["none", "websocket", "mqtt"];
const dataSourceTypeLabels: Record<SceneDataSourceType, string> = {
  none: "未配置",
  websocket: "WebSocket",
  mqtt: "MQTT"
};
const stackerDemoDeviceId = "stacker";
const stackerDemoEndpoint = "ws://127.0.0.1:18083/stacker";
const stackerDemoTopic = "digital-twin/stacker/state";

/** 右侧属性面板负责按当前目标编辑对象属性或场景级属性。 */
export function InspectorPanel({
  target,
  sceneDataDriven,
  onNodeChange,
  onSceneChange,
  onSceneDataDrivenChange,
  onStartStackerDemoPreview,
  onSceneInitialize,
  onImportCadDrawing,
  cadImportDisabled = false,
  cadImportDisabledReason
}: InspectorPanelProps) {
  const cadInputRef = useRef<HTMLInputElement | null>(null);

  /** 从右侧场景面板选择 CAD 文件后复用外层导入逻辑。 */
  const handleCadFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.files?.length) {
      void onImportCadDrawing(event.currentTarget.files);
      event.currentTarget.value = "";
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
          onImportCad={() => {
            if (!cadImportDisabled) {
              cadInputRef.current?.click();
            }
          }}
          cadImportDisabled={cadImportDisabled}
          cadImportDisabledReason={cadImportDisabledReason}
          onInitialize={onSceneInitialize}
        />
        <input
          ref={cadInputRef}
          className="hidden-input"
          type="file"
          multiple
          accept=".dxf,.dwg,.png,.jpg,.jpeg,.webp"
          disabled={cadImportDisabled}
          onChange={handleCadFileChange}
        />
      </aside>
    );
  }

  return (
    <NodeInspector
      selection={target.node}
      sceneDataDriven={sceneDataDriven}
      onChange={onNodeChange}
      onSceneDataDrivenChange={onSceneDataDrivenChange}
      onStartStackerDemoPreview={onStartStackerDemoPreview}
    />
  );
}

interface NodeInspectorProps {
  selection: TransformSnapshot;
  sceneDataDriven: SceneDataDrivenSnapshot;
  onChange: (update: TransformUpdate) => void;
  onSceneDataDrivenChange: (update: Partial<SceneDataDrivenSnapshot>) => void | Promise<void>;
  onStartStackerDemoPreview: (nodeId: number) => void;
}

/** 对象属性分支，保留原有模型、组件参数和资产编号编辑能力。 */
function NodeInspector({ selection, sceneDataDriven, onChange, onSceneDataDrivenChange, onStartStackerDemoPreview }: NodeInspectorProps) {
  const isLocked = selection.locked;
  const isGroup = selection.kind === "Group";
  const isCad = selection.kind === "CAD";
  const isTransformReadOnly = isLocked || isGroup;

  return (
    <aside className="panel inspector-panel inspector-panel-redesign">
      <div className="inspector-object-bar">
        <input
          aria-label="对象可见性"
          checked={selection.visible}
          className="inspector-object-visible"
          disabled={isLocked}
          type="checkbox"
          onChange={(event) => onChange({ visible: event.target.checked })}
        />
        <input
          aria-label="对象名称"
          className="inspector-object-name"
          disabled={isLocked}
          value={selection.name}
          onInput={(event) => onChange({ name: event.currentTarget.value })}
        />
      </div>
      {isLocked && (
        <div className="inspector-readonly-banner">
          {selection.lockedByAncestor && !selection.selfLocked ? "父级分组已锁定，当前模型只读。" : "当前模型已锁定，只能查看属性。"}
        </div>
      )}

      <fieldset className="inspector-readonly-fieldset" disabled={isTransformReadOnly}>
        <InspectorSection title="空间信息" defaultOpen showRefreshIcon>
          <CompactVectorEditor
            key={`${selection.id}:position`}
            label="位置"
            unit={LENGTH_UNIT_SYMBOL}
            value={selection.position}
            onChange={(value) => onChange({ position: value })}
          />
          <CompactVectorEditor
            key={`${selection.id}:rotation`}
            label="旋转"
            unit={ROTATION_UNIT_SYMBOL}
            value={selection.rotation}
            onChange={(value) => onChange({ rotation: value })}
          />
          <CompactVectorEditor
            key={`${selection.id}:scaling`}
            label="缩放"
            unit={SCALE_UNIT_SYMBOL}
            value={selection.scaling}
            onChange={(value) => onChange({ scaling: value })}
          />
        </InspectorSection>
      </fieldset>

      {isGroup && (
        <InspectorSection title="分组" defaultOpen>
          <div className="inspector-empty-section">当前节点是逻辑分组，可在左侧模型树拖入模型并批量高亮。</div>
        </InspectorSection>
      )}

      {isCad && (
        <fieldset className="inspector-readonly-fieldset" disabled={isLocked}>
          <InspectorSection title="CAD 显示" defaultOpen>
            <CadDisplayEditor opacity={selection.cadOpacity ?? 1} onChange={(cadOpacity) => onChange({ cadOpacity })} />
          </InspectorSection>
        </fieldset>
      )}

      {!isGroup && !isCad && (
        <fieldset className="inspector-readonly-fieldset" disabled={isLocked}>
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
        </fieldset>
      )}

      <InspectorSection title="关节参数">
        <div className="inspector-empty-section">暂无关节参数</div>
      </InspectorSection>

      <InspectorSection title="数据驱动" defaultOpen={!isGroup && !isCad}>
        {!isGroup && !isCad ? (
          <NodeDataDrivenEditor
            nodeLocked={isLocked}
            selection={selection}
            sceneDataDriven={sceneDataDriven}
            onNodeChange={onChange}
            onSceneDataDrivenChange={onSceneDataDrivenChange}
            onStartStackerDemoPreview={onStartStackerDemoPreview}
          />
        ) : (
          <div className="inspector-empty-section">数据驱动仅支持模型节点，请选择拖入场景的模型实例。</div>
        )}
      </InspectorSection>
    </aside>
  );
}

interface CadDisplayEditorProps {
  opacity: number;
  onChange: (opacity: number) => void;
}

/** CAD 显示参数只作用于整张图纸根节点，不改变 DXF 原始颜色和几何数据。 */
function CadDisplayEditor({ opacity, onChange }: CadDisplayEditorProps) {
  const percent = Math.round(clampNumberValue(opacity, 0.05, 1) * 100);

  /** 统一把百分比控件换算回 0-1 透明度倍率。 */
  const updatePercent = (nextPercent: number) => {
    onChange(clampNumberValue(nextPercent, 5, 100) / 100);
  };

  return (
    <>
      <div className="inspector-row cad-opacity-row">
        <span className="inspector-row-label">透明度</span>
        <input
          aria-label="CAD 图纸透明度"
          className="cad-opacity-slider"
          max={100}
          min={5}
          step={5}
          type="range"
          value={percent}
          onInput={(event) => updatePercent(Number(event.currentTarget.value))}
        />
      </div>
      <InspectorNumberRow label="不透明度(%)" step="5" value={percent} onChange={updatePercent} />
    </>
  );
}

interface SceneInspectorProps {
  scene: SceneInspectorSnapshot;
  onChange: (update: SceneInspectorUpdate) => void | Promise<void>;
  onImportCad: () => void;
  cadImportDisabled?: boolean;
  cadImportDisabledReason?: string;
  onInitialize: () => void;
}

/** 场景属性分支，点击非模型区域后显示并编辑场景级配置。 */
function SceneInspector({
  scene,
  onChange,
  onImportCad,
  cadImportDisabled = false,
  cadImportDisabledReason,
  onInitialize
}: SceneInspectorProps) {
  return (
    <>
      <InspectorSection title="场景" defaultOpen>
        <SceneNameEditor name={scene.name} onCommit={(name) => void onChange({ name })} />
        <div className="inspector-button-row">
          <button className="inspector-action-button" type="button" onClick={onInitialize}>
            场景初始化
          </button>
          <button
            className="inspector-action-button"
            type="button"
            disabled={cadImportDisabled}
            title={cadImportDisabled ? cadImportDisabledReason ?? "CAD 图纸正在导入，请等待完成" : "导入CAD"}
            onClick={onImportCad}
          >
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

/** SceneDataDrivenComponent 配置编辑器，保存连接参数并由预览模式启动真实数据驱动。 */
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
      <DataSourceConnectionEditor value={value} onChange={onChange} />
    </>
  );
}

interface DataSourceConnectionEditorProps {
  value: SceneDataDrivenSnapshot;
  onChange: (update: Partial<SceneDataDrivenSnapshot>) => void | Promise<void>;
}

/** 场景统一数据源连接字段，场景属性和对象数据驱动分区共用同一套写回逻辑。 */
function DataSourceConnectionEditor({ value, onChange }: DataSourceConnectionEditorProps) {
  return (
    <>
      <InspectorCheckboxRow
        label="启用连接"
        checked={value.dataConnectionEnabled}
        onChange={(dataConnectionEnabled) => onChange({ dataConnectionEnabled })}
      />
      <InspectorSelectRow
        label="数据源"
        options={dataSourceTypeOptions}
        optionLabels={dataSourceTypeLabels}
        value={value.dataSourceType}
        onChange={(dataSourceType) => onChange({ dataSourceType: dataSourceType as SceneDataSourceType })}
      />
      <InspectorTextRow label="连接地址" value={value.dataEndpoint} onChange={(dataEndpoint) => onChange({ dataEndpoint })} />
      <InspectorTextRow label="通道/Topic" value={value.dataChannel} onChange={(dataChannel) => onChange({ dataChannel })} />
      <InspectorTextRow label="设备字段" value={value.deviceIdField} onChange={(deviceIdField) => onChange({ deviceIdField })} />
      <InspectorTextRow label="匹配字段" value={value.assetCodeField} onChange={(assetCodeField) => onChange({ assetCodeField })} />
      <InspectorTextRow label="数据路径" value={value.payloadPath} onChange={(payloadPath) => onChange({ payloadPath })} />
      <InspectorNumberRow
        label="插值(ms)"
        step="50"
        value={value.interpolationMs}
        onChange={(interpolationMs) => onChange({ interpolationMs })}
      />
      <InspectorTextRow
        label="凭证引用"
        value={value.credentialProfileId}
        onChange={(credentialProfileId) => onChange({ credentialProfileId })}
      />
    </>
  );
}

interface NodeDataDrivenEditorProps {
  nodeLocked: boolean;
  selection: TransformSnapshot;
  sceneDataDriven: SceneDataDrivenSnapshot;
  onNodeChange: (update: TransformUpdate) => void;
  onSceneDataDrivenChange: (update: Partial<SceneDataDrivenSnapshot>) => void | Promise<void>;
  onStartStackerDemoPreview: (nodeId: number) => void;
}

/** 对象数据驱动入口：模型只保存设备绑定，连接参数仍写入场景级 SceneDataDrivenComponent。 */
function NodeDataDrivenEditor({
  nodeLocked,
  selection,
  sceneDataDriven,
  onNodeChange,
  onSceneDataDrivenChange,
  onStartStackerDemoPreview
}: NodeDataDrivenEditorProps) {
  const sourceTypeLabel = dataSourceTypeLabels[sceneDataDriven.dataSourceType] ?? sceneDataDriven.dataSourceType;
  const endpointText = sceneDataDriven.dataEndpoint.trim() || "未填写连接地址";
  const channelText = sceneDataDriven.dataChannel.trim() || "未填写通道/Topic";
  const connectionText = sceneDataDriven.dataConnectionEnabled ? "连接已启用" : "连接未启用";
  /** 一键填入本地桥接 demo 配置，模型侧只写绑定设备，连接参数仍写入场景级配置。 */
  const applyStackerDemoConfig = () => {
    if (!nodeLocked) {
      onNodeChange({ assetInfo: { assetCode: stackerDemoDeviceId } });
    }
    void onSceneDataDrivenChange({
      dataConnectionEnabled: true,
      dataSourceType: "websocket",
      dataEndpoint: stackerDemoEndpoint,
      dataChannel: stackerDemoTopic,
      deviceIdField: "deviceId",
      assetCodeField: "assetCode",
      payloadPath: "",
      interpolationMs: 200,
      credentialProfileId: ""
    });
  };

  return (
    <>
      <div className="inspector-data-driven-summary">
        <div className="inspector-data-driven-summary-title">场景统一数据源</div>
        <div>{`${connectionText} · ${sourceTypeLabel}`}</div>
        <div className="inspector-data-driven-summary-line" title={endpointText}>
          {endpointText}
        </div>
        <div className="inspector-data-driven-summary-line" title={channelText}>
          {channelText}
        </div>
      </div>
      <div className="inspector-data-demo-actions">
        <button
          className="inspector-data-demo-button is-primary"
          disabled={nodeLocked}
          type="button"
          title={nodeLocked ? "当前模型已锁定，请先解锁后再启动模拟。" : "启动内置 Stacker 模拟数据并进入预览"}
          onClick={() => onStartStackerDemoPreview(selection.id)}
        >
          启动 Stacker 模拟
        </button>
        <button
          className="inspector-data-demo-button"
          disabled={nodeLocked}
          type="button"
          title={nodeLocked ? "当前模型已锁定，请先解锁后再写入 demo 绑定。" : "填入本地 Stacker MQTT demo 桥接配置"}
          onClick={applyStackerDemoConfig}
        >
          填入 Stacker Demo
        </button>
      </div>
      <label className="inspector-row">
        <span className="inspector-row-label">绑定设备</span>
        <input
          className="inspector-input"
          disabled={nodeLocked}
          placeholder="stacker"
          title="写入对象资产编号，用于匹配数据包中的设备号"
          value={selection.assetInfo.assetCode}
          onInput={(event) => onNodeChange({ assetInfo: { assetCode: event.currentTarget.value } })}
        />
      </label>
      <div className="inspector-data-source-editor">
        <DataSourceConnectionEditor value={sceneDataDriven} onChange={onSceneDataDrivenChange} />
      </div>
    </>
  );
}

interface InspectorSelectRowProps {
  label: string;
  options: string[];
  optionLabels?: Record<string, string>;
  value: string;
  onChange: (value: string) => void;
}

/** 紧凑下拉行，沿用属性面板输入框视觉。 */
function InspectorSelectRow({ label, options, optionLabels = {}, value, onChange }: InspectorSelectRowProps) {
  const normalizedOptions = options.includes(value) ? options : [value, ...options].filter((item) => item.length > 0);
  return (
    <label className="inspector-row">
      <span className="inspector-row-label">{label}</span>
      <select className="inspector-input" value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {normalizedOptions.map((option) => (
          <option key={option} value={option}>
            {optionLabels[option] ?? option}
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
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);

  useEffect(() => {
    draftRef.current = value;
    setDraft(value);
  }, [value.x, value.y, value.z]);

  /** 修改单个轴向数值，并基于最新本地草稿保留其他轴向。 */
  const updateAxis = (axis: keyof Vector3Snapshot, nextValue: number) => {
    const nextDraft = {
      ...draftRef.current,
      [axis]: nextValue
    };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    onChange(nextDraft);
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
              title={`${axis.toUpperCase()}: ${draft[axis]} ${unit}`}
              step="0.1"
              value={draft[axis]}
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
