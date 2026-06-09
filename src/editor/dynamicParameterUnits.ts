import type {
  DynamicInspectorField,
  DynamicInspectorFieldKind,
  DynamicInspectorFieldPhysicalKind,
  DynamicInspectorFieldUnit
} from "../types/editor";

/** 动态参数单位推断结果，字段值仍然保持 Inspector 中输入的原始数值。 */
export interface DynamicParameterUnitInference {
  unit?: DynamicInspectorFieldUnit;
  physicalKind?: DynamicInspectorFieldPhysicalKind;
}

const LENGTH_KEYWORDS = [
  "length",
  "width",
  "height",
  "depth",
  "radius",
  "gap",
  "spacing",
  "position",
  "trackwidth",
  "rollerwidth",
  "cellwidth",
  "cellheight",
  "celldepth",
  "bodylength",
  "bodywidth",
  "bodyheight",
  "platformlength",
  "platformheight",
  "forklength",
  "forkgap",
  "aislewidth",
  "aisleheight",
  "postwidth",
  "deepslotgap",
  "deepslotlift",
  "chainlength",
  "chainwidth",
  "chainheight",
  "vehiclelength",
  "linelength",
  "linewidth",
  "lineheight",
  "frontsupportheight",
  "rearsupportheight"
];

const LENGTH_LABEL_KEYWORDS = [
  "长度",
  "宽度",
  "高度",
  "深度",
  "半径",
  "间距",
  "距离",
  "位置",
  "提升",
  "载货台",
  "货叉",
  "轨道宽",
  "辊筒宽",
  "货格",
  "巷道",
  "立柱",
  "主体"
];

const COUNT_KEYWORDS = ["count", "density", "数量", "层数", "列数", "密度"];
const ANGLE_KEYWORDS = ["angle", "角度"];

/** 规范化 meta 或装饰器中声明的单位别名。 */
export function normalizeDynamicParameterUnit(value: unknown): DynamicInspectorFieldUnit | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["m", "meter", "meters", "metre", "metres", "米"].includes(normalized)) {
    return "m";
  }
  if (["count", "quantity", "number", "个", "数量"].includes(normalized)) {
    return "count";
  }
  if (["degree", "degrees", "deg", "°", "角度"].includes(normalized)) {
    return "degree";
  }
  if (["ratio", "scale", "x", "倍"].includes(normalized)) {
    return "ratio";
  }

  return undefined;
}

/** 从字段 key、label 和显式单位中推断物理语义。 */
export function inferDynamicParameterUnit(
  key: string,
  label: string,
  kind: DynamicInspectorFieldKind,
  explicitUnit?: DynamicInspectorFieldUnit
): DynamicParameterUnitInference {
  if (kind !== "number") {
    return {};
  }

  if (explicitUnit) {
    return { unit: explicitUnit, physicalKind: getPhysicalKindForUnit(explicitUnit) };
  }

  const normalizedKey = key.toLowerCase();
  const normalizedLabel = label.toLowerCase();
  const text = `${normalizedKey} ${normalizedLabel} ${label}`;
  if (COUNT_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))) {
    return { unit: "count", physicalKind: "count" };
  }
  if (ANGLE_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))) {
    return { unit: "degree", physicalKind: "angle" };
  }
  if (
    LENGTH_KEYWORDS.some((keyword) => normalizedKey.includes(keyword)) ||
    LENGTH_LABEL_KEYWORDS.some((keyword) => label.includes(keyword))
  ) {
    const physicalKind = normalizedKey.includes("position") ? "distance" : "length";
    return { unit: "m", physicalKind };
  }

  return {};
}

/** 确保字段携带单位语义，旧字段没有单位时按当前命名规则补齐。 */
export function withInferredDynamicParameterUnit(field: DynamicInspectorField): DynamicInspectorField {
  const inference = inferDynamicParameterUnit(field.key, field.label, field.kind, field.unit);
  return {
    ...field,
    unit: inference.unit,
    physicalKind: inference.physicalKind
  };
}

/** 根据单位得到默认物理语义。 */
function getPhysicalKindForUnit(unit: DynamicInspectorFieldUnit): DynamicInspectorFieldPhysicalKind {
  if (unit === "m") {
    return "length";
  }
  if (unit === "count") {
    return "count";
  }
  if (unit === "degree") {
    return "angle";
  }
  return "ratio";
}
