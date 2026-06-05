const ARC_MIN_SEGMENTS = 16;
const ARC_MAX_SEGMENTS = 720;
const DEFAULT_LAYER_NAME = "0";
const DEFAULT_CAD_COLOR = "#f2f2f2";
const CAD_MILLIMETER_MIN_MAX_DIMENSION = 3000;
const NON_BOUNDING_REFERENCE_LENGTH = 50;
const MODEL_SPACE_FALLBACK_SMALL_ENTITY_COUNT = 2048;
const CAD_POLYLINE_BATCH_SEGMENTS = 20000;
const CAD_BLOCK_CACHE_SEGMENT_LIMIT = 80000;
const CAD_BLOCK_CACHE_TOTAL_SEGMENT_LIMIT = 300000;
const CAD_BLOCK_EXPANSION_MAX_DEPTH = 512;
const CAD_STREAM_CHUNK_SEGMENTS = 32000;
const CAD_BLOCK_TEMPLATE_CHUNK_SEGMENTS = 20000;

/** CAD 图纸中的二维点，解析结果会统一换算成米。 */
export interface CadDxfPoint {
  x: number;
  y: number;
  z?: number;
}

/** CAD 图元通用样式，保留 DXF 原始颜色和线型信息便于渲染侧还原外观。 */
export interface CadDxfStyle {
  colorIndex?: number;
  trueColor?: string;
  colorSource: "entityTrueColor" | "entityAci" | "layer" | "block" | "default";
  lineWeight?: number;
  lineType?: string;
  transparency?: number;
}

/** CAD 图纸中的一条矢量折线，可来自 LINE、POLYLINE、曲线采样或块展开线。 */
export interface CadDxfPolyline {
  type: "polyline";
  entityType: string;
  layer: string;
  color: string;
  alpha: number;
  style: CadDxfStyle;
  points: CadDxfPoint[];
  closed?: boolean;
  affectsBounds?: boolean;
  disjoint?: boolean;
}

/** CAD 图纸中的二维填充面，rings[0] 为外轮廓，其余 rings 为洞或附加边界。 */
export interface CadDxfFill {
  type: "fill";
  entityType: string;
  layer: string;
  color: string;
  alpha: number;
  style: CadDxfStyle;
  rings: CadDxfPoint[][];
  solid: boolean;
}

/** CAD 图纸中的文字图元，渲染侧会贴到 XZ 网格上。 */
export interface CadDxfText {
  type: "text";
  entityType: string;
  layer: string;
  color: string;
  alpha: number;
  style: CadDxfStyle;
  text: string;
  position: CadDxfPoint;
  height: number;
  rotationDegrees: number;
  widthFactor: number;
  align?: "left" | "center" | "right";
  width?: number;
}

/** CAD 图纸中的点图元，渲染侧会用小十字矢量标记显示。 */
export interface CadDxfPointPrimitive {
  type: "point";
  entityType: string;
  layer: string;
  color: string;
  alpha: number;
  style: CadDxfStyle;
  point: CadDxfPoint;
  size: number;
}

/** CAD 图纸中的栅格图片参照，DXF IMAGE 通过 IMAGEDEF 指向外部图片文件。 */
export interface CadDxfImagePrimitive {
  type: "image";
  entityType: "IMAGE";
  layer: string;
  color: string;
  alpha: number;
  style: CadDxfStyle;
  imageDefHandle?: string;
  sourcePath?: string;
  pixelWidth: number;
  pixelHeight: number;
  corners: CadDxfPoint[];
}

/** CAD 图纸中的 WIPEOUT 遮罩面，用背景色覆盖局部线段以还原原图遮挡关系。 */
export interface CadDxfWipeoutPrimitive {
  type: "wipeout";
  entityType: "WIPEOUT";
  layer: string;
  color: string;
  alpha: number;
  style: CadDxfStyle;
  ring: CadDxfPoint[];
}

/** CAD 解析后可绘制的二维图元联合类型。 */
export type CadDxfPrimitive =
  | CadDxfPolyline
  | CadDxfFill
  | CadDxfText
  | CadDxfPointPrimitive
  | CadDxfImagePrimitive
  | CadDxfWipeoutPrimitive;

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

/** CAD 图纸解析结果，供 Babylon 引擎创建贴地二维矢量图元。 */
export interface CadDxfParseResult {
  name: string;
  primitives: CadDxfPrimitive[];
  polylines: CadDxfPolyline[];
  bounds: CadDxfBounds;
  rawBounds: CadDxfBounds;
  unit: CadDxfUnitInfo;
  layers: string[];
  entityCount: number;
  segmentCount: number;
  primitiveCounts: Record<CadDxfPrimitive["type"], number>;
  warnings: string[];
}

/** CAD 二进制线段 chunk 的显示样式，主线程按该样式创建 LinesMesh。 */
export interface CadDxfLineChunkStyle {
  layer: string;
  color: string;
  alpha: number;
  entityType: string;
  style: CadDxfStyle;
}

/** CAD 流式导入输出的单个线段 chunk，positions 已经是 Babylon 本地 X/Z 坐标。 */
export interface CadDxfLineChunk {
  chunkId: string;
  style: CadDxfLineChunkStyle;
  segmentCount: number;
  positions: Float32Array;
  bounds: CadDxfBounds;
}

/** CAD 流式导入摘要，不携带大型 primitive 数组。 */
export interface CadLineImportSummary {
  name: string;
  bounds: CadDxfBounds;
  rawBounds: CadDxfBounds;
  unit: CadDxfUnitInfo;
  layers: string[];
  entityCount: number;
  segmentCount: number;
  primitiveCounts: Record<CadDxfPrimitive["type"], number>;
  warnings: string[];
  chunkCount: number;
}

/** CAD 流式导入 sink，解析器通过它把二进制线段块推给 Worker 或调用方。 */
export interface CadDxfLineSink {
  emitChunk: (chunk: CadDxfLineChunk) => void;
  reportProgress?: (progress: CadDxfLineProgress) => void;
}

/** CAD 导入阶段，供 UI 用稳定枚举展示当前进度。 */
export type CadDxfLineProgressPhase = "reading" | "measuring" | "emitting" | "rendering" | "persisting" | "restoring" | "done";

/** CAD 解析进度，供 UI 展示后台导入状态。 */
export interface CadDxfLineProgress {
  phase: CadDxfLineProgressPhase;
  parsedEntities: number;
  emittedSegments: number;
  totalEntities?: number;
  totalSegments?: number;
  chunkCount?: number;
  persistedChunks?: number;
  restoredChunks?: number;
  renderedChunks?: number;
  skippedChunks?: number;
  loadedBytes?: number;
  totalBytes?: number;
  currentBlock?: string;
  message?: string;
}

interface DxfGroup {
  code: number;
  value: string;
}

interface DxfSectionRange {
  name: string;
  startIndex: number;
  endIndex: number;
}

type CadEntitySpace = "model" | "paper" | "all";

interface DxfLayerInfo {
  name: string;
  colorIndex?: number;
  trueColor?: string;
  frozenOrOff: boolean;
}

interface CadUnitDefinition {
  sourceUnit: string;
  unitScaleToMeters: number;
}

interface MutableBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ParseState {
  fileName: string;
  primitives: CadDxfPrimitive[];
  layers: Set<string>;
  warnings: Set<string>;
  bounds: MutableBounds;
  entityCount: number;
  segmentCount: number;
  primitiveCounts: Record<CadDxfPrimitive["type"], number>;
  options: ParseStateOptions;
  bounds3d: MutableBounds3d;
}

interface ParseStateOptions {
  storePrimitives: boolean;
  projectionPlane?: CadProjectionPlane;
  unitScaleToMeters: number;
  lineOutput?: CadLineOutputState;
  lineTemplateOutput?: CadLineTemplateOutputState;
  progress?: CadParseProgressState;
}

interface ParseContext {
  groups: DxfGroup[];
  sections: DxfSectionRange[];
  layers: Map<string, DxfLayerInfo>;
  blocks: Map<string, CadBlockDefinition>;
  imageDefinitions: Map<string, DxfImageDefinition>;
  blockCacheSegmentCount: number;
}

interface EntityBase {
  layer: string;
  style: RawCadStyle;
  elevation?: number;
  extrusion?: CadDxfPoint;
}

interface RawCadStyle {
  colorIndex?: number;
  trueColor?: string;
  transparency?: number;
  lineWeight?: number;
  lineType?: string;
}

interface CadBlockDefinition {
  name: string;
  basePoint: CadDxfPoint;
  startIndex: number;
  endIndex: number;
  primitives?: CadDxfPrimitive[];
  lineTemplates?: CadBlockLineTemplate[];
  resolving?: boolean;
}

interface DxfImageDefinition {
  handle: string;
  sourcePath?: string;
  pixelWidth?: number;
  pixelHeight?: number;
}

interface ImageEntity extends EntityBase {
  imageDefHandle?: string;
  insertion: CadDxfPoint;
  uVector: CadDxfPoint;
  vVector: CadDxfPoint;
  pixelWidth?: number;
  pixelHeight?: number;
  visible: boolean;
}

interface WipeoutEntity extends EntityBase {
  insertion: CadDxfPoint;
  uVector: CadDxfPoint;
  vVector: CadDxfPoint;
  pixelWidth?: number;
  pixelHeight?: number;
  visible: boolean;
  clipPoints: CadDxfPoint[];
}

interface InsertEntity extends EntityBase {
  blockName?: string;
  position: CadDxfPoint;
  xScale: number;
  yScale: number;
  zScale: number;
  rotationDegrees: number;
  columnCount: number;
  rowCount: number;
  columnSpacing: number;
  rowSpacing: number;
}

interface Transform2D {
  position: CadDxfPoint;
  basePoint: CadDxfPoint;
  xScale: number;
  yScale: number;
  zScale: number;
  rotationDegrees: number;
}

interface CadPolylineSegmentBatch {
  template: CadDxfPolyline;
  points: CadDxfPoint[];
  segmentCount: number;
}

interface CadLineChunkBuilder {
  style: CadDxfLineChunkStyle;
  positions: Float32Array;
  segmentCount: number;
  offset: number;
  bounds: MutableBounds;
}

interface CadLineOutputState {
  sink: CadDxfLineSink;
  bounds: CadDxfBounds;
  builders: Map<string, CadLineChunkBuilder>;
  chunkIndex: number;
  emittedSegments: number;
  totalEntities?: number;
  totalSegments?: number;
  lastReportedEntities: number;
  lastReportedSegments: number;
}

interface CadParseProgressState {
  sink: CadDxfLineSink;
  phase: CadDxfLineProgressPhase;
  totalEntities?: number;
  totalSegments?: number;
  lastReportedEntities: number;
  lastReportedSegments: number;
}

interface CadLineStyleSource {
  entityType: string;
  layer: string;
  style: CadDxfStyle;
  color: string;
  alpha: number;
  affectsBounds?: boolean;
}

interface TransformedPrimitiveBase extends CadLineStyleSource {
  entityType: string;
  layer: string;
  style: CadDxfStyle;
  color: string;
  alpha: number;
}

interface CadBlockLineTemplate extends CadLineStyleSource {
  coordinates: Float64Array;
  segmentCount: number;
}

interface CadBlockLineTemplateBuilder extends CadLineStyleSource {
  coordinates: number[];
  segmentCount: number;
}

interface CadLineTemplateOutputState {
  builders: Map<string, CadBlockLineTemplateBuilder>;
  templates: CadBlockLineTemplate[];
}

interface PolylineVertex {
  point: CadDxfPoint;
  bulge: number;
}

interface ArcEntity extends EntityBase {
  center?: CadDxfPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

interface EllipseEntity extends EntityBase {
  center?: CadDxfPoint;
  majorAxis?: CadDxfPoint;
  ratio?: number;
  startParameter?: number;
  endParameter?: number;
}

/** 解析 DXF 文本为二维 CAD 图元，并统一换算到项目米制单位。 */
export function parseCadDxf(fileName: string, text: string): CadDxfParseResult {
  const groups = readDxfGroups(text);
  const sections = findDxfSections(groups);
  const context = createParseContext(groups, sections);
  const state = createParseState(fileName);
  parseCadModelOrPaperSpace(context, state);
  applyBestCadProjection(state);

  if (state.primitives.length === 0) {
    throw new Error("没有解析到可绘制的 CAD 二维内容，请确认图纸包含模型空间实体或可展开的 BLOCK/INSERT 内容。");
  }

  const rawBounds = createBounds(state.bounds);
  const unit = resolveCadDxfUnit(groups, sections, rawBounds);
  unit.warnings.forEach((warning) => state.warnings.add(warning));
  const primitives = scaleCadPrimitives(state.primitives, unit.info.unitScaleToMeters);
  const polylines = primitives as CadDxfPolyline[];

  return {
    name: normalizeCadName(fileName.replace(/\.[^.]+$/, ""), "CAD 图纸", 120),
    primitives,
    polylines,
    bounds: scaleCadBounds(rawBounds, unit.info.unitScaleToMeters),
    rawBounds,
    unit: unit.info,
    layers: [...state.layers].sort((left, right) => left.localeCompare(right)),
    entityCount: state.entityCount,
    segmentCount: state.segmentCount,
    primitiveCounts: state.primitiveCounts,
    warnings: [...state.warnings]
  };
}

/** 流式解析 DXF 为二进制线段 chunk，不在主结果中保留大型 primitive 数组。 */
export function parseCadDxfLineStream(fileName: string, text: string, sink: CadDxfLineSink): CadLineImportSummary {
  sink.reportProgress?.({
    phase: "measuring",
    parsedEntities: 0,
    emittedSegments: 0,
    message: "正在读取 DXF 分组"
  });
  const groups = readDxfGroups(text);
  const sections = findDxfSections(groups);
  const context = createParseContext(groups, sections);
  sink.reportProgress?.({
    phase: "measuring",
    parsedEntities: 0,
    emittedSegments: 0,
    message: "正在测量 CAD 图纸内容"
  });
  const measureState = createParseState(fileName, {
    storePrimitives: false,
    progress: sink.reportProgress
      ? {
          sink,
          phase: "measuring",
          lastReportedEntities: 0,
          lastReportedSegments: 0
        }
      : undefined
  });
  parseCadModelOrPaperSpace(context, measureState);
  if (measureState.segmentCount === 0) {
    throw new Error("没有解析到可绘制的 CAD 二维内容，请确认图纸包含模型空间实体或可展开的 BLOCK/INSERT 内容。");
  }

  const projectionPlane = chooseBestCadProjectionPlane(measureState);
  const rawBounds = createProjectedBoundsFrom3d(measureState.bounds3d, projectionPlane);
  if (projectionPlane !== "XY") {
    measureState.warnings.add(`检测到 DXF 主体内容位于 ${projectionPlane} 平面，已自动投影到二维工作网格，避免图纸线段重叠。`);
  }
  const unit = resolveCadDxfUnit(groups, sections, rawBounds);
  unit.warnings.forEach((warning) => measureState.warnings.add(warning));
  const bounds = scaleCadBounds(rawBounds, unit.info.unitScaleToMeters);
  sink.reportProgress?.({
    phase: "emitting",
    parsedEntities: 0,
    emittedSegments: 0,
    totalEntities: measureState.entityCount,
    totalSegments: measureState.segmentCount,
    message: "正在输出 CAD 线段"
  });
  const outputState = createParseState(fileName, {
    storePrimitives: false,
    projectionPlane,
    unitScaleToMeters: unit.info.unitScaleToMeters,
    lineOutput: {
      sink,
      bounds,
      builders: new Map<string, CadLineChunkBuilder>(),
      chunkIndex: 0,
      emittedSegments: 0,
      totalEntities: measureState.entityCount,
      totalSegments: measureState.segmentCount,
      lastReportedEntities: 0,
      lastReportedSegments: 0
    }
  });
  parseCadModelOrPaperSpace(context, outputState);
  flushCadLineOutput(outputState);
  sink.reportProgress?.({
    phase: "emitting",
    parsedEntities: outputState.entityCount,
    emittedSegments: outputState.options.lineOutput?.emittedSegments ?? outputState.segmentCount,
    totalEntities: measureState.entityCount,
    totalSegments: measureState.segmentCount,
    chunkCount: outputState.options.lineOutput?.chunkIndex ?? 0,
    message: "CAD 线段输出完成"
  });

  outputState.warnings.forEach((warning) => measureState.warnings.add(warning));
  return {
    name: normalizeCadName(fileName.replace(/\.[^.]+$/, ""), "CAD 图纸", 120),
    bounds,
    rawBounds,
    unit: unit.info,
    layers: [...outputState.layers].sort((left, right) => left.localeCompare(right)),
    entityCount: outputState.entityCount,
    segmentCount: outputState.segmentCount,
    primitiveCounts: outputState.primitiveCounts,
    warnings: [...measureState.warnings],
    chunkCount: outputState.options.lineOutput?.chunkIndex ?? 0
  };
}

/** 创建解析上下文，供旧数组解析和新流式解析共用。 */
function createParseContext(groups: DxfGroup[], sections: DxfSectionRange[]): ParseContext {
  return {
    groups,
    sections,
    layers: collectLayerTable(groups, sections),
    blocks: collectBlockDefinitions(groups, sections),
    imageDefinitions: collectImageDefinitions(groups, sections),
    blockCacheSegmentCount: 0
  };
}

/** 按模型空间优先、图纸空间兜底的策略执行一次解析。 */
function parseCadModelOrPaperSpace(context: ParseContext, state: ParseState): void {
  const entitySections = context.sections.filter((section) => section.name === "ENTITIES");
  if (context.sections.length === 0) {
    parseDxfEntitiesInRange(context, 0, context.groups.length, state, []);
  } else {
    entitySections.forEach((section) => parseDxfEntitiesInRange(context, section.startIndex, section.endIndex, state, [], "model"));
  }
  mergeModelSpaceBlockPrimitives(context, state);
  if (context.sections.length === 0 || state.segmentCount > 0) {
    return;
  }

  const paperState = createParseState(state.fileName, {
    ...state.options,
    lineOutput: state.options.lineOutput
  });
  entitySections.forEach((section) => parseDxfEntitiesInRange(context, section.startIndex, section.endIndex, paperState, [], "paper"));
  if (paperState.segmentCount > 0) {
    copyParseStateInto(state, paperState);
    state.warnings.add("模型空间未解析到可绘制线，已兜底导入布局/图纸空间线。");
  }
}

/** 用图纸空间兜底结果替换当前状态，保留调用方传入的输出策略。 */
function copyParseStateInto(target: ParseState, source: ParseState): void {
  target.primitives = source.primitives;
  target.layers = source.layers;
  target.bounds = source.bounds;
  target.bounds3d = source.bounds3d;
  target.entityCount = source.entityCount;
  target.segmentCount = source.segmentCount;
  target.primitiveCounts = source.primitiveCounts;
  source.warnings.forEach((warning) => target.warnings.add(warning));
}

/** 创建解析状态，集中记录边界、图层、告警和图元统计。 */
function createParseState(fileName: string, options: Partial<ParseStateOptions> = {}): ParseState {
  return {
    fileName,
    primitives: [],
    layers: new Set<string>(),
    warnings: new Set<string>(),
    bounds: createMutableBounds(),
    bounds3d: createMutableBounds3d(),
    entityCount: 0,
    segmentCount: 0,
    primitiveCounts: { polyline: 0, fill: 0, text: 0, point: 0, image: 0, wipeout: 0 },
    options: {
      storePrimitives: options.storePrimitives ?? true,
      projectionPlane: options.projectionPlane,
      unitScaleToMeters: options.unitScaleToMeters ?? 1,
      lineOutput: options.lineOutput,
      lineTemplateOutput: options.lineTemplateOutput,
      progress: options.progress
    }
  };
}

/** 创建可累积的二维 bounds，解析和投影重算共用同一结构。 */
function createMutableBounds(): MutableBounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };
}

/** 创建可累积的三维 bounds，用于流式解析时选择最佳投影平面。 */
function createMutableBounds3d(): MutableBounds3d {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  };
}

/** 将 DXF 的 code/value 成对文本读取为结构化组。 */
function readDxfGroups(text: string): DxfGroup[] {
  const groups: DxfGroup[] = [];
  let cursor = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const readLine = (): string | null => {
    if (cursor > text.length) {
      return null;
    }
    if (cursor === text.length) {
      cursor += 1;
      return "";
    }

    const start = cursor;
    while (cursor < text.length && text[cursor] !== "\r" && text[cursor] !== "\n") {
      cursor += 1;
    }
    const line = text.slice(start, cursor);
    if (cursor < text.length) {
      if (text[cursor] === "\r" && text[cursor + 1] === "\n") {
        cursor += 2;
      } else {
        cursor += 1;
      }
    }
    return line;
  };

  while (true) {
    const codeLine = readLine();
    if (codeLine === null) {
      break;
    }
    const valueLine = readLine();
    if (valueLine === null) {
      break;
    }

    const code = Number.parseInt(codeLine.trim(), 10);
    if (!Number.isFinite(code)) {
      continue;
    }

    groups.push({ code, value: valueLine.trim() });
  }

  return groups;
}

/** 定位 DXF SECTION 范围，使 TABLES、BLOCKS 与 ENTITIES 能按真实语义分开处理。 */
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

/** 从 TABLES/LAYER 中读取图层颜色，支持实体 BYLAYER 继承原 CAD 配色。 */
function collectLayerTable(groups: DxfGroup[], sections: DxfSectionRange[]): Map<string, DxfLayerInfo> {
  const layers = new Map<string, DxfLayerInfo>();
  sections
    .filter((section) => section.name === "TABLES")
    .forEach((section) => {
      for (let index = section.startIndex; index < section.endIndex; index += 1) {
        if (groups[index].code !== 0 || groups[index].value.toUpperCase() !== "LAYER") {
          continue;
        }

        const layer: DxfLayerInfo = { name: DEFAULT_LAYER_NAME, frozenOrOff: false };
        index = walkEntityGroups(groups, index + 1, (group) => {
          if (group.code === 2) {
            layer.name = normalizeCadName(group.value, DEFAULT_LAYER_NAME, 80);
          } else if (group.code === 62) {
            const colorIndex = Math.trunc(readNumber(group.value, 7));
            layer.colorIndex = Math.abs(colorIndex);
            layer.frozenOrOff = colorIndex < 0;
          } else if (group.code === 420) {
            layer.trueColor = trueColorToHex(readNumber(group.value, 0));
          } else if (group.code === 70) {
            layer.frozenOrOff = (Math.trunc(readNumber(group.value, 0)) & 1) === 1;
          }
        });
        layers.set(layer.name, layer);
      }
    });

  return layers;
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
function createCadDxfUnitInfo(options: Omit<CadDxfUnitInfo, "normalizedMaxDimension">): CadDxfUnitInfo {
  return {
    ...options,
    normalizedMaxDimension: options.rawMaxDimension * options.unitScaleToMeters
  };
}

/** 把 DXF 原始图元坐标原地统一换算到米，避免超大图纸复制整份点集导致内存暴涨。 */
function scaleCadPrimitives(primitives: CadDxfPrimitive[], unitScaleToMeters: number): CadDxfPrimitive[] {
  if (unitScaleToMeters === 1) {
    return primitives;
  }

  primitives.forEach((primitive) => scaleCadPrimitiveInPlace(primitive, unitScaleToMeters));
  return primitives;
}

/** 按 primitive 类型原地缩放坐标和尺寸，颜色样式保持原样。 */
function scaleCadPrimitiveInPlace(primitive: CadDxfPrimitive, scale: number): void {
  if (primitive.type === "polyline") {
    primitive.points.forEach((point) => scalePointInPlace(point, scale));
    return;
  }

  if (primitive.type === "fill") {
    primitive.rings.forEach((ring) => ring.forEach((point) => scalePointInPlace(point, scale)));
    return;
  }

  if (primitive.type === "wipeout") {
    primitive.ring.forEach((point) => scalePointInPlace(point, scale));
    return;
  }

  if (primitive.type === "text") {
    scalePointInPlace(primitive.position, scale);
    primitive.height *= scale;
    primitive.width = primitive.width === undefined ? undefined : primitive.width * scale;
    return;
  }

  if (primitive.type === "image") {
    primitive.corners.forEach((point) => scalePointInPlace(point, scale));
    return;
  }

  scalePointInPlace(primitive.point, scale);
  primitive.size *= scale;
}

/** 原地缩放单个二维点。 */
function scalePointInPlace(point: CadDxfPoint, scale: number): void {
  point.x *= scale;
  point.y *= scale;
  if (point.z !== undefined) {
    point.z *= scale;
  }
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

/** 收集 BLOCKS 段中的块定义范围，块内容会在 INSERT/DIMENSION 时按需展开。 */
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

        const block = readBlockDefinitionShell(groups, index + 1, section.endIndex);
        if (block.definition.name) {
          blocks.set(block.definition.name, block.definition);
        }
        index = block.endIndex;
      }
    });

  return blocks;
}

/** 收集 OBJECTS 段中的 IMAGEDEF，IMAGE 实体会通过 handle 找到外部图片路径。 */
function collectImageDefinitions(groups: DxfGroup[], sections: DxfSectionRange[]): Map<string, DxfImageDefinition> {
  const definitions = new Map<string, DxfImageDefinition>();
  sections
    .filter((section) => section.name === "OBJECTS")
    .forEach((section) => {
      for (let index = section.startIndex; index < section.endIndex; index += 1) {
        const group = groups[index];
        if (group.code !== 0 || group.value.toUpperCase() !== "IMAGEDEF") {
          continue;
        }

        const definition: DxfImageDefinition = { handle: "" };
        index = walkEntityGroups(groups, index + 1, (item) => {
          if (item.code === 5) {
            definition.handle = normalizeCadName(item.value, "", 120).toUpperCase();
          } else if (item.code === 1) {
            definition.sourcePath = item.value;
          } else if (item.code === 10) {
            definition.pixelWidth = Math.max(1, readNumber(item.value, 1));
          } else if (item.code === 20) {
            definition.pixelHeight = Math.max(1, readNumber(item.value, 1));
          }
        });

        if (definition.handle) {
          definitions.set(definition.handle, definition);
        }
      }
    });

  return definitions;
}

/** 补读转换器常见的 *Model_Space 块内容，避免主体图元不在 ENTITIES 时被漏掉。 */
function mergeModelSpaceBlockPrimitives(context: ParseContext, state: ParseState): void {
  const modelSpaceBlocks = [...context.blocks.values()].filter((block) => {
    if (!isModelSpaceBlockName(block.name)) {
      return false;
    }

    const entityCount = countBlockEntityHeaders(context.groups, block);
    return shouldMergeModelSpaceBlock(state, entityCount);
  });
  if (modelSpaceBlocks.length === 0) {
    return;
  }

  if (!state.options.storePrimitives) {
    modelSpaceBlocks.forEach((block) => {
      parseDxfEntitiesInRange(context, block.startIndex, block.endIndex, state, [block.name]);
    });
    return;
  }

  const knownPrimitives = new Set(state.primitives.map(createCadPrimitiveFingerprint));
  modelSpaceBlocks.forEach((block) => {
    const blockState = createParseState(`model-space:${block.name}`);
    parseDxfEntitiesInRange(context, block.startIndex, block.endIndex, blockState, [block.name]);
    blockState.warnings.forEach((warning) => state.warnings.add(warning));

    let addedPrimitiveCount = 0;
    blockState.primitives.forEach((primitive) => {
      const fingerprint = createCadPrimitiveFingerprint(primitive);
      if (knownPrimitives.has(fingerprint)) {
        return;
      }

      knownPrimitives.add(fingerprint);
      pushPrimitive(state, context, primitive);
      addedPrimitiveCount += 1;
    });

    if (addedPrimitiveCount > 0) {
      state.entityCount += blockState.entityCount;
    }
  });
}

/** 判断 BLOCK 名称是否代表模型空间内容。 */
function isModelSpaceBlockName(name: string): boolean {
  const normalized = name.replace(/[\s_-]+/g, "").toUpperCase();
  return normalized.includes("MODELSPACE");
}

/** 低成本统计块内实体数量，用于决定是否补读模型空间块。 */
function countBlockEntityHeaders(groups: DxfGroup[], block: CadBlockDefinition): number {
  let count = 0;
  for (let index = block.startIndex; index < block.endIndex; index += 1) {
    if (groups[index].code === 0) {
      count += 1;
    }
  }
  return count;
}

/** 仅在顶层内容稀少或模型空间块明显更完整时 fallback，避免标准大图纸重复解析导致内存压力。 */
function shouldMergeModelSpaceBlock(state: ParseState, blockEntityCount: number): boolean {
  if (blockEntityCount <= 0) {
    return false;
  }

  if (state.entityCount <= MODEL_SPACE_FALLBACK_SMALL_ENTITY_COUNT) {
    return true;
  }

  return blockEntityCount > state.entityCount * 2;
}

interface CadVector3 {
  x: number;
  y: number;
  z: number;
}

const DEFAULT_EXTRUSION: CadVector3 = { x: 0, y: 0, z: 1 };
const CAD_VECTOR_EPSILON = 1e-9;

/** 将 OCS 局部二维点批量转为 WCS，处理 LWPOLYLINE/HATCH/TEXT 等带挤出方向的实体。 */
function toWorldCadPoints(entity: EntityBase, points: CadDxfPoint[]): CadDxfPoint[] {
  if (!hasEntityOcsTransform(entity)) {
    return points;
  }

  return points.map((point) => toWorldCadPoint(entity, point));
}

/** 将单个 OCS 点转换到 WCS，普通 XY 实体保持原坐标不变。 */
function toWorldCadPoint(entity: EntityBase, point: CadDxfPoint): CadDxfPoint {
  const localZ = point.z ?? entity.elevation ?? 0;
  if (!hasEntityOcsTransform(entity)) {
    return point.z !== undefined || entity.elevation !== undefined ? { x: point.x, y: point.y, z: localZ } : point;
  }

  const normal = normalizeCadVector(entity.extrusion ?? DEFAULT_EXTRUSION);
  const basis = createCadOcsBasis(normal);
  return {
    x: point.x * basis.xAxis.x + point.y * basis.yAxis.x + localZ * normal.x,
    y: point.x * basis.xAxis.y + point.y * basis.yAxis.y + localZ * normal.y,
    z: point.x * basis.xAxis.z + point.y * basis.yAxis.z + localZ * normal.z
  };
}

/** 判断实体是否携带非默认 OCS 信息；只在需要时转换，避免扰动普通 XY 图纸。 */
function hasEntityOcsTransform(entity: EntityBase): boolean {
  if (entity.elevation !== undefined && Math.abs(entity.elevation) > CAD_VECTOR_EPSILON) {
    return true;
  }

  const extrusion = entity.extrusion;
  if (!extrusion) {
    return false;
  }

  return (
    Math.abs(extrusion.x) > CAD_VECTOR_EPSILON ||
    Math.abs(extrusion.y) > CAD_VECTOR_EPSILON ||
    Math.abs((extrusion.z ?? 1) - 1) > CAD_VECTOR_EPSILON
  );
}

/** 按 DXF Arbitrary Axis Algorithm 创建 OCS 到 WCS 的 X/Y 轴。 */
function createCadOcsBasis(normal: CadVector3): { xAxis: CadVector3; yAxis: CadVector3 } {
  const worldAxis = Math.abs(normal.x) < 1 / 64 && Math.abs(normal.y) < 1 / 64 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const xAxis = normalizeCadVector(crossCadVector(worldAxis, normal));
  const yAxis = crossCadVector(normal, xAxis);
  return { xAxis, yAxis };
}

/** 归一化 CAD 三维向量，非法输入回退为默认 Z 轴。 */
function normalizeCadVector(vector: Partial<CadDxfPoint>): CadVector3 {
  const x = vector.x ?? 0;
  const y = vector.y ?? 0;
  const z = vector.z ?? 0;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= CAD_VECTOR_EPSILON) {
    return DEFAULT_EXTRUSION;
  }

  return { x: x / length, y: y / length, z: z / length };
}

/** 三维向量叉乘。 */
function crossCadVector(left: CadVector3, right: CadVector3): CadVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  };
}

type CadProjectionPlane = "XY" | "XZ" | "YZ";

interface MutableBounds3d {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** 自动选择 DXF 中面积最大的二维平面，避免 XZ/YZ 图纸被只读 XY 时压扁重叠。 */
function applyBestCadProjection(state: ParseState): void {
  const bounds3d = collectCad3dBounds(state.primitives);
  if (!bounds3d) {
    return;
  }

  const bestPlane = chooseBestCadProjectionPlaneFromBounds(bounds3d);
  if (bestPlane === "XY") {
    state.bounds = recomputeCadBounds(state.primitives);
    return;
  }

  state.primitives.forEach((primitive) => forEachCadPrimitivePoint(primitive, (point) => projectCadPointToPlane(point, bestPlane)));
  state.bounds = recomputeCadBounds(state.primitives);
  state.warnings.add(`检测到 DXF 主体内容位于 ${bestPlane} 平面，已自动投影到二维工作网格，避免图纸线段重叠。`);
}

/** 根据解析状态选择最适合的二维投影平面，流式解析没有 primitive 数组时也可复用。 */
function chooseBestCadProjectionPlane(state: ParseState): CadProjectionPlane {
  return chooseBestCadProjectionPlaneFromBounds(state.bounds3d);
}

/** 根据三维 bounds 判断最大面积平面，只有明显优于 XY 时才切换。 */
function chooseBestCadProjectionPlaneFromBounds(bounds3d: MutableBounds3d): CadProjectionPlane {
  if (!Number.isFinite(bounds3d.minX)) {
    return "XY";
  }

  const widthX = bounds3d.maxX - bounds3d.minX;
  const widthY = bounds3d.maxY - bounds3d.minY;
  const widthZ = bounds3d.maxZ - bounds3d.minZ;
  const areas: Record<CadProjectionPlane, number> = {
    XY: widthX * widthY,
    XZ: widthX * widthZ,
    YZ: widthY * widthZ
  };
  const bestPlane = (Object.keys(areas) as CadProjectionPlane[]).sort((left, right) => areas[right] - areas[left])[0];
  const bestArea = areas[bestPlane];
  const xyArea = areas.XY;
  return bestPlane !== "XY" && bestArea > 1e-9 && bestArea > Math.max(xyArea * 4, 1e-9) ? bestPlane : "XY";
}

/** 将三维 bounds 投影成二维 raw bounds，避免流式解析为了取 bounds 保存全部 primitive。 */
function createProjectedBoundsFrom3d(bounds3d: MutableBounds3d, plane: CadProjectionPlane): CadDxfBounds {
  if (plane === "XZ") {
    return createBounds({ minX: bounds3d.minX, minY: bounds3d.minZ, maxX: bounds3d.maxX, maxY: bounds3d.maxZ });
  }

  if (plane === "YZ") {
    return createBounds({ minX: bounds3d.minY, minY: bounds3d.minZ, maxX: bounds3d.maxY, maxY: bounds3d.maxZ });
  }

  return createBounds({ minX: bounds3d.minX, minY: bounds3d.minY, maxX: bounds3d.maxX, maxY: bounds3d.maxY });
}

/** 收集所有 primitive 点的三维范围，用于判断真实二维图纸所在平面。 */
function collectCad3dBounds(primitives: CadDxfPrimitive[]): MutableBounds3d | null {
  const bounds: MutableBounds3d = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY
  };
  primitives.forEach((primitive) =>
    forEachCadPrimitivePoint(primitive, (point) => {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.minZ = Math.min(bounds.minZ, point.z ?? 0);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.maxY = Math.max(bounds.maxY, point.y);
      bounds.maxZ = Math.max(bounds.maxZ, point.z ?? 0);
    })
  );

  return Number.isFinite(bounds.minX) ? bounds : null;
}

/** 遍历 primitive 内所有真实坐标点，供投影、bounds 和统计复用。 */
function forEachCadPrimitivePoint(primitive: CadDxfPrimitive, visit: (point: CadDxfPoint) => void): void {
  if (primitive.type === "polyline") {
    primitive.points.forEach(visit);
    return;
  }

  if (primitive.type === "fill") {
    primitive.rings.forEach((ring) => ring.forEach(visit));
    return;
  }

  if (primitive.type === "wipeout") {
    primitive.ring.forEach(visit);
    return;
  }

  if (primitive.type === "text") {
    visit(primitive.position);
    return;
  }

  if (primitive.type === "image") {
    primitive.corners.forEach(visit);
    return;
  }

  visit(primitive.point);
}

/** 将选中的 DXF 三维平面投影为导入器内部的二维 x/y。 */
function projectCadPointToPlane(point: CadDxfPoint, plane: CadProjectionPlane): void {
  if (plane === "XZ") {
    point.y = point.z ?? 0;
    return;
  }

  if (plane === "YZ") {
    point.x = point.y;
    point.y = point.z ?? 0;
  }
}

/** 基于当前 primitive 坐标重算二维 bounds，避免投影后仍使用旧的压扁范围。 */
function recomputeCadBounds(primitives: CadDxfPrimitive[]): MutableBounds {
  const bounds = createMutableBounds();
  primitives.forEach((primitive) => extendBoundsForPrimitive(bounds, primitive));
  return bounds;
}

/** 生成 primitive 去重指纹，避免 Model_Space fallback 与 ENTITIES 双份内容重叠。 */
function createCadPrimitiveFingerprint(primitive: CadDxfPrimitive): string {
  const styleKey = `${primitive.type}|${primitive.entityType}|${primitive.layer}|${primitive.color}|${primitive.alpha}`;
  if (primitive.type === "polyline") {
    return `${styleKey}|${createCadPointCollectionFingerprint([primitive.points])}`;
  }

  if (primitive.type === "fill") {
    return `${styleKey}|${createCadPointCollectionFingerprint(primitive.rings)}`;
  }

  if (primitive.type === "wipeout") {
    return `${styleKey}|${createCadPointCollectionFingerprint([primitive.ring])}`;
  }

  if (primitive.type === "text") {
    return `${styleKey}|${primitive.text}|${createCadPointCollectionFingerprint([[primitive.position]])}|${primitive.height}|${primitive.rotationDegrees}|${primitive.width ?? ""}`;
  }

  if (primitive.type === "image") {
    return `${styleKey}|${primitive.sourcePath ?? ""}|${primitive.imageDefHandle ?? ""}|${createCadPointCollectionFingerprint([primitive.corners])}`;
  }

  return `${styleKey}|${createCadPointCollectionFingerprint([[primitive.point]])}|${primitive.size}`;
}

/** 对大量点坐标做增量 hash，避免去重时拼接超长坐标字符串造成内存峰值。 */
function createCadPointCollectionFingerprint(rings: CadDxfPoint[][]): string {
  let hash = 2166136261;
  let pointCount = 0;
  rings.forEach((ring, ringIndex) => {
    hash = updateCadFingerprintHash(hash, `r${ringIndex}:${ring.length}|`);
    pointCount += ring.length;
    ring.forEach((point) => {
      hash = updateCadFingerprintHash(hash, roundCadFingerprintNumber(point.x));
      hash = updateCadFingerprintHash(hash, ",");
      hash = updateCadFingerprintHash(hash, roundCadFingerprintNumber(point.y));
      hash = updateCadFingerprintHash(hash, ",");
      hash = updateCadFingerprintHash(hash, roundCadFingerprintNumber(point.z ?? 0));
      hash = updateCadFingerprintHash(hash, ";");
    });
  });

  return `${rings.length}:${pointCount}:${hash.toString(36)}`;
}

/** FNV-1a 32 位增量 hash，用于 Model_Space fallback 的轻量去重指纹。 */
function updateCadFingerprintHash(seed: number, value: string): number {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/** 限定去重精度，规避浮点采样微小误差导致同一图元无法识别。 */
function roundCadFingerprintNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(8) : "NaN";
}

/** 读取单个 BLOCK 定义的名称、基点和实体范围，避免提前解析导致前向引用块丢失。 */
function readBlockDefinitionShell(
  groups: DxfGroup[],
  startIndex: number,
  sectionEndIndex: number
): { definition: CadBlockDefinition; endIndex: number } {
  const definition: CadBlockDefinition = {
    name: "",
    basePoint: { x: 0, y: 0 },
    startIndex,
    endIndex: startIndex
  };

  let sawEntity = false;
  let index = startIndex;
  for (; index < sectionEndIndex; index += 1) {
    const group = groups[index];
    if (group.code === 0 && group.value.toUpperCase() === "ENDBLK") {
      definition.endIndex = index;
      break;
    }

    if (!sawEntity && group.code === 2 && !definition.name) {
      definition.name = normalizeCadName(group.value, "", 120);
      continue;
    }

    if (!sawEntity && group.code === 10) {
      definition.basePoint.x = readNumber(group.value, 0);
      continue;
    }

    if (!sawEntity && group.code === 20) {
      definition.basePoint.y = readNumber(group.value, 0);
      continue;
    }

    if (!sawEntity && group.code === 30) {
      definition.basePoint.z = readNumber(group.value, 0);
      continue;
    }

    if (group.code === 0) {
      sawEntity = true;
    }
  }

  return { definition, endIndex: index };
}

/** 解析指定范围内的模型空间实体，避免把块定义误当成顶层图纸。 */
function parseDxfEntitiesInRange(
  context: ParseContext,
  startIndex: number,
  endIndex: number,
  state: ParseState,
  blockStack: string[],
  spaceFilter: CadEntitySpace = "all"
): void {
  for (let index = startIndex; index < endIndex; index += 1) {
    const group = context.groups[index];
    if (group.code !== 0) {
      continue;
    }

    if (spaceFilter !== "all" && !isEntityInCadSpace(context.groups, index + 1, spaceFilter)) {
      index = walkEntityGroups(context.groups, index + 1, () => undefined);
      continue;
    }

    const entityCountBefore = state.entityCount;
    index = parseSingleDxfEntity(context, index, state, blockStack);
    if (state.entityCount !== entityCountBefore) {
      reportCadParseProgress(state);
    }
  }
}

/** 判断顶层实体属于模型空间还是图纸空间，块内部不走该过滤。 */
function isEntityInCadSpace(groups: DxfGroup[], startIndex: number, expectedSpace: Exclude<CadEntitySpace, "all">): boolean {
  let space: Exclude<CadEntitySpace, "all"> = "model";
  walkEntityGroups(groups, startIndex, (group) => {
    if (group.code === 67) {
      space = Math.trunc(readNumber(group.value, 0)) === 1 ? "paper" : "model";
    } else if (group.code === 410 && group.value) {
      space = group.value.trim().toLowerCase() === "model" ? "model" : "paper";
    }
  });
  return space === expectedSpace;
}

/** 分发解析单个 DXF 实体，支持普通图元、文本、填充、点和块实例。 */
function parseSingleDxfEntity(context: ParseContext, entityTypeIndex: number, state: ParseState, blockStack: string[]): number {
  const type = context.groups[entityTypeIndex].value.toUpperCase();
  switch (type) {
    case "LINE":
      return readLineEntity(context, entityTypeIndex + 1, state);
    case "LWPOLYLINE":
      return readLightweightPolylineEntity(context, entityTypeIndex + 1, state);
    case "POLYLINE":
      return readLegacyPolylineEntity(context, entityTypeIndex + 1, state);
    case "CIRCLE":
      return readCircleEntity(context, entityTypeIndex + 1, state);
    case "ARC":
      return readArcEntity(context, entityTypeIndex + 1, state);
    case "ELLIPSE":
      return readEllipseEntity(context, entityTypeIndex + 1, state);
    case "SPLINE":
      return readSplineEntity(context, entityTypeIndex + 1, state);
    case "TEXT":
    case "ATTRIB":
    case "ATTDEF":
      return readTextEntity(context, entityTypeIndex + 1, state, type);
    case "MTEXT":
      return readMTextEntity(context, entityTypeIndex + 1, state);
    case "HATCH":
      return readHatchEntity(context, entityTypeIndex + 1, state);
    case "SOLID":
    case "TRACE":
    case "3DFACE":
      return readFaceEntity(context, entityTypeIndex + 1, state, type);
    case "POINT":
      return readPointEntity(context, entityTypeIndex + 1, state);
    case "IMAGE":
      return readImageEntity(context, entityTypeIndex + 1, state);
    case "WIPEOUT":
      return readWipeoutEntity(context, entityTypeIndex + 1, state);
    case "LEADER":
    case "MLINE":
      return readLeaderEntity(context, entityTypeIndex + 1, state, type);
    case "MLEADER":
    case "MULTILEADER":
      return readMultiLeaderEntity(context, entityTypeIndex + 1, state, type);
    case "RAY":
    case "XLINE":
      return readInfiniteLineEntity(context, entityTypeIndex + 1, state, type);
    case "INSERT":
      return readInsertEntity(context, entityTypeIndex + 1, state, blockStack);
    case "DIMENSION":
      return readDimensionEntity(context, entityTypeIndex + 1, state, blockStack);
    default:
      return readUnsupportedEntity(context, entityTypeIndex + 1, state, type);
  }
}

/** 读取 LINE 实体并加入线段集合。 */
function readLineEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity = createEntityBase();
  let start: Partial<CadDxfPoint> = {};
  let end: Partial<CadDxfPoint> = {};
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      start = { ...start, x: readNumber(group.value, 0) };
    } else if (group.code === 20) {
      start = { ...start, y: readNumber(group.value, 0) };
    } else if (group.code === 30) {
      start = { ...start, z: readNumber(group.value, 0) };
    } else if (group.code === 11) {
      end = { ...end, x: readNumber(group.value, 0) };
    } else if (group.code === 21) {
      end = { ...end, y: readNumber(group.value, 0) };
    } else if (group.code === 31) {
      end = { ...end, z: readNumber(group.value, 0) };
    }
  });

  if (isCompletePoint(start) && isCompletePoint(end)) {
    pushPolyline(state, context, entity, "LINE", [start, end]);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 LWPOLYLINE 实体，保留原始顶点并展开 bulge 圆弧段。 */
function readLightweightPolylineEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity = createEntityBase();
  const vertices: PolylineVertex[] = [];
  let closed = false;
  const pending: { current: { point: Partial<CadDxfPoint>; bulge: number } | null } = { current: null };
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 70) {
      closed = (Math.trunc(readNumber(group.value, 0)) & 1) === 1;
      return;
    }

    if (group.code === 10) {
      if (pending.current && isCompletePoint(pending.current.point)) {
        vertices.push({ point: pending.current.point, bulge: pending.current.bulge });
      }
      pending.current = { point: { x: readNumber(group.value, 0) }, bulge: 0 };
      return;
    }

    if (group.code === 20 && pending.current) {
      pending.current.point.y = readNumber(group.value, 0);
      return;
    }

    if (group.code === 42 && pending.current) {
      pending.current.bulge = readNumber(group.value, 0);
    }
  });

  if (pending.current && isCompletePoint(pending.current.point)) {
    vertices.push({ point: pending.current.point, bulge: pending.current.bulge });
  }
  pushPolyline(state, context, entity, "LWPOLYLINE", toWorldCadPoints(entity, polylineVerticesToPoints(vertices, closed)), closed);
  state.entityCount += 1;
  return endIndex;
}

/** 读取旧版 POLYLINE/VERTEX/SEQEND 实体，支持 VERTEX bulge。 */
function readLegacyPolylineEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity = createEntityBase();
  const vertices: PolylineVertex[] = [];
  let closed = false;
  let index = startIndex;
  for (; index < context.groups.length; index += 1) {
    const group = context.groups[index];
    if (group.code !== 0) {
      applyEntityCommonGroup(group, entity);
      if (group.code === 70) {
        closed = (Math.trunc(readNumber(group.value, 0)) & 1) === 1;
      }
      continue;
    }

    const type = group.value.toUpperCase();
    if (type === "VERTEX") {
      const vertex = readVertexEntity(context.groups, index + 1);
      if (vertex.vertex) {
        vertices.push(vertex.vertex);
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

  pushPolyline(state, context, entity, "POLYLINE", toWorldCadPoints(entity, polylineVerticesToPoints(vertices, closed)), closed);
  state.entityCount += 1;
  return index;
}

/** 读取 POLYLINE 下的单个 VERTEX 点和 bulge。 */
function readVertexEntity(groups: DxfGroup[], startIndex: number): { vertex: PolylineVertex | null; endIndex: number } {
  const point: Partial<CadDxfPoint> = {};
  let bulge = 0;
  const endIndex = walkEntityGroups(groups, startIndex, (group) => {
    if (group.code === 10) {
      point.x = readNumber(group.value, 0);
    } else if (group.code === 20) {
      point.y = readNumber(group.value, 0);
    } else if (group.code === 30) {
      point.z = readNumber(group.value, 0);
    } else if (group.code === 42) {
      bulge = readNumber(group.value, 0);
    }
  });

  return {
    vertex: isCompletePoint(point) ? { point, bulge } : null,
    endIndex
  };
}

/** 读取 CIRCLE 实体，并按高精度采样成闭合矢量折线。 */
function readCircleEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity: ArcEntity = { ...createEntityBase(), startAngle: 0, endAngle: 360 };
  const endIndex = readArcLikeEntity(context.groups, startIndex, entity);
  pushPolyline(state, context, entity, "CIRCLE", toWorldCadPoints(entity, sampleArcPoints(entity, true)), true);
  state.entityCount += 1;
  return endIndex;
}

/** 读取 ARC 实体，并按角度范围采样成矢量折线。 */
function readArcEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity: ArcEntity = createEntityBase();
  const endIndex = readArcLikeEntity(context.groups, startIndex, entity);
  pushPolyline(state, context, entity, "ARC", toWorldCadPoints(entity, sampleArcPoints(entity, false)));
  state.entityCount += 1;
  return endIndex;
}

/** 读取 ELLIPSE 实体，按参数范围采样为折线。 */
function readEllipseEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity: EllipseEntity = { ...createEntityBase(), ratio: 1, startParameter: 0, endParameter: Math.PI * 2 };
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      entity.center = { x: readNumber(group.value, 0), y: entity.center?.y ?? 0 };
    } else if (group.code === 20) {
      entity.center = { x: entity.center?.x ?? 0, y: readNumber(group.value, 0) };
    } else if (group.code === 30) {
      entity.center = { x: entity.center?.x ?? 0, y: entity.center?.y ?? 0, z: readNumber(group.value, 0) };
    } else if (group.code === 11) {
      entity.majorAxis = { x: readNumber(group.value, 0), y: entity.majorAxis?.y ?? 0 };
    } else if (group.code === 21) {
      entity.majorAxis = { x: entity.majorAxis?.x ?? 0, y: readNumber(group.value, 0) };
    } else if (group.code === 31) {
      entity.majorAxis = { x: entity.majorAxis?.x ?? 0, y: entity.majorAxis?.y ?? 0, z: readNumber(group.value, 0) };
    } else if (group.code === 40) {
      entity.ratio = Math.max(0.0001, readNumber(group.value, 1));
    } else if (group.code === 41) {
      entity.startParameter = readNumber(group.value, 0);
    } else if (group.code === 42) {
      entity.endParameter = readNumber(group.value, Math.PI * 2);
    }
  });

  pushPolyline(state, context, entity, "ELLIPSE", sampleEllipsePoints(entity));
  state.entityCount += 1;
  return endIndex;
}

/** 读取 SPLINE 实体；优先使用 fit points，缺失时使用控制点曲线近似以保留可见内容。 */
function readSplineEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity = createEntityBase();
  const controlPoints: CadDxfPoint[] = [];
  const fitPoints: CadDxfPoint[] = [];
  let pendingControl: Partial<CadDxfPoint> | null = null;
  let pendingFit: Partial<CadDxfPoint> | null = null;
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      if (pendingControl && isCompletePoint(pendingControl)) {
        controlPoints.push(pendingControl);
      }
      pendingControl = { x: readNumber(group.value, 0) };
    } else if (group.code === 20 && pendingControl) {
      pendingControl.y = readNumber(group.value, 0);
    } else if (group.code === 30 && pendingControl) {
      pendingControl.z = readNumber(group.value, 0);
    } else if (group.code === 11) {
      if (pendingFit && isCompletePoint(pendingFit)) {
        fitPoints.push(pendingFit);
      }
      pendingFit = { x: readNumber(group.value, 0) };
    } else if (group.code === 21 && pendingFit) {
      pendingFit.y = readNumber(group.value, 0);
    } else if (group.code === 31 && pendingFit) {
      pendingFit.z = readNumber(group.value, 0);
    }
  });

  if (pendingControl && isCompletePoint(pendingControl)) {
    controlPoints.push(pendingControl);
  }
  if (pendingFit && isCompletePoint(pendingFit)) {
    fitPoints.push(pendingFit);
  }

  const points = fitPoints.length >= 2 ? fitPoints : sampleControlPointCurve(controlPoints);
  pushPolyline(state, context, entity, "SPLINE", points);
  state.entityCount += 1;
  return endIndex;
}

/** 读取 TEXT/ATTRIB/ATTDEF 实体并加入文字 primitive。 */
function readTextEntity(context: ParseContext, startIndex: number, state: ParseState, entityType: string): number {
  const entity = createEntityBase();
  let text = "";
  let position: Partial<CadDxfPoint> = {};
  let height = 1;
  let rotationDegrees = 0;
  let widthFactor = 1;
  let align: CadDxfText["align"];
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 1) {
      text = decodeCadText(group.value);
    } else if (group.code === 10) {
      position = { ...position, x: readNumber(group.value, 0) };
    } else if (group.code === 20) {
      position = { ...position, y: readNumber(group.value, 0) };
    } else if (group.code === 30) {
      position = { ...position, z: readNumber(group.value, 0) };
    } else if (group.code === 40) {
      height = Math.max(0.001, readNumber(group.value, 1));
    } else if (group.code === 41) {
      widthFactor = Math.max(0.05, readNumber(group.value, 1));
    } else if (group.code === 50) {
      rotationDegrees = readNumber(group.value, 0);
    } else if (group.code === 72) {
      const horizontalAlign = Math.trunc(readNumber(group.value, 0));
      align = horizontalAlign === 1 ? "center" : horizontalAlign >= 2 ? "right" : "left";
    }
  });

  if (text && isCompletePoint(position)) {
    pushText(state, context, entity, entityType, text, toWorldCadPoint(entity, position), height, rotationDegrees, widthFactor, align);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 MTEXT 实体，合并 1/3 组并清理常见格式控制符。 */
function readMTextEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity = createEntityBase();
  const chunks: string[] = [];
  let position: Partial<CadDxfPoint> = {};
  let height = 1;
  let rotationDegrees = 0;
  let widthFactor = 1;
  let width: number | undefined;
  const direction: Partial<CadDxfPoint> = {};
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 1 || group.code === 3) {
      chunks.push(group.value);
    } else if (group.code === 10) {
      position = { ...position, x: readNumber(group.value, 0) };
    } else if (group.code === 20) {
      position = { ...position, y: readNumber(group.value, 0) };
    } else if (group.code === 30) {
      position = { ...position, z: readNumber(group.value, 0) };
    } else if (group.code === 40) {
      height = Math.max(0.001, readNumber(group.value, 1));
    } else if (group.code === 41) {
      width = readNumber(group.value, 0);
    } else if (group.code === 50) {
      rotationDegrees = readNumber(group.value, 0);
    } else if (group.code === 11) {
      direction.x = readNumber(group.value, 1);
    } else if (group.code === 21) {
      direction.y = readNumber(group.value, 0);
    }
  });

  if (direction.x !== undefined && direction.y !== undefined && (direction.x !== 0 || direction.y !== 0)) {
    rotationDegrees = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  }

  const text = decodeCadText(chunks.join(""));
  if (text && isCompletePoint(position)) {
    pushText(state, context, entity, "MTEXT", text, toWorldCadPoint(entity, position), height, rotationDegrees, widthFactor, "left", width);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 HATCH 填充实体；线-only 导入不把填充边界和图案派生为 CAD 线。 */
function readHatchEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity = createEntityBase();
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
  });
  state.warnings.add("HATCH 填充/剖面图案不是独立线实体，线-only CAD 导入已跳过该类派生线。");
  state.entityCount += 1;
  return endIndex;
}

/** 读取 SOLID/TRACE/3DFACE 面片实体。 */
function readFaceEntity(context: ParseContext, startIndex: number, state: ParseState, entityType: string): number {
  const entity = createEntityBase();
  const pointsByCode = new Map<number, Partial<CadDxfPoint>>();
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code >= 10 && group.code <= 13) {
      pointsByCode.set(group.code, { ...(pointsByCode.get(group.code) ?? {}), x: readNumber(group.value, 0) });
    } else if (group.code >= 20 && group.code <= 23) {
      const pointCode = group.code - 10;
      pointsByCode.set(pointCode, { ...(pointsByCode.get(pointCode) ?? {}), y: readNumber(group.value, 0) });
    } else if (group.code >= 30 && group.code <= 33) {
      const pointCode = group.code - 20;
      pointsByCode.set(pointCode, { ...(pointsByCode.get(pointCode) ?? {}), z: readNumber(group.value, 0) });
    }
  });

  const points = [10, 11, 12, 13]
    .map((code) => pointsByCode.get(code))
    .filter((point): point is CadDxfPoint => !!point && isCompletePoint(point));
  const ring = closePoints(toWorldCadPoints(entity, removeDuplicateClosingPoints(points)), true);
  if (ring.length >= 4) {
    pushPolyline(state, context, entity, `${entityType}_BOUNDARY`, ring, true);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 POINT 实体并保留为可见小十字标记。 */
function readPointEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity = createEntityBase();
  let point: Partial<CadDxfPoint> = {};
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      point = { ...point, x: readNumber(group.value, 0) };
    } else if (group.code === 20) {
      point = { ...point, y: readNumber(group.value, 0) };
    } else if (group.code === 30) {
      point = { ...point, z: readNumber(group.value, 0) };
    }
  });

  if (isCompletePoint(point)) {
    pushPoint(state, context, entity, "POINT", point);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 IMAGE 栅格参照，保留 IMAGEDEF 路径和贴图四角供渲染端按需加载。 */
function readImageEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity: ImageEntity = {
    ...createEntityBase(),
    insertion: { x: 0, y: 0 },
    uVector: { x: 1, y: 0 },
    vVector: { x: 0, y: 1 },
    visible: true
  };
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      entity.insertion.x = readNumber(group.value, 0);
    } else if (group.code === 20) {
      entity.insertion.y = readNumber(group.value, 0);
    } else if (group.code === 30) {
      entity.insertion.z = readNumber(group.value, 0);
    } else if (group.code === 11) {
      entity.uVector.x = readNumber(group.value, 1);
    } else if (group.code === 21) {
      entity.uVector.y = readNumber(group.value, 0);
    } else if (group.code === 31) {
      entity.uVector.z = readNumber(group.value, 0);
    } else if (group.code === 12) {
      entity.vVector.x = readNumber(group.value, 0);
    } else if (group.code === 22) {
      entity.vVector.y = readNumber(group.value, 1);
    } else if (group.code === 32) {
      entity.vVector.z = readNumber(group.value, 0);
    } else if (group.code === 13) {
      entity.pixelWidth = Math.max(1, readNumber(group.value, 1));
    } else if (group.code === 23) {
      entity.pixelHeight = Math.max(1, readNumber(group.value, 1));
    } else if (group.code === 340) {
      entity.imageDefHandle = normalizeCadName(group.value, "", 120).toUpperCase();
    } else if (group.code === 70) {
      entity.visible = Math.trunc(readNumber(group.value, 1)) !== 0;
    }
  });

  if (entity.visible) {
    pushImage(state, context, entity);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 WIPEOUT 遮罩，DXF 中该实体复用 raster image 的插入点、U/V 向量和裁剪边界。 */
function readWipeoutEntity(context: ParseContext, startIndex: number, state: ParseState): number {
  const entity: WipeoutEntity = {
    ...createEntityBase(),
    insertion: { x: 0, y: 0 },
    uVector: { x: 1, y: 0 },
    vVector: { x: 0, y: 1 },
    visible: true,
    clipPoints: []
  };
  let pendingClipPoint: Partial<CadDxfPoint> | null = null;
  const flushClipPoint = () => {
    if (pendingClipPoint && isCompletePoint(pendingClipPoint)) {
      entity.clipPoints.push({ x: pendingClipPoint.x, y: pendingClipPoint.y });
      pendingClipPoint = null;
    }
  };
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      entity.insertion.x = readNumber(group.value, 0);
    } else if (group.code === 20) {
      entity.insertion.y = readNumber(group.value, 0);
    } else if (group.code === 30) {
      entity.insertion.z = readNumber(group.value, 0);
    } else if (group.code === 11) {
      entity.uVector.x = readNumber(group.value, 1);
    } else if (group.code === 21) {
      entity.uVector.y = readNumber(group.value, 0);
    } else if (group.code === 31) {
      entity.uVector.z = readNumber(group.value, 0);
    } else if (group.code === 12) {
      entity.vVector.x = readNumber(group.value, 0);
    } else if (group.code === 22) {
      entity.vVector.y = readNumber(group.value, 1);
    } else if (group.code === 32) {
      entity.vVector.z = readNumber(group.value, 0);
    } else if (group.code === 13) {
      entity.pixelWidth = Math.max(1, readNumber(group.value, 1));
    } else if (group.code === 23) {
      entity.pixelHeight = Math.max(1, readNumber(group.value, 1));
    } else if (group.code === 14) {
      flushClipPoint();
      pendingClipPoint = { x: readNumber(group.value, 0) };
    } else if (group.code === 24) {
      pendingClipPoint = { ...(pendingClipPoint ?? {}), y: readNumber(group.value, 0) };
      flushClipPoint();
    } else if (group.code === 70) {
      entity.visible = Math.trunc(readNumber(group.value, 1)) !== 0;
    }
  });
  flushClipPoint();

  if (entity.visible) {
    pushWipeout(state, context, entity);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 LEADER/MLINE 顶点，至少按中心线保留可见标注引线。 */
function readLeaderEntity(context: ParseContext, startIndex: number, state: ParseState, entityType: string): number {
  const entity = createEntityBase();
  const points: CadDxfPoint[] = [];
  let pending: Partial<CadDxfPoint> | null = null;
  const xCodes = entityType === "MLINE" ? new Set([11, 10]) : new Set([10]);
  const yCodes = entityType === "MLINE" ? new Set([21, 20]) : new Set([20]);
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (xCodes.has(group.code)) {
      if (pending && isCompletePoint(pending)) {
        points.push(pending);
      }
      pending = { x: readNumber(group.value, 0) };
    } else if (yCodes.has(group.code) && pending) {
      pending.y = readNumber(group.value, 0);
    } else if ((group.code === 30 || group.code === 31) && pending) {
      pending.z = readNumber(group.value, 0);
    }
  });

  if (pending && isCompletePoint(pending)) {
    points.push(pending);
  }
  pushPolyline(state, context, entity, entityType, points);
  state.entityCount += 1;
  return endIndex;
}

/** 读取 RAY/XLINE 无限线，按有限参考线显示且不参与图纸 bounds。 */
function readInfiniteLineEntity(context: ParseContext, startIndex: number, state: ParseState, entityType: string): number {
  const entity = createEntityBase();
  let base: Partial<CadDxfPoint> = {};
  let direction: Partial<CadDxfPoint> = {};
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      base = { ...base, x: readNumber(group.value, 0) };
    } else if (group.code === 20) {
      base = { ...base, y: readNumber(group.value, 0) };
    } else if (group.code === 11) {
      direction = { ...direction, x: readNumber(group.value, 1) };
    } else if (group.code === 21) {
      direction = { ...direction, y: readNumber(group.value, 0) };
    }
  });

  if (isCompletePoint(base) && isCompletePoint(direction)) {
    const length = Math.hypot(direction.x, direction.y) || 1;
    const unit = { x: direction.x / length, y: direction.y / length };
    const start =
      entityType === "XLINE"
        ? { x: base.x - unit.x * NON_BOUNDING_REFERENCE_LENGTH, y: base.y - unit.y * NON_BOUNDING_REFERENCE_LENGTH }
        : base;
    const end = { x: base.x + unit.x * NON_BOUNDING_REFERENCE_LENGTH, y: base.y + unit.y * NON_BOUNDING_REFERENCE_LENGTH };
    pushPolyline(state, context, entity, entityType, [start, end], false, false);
    state.warnings.add(`${entityType} 为无限参考线，已按有限长度显示且不参与图纸尺寸计算。`);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 读取 INSERT 实体，并把对应 BLOCK 按位置、旋转和缩放展开到模型空间。 */
function readInsertEntity(context: ParseContext, startIndex: number, state: ParseState, blockStack: string[]): number {
  const entity: InsertEntity = {
    ...createEntityBase(),
    position: { x: 0, y: 0 },
    xScale: 1,
    yScale: 1,
    zScale: 1,
    rotationDegrees: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0
  };
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 2) {
      entity.blockName = normalizeCadName(group.value, "", 120);
    } else if (group.code === 10) {
      entity.position.x = readNumber(group.value, 0);
    } else if (group.code === 20) {
      entity.position.y = readNumber(group.value, 0);
    } else if (group.code === 30) {
      entity.position.z = readNumber(group.value, 0);
    } else if (group.code === 41) {
      entity.xScale = readNumber(group.value, 1);
    } else if (group.code === 42) {
      entity.yScale = readNumber(group.value, 1);
    } else if (group.code === 43) {
      entity.zScale = readNumber(group.value, 1);
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

  expandInsertEntity(context, state, entity, blockStack, "INSERT");
  state.entityCount += 1;
  return endIndex;
}

/** 读取 DIMENSION 实体并展开关联匿名块，保留尺寸标注文字和引线。 */
function readDimensionEntity(context: ParseContext, startIndex: number, state: ParseState, blockStack: string[]): number {
  const entity = createEntityBase();
  let blockName: string | undefined;
  const dimensionPoints = new Map<number, Partial<CadDxfPoint>>();
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 2) {
      blockName = normalizeCadName(group.value, "", 120);
    } else if (group.code >= 10 && group.code <= 16) {
      dimensionPoints.set(group.code, { ...(dimensionPoints.get(group.code) ?? {}), x: readNumber(group.value, 0) });
    } else if (group.code >= 20 && group.code <= 26) {
      const pointCode = group.code - 10;
      dimensionPoints.set(pointCode, { ...(dimensionPoints.get(pointCode) ?? {}), y: readNumber(group.value, 0) });
    } else if (group.code >= 30 && group.code <= 36) {
      const pointCode = group.code - 20;
      dimensionPoints.set(pointCode, { ...(dimensionPoints.get(pointCode) ?? {}), z: readNumber(group.value, 0) });
    }
  });

  const segmentCountBeforeBlock = state.segmentCount;
  if (blockName) {
    expandInsertEntity(
      context,
      state,
      {
        ...entity,
        blockName,
        position: { x: 0, y: 0 },
        xScale: 1,
        yScale: 1,
        zScale: 1,
        rotationDegrees: 0,
        columnCount: 1,
        rowCount: 1,
        columnSpacing: 0,
        rowSpacing: 0
      },
      blockStack,
      "DIMENSION"
    );
  }
  if (state.segmentCount === segmentCountBeforeBlock) {
    pushDimensionFallbackLines(state, context, entity, dimensionPoints);
  }
  state.entityCount += 1;
  return endIndex;
}

/** 在 DIMENSION 匿名块缺失时，用实体自身定义点生成尺寸线和引线近似，避免标注线整段丢失。 */
function pushDimensionFallbackLines(
  state: ParseState,
  context: ParseContext,
  entity: EntityBase,
  pointsByCode: Map<number, Partial<CadDxfPoint>>
): void {
  const segmentCountBeforeFallback = state.segmentCount;
  const points = new Map<number, CadDxfPoint>();
  pointsByCode.forEach((point, code) => {
    if (isCompletePoint(point)) {
      points.set(code, toWorldCadPoint(entity, point));
    }
  });

  const pushPair = (leftCode: number, rightCode: number) => {
    const left = points.get(leftCode);
    const right = points.get(rightCode);
    if (left && right) {
      pushPolyline(state, context, entity, "DIMENSION_FALLBACK", [left, right]);
    }
  };

  pushPair(13, 14);
  pushPair(10, 13);
  pushPair(10, 14);
  pushPair(15, 16);
  pushPair(10, 15);
  pushPair(10, 16);
  pushPair(10, 11);

  if (state.segmentCount === segmentCountBeforeFallback) {
    const ordered = [13, 14, 15, 16, 10, 11, 12].map((code) => points.get(code)).filter((point): point is CadDxfPoint => !!point);
    pushPolyline(state, context, entity, "DIMENSION_FALLBACK", removeSequentialDuplicatePoints(ordered));
  }
}

/** 读取 MLEADER/MULTILEADER 中可解析的顶点序列，至少保留引线折线。 */
function readMultiLeaderEntity(context: ParseContext, startIndex: number, state: ParseState, entityType: string): number {
  const entity = createEntityBase();
  const points: CadDxfPoint[] = [];
  let pending: Partial<CadDxfPoint> | null = null;
  const endIndex = walkEntityGroups(context.groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10 || group.code === 11) {
      if (pending && isCompletePoint(pending)) {
        points.push(toWorldCadPoint(entity, pending));
      }
      pending = { x: readNumber(group.value, 0) };
    } else if ((group.code === 20 || group.code === 21) && pending) {
      pending.y = readNumber(group.value, 0);
    } else if ((group.code === 30 || group.code === 31) && pending) {
      pending.z = readNumber(group.value, 0);
    }
  });

  if (pending && isCompletePoint(pending)) {
    points.push(toWorldCadPoint(entity, pending));
  }
  pushPolyline(state, context, entity, entityType, removeSequentialDuplicatePoints(points));
  state.entityCount += 1;
  return endIndex;
}

/** 处理暂不支持真实渲染的实体，确保 warning 精确说明原因。 */
function readUnsupportedEntity(context: ParseContext, startIndex: number, state: ParseState, type: string): number {
  if (isUnsupportedButVisibleEntity(type)) {
    state.warnings.add(`${type} 实体暂无法真实渲染，已跳过。`);
    state.entityCount += 1;
  }
  return walkEntityGroups(context.groups, startIndex, () => undefined);
}

/** 判断实体是否是可见但暂不实现的复杂对象。 */
function isUnsupportedButVisibleEntity(type: string): boolean {
  return [
    "ACAD_PROXY_ENTITY",
    "BODY",
    "REGION",
    "3DSOLID",
    "SURFACE",
    "MESH",
    "TOLERANCE",
    "SHAPE"
  ].includes(type);
}

/** 将 INSERT 的行列阵列和旋转缩放应用到块内 primitive。 */
function expandInsertEntity(
  context: ParseContext,
  state: ParseState,
  entity: InsertEntity,
  blockStack: string[],
  sourceEntityType: string
): void {
  const block = entity.blockName ? context.blocks.get(entity.blockName) : undefined;
  if (!block) {
    state.warnings.add(`找不到 ${sourceEntityType} 引用的块 ${entity.blockName ?? "(未命名)"}，已跳过。`);
    return;
  }

  if (!state.options.storePrimitives || state.options.lineTemplateOutput) {
    const blockTemplates = resolveBlockLineTemplates(context, block, state.warnings, blockStack);
    for (let rowIndex = 0; rowIndex < entity.rowCount; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < entity.columnCount; columnIndex += 1) {
        const transform: Transform2D = {
          position: {
            x: entity.position.x + columnIndex * entity.columnSpacing,
            y: entity.position.y + rowIndex * entity.rowSpacing,
            z: entity.position.z
          },
          basePoint: block.basePoint,
          xScale: entity.xScale,
          yScale: entity.yScale,
          zScale: entity.zScale,
          rotationDegrees: entity.rotationDegrees
        };
        blockTemplates.forEach((template) => emitTransformedBlockLineTemplate(state, context, template, transform, entity));
      }
    }
    return;
  }

  const blockPrimitives = resolveBlockPrimitives(context, block, state.warnings, blockStack);
  const batches = new Map<string, CadPolylineSegmentBatch>();
  for (let rowIndex = 0; rowIndex < entity.rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < entity.columnCount; columnIndex += 1) {
      const transform: Transform2D = {
        position: {
          x: entity.position.x + columnIndex * entity.columnSpacing,
          y: entity.position.y + rowIndex * entity.rowSpacing,
          z: entity.position.z
        },
        basePoint: block.basePoint,
        xScale: entity.xScale,
        yScale: entity.yScale,
        zScale: entity.zScale,
        rotationDegrees: entity.rotationDegrees
      };
      blockPrimitives.forEach((primitive) => {
        if (primitive.type === "polyline") {
          appendTransformedPolylineSegmentsToBatch(state, context, batches, primitive, transform, entity);
          return;
        }

        const transformed = transformPrimitiveForInsert(primitive, transform, entity, context);
        pushExpandedPrimitive(state, context, transformed, batches);
      });
    }
  }
  flushCadPolylineSegmentBatches(state, context, batches);
}

/** 将展开结果按样式分批写入，避免大量短线创建海量 primitive 对象导致 V8 堆内存溢出。 */
function pushExpandedPrimitive(
  state: ParseState,
  context: ParseContext,
  primitive: CadDxfPrimitive,
  batches: Map<string, CadPolylineSegmentBatch>
): void {
  if (primitive.type !== "polyline") {
    pushPrimitive(state, context, primitive);
    return;
  }

  appendPolylineSegmentsToBatch(state, context, batches, primitive);
}

/** 把实体解析出的折线追加到离散线段批次，适用于 HATCH pattern 等天然由短线组成的内容。 */
function appendEntityPolylineSegmentsToBatch(
  state: ParseState,
  context: ParseContext,
  batches: Map<string, CadPolylineSegmentBatch>,
  entity: EntityBase,
  entityType: string,
  points: CadDxfPoint[],
  closed = false,
  affectsBounds = true,
  disjoint = false
): void {
  const sanitized = sanitizePoints(points);
  if (Math.max(0, sanitized.length - 1) <= 0) {
    return;
  }

  appendPolylineSegmentsToBatch(state, context, batches, {
    type: "polyline",
    entityType,
    layer: entity.layer,
    color: DEFAULT_CAD_COLOR,
    alpha: 1,
    style: toCadDxfStyle(entity.style, entity.layer, context),
    points: sanitized,
    closed,
    affectsBounds,
    disjoint
  });
}

/** 对 INSERT 中的 polyline 逐段变换并直接写入批次，避免每个块实例先复制整条点数组。 */
function appendTransformedPolylineSegmentsToBatch(
  state: ParseState,
  context: ParseContext,
  batches: Map<string, CadPolylineSegmentBatch>,
  polyline: CadDxfPolyline,
  transform: Transform2D,
  insert: InsertEntity
): void {
  const base = createTransformedPrimitiveBase(polyline, insert, context);
  const template: CadDxfPolyline = {
    ...polyline,
    ...base,
    points: [],
    closed: false,
    disjoint: true,
    affectsBounds: polyline.affectsBounds
  };
  const key = getCadPolylineSegmentBatchKey(template);
  let batch = batches.get(key);
  if (!batch) {
    batch = { template, points: [], segmentCount: 0 };
    batches.set(key, batch);
  }

  const pushSegment = (start: CadDxfPoint, end: CadDxfPoint) => {
    batch.points.push(transformInsertPoint(start, transform), transformInsertPoint(end, transform));
    batch.segmentCount += 1;
    if (batch.segmentCount >= CAD_POLYLINE_BATCH_SEGMENTS) {
      flushCadPolylineSegmentBatch(state, context, batch);
    }
  };

  if (polyline.disjoint) {
    for (let index = 0; index + 1 < polyline.points.length; index += 2) {
      pushSegment(polyline.points[index], polyline.points[index + 1]);
    }
    return;
  }

  for (let index = 0; index + 1 < polyline.points.length; index += 1) {
    pushSegment(polyline.points[index], polyline.points[index + 1]);
  }
}

/** 把一条 polyline 拆成可独立渲染的线段对，视觉保持一致，同时显著降低块阵列展开的对象数量。 */
function appendPolylineSegmentsToBatch(
  state: ParseState,
  context: ParseContext,
  batches: Map<string, CadPolylineSegmentBatch>,
  polyline: CadDxfPolyline
): void {
  const key = getCadPolylineSegmentBatchKey(polyline);
  let batch = batches.get(key);
  if (!batch) {
    batch = { template: polyline, points: [], segmentCount: 0 };
    batches.set(key, batch);
  }

  const pushSegment = (start: CadDxfPoint, end: CadDxfPoint) => {
    batch.points.push({ ...start }, { ...end });
    batch.segmentCount += 1;
    if (batch.segmentCount >= CAD_POLYLINE_BATCH_SEGMENTS) {
      flushCadPolylineSegmentBatch(state, context, batch);
    }
  };

  if (polyline.disjoint) {
    for (let index = 0; index + 1 < polyline.points.length; index += 2) {
      pushSegment(polyline.points[index], polyline.points[index + 1]);
    }
    return;
  }

  for (let index = 0; index + 1 < polyline.points.length; index += 1) {
    pushSegment(polyline.points[index], polyline.points[index + 1]);
  }
}

/** 生成线段批次 key，只有显示样式和 bounds 行为相同的线段才会合并。 */
function getCadPolylineSegmentBatchKey(polyline: CadDxfPolyline): string {
  const style = polyline.style;
  return [
    polyline.entityType,
    polyline.layer,
    polyline.affectsBounds === false ? "0" : "1",
    style.colorIndex ?? "",
    style.trueColor ?? "",
    style.colorSource,
    style.lineWeight ?? "",
    style.lineType ?? "",
    style.transparency ?? ""
  ].join("\u0000");
}

/** 将所有线段批次写入主解析状态。 */
function flushCadPolylineSegmentBatches(state: ParseState, context: ParseContext, batches: Map<string, CadPolylineSegmentBatch>): void {
  batches.forEach((batch) => flushCadPolylineSegmentBatch(state, context, batch));
}

/** 写入单个线段批次并复用原有 pushPrimitive 统计、配色和 bounds 逻辑。 */
function flushCadPolylineSegmentBatch(state: ParseState, context: ParseContext, batch: CadPolylineSegmentBatch): void {
  if (batch.segmentCount <= 0 || batch.points.length < 2) {
    return;
  }

  pushPrimitive(state, context, {
    ...batch.template,
    points: batch.points,
    closed: false,
    disjoint: true
  });
  batch.points = [];
  batch.segmentCount = 0;
}

/** 解析并缓存块的紧凑线段模板，流式 CAD 导入不会再为 BLOCK 保留 primitive 对象数组。 */
function resolveBlockLineTemplates(
  context: ParseContext,
  block: CadBlockDefinition,
  warnings: Set<string>,
  blockStack: string[]
): CadBlockLineTemplate[] {
  if (block.lineTemplates) {
    return block.lineTemplates;
  }

  if (blockStack.length >= CAD_BLOCK_EXPANSION_MAX_DEPTH) {
    warnings.add(`BLOCK 嵌套深度超过 ${CAD_BLOCK_EXPANSION_MAX_DEPTH} 层，已停止展开 ${block.name} 以避免浏览器调用栈溢出。`);
    return [];
  }

  if (block.resolving || blockStack.includes(block.name)) {
    warnings.add(`检测到循环 BLOCK 引用 ${blockStack.length > 0 ? `${blockStack.join(" -> ")} -> ` : ""}${block.name}，已停止该分支展开。`);
    return [];
  }

  block.resolving = true;
  blockStack.push(block.name);
  try {
    const templateOutput: CadLineTemplateOutputState = { builders: new Map<string, CadBlockLineTemplateBuilder>(), templates: [] };
    const blockState = createParseState(`block-lines:${block.name}`, {
      storePrimitives: false,
      lineTemplateOutput: templateOutput
    });
    parseDxfEntitiesInRange(context, block.startIndex, block.endIndex, blockState, blockStack);
    flushCadLineTemplateOutput(templateOutput);
    blockState.warnings.forEach((warning) => warnings.add(warning));
    block.lineTemplates = templateOutput.templates;
    return block.lineTemplates;
  } finally {
    blockStack.pop();
    block.resolving = false;
  }
}

/** 解析并缓存块内容，递归块会记录告警并停止展开当前分支。 */
function resolveBlockPrimitives(
  context: ParseContext,
  block: CadBlockDefinition,
  warnings: Set<string>,
  blockStack: string[]
): CadDxfPrimitive[] {
  if (block.primitives) {
    return block.primitives;
  }

  if (blockStack.length >= CAD_BLOCK_EXPANSION_MAX_DEPTH) {
    warnings.add(`BLOCK 嵌套深度超过 ${CAD_BLOCK_EXPANSION_MAX_DEPTH} 层，已停止展开 ${block.name} 以避免浏览器调用栈溢出。`);
    return [];
  }

  if (block.resolving || blockStack.includes(block.name)) {
    warnings.add(`检测到循环 BLOCK 引用 ${blockStack.length > 0 ? `${blockStack.join(" -> ")} -> ` : ""}${block.name}，已停止该分支展开。`);
    return [];
  }

  block.resolving = true;
  blockStack.push(block.name);
  try {
    const blockState = createParseState(`block:${block.name}`);
    parseDxfEntitiesInRange(context, block.startIndex, block.endIndex, blockState, blockStack);
    blockState.warnings.forEach((warning) => warnings.add(warning));
    if (
      blockState.segmentCount <= CAD_BLOCK_CACHE_SEGMENT_LIMIT &&
      context.blockCacheSegmentCount + blockState.segmentCount <= CAD_BLOCK_CACHE_TOTAL_SEGMENT_LIMIT
    ) {
      block.primitives = blockState.primitives;
      context.blockCacheSegmentCount += blockState.segmentCount;
      return block.primitives;
    }

    return blockState.primitives;
  } finally {
    blockStack.pop();
    block.resolving = false;
  }
}

/** 将块内 primitive 变换到 INSERT 实例所在的模型空间坐标。 */
function transformPrimitiveForInsert(
  primitive: CadDxfPrimitive,
  transform: Transform2D,
  insert: InsertEntity,
  context: ParseContext
): CadDxfPrimitive {
  const base = createTransformedPrimitiveBase(primitive, insert, context);

  if (primitive.type === "polyline") {
    return {
      ...primitive,
      ...base,
      points: primitive.points.map((point) => transformInsertPoint(point, transform)),
      affectsBounds: primitive.affectsBounds
    };
  }

  if (primitive.type === "fill") {
    return {
      ...primitive,
      ...base,
      rings: primitive.rings.map((ring) => ring.map((point) => transformInsertPoint(point, transform)))
    };
  }

  if (primitive.type === "wipeout") {
    return {
      ...primitive,
      ...base,
      entityType: "WIPEOUT",
      ring: primitive.ring.map((point) => transformInsertPoint(point, transform))
    };
  }

  if (primitive.type === "text") {
    const scale = Math.max(Math.abs(transform.xScale), Math.abs(transform.yScale), Math.abs(transform.zScale));
    return {
      ...primitive,
      ...base,
      position: transformInsertPoint(primitive.position, transform),
      height: primitive.height * scale,
      rotationDegrees: primitive.rotationDegrees + transform.rotationDegrees,
      width: primitive.width === undefined ? undefined : primitive.width * scale
    };
  }

  if (primitive.type === "image") {
    return {
      ...primitive,
      ...base,
      entityType: "IMAGE",
      corners: primitive.corners.map((point) => transformInsertPoint(point, transform))
    };
  }

  return {
    ...primitive,
    ...base,
    point: transformInsertPoint(primitive.point, transform),
    size: primitive.size * Math.max(Math.abs(transform.xScale), Math.abs(transform.yScale), Math.abs(transform.zScale))
  };
}

/** 计算 INSERT 继承后的图层、颜色和样式，polyline 流式展开和普通 primitive 变换共用。 */
function createTransformedPrimitiveBase(
  primitive: CadLineStyleSource,
  insert: InsertEntity,
  context: ParseContext
): TransformedPrimitiveBase {
  const inheritedLayer = primitive.layer === DEFAULT_LAYER_NAME ? insert.layer : primitive.layer;
  const inheritedStyle = inheritBlockStyle(primitive.style, insert.style);
  return {
    entityType: primitive.entityType,
    layer: inheritedLayer,
    style: toCadDxfStyle(inheritedStyle, inheritedLayer, context, insert.style),
    color: resolveCadColor(inheritedStyle, inheritedLayer, context, insert.style),
    alpha: resolveCadAlpha(inheritedStyle)
  };
}

/** 继承 BYBLOCK 样式，其余样式保留块内实体原值。 */
function inheritBlockStyle(style: CadDxfStyle, insertStyle: RawCadStyle): RawCadStyle {
  if (style.colorIndex === 0 && !style.trueColor) {
    return { ...insertStyle, lineWeight: style.lineWeight ?? insertStyle.lineWeight, lineType: style.lineType ?? insertStyle.lineType };
  }

  return {
    colorIndex: style.colorIndex,
    trueColor: style.trueColor,
    transparency: style.transparency,
    lineWeight: style.lineWeight,
    lineType: style.lineType
  };
}

/** 将块内局部点变换到 INSERT 实例所在的模型空间坐标。 */
function transformInsertPoint(point: CadDxfPoint, transform: Transform2D): CadDxfPoint {
  const localX = (point.x - transform.basePoint.x) * transform.xScale;
  const localY = (point.y - transform.basePoint.y) * transform.yScale;
  const localZ = ((point.z ?? 0) - (transform.basePoint.z ?? 0)) * transform.zScale;
  const rotation = (transform.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: transform.position.x + localX * cos - localY * sin,
    y: transform.position.y + localX * sin + localY * cos,
    z: (transform.position.z ?? 0) + localZ
  };
}

/** 创建实体基础字段，默认图层为 0 且颜色按 BYLAYER 解析。 */
function createEntityBase(): EntityBase {
  return { layer: DEFAULT_LAYER_NAME, style: {} };
}

/** 读取实体通用字段：图层、ACI、true color、透明度、线宽和线型。 */
function applyEntityCommonGroup(group: DxfGroup, entity: EntityBase): void {
  if (group.code === 8 && group.value) {
    entity.layer = normalizeCadName(group.value, DEFAULT_LAYER_NAME, 80);
  } else if (group.code === 62) {
    entity.style.colorIndex = Math.trunc(readNumber(group.value, 256));
  } else if (group.code === 420) {
    entity.style.trueColor = trueColorToHex(readNumber(group.value, 0));
  } else if (group.code === 440) {
    entity.style.transparency = readNumber(group.value, 0);
  } else if (group.code === 370) {
    entity.style.lineWeight = readNumber(group.value, 0);
  } else if (group.code === 6) {
    entity.style.lineType = group.value;
  } else if (group.code === 38) {
    entity.elevation = readNumber(group.value, 0);
  } else if (group.code === 210) {
    entity.extrusion = { x: readNumber(group.value, 0), y: entity.extrusion?.y ?? 0, z: entity.extrusion?.z ?? 1 };
  } else if (group.code === 220) {
    entity.extrusion = { x: entity.extrusion?.x ?? 0, y: readNumber(group.value, 0), z: entity.extrusion?.z ?? 1 };
  } else if (group.code === 230) {
    entity.extrusion = { x: entity.extrusion?.x ?? 0, y: entity.extrusion?.y ?? 0, z: readNumber(group.value, 1) };
  }
}

/** 读取圆和圆弧共同使用的中心、半径和角度字段。 */
function readArcLikeEntity(groups: DxfGroup[], startIndex: number, entity: ArcEntity): number {
  return walkEntityGroups(groups, startIndex, (group) => {
    applyEntityCommonGroup(group, entity);
    if (group.code === 10) {
      entity.center = { x: readNumber(group.value, 0), y: entity.center?.y ?? 0 };
    } else if (group.code === 20) {
      entity.center = { x: entity.center?.x ?? 0, y: readNumber(group.value, 0) };
    } else if (group.code === 30) {
      entity.center = { x: entity.center?.x ?? 0, y: entity.center?.y ?? 0, z: readNumber(group.value, 0) };
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

/** 按圆弧参数生成采样点，单位仍为 DXF 原始坐标。 */
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
  return sampleArcByRadians(entity.center, entity.radius, (startAngle * Math.PI) / 180, (sweep * Math.PI) / 180, closed);
}

/** 按椭圆参数生成采样点。 */
function sampleEllipsePoints(entity: EllipseEntity): CadDxfPoint[] {
  if (!entity.center || !entity.majorAxis) {
    return [];
  }

  const ratio = entity.ratio ?? 1;
  const start = entity.startParameter ?? 0;
  let end = entity.endParameter ?? Math.PI * 2;
  if (end < start) {
    end += Math.PI * 2;
  }
  const sweep = end - start;
  const majorVector = { x: entity.majorAxis.x, y: entity.majorAxis.y, z: entity.majorAxis.z ?? 0 };
  const majorLength = Math.hypot(majorVector.x, majorVector.y, majorVector.z);
  const segmentCount = getCurveSegmentCount(majorLength, Math.abs(sweep));
  const normal = normalizeCadVector(entity.extrusion ?? DEFAULT_EXTRUSION);
  const minorDirection = normalizeCadVector(crossCadVector(normal, normalizeCadVector(majorVector)));
  const minorAxis = {
    x: minorDirection.x * majorLength * ratio,
    y: minorDirection.y * majorLength * ratio,
    z: minorDirection.z * majorLength * ratio
  };
  const points: CadDxfPoint[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const t = start + (sweep * index) / segmentCount;
    points.push({
      x: entity.center.x + majorVector.x * Math.cos(t) + minorAxis.x * Math.sin(t),
      y: entity.center.y + majorVector.y * Math.cos(t) + minorAxis.y * Math.sin(t),
      z: (entity.center.z ?? 0) + majorVector.z * Math.cos(t) + minorAxis.z * Math.sin(t)
    });
  }

  return points;
}

/** 用控制点生成一条 Catmull-Rom 近似曲线，避免 SPLINE 完全丢失。 */
function sampleControlPointCurve(points: CadDxfPoint[]): CadDxfPoint[] {
  if (points.length < 3) {
    return points;
  }

  const sampled: CadDxfPoint[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const segmentLength = distanceBetweenPoints(p1, p2);
    const steps = Math.max(4, Math.min(32, Math.ceil(segmentLength / Math.max(0.1, segmentLength / 12))));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      sampled.push({
        x: sampleCatmullRomCoordinate(p0.x, p1.x, p2.x, p3.x, t, t2, t3),
        y: sampleCatmullRomCoordinate(p0.y, p1.y, p2.y, p3.y, t, t2, t3),
        z: sampleCatmullRomCoordinate(p0.z ?? 0, p1.z ?? 0, p2.z ?? 0, p3.z ?? 0, t, t2, t3)
      });
    }
  }

  return sampled;
}

/** 采样单个 Catmull-Rom 坐标分量，SPLINE 的 x/y/z 共用同一曲线参数。 */
function sampleCatmullRomCoordinate(p0: number, p1: number, p2: number, p3: number, t: number, t2: number, t3: number): number {
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** 将带 bulge 的多段线顶点展开为显示点。 */
function polylineVerticesToPoints(vertices: PolylineVertex[], closed: boolean): CadDxfPoint[] {
  if (vertices.length < 2) {
    return vertices.map((vertex) => vertex.point);
  }

  const points: CadDxfPoint[] = [vertices[0].point];
  const segmentTotal = closed ? vertices.length : vertices.length - 1;
  for (let index = 0; index < segmentTotal; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const segmentPoints = current.bulge === 0 ? [current.point, next.point] : sampleBulgeSegment(current.point, next.point, current.bulge);
    segmentPoints.slice(1).forEach((point) => points.push(point));
  }

  return closePoints(points, closed);
}

/** 把 DXF bulge 圆弧段采样为折线点。 */
function sampleBulgeSegment(start: CadDxfPoint, end: CadDxfPoint, bulge: number): CadDxfPoint[] {
  const chord = distanceBetweenPoints(start, end);
  if (chord === 0 || bulge === 0) {
    return [start, end];
  }

  const sweep = 4 * Math.atan(bulge);
  const radius = Math.abs(chord / (2 * Math.sin(sweep / 2)));
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const normal = { x: -(end.y - start.y) / chord, y: (end.x - start.x) / chord };
  const centerDistance = radius * Math.cos(sweep / 2) * Math.sign(bulge);
  const center = { x: midpoint.x + normal.x * centerDistance, y: midpoint.y + normal.y * centerDistance };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  return sampleArcByRadians(center, radius, startAngle, sweep, false);
}

/** 按弧度采样圆弧，依据半径和弧长自适应段数。 */
function sampleArcByRadians(center: CadDxfPoint, radius: number, startAngle: number, sweep: number, closed: boolean): CadDxfPoint[] {
  const segmentCount = getCurveSegmentCount(radius, Math.abs(sweep || Math.PI * 2));
  const points: CadDxfPoint[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = startAngle + (sweep * index) / segmentCount;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, z: center.z });
  }

  return closed ? closePoints(points, true) : points;
}

/** 根据曲线尺寸计算采样段数，避免大圆过粗同时保留性能上限。 */
function getCurveSegmentCount(radius: number, sweepRadians: number): number {
  const safeRadius = Math.max(0.001, Math.abs(radius));
  const arcLength = safeRadius * Math.max(0.001, sweepRadians);
  const targetSegmentLength = Math.max(0.02, Math.min(safeRadius / 48, 0.5));
  return Math.min(ARC_MAX_SEGMENTS, Math.max(ARC_MIN_SEGMENTS, Math.ceil(arcLength / targetSegmentLength)));
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

/** 写入解析出的折线，不再做最大线段截断。 */
function pushPolyline(
  state: ParseState,
  context: ParseContext,
  entity: EntityBase,
  entityType: string,
  points: CadDxfPoint[],
  closed = false,
  affectsBounds = true
): void {
  const sanitized = sanitizePoints(points);
  const segmentCount = Math.max(0, sanitized.length - 1);
  if (segmentCount <= 0) {
    return;
  }

  pushPrimitive(state, context, {
    type: "polyline",
    entityType,
    layer: entity.layer,
    color: DEFAULT_CAD_COLOR,
    alpha: 1,
    style: toCadDxfStyle(entity.style, entity.layer, context),
    points: sanitized,
    closed,
    affectsBounds
  });
}

/** 写入解析出的填充面。 */
function pushFill(
  state: ParseState,
  context: ParseContext,
  entity: EntityBase,
  entityType: string,
  rings: CadDxfPoint[][],
  solid: boolean
): void {
  const sanitizedRings = rings.map((ring) => closePoints(sanitizePoints(ring), true)).filter((ring) => ring.length >= 4);
  if (sanitizedRings.length === 0) {
    return;
  }

  pushPrimitive(state, context, {
    type: "fill",
    entityType,
    layer: entity.layer,
    color: DEFAULT_CAD_COLOR,
    alpha: solid ? 0.72 : 0.28,
    style: toCadDxfStyle(entity.style, entity.layer, context),
    rings: sanitizedRings,
    solid
  });
}

/** 写入解析出的文字。 */
function pushText(
  state: ParseState,
  context: ParseContext,
  entity: EntityBase,
  entityType: string,
  text: string,
  position: CadDxfPoint,
  height: number,
  rotationDegrees: number,
  widthFactor: number,
  align?: CadDxfText["align"],
  width?: number
): void {
  pushPrimitive(state, context, {
    type: "text",
    entityType,
    layer: entity.layer,
    color: DEFAULT_CAD_COLOR,
    alpha: 1,
    style: toCadDxfStyle(entity.style, entity.layer, context),
    text,
    position,
    height,
    rotationDegrees,
    widthFactor,
    align,
    width
  });
}

/** 写入解析出的点。 */
function pushPoint(state: ParseState, context: ParseContext, entity: EntityBase, entityType: string, point: CadDxfPoint): void {
  pushPrimitive(state, context, {
    type: "point",
    entityType,
    layer: entity.layer,
    color: DEFAULT_CAD_COLOR,
    alpha: 1,
    style: toCadDxfStyle(entity.style, entity.layer, context),
    point,
    size: 0.35
  });
}

/** 线-only CAD 导入不渲染 IMAGE 栅格参照，也不让图片占位影响图纸 bounds。 */
function pushImage(state: ParseState, context: ParseContext, entity: ImageEntity): void {
  void state;
  void context;
  void entity;
}

/** 线-only CAD 导入不渲染 WIPEOUT 遮罩，避免非线内容覆盖或改变矢量线结果。 */
function pushWipeout(state: ParseState, context: ParseContext, entity: WipeoutEntity): void {
  void state;
  void context;
  void entity;
}

/** 写入任意 CAD primitive，并集中更新样式、图层、bounds 和统计。 */
function pushPrimitive(state: ParseState, context: ParseContext, primitive: CadDxfPrimitive): void {
  if (primitive.type !== "polyline") {
    return;
  }

  const color = resolveCadColor(primitive.style, primitive.layer, context);
  const alpha = resolveCadAlpha(primitive.style);
  const finalized = preparePrimitiveForParseState({ ...primitive, color, alpha } as CadDxfPrimitive, state);
  extend3dBoundsForPrimitive(state.bounds3d, finalized);
  if (state.options.storePrimitives) {
    state.primitives.push(finalized);
  }
  if (finalized.type === "polyline" && state.options.lineOutput) {
    emitCadLinePolyline(state.options.lineOutput, finalized);
  }
  if (finalized.type === "polyline" && state.options.lineTemplateOutput) {
    emitCadLineTemplatePolyline(state.options.lineTemplateOutput, finalized);
  }
  state.layers.add(finalized.layer || DEFAULT_LAYER_NAME);
  state.primitiveCounts[finalized.type] += 1;
  state.segmentCount += countPrimitiveSegments(finalized);
  extendBoundsForPrimitive(state.bounds, finalized);
  reportCadLineProgress(state);
}

/** 按解析状态对 primitive 做投影和单位缩放，旧数组模式保持原始对象以兼容既有逻辑。 */
function preparePrimitiveForParseState(primitive: CadDxfPrimitive, state: ParseState): CadDxfPrimitive {
  if (!state.options.projectionPlane && state.options.unitScaleToMeters === 1) {
    return primitive;
  }

  const clone = cloneCadPrimitive(primitive);
  if (state.options.projectionPlane && state.options.projectionPlane !== "XY") {
    forEachCadPrimitivePoint(clone, (point) => projectCadPointToPlane(point, state.options.projectionPlane as CadProjectionPlane));
  }
  if (state.options.unitScaleToMeters !== 1) {
    scaleCadPrimitiveInPlace(clone, state.options.unitScaleToMeters);
  }
  return clone;
}

/** 克隆单个 CAD primitive 的坐标数据，避免流式投影/缩放污染 BLOCK 模板缓存。 */
function cloneCadPrimitive(primitive: CadDxfPrimitive): CadDxfPrimitive {
  if (primitive.type === "polyline") {
    return { ...primitive, points: primitive.points.map((point) => ({ ...point })) };
  }
  if (primitive.type === "fill") {
    return { ...primitive, rings: primitive.rings.map((ring) => ring.map((point) => ({ ...point }))) };
  }
  if (primitive.type === "wipeout") {
    return { ...primitive, ring: primitive.ring.map((point) => ({ ...point })) };
  }
  if (primitive.type === "text") {
    return { ...primitive, position: { ...primitive.position } };
  }
  if (primitive.type === "image") {
    return { ...primitive, corners: primitive.corners.map((point) => ({ ...point })) };
  }
  return { ...primitive, point: { ...primitive.point } };
}

/** 扩展三维 bounds，投影前后的状态都用它判断是否有真实空间尺寸。 */
function extend3dBoundsForPrimitive(bounds: MutableBounds3d, primitive: CadDxfPrimitive): void {
  forEachCadPrimitivePoint(primitive, (point) => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.minZ = Math.min(bounds.minZ, point.z ?? 0);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
    bounds.maxZ = Math.max(bounds.maxZ, point.z ?? 0);
  });
}

/** 将 BLOCK 模板线段按 INSERT 变换后直接写入当前解析状态。 */
function emitTransformedBlockLineTemplate(
  state: ParseState,
  context: ParseContext,
  template: CadBlockLineTemplate,
  transform: Transform2D,
  insert: InsertEntity
): void {
  const base = createTransformedPrimitiveBase(template, insert, context);
  for (let offset = 0; offset + 5 < template.coordinates.length; offset += 6) {
    const start = transformInsertPoint(
      {
        x: template.coordinates[offset],
        y: template.coordinates[offset + 1],
        z: template.coordinates[offset + 2]
      },
      transform
    );
    const end = transformInsertPoint(
      {
        x: template.coordinates[offset + 3],
        y: template.coordinates[offset + 4],
        z: template.coordinates[offset + 5]
      },
      transform
    );
    pushCadLineSegmentToState(state, context, base, start, end, template.affectsBounds);
  }
}

/** 直接写入一条 CAD 线段，供二进制 BLOCK 模板和流式输出复用。 */
function pushCadLineSegmentToState(
  state: ParseState,
  context: ParseContext,
  line: CadLineStyleSource,
  start: CadDxfPoint,
  end: CadDxfPoint,
  affectsBounds = true
): void {
  if (!isCompletePoint(start) || !isCompletePoint(end) || (start.x === end.x && start.y === end.y && (start.z ?? 0) === (end.z ?? 0))) {
    return;
  }

  extend3dBoundsForLineSegment(state.bounds3d, start, end);
  const preparedStart = prepareCadPointForParseState(start, state);
  const preparedEnd = prepareCadPointForParseState(end, state);
  const preparedLine: CadLineStyleSource = {
    entityType: line.entityType,
    layer: line.layer,
    color: line.color,
    alpha: line.alpha,
    style: line.style,
    affectsBounds
  };

  if (state.options.lineOutput) {
    emitCadLineOutputSegment(state.options.lineOutput, preparedLine, preparedStart, preparedEnd);
  }
  if (state.options.lineTemplateOutput) {
    emitCadLineTemplateSegment(state.options.lineTemplateOutput, preparedLine, preparedStart, preparedEnd);
  }
  if (state.options.storePrimitives) {
    state.primitives.push({
      type: "polyline",
      entityType: preparedLine.entityType,
      layer: preparedLine.layer,
      color: preparedLine.color,
      alpha: preparedLine.alpha,
      style: preparedLine.style,
      points: [preparedStart, preparedEnd],
      affectsBounds
    });
  }

  state.layers.add(preparedLine.layer || DEFAULT_LAYER_NAME);
  state.primitiveCounts.polyline += 1;
  state.segmentCount += 1;
  if (affectsBounds !== false) {
    extendBounds(state.bounds, preparedStart);
    extendBounds(state.bounds, preparedEnd);
  }
  reportCadLineProgress(state);
}

/** 按实体数节流上报 CAD 测量进度，避免 Worker 消息淹没主线程。 */
function reportCadParseProgress(state: ParseState): void {
  const progress = state.options.progress;
  if (!progress?.sink.reportProgress) {
    return;
  }

  const entityDelta = state.entityCount - progress.lastReportedEntities;
  const segmentDelta = state.segmentCount - progress.lastReportedSegments;
  if (entityDelta < 1000 && segmentDelta < 5000) {
    return;
  }

  progress.lastReportedEntities = state.entityCount;
  progress.lastReportedSegments = state.segmentCount;
  progress.sink.reportProgress({
    phase: progress.phase,
    parsedEntities: state.entityCount,
    emittedSegments: state.segmentCount,
    totalEntities: progress.totalEntities,
    totalSegments: progress.totalSegments,
    message: progress.phase === "measuring" ? "正在测量 CAD 图纸内容" : undefined
  });
}

/** 按实体数和线段数节流上报 CAD 线段输出进度，避免 Worker 消息淹没主线程。 */
function reportCadLineProgress(state: ParseState): void {
  const output = state.options.lineOutput;
  if (!output?.sink.reportProgress) {
    return;
  }

  const entityDelta = state.entityCount - output.lastReportedEntities;
  const segmentDelta = output.emittedSegments - output.lastReportedSegments;
  if (entityDelta < 1000 && segmentDelta < 5000) {
    return;
  }

  output.lastReportedEntities = state.entityCount;
  output.lastReportedSegments = output.emittedSegments;
  output.sink.reportProgress({
    phase: "emitting",
    parsedEntities: state.entityCount,
    emittedSegments: output.emittedSegments,
    totalEntities: output.totalEntities,
    totalSegments: output.totalSegments,
    chunkCount: output.chunkIndex,
    message: "正在输出 CAD 线段"
  });
}

/** 对单个点执行当前解析状态要求的投影和单位缩放。 */
function prepareCadPointForParseState(point: CadDxfPoint, state: ParseState): CadDxfPoint {
  const prepared = { ...point };
  if (state.options.projectionPlane && state.options.projectionPlane !== "XY") {
    projectCadPointToPlane(prepared, state.options.projectionPlane);
  }
  if (state.options.unitScaleToMeters !== 1) {
    scalePointInPlace(prepared, state.options.unitScaleToMeters);
  }
  return prepared;
}

/** 扩展三维线段范围，用于流式测量阶段选择最佳投影平面。 */
function extend3dBoundsForLineSegment(bounds: MutableBounds3d, start: CadDxfPoint, end: CadDxfPoint): void {
  [start, end].forEach((point) => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.minZ = Math.min(bounds.minZ, point.z ?? 0);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
    bounds.maxZ = Math.max(bounds.maxZ, point.z ?? 0);
  });
}

/** 将流式 polyline 拆成线段写入二进制 chunk。 */
function emitCadLinePolyline(output: CadLineOutputState, polyline: CadDxfPolyline): void {
  const pushSegment = (start: CadDxfPoint, end: CadDxfPoint) => emitCadLineOutputSegment(output, polyline, start, end);
  if (polyline.disjoint) {
    for (let index = 0; index + 1 < polyline.points.length; index += 2) {
      pushSegment(polyline.points[index], polyline.points[index + 1]);
    }
    return;
  }

  for (let index = 0; index + 1 < polyline.points.length; index += 1) {
    pushSegment(polyline.points[index], polyline.points[index + 1]);
  }
}

/** 将 polyline 写入 BLOCK 本地线段模板。 */
function emitCadLineTemplatePolyline(output: CadLineTemplateOutputState, polyline: CadDxfPolyline): void {
  const pushSegment = (start: CadDxfPoint, end: CadDxfPoint) => emitCadLineTemplateSegment(output, polyline, start, end);
  if (polyline.disjoint) {
    for (let index = 0; index + 1 < polyline.points.length; index += 2) {
      pushSegment(polyline.points[index], polyline.points[index + 1]);
    }
    return;
  }

  for (let index = 0; index + 1 < polyline.points.length; index += 1) {
    pushSegment(polyline.points[index], polyline.points[index + 1]);
  }
}

/** 写入一条已经归一化的线段到主 CAD 二进制 chunk。 */
function emitCadLineOutputSegment(output: CadLineOutputState, line: CadLineStyleSource, start: CadDxfPoint, end: CadDxfPoint): void {
  const builder = getCadLineChunkBuilder(output, line);
  emitCadLineSegment(output, builder, start, end);
}

/** 获取同样式的 chunk builder，达到上限后会自动 flush 成 transferable buffer。 */
function getCadLineChunkBuilder(output: CadLineOutputState, line: CadLineStyleSource): CadLineChunkBuilder {
  const key = getCadLineStyleKey(line);
  let builder = output.builders.get(key);
  if (!builder) {
    builder = {
      style: {
        layer: line.layer,
        color: line.color,
        alpha: line.alpha,
        entityType: line.entityType,
        style: line.style
      },
      positions: new Float32Array(CAD_STREAM_CHUNK_SEGMENTS * 2 * 3),
      segmentCount: 0,
      offset: 0,
      bounds: createMutableBounds()
    };
    output.builders.set(key, builder);
  }
  return builder;
}

/** 写入一条 BLOCK 本地线段模板，坐标仍是块局部原始单位。 */
function emitCadLineTemplateSegment(output: CadLineTemplateOutputState, line: CadLineStyleSource, start: CadDxfPoint, end: CadDxfPoint): void {
  if (start.x === end.x && start.y === end.y && (start.z ?? 0) === (end.z ?? 0)) {
    return;
  }

  const builder = getCadLineTemplateBuilder(output, line);
  builder.coordinates.push(start.x, start.y, start.z ?? 0, end.x, end.y, end.z ?? 0);
  builder.segmentCount += 1;
  if (builder.segmentCount >= CAD_BLOCK_TEMPLATE_CHUNK_SEGMENTS) {
    flushCadLineTemplateBuilder(output, builder, true);
  }
}

/** 获取同样式的 BLOCK 模板 builder，按固定线段数分块减少单数组峰值。 */
function getCadLineTemplateBuilder(output: CadLineTemplateOutputState, line: CadLineStyleSource): CadBlockLineTemplateBuilder {
  const key = getCadLineStyleKey(line);
  let builder = output.builders.get(key);
  if (!builder) {
    builder = {
      entityType: line.entityType,
      layer: line.layer,
      color: line.color,
      alpha: line.alpha,
      style: line.style,
      affectsBounds: line.affectsBounds,
      coordinates: [],
      segmentCount: 0
    };
    output.builders.set(key, builder);
  }
  return builder;
}

/** 写入单条线段到 chunk，坐标已经按米制和最佳投影归一。 */
function emitCadLineSegment(output: CadLineOutputState, builder: CadLineChunkBuilder, start: CadDxfPoint, end: CadDxfPoint): void {
  if (start.x === end.x && start.y === end.y) {
    return;
  }
  if (builder.segmentCount >= CAD_STREAM_CHUNK_SEGMENTS) {
    flushCadLineChunkBuilder(output, builder, true);
  }

  builder.positions[builder.offset] = start.x - output.bounds.centerX;
  builder.positions[builder.offset + 1] = 0;
  builder.positions[builder.offset + 2] = -(start.y - output.bounds.centerY);
  builder.positions[builder.offset + 3] = end.x - output.bounds.centerX;
  builder.positions[builder.offset + 4] = 0;
  builder.positions[builder.offset + 5] = -(end.y - output.bounds.centerY);
  builder.offset += 6;
  builder.segmentCount += 1;
  output.emittedSegments += 1;
  extendBounds(builder.bounds, start);
  extendBounds(builder.bounds, end);

  if (builder.segmentCount >= CAD_STREAM_CHUNK_SEGMENTS) {
    flushCadLineChunkBuilder(output, builder, true);
  }
}

/** 刷出所有未满的二进制线段 chunk。 */
function flushCadLineOutput(state: ParseState): void {
  const output = state.options.lineOutput;
  if (!output) {
    return;
  }
  output.builders.forEach((builder) => flushCadLineChunkBuilder(output, builder, false));
}

/** 刷出所有未满的 BLOCK 本地线段模板。 */
function flushCadLineTemplateOutput(output: CadLineTemplateOutputState): void {
  output.builders.forEach((builder) => flushCadLineTemplateBuilder(output, builder, false));
}

/** 将一个 builder 当前内容提交给 sink，并根据后续是否继续写入决定是否复用缓冲。 */
function flushCadLineChunkBuilder(output: CadLineOutputState, builder: CadLineChunkBuilder, keepBuffer: boolean): void {
  if (builder.segmentCount === 0) {
    if (!keepBuffer) {
      builder.positions = new Float32Array(0);
    }
    return;
  }

  const positions = builder.segmentCount === CAD_STREAM_CHUNK_SEGMENTS ? builder.positions : builder.positions.slice(0, builder.offset);
  const chunkId = `cad-line-${output.chunkIndex}`;
  output.sink.emitChunk({
    chunkId,
    style: builder.style,
    segmentCount: builder.segmentCount,
    positions,
    bounds: createBounds(builder.bounds)
  });
  output.chunkIndex += 1;
  builder.positions = keepBuffer ? new Float32Array(CAD_STREAM_CHUNK_SEGMENTS * 2 * 3) : new Float32Array(0);
  builder.segmentCount = 0;
  builder.offset = 0;
  builder.bounds = createMutableBounds();
}

/** 将 BLOCK 模板 builder 刷成紧凑 Float64Array，后续 INSERT 可直接矩阵变换。 */
function flushCadLineTemplateBuilder(output: CadLineTemplateOutputState, builder: CadBlockLineTemplateBuilder, keepBuilder: boolean): void {
  if (builder.segmentCount > 0) {
    output.templates.push({
      entityType: builder.entityType,
      layer: builder.layer,
      color: builder.color,
      alpha: builder.alpha,
      style: builder.style,
      affectsBounds: builder.affectsBounds,
      coordinates: new Float64Array(builder.coordinates),
      segmentCount: builder.segmentCount
    });
  }

  builder.coordinates = keepBuilder ? [] : [];
  builder.segmentCount = 0;
}

/** 构造线段样式 key，同样式线段会进入同一个二进制 chunk 或 BLOCK 模板块。 */
function getCadLineStyleKey(line: CadLineStyleSource): string {
  return `${line.layer}\u0000${line.color}\u0000${line.alpha}\u0000${line.entityType}`;
}

/** 将原始 DXF 样式整理成公开 metadata 可保存的样式。 */
function toCadDxfStyle(style: RawCadStyle | CadDxfStyle, layer: string, context: ParseContext, blockStyle?: RawCadStyle): CadDxfStyle {
  const rawStyle = style as RawCadStyle;
  const colorIndex = rawStyle.colorIndex;
  const trueColor = rawStyle.trueColor;
  let colorSource: CadDxfStyle["colorSource"] = "default";
  if (trueColor) {
    colorSource = "entityTrueColor";
  } else if (colorIndex !== undefined && colorIndex !== 256 && colorIndex !== 0) {
    colorSource = "entityAci";
  } else if (colorIndex === 0 && blockStyle) {
    colorSource = "block";
  } else if (context.layers.has(layer)) {
    colorSource = "layer";
  }

  return {
    colorIndex,
    trueColor,
    colorSource,
    lineWeight: rawStyle.lineWeight,
    lineType: rawStyle.lineType,
    transparency: rawStyle.transparency
  };
}

/** 解析实体最终显示颜色，优先 true color，其次 ACI，再走 BYLAYER/BYBLOCK。 */
function resolveCadColor(style: RawCadStyle | CadDxfStyle, layer: string, context: ParseContext, blockStyle?: RawCadStyle): string {
  if (style.trueColor) {
    return style.trueColor;
  }

  const colorIndex = style.colorIndex;
  if (colorIndex === 0 && blockStyle) {
    return resolveCadColor(blockStyle, layer, context);
  }

  if (colorIndex !== undefined && colorIndex !== 256 && colorIndex !== 0) {
    return aciToHex(Math.abs(colorIndex));
  }

  const layerInfo = context.layers.get(layer);
  if (layerInfo?.trueColor) {
    return layerInfo.trueColor;
  }

  if (layerInfo?.colorIndex !== undefined) {
    return aciToHex(Math.abs(layerInfo.colorIndex));
  }

  return DEFAULT_CAD_COLOR;
}

/** 将 DXF 透明度转成 Babylon 可用 alpha。 */
function resolveCadAlpha(style: RawCadStyle | CadDxfStyle): number {
  if (style.transparency === undefined || style.transparency <= 0) {
    return 1;
  }

  const raw = Math.max(0, Math.min(255, style.transparency & 0xff));
  return Math.max(0.08, Math.min(1, 1 - raw / 255));
}

/** 计算 primitive 线段数量，用于 metadata 和性能观察。 */
function countPrimitiveSegments(primitive: CadDxfPrimitive): number {
  if (primitive.type === "polyline") {
    if (primitive.disjoint) {
      return Math.floor(primitive.points.length / 2);
    }
    return Math.max(0, primitive.points.length - 1);
  }

  if (primitive.type === "fill") {
    return primitive.rings.reduce((total, ring) => total + Math.max(0, ring.length - 1), 0);
  }

  if (primitive.type === "wipeout") {
    return Math.max(0, primitive.ring.length - 1);
  }

  if (primitive.type === "image") {
    return 4;
  }

  return primitive.type === "point" ? 2 : 0;
}

/** 扩展 CAD 图纸边界。 */
function extendBounds(bounds: MutableBounds, point: CadDxfPoint): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

/** 按 primitive 类型扩展 bounds，文字按近似外接框计算。 */
function extendBoundsForPrimitive(bounds: MutableBounds, primitive: CadDxfPrimitive): void {
  if (primitive.type === "polyline") {
    if (primitive.affectsBounds === false) {
      return;
    }
    primitive.points.forEach((point) => extendBounds(bounds, point));
    return;
  }

  if (primitive.type === "fill") {
    primitive.rings.flat().forEach((point) => extendBounds(bounds, point));
    return;
  }

  if (primitive.type === "wipeout") {
    primitive.ring.forEach((point) => extendBounds(bounds, point));
    return;
  }

  if (primitive.type === "text") {
    getTextBoundsPoints(primitive).forEach((point) => extendBounds(bounds, point));
    return;
  }

  if (primitive.type === "image") {
    primitive.corners.forEach((point) => extendBounds(bounds, point));
    return;
  }

  extendBounds(bounds, primitive.point);
}

/** 根据文字高度和文本长度估算文字 primitive 的二维范围。 */
function getTextBoundsPoints(text: CadDxfText): CadDxfPoint[] {
  const width = text.width && text.width > 0 ? text.width : Math.max(text.height, text.text.length * text.height * text.widthFactor * 0.62);
  const height = text.height;
  const anchorOffset = text.align === "center" ? -width / 2 : text.align === "right" ? -width : 0;
  const corners = [
    { x: anchorOffset, y: 0 },
    { x: anchorOffset + width, y: 0 },
    { x: anchorOffset + width, y: height },
    { x: anchorOffset, y: height }
  ];
  const rotation = (text.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return corners.map((corner) => ({
    x: text.position.x + corner.x * cos - corner.y * sin,
    y: text.position.y + corner.x * sin + corner.y * cos
  }));
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

/** 判断点是否同时包含有限 x/y。 */
function isCompletePoint(point: Partial<CadDxfPoint>): point is CadDxfPoint {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** 过滤非法点，防止 NaN 坐标进入 Babylon。 */
function sanitizePoints(points: CadDxfPoint[]): CadDxfPoint[] {
  return points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

/** 去掉 SOLID/3DFACE 中重复的末尾点。 */
function removeDuplicateClosingPoints(points: CadDxfPoint[]): CadDxfPoint[] {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const previous = points[index - 1];
    return previous.x !== point.x || previous.y !== point.y || (previous.z ?? 0) !== (point.z ?? 0);
  });
}

/** 去掉连续重复点，避免 fallback 线段生成零长度片段。 */
function removeSequentialDuplicatePoints(points: CadDxfPoint[]): CadDxfPoint[] {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }
    const previous = points[index - 1];
    return previous.x !== point.x || previous.y !== point.y || (previous.z ?? 0) !== (point.z ?? 0);
  });
}

/** 计算两个点的三维距离，供 XZ/YZ 平面曲线采样使用。 */
function distanceBetweenPoints(left: CadDxfPoint, right: CadDxfPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y, (right.z ?? 0) - (left.z ?? 0));
}

/** 将 DXF true color 整数转为十六进制颜色。 */
function trueColorToHex(value: number): string {
  const integer = Math.max(0, Math.trunc(value));
  const red = (integer >> 16) & 0xff;
  const green = (integer >> 8) & 0xff;
  const blue = integer & 0xff;
  return rgbToHex(red, green, blue);
}

/** 将 ACI 颜色转成接近 AutoCAD 深色背景的显示色。 */
function aciToHex(index: number): string {
  const common: Record<number, string> = {
    0: DEFAULT_CAD_COLOR,
    1: "#ff2b2b",
    2: "#ffff00",
    3: "#00ff00",
    4: "#00ffff",
    5: "#2f5bff",
    6: "#ff00ff",
    7: "#ffffff",
    8: "#808080",
    9: "#c0c0c0"
  };
  if (common[index]) {
    return common[index];
  }

  const hue = ((index * 47) % 360) / 360;
  const { r, g, b } = hslToRgb(hue, 0.82, 0.58);
  return rgbToHex(r, g, b);
}

/** HSL 转 RGB，用于补齐非常见 ACI 调色板。 */
function hslToRgb(hue: number, saturation: number, lightness: number): { r: number; g: number; b: number } {
  const convert = (p: number, q: number, t: number) => {
    let next = t;
    if (next < 0) {
      next += 1;
    }
    if (next > 1) {
      next -= 1;
    }
    if (next < 1 / 6) {
      return p + (q - p) * 6 * next;
    }
    if (next < 1 / 2) {
      return q;
    }
    if (next < 2 / 3) {
      return p + (q - p) * (2 / 3 - next) * 6;
    }
    return p;
  };

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    r: Math.round(convert(p, q, hue + 1 / 3) * 255),
    g: Math.round(convert(p, q, hue) * 255),
    b: Math.round(convert(p, q, hue - 1 / 3) * 255)
  };
}

/** RGB 分量转十六进制颜色。 */
function rgbToHex(red: number, green: number, blue: number): string {
  const toHex = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/** 清理 TEXT/MTEXT 中常见 DXF 控制符，保留中文和普通标注内容。 */
function decodeCadText(value: string): string {
  return value
    .replace(/%%c/gi, "直径")
    .replace(/%%d/gi, "°")
    .replace(/%%p/gi, "±")
    .replace(/\\P/g, "\n")
    .replace(/\\~|~/g, " ")
    .replace(/\\[AaCcFfHhQqTtWw][^;]*;/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

/** 清理来自 DXF 的名称字段，避免超长或控制字符污染节点名称。 */
function normalizeCadName(value: string, fallback: string, maxLength: number): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}
