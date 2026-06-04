/** 编辑器支持的外部模型源单位，最终都会归一到米制场景。 */
export type ModelSourceUnit = "meter" | "centimeter" | "millimeter" | "unknown";

/** 单位决策来源，用于保存后排查资产尺寸为何被这样处理。 */
export type UnitInferenceMethod = "assetMetadata" | "boundsHeuristic" | "legacyDefault" | "manual";

/** 单位推断置信度；低置信度结果后续可以提供手动覆盖入口。 */
export type UnitInferenceConfidence = "high" | "medium" | "low";

/** 单位归一化 metadata 的当前版本号，防止未来重复缩放或误读旧记录。 */
export const MODEL_UNIT_NORMALIZATION_VERSION = 1;

const CENTIMETER_TO_METER_SCALE = 0.01;
const MILLIMETER_TO_METER_SCALE = 0.001;
const CENTIMETER_MIN_MAX_DIMENSION = 30;
const MILLIMETER_MIN_MAX_DIMENSION = 3000;
const NORMALIZABLE_MODEL_EXTENSIONS = new Set([".glb", ".gltf", ".obj", ".stl"]);

/** 可序列化的模型包围盒摘要，单位为 loader 应用节点变换后的当前场景单位。 */
export interface ModelBoundsSnapshot {
  maxDimension: number;
}

/** 模型单位归一化记录，会同时写入资产记录和导入根节点 metadata。 */
export interface ModelUnitMetadata {
  version: number;
  sourceUnit: ModelSourceUnit;
  unitScaleToMeters: number;
  inferenceMethod: UnitInferenceMethod;
  confidence: UnitInferenceConfidence;
  rawMaxDimension: number;
  normalizedMaxDimension: number;
}

/** 返回指定源单位到米的换算比例。 */
export function getUnitScaleToMeters(unit: ModelSourceUnit): number {
  if (unit === "centimeter") {
    return CENTIMETER_TO_METER_SCALE;
  }

  if (unit === "millimeter") {
    return MILLIMETER_TO_METER_SCALE;
  }

  return 1;
}

/** 判断文件扩展名是否应参与模型单位自动归一化。 */
export function shouldNormalizeModelExtension(extension: string): boolean {
  return NORMALIZABLE_MODEL_EXTENSIONS.has(extension.toLowerCase());
}

/** 从已保存的资产字段恢复单位 metadata，保证同一资产后续拖入不再重新猜单位。 */
export function getPersistedModelUnitMetadata(value: unknown): ModelUnitMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (isNormalizedModelUnitMetadata(value)) {
    return createModelUnitMetadata({ ...value, inferenceMethod: "assetMetadata" });
  }

  const record = value as {
    sourceUnit?: unknown;
    unitScaleToMeters?: unknown;
    unitInferenceMethod?: unknown;
    unitInferenceConfidence?: unknown;
    unitNormalizationVersion?: unknown;
    rawMaxDimension?: unknown;
    normalizedMaxDimension?: unknown;
  };
  if (
    record.unitNormalizationVersion !== MODEL_UNIT_NORMALIZATION_VERSION ||
    typeof record.unitScaleToMeters !== "number" ||
    !isModelSourceUnit(record.sourceUnit) ||
    !isUnitInferenceMethod(record.unitInferenceMethod) ||
    !isUnitInferenceConfidence(record.unitInferenceConfidence)
  ) {
    return null;
  }

  return createModelUnitMetadata({
    sourceUnit: record.sourceUnit,
    unitScaleToMeters: record.unitScaleToMeters,
    inferenceMethod: "assetMetadata",
    confidence: record.unitInferenceConfidence,
    rawMaxDimension: typeof record.rawMaxDimension === "number" ? record.rawMaxDimension : 0,
    normalizedMaxDimension: typeof record.normalizedMaxDimension === "number" ? record.normalizedMaxDimension : 0
  });
}

/** 根据 loader 后的世界包围盒推断源单位，并给出归一到米的缩放比例。 */
export function inferModelUnitFromBounds(
  bounds: ModelBoundsSnapshot | null,
  extension: string,
  persistedMetadata?: ModelUnitMetadata | null
): ModelUnitMetadata {
  if (persistedMetadata) {
    return createModelUnitMetadata({ ...persistedMetadata, inferenceMethod: "assetMetadata" });
  }

  if (!bounds || !Number.isFinite(bounds.maxDimension) || bounds.maxDimension <= 0 || !shouldNormalizeModelExtension(extension)) {
    return createModelUnitMetadata({
      sourceUnit: "meter",
      inferenceMethod: "legacyDefault",
      confidence: "low",
      rawMaxDimension: bounds?.maxDimension ?? 0
    });
  }

  const sourceUnit = inferSourceUnitByMaxDimension(bounds.maxDimension);
  const unitScaleToMeters = getUnitScaleToMeters(sourceUnit);
  return createModelUnitMetadata({
    sourceUnit,
    unitScaleToMeters,
    inferenceMethod: "boundsHeuristic",
    confidence: sourceUnit === "meter" ? "medium" : "high",
    rawMaxDimension: bounds.maxDimension,
    normalizedMaxDimension: bounds.maxDimension * unitScaleToMeters
  });
}

/** 创建归一化 metadata，并自动补齐标准版本和归一后最大尺寸。 */
export function createModelUnitMetadata(options: {
  sourceUnit: ModelSourceUnit;
  unitScaleToMeters?: number;
  inferenceMethod: UnitInferenceMethod;
  confidence: UnitInferenceConfidence;
  rawMaxDimension?: number;
  normalizedMaxDimension?: number;
}): ModelUnitMetadata {
  const unitScaleToMeters = options.unitScaleToMeters ?? getUnitScaleToMeters(options.sourceUnit);
  const rawMaxDimension = Number.isFinite(options.rawMaxDimension) ? options.rawMaxDimension ?? 0 : 0;
  return {
    version: MODEL_UNIT_NORMALIZATION_VERSION,
    sourceUnit: options.sourceUnit,
    unitScaleToMeters,
    inferenceMethod: options.inferenceMethod,
    confidence: options.confidence,
    rawMaxDimension,
    normalizedMaxDimension:
      options.normalizedMaxDimension ?? (Number.isFinite(rawMaxDimension) ? rawMaxDimension * unitScaleToMeters : 0)
  };
}

/** 校验未知值是否是当前版本可识别的单位归一化 metadata。 */
export function isNormalizedModelUnitMetadata(value: unknown): value is ModelUnitMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const metadata = value as ModelUnitMetadata;
  return (
    metadata.version === MODEL_UNIT_NORMALIZATION_VERSION &&
    isModelSourceUnit(metadata.sourceUnit) &&
    typeof metadata.unitScaleToMeters === "number" &&
    isUnitInferenceMethod(metadata.inferenceMethod) &&
    isUnitInferenceConfidence(metadata.confidence) &&
    typeof metadata.rawMaxDimension === "number" &&
    typeof metadata.normalizedMaxDimension === "number"
  );
}

/** 根据最大包围盒尺寸做首版工业模型单位推断，不依赖文件名。 */
function inferSourceUnitByMaxDimension(maxDimension: number): ModelSourceUnit {
  if (maxDimension >= MILLIMETER_MIN_MAX_DIMENSION) {
    return "millimeter";
  }

  if (maxDimension >= CENTIMETER_MIN_MAX_DIMENSION) {
    return "centimeter";
  }

  return "meter";
}

/** 判断字符串是否属于支持的源单位。 */
function isModelSourceUnit(value: unknown): value is ModelSourceUnit {
  return value === "meter" || value === "centimeter" || value === "millimeter" || value === "unknown";
}

/** 判断字符串是否属于支持的单位决策来源。 */
function isUnitInferenceMethod(value: unknown): value is UnitInferenceMethod {
  return value === "assetMetadata" || value === "boundsHeuristic" || value === "legacyDefault" || value === "manual";
}

/** 判断字符串是否属于支持的单位推断置信度。 */
function isUnitInferenceConfidence(value: unknown): value is UnitInferenceConfidence {
  return value === "high" || value === "medium" || value === "low";
}
