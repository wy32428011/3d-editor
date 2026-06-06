import ts from "typescript";
import type {
  ModelDataDrivenAxis,
  ModelDataDrivenDefinition,
  ModelDataDrivenDeviceDefinition,
  ModelDataDrivenMotionGroupDefinition,
  ModelDataDrivenMotionKind,
  ModelDataDrivenSimulationDefinition
} from "../types/editor";

type LiteralValue = string | number | boolean | null | LiteralValue[] | { [key: string]: LiteralValue };

interface ParsedModelPackageDataDrivenResult {
  definition?: ModelDataDrivenDefinition;
  warnings: string[];
}

/** 静态解析模型包脚本导出的 dataDriven 定义，避免为读取配置执行模型脚本。 */
export function parseModelPackageDataDriven(scriptText: string, sourceFile: string): ParsedModelPackageDataDrivenResult {
  const warnings: string[] = [];
  if (!scriptText.trim()) {
    return { warnings };
  }

  const source = ts.createSourceFile(sourceFile || "model-package.ts", scriptText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const initializer = findExportedDataDrivenInitializer(source);
  if (!initializer) {
    return { warnings };
  }

  const literal = readLiteralExpression(unwrapLiteralExpression(initializer), warnings, sourceFile, "dataDriven");
  if (!isLiteralRecord(literal)) {
    warnings.push(`${sourceFile} 中 dataDriven 必须是普通对象字面量，已忽略。`);
    return { warnings };
  }

  const definition = normalizeDataDrivenDefinition(literal, warnings, sourceFile);
  return definition ? { definition, warnings } : { warnings };
}

/** 查找顶层 export const dataDriven = ... 的初始化表达式。 */
function findExportedDataDrivenInitializer(source: ts.SourceFile): ts.Expression | undefined {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "dataDriven") {
        return declaration.initializer;
      }
    }
  }

  return undefined;
}

/** 判断语句是否带 export 修饰符。 */
function hasExportModifier(node: ts.VariableStatement): boolean {
  return Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

/** 去掉 as const、类型断言和括号，只保留真正的字面量表达式。 */
function unwrapLiteralExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** 把受支持的 TypeScript 字面量表达式转换成 JSON-like 值。 */
function readLiteralExpression(
  expression: ts.Expression,
  warnings: string[],
  sourceFile: string,
  path: string
): LiteralValue | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    const value = Number(expression.operand.text);
    return expression.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    const items: LiteralValue[] = [];
    for (const [index, element] of expression.elements.entries()) {
      if (ts.isSpreadElement(element)) {
        warnings.push(`${sourceFile} 中 ${path}[${index}] 使用了展开语法，已忽略 dataDriven。`);
        return undefined;
      }
      const value = readLiteralExpression(unwrapLiteralExpression(element), warnings, sourceFile, `${path}[${index}]`);
      if (value === undefined) {
        return undefined;
      }
      items.push(value);
    }
    return items;
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const record: { [key: string]: LiteralValue } = {};
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        warnings.push(`${sourceFile} 中 ${path} 只支持普通 key: value 属性，已忽略 dataDriven。`);
        return undefined;
      }

      const key = readPropertyName(property.name);
      if (!key) {
        warnings.push(`${sourceFile} 中 ${path} 包含不支持的属性名，已忽略 dataDriven。`);
        return undefined;
      }

      const value = readLiteralExpression(unwrapLiteralExpression(property.initializer), warnings, sourceFile, `${path}.${key}`);
      if (value === undefined) {
        return undefined;
      }
      record[key] = value;
    }
    return record;
  }

  warnings.push(`${sourceFile} 中 ${path} 使用了非字面量表达式，已忽略 dataDriven。`);
  return undefined;
}

/** 读取对象属性名，支持标识符和字符串键。 */
function readPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

/** 归一化 dataDriven 对象并过滤非法字段。 */
function normalizeDataDrivenDefinition(
  record: Record<string, LiteralValue>,
  warnings: string[],
  sourceFile: string
): ModelDataDrivenDefinition | undefined {
  const definition: ModelDataDrivenDefinition = {};
  const device = normalizeDeviceDefinition(asLiteralRecord(record.device));
  const motion = normalizeMotionDefinitions(asLiteralRecord(record.motion), warnings, sourceFile);
  const fixedNodes = readStringArray(record.fixedNodes);
  const simulation = normalizeSimulationDefinition(asLiteralRecord(record.simulation));

  if (device) {
    definition.device = device;
  }
  if (motion) {
    definition.motion = motion;
  }
  if (fixedNodes.length > 0) {
    definition.fixedNodes = fixedNodes;
  }
  if (simulation) {
    definition.simulation = simulation;
  }

  if (!definition.device && !definition.motion && !definition.fixedNodes && !definition.simulation) {
    warnings.push(`${sourceFile} 中 dataDriven 没有可用字段，已忽略。`);
    return undefined;
  }

  return definition;
}

/** 归一化设备默认绑定字段。 */
function normalizeDeviceDefinition(record: Record<string, LiteralValue> | undefined): ModelDataDrivenDeviceDefinition | undefined {
  if (!record) {
    return undefined;
  }

  const device: ModelDataDrivenDeviceDefinition = {};
  const devType = readString(record.devType);
  const defaultAssetCode = readString(record.defaultAssetCode);
  const deviceIdField = readString(record.deviceIdField);
  const assetCodeField = readString(record.assetCodeField);
  const interpolationMs = readNonNegativeNumber(record.interpolationMs);
  if (devType) {
    device.devType = devType;
  }
  if (defaultAssetCode) {
    device.defaultAssetCode = defaultAssetCode;
  }
  if (deviceIdField) {
    device.deviceIdField = deviceIdField;
  }
  if (assetCodeField) {
    device.assetCodeField = assetCodeField;
  }
  if (interpolationMs !== undefined) {
    device.interpolationMs = interpolationMs;
  }
  return Object.keys(device).length > 0 ? device : undefined;
}

/** 归一化运动组定义，非法运动组只降级为告警，不影响其他组。 */
function normalizeMotionDefinitions(
  record: Record<string, LiteralValue> | undefined,
  warnings: string[],
  sourceFile: string
): Record<string, ModelDataDrivenMotionGroupDefinition> | undefined {
  if (!record) {
    return undefined;
  }

  const groups: Record<string, ModelDataDrivenMotionGroupDefinition> = {};
  Object.entries(record).forEach(([groupName, value]) => {
    const groupRecord = asLiteralRecord(value);
    if (!groupRecord) {
      warnings.push(`${sourceFile} 中 dataDriven.motion.${groupName} 不是普通对象，已忽略该运动组。`);
      return;
    }

    const axis = readAxis(groupRecord.axis);
    const fields = readStringArray(groupRecord.fields);
    const nodes = readStringArray(groupRecord.nodes);
    if (!axis || fields.length === 0 || nodes.length === 0) {
      warnings.push(`${sourceFile} 中 dataDriven.motion.${groupName} 缺少有效 fields、axis 或 nodes，已忽略该运动组。`);
      return;
    }

    const group: ModelDataDrivenMotionGroupDefinition = { fields, axis, nodes };
    const kind = readMotionKind(groupRecord.kind);
    if (kind) {
      group.kind = kind;
    }
    const fallbackPattern = readString(groupRecord.fallbackPattern);
    if (fallbackPattern) {
      group.fallbackPattern = fallbackPattern;
    }
    groups[groupName] = group;
  });

  return Object.keys(groups).length > 0 ? groups : undefined;
}

/** 归一化本地模拟范围字段。 */
function normalizeSimulationDefinition(record: Record<string, LiteralValue> | undefined): ModelDataDrivenSimulationDefinition | undefined {
  if (!record) {
    return undefined;
  }

  const simulation: ModelDataDrivenSimulationDefinition = {};
  const intervalMs = readNonNegativeNumber(record.intervalMs);
  const travelRange = readNonNegativeNumber(record.travelRange);
  const liftBase = readNumber(record.liftBase);
  const liftRange = readNonNegativeNumber(record.liftRange);
  const forkRange = readNonNegativeNumber(record.forkRange);
  const forkSideRange = readNonNegativeNumber(record.forkSideRange);
  if (intervalMs !== undefined) {
    simulation.intervalMs = intervalMs;
  }
  if (travelRange !== undefined) {
    simulation.travelRange = travelRange;
  }
  if (liftBase !== undefined) {
    simulation.liftBase = liftBase;
  }
  if (liftRange !== undefined) {
    simulation.liftRange = liftRange;
  }
  if (forkRange !== undefined) {
    simulation.forkRange = forkRange;
  }
  if (forkSideRange !== undefined) {
    simulation.forkSideRange = forkSideRange;
  }
  return Object.keys(simulation).length > 0 ? simulation : undefined;
}

/** 读取字符串数组并去重，过滤空字符串和非字符串值。 */
function readStringArray(value: LiteralValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => readString(item)).filter((item): item is string => Boolean(item)))];
}

/** 读取运动轴向。 */
function readAxis(value: LiteralValue | undefined): ModelDataDrivenAxis | undefined {
  const axis = readString(value);
  return axis === "x" || axis === "y" || axis === "z" ? axis : undefined;
}

/** 读取运动类型，未声明时由运行时按 translate 兼容处理。 */
function readMotionKind(value: LiteralValue | undefined): ModelDataDrivenMotionKind | undefined {
  const kind = readString(value);
  return kind === "translate" || kind === "rotate" ? kind : undefined;
}

/** 读取非空字符串。 */
function readString(value: LiteralValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 读取有限数字。 */
function readNumber(value: LiteralValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** 读取非负有限数字。 */
function readNonNegativeNumber(value: LiteralValue | undefined): number | undefined {
  const numberValue = readNumber(value);
  return numberValue !== undefined && numberValue >= 0 ? numberValue : undefined;
}

/** 判断解析值是否是普通对象。 */
function isLiteralRecord(value: LiteralValue | undefined): value is Record<string, LiteralValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** 把解析值收敛为普通对象。 */
function asLiteralRecord(value: LiteralValue | undefined): Record<string, LiteralValue> | undefined {
  return isLiteralRecord(value) ? value : undefined;
}
