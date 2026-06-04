import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import ts from "typescript";

/** 模型包运行脚本默认运行类名，兼容当前 11 个模型包的合并脚本契约。 */
export const DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS = "ParametricModelRuntimeComponent";

/** 模型包运行类实例，生命周期方法由业务脚本按需实现。 */
export interface ModelPackageRuntimeInstance {
  onStart?: () => void;
  onUpdate?: () => void;
  onStop?: () => void;
}

/** 已编译出的模型包运行类构造函数。 */
export type ModelPackageRuntimeConstructor = new (node: TransformNode) => ModelPackageRuntimeInstance;

interface RuntimeCompileResult {
  runtimeConstructor?: ModelPackageRuntimeConstructor;
  warning?: string;
}

const compiledConstructors = new Map<string, RuntimeCompileResult>();
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/**
 * 编译项目内模型包运行脚本。
 * 这里仅为可信本地模型包提供最小执行环境；Function 不是强沙箱，不能用于不可信远程脚本。
 */
export function compileModelPackageRuntime(
  scriptText: string,
  sourceFile: string,
  className = DEFAULT_MODEL_PACKAGE_RUNTIME_CLASS
): RuntimeCompileResult {
  if (!scriptText.trim()) {
    return { warning: `${sourceFile} 运行脚本文本为空，已跳过参数实时驱动。` };
  }

  if (!IDENTIFIER_PATTERN.test(className)) {
    return { warning: `${sourceFile} 运行类名 ${className} 非法，已跳过参数实时驱动。` };
  }

  const cacheKey = `${sourceFile}:${className}:${hashScriptText(scriptText)}`;
  const cached = compiledConstructors.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const strippedScript = stripUnsupportedModelRuntimeSyntax(scriptText);
    const transpiled = ts.transpileModule(strippedScript, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.None,
        useDefineForClassFields: true,
        experimentalDecorators: false
      },
      fileName: sourceFile,
      reportDiagnostics: false
    }).outputText;

    const runtimeFactory = new Function(
      "TransformNode",
      "Vector3",
      "window",
      "document",
      "globalThis",
      "fetch",
      "XMLHttpRequest",
      "localStorage",
      "sessionStorage",
      "navigator",
      "Worker",
      "WebSocket",
      "EventSource",
      "require",
      "process",
      "module",
      "Function",
      `"use strict";\n${transpiled}\nreturn typeof ${className} === "function" ? ${className} : undefined;`
    );
    const constructor = runtimeFactory(
      TransformNode,
      Vector3,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    const result: RuntimeCompileResult =
      typeof constructor === "function"
        ? { runtimeConstructor: constructor as ModelPackageRuntimeConstructor }
        : { warning: `${sourceFile} 中未找到运行类 ${className}，已跳过参数实时驱动。` };
    compiledConstructors.set(cacheKey, result);
    return result;
  } catch (error) {
    const result = { warning: `${sourceFile} 运行脚本编译失败：${formatRuntimeError(error)}` };
    compiledConstructors.set(cacheKey, result);
    return result;
  }
}

/** 调用运行类生命周期，所有异常都降级为告警，避免阻断属性保存。 */
export function invokeModelPackageRuntimeLifecycle(
  instance: ModelPackageRuntimeInstance,
  methodName: keyof ModelPackageRuntimeInstance,
  sourceFile: string
): string | undefined {
  const method = instance[methodName];
  if (typeof method !== "function") {
    return undefined;
  }

  try {
    method.call(instance);
    return undefined;
  } catch (error) {
    return `${sourceFile} 执行 ${methodName} 失败：${formatRuntimeError(error)}`;
  }
}

/** 去掉 import/export 和属性装饰器，让模型包脚本可以在受控注入环境里转译执行。 */
function stripUnsupportedModelRuntimeSyntax(scriptText: string): string {
  return scriptText
    .replace(/^\s*import\s+[^;\r\n]+;?\s*$/gm, "")
    .replace(/^\s*@visibleAs[A-Za-z0-9_]+\([^\r\n]*\)\s*$/gm, "")
    .replace(/\bexport\s+(?=(class|interface|type|enum|const|let|var|function)\b)/g, "");
}

/** 生成轻量脚本文本哈希，用于同一包同一脚本重复实例化时复用编译结果。 */
function hashScriptText(scriptText: string): string {
  let hash = 2166136261;
  for (let index = 0; index < scriptText.length; index += 1) {
    hash ^= scriptText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/** 统一格式化运行器异常，避免把复杂对象直接写入 UI。 */
function formatRuntimeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "未知错误";
}
