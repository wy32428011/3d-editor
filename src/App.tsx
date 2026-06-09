import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AssetBrowser } from "./components/AssetBrowser";
import { HierarchyPanel, type HierarchyExpansionCommand } from "./components/HierarchyPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { ProjectLauncher } from "./components/ProjectLauncher";
import { Toolbar } from "./components/Toolbar";
import { ViewportCanvas } from "./components/ViewportCanvas";
import type { CadDxfLineProgress } from "./editor/cadDxf";
import {
  inferDynamicParameterUnit,
  normalizeDynamicParameterUnit,
  withInferredDynamicParameterUnit
} from "./editor/dynamicParameterUnits";
import { parseModelPackageDataDriven } from "./editor/modelPackageDataDriven";
import {
  hasModelPackageVisibleDecorators,
  parseModelPackageDecorators,
  parseModelPackageDefaultExportClassName
} from "./editor/modelPackageDecorators";
import { DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS } from "./editor/modelPackageRuntimeCompiler";
import { DEFAULT_SCENE_ENVIRONMENT_COLOR, type BabylonEditorEngine } from "./engine/BabylonEditorEngine";
import { DEFAULT_SCENE_DATA_DRIVEN } from "./types/editor";
import type {
  AssetRecord,
  AssetLibraryFocusTarget,
  Color3Snapshot,
  DynamicInspectorField,
  DynamicInspectorFieldKind,
  DynamicParameterValue,
  EditorEngineCallbacks,
  EditorStats,
  EditorTool,
  InspectorTarget,
  ModelArrayAxis,
  ModelDataDrivenDefinition,
  ModelPackageManifest,
  ModelPackageProjectFile,
  PrimitiveKind,
  SceneDataDrivenSnapshot,
  SceneInspectorUpdate,
  SceneNodeKind,
  SceneNodeSummary,
  TransformSnapshot,
  TransformUpdate
} from "./types/editor";

interface PersistedProjectAssetFiles {
  projectFiles: Map<File, string>;
  failedFiles: Set<File>;
}

interface ModelPackageRuntimeScriptSelection {
  scriptFile?: string;
  className: string;
}

interface ModelArrayContextTarget {
  id: number;
  name: string;
  kind: SceneNodeKind;
  locked: boolean;
}

interface SceneContextMenuTarget extends ModelArrayContextTarget {
  visible: boolean;
  selfLocked: boolean;
  lockedByAncestor: boolean;
  hasChildren: boolean;
  parentId?: number;
}

interface SceneContextMenuState {
  target: SceneContextMenuTarget | null;
  x: number;
  y: number;
}

type AssetLibraryFocusCommand = AssetLibraryFocusTarget & { token: number };

interface ModelArrayDialogState {
  target: ModelArrayContextTarget;
  axis: ModelArrayAxis;
  count: string;
  spacing: string;
}

const initialStats: EditorStats = {
  fps: 0,
  meshes: 0,
  activeMeshes: 0,
  vertices: 0,
  drawCalls: 0,
  hardwareScalingLevel: 1,
  renderWidth: 0,
  renderHeight: 0,
  gpuVendor: "未知 GPU",
  gpuRenderer: "未知渲染器",
  contextLost: false
};

const ASSET_BROWSER_HEIGHT_STORAGE_KEY = "babylon-editor.assetBrowserHeight";
const DEFAULT_ASSET_BROWSER_HEIGHT = 190;
const MIN_ASSET_BROWSER_HEIGHT = 132;
const MAX_ASSET_BROWSER_HEIGHT = 420;
const MAX_ASSET_BROWSER_HEIGHT_RATIO = 0.45;
const MODEL_ARRAY_DEFAULT_AXIS: ModelArrayAxis = "x";
const MODEL_ARRAY_DEFAULT_COUNT = "3";
const MODEL_ARRAY_DEFAULT_SPACING = "1";
const SCENE_CONTEXT_MENU_WIDTH = 220;
const SCENE_CONTEXT_MENU_HEIGHT = 420;

/** 统一提取异常消息，兼容 Babylon 以字符串抛错的情况。 */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

/** 计算资源库当前允许的最大高度，避免底部面板压没主视口。 */
function getAssetBrowserMaxHeight(): number {
  if (typeof window === "undefined") {
    return MAX_ASSET_BROWSER_HEIGHT;
  }

  return Math.max(
    MIN_ASSET_BROWSER_HEIGHT,
    Math.min(MAX_ASSET_BROWSER_HEIGHT, Math.floor(window.innerHeight * MAX_ASSET_BROWSER_HEIGHT_RATIO))
  );
}

/** 把资源库高度限制在当前视口允许范围内。 */
function clampAssetBrowserHeight(height: number): number {
  if (!Number.isFinite(height)) {
    return DEFAULT_ASSET_BROWSER_HEIGHT;
  }

  return Math.round(Math.min(getAssetBrowserMaxHeight(), Math.max(MIN_ASSET_BROWSER_HEIGHT, height)));
}

/** 读取用户上次拖拽后的资源库高度，读取失败时回到默认值。 */
function readStoredAssetBrowserHeight(): number {
  if (typeof window === "undefined") {
    return DEFAULT_ASSET_BROWSER_HEIGHT;
  }

  try {
    const stored = window.localStorage.getItem(ASSET_BROWSER_HEIGHT_STORAGE_KEY);
    return stored ? clampAssetBrowserHeight(Number(stored)) : clampAssetBrowserHeight(DEFAULT_ASSET_BROWSER_HEIGHT);
  } catch {
    return clampAssetBrowserHeight(DEFAULT_ASSET_BROWSER_HEIGHT);
  }
}

/** 判断 UI 侧是否展示模型阵列入口，最终权限仍由 Babylon 引擎兜底校验。 */
function canOpenModelArrayMenu(target: ModelArrayContextTarget): boolean {
  return !target.locked && (target.kind === "Mesh" || target.kind === "Transform");
}

/** 把右键菜单限制在视口内，避免靠近窗口边缘时菜单不可点。 */
function clampSceneContextMenuPosition(point: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === "undefined") {
    return point;
  }

  return {
    x: Math.max(8, Math.min(point.x, window.innerWidth - SCENE_CONTEXT_MENU_WIDTH - 8)),
    y: Math.max(8, Math.min(point.y, window.innerHeight - SCENE_CONTEXT_MENU_HEIGHT - 8))
  };
}

/** 从层级树节点生成右键菜单目标，避免 App 直接依赖完整树节点结构。 */
function createSceneContextTargetFromSceneNode(node: SceneNodeSummary): SceneContextMenuTarget {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    locked: node.locked,
    visible: node.visible,
    selfLocked: node.selfLocked,
    lockedByAncestor: node.lockedByAncestor,
    hasChildren: node.hasChildren,
    parentId: node.parentId
  };
}

/** 从引擎选中快照生成右键菜单目标，视口右键和层级树右键共用同一弹窗。 */
function createSceneContextTargetFromTransformSnapshot(snapshot: TransformSnapshot): SceneContextMenuTarget {
  return {
    id: snapshot.id,
    name: snapshot.name,
    kind: snapshot.kind,
    locked: snapshot.locked,
    visible: snapshot.visible,
    selfLocked: snapshot.selfLocked,
    lockedByAncestor: snapshot.lockedByAncestor,
    hasChildren: snapshot.hasChildren,
    parentId: snapshot.parentId
  };
}

/** 收敛阵列轴向下拉值，避免 DOM 字符串越过类型约束。 */
function readModelArrayAxis(value: string): ModelArrayAxis {
  return value === "-x" || value === "z" || value === "-z" ? value : "x";
}

/** 根据文件名推断基础 MIME，供从项目资产恢复 File 对象时使用。 */
function getProjectAssetMimeType(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".babylon": "application/json",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".ktx": "image/ktx",
    ".ktx2": "image/ktx2",
    ".obj": "model/obj",
    ".png": "image/png",
    ".stl": "model/stl",
    ".webp": "image/webp"
  };
  return mimeTypes[extension] ?? "application/octet-stream";
}

/** 生成与 Babylon 引擎一致的资产编号，便于项目资产文件和资产记录互相定位。 */
function getFileAssetId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/** 为 CAD 二进制线段侧车文件生成独立资产目录，避免和原 DXF 源文件混放。 */
function createCadLineAssetId(file: File): string {
  const randomId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `cad-lines-${file.name}-${file.size}-${file.lastModified}-${randomId}`;
}

/** 格式化进度计数，CAD 大图纸常见百万级线段，必须保持可读。 */
function formatCadProgressCount(value: number | undefined): string {
  return Math.max(0, Math.trunc(value ?? 0)).toLocaleString("zh-CN");
}

/** 计算当前 CAD 阶段的百分比，未知总量时返回 null 让 UI 显示不确定进度。 */
function getCadImportProgressPercent(progress: CadDxfLineProgress | null): number | null {
  if (!progress) {
    return null;
  }

  if (progress.phase === "done") {
    return 100;
  }

  if (progress.phase === "reading" && progress.totalBytes && progress.totalBytes > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.loadedBytes ?? 0) / progress.totalBytes) * 100));
  }

  if (progress.phase === "emitting" && progress.totalSegments && progress.totalSegments > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.emittedSegments) / progress.totalSegments) * 100));
  }

  if (progress.phase === "persisting" && progress.chunkCount && progress.chunkCount > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.persistedChunks ?? 0) / progress.chunkCount) * 100));
  }

  if (progress.phase === "restoring" && progress.chunkCount && progress.chunkCount > 0) {
    return Math.max(0, Math.min(100, (Math.max(0, progress.restoredChunks ?? 0) / progress.chunkCount) * 100));
  }

  return null;
}

/** 生成 CAD 导入或恢复状态文本，不把进度写入错误提示。 */
function getCadImportProgressText(progress: CadDxfLineProgress): string {
  const percent = getCadImportProgressPercent(progress);
  const percentText = percent === null ? "" : ` · ${Math.round(percent)}%`;
  switch (progress.phase) {
    case "reading":
      return `CAD 导入中 · 读取文件${percentText}`;
    case "measuring":
      return `CAD 导入中 · 测量图纸 · 已解析 ${formatCadProgressCount(progress.parsedEntities)} 个实体 · 已发现 ${formatCadProgressCount(progress.emittedSegments)} 条线段`;
    case "emitting":
      return `CAD 导入中 · 输出线段 · ${formatCadProgressCount(progress.emittedSegments)} / ${formatCadProgressCount(progress.totalSegments)} 条${percentText}`;
    case "rendering":
      return `CAD 导入中 · 创建网格 · 已创建 ${formatCadProgressCount(progress.chunkCount)} 个分块 · ${formatCadProgressCount(progress.emittedSegments)} 条线段`;
    case "persisting":
      return `CAD 导入中 · 保存分块 · ${formatCadProgressCount(progress.persistedChunks)} / ${formatCadProgressCount(progress.chunkCount)} 个${percentText}`;
    case "restoring":
      return `CAD 恢复中 · ${formatCadProgressCount(progress.restoredChunks)} / ${formatCadProgressCount(progress.chunkCount)} 个分块 · 已创建 ${formatCadProgressCount(progress.renderedChunks)} 个网格${percentText}`;
    case "done":
      return "CAD 图纸导入完成";
    default:
      return progress.message ?? "CAD 图纸导入中";
  }
}

/** 从项目相对路径中取回文件名，恢复 glTF/OBJ 依赖时必须保留原始文件名。 */
function getProjectFileName(projectFile: string): string {
  return projectFile.split(/[\\/]/).pop() || "asset";
}

/** 合并主源文件和同批依赖文件路径，避免场景元数据中重复记录。 */
function getAssetProjectFiles(asset: AssetRecord): string[] {
  return [...new Set([asset.projectFile, ...(asset.projectFiles ?? [])].filter((file): file is string => Boolean(file)))];
}

/** 将 Electron 返回的模型包文件记录转换成编辑器 manifest 文件记录。 */
function mapModelPackageFiles(files: DesktopModelPackageProjectFile[]): ModelPackageProjectFile[] {
  return files.map((file) => ({
    relativePath: file.relativePath,
    projectFile: file.projectFile,
    role: file.role,
    size: file.size,
    lastModified: file.lastModified
  }));
}

/** 安全解析 meta.json；meta.js 当前只复制保存，不执行。 */
function parseModelPackageMeta(metaFile: string | undefined, textFiles: Record<string, string>, warnings: string[]): unknown {
  if (!metaFile || !metaFile.toLowerCase().endsWith(".json")) {
    return undefined;
  }

  const text = textFiles[metaFile];
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    warnings.push(`${metaFile} 不是合法 JSON，已忽略 meta 内容。`);
    return undefined;
  }
}

/** 将未知 JSON 值安全收敛为普通对象，避免损坏 meta 影响模型包导入。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** 根据模型包内部相对路径构建规范化索引，用于兼容 ./ 和 Windows 反斜杠。 */
function createModelPackageRelativePathMap(paths: string[]): Map<string, string> {
  return new Map(paths.map((file) => [normalizeModelPackageRelativePath(file), file]));
}

/** 从 meta.json 中读取参数脚本文件名，当前优先兼容 parameterScripts[0].scriptFilename。 */
function getMetaParameterScriptFile(meta: unknown, textFiles: Record<string, string>, warnings: string[]): string | undefined {
  const parameterScripts = asRecord(meta).parameterScripts;
  if (!Array.isArray(parameterScripts)) {
    return undefined;
  }

  const textFileMap = createModelPackageRelativePathMap(Object.keys(textFiles));
  for (const script of parameterScripts) {
    const scriptFile = asRecord(script).scriptFilename;
    if (typeof scriptFile !== "string" || scriptFile.trim().length === 0) {
      continue;
    }

    const matchedFile = textFileMap.get(normalizeModelPackageRelativePath(scriptFile));
    if (matchedFile) {
      return matchedFile;
    }

    warnings.push(`meta.json 声明的参数脚本 ${scriptFile} 不在模型包文本文件中，已继续查找下一个参数脚本。`);
  }

  return undefined;
}

/** 从 meta.json 中读取运行脚本文件名和类名，默认兼容 ParametricModelRuntimeComponent。 */
function getMetaRuntimeScript(
  meta: unknown,
  textFiles: Record<string, string>,
  fallbackScriptFile: string | undefined,
  warnings: string[]
): ModelPackageRuntimeScriptSelection {
  const animationScripts = asRecord(meta).animationScripts;
  const fileMap = createModelPackageRelativePathMap(Object.keys(textFiles));
  if (Array.isArray(animationScripts)) {
    for (const script of animationScripts) {
      const scriptRecord = asRecord(script);
      const scriptFile = scriptRecord.scriptFilename;
      if (typeof scriptFile !== "string" || scriptFile.trim().length === 0) {
        continue;
      }

      const matchedFile = fileMap.get(normalizeModelPackageRelativePath(scriptFile));
      if (matchedFile) {
        const className =
          typeof scriptRecord.className === "string" && scriptRecord.className.trim().length > 0
            ? scriptRecord.className.trim()
            : getModelPackageRuntimeClassName(textFiles[matchedFile]);
        return { scriptFile: matchedFile, className };
      }

      warnings.push(`meta.json 声明的运行脚本 ${scriptFile} 不在模型包文件中，已继续查找下一个运行脚本。`);
    }
  }

  return {
    scriptFile: fallbackScriptFile,
    className: fallbackScriptFile ? getModelPackageRuntimeClassName(textFiles[fallbackScriptFile]) : DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS
  };
}

/** 从脚本文本推断运行类名，兼容旧模型包默认导出的 XxxComponent。 */
function getModelPackageRuntimeClassName(scriptText: string | undefined): string {
  return scriptText ? parseModelPackageDefaultExportClassName(scriptText) ?? DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS : DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS;
}

/** 规范化模型包内部相对路径，兼容 meta 中的 ./ 前缀和 Windows 反斜杠。 */
function normalizeModelPackageRelativePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

/** 选择用于右侧属性栏解析的参数脚本，避免多个 .ts 时误选运行脚本。 */
function chooseModelPackageParameterScriptFile(
  meta: unknown,
  textFiles: Record<string, string>,
  fallbackScriptFile: string | undefined,
  warnings: string[]
): string | undefined {
  const metaScriptFile = getMetaParameterScriptFile(meta, textFiles, warnings);
  if (metaScriptFile) {
    return metaScriptFile;
  }

  const tsFiles = Object.keys(textFiles)
    .filter((file) => file.toLowerCase().endsWith(".ts"))
    .sort((left, right) => left.localeCompare(right));
  const paramsFiles = tsFiles.filter((file) => file.toLowerCase().endsWith(".params.ts"));
  if (paramsFiles.length > 0) {
    if (paramsFiles.length > 1) {
      warnings.push(`模型包包含多个 .params.ts 参数脚本，当前版本使用 ${paramsFiles[0]}。`);
    }
    return paramsFiles[0];
  }

  const decoratedScriptFile = chooseDecoratedModelPackageScriptFile(tsFiles, textFiles, fallbackScriptFile);
  if (decoratedScriptFile) {
    return decoratedScriptFile;
  }

  if (fallbackScriptFile && textFiles[fallbackScriptFile] !== undefined) {
    return fallbackScriptFile;
  }

  if (tsFiles.length === 1) {
    return tsFiles[0];
  }

  warnings.push("模型包包含多个 .ts 脚本，但未找到 meta.json 声明的有效参数脚本或 .params.ts 文件，已跳过动态参数解析。");
  return undefined;
}

/** 没有 meta 参数声明时，在旧模型包中选择真正带 Inspector 装饰器的脚本。 */
function chooseDecoratedModelPackageScriptFile(
  tsFiles: string[],
  textFiles: Record<string, string>,
  fallbackScriptFile: string | undefined
): string | undefined {
  const decoratedFiles = tsFiles.filter((file) => hasModelPackageVisibleDecorators(textFiles[file] ?? ""));
  if (decoratedFiles.length === 0) {
    return undefined;
  }

  return decoratedFiles.sort((left, right) => {
    const depthDiff = getModelPackageRelativeDepth(left) - getModelPackageRelativeDepth(right);
    if (depthDiff !== 0) {
      return depthDiff;
    }

    if (fallbackScriptFile) {
      if (left === fallbackScriptFile) {
        return -1;
      }
      if (right === fallbackScriptFile) {
        return 1;
      }
    }

    return left.localeCompare(right);
  })[0];
}

/** 计算模型包相对路径层级，优先选根目录脚本，避免误选 labels 等辅助脚本。 */
function getModelPackageRelativeDepth(filePath: string): number {
  return normalizeModelPackageRelativePath(filePath).split("/").length;
}

/** 从 meta.json 中选出与当前参数脚本对应的 parameterScripts 记录。 */
function getMetaParameterScriptRecord(meta: unknown, scriptFile: string | undefined): Record<string, unknown> | undefined {
  const parameterScripts = asRecord(meta).parameterScripts;
  if (!Array.isArray(parameterScripts)) {
    return undefined;
  }

  const normalizedScriptFile = scriptFile ? normalizeModelPackageRelativePath(scriptFile) : "";
  const records = parameterScripts.map((script) => asRecord(script));
  if (!normalizedScriptFile) {
    return records[0];
  }

  return (
    records.find((record) => {
      const declaredScriptFile = record.scriptFilename;
      return (
        typeof declaredScriptFile === "string" &&
        normalizeModelPackageRelativePath(declaredScriptFile) === normalizedScriptFile
      );
    }) ?? records[0]
  );
}

/** 解析 meta.json 中声明的字段和值，让模型包自身参数优先进入右侧属性面板。 */
function parseMetaParameterDefinition(
  meta: unknown,
  scriptFile: string | undefined,
  fallbackSourceFile: string,
  warnings: string[]
): { fields: DynamicInspectorField[]; initialValues: Record<string, DynamicParameterValue> } {
  const parameterScript = getMetaParameterScriptRecord(meta, scriptFile);
  if (!parameterScript) {
    return { fields: [], initialValues: {} };
  }

  const sourceFile = getMetaParameterSourceFile(parameterScript, scriptFile, fallbackSourceFile);
  const fields = parseMetaDynamicFields(parameterScript, sourceFile, warnings);
  return {
    fields,
    initialValues: parseMetaInitialValues(parameterScript, fields, warnings)
  };
}

/** 获取 meta 参数脚本来源文件名，优先使用 manifest 中声明的脚本路径。 */
function getMetaParameterSourceFile(
  parameterScript: Record<string, unknown>,
  scriptFile: string | undefined,
  fallbackSourceFile: string
): string {
  const declaredScriptFile = parameterScript.scriptFilename;
  return typeof declaredScriptFile === "string" && declaredScriptFile.trim()
    ? declaredScriptFile.trim()
    : scriptFile ?? fallbackSourceFile;
}

/** 解析 meta.json parameterScripts[].fields，补齐脚本装饰器无法覆盖的字段契约。 */
function parseMetaDynamicFields(
  parameterScript: Record<string, unknown>,
  sourceFile: string,
  warnings: string[]
): DynamicInspectorField[] {
  const rawFields = parameterScript.fields;
  if (!Array.isArray(rawFields)) {
    return [];
  }

  const output: DynamicInspectorField[] = [];
  rawFields.forEach((rawField, index) => {
    const field = asRecord(rawField);
    const key = getMetaFieldKey(field);
    if (!key) {
      warnings.push(`${sourceFile} 的第 ${index + 1} 个 meta 参数缺少 key，已跳过。`);
      return;
    }

    const kind = getMetaFieldKind(field);
    if (!kind) {
      warnings.push(`${sourceFile} 的 meta 参数 ${key} 类型不受支持，已跳过。`);
      return;
    }

    const defaultValue = normalizeMetaParameterValue(field.defaultValue, kind) ?? getFallbackDynamicParameterValue(kind);
    const configuration = asRecord(field.configuration);
    const label = getMetaFieldLabel(field, key);
    const explicitUnit = normalizeDynamicParameterUnit(configuration.unit ?? field.unit ?? configuration.unitSymbol ?? field.unitSymbol);
    const unitInference = inferDynamicParameterUnit(key, label, kind, explicitUnit);
    output.push({
      id: `${sourceFile}:meta:${key}`,
      key,
      label,
      kind,
      defaultValue,
      unit: unitInference.unit,
      physicalKind: unitInference.physicalKind,
      min: readFiniteNumber(configuration.min ?? field.min),
      max: readFiniteNumber(configuration.max ?? field.max),
      step: readFiniteNumber(configuration.step ?? field.step),
      sourceFile,
      sourceDecorator: getSourceDecoratorForKind(kind),
      order: output.length
    });
  });

  return output;
}

/** 从 meta 字段中读取参数 key，兼容 Babylon Editor 的 propertyKey 命名。 */
function getMetaFieldKey(field: Record<string, unknown>): string {
  const key = typeof field.key === "string" ? field.key : field.propertyKey;
  return typeof key === "string" ? key.trim() : "";
}

/** 从 meta 字段中读取展示名称，缺失时退回 key。 */
function getMetaFieldLabel(field: Record<string, unknown>, key: string): string {
  const label = field.label;
  return typeof label === "string" && label.trim() ? label.trim() : key;
}

/** 从 meta 字段声明中收敛当前编辑器支持的参数类型。 */
function getMetaFieldKind(field: Record<string, unknown>): DynamicInspectorFieldKind | undefined {
  const configuration = asRecord(field.configuration);
  const declaredType = configuration.type ?? field.type;
  if (typeof declaredType === "string") {
    const normalizedType = declaredType.trim().toLowerCase();
    if (["number", "float", "double", "integer", "int"].includes(normalizedType)) {
      return "number";
    }
    if (["color3", "color"].includes(normalizedType)) {
      return "color3";
    }
    if (["string", "text"].includes(normalizedType)) {
      return "string";
    }
    if (["boolean", "bool"].includes(normalizedType)) {
      return "boolean";
    }
  }

  return inferDynamicFieldKind(field.defaultValue);
}

/** 按默认值类型推断字段类型，用于兼容缺少 configuration.type 的旧 meta。 */
function inferDynamicFieldKind(value: unknown): DynamicInspectorFieldKind | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return "number";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (isColor3SnapshotValue(value)) {
    return "color3";
  }
  return undefined;
}

/** 将字段类型映射为现有动态字段来源枚举，保持旧 Inspector 校验逻辑可复用。 */
function getSourceDecoratorForKind(kind: DynamicInspectorFieldKind): DynamicInspectorField["sourceDecorator"] {
  if (kind === "number") {
    return "visibleAsNumber";
  }
  if (kind === "color3") {
    return "visibleAsColor3";
  }
  if (kind === "boolean") {
    return "visibleAsBoolean";
  }
  return "visibleAsString";
}

/** 读取 meta.json parameterScripts[].values，作为模型实例首次进入场景的权威初始值。 */
function parseMetaInitialValues(
  parameterScript: Record<string, unknown>,
  fields: DynamicInspectorField[],
  warnings: string[]
): Record<string, DynamicParameterValue> {
  const rawValues = asRecord(parameterScript.values);
  if (Object.keys(rawValues).length === 0) {
    return {};
  }

  return fields.reduce<Record<string, DynamicParameterValue>>((values, field) => {
    if (!Object.prototype.hasOwnProperty.call(rawValues, field.key)) {
      return values;
    }

    const value = normalizeMetaParameterValue(rawValues[field.key], field.kind);
    if (value === undefined) {
      warnings.push(`meta.json 参数 ${field.key} 的值类型与 ${field.kind} 不匹配，已使用字段默认值。`);
      return values;
    }

    values[field.key] = value;
    return values;
  }, {});
}

/** 合并脚本装饰器字段和 meta 字段，meta 字段用于覆盖模型给出的 label、默认值和约束。 */
function mergeDynamicFields(scriptFields: DynamicInspectorField[], metaFields: DynamicInspectorField[]): DynamicInspectorField[] {
  const fields = scriptFields.map((field) => ({ ...field }));
  metaFields.forEach((metaField) => {
    const existingIndex = fields.findIndex((field) => field.key === metaField.key);
    if (existingIndex >= 0) {
      const existingField = fields[existingIndex];
      fields[existingIndex] = {
        ...existingField,
        ...metaField,
        id: existingField.id,
        sourceFile: existingField.sourceFile,
        order: existingField.order
      };
      return;
    }

    fields.push({
      ...metaField,
      order: fields.length
    });
  });

  return fields.map((field, order) => withInferredDynamicParameterUnit({ ...field, order }));
}

/** 从 meta values 项中拆出真实值，兼容 { type, value, label } 包装和直接标量。 */
function unwrapMetaParameterValue(value: unknown): unknown {
  const record = asRecord(value);
  return Object.prototype.hasOwnProperty.call(record, "value") ? record.value : value;
}

/** 按字段类型规范化 meta 参数值，非法值返回 undefined 而不污染模型 metadata。 */
function normalizeMetaParameterValue(value: unknown, kind: DynamicInspectorFieldKind): DynamicParameterValue | undefined {
  const unwrapped = unwrapMetaParameterValue(value);
  if (kind === "number") {
    if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) {
      return unwrapped;
    }
    if (typeof unwrapped === "string" && unwrapped.trim() && Number.isFinite(Number(unwrapped))) {
      return Number(unwrapped);
    }
    return undefined;
  }

  if (kind === "string") {
    return typeof unwrapped === "string" ? unwrapped : undefined;
  }

  if (kind === "boolean") {
    if (typeof unwrapped === "boolean") {
      return unwrapped;
    }
    if (typeof unwrapped === "string" && ["true", "false"].includes(unwrapped.trim().toLowerCase())) {
      return unwrapped.trim().toLowerCase() === "true";
    }
    return undefined;
  }

  if (isColor3SnapshotValue(unwrapped)) {
    const color = asRecord(unwrapped);
    return {
      r: Number(color.r),
      g: Number(color.g),
      b: Number(color.b)
    };
  }

  return undefined;
}

/** 为 meta-only 字段提供安全默认值，确保字段结构始终可序列化。 */
function getFallbackDynamicParameterValue(kind: DynamicInspectorFieldKind): DynamicParameterValue {
  if (kind === "number") {
    return 0;
  }
  if (kind === "boolean") {
    return false;
  }
  if (kind === "color3") {
    return { r: 1, g: 1, b: 1 } satisfies Color3Snapshot;
  }
  return "";
}

/** 读取有限数字，避免 NaN 或 Infinity 写入参数约束。 */
function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

/** 判断值是否是可序列化 Color3 快照。 */
function isColor3SnapshotValue(value: unknown): value is Color3Snapshot {
  const color = asRecord(value);
  return [color.r, color.g, color.b].every((component) => typeof component === "number" && Number.isFinite(component));
}

/** 从模型包脚本中读取 dataDriven 语义定义，场景级连接配置仍由 Inspector 保存。 */
function parseModelPackageDataDrivenFromScripts(
  textFiles: Record<string, string>,
  preferredFiles: Array<string | undefined>,
  warnings: string[]
): ModelDataDrivenDefinition | undefined {
  const textFileMap = createModelPackageRelativePathMap(Object.keys(textFiles));
  const scriptFiles = [
    ...preferredFiles,
    ...Object.keys(textFiles)
      .filter((file) => file.toLowerCase().endsWith(".ts"))
      .sort((left, right) => left.localeCompare(right))
  ];
  const visited = new Set<string>();

  for (const scriptFile of scriptFiles) {
    if (!scriptFile) {
      continue;
    }

    const matchedFile = textFileMap.get(normalizeModelPackageRelativePath(scriptFile));
    if (!matchedFile || visited.has(matchedFile)) {
      continue;
    }
    visited.add(matchedFile);

    const parsed = parseModelPackageDataDriven(textFiles[matchedFile] ?? "", matchedFile);
    warnings.push(...parsed.warnings);
    if (parsed.definition) {
      return parsed.definition;
    }
  }

  return undefined;
}

/** 从项目资产目录轻量恢复模型包脚本文本，避免打开项目时强制加载大 GLB。 */
async function restoreModelPackageScriptTextsFromProject(projectPath: string, targetEngine: BabylonEditorEngine): Promise<string[]> {
  if (!window.electronApp?.projects.loadAssetFile) {
    return [];
  }

  const warnings: string[] = [];
  const decoder = new TextDecoder("utf-8");
  for (const asset of targetEngine.getAssetsSnapshot()) {
    const manifest = asset.modelPackage;
    if (!manifest) {
      continue;
    }

    const scriptFiles = manifest.files.filter((file) => file.role === "script");
    const requiredPaths = new Set(
      [manifest.scriptFile, manifest.runtimeScriptFile, ...scriptFiles.map((file) => file.relativePath)].filter(
        (file): file is string => Boolean(file)
      )
    );
    const scriptFileMap = createModelPackageRelativePathMap(scriptFiles.map((file) => file.relativePath));
    const texts: Record<string, string> = {};

    for (const requiredPath of requiredPaths) {
      const matchedRelativePath = scriptFileMap.get(normalizeModelPackageRelativePath(requiredPath));
      const projectFileRecord = scriptFiles.find((file) => file.relativePath === matchedRelativePath);
      if (!projectFileRecord) {
        warnings.push(`模型包 ${manifest.displayName} 缺少脚本文件记录：${requiredPath}`);
        continue;
      }

      try {
        const payload = await window.electronApp.projects.loadAssetFile(projectPath, projectFileRecord.projectFile);
        texts[projectFileRecord.relativePath] = decoder.decode(payload.data);
      } catch (error) {
        warnings.push(getErrorMessage(error, `模型包 ${manifest.displayName} 脚本 ${projectFileRecord.relativePath} 读取失败。`));
      }
    }

    if (Object.keys(texts).length > 0) {
      targetEngine.registerModelPackageScriptTexts(manifest.packageId, texts);
    }
  }

  return warnings;
}

/** 编辑器根组件，负责连接 React 面板状态和 Babylon 引擎实例。 */
export function App() {
  const [engine, setEngine] = useState<BabylonEditorEngine | null>(null);
  const [engineSceneId, setEngineSceneId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("move");
  const [nodes, setNodes] = useState<SceneNodeSummary[]>([]);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [stats, setStats] = useState<EditorStats>(initialStats);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProjectRecord[]>([]);
  const [activeProject, setActiveProject] = useState<DesktopProjectRecord | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectErrorExpanded, setProjectErrorExpanded] = useState(false);
  const [cadImportProgress, setCadImportProgress] = useState<CadDxfLineProgress | null>(null);
  const [cadImportActive, setCadImportActive] = useState(false);
  const [cadRestoreProgress, setCadRestoreProgress] = useState<CadDxfLineProgress | null>(null);
  const [cadRestoreActive, setCadRestoreActive] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneLoadFailed, setSceneLoadFailed] = useState(false);
  const [sceneDialogOpen, setSceneDialogOpen] = useState(false);
  const [sceneContextMenu, setSceneContextMenu] = useState<SceneContextMenuState | null>(null);
  const [modelArrayDialog, setModelArrayDialog] = useState<ModelArrayDialogState | null>(null);
  const [treeExpansionCommand, setTreeExpansionCommand] = useState<HierarchyExpansionCommand | null>(null);
  const [assetLibraryFocusCommand, setAssetLibraryFocusCommand] = useState<AssetLibraryFocusCommand | null>(null);
  const [sceneName, setSceneName] = useState("New Scene");
  const [sceneEnvironmentColor, setSceneEnvironmentColor] = useState(DEFAULT_SCENE_ENVIRONMENT_COLOR);
  const [sceneDataDriven, setSceneDataDriven] = useState<SceneDataDrivenSnapshot>(DEFAULT_SCENE_DATA_DRIVEN);
  const [assetBrowserHeight, setAssetBrowserHeight] = useState(readStoredAssetBrowserHeight);
  const [assetBrowserMaxHeight, setAssetBrowserMaxHeight] = useState(getAssetBrowserMaxHeight);

  const activeScene = activeProject?.scenes.find((scene) => scene.id === activeSceneId) ?? activeProject?.scenes[0] ?? null;
  const activeSceneRef = useRef<{ projectPath: string | null; sceneId: string | null }>({ projectPath: null, sceneId: null });
  const sceneRenameRequestRef = useRef(0);
  const cadImportRequestRef = useRef(0);
  const cadImportActiveRef = useRef(false);
  const cadRestoreRequestRef = useRef(0);
  const cadRestoreActiveRef = useRef(false);
  const cadRestoreWarningRef = useRef<string | null>(null);
  const selectedNode = inspectorTarget?.type === "node" ? inspectorTarget.node : null;
  const selectedHierarchyNode = useMemo(
    () => (selectedNode ? nodes.find((node) => node.id === selectedNode.id) ?? null : null),
    [nodes, selectedNode]
  );
  const workspaceStyle = useMemo(
    () =>
      ({
        "--asset-browser-height": `${assetBrowserHeight}px`
      }) as CSSProperties,
    [assetBrowserHeight]
  );

  /** 调整资源库高度并持久化到本机，刷新后继续使用。 */
  const handleAssetBrowserHeightChange = useCallback((height: number) => {
    setAssetBrowserHeight(clampAssetBrowserHeight(height));
  }, []);

  useEffect(() => {
    const persistAssetBrowserHeight = window.setTimeout(() => {
      try {
        window.localStorage.setItem(ASSET_BROWSER_HEIGHT_STORAGE_KEY, String(assetBrowserHeight));
      } catch {
        // 本地存储不可用时只影响记忆高度，不阻断编辑器使用。
      }
    }, 120);

    return () => window.clearTimeout(persistAssetBrowserHeight);
  }, [assetBrowserHeight]);

  useEffect(() => {
    const handleResize = () => {
      const nextMaxHeight = getAssetBrowserMaxHeight();
      setAssetBrowserMaxHeight(nextMaxHeight);
      setAssetBrowserHeight((current) => Math.round(Math.min(nextMaxHeight, Math.max(MIN_ASSET_BROWSER_HEIGHT, current))));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!sceneContextMenu) {
      return;
    }

    const closeMenu = () => setSceneContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sceneContextMenu]);

  const panelInspectorTarget = useMemo<InspectorTarget | null>(() => {
    if (!inspectorTarget) {
      return null;
    }

    if (inspectorTarget.type === "scene") {
      return {
        type: "scene",
        scene: {
          ...inspectorTarget.scene,
          name: activeScene?.name ?? inspectorTarget.scene.name,
          dataDriven: sceneDataDriven
        }
      };
    }

    return inspectorTarget;
  }, [activeScene?.name, inspectorTarget, sceneDataDriven]);
  const projectSaveBlocked = Boolean(activeProject && (sceneLoading || sceneLoadFailed || previewMode || cadImportActive || cadRestoreActive));
  const saveDisabledReason = cadImportActive
    ? "CAD 图纸导入完成后才能保存场景"
    : cadRestoreActive
    ? "CAD 图纸恢复完成后才能保存场景"
    : previewMode
    ? "停止预览后才能保存场景"
    : sceneLoading
      ? "场景读取完成后才能保存"
      : sceneLoadFailed
        ? "当前场景加载失败，已阻止保存"
        : undefined;

  /** 选区切换到场景属性时，同步缓存场景级配置，供对象属性面板继续显示统一数据源。 */
  const handleSelectionChange = useCallback((target: InspectorTarget) => {
    setInspectorTarget(target);
    if (target.type === "scene") {
      setSceneEnvironmentColor(target.scene.environment.backgroundColor);
      setSceneDataDriven(target.scene.dataDriven);
    }
  }, []);

  const callbacks: EditorEngineCallbacks = useMemo(
    () => ({
      onSceneGraphChange: setNodes,
      onSelectionChange: handleSelectionChange,
      onAssetsChange: setAssets,
      onStatsChange: setStats
    }),
    [handleSelectionChange]
  );

  /** 刷新 Electron 保存的最近项目列表。 */
  const refreshRecentProjects = useCallback(async () => {
    if (!window.electronApp?.projects) {
      setProjectError("当前不在 Electron 桌面环境，项目文件功能不可用。");
      return;
    }

    const projects = await window.electronApp.projects.listRecent();
    setRecentProjects(projects);
  }, []);

  useEffect(() => {
    void refreshRecentProjects();
  }, [refreshRecentProjects]);

  useEffect(() => {
    setProjectErrorExpanded(false);
  }, [projectError]);

  /** 激活项目并同步默认场景选择。 */
  const activateProject = useCallback((project: DesktopProjectRecord | null) => {
    const nextSceneId = project?.activeSceneId ?? project?.scenes[0]?.id ?? null;
    setPreviewMode(false);
    activeSceneRef.current = { projectPath: project?.path ?? null, sceneId: nextSceneId };
    setActiveProject(project);
    setActiveSceneId(nextSceneId);
    setProjectError(null);
    setCadImportProgress(null);
    setCadImportActive(false);
    setCadRestoreProgress(null);
    setCadRestoreActive(false);
    cadImportActiveRef.current = false;
    cadRestoreActiveRef.current = false;
    cadRestoreWarningRef.current = null;
    cadImportRequestRef.current += 1;
    cadRestoreRequestRef.current += 1;
    setSceneLoadFailed(false);
  }, []);

  /** 保存当前项目和场景上下文，异步 IPC 返回时用它避免旧响应覆盖新界面。 */
  useEffect(() => {
    activeSceneRef.current = { projectPath: activeProject?.path ?? null, sceneId: activeScene?.id ?? null };
  }, [activeProject?.path, activeScene?.id]);

  /** 切换项目场景，先同步 ref 再触发 React 状态更新，避免重命名响应竞态。 */
  const handleSceneSelectChange = useCallback(
    (sceneId: string) => {
      if (cadImportActiveRef.current) {
        setProjectError("CAD 图纸正在导入，请等待导入完成后再切换场景。");
        return;
      }

      engine?.cancelCadRestore();
      cadRestoreActiveRef.current = false;
      cadRestoreWarningRef.current = null;
      setCadRestoreActive(false);
      setCadRestoreProgress(null);
      cadRestoreRequestRef.current += 1;
      activeSceneRef.current = { projectPath: activeProject?.path ?? null, sceneId };
      setActiveSceneId(sceneId);
    },
    [activeProject?.path, engine]
  );

  /** 切换项目场景时退出预览，避免旧场景动画状态泄漏到新场景。 */
  useEffect(() => {
    setPreviewMode(false);
  }, [activeProject?.path, activeSceneId]);

  /** 创建新项目，实际目录选择由 Electron 主进程文件对话框完成。 */
  const handleCreateProject = useCallback(
    async (name: string) => {
      try {
        const project = await window.electronApp?.projects.create(name);
        if (project) {
          activateProject(project);
          await refreshRecentProjects();
        }
      } catch (error) {
        setProjectError(getErrorMessage(error, "创建项目失败。"));
      }
    },
    [activateProject, refreshRecentProjects]
  );

  /** 打开本地项目目录。 */
  const handleOpenProject = useCallback(async () => {
    try {
      const project = await window.electronApp?.projects.open();
      if (project) {
        activateProject(project);
        await refreshRecentProjects();
      }
    } catch (error) {
      setProjectError(getErrorMessage(error, "打开项目失败。"));
    }
  }, [activateProject, refreshRecentProjects]);

  /** 从最近项目列表打开项目。 */
  const handleOpenRecentProject = useCallback(
    async (projectPath: string) => {
      try {
        const project = await window.electronApp?.projects.openRecent(projectPath);
        if (project) {
          activateProject(project);
          await refreshRecentProjects();
        }
      } catch (error) {
        setProjectError(getErrorMessage(error, "打开最近项目失败。"));
        await refreshRecentProjects();
      }
    },
    [activateProject, refreshRecentProjects]
  );

  /** 缓存 Babylon 引擎实例，并记录它对应的场景；引擎释放时同步清空旧 UI 快照。 */
  const handleEngineReady = useCallback(
    (nextEngine: BabylonEditorEngine | null) => {
      const sceneSnapshot = nextEngine?.getSceneInspectorSnapshot();
      setEngine(nextEngine);
      setEngineSceneId(nextEngine ? activeSceneId : null);
      setSceneEnvironmentColor(sceneSnapshot?.environment.backgroundColor ?? DEFAULT_SCENE_ENVIRONMENT_COLOR);
      setSceneDataDriven(sceneSnapshot?.dataDriven ?? DEFAULT_SCENE_DATA_DRIVEN);
      if (!nextEngine) {
        setInspectorTarget(null);
        setNodes([]);
        setAssets([]);
        setStats(initialStats);
      }
    },
    [activeSceneId]
  );

  useEffect(() => {
    if (!activeProject || !activeScene || !engine || engineSceneId !== activeScene.id || !window.electronApp?.projects) {
      return;
    }

    const projectsApi = window.electronApp.projects;
    let cancelled = false;
    const restoreRequestId = cadRestoreRequestRef.current + 1;
    cadRestoreRequestRef.current = restoreRequestId;
    cadRestoreActiveRef.current = false;
    cadRestoreWarningRef.current = null;
    setCadRestoreActive(false);
    setCadRestoreProgress(null);
    setSceneLoading(true);
    setSceneLoadFailed(false);
    projectsApi
      .loadScene(activeProject.path, activeScene.id)
      .then(async (payload) => {
        if (cancelled) {
          return;
        }

        setActiveProject(payload.project);
        if (!cancelled) {
          setProjectError(null);
        }
        if (payload.babylonScene) {
          await engine.loadSerializedScene(payload.babylonScene, {
            loadCadLineChunks: projectsApi.loadAssetFiles
              ? async (requests) => {
                  const results = await projectsApi.loadAssetFiles!(
                    activeProject.path,
                    requests.map((request) => ({
                      projectFile: request.projectFile,
                      expectedByteLength: request.expectedByteLength
                    }))
                  );
                  return results.map((result) => ({
                    projectFile: result.projectFile,
                    data: result.data,
                    lastModified: result.lastModified,
                    error: result.error
                  }));
                }
              : undefined,
            loadCadLineChunk: async (projectFile) => {
              if (!window.electronApp?.projects.loadAssetFile) {
                throw new Error("当前运行环境不支持读取 CAD 线段侧车文件。");
              }

              const assetPayload = await projectsApi.loadAssetFile(activeProject.path, projectFile);
              return assetPayload.data;
            },
            onCadRestoreProgress: (progress) => {
              if (cancelled || cadRestoreRequestRef.current !== restoreRequestId) {
                return;
              }

              if (progress.phase === "done") {
                cadRestoreActiveRef.current = false;
                setCadRestoreActive(false);
                setCadRestoreProgress(null);
                let cadRestoreWarning: string | null = null;
                if ((progress.skippedChunks ?? 0) > 0) {
                  cadRestoreWarning = `CAD 图纸恢复完成，但有 ${formatCadProgressCount(progress.skippedChunks)} 个线段分块缺失或损坏，已跳过。`;
                } else if (progress.message?.includes("失败")) {
                  cadRestoreWarning = progress.message;
                }

                cadRestoreWarningRef.current = cadRestoreWarning;
                if (cadRestoreWarning) {
                  setProjectError(cadRestoreWarning);
                }
                return;
              }

              cadRestoreActiveRef.current = true;
              setCadRestoreActive(true);
              setCadRestoreProgress(progress);
            }
          });
          const runtimeWarnings = await restoreModelPackageScriptTextsFromProject(activeProject.path, engine);
          if (!cancelled) {
            engine.initializeModelPackageRuntimesForScene();
            const warnings = [...runtimeWarnings];
            if (cadRestoreWarningRef.current) {
              warnings.push(cadRestoreWarningRef.current);
            }
            setProjectError(warnings.length > 0 ? warnings.join("；") : null);
          }
        }
        if (!cancelled) {
          const sceneSnapshot = engine.getSceneInspectorSnapshot();
          setSceneEnvironmentColor(sceneSnapshot.environment.backgroundColor);
          setSceneDataDriven(sceneSnapshot.dataDriven);
        }
        if (!cancelled) {
          setSceneLoadFailed(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectError(getErrorMessage(error, "加载场景失败。"));
          setSceneLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSceneLoading(false);
        }
      });

    return () => {
      cancelled = true;
      engine.cancelCadRestore();
      if (cadRestoreRequestRef.current === restoreRequestId) {
        cadRestoreRequestRef.current += 1;
        cadRestoreActiveRef.current = false;
        setCadRestoreActive(false);
        setCadRestoreProgress(null);
      }
    };
  }, [activeProject?.path, activeScene?.id, engine, engineSceneId]);

  /** 从工具栏创建基础对象，默认落在世界原点附近。 */
  const handleAddPrimitive = useCallback(
    (kind: PrimitiveKind) => {
      engine?.addPrimitive(kind, new Vector3(0, 0, 0));
    },
    [engine]
  );

  /** 层级面板的新建按钮创建逻辑分组，供模型拖入后批量管理。 */
  const handleCreateHierarchyNode = useCallback(() => {
    engine?.createGroup();
  }, [engine]);

  /** 把导入文件复制进项目资产目录，返回 File 对象到项目相对路径的映射。 */
  const persistProjectAssetFiles = useCallback(
    async (files: FileList | File[]): Promise<PersistedProjectAssetFiles> => {
      const projectFiles = new Map<File, string>();
      const failedFiles = new Set<File>();
      if (!activeProject || !window.electronApp?.projects.saveAssetFile) {
        return { projectFiles, failedFiles };
      }

      for (const file of Array.from(files)) {
        try {
          const sourcePath = window.electronApp.files?.getPath?.(file);
          const projectFile =
            sourcePath && window.electronApp.projects.saveAssetFileFromPath
              ? await window.electronApp.projects.saveAssetFileFromPath(activeProject.path, getFileAssetId(file), sourcePath, file.name)
              : await window.electronApp.projects.saveAssetFile(activeProject.path, getFileAssetId(file), file.name, await file.arrayBuffer());
          projectFiles.set(file, projectFile);
        } catch (error) {
          failedFiles.add(file);
          setProjectError(getErrorMessage(error, `资产 ${file.name} 写入项目目录失败。`));
        }
      }

      return { projectFiles, failedFiles };
    },
    [activeProject]
  );

  /** 从项目资产目录读取一组项目相对文件，并恢复为浏览器 File 对象。 */
  const loadProjectAssetFiles = useCallback(
    async (projectFiles: string[], mainProjectFile?: string, mainFileName?: string): Promise<File[]> => {
      if (!activeProject || !window.electronApp?.projects.loadAssetFile) {
        throw new Error("当前运行环境不支持读取项目资产文件。");
      }

      const files: File[] = [];
      for (const projectFile of projectFiles) {
        const payload = await window.electronApp.projects.loadAssetFile(activeProject.path, projectFile);
        const fileName = projectFile === mainProjectFile && mainFileName ? mainFileName : getProjectFileName(projectFile);
        files.push(
          new File([payload.data], fileName, {
            type: getProjectAssetMimeType(fileName),
            lastModified: payload.lastModified
          })
        );
      }

      return files;
    },
    [activeProject]
  );

  /** 按需从项目资产目录恢复单个资产文件，避免打开项目时一次性加载大模型。 */
  const ensureProjectAssetFile = useCallback(
    async (assetId: string, targetEngine: BabylonEditorEngine): Promise<boolean> => {
      const asset = targetEngine.getAssetsSnapshot().find((item) => item.id === assetId);
      if (!asset) {
        setProjectError("资产记录不存在，请刷新项目后重试。");
        return false;
      }

      if (asset.sourceAvailable === true) {
        return true;
      }

      const projectFiles = getAssetProjectFiles(asset);
      if (projectFiles.length === 0) {
        return true;
      }

      if (!activeProject || !window.electronApp?.projects.loadAssetFile) {
        return true;
      }

      try {
        const primaryModelFileName = asset.modelPackage?.primaryModelFile.split(/[\\/]/).pop();
        const files = await loadProjectAssetFiles(projectFiles, asset.projectFile, primaryModelFileName ?? asset.name);
        targetEngine.restoreAssetFiles(new Map([[assetId, files]]));
        return true;
      } catch (error) {
        setProjectError(getErrorMessage(error, `资产 ${asset.name} 源文件读取失败，将尝试使用当前场景模板。`));
        return true;
      }
    },
    [activeProject, loadProjectAssetFiles]
  );

  /** 从工具栏或资产面板导入文件时先快照文件，再持久化并登记资产等待用户拖入视口。 */
  const handleImportFiles = useCallback(
    async (files: FileList) => {
      if (!engine) {
        return;
      }

      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }

      const persisted = await persistProjectAssetFiles(fileArray);
      if (activeProject && persisted.failedFiles.size > 0) {
        setProjectError("部分资产文件写入项目目录失败，已先作为当前会话资产登记；重新打开项目后未成功写入的文件需要重新导入。");
      } else {
        setProjectError(null);
      }

      engine.registerAssetFiles(fileArray, persisted.projectFiles);
    },
    [activeProject, engine, persistProjectAssetFiles]
  );

  /** 导入文件夹模型包，解析 TypeScript 装饰器生成动态参数面板。 */
  const handleImportModelPackage = useCallback(async () => {
    if (!activeProject) {
      setProjectError("请先打开或创建项目，再导入模型包。");
      return;
    }

    if (!window.electronApp?.projects.importModelPackage) {
      setProjectError("当前运行环境不支持文件夹模型包导入。");
      return;
    }

    if (!engine) {
      setProjectError("3D 引擎尚未准备好，请稍后再导入模型包。");
      return;
    }

    try {
      const result = await window.electronApp.projects.importModelPackage(activeProject.path);
      if (!result) {
        return;
      }

      const projectFilePaths = result.projectFiles.map((file) => file.projectFile);
      const files = await loadProjectAssetFiles(projectFilePaths);
      const warnings = [...result.warnings];
      const meta = parseModelPackageMeta(result.metaFile, result.textFiles, warnings);
      const scriptFile = chooseModelPackageParameterScriptFile(meta, result.textFiles, result.scriptFile, warnings);
      const runtimeScript = getMetaRuntimeScript(
        meta,
        result.textFiles,
        scriptFile ?? result.scriptFile,
        warnings
      );
      const scriptText = scriptFile ? result.textFiles[scriptFile] ?? "" : "";
      const parsed = parseModelPackageDecorators(scriptText, scriptFile ?? "");
      const metaParameters = parseMetaParameterDefinition(meta, scriptFile, result.metaFile ?? "meta.json", warnings);
      if (parsed.fields.length > 0 || metaParameters.fields.length === 0) {
        warnings.push(...parsed.warnings);
      }
      const dynamicFields = mergeDynamicFields(parsed.fields, metaParameters.fields);
      const dataDriven = parseModelPackageDataDrivenFromScripts(
        result.textFiles,
        [runtimeScript.scriptFile, scriptFile, result.scriptFile],
        warnings
      );
      const manifest: ModelPackageManifest = {
        version: 1,
        packageId: result.packageId,
        displayName: result.displayName,
        rootDirectoryName: result.rootDirectoryName,
        primaryModelFile: result.primaryModelFile,
        scriptFile,
        runtimeScriptFile: runtimeScript.scriptFile,
        runtimeClassName: runtimeScript.className,
        dataDriven,
        metaFile: result.metaFile,
        meta,
        files: mapModelPackageFiles(result.projectFiles),
        dynamicFields,
        initialValues: metaParameters.initialValues,
        warnings,
        importedAt: Date.now()
      };

      engine.registerModelPackageScriptTexts(result.packageId, result.textFiles);
      await engine.importModelPackage(files, new Vector3(0, 0, 0), manifest);
      setProjectError(warnings.length > 0 ? warnings.join("；") : null);
    } catch (error) {
      setProjectError(getErrorMessage(error, "导入模型包失败。"));
    }
  }, [activeProject, engine, loadProjectAssetFiles]);

  /** 从工具栏或拖拽导入 CAD 图纸，允许同批选择图片参照文件。 */
  const handleImportCadDrawing = useCallback(
    async (input: FileList | File[]) => {
      if (cadImportActiveRef.current) {
        return;
      }

      if (cadRestoreActiveRef.current) {
        setProjectError("CAD 图纸正在恢复，请等待恢复完成后再导入新的 CAD 图纸。");
        return;
      }

      if (!engine) {
        setProjectError("3D 引擎尚未准备好，请稍后再导入 CAD 图纸。");
        return;
      }

      const files = Array.from(input);
      const cadFile = files.find((file) => /\.(dxf|dwg)$/i.test(file.name));
      if (!cadFile) {
        setProjectError("请选择 .dxf 格式的 CAD 图纸；如图纸包含外部图片，请同时选择图片文件。");
        return;
      }

      const importRequestId = cadImportRequestRef.current + 1;
      cadImportRequestRef.current = importRequestId;
      cadImportActiveRef.current = true;
      setCadImportActive(true);
      setCadImportProgress({
        phase: "reading",
        parsedEntities: 0,
        emittedSegments: 0,
        loadedBytes: 0,
        totalBytes: cadFile.size,
        message: "准备导入 CAD 图纸"
      });
      setProjectError(null);

      try {
        const sourcePath = window.electronApp?.files?.getPath?.(cadFile);
        const canPersistCadLines = Boolean(activeProject && window.electronApp?.projects.saveAssetFile);
        if (canPersistCadLines) {
          const persisted = await persistProjectAssetFiles(files);
          if (persisted.failedFiles.size > 0) {
            setProjectError("CAD 源文件写入项目目录失败，本次导入已取消，请修复项目目录权限后重试。");
            return;
          }
        }

        const cadLineAssetId = createCadLineAssetId(cadFile);
        let lastProgressAt = 0;
        let lastProgressPhase: CadDxfLineProgress["phase"] | null = null;
        let lastProgressPercent: number | null = null;
        const result = await engine.importCadDrawing(cadFile, {
          relatedFiles: files,
          sourcePath,
          onProgress: (progress) => {
            if (cadImportRequestRef.current !== importRequestId || !cadImportActiveRef.current) {
              return;
            }

            const now = performance.now();
            const percent = getCadImportProgressPercent(progress);
            const phaseChanged = progress.phase !== lastProgressPhase;
            const percentChanged = percent !== null && (lastProgressPercent === null || Math.abs(percent - lastProgressPercent) >= 1);
            if (!phaseChanged && !percentChanged && now - lastProgressAt < 500) {
              return;
            }

            lastProgressAt = now;
            lastProgressPhase = progress.phase;
            lastProgressPercent = percent;
            setCadImportProgress(progress);
          },
          persistLineChunk:
            activeProject && window.electronApp?.projects.saveAssetFile
              ? (fileName, data) => window.electronApp!.projects.saveAssetFile(activeProject.path, cadLineAssetId, fileName, data)
              : undefined
        });
        setProjectError(
          result.warnings.length > 0
            ? `CAD 图纸已导入，但有提示：${result.warnings.join("；")}`
            : null
        );
      } catch (error) {
        setProjectError(getErrorMessage(error, "导入 CAD 图纸失败。"));
      } finally {
        if (cadImportRequestRef.current === importRequestId) {
          cadImportActiveRef.current = false;
          setCadImportActive(false);
          setCadImportProgress(null);
        }
      }
    },
    [activeProject, engine, persistProjectAssetFiles]
  );

  /** 外部文件直接拖入视口时，保持原有立即入场景语义，同时同步写入项目资产库。 */
  const handleDropFiles = useCallback(
    async (files: FileList, position: Vector3, targetEngine: BabylonEditorEngine) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }

      if (fileArray.some((file) => /\.(dxf|dwg)$/i.test(file.name))) {
        await handleImportCadDrawing(fileArray);
        return;
      }

      const persisted = await persistProjectAssetFiles(fileArray);
      if (activeProject && persisted.failedFiles.size > 0) {
        setProjectError("资产文件写入项目目录失败，本次拖入未添加到场景，请修复后重新导入。");
        return;
      }

      await targetEngine.importFiles(fileArray, position, persisted.projectFiles);
    },
    [activeProject, handleImportCadDrawing, persistProjectAssetFiles]
  );

  /** 从资产库拖入模型时，必要时先按项目相对路径恢复源文件，再实例化到视口。 */
  const handleDropAsset = useCallback(
    async (assetId: string, position: Vector3, targetEngine: BabylonEditorEngine) => {
      if (!(await ensureProjectAssetFile(assetId, targetEngine))) {
        return;
      }

      const instantiated = await targetEngine.instantiateAsset(assetId, position);
      if (!instantiated) {
        const asset = targetEngine.getAssetsSnapshot().find((item) => item.id === assetId);
        setProjectError(`资产 ${asset?.name ?? assetId} 缺少项目内源文件或当前场景模板，请重新导入该资产。`);
        return;
      }

      setProjectError(null);
    },
    [ensureProjectAssetFile]
  );

  /** 从层级面板选中指定节点。 */
  const handleSelectNode = useCallback(
    (id: number) => {
      engine?.selectById(id);
    },
    [engine]
  );

  /** 从层级面板双击节点时，快速把视角定位到该对象。 */
  const handleFocusNode = useCallback(
    (id: number) => {
      engine?.focusById(id);
    },
    [engine]
  );

  /** 从层级面板切换场景节点显隐状态。 */
  const handleToggleNodeVisibility = useCallback(
    (id: number, visible: boolean) => {
      engine?.setNodeVisibilityById(id, visible);
    },
    [engine]
  );

  /** 从层级面板切换节点锁定状态，锁定后保留树中查看和解锁能力。 */
  const handleToggleNodeLock = useCallback(
    (id: number, locked: boolean) => {
      engine?.setNodeLockedById(id, locked);
    },
    [engine]
  );

  /** 从层级面板拖拽节点到目标分组；目标为空时移回根级。 */
  const handleMoveNodeToGroup = useCallback(
    (id: number, groupId: number | null) => {
      engine?.moveNodeToGroup(id, groupId);
    },
    [engine]
  );

  /** 下发模型树展开折叠命令，token 保证连续触发同类命令也会执行。 */
  const runTreeExpansionCommand = useCallback((action: HierarchyExpansionCommand["action"], targetId?: number) => {
    setTreeExpansionCommand((current) => ({
      action,
      targetId,
      token: (current?.token ?? 0) + 1
    }));
  }, []);

  /** 打开场景右键菜单，空白目标只展示树级命令，节点目标展示对象命令。 */
  const openSceneContextMenu = useCallback((target: SceneContextMenuTarget | null, point: { x: number; y: number }) => {
    setSceneContextMenu({
      target,
      ...clampSceneContextMenuPosition(point)
    });
  }, []);

  /** 从层级树右键打开对象菜单，并同步当前选中节点。 */
  const handleHierarchyNodeContextMenu = useCallback(
    (node: SceneNodeSummary, point: { x: number; y: number }) => {
      engine?.selectById(node.id);
      openSceneContextMenu(createSceneContextTargetFromSceneNode(node), point);
    },
    [engine, openSceneContextMenu]
  );

  /** 从层级树空白区域打开树级菜单。 */
  const handleHierarchyBlankContextMenu = useCallback(
    (point: { x: number; y: number }) => {
      openSceneContextMenu(null, point);
    },
    [openSceneContextMenu]
  );

  /** 从视口右键拾取结果打开对象菜单，空白位置只关闭已有菜单。 */
  const handleViewportModelContextMenu = useCallback(
    (target: TransformSnapshot | null, point: { x: number; y: number }) => {
      if (!target) {
        setSceneContextMenu(null);
        return;
      }

      openSceneContextMenu(createSceneContextTargetFromTransformSnapshot(target), point);
    },
    [openSceneContextMenu]
  );

  /** 执行带节点目标的右键命令，确保右键命中的节点就是命令作用对象。 */
  const runTargetedNodeCommand = useCallback(
    (target: SceneContextMenuTarget | null, command: (target: SceneContextMenuTarget) => void) => {
      if (!target || !engine) {
        return;
      }

      engine.selectById(target.id);
      command(target);
      setSceneContextMenu(null);
    },
    [engine]
  );

  /** 右键重命名直接复用属性面板的更新入口，避免新增一套名称持久化逻辑。 */
  const handleRenameSceneNode = useCallback(
    (target: SceneContextMenuTarget | null) => {
      if (!engine || !target || target.locked) {
        return;
      }

      const nextName = window.prompt("重命名对象", target.name)?.trim();
      if (!nextName || nextName === target.name) {
        setSceneContextMenu(null);
        return;
      }

      const nextSelection = engine.updateNodeById(target.id, { name: nextName });
      if (nextSelection) {
        setInspectorTarget({ type: "node", node: nextSelection });
      }
      setSceneContextMenu(null);
    },
    [engine]
  );

  /** 聚焦选中对象所在资源库卡片，文件夹和未登记资产不会产生空跳转。 */
  const handleFocusAssetLibrary = useCallback(
    (target: SceneContextMenuTarget | null = selectedHierarchyNode) => {
      if (!engine || !target) {
        return false;
      }

      const focusTarget = engine.getAssetLibraryFocusTargetById(target.id);
      if (!focusTarget) {
        return false;
      }

      setAssetLibraryFocusCommand((current) => ({
        ...focusTarget,
        token: (current?.token ?? 0) + 1
      }));
      return true;
    },
    [engine, selectedHierarchyNode]
  );

  /** 从右键菜单进入模型阵列弹窗，并填入默认参数。 */
  const handleOpenModelArrayDialog = useCallback(() => {
    if (!sceneContextMenu?.target || !canOpenModelArrayMenu(sceneContextMenu.target)) {
      return;
    }

    setModelArrayDialog({
      target: sceneContextMenu.target,
      axis: MODEL_ARRAY_DEFAULT_AXIS,
      count: MODEL_ARRAY_DEFAULT_COUNT,
      spacing: MODEL_ARRAY_DEFAULT_SPACING
    });
    setSceneContextMenu(null);
  }, [sceneContextMenu]);

  /** 更新模型阵列表单字段，字符串状态保留用户正在输入的小数或空值。 */
  const handleModelArrayDialogChange = useCallback((update: Partial<Omit<ModelArrayDialogState, "target">>) => {
    setModelArrayDialog((current) => (current ? { ...current, ...update } : current));
  }, []);

  /** 提交模型阵列命令，失败原因直接展示在项目错误提示中。 */
  const handleCreateModelArray = useCallback(() => {
    if (!engine || !modelArrayDialog) {
      return;
    }

    const result = engine.createModelArray({
      targetId: modelArrayDialog.target.id,
      axis: modelArrayDialog.axis,
      count: Number(modelArrayDialog.count),
      spacing: Number(modelArrayDialog.spacing)
    });
    if (!result.success) {
      setProjectError(result.message ?? "创建模型阵列失败。");
      setProjectErrorExpanded(false);
      return;
    }

    if (result.selectedNode) {
      setInspectorTarget({ type: "node", node: result.selectedNode });
    }
    setProjectError(null);
    setProjectErrorExpanded(false);
    setModelArrayDialog(null);
  }, [engine, modelArrayDialog]);

  /** 删除当前选中的场景对象，支持导入模型和基础对象。 */
  const handleDeleteSelected = useCallback(() => {
    engine?.deleteSelected();
  }, [engine]);

  useEffect(() => {
    /** 响应场景快捷键，并避开输入框内的文本编辑场景。 */
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      if (isTyping || event.defaultPrevented || !engine || event.repeat) {
        return;
      }

      const normalizedKey = event.key.toLowerCase();
      const isPlainSystemShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
      const hasSystemModifier = event.ctrlKey || event.metaKey || event.altKey;
      if (isPlainSystemShortcut && normalizedKey === "c") {
        if (engine.copySelected()) {
          event.preventDefault();
        }
        return;
      }

      if (isPlainSystemShortcut && normalizedKey === "v") {
        if (engine.pasteClipboard()) {
          event.preventDefault();
        }
        return;
      }

      if (isPlainSystemShortcut && normalizedKey === "k") {
        if (engine.toggleSelectedLock()) {
          event.preventDefault();
        }
        return;
      }

      if (isPlainSystemShortcut && normalizedKey === "g") {
        if (engine.groupSelected()) {
          event.preventDefault();
        }
        return;
      }

      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && normalizedKey === "g") {
        if (engine.ungroupSelected()) {
          event.preventDefault();
        }
        return;
      }

      if (isPlainSystemShortcut && normalizedKey === "i") {
        if (engine.invertSelection()) {
          event.preventDefault();
        }
        return;
      }

      if (!hasSystemModifier && normalizedKey === "f" && selectedNode) {
        event.preventDefault();
        engine.focusById(selectedNode.id);
        return;
      }

      if (!hasSystemModifier && normalizedKey === "h") {
        if (engine.toggleSelectedVisibility()) {
          event.preventDefault();
        }
        return;
      }

      if (!hasSystemModifier && normalizedKey === "p") {
        event.preventDefault();
        runTreeExpansionCommand("toggle", selectedHierarchyNode?.kind === "Group" ? selectedHierarchyNode.id : undefined);
        return;
      }

      if (!selectedNode || selectedNode.locked || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }

      event.preventDefault();
      engine.deleteSelected();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [engine, runTreeExpansionCommand, selectedHierarchyNode, selectedNode]);

  /** 从属性面板按当前快照节点 ID 提交对象变换、材质或 metadata 更新，避免引擎选中状态短暂失配。 */
  const handleInspectorChange = useCallback(
    (update: TransformUpdate) => {
      if (!engine || !selectedNode) {
        return;
      }

      const targetId = selectedNode.id;
      const nextSelection = engine.updateNodeById(targetId, update);
      setInspectorTarget((current) => {
        if (current?.type !== "node" || current.node.id !== targetId) {
          return current;
        }

        return nextSelection ? { type: "node", node: nextSelection } : current;
      });
    },
    [engine, selectedNode]
  );

  /** 保存当前 Babylon 场景，项目场景读取失败时禁止覆盖磁盘文件。 */
  const handleSave = useCallback(async () => {
    if (!engine) {
      return;
    }

    if (previewMode) {
      setProjectError("预览模式正在播放场景，为避免把动画中间帧写入文件，请先停止预览再保存。");
      return;
    }

    if (activeProject && sceneLoading) {
      setProjectError("场景仍在读取中，为避免覆盖旧文件，已暂时阻止保存。");
      return;
    }

    if (activeProject && sceneLoadFailed) {
      setProjectError("当前场景上次加载失败，为避免把空场景覆盖到磁盘，已阻止保存。请重新打开项目或切换场景。");
      return;
    }

    if (activeProject && cadImportActiveRef.current) {
      setProjectError("CAD 图纸仍在导入中，为避免保存半成品图纸，请等待导入完成后再保存。");
      return;
    }

    if (activeProject && cadRestoreActiveRef.current) {
      setProjectError("CAD 图纸仍在恢复中，为避免保存不完整线段，请等待恢复完成后再保存。");
      return;
    }

    if (activeProject && activeScene && window.electronApp?.projects) {
      const projectPath = activeProject.path;
      const sceneId = activeScene.id;
      try {
        const project = await window.electronApp.projects.saveScene(projectPath, sceneId, engine.serializeScene());
        const currentContext = activeSceneRef.current;
        if (currentContext.projectPath === projectPath) {
          setActiveProject(project);
        }
        if (currentContext.projectPath === projectPath && currentContext.sceneId === sceneId) {
          setActiveSceneId(sceneId);
        }
        await refreshRecentProjects();
        return;
      } catch (error) {
        const currentContext = activeSceneRef.current;
        if (currentContext.projectPath !== projectPath || currentContext.sceneId !== sceneId) {
          return;
        }

        setProjectError(getErrorMessage(error, "保存场景到项目失败。"));
      }
    }

    engine.saveScene();
  }, [activeProject, activeScene, engine, previewMode, refreshRecentProjects, sceneLoadFailed, sceneLoading]);

  /** 打开 Babylon 官方 Inspector 作为高级调试面板。 */
  const handleToggleInspector = useCallback(() => {
    void engine?.toggleInspector();
  }, [engine]);

  /** 切换性能预览模式，并交给 Babylon 引擎调整渲染策略。 */
  const handleTogglePerformance = useCallback(() => {
    setPerformanceMode((value) => !value);
  }, []);

  /** 更新当前场景环境背景色，色值会写入 Babylon 场景并随保存恢复。 */
  const handleSceneEnvironmentColorChange = useCallback(
    (color: string) => {
      const normalizedColor = engine?.setSceneEnvironmentColor(color) ?? DEFAULT_SCENE_ENVIRONMENT_COLOR;
      setSceneEnvironmentColor(normalizedColor);
      setInspectorTarget((current) => {
        if (current?.type !== "scene") {
          return current;
        }

        return {
          type: "scene",
          scene: {
            ...current.scene,
            environment: {
              ...current.scene.environment,
              backgroundColor: normalizedColor
            }
          }
        };
      });
    },
    [engine]
  );

  /** 从对象属性面板更新场景级数据源配置，保持选中模型不被强制切回场景属性。 */
  const handleSceneDataDrivenChange = useCallback(
    (dataDriven: Partial<SceneDataDrivenSnapshot>) => {
      if (!engine) {
        return;
      }

      const nextSceneSnapshot = engine.updateSceneInspector({ dataDriven });
      const namedSceneSnapshot = {
        ...nextSceneSnapshot,
        name: activeScene?.name ?? nextSceneSnapshot.name
      };
      setSceneEnvironmentColor(namedSceneSnapshot.environment.backgroundColor);
      setSceneDataDriven(namedSceneSnapshot.dataDriven);
      setInspectorTarget((current) => {
        if (current?.type !== "scene") {
          return current;
        }

        return { type: "scene", scene: namedSceneSnapshot };
      });
    },
    [activeScene?.name, engine]
  );

  /** 启动 Stacker 内置模拟预览，不依赖外部 MQTT/WebSocket 数据源。 */
  const handleStartStackerDemoPreview = useCallback(
    (nodeId: number) => {
      if (!engine) {
        return;
      }

      const nextSelection = engine.startStackerDemoPreviewForNode(nodeId);
      if (!nextSelection) {
        setProjectError("当前选择不可启动 Stacker 模拟，请选中拖入场景的 Stacker 模型并确认未锁定。");
        return;
      }

      engine.setPreviewMode(true);
      setProjectError(null);
      const nextSceneSnapshot = engine.getSceneInspectorSnapshot();
      setSceneEnvironmentColor(nextSceneSnapshot.environment.backgroundColor);
      setSceneDataDriven(nextSceneSnapshot.dataDriven);
      setInspectorTarget((current) => {
        if (current?.type !== "node") {
          return current;
        }

        return nextSelection ? { type: "node", node: nextSelection } : current;
      });
      setPreviewMode(true);
    },
    [engine]
  );

  /** 从右侧场景属性面板提交场景配置，按字段分发到项目清单或 Babylon 场景 metadata。 */
  const handleSceneInspectorChange = useCallback(
    async (update: SceneInspectorUpdate) => {
      if (!engine) {
        return;
      }

      let nextSceneSnapshot = engine.updateSceneInspector(update);
      if (update.name !== undefined) {
        const nextName = update.name.trim();
        if (!nextName) {
          setProjectError("场景名称不能为空。");
        } else if (activeProject && activeScene && window.electronApp?.projects) {
          const projectPath = activeProject.path;
          const sceneId = activeScene.id;
          const requestId = ++sceneRenameRequestRef.current;
          try {
            const project = await window.electronApp.projects.renameScene(projectPath, sceneId, nextName);
            const currentContext = activeSceneRef.current;
            const stillSameProject = currentContext.projectPath === projectPath;
            const stillSameScene = stillSameProject && currentContext.sceneId === sceneId && sceneRenameRequestRef.current === requestId;

            if (stillSameProject) {
              setActiveProject(project);
            }
            await refreshRecentProjects();
            if (!stillSameScene) {
              return;
            }

            setActiveSceneId(sceneId);
            setProjectError(null);
            const renamedScene = project.scenes.find((scene) => scene.id === sceneId);
            nextSceneSnapshot = {
              ...nextSceneSnapshot,
              name: renamedScene?.name ?? nextName
            };
          } catch (error) {
            const currentContext = activeSceneRef.current;
            if (currentContext.projectPath === projectPath && currentContext.sceneId === sceneId) {
              setProjectError(getErrorMessage(error, "重命名场景失败。"));
            }
            return;
          }
        } else {
          nextSceneSnapshot = {
            ...nextSceneSnapshot,
            name: nextName
          };
        }
      } else {
        nextSceneSnapshot = {
          ...nextSceneSnapshot,
          name: activeScene?.name ?? nextSceneSnapshot.name
        };
      }

      setSceneEnvironmentColor(nextSceneSnapshot.environment.backgroundColor);
      setSceneDataDriven(nextSceneSnapshot.dataDriven);
      setInspectorTarget({ type: "scene", scene: nextSceneSnapshot });
    },
    [activeProject, activeScene, engine, refreshRecentProjects]
  );

  /** 从右侧场景属性面板初始化当前场景，执行前要求用户确认以避免误清空。 */
  const handleInitializeScene = useCallback(() => {
    if (!engine) {
      return;
    }

    if (!window.confirm("场景初始化会清空当前场景中的可编辑对象并重建默认工作台，是否继续？")) {
      return;
    }

    const nextSceneSnapshot = engine.initializeEditableScene();
    setSceneEnvironmentColor(nextSceneSnapshot.environment.backgroundColor);
    setSceneDataDriven(nextSceneSnapshot.dataDriven);
    setInspectorTarget({
      type: "scene",
      scene: {
        ...nextSceneSnapshot,
        name: activeScene?.name ?? nextSceneSnapshot.name
      }
    });
  }, [activeScene?.name, engine]);

  /** 切换场景预览模式，交给 Babylon 引擎取景完整场景并播放动画。 */
  const handleTogglePreview = useCallback(() => {
    setPreviewMode((value) => !value);
  }, []);

  /** 创建新场景并立即切换到该场景。 */
  const handleCreateScene = useCallback(async () => {
    if (cadImportActiveRef.current) {
      setProjectError("CAD 图纸正在导入，请等待导入完成后再新建场景。");
      return;
    }

    if (cadRestoreActiveRef.current) {
      engine?.cancelCadRestore();
      cadRestoreActiveRef.current = false;
      cadRestoreWarningRef.current = null;
      setCadRestoreActive(false);
      setCadRestoreProgress(null);
      cadRestoreRequestRef.current += 1;
    }

    if (!activeProject || !sceneName.trim()) {
      return;
    }

    try {
      const project = await window.electronApp?.projects.createScene(activeProject.path, sceneName);
      if (project) {
        setActiveProject(project);
        setActiveSceneId(project.activeSceneId);
        setSceneName("New Scene");
        setSceneDialogOpen(false);
        await refreshRecentProjects();
      }
    } catch (error) {
      setProjectError(getErrorMessage(error, "创建场景失败。"));
    }
  }, [activeProject, engine, refreshRecentProjects, sceneName]);

  const activeCadProgress = cadImportProgress ?? cadRestoreProgress;
  const cadImportPercent = getCadImportProgressPercent(activeCadProgress);
  const cadImportText = activeCadProgress ? getCadImportProgressText(activeCadProgress) : null;
  const cadBusy = cadImportActive || cadRestoreActive;
  const cadImportNavigationTitle = cadImportActive ? "CAD 图纸正在导入，请等待完成" : undefined;
  const cadImportDisabledReason = cadImportActive
    ? "CAD 图纸正在导入，请等待完成"
    : cadRestoreActive
    ? "CAD 图纸正在恢复，请等待完成后再导入新的 CAD 图纸"
    : undefined;
  const contextTarget = sceneContextMenu?.target ?? null;
  const contextTreeTargetId = contextTarget?.kind === "Group" && contextTarget.hasChildren ? contextTarget.id : undefined;
  const contextAssetFocusTarget = contextTarget && engine ? engine.getAssetLibraryFocusTargetById(contextTarget.id) : null;
  const contextCanEdit = Boolean(contextTarget && !contextTarget.locked);
  const contextCanToggleLock = Boolean(contextTarget && (!contextTarget.lockedByAncestor || contextTarget.selfLocked));

  if (!activeProject) {
    return (
      <ProjectLauncher
        recentProjects={recentProjects}
        error={projectError}
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
        onOpenRecentProject={handleOpenRecentProject}
        onRefresh={refreshRecentProjects}
      />
    );
  }

  return (
    <div className="editor-root" aria-busy={cadBusy}>
      <Toolbar
        tool={tool}
        performanceMode={performanceMode}
        previewMode={previewMode}
        stats={stats}
        onToolChange={setTool}
        onAddPrimitive={handleAddPrimitive}
        onImportFiles={handleImportFiles}
        onImportCadDrawing={handleImportCadDrawing}
        onImportModelPackage={handleImportModelPackage}
        onSave={handleSave}
        saveDisabled={projectSaveBlocked}
        saveDisabledReason={saveDisabledReason}
        cadImportDisabled={cadBusy}
        cadImportDisabledReason={cadImportDisabledReason}
        onToggleInspector={handleToggleInspector}
        onTogglePerformance={handleTogglePerformance}
        onTogglePreview={handleTogglePreview}
      />

      <div className="project-strip">
        <div className="project-identity">
          <strong>{activeProject.name}</strong>
          <span>{activeProject.path}</span>
        </div>
        <label className="scene-switcher">
          <span>场景</span>
          <select
            value={activeScene?.id ?? ""}
            title={cadImportNavigationTitle}
            disabled={cadImportActive}
            onChange={(event) => handleSceneSelectChange(event.target.value)}
          >
            {activeProject.scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
        </label>
        <label className="scene-environment-control" title="场景环境背景色">
          <span>环境</span>
          <input
            aria-label="场景环境背景色"
            type="color"
            value={sceneEnvironmentColor}
            onChange={(event) => handleSceneEnvironmentColorChange(event.target.value)}
          />
        </label>
        <button
          className="icon-text-button"
          type="button"
          title={cadImportNavigationTitle}
          disabled={cadImportActive}
          onClick={() => setSceneDialogOpen(true)}
        >
          新建场景
        </button>
        <button className="icon-text-button danger-button" type="button" disabled={!selectedNode || selectedNode.locked} onClick={handleDeleteSelected}>
          删除选中
        </button>
        {activeCadProgress && cadImportText && (
          <div className="cad-import-progress" title={cadImportText}>
            <span className="cad-import-progress-text">{cadImportText}</span>
            <div
              className={`cad-import-progress-track ${cadImportPercent === null ? "is-indeterminate" : ""}`}
              role="progressbar"
              aria-label={activeCadProgress.phase === "restoring" ? "CAD 恢复进度" : "CAD 导入进度"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={cadImportPercent === null ? undefined : Math.round(cadImportPercent)}
            >
              <span className="cad-import-progress-fill" style={cadImportPercent === null ? undefined : { width: `${cadImportPercent}%` }} />
            </div>
          </div>
        )}
        {sceneLoading && <span className="scene-status">读取场景中</span>}
        {projectError && (
          <>
            <button
              className="scene-status scene-error scene-error-button"
              type="button"
              title={projectError}
              aria-expanded={projectErrorExpanded}
              aria-controls="scene-error-popover"
              onClick={() => setProjectErrorExpanded((expanded) => !expanded)}
            >
              {projectError}
            </button>
            {projectErrorExpanded && (
              <div className="scene-error-popover" id="scene-error-popover" role="alert">
                <div className="scene-error-popover-body">{projectError}</div>
                <button className="scene-error-popover-close" type="button" onClick={() => setProjectErrorExpanded(false)}>
                  关闭
                </button>
              </div>
            )}
          </>
        )}
        <button
          className="icon-text-button"
          type="button"
          title={cadImportNavigationTitle}
          disabled={cadImportActive}
          onClick={() => activateProject(null)}
        >
          返回项目
        </button>
      </div>

      <div className="workspace" style={workspaceStyle}>
        <HierarchyPanel
          title={activeProject.name}
          nodes={nodes}
          expansionCommand={treeExpansionCommand}
          onSelect={handleSelectNode}
          onFocus={handleFocusNode}
          onCreateNode={handleCreateHierarchyNode}
          onToggleVisibility={handleToggleNodeVisibility}
          onToggleLock={handleToggleNodeLock}
          onMoveNodeToGroup={handleMoveNodeToGroup}
          onNodeContextMenu={handleHierarchyNodeContextMenu}
          onBlankContextMenu={handleHierarchyBlankContextMenu}
        />
        <ViewportCanvas
          key={activeScene?.id ?? "empty-scene"}
          callbacks={callbacks}
          tool={tool}
          performanceMode={performanceMode}
          previewMode={previewMode}
          onEngineReady={handleEngineReady}
          onDropAsset={handleDropAsset}
          onDropFiles={handleDropFiles}
          onModelContextMenu={handleViewportModelContextMenu}
        />
        <InspectorPanel
          target={panelInspectorTarget}
          sceneDataDriven={sceneDataDriven}
          onNodeChange={handleInspectorChange}
          onSceneChange={handleSceneInspectorChange}
          onSceneDataDrivenChange={handleSceneDataDrivenChange}
          onStartStackerDemoPreview={handleStartStackerDemoPreview}
          onSceneInitialize={handleInitializeScene}
          onImportCadDrawing={handleImportCadDrawing}
          cadImportDisabled={cadImportActive}
          cadImportDisabledReason="CAD 图纸正在导入，请等待完成"
        />
        <AssetBrowser
          assets={assets}
          focusCommand={assetLibraryFocusCommand}
          height={assetBrowserHeight}
          minHeight={MIN_ASSET_BROWSER_HEIGHT}
          maxHeight={assetBrowserMaxHeight}
          onHeightChange={handleAssetBrowserHeightChange}
          onImportFiles={handleImportFiles}
          onImportModelPackage={handleImportModelPackage}
        />
      </div>

      {sceneContextMenu && (
        <div
          className="model-context-menu scene-context-menu"
          style={{ left: sceneContextMenu.x, top: sceneContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextTarget ? (
            <>
              <div className="scene-context-menu-title" title={contextTarget.name}>
                {contextTarget.name}
              </div>
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => runTargetedNodeCommand(contextTarget, (target) => engine?.focusById(target.id))}
              >
                场景聚焦 <span>F</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                disabled={!contextAssetFocusTarget}
                onClick={() => {
                  handleFocusAssetLibrary(contextTarget);
                  setSceneContextMenu(null);
                }}
              >
                库聚焦
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                disabled={!contextCanEdit}
                onClick={() =>
                  runTargetedNodeCommand(contextTarget, (target) => engine?.setNodeVisibilityById(target.id, !target.visible))
                }
              >
                {contextTarget.visible ? "隐藏对象" : "显示对象"} <span>H</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                disabled={!contextCanEdit}
                onClick={() => runTargetedNodeCommand(contextTarget, () => void engine?.copySelected())}
              >
                复制 <span>Ctrl+C</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => {
                  engine?.pasteClipboard();
                  setSceneContextMenu(null);
                }}
              >
                粘贴 <span>Ctrl+V</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                disabled={!contextCanToggleLock}
                onClick={() =>
                  runTargetedNodeCommand(contextTarget, (target) => engine?.setNodeLockedById(target.id, !target.selfLocked))
                }
              >
                {contextTarget.selfLocked ? "解锁对象" : "锁定对象"} <span>Ctrl+K</span>
              </button>
              <button className="model-context-menu-item" type="button" disabled={!contextCanEdit} onClick={() => handleRenameSceneNode(contextTarget)}>
                重命名
              </button>
              <button
                className="model-context-menu-item danger-item"
                type="button"
                disabled={!contextCanEdit}
                onClick={() => runTargetedNodeCommand(contextTarget, () => engine?.deleteSelected())}
              >
                删除 <span>Delete</span>
              </button>
              <div className="scene-context-menu-separator" />
              <button
                className="model-context-menu-item"
                type="button"
                disabled={!contextCanEdit}
                onClick={() => runTargetedNodeCommand(contextTarget, () => void engine?.groupSelected())}
              >
                群组对象 <span>Ctrl+G</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                disabled={!contextCanEdit}
                onClick={() => runTargetedNodeCommand(contextTarget, () => void engine?.ungroupSelected())}
              >
                解组对象 <span>Shift+G</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                disabled={!contextTarget.hasChildren}
                onClick={() => runTargetedNodeCommand(contextTarget, (target) => void engine?.selectFirstChildById(target.id))}
              >
                选择子级
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => {
                  engine?.invertSelection();
                  setSceneContextMenu(null);
                }}
              >
                反选对象 <span>Ctrl+I</span>
              </button>
              <div className="scene-context-menu-separator" />
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => {
                  runTreeExpansionCommand("expand", contextTreeTargetId);
                  setSceneContextMenu(null);
                }}
              >
                展开树 <span>P</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => {
                  runTreeExpansionCommand("collapse", contextTreeTargetId);
                  setSceneContextMenu(null);
                }}
              >
                折叠树 <span>P</span>
              </button>
              {canOpenModelArrayMenu(contextTarget) && (
                <>
                  <div className="scene-context-menu-separator" />
                  <button className="model-context-menu-item" type="button" onClick={handleOpenModelArrayDialog}>
                    模型阵列
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => {
                  handleCreateHierarchyNode();
                  setSceneContextMenu(null);
                }}
              >
                新建文件夹
              </button>
              <div className="scene-context-menu-separator" />
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => {
                  runTreeExpansionCommand("expand");
                  setSceneContextMenu(null);
                }}
              >
                展开树 <span>P</span>
              </button>
              <button
                className="model-context-menu-item"
                type="button"
                onClick={() => {
                  runTreeExpansionCommand("collapse");
                  setSceneContextMenu(null);
                }}
              >
                折叠树 <span>P</span>
              </button>
            </>
          )}
        </div>
      )}

      {modelArrayDialog && (
        <div className="modal-backdrop">
          <form
            className="modal-panel model-array-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateModelArray();
            }}
          >
            <div className="panel-title">模型阵列</div>
            <div className="model-array-target" title={modelArrayDialog.target.name}>
              当前模型：{modelArrayDialog.target.name}
            </div>
            <label className="field">
              <span>阵列轴向</span>
              <select
                value={modelArrayDialog.axis}
                onChange={(event) => handleModelArrayDialogChange({ axis: readModelArrayAxis(event.target.value) })}
              >
                <option value="x">X 轴（正向）</option>
                <option value="-x">-X 轴（负向）</option>
                <option value="z">Z 轴（正向）</option>
                <option value="-z">-Z 轴（负向）</option>
              </select>
            </label>
            <label className="field">
              <span>克隆数量</span>
              <input
                autoFocus
                min={1}
                max={50}
                step={1}
                type="number"
                value={modelArrayDialog.count}
                onChange={(event) => handleModelArrayDialogChange({ count: event.target.value })}
              />
            </label>
            <label className="field">
              <span>间距 m</span>
              <input
                min={0.001}
                step={0.1}
                type="number"
                value={modelArrayDialog.spacing}
                onChange={(event) => handleModelArrayDialogChange({ spacing: event.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button className="icon-text-button" type="button" onClick={() => setModelArrayDialog(null)}>
                取消
              </button>
              <button className="command-button" type="submit">
                创建阵列
              </button>
            </div>
          </form>
        </div>
      )}

      {sceneDialogOpen && (
        <div className="modal-backdrop">
          <section className="modal-panel">
            <div className="panel-title">新建场景</div>
            <label className="field">
              <span>场景名称</span>
              <input value={sceneName} onChange={(event) => setSceneName(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button className="icon-text-button" type="button" onClick={() => setSceneDialogOpen(false)}>
                取消
              </button>
              <button
                className="command-button"
                type="button"
                title={cadImportNavigationTitle}
                disabled={cadImportActive}
                onClick={() => void handleCreateScene()}
              >
                创建
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
