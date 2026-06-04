const MAX_DXF_SEGMENTS = 180000;
const ARC_MIN_SEGMENTS = 12;
const ARC_MAX_SEGMENTS = 96;
const DEFAULT_LAYER_NAME = "0";
const CAD_MILLIMETER_MIN_MAX_DIMENSION = 3000;

/** CAD 图纸中的二维点，解析结果会统一换算成米。 */
export interface CadDxfPoint {
  x: number;
  y: number;
}

/** CAD 图纸中的一条矢量折线，可来自 LINE、POLYLINE、CIRCLE 或 ARC。 */
export interface CadDxfPolyline {
  layer: string;
  points: CadDxfPoint[];
}

/** CAD 图纸解析后的边界数据，单位为米。 */
export interface CadDxfBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** CAD 图纸源单位识别结果，用于解释 DXF 原始坐标如何换算到米制场景。 */
export interface CadDxfUnitInfo {
  sourceUnit: string;
  unitScaleToMeters: number;
  inferenceMethod: "dxfHeader" | "boundsHeuristic" | "legacyDefault";
  confidence: "high" | "medium" | "low";
  insunitsCode?: number;
  measurementCode?: number;
  rawMaxDimension: number;
  normalizedMaxDimension: number;
}

/** CAD 图纸解析结果，供 Babylon 引擎创建贴地矢量线。 */
export interface CadDxfParseResult {
  name: string;
  polylines: CadDxfPolyline[];
  bounds: CadDxfBounds;
  rawBounds: CadDxfBounds;
  unit: CadDxfUnitInfo;
  layers: string[];
  entityCount: number;
  segmentCount: number;
  warnings: string[];
}

interface DxfGroup {
  code: number;
  value: string;
}

interface LineEntity {
  layer: string;
  start?: CadDxfPoint;
  end?: CadDxfPoint;
}

interface ArcEntity {
  layer: string;
  center?: CadDxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

interface LightweightPolylineEntity {
  layer: string;
  closed: boolean;
  vertices: CadDxfPoint[];
}

interface LegacyPolylineEntity {
  layer: string;
  closed: boolean;
  vertices: CadDxfPoint[];
}

interface DxfSectionRange {
  name: string;
  startIndex: number;
  endIndex: number;
}

interface CadBlockDefinition {
  name: string;
  basePoint: CadDxfPoint;
  polylines: CadDxfPolyline[];
}

interface InsertEntity {
  layer: string;
  blockName?: string;
  position: CadDxfPoint;
  xScale: number;
  yScale: number;
  rotationDegrees: number;
  columnCount: number;
  rowCount: number;
  columnSpacing: number;
  rowSpacing: number;
}

interface CadUnitDefinition {
  sourceUnit: string;
  unitScaleToMeters: number;
}

/** 解析 DXF 文本为二维 CAD 矢量线，并统一换算到项目米制单位。 */
export function parseCadDxf(fileName: string, text: string): CadDxfParseResult {
  const state = createParseState(fileName);
  const groups = readDxfGroups(text);
  const sections = findDxfSections(groups);
  const blocks = collectBlockDefinitions(groups, sections);
  const entitySections = sections.filter((section) => section.name === "ENTITIES");
  if (sections.length === 0) {
    parseDxfEntitiesInRange(groups, 0, groups.length, state, blocks);
  } else {
    entitySections.forEach((section) => parseDxfEntitiesInRange(groups, section.startIndex, section.endIndex, state, blocks));
  }

  if (state.polylines.length === 0) {
    throw new Error("没有解析到可绘制的 CAD 矢量线，请确认图纸为包含 LINE、LWPOLYLINE、POLYLINE、CIRCLE 或 ARC 的 DXF 文件。");
  }

  const rawBounds = createBounds(state.bounds);
  const unit = resolveCadDxfUnit(groups, sections, rawBounds);
  unit.warnings.forEach((warning) => state.warnings.add(warning));

  return {
    name: normalizeCadName(fileName.replace(/\.[^.]+$/, ""), "CAD 图纸", 120),
    polylines: scaleCadPolylines(state.polylines, unit.info.unitScaleToMeters),
    bounds: scaleCadBounds(rawBounds, unit.info.unitScaleToMeters),
    rawBounds,
    unit: unit.info,
    layers: [...state.layers].sort((left, right) => left.localeCompare(right)),
    entityCount: state.entityCount,
    segmentCount: state.segmentCount,
    warnings: [...state.warnings]
  };
}

interface ParseState {
  fileName: string;
  polylines: CadDxfPolyline[];
  layers: Set<string>;
  warnings: Set<string>;
  bounds: MutableBounds;
  entityCount: number;
  segmentCount: number;
  truncated: boolean;
}

interface MutableBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 创建解析状态，集中记录边界、图层、告警和截断信息。 */
function createParseState(fileName: string): ParseState {
  return {
    fileName,
    polylines: [],
    layers: new Set<string>(),
    warnings: new Set<string>(),
    bounds: {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    },
    entityCount: 0,
    segmentCount: 0,
    truncated: false
  };
}

/** 将 DXF 的 code/value 成对文本读取为结构化组。 */
function readDxfGroups(text: string): DxfGroup[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const groups: DxfGroup[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (!Number.isFinite(code)) {
      continue;
    }

    groups.push({ code, value: lines[index + 1].trim() });
  }

  return groups;
}

/** 定位 DXF SECTION 范围，使 BLOCKS 与 ENTITIES 能按真实语义分开处理。 */
function findDxfSections(groups: DxfGroup[]): DxfSectionRange[] {
  const sections: DxfSectionRange[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.code !== 0 || group.value.toUpperCase() !== "SECTION") {
      continue;
    }

    const nameGroup = groups[index + 1];
    if (!nameGroup || nameGroup.code !== 2) {
      continue;
    }

    const sectionName = nameGroup.value.toUpperCase();
    const startIndex = index + 2;
    let endIndex = groups.length;
    for (let cursor = startIndex; cursor < groups.length; cursor += 1) {
      if (groups[cursor].code === 0 && groups[cursor].value.toUpperCase() === "ENDSEC") {
        endIndex = cursor;
        index = cursor;
        break;
      }
    }

    sections.push({ name: sectionName, startIndex, endIndex });
  }

  return sections;
}

/** 解析 DXF HEADER 中的单位信息，并在缺失单位时按图纸原始尺寸保守推断。 */
function resolveCadDxfUnit(
  groups: DxfGroup[],
  sections: DxfSectionRange[],
  rawBounds: CadDxfBounds
): { info: CadDxfUnitInfo; warnings: string[] } {
  const rawMaxDimension = Math.max(rawBounds.width, rawBounds.height);
  const insunitsCode = readDxfHeaderInteger(groups, sections, "$INSUNITS");
  const measurementCode = readDxfHeaderInteger(groups, sections, "$MEASUREMENT");
  const explicitUnit = insunitsCode === undefined || insunitsCode === 0 ? null : getCadUnitDefinition(insunitsCode);
  if (explicitUnit) {
    return {
      info: createCadDxfUnitInfo({
        ...explicitUnit,
        inferenceMethod: "dxfHeader",
        confidence: "high",
        insunitsCode,
        measurementCode,
        rawMaxDimension
      }),
      warnings: []
    };
  }

  const inferredUnit = inferCadUnitFromRawBounds(rawMaxDimension);
  const warnings: string[] = [];
  if (insunitsCode !== undefined && insunitsCode !== 0 && !explicitUnit) {
    warnings.push(`DXF $INSUNITS=${insunitsCode} 暂未识别，已按图纸原始尺寸推断单位。`);
  }

  if (inferredUnit.unitScaleToMeters !== 1) {
    warnings.push(`DXF 未声明有效 $INSUNITS，已根据原始尺寸推断为 ${getCadUnitDisplayName(inferredUnit.sourceUnit)} 并换算到米。`);
  }

  return {
    info: createCadDxfUnitInfo({
      ...inferredUnit,
      measurementCode,
      rawMaxDimension
    }),
    warnings
  };
}

/** 从 HEADER 段读取整数型变量，例如 $INSUNITS 和 $MEASUREMENT。 */
function readDxfHeaderInteger(groups: DxfGroup[], sections: DxfSectionRange[], variableName: string): number | undefined {
  const normalizedVariableName = variableName.toUpperCase();
  const headerSections = sections.filter((section) => section.name === "HEADER");
  for (const section of headerSections) {
    for (let index = section.startIndex; index < section.endIndex; index += 1) {
      const group = groups[index];
      if (group.code !== 9 || group.value.toUpperCase() !== normalizedVariableName) {
        continue;
      }

      for (let valueIndex = index + 1; valueIndex < section.endIndex; valueIndex += 1) {
        const valueGroup = groups[valueIndex];
        if (valueGroup.code === 9) {
          break;
        }

        if (valueGroup.code === 70) {
          const parsed = Number.parseInt(valueGroup.value, 10);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
      }
    }
  }

  return undefined;
}

/** 根据 AutoCAD DXF $INSUNITS 代码返回到米的换算比例。 */
function getCadUnitDefinition(insunitsCode: number): CadUnitDefinition | null {
  const surveyFootToMeters = 1200 / 3937;
  const definitions: Record<number, CadUnitDefinition> = {
    1: { sourceUnit: "inch", unitScaleToMeters: 0.0254 },
    2: { sourceUnit: "foot", unitScaleToMeters: 0.3048 },
    3: { sourceUnit: "mile", unitScaleToMeters: 1609.344 },
    4: { sourceUnit: "millimeter", unitScaleToMeters: 0.001 },
    5: { sourceUnit: "centimeter", unitScaleToMeters: 0.01 },
    6: { sourceUnit: "meter", unitScaleToMeters: 1 },
    7: { sourceUnit: "kilometer", unitScaleToMeters: 1000 },
    8: { sourceUnit: "microinch", unitScaleToMeters: 0.0000000254 },
    9: { sourceUnit: "mil", unitScaleToMeters: 0.0000254 },
    10: { sourceUnit: "yard", unitScaleToMeters: 0.9144 },
    11: { sourceUnit: "angstrom", unitScaleToMeters: 1e-10 },
    12: { sourceUnit: "nanometer", unitScaleToMeters: 1e-9 },
    13: { sourceUnit: "micron", unitScaleToMeters: 1e-6 },
    14: { sourceUnit: "decimeter", unitScaleToMeters: 0.1 },
    15: { sourceUnit: "dekameter", unitScaleToMeters: 10 },
    16: { sourceUnit: "hectometer", unitScaleToMeters: 100 },
    17: { sourceUnit: "gigameter", unitScaleToMeters: 1e9 },
    18: { sourceUnit: "astronomicalUnit", unitScaleToMeters: 149597870700 },
    19: { sourceUnit: "lightYear", unitScaleToMeters: 9460730472580800 },
    20: { sourceUnit: "parsec", unitScaleToMeters: 3.085677581491367e16 },
    21: { sourceUnit: "usSurveyFoot", unitScaleToMeters: surveyFootToMeters },
    22: { sourceUnit: "usSurveyInch", unitScaleToMeters: surveyFootToMeters / 12 },
    23: { sourceUnit: "usSurveyYard", unitScaleToMeters: surveyFootToMeters * 3 },
    24: { sourceUnit: "usSurveyMile", unitScaleToMeters: surveyFootToMeters * 5280 }
  };
  return definitions[insunitsCode] ?? null;
}

/** 无单位 DXF 只在原始尺寸明显过大时推断为毫米，避免误把真实米制项目缩小。 */
function inferCadUnitFromRawBounds(rawMaxDimension: number): Omit<CadDxfUnitInfo, "rawMaxDimension" | "normalizedMaxDimension"> {
  if (rawMaxDimension >= CAD_MILLIMETER_MIN_MAX_DIMENSION) {
    return {
      sourceUnit: "millimeter",
      unitScaleToMeters: 0.001,
      inferenceMethod: "boundsHeuristic",
      confidence: "medium"
    };
  }

  return {
    sourceUnit: "meter",
    unitScaleToMeters: 1,
    inferenceMethod: "legacyDefault",
    confidence: "low"
  };
}

/** 创建可写入 metadata 的 CAD 单位信息，并补齐换算后的最大尺寸。 */
function createCadDxfUnitInfo(
  options: Omit<CadDxfUnitInfo, "normalizedMaxDimension">
): CadDxfUnitInfo {
  return {
    ...options,
    normalizedMaxDimension: options.rawMaxDimension * options.unitScaleToMeters
  };
}

/** 把 DXF 原始折线坐标统一换算到米。 */
function scaleCadPolylines(polylines: CadDxfPolyline[], unitScaleToMeters: number): CadDxfPolyline[] {
  if (unitScaleToMeters === 1) {
    return polylines;
  }

  return polylines.map((polyline) => ({
    ...polyline,
    points: polyline.points.map((point) => ({ x: point.x * unitScaleToMeters, y: point.y * unitScaleToMeters }))
  }));
}

/** 把 DXF 原始边界统一换算到米，供 Babylon 网格和相机按项目尺寸处理。 */
function scaleCadBounds(bounds: CadDxfBounds, unitScaleToMeters: number): CadDxfBounds {
  if (unitScaleToMeters === 1) {
    return bounds;
  }

  return createBounds({
    minX: bounds.minX * unitScaleToMeters,
    minY: bounds.minY * unitScaleToMeters,
    maxX: bounds.maxX * unitScaleToMeters,
    maxY: bounds.maxY * unitScaleToMeters
  });
}

/** 返回用户可读的 CAD 源单位名称，主要用于低置信度推断提示。 */
function getCadUnitDisplayName(sourceUnit: string): string {
  if (sourceUnit === "millimeter") {
    return "毫米";
  }

  if (sourceUnit === "centimeter") {
    return "厘米";
  }

  if (sourceUnit === "meter") {
    return "米";
  }

  return sourceUnit;
}

/** 收集 BLOCKS 段中的块定义，后续由 INSERT 按位置、旋转和缩放展开。 */
function collectBlockDefinitions(groups: DxfGroup[], sections: DxfSectionRange[]): Map<string, CadBlockDefinition> {
  const blocks = new Map<string, CadBlockDefinition>();
  sections
    .filter((section) => section.name === "BLOCKS")
    .forEach((section) => {
      for (let index = section.startIndex; index < section.endIndex; index += 1) {
        const group = groups[index];
        if (group.code !== 0 || group.value.toUpperCase() !== "BLOCK") {
          continue;
        }

        const block = readBlockDefinition(groups, index + 1, section.endIndex);
        if (block.definition.name) {
          blocks.set(block.definition.name, block.definition);
        }
        index = block.endIndex;
      }
    });

  return blocks;
}

/** 读取单个 BLOCK 定义，块内实体保持局部坐标，等待 INSERT 时再变换。 */
function readBlockDefinition(groups: DxfGroup[], startIndex: number, sectionEndIndex: number): { definition: CadBlockDefinition; endIndex: number } {
  const blockState = createParseState("block");
  const definition: CadBlockDefinition = {
    name: "",
    basePoint: { x: 0, y: 0 },
    polylines: blockState.polylines
  };

  let index = startIndex;
  for (; index < sectionEndIndex; index += 1) {
    const group = groups[index];
    if (group.code === 0 && group.value.toUpperCase() === "ENDBLK") {
      break;
    }

    if (group.code === 2 && !definition.name) {
      definition.name = normalizeCadName(group.value, "", 120);
      continue;
    }

    if (group.code === 10 && blockState.entityCount === 0) {
      definition.basePoint.x = readNumber(group.value, 0);
      continue;
    }

    if (group.code === 20 && blockState.entityCount === 0) {
      definition.basePoint.y = readNumber(group.value, 0);
      continue;
    }

    if (group.code === 0) {
      index = parseSingleDxfEntity(groups, index, blockState, new Map());
    }
  }

  return { definition, endIndex: index };
}

/** 解析指定范围内的模型空间实体，避免把块定义误当成顶层图纸。 */
function parseDxfEntitiesInRange(
  groups: DxfGroup[],
  startIndex: number,
  endIndex: number,
  state: ParseState,
  blocks: Map<string, CadBlockDefinition>
): void {
  for (let index = startIndex; index < endIndex; index += 1) {
    const group = groups[index];
    if (group.code !== 0) {
      continue;
    }

    index = parseSingleDxfEntity(groups, index, state, blocks);
  }
}

/** 分发解析单个 DXF 实体，支持普通图元和 INSERT 块实例。 */
function parseSingleDxfEntity(
  groups: DxfGroup[],
  entityTypeIndex: number,
  state: ParseState,
  blocks: Map<string, CadBlockDefinition>
): number {
  const type = groups[entityTypeIndex].value.toUpperCase();
  if (type === "LINE") {
    return readLineEntity(groups, entityTypeIndex + 1, state);
  }

  if (type === "LWPOLYLINE") {
    return readLightweightPolylineEntity(groups, entityTypeIndex + 1, state);
  }

  if (type === "POLYLINE") {
    return readLegacyPolylineEntity(groups, entityTypeIndex + 1, state);
  }

  if (type === "CIRCLE") {
    return readCircleEntity(groups, entityTypeIndex + 1, state);
  }

  if (type === "ARC") {
    return readArcEntity(groups, entityTypeIndex + 1, state);
  }

  if (type === "INSERT") {
    return readInsertEntity(groups, entityTypeIndex + 1, state, blocks);
  }

  if (isDrawableEntity(type)) {
    state.warnings.add(`暂未支持 ${type} 实体，已跳过。`);
    state.entityCount += 1;
  }

  return walkEntityGroups(groups, entityTypeIndex + 1, () => undefined);
}

/** 读取 LINE 实体并加入线段集合。 */
function readLineEntity(groups: DxfGroup[], startIndex: number, state: ParseState): number {
  const entity: LineEntity = { layer: DEFAULT_LAYER_NAME };
  const endIndex = walkEntityGroups(groups, startIndex, (group) => {
    applyLayerGroup(group, entity);
    if (group.code === 10) {
      entity.start = { x: readNumber(group.value, 0), y: entity.start?.y ?? 0 };
    } else if (group.code === 20) {
      entity.start = { x: entity.start?.x ?? 0, y: readNumber(group.value, 0) };
    } else if (group.code === 11) {
      entity.end = { x: readNumber(group.value, 0), y: entity.end?.y ?? 0 };
    } else if (group.code === 21) {
      entity.end = { x: entity.end?.x ?? 0, y: readNumber(group.value, 0) };
    }
  });

  if (entity.start && entity.end) {
    pushPolyline(state, entity.layer, [entity.start, entity.end]);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 LWPOLYLINE 实体并加入折线集合。 */
function readLightweightPolylineEntity(groups: DxfGroup[], startIndex: number, state: ParseState): number {
  const entity: LightweightPolylineEntity = {
    layer: DEFAULT_LAYER_NAME,
    closed: false,
    vertices: []
  };
  const pendingPoint: { current: Partial<CadDxfPoint> | null } = { current: null };
  const endIndex = walkEntityGroups(groups, startIndex, (group) => {
    applyLayerGroup(group, entity);
    if (group.code === 70) {
      entity.closed = (readNumber(group.value, 0) & 1) === 1;
      return;
    }

    if (group.code === 10) {
      if (pendingPoint.current?.x !== undefined && pendingPoint.current.y !== undefined) {
        entity.vertices.push({ x: pendingPoint.current.x, y: pendingPoint.current.y });
      }
      pendingPoint.current = { x: readNumber(group.value, 0) };
      return;
    }

    if (group.code === 20 && pendingPoint.current) {
      pendingPoint.current.y = readNumber(group.value, 0);
    }
  });

  if (pendingPoint.current?.x !== undefined && pendingPoint.current.y !== undefined) {
    entity.vertices.push({ x: pendingPoint.current.x, y: pendingPoint.current.y });
  }
  pushPolyline(state, entity.layer, closePoints(entity.vertices, entity.closed));
  state.entityCount += 1;
  return endIndex;
}

/** 读取旧版 POLYLINE/VERTEX/SEQEND 实体并加入折线集合。 */
function readLegacyPolylineEntity(groups: DxfGroup[], startIndex: number, state: ParseState): number {
  const entity: LegacyPolylineEntity = {
    layer: DEFAULT_LAYER_NAME,
    closed: false,
    vertices: []
  };
  let index = startIndex;
  for (; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.code !== 0) {
      applyLayerGroup(group, entity);
      if (group.code === 70) {
        entity.closed = (readNumber(group.value, 0) & 1) === 1;
      }
      continue;
    }

    const type = group.value.toUpperCase();
    if (type === "VERTEX") {
      const vertex = readVertexEntity(groups, index + 1);
      if (vertex.point) {
        entity.vertices.push(vertex.point);
      }
      index = vertex.endIndex;
      continue;
    }

    if (type === "SEQEND") {
      break;
    }

    index -= 1;
    break;
  }

  pushPolyline(state, entity.layer, closePoints(entity.vertices, entity.closed));
  state.entityCount += 1;
  return index;
}

/** 读取 POLYLINE 下的单个 VERTEX 点。 */
function readVertexEntity(groups: DxfGroup[], startIndex: number): { point: CadDxfPoint | null; endIndex: number } {
  const point: Partial<CadDxfPoint> = {};
  const endIndex = walkEntityGroups(groups, startIndex, (group) => {
    if (group.code === 10) {
      point.x = readNumber(group.value, 0);
    } else if (group.code === 20) {
      point.y = readNumber(group.value, 0);
    }
  });

  return {
    point: point.x !== undefined && point.y !== undefined ? { x: point.x, y: point.y } : null,
    endIndex
  };
}

/** 读取 CIRCLE 实体，并采样成闭合矢量折线。 */
function readCircleEntity(groups: DxfGroup[], startIndex: number, state: ParseState): number {
  const entity: ArcEntity = { layer: DEFAULT_LAYER_NAME, startAngle: 0, endAngle: 360 };
  const endIndex = readArcLikeEntity(groups, startIndex, entity);
  pushPolyline(state, entity.layer, sampleArcPoints(entity, true));
  state.entityCount += 1;
  return endIndex;
}

/** 读取 ARC 实体，并按角度范围采样成矢量折线。 */
function readArcEntity(groups: DxfGroup[], startIndex: number, state: ParseState): number {
  const entity: ArcEntity = { layer: DEFAULT_LAYER_NAME };
  const endIndex = readArcLikeEntity(groups, startIndex, entity);
  pushPolyline(state, entity.layer, sampleArcPoints(entity, false));
  state.entityCount += 1;
  return endIndex;
}

/** 读取 INSERT 实体，并把对应 BLOCK 按实例变换展开到模型空间。 */
function readInsertEntity(groups: DxfGroup[], startIndex: number, state: ParseState, blocks: Map<string, CadBlockDefinition>): number {
  const entity: InsertEntity = {
    layer: DEFAULT_LAYER_NAME,
    position: { x: 0, y: 0 },
    xScale: 1,
    yScale: 1,
    rotationDegrees: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0
  };
  const endIndex = walkEntityGroups(groups, startIndex, (group) => {
    applyLayerGroup(group, entity);
    if (group.code === 2) {
      entity.blockName = normalizeCadName(group.value, "", 120);
    } else if (group.code === 10) {
      entity.position.x = readNumber(group.value, 0);
    } else if (group.code === 20) {
      entity.position.y = readNumber(group.value, 0);
    } else if (group.code === 41) {
      entity.xScale = readNumber(group.value, 1);
    } else if (group.code === 42) {
      entity.yScale = readNumber(group.value, 1);
    } else if (group.code === 50) {
      entity.rotationDegrees = readNumber(group.value, 0);
    } else if (group.code === 70) {
      entity.columnCount = Math.max(1, Math.floor(readNumber(group.value, 1)));
    } else if (group.code === 71) {
      entity.rowCount = Math.max(1, Math.floor(readNumber(group.value, 1)));
    } else if (group.code === 44) {
      entity.columnSpacing = readNumber(group.value, 0);
    } else if (group.code === 45) {
      entity.rowSpacing = readNumber(group.value, 0);
    }
  });

  const block = entity.blockName ? blocks.get(entity.blockName) : undefined;
  if (!block) {
    state.warnings.add(`找不到 INSERT 引用的块 ${entity.blockName ?? "(未命名)"}，已跳过。`);
    state.entityCount += 1;
    return endIndex;
  }

  expandInsertEntity(state, entity, block);
  state.entityCount += 1;
  return endIndex;
}

/** 将 INSERT 的行列阵列和旋转缩放应用到块内折线。 */
function expandInsertEntity(state: ParseState, entity: InsertEntity, block: CadBlockDefinition): void {
  for (let rowIndex = 0; rowIndex < entity.rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < entity.columnCount; columnIndex += 1) {
      block.polylines.forEach((polyline) => {
        const layer = polyline.layer === DEFAULT_LAYER_NAME ? entity.layer : polyline.layer;
        const points = polyline.points.map((point) => transformInsertPoint(point, block.basePoint, entity, columnIndex, rowIndex));
        pushPolyline(state, layer, points);
      });
    }
  }
}

/** 将块内局部点变换到 INSERT 实例所在的模型空间坐标。 */
function transformInsertPoint(
  point: CadDxfPoint,
  basePoint: CadDxfPoint,
  entity: InsertEntity,
  columnIndex: number,
  rowIndex: number
): CadDxfPoint {
  const localX = (point.x - basePoint.x + columnIndex * entity.columnSpacing) * entity.xScale;
  const localY = (point.y - basePoint.y + rowIndex * entity.rowSpacing) * entity.yScale;
  const rotation = (entity.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: entity.position.x + localX * cos - localY * sin,
    y: entity.position.y + localX * sin + localY * cos
  };
}

/** 读取圆和圆弧共同使用的中心、半径和角度字段。 */
function readArcLikeEntity(groups: DxfGroup[], startIndex: number, entity: ArcEntity): number {
  return walkEntityGroups(groups, startIndex, (group) => {
    applyLayerGroup(group, entity);
    if (group.code === 10) {
      entity.center = { x: readNumber(group.value, 0), y: entity.center?.y ?? 0 };
    } else if (group.code === 20) {
      entity.center = { x: entity.center?.x ?? 0, y: readNumber(group.value, 0) };
    } else if (group.code === 40) {
      entity.radius = Math.max(0, readNumber(group.value, 0));
    } else if (group.code === 50) {
      entity.startAngle = readNumber(group.value, 0);
    } else if (group.code === 51) {
      entity.endAngle = readNumber(group.value, 0);
    }
  });
}

/** 遍历单个 DXF 实体的组，遇到下一条实体时返回上一组索引。 */
function walkEntityGroups(groups: DxfGroup[], startIndex: number, visit: (group: DxfGroup) => void): number {
  let index = startIndex;
  for (; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.code === 0) {
      return index - 1;
    }

    visit(group);
  }

  return index;
}

/** 把 DXF 图层字段写入当前实体。 */
function applyLayerGroup(group: DxfGroup, entity: { layer: string }): void {
  if (group.code === 8 && group.value) {
    entity.layer = normalizeCadName(group.value, DEFAULT_LAYER_NAME, 80);
  }
}

/** 按圆弧参数生成采样点，仍保持米制坐标。 */
function sampleArcPoints(entity: ArcEntity, closed: boolean): CadDxfPoint[] {
  if (!entity.center || !entity.radius) {
    return [];
  }

  const startAngle = entity.startAngle ?? 0;
  let endAngle = entity.endAngle ?? 360;
  if (!closed && endAngle < startAngle) {
    endAngle += 360;
  }
  const sweep = closed ? 360 : Math.max(0, endAngle - startAngle);
  const segmentCount = Math.min(ARC_MAX_SEGMENTS, Math.max(ARC_MIN_SEGMENTS, Math.ceil(sweep / 8)));
  const points: CadDxfPoint[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = ((startAngle + (sweep * index) / segmentCount) * Math.PI) / 180;
    points.push({
      x: entity.center.x + Math.cos(angle) * entity.radius,
      y: entity.center.y + Math.sin(angle) * entity.radius
    });
  }

  return closed ? closePoints(points, true) : points;
}

/** 必要时闭合折线，并避免重复闭合点导致零长度线段。 */
function closePoints(points: CadDxfPoint[], closed: boolean): CadDxfPoint[] {
  if (!closed || points.length < 2) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) {
    return points;
  }

  return [...points, { ...first }];
}

/** 写入解析出的折线，并按最大线段数做保护，避免超大图纸耗尽内存。 */
function pushPolyline(state: ParseState, layer: string, points: CadDxfPoint[]): void {
  if (points.length < 2 || state.truncated) {
    return;
  }

  const sanitized = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const segmentCount = Math.max(0, sanitized.length - 1);
  if (segmentCount <= 0) {
    return;
  }

  if (state.segmentCount + segmentCount > MAX_DXF_SEGMENTS) {
    state.truncated = true;
    state.warnings.add(`图纸线段超过 ${MAX_DXF_SEGMENTS.toLocaleString()} 条，已截断以避免内存占用过高。`);
    return;
  }

  state.polylines.push({ layer, points: sanitized });
  state.layers.add(layer);
  state.segmentCount += segmentCount;
  sanitized.forEach((point) => extendBounds(state.bounds, point));
}

/** 扩展 CAD 图纸边界。 */
function extendBounds(bounds: MutableBounds, point: CadDxfPoint): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

/** 从累积边界创建不可变边界对象。 */
function createBounds(bounds: MutableBounds): CadDxfBounds {
  const minX = Number.isFinite(bounds.minX) ? bounds.minX : 0;
  const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
  const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX : minX;
  const maxY = Number.isFinite(bounds.maxY) ? bounds.maxY : minY;
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
    width,
    height
  };
}

/** 安全读取 DXF 数值字段，非法时使用回退值。 */
function readNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 判断实体是否属于常见可绘制 CAD 类型，用于给出明确跳过提示。 */
function isDrawableEntity(type: string): boolean {
  return ["ELLIPSE", "SPLINE", "TEXT", "MTEXT", "HATCH", "POINT", "SOLID", "TRACE", "3DFACE"].includes(type);
}

/** 清理来自 DXF 的名称字段，避免超长或控制字符污染节点名称。 */
function normalizeCadName(value: string, fallback: string, maxLength: number): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}
