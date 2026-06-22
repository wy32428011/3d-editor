// 此文件由模型包参数脚本和运行脚本合并而成，供编辑器以单个 TS 文件读取。
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { visibleAsBoolean, visibleAsNumber, visibleAsString } from "babylonjs-editor-tools";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

// 此文件按模型参数化说明生成，用于 LED 状态灯 的静态参数配置。
// 第一版只暴露静态参数，不包含旧动画、外部数据驱动或状态高亮运行逻辑。


/**
 * 管理 LED 状态灯 在 Babylon.js Editor Inspector 中展示的静态参数。
 */
export class ParametricModelParamsComponent {
	@visibleAsString("模型标识")
	public modelKey: string = "led";

	@visibleAsString("设备类型")
	public deviceType: string = "状态灯";

	@visibleAsString("设备名称")
	public deviceName: string = "LED 状态灯";

	@visibleAsString("参数说明")
	public description: string = "清单外状态灯资产，支持尺寸、状态颜色和显示开关参数化。";

	@visibleAsNumber("长度", { step: 0.1 })
	public length: number = 1.201;

	@visibleAsNumber("宽度", { step: 0.1 })
	public width: number = 0.073;

	@visibleAsNumber("高度", { step: 0.1 })
	public height: number = 1.726;

	@visibleAsString("运行颜色")
	public runningColor: string = "#2ecc71";

	@visibleAsString("停止颜色")
	public stoppedColor: string = "#95a5a6";

	@visibleAsString("故障颜色")
	public faultColor: string = "#e74c3c";

	@visibleAsString("选中颜色")
	public selectedColor: string = "#f1c40f";

	@visibleAsBoolean("启用状态高亮参数")
	public enableStatusHighlight: boolean = true;

	@visibleAsBoolean("显示状态灯")
	public showLight: boolean = true;

	/**
	 * 创建 LED 状态灯 参数配置组件。
	 * @param node 当前脚本绑定的模型根节点。
	 */
	public constructor(public node: TransformNode) {}

	/**
	 * 参数组件只负责保存 Inspector 字段，运行时由 ParametricModelRuntimeComponent 读取并应用。
	 */
	public onStart(): void {
		// 静态参数会保存到 metadata.scripts[].values，供同目录运行脚本读取。
	}
}

// 此文件按模型参数化说明生成，用于 LED 状态灯 的静态参数化运行。
// 运行脚本只处理尺寸、阵列、显示隐藏、角度和基础布局，不包含旧动画或 外部数据驱动。


type ValueMap = Record<string, unknown>;

interface NodeSnapshot {
	position: Vector3;
	scaling: Vector3;
	rotation?: Vector3;
	rotationQuaternion?: any;
	enabled?: boolean;
}

const DEFAULT_VALUES: ValueMap = {
	"modelKey": "led",
	"deviceType": "状态灯",
	"deviceName": "LED 状态灯",
	"description": "清单外状态灯资产，支持尺寸、状态颜色和显示开关参数化。",
	"length": 1.201,
	"width": 0.073,
	"height": 1.726,
	"runningColor": "#2ecc71",
	"stoppedColor": "#95a5a6",
	"faultColor": "#e74c3c",
	"selectedColor": "#f1c40f",
	"enableStatusHighlight": true,
	"showLight": true
};

/**
 * 根据 Inspector 参数对 LED 状态灯 执行静态参数化调整。
 */
export class ParametricModelRuntimeComponent {
	private readonly snapshots = new Map<any, NodeSnapshot>();
	private readonly generatedNodes: any[] = [];
	private lastSignature = "";

	/**
	 * 创建 LED 状态灯 静态参数化运行组件。
	 * @param node 当前脚本绑定的模型根节点。
	 */
	public constructor(public node: TransformNode) {}

	/**
	 * 启动时记录原始状态，并立即应用当前静态参数。
	 */
	public onStart(): void {
		this.captureSnapshots();
		this.applyIfNeeded(true);
	}

	/**
	 * 每帧检测参数签名变化，变化后恢复基线再重新应用。
	 */
	public onUpdate(): void {
		this.applyIfNeeded(false);
	}

	/**
	 * 停止脚本时清理生成节点，并恢复模型导入时的基础状态。
	 */
	public onStop(): void {
		this.disposeGeneratedNodes();
		this.restoreBaseNodes();
		this.lastSignature = "";
	}

	/**
	 * 在参数变化或强制刷新时重新应用全部静态参数。
	 */
	private applyIfNeeded(force: boolean): void {
		const values = this.readParamValues();
		const signature = JSON.stringify(values);
		if (!force && signature === this.lastSignature) { return; }
		this.disposeGeneratedNodes();
		this.restoreBaseNodes();
		this.applyDimensionScale(values);
		this.applySupportVisibility(values);
		this.applyModelVisibility(values);
		this.applyPositionOffsets(values);
		this.applyAngleParameters(values);
		this.applyForkParameters(values);
		this.applyPlatformParameters(values);
		this.applyRollerDensity(values);
		this.applyCountArray(values);
		this.applyShelfArray(values);
		this.applyDoubleDeep(values);
		this.applyRouteParameters(values);
		this.lastSignature = signature;
	}

	/**
	 * 记录当前模型根节点和所有子节点的基础变换与启用状态。
	 */
	private captureSnapshots(): void {
		this.getModelNodes().forEach((target) => this.rememberSnapshot(target));
	}

	/**
	 * 保存单个节点的基础状态，后续所有参数应用都以该状态为基线。
	 */
	private rememberSnapshot(target: any): NodeSnapshot {
		if (!this.snapshots.has(target)) {
			this.snapshots.set(target, {
				position: target.position?.clone?.() ?? Vector3.Zero(),
				scaling: target.scaling?.clone?.() ?? new Vector3(1, 1, 1),
				rotation: target.rotation?.clone?.(),
				rotationQuaternion: target.rotationQuaternion?.clone?.(),
				enabled: typeof target.isEnabled === "function" ? target.isEnabled() : undefined,
			});
		}
		return this.snapshots.get(target) ?? { position: Vector3.Zero(), scaling: new Vector3(1, 1, 1) };
	}

	/**
	 * 将所有已记录节点恢复到导入时的基础状态。
	 */
	private restoreBaseNodes(): void {
		this.snapshots.forEach((snapshot, target) => {
			if (target.position) { target.position = snapshot.position.clone(); }
			if (target.scaling) { target.scaling = snapshot.scaling.clone(); }
			if (target.rotation && snapshot.rotation) { target.rotation = snapshot.rotation.clone(); }
			if (snapshot.rotationQuaternion && target.rotationQuaternion !== undefined) { target.rotationQuaternion = snapshot.rotationQuaternion.clone(); }
			if (snapshot.enabled !== undefined && typeof target.setEnabled === "function") { target.setEnabled(snapshot.enabled); }
		});
	}

	/**
	 * 从模型 metadata 中读取参数脚本保存的 values，缺失时使用本脚本内置默认值。
	 */
	private readParamValues(): ValueMap {
		const scripts = Array.isArray(this.node.metadata?.scripts) ? this.node.metadata.scripts : [];
		for (const script of scripts) {
			const scriptName = String(script?.className ?? script?.name ?? script?.scriptFilename ?? "");
			const values = { ...this.readFieldDefaults(script), ...this.normalizeValueMap(script?.values), ...this.normalizeValueMap(script?.properties), ...this.normalizeValueMap(script?.config) };
			if (scriptName.includes("ParametricModelParamsComponent") || Object.keys(values).some((key) => key in DEFAULT_VALUES)) { return { ...DEFAULT_VALUES, ...values }; }
		}
		return { ...DEFAULT_VALUES };
	}

	/**
	 * 读取 meta 字段列表中的默认值，保证 Inspector 尚未保存时也能取得参数。
	 */
	private readFieldDefaults(script: any): ValueMap {
		const fields = Array.isArray(script?.fields) ? script.fields : [];
		return fields.reduce((result: ValueMap, field: any) => {
			const key = String(field?.key ?? field?.propertyKey ?? "");
			if (key) { result[key] = field.defaultValue ?? field.value; }
			return result;
		}, {});
	}

	/**
	 * 将 values/properties/config 的包装结构转换为普通键值表。
	 */
	private normalizeValueMap(source: unknown): ValueMap {
		if (!source || typeof source !== "object") { return {}; }
		if (Array.isArray(source)) {
			return source.reduce((result: ValueMap, item: any) => {
				const key = String(item?.key ?? item?.propertyKey ?? item?.name ?? "");
				if (key) { result[key] = item.value ?? item.currentValue ?? item.defaultValue; }
				return result;
			}, {});
		}
		return Object.entries(source as Record<string, unknown>).reduce((result: ValueMap, [key, value]) => {
			if (value && typeof value === "object") {
				const record = value as Record<string, unknown>;
				if ("value" in record || "currentValue" in record || "defaultValue" in record) {
					result[key] = record.value ?? record.currentValue ?? record.defaultValue;
					return result;
				}
			}
			result[key] = value;
			return result;
		}, {});
	}

	/**
	 * 按长度、宽度和高度类字段对模型根节点做 transform 级缩放。
	 */
	private applyDimensionScale(values: ValueMap): void {
		const xScale = this.combineRatios(values, ["length", "lineLength", "chainLength", "bodyLength", "vehicleLength", "radius"], "x");
		const yScale = this.combineRatios(values, ["height", "lineHeight", "chainHeight", "bodyHeight", "frontSupportHeight", "rearSupportHeight"], "y");
		const zScale = this.combineRatios(values, ["width", "lineWidth", "chainWidth", "bodyWidth"], "z");
		this.scaleNode(this.node, xScale, yScale, zScale);
	}

	/**
	 * 根据一组候选字段计算目标米制尺寸相对当前基线包围盒的缩放倍率。
	 */
	private combineRatios(values: ValueMap, keys: string[], axis: "x" | "y" | "z"): number {
		const key = keys.find((candidate) => candidate in values && candidate in DEFAULT_VALUES);
		return key ? this.ratioForNode(this.node, values, key, axis) : 1;
	}

	/**
	 * 对指定节点应用相对基础缩放。
	 */
	private scaleNode(target: any, xScale: number, yScale: number, zScale: number): void {
		const snapshot = this.rememberSnapshot(target);
		if (!target.scaling) { return; }
		target.scaling = new Vector3(snapshot.scaling.x * xScale, snapshot.scaling.y * yScale, snapshot.scaling.z * zScale);
	}

	/**
	 * 根据前后支架开关隐藏或显示可识别的支架节点。
	 */
	private applySupportVisibility(values: ValueMap): void {
		if ("showFrontSupport" in values) { this.setNodesEnabled(this.findNodes(/front|qian|前|zj01|support.?front|front.?support|jiao001/i), this.readBoolean(values, "showFrontSupport", true)); }
		if ("showRearSupport" in values) { this.setNodesEnabled(this.findNodes(/rear|back|hou|后|zj02|support.?rear|rear.?support|jiao004/i), this.readBoolean(values, "showRearSupport", true)); }
	}

	/**
	 * 根据模型显示开关控制状态灯等整体可见性。
	 */
	private applyModelVisibility(values: ValueMap): void {
		if ("showLight" in values) {
			const enabled = this.readBoolean(values, "showLight", true);
			const lightNodes = this.findNodes(/led|light|lamp|灯/i);
			this.setNodesEnabled(lightNodes.length > 0 ? lightNodes : this.getTemplateNodes(), enabled);
		}
	}

	/**
	 * 应用链条或辊筒位置偏移，未找到对应节点时保持原状。
	 */
	private applyPositionOffsets(values: ValueMap): void {
		if ("chainPosition" in values) { this.offsetNodes(this.findNodes(/chain|链|rail/i), new Vector3(0, 0, this.readNumber(values, "chainPosition", 0))); }
		if ("rollerPosition" in values) { this.offsetNodes(this.findNodes(/roller|辊|滚|gt\d*/i), new Vector3(this.readNumber(values, "rollerPosition", 0), 0, 0)); }
	}

	/**
	 * 应用角度类参数，默认只对模型根节点做相对旋转。
	 */
	private applyAngleParameters(values: ValueMap): void {
		if ("angle" in values) { this.rotateNodeY(this.node, this.readNumber(values, "angle", Number(DEFAULT_VALUES.angle ?? 0)) - Number(DEFAULT_VALUES.angle ?? 0)); }
		if ("wheelAngle" in values) { this.findNodes(/wheel|轮/i).forEach((node) => this.rotateNodeY(node, this.readNumber(values, "wheelAngle", Number(DEFAULT_VALUES.wheelAngle ?? 0)) - Number(DEFAULT_VALUES.wheelAngle ?? 0))); }
	}

	/**
	 * 应用货叉长度和货叉间距参数，找不到货叉节点时跳过。
	 */
	private applyForkParameters(values: ValueMap): void {
		const forkNodes = this.findNodes(/fork|叉|huocha|cha\d*/i);
		if ("forkLength" in values) { forkNodes.forEach((node) => this.scaleNode(node, this.ratio(values, "forkLength"), 1, 1)); }
		if ("forkGap" in values && forkNodes.length >= 2) {
			const gap = this.readNumber(values, "forkGap", Number(DEFAULT_VALUES.forkGap ?? 0));
			forkNodes.slice(0, 2).forEach((node, index) => this.offsetNode(node, new Vector3(0, 0, (index === 0 ? -0.5 : 0.5) * gap)));
		}
	}

	/**
	 * 应用载货台或货仓类参数，找不到目标节点时跳过。
	 */
	private applyPlatformParameters(values: ValueMap): void {
		const platformNodes = this.findNodes(/platform|cargo|bay|xiang|台|仓/i);
		if ("platformLength" in values) { platformNodes.forEach((node) => this.scaleNode(node, this.ratio(values, "platformLength"), 1, 1)); }
		if ("platformHeight" in values) { platformNodes.forEach((node) => this.scaleNode(node, 1, this.ratio(values, "platformHeight"), 1)); }
	}

	/**
	 * 根据辊筒密度复制可识别辊筒节点，密度为 1 时保持原模型。
	 */
	private applyRollerDensity(values: ValueMap): void {
		const rollers = this.findNodes(/roller|辊|滚|gt\d*/i);
		if ("rollerWidth" in values) { rollers.forEach((node) => this.scaleNode(node, 1, 1, this.ratioForNode(node, values, "rollerWidth", "z"))); }
		if (!("rollerDensity" in values)) { return; }
		const density = this.clamp(Math.round(this.readNumber(values, "rollerDensity", 1)), 1, 80);
		if (density <= 1) { return; }
		this.cloneNodes(rollers, density, (index) => new Vector3(index * this.readPositiveNumber(values, "rollerWidth", 1), 0, 0), "roller");
	}

	/**
	 * 根据数量参数复制模型模板节点，数量为 1 时保持原模型。
	 */
	private applyCountArray(values: ValueMap): void {
		if (!("count" in values)) { return; }
		const count = this.clamp(Math.round(this.readNumber(values, "count", 1)), 1, 50);
		if (count <= 1) { return; }
		this.cloneTemplate(count, (index) => new Vector3(index * this.readPositiveNumber(values, "vehicleLength", 1), 0, 0), "count");
	}

	/**
	 * 根据货架层数和列数复制模型模板节点，基础模型作为第一个货位。
	 */
	private applyShelfArray(values: ValueMap): void {
		if (!("layerCount" in values) && !("columnCount" in values)) { return; }
		const columns = this.clamp(Math.round(this.readNumber(values, "columnCount", 1)), 1, 100);
		const layers = this.clamp(Math.round(this.readNumber(values, "layerCount", 1)), 1, 20);
		const spacingX = this.readPositiveNumber(values, "cellWidth", 1) + this.readPositiveNumber(values, "postWidth", 0);
		const spacingY = this.readPositiveNumber(values, "cellHeight", 1);
		for (let column = 0; column < columns; column += 1) {
			for (let layer = 0; layer < layers; layer += 1) {
				if (column === 0 && layer === 0) { continue; }
				this.cloneTemplate(2, (index) => index === 1 ? new Vector3(column * spacingX, layer * spacingY, 0) : Vector3.Zero(), "shelf_" + column + "_" + layer);
			}
		}
	}

	/**
	 * 启用双深货位时复制一组模板节点到深位方向。
	 */
	private applyDoubleDeep(values: ValueMap): void {
		if (!this.readBoolean(values, "doubleDeepEnabled", false)) { return; }
		const z = this.readPositiveNumber(values, "cellDepth", 1) + this.readNumber(values, "deepSlotGap", 0);
		this.cloneTemplate(2, (index) => index === 1 ? new Vector3(0, this.readNumber(values, "deepSlotLift", 0), z) : Vector3.Zero(), "double_deep");
	}

	/**
	 * 应用 RGV 路线类静态参数，当前只控制轨道可见性、轨道宽度和双工模板。
	 */
	private applyRouteParameters(values: ValueMap): void {
		if ("showTrack" in values) { this.setNodesEnabled(this.findNodes(/track|rail|轨/i), this.readBoolean(values, "showTrack", true)); }
		if ("trackWidth" in values) { this.findNodes(/track|rail|轨/i).forEach((node) => this.scaleNode(node, 1, 1, this.ratioForNode(node, values, "trackWidth", "z"))); }
		if (String(values.workMode ?? "") === "dual") { this.cloneTemplate(2, (index) => index === 1 ? new Vector3(0, 0, this.readPositiveNumber(values, "trackWidth", 0.2) * 4 + 1) : Vector3.Zero(), "dual_work"); }
	}

	/**
	 * 复制模型根节点下的模板节点。
	 */
	private cloneTemplate(count: number, offsetFactory: (index: number) => Vector3, reason: string): void {
		this.cloneNodes(this.getTemplateNodes(), count, offsetFactory, reason);
	}

	/**
	 * 按指定偏移复制一组节点，第一组原始节点不复制。
	 */
	private cloneNodes(nodes: any[], count: number, offsetFactory: (index: number) => Vector3, reason: string): void {
		if (nodes.length === 0) { return; }
		for (let index = 1; index < count; index += 1) {
			const offset = offsetFactory(index);
			nodes.forEach((source) => this.cloneSingleNode(source, offset, reason, index));
		}
	}

	/**
	 * 克隆单个节点并应用偏移，克隆失败时直接跳过。
	 */
	private cloneSingleNode(source: any, offset: Vector3, reason: string, index: number): void {
		if (typeof source.clone !== "function") { return; }
		const snapshot = this.rememberSnapshot(source);
		const clone = source.clone(String(source.name ?? "node") + "_" + reason + "_" + index, source.parent, false);
		if (!clone) { return; }
		const sourcePosition = source.position?.clone?.() ?? snapshot.position.clone();
		const sourceScaling = source.scaling?.clone?.() ?? snapshot.scaling.clone();
		if (clone.position) { clone.position = sourcePosition.add(offset); }
		if (clone.scaling) { clone.scaling = sourceScaling; }
		clone.metadata = { ...(clone.metadata ?? {}), generatedByParametricRuntime: true, sourceNodeName: source.name, reason };
		if (typeof clone.setEnabled === "function") { clone.setEnabled(true); }
		this.generatedNodes.push(clone);
	}

	/**
	 * 清理本脚本生成的所有克隆节点。
	 */
	private disposeGeneratedNodes(): void {
		while (this.generatedNodes.length > 0) {
			const generated = this.generatedNodes.pop();
			if (generated && typeof generated.dispose === "function") { generated.dispose(); }
		}
	}

	/**
	 * 获取用于复制的模板节点，优先使用模型根节点的直接子节点。
	 */
	private getTemplateNodes(): any[] {
		const nodes = this.getModelNodes().filter((candidate) => candidate !== this.node && candidate.parent === this.node && !candidate.metadata?.generatedByParametricRuntime);
		return nodes.length > 0 ? nodes : this.getModelNodes().filter((candidate) => candidate !== this.node && !candidate.metadata?.generatedByParametricRuntime).slice(0, 1);
	}

	/**
	 * 获取当前模型根节点及其子树内的节点。
	 */
	private getModelNodes(): any[] {
		const scene = this.node.getScene?.();
		const nodes = [this.node, ...(scene?.transformNodes ?? []), ...(scene?.meshes ?? [])];
		return [...new Set(nodes.filter((candidate) => candidate === this.node || candidate.isDescendantOf?.(this.node)))];
	}

	/**
	 * 按名称正则查找模型子树内的节点。
	 */
	private findNodes(pattern: RegExp): any[] {
		return this.getModelNodes().filter((candidate) => candidate !== this.node && pattern.test(String(candidate.name ?? "")));
	}

	/**
	 * 批量设置节点启用状态。
	 */
	private setNodesEnabled(nodes: any[], enabled: boolean): void {
		nodes.forEach((node) => { if (typeof node.setEnabled === "function") { node.setEnabled(enabled); } });
	}

	/**
	 * 对一组节点应用位置偏移。
	 */
	private offsetNodes(nodes: any[], offset: Vector3): void {
		nodes.forEach((node) => this.offsetNode(node, offset));
	}

	/**
	 * 对单个节点应用相对基础位置的偏移。
	 */
	private offsetNode(node: any, offset: Vector3): void {
		const snapshot = this.rememberSnapshot(node);
		if (node.position) { node.position = snapshot.position.add(offset); }
	}

	/**
	 * 按角度差对节点绕 Y 轴旋转。
	 */
	private rotateNodeY(node: any, degreeDelta: number): void {
		const snapshot = this.rememberSnapshot(node);
		if (!node.rotation) { return; }
		node.rotation = snapshot.rotation?.clone?.() ?? new Vector3(0, 0, 0);
		node.rotation.y += degreeDelta * Math.PI / 180;
	}

	/**
	 * 读取长度字段相对当前模型米制包围盒的倍率。
	 */
	private ratio(values: ValueMap, key: string): number {
		return this.ratioForNode(this.node, values, key, this.getAxisForLengthKey(key));
	}

	/**
	 * 将属性面板输入的目标米值换算为指定节点的缩放倍率。
	 */
	private ratioForNode(target: any, values: ValueMap, key: string, axis: "x" | "y" | "z"): number {
		const baselineMeters = this.getNodeWorldAxisSize(target, axis);
		const fallbackMeters = baselineMeters > 0 ? baselineMeters : this.readPositiveNumber(DEFAULT_VALUES, key, 1);
		const targetMeters = this.readPositiveNumber(values, key, fallbackMeters);
		return fallbackMeters > 0 ? targetMeters / fallbackMeters : 1;
	}

	/**
	 * 根据字段名选择默认承载尺寸变化的世界轴。
	 */
	private getAxisForLengthKey(key: string): "x" | "y" | "z" {
		const normalized = key.toLowerCase();
		if (normalized.includes("height")) { return "y"; }
		if (normalized.includes("width") || normalized.includes("depth") || normalized.includes("gap") || normalized.includes("track")) { return "z"; }
		return "x";
	}

	/**
	 * 读取节点当前世界包围盒在指定轴上的米制尺寸。
	 */
	private getNodeWorldAxisSize(target: any, axis: "x" | "y" | "z"): number {
		const bounds = this.getNodeWorldBounds(target);
		return bounds ? Math.max(0, bounds.maximum[axis] - bounds.minimum[axis]) : 0;
	}

	/**
	 * 合并节点自身和子 mesh 的世界包围盒，编辑器导入后这些值已经按米归一。
	 */
	private getNodeWorldBounds(target: any): { minimum: Vector3; maximum: Vector3 } | null {
		const meshes = this.getBoundsMeshes(target);
		let minimum = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
		let maximum = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
		meshes.forEach((mesh) => {
			const bounds = this.getMeshWorldBounds(mesh);
			if (!bounds) { return; }
			minimum = Vector3.Minimize(minimum, bounds.minimum);
			maximum = Vector3.Maximize(maximum, bounds.maximum);
		});
		return Number.isFinite(minimum.x) && Number.isFinite(maximum.x) ? { minimum, maximum } : null;
	}

	/**
	 * 收集可用于包围盒计算的真实 mesh，跳过运行时生成的克隆节点。
	 */
	private getBoundsMeshes(target: any): any[] {
		const meshes: any[] = [];
		if (this.isBoundsMesh(target)) { meshes.push(target); }
		if (typeof target?.getChildMeshes === "function") {
			meshes.push(...target.getChildMeshes(false).filter((child: any) => this.isBoundsMesh(child)));
		}
		return [...new Set(meshes)];
	}

	/**
	 * 判断节点是否可以提供 Babylon 世界包围盒。
	 */
	private isBoundsMesh(node: any): boolean {
		return typeof node?.getBoundingInfo === "function" && !node.metadata?.generatedByParametricRuntime;
	}

	/**
	 * 获取单个 mesh 的世界包围盒。
	 */
	private getMeshWorldBounds(mesh: any): { minimum: Vector3; maximum: Vector3 } | null {
		mesh.computeWorldMatrix?.(true);
		mesh.refreshBoundingInfo?.();
		const box = mesh.getBoundingInfo?.().boundingBox;
		if (!box?.minimumWorld || !box?.maximumWorld) { return null; }
		return { minimum: box.minimumWorld.clone(), maximum: box.maximumWorld.clone() };
	}

	/**
	 * 读取数值字段，无法转换时使用默认值。
	 */
	private readNumber(values: ValueMap, key: string, fallback: number): number {
		const value = Number(values[key]);
		return Number.isFinite(value) ? value : fallback;
	}

	/**
	 * 读取正数数值字段，非正数或无效值使用默认值。
	 */
	private readPositiveNumber(values: ValueMap, key: string, fallback: number): number {
		const value = this.readNumber(values, key, fallback);
		return value > 0 ? value : fallback;
	}

	/**
	 * 读取布尔字段，兼容字符串形式的 true/false。
	 */
	private readBoolean(values: ValueMap, key: string, fallback: boolean): boolean {
		const value = values[key];
		if (typeof value === "boolean") { return value; }
		if (typeof value === "string") { return ["true", "1", "yes", "是", "启用"].includes(value.toLowerCase()); }
		return fallback;
	}

	/**
	 * 将数值限制在指定范围内。
	 */
	private clamp(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}
}
