import type { Color3Snapshot, DynamicInspectorField } from "../types/editor";

interface ParsedDecoratorResult {
  fields: DynamicInspectorField[];
  warnings: string[];
}

const NUMBER_DECORATOR_PATTERN = /@visibleAsNumber\(\s*["']([^"']+)["']\s*(?:,\s*\{([^}]*)\})?\s*\)\s*(?:private\s+|public\s+|protected\s+)?([A-Za-z_$][\w$]*)\s*:\s*number\s*=\s*(-?\d+(?:\.\d+)?)/g;
const COLOR3_DECORATOR_PATTERN = /@visibleAsColor3\(\s*["']([^"']+)["']\s*\)\s*(?:private\s+|public\s+|protected\s+)?([A-Za-z_$][\w$]*)\s*:\s*Color3\s*=\s*new\s+Color3\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
const STRING_DECORATOR_PATTERN = /@visibleAsString\(\s*["']([^"']+)["']\s*\)\s*(?:private\s+|public\s+|protected\s+)?([A-Za-z_$][\w$]*)\s*:\s*string\s*=\s*(["'])(.*?)\3/g;
const BOOLEAN_DECORATOR_PATTERN = /@visibleAsBoolean\(\s*["']([^"']+)["']\s*\)\s*(?:private\s+|public\s+|protected\s+)?([A-Za-z_$][\w$]*)\s*:\s*boolean\s*=\s*(true|false)/g;

/**
 * 静态解析模型包脚本中的属性面板装饰器，不执行脚本代码。
 * 当前只支持示例模型使用的简单字面量语法；变量引用、表达式和运行时计算会被忽略，避免任意代码执行风险。
 */
export function parseModelPackageDecorators(scriptText: string, sourceFile: string): ParsedDecoratorResult {
  const warnings: string[] = [];
  const matches: Array<{ index: number; field: Omit<DynamicInspectorField, "order"> }> = [];

  for (const match of scriptText.matchAll(NUMBER_DECORATOR_PATTERN)) {
    const [, label, optionText = "", key, defaultText] = match;
    const options = parseNumberDecoratorOptions(optionText, warnings, sourceFile, key);
    matches.push({
      index: match.index ?? 0,
      field: {
        id: `${sourceFile}:${key}`,
        key,
        label,
        kind: "number",
        defaultValue: Number(defaultText),
        min: options.min,
        max: options.max,
        step: options.step,
        sourceFile,
        sourceDecorator: "visibleAsNumber"
      }
    });
  }

  for (const match of scriptText.matchAll(COLOR3_DECORATOR_PATTERN)) {
    const [, label, key, rText, gText, bText] = match;
    const defaultValue: Color3Snapshot = {
      r: Number(rText),
      g: Number(gText),
      b: Number(bText)
    };
    matches.push({
      index: match.index ?? 0,
      field: {
        id: `${sourceFile}:${key}`,
        key,
        label,
        kind: "color3",
        defaultValue,
        sourceFile,
        sourceDecorator: "visibleAsColor3"
      }
    });
  }

  for (const match of scriptText.matchAll(STRING_DECORATOR_PATTERN)) {
    const [, label, key, , defaultValue] = match;
    matches.push({
      index: match.index ?? 0,
      field: {
        id: `${sourceFile}:${key}`,
        key,
        label,
        kind: "string",
        defaultValue,
        sourceFile,
        sourceDecorator: "visibleAsString"
      }
    });
  }

  for (const match of scriptText.matchAll(BOOLEAN_DECORATOR_PATTERN)) {
    const [, label, key, defaultText] = match;
    matches.push({
      index: match.index ?? 0,
      field: {
        id: `${sourceFile}:${key}`,
        key,
        label,
        kind: "boolean",
        defaultValue: defaultText === "true",
        sourceFile,
        sourceDecorator: "visibleAsBoolean"
      }
    });
  }

  const fields = matches
    .sort((left, right) => left.index - right.index)
    .map(({ field }, order) => ({ ...field, order }));

  if (fields.length === 0) {
    warnings.push(`${sourceFile} 未解析到 visibleAsNumber、visibleAsString、visibleAsBoolean 或 visibleAsColor3 参数。`);
  }

  return { fields, warnings };
}

/** 解析 visibleAsNumber 的 min/max/step 简单对象参数。 */
function parseNumberDecoratorOptions(
  optionText: string,
  warnings: string[],
  sourceFile: string,
  key: string
): { min?: number; max?: number; step?: number } {
  const result: { min?: number; max?: number; step?: number } = {};
  if (!optionText.trim()) {
    return result;
  }

  for (const optionName of ["min", "max", "step"] as const) {
    const optionMatch = optionText.match(new RegExp(`${optionName}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
    if (optionMatch) {
      result[optionName] = Number(optionMatch[1]);
    }
  }

  if (!Number.isFinite(result.min ?? 0) || !Number.isFinite(result.max ?? 0) || !Number.isFinite(result.step ?? 0)) {
    warnings.push(`${sourceFile} 中 ${key} 的数字装饰器约束解析失败，已忽略非法约束。`);
  }

  return result;
}
