import { useEffect, useRef } from "react";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BabylonEditorEngine } from "../engine/BabylonEditorEngine";
import { isPoiKind } from "../editor/poiCatalog";
import type { EditorEngineCallbacks, EditorTool, PoiKind, PrimitiveKind, RenderQualityMode, TransformSnapshot } from "../types/editor";

interface ViewportCanvasProps {
  callbacks: EditorEngineCallbacks;
  tool: EditorTool;
  renderQualityMode: RenderQualityMode;
  previewMode: boolean;
  overheadMode: boolean;
  gridVisible: boolean;
  gridBreathingEffectEnabled: boolean;
  onEngineReady: (engine: BabylonEditorEngine | null) => void;
  onDropAsset: (assetId: string, position: Vector3, engine: BabylonEditorEngine) => void | Promise<void>;
  onDropFiles: (files: FileList, position: Vector3, engine: BabylonEditorEngine) => void | Promise<void>;
  onModelContextMenu: (target: TransformSnapshot | null, point: { x: number; y: number }) => void;
}

interface RightPointerState {
  x: number;
  y: number;
  dragged: boolean;
  cameraNavigation: boolean;
}

const RIGHT_BUTTON = 2;
const CONTEXT_MENU_DRAG_THRESHOLD = 6;
const RIGHT_POINTER_STALE_MS = 800;

type PointerLike = Pick<PointerEvent, "altKey" | "button" | "clientX" | "clientY">;

/** 中央视口承载 Babylon canvas，并处理文件拖拽和内置资产拖拽。 */
export function ViewportCanvas({
  callbacks,
  tool,
  renderQualityMode,
  previewMode,
  overheadMode,
  gridVisible,
  gridBreathingEffectEnabled,
  onEngineReady,
  onDropAsset,
  onDropFiles,
  onModelContextMenu
}: ViewportCanvasProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BabylonEditorEngine | null>(null);
  const rightPointerRef = useRef<RightPointerState | null>(null);
  const rightPointerCleanupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const editorEngine = new BabylonEditorEngine(canvasRef.current, callbacks);
    engineRef.current = editorEngine;
    onEngineReady(editorEngine);
    const resizeFrame = window.requestAnimationFrame(() => editorEngine.resize());
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            editorEngine.resize();
          });
    if (shellRef.current) {
      resizeObserver?.observe(shellRef.current);
    }

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      editorEngine.dispose();
      engineRef.current = null;
      onEngineReady(null);
    };
  }, [callbacks, onEngineReady]);

  useEffect(() => {
    engineRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    engineRef.current?.setRenderQualityMode(renderQualityMode);
  }, [renderQualityMode]);

  useEffect(() => {
    engineRef.current?.setGridVisible(gridVisible);
  }, [gridVisible]);

  useEffect(() => {
    engineRef.current?.setGridBreathingEffectEnabled(gridBreathingEffectEnabled);
  }, [gridBreathingEffectEnabled]);

  useEffect(() => {
    engineRef.current?.setPreviewMode(previewMode);
  }, [previewMode]);

  useEffect(() => {
    engineRef.current?.setOverheadMode(overheadMode);
  }, [overheadMode]);

  /** 允许浏览器把文件或内置对象拖放到视口。 */
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  /** 根据拖放内容创建基础对象或导入外部文件。 */
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    const point = engine.getGroundPointFromClient(event.clientX, event.clientY);
    const primitive = event.dataTransfer.getData("application/x-editor-primitive") as PrimitiveKind;
    if (primitive) {
      engine.addPrimitive(primitive, point);
      return;
    }

    const poi = event.dataTransfer.getData("application/x-editor-poi");
    if (isPoiKind(poi)) {
      engine.addPoi(poi, point);
      return;
    }

    const assetId = event.dataTransfer.getData("application/x-editor-asset");
    if (assetId) {
      void onDropAsset(assetId, point, engine);
      return;
    }

    if (event.dataTransfer.files.length) {
      void onDropFiles(event.dataTransfer.files, point, engine);
    }
  };

  /** 记录右键按下位置，用于区分菜单点击和右键拖动画面。 */
  const handlePointerDown = (event: PointerLike) => {
    if (event.button !== RIGHT_BUTTON) {
      return;
    }

    clearRightPointerCleanupTimer();
    rightPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      dragged: false,
      cameraNavigation: event.altKey
    };
    // 新一轮右键操作开始时先关闭旧菜单；普通右键单击随后会由 contextmenu 重新打开命中对象菜单。
    onModelContextMenu(null, { x: event.clientX, y: event.clientY });
  };

  /** 超过阈值的右键移动视为相机导航，不再弹出模型菜单。 */
  const handlePointerMove = (event: PointerLike) => {
    const pointer = rightPointerRef.current;
    if (!pointer) {
      return;
    }

    const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    if (distance > CONTEXT_MENU_DRAG_THRESHOLD && !pointer.dragged) {
      pointer.dragged = true;
      onModelContextMenu(null, { x: event.clientX, y: event.clientY });
    }
  };

  /** contextmenu 可能被 Alt+右键缩放抑制，延迟清理避免右键状态残留到下一次操作。 */
  const scheduleRightPointerCleanup = (event: PointerLike) => {
    if (event.button !== RIGHT_BUTTON) {
      return;
    }

    clearRightPointerCleanupTimer();
    rightPointerCleanupTimerRef.current = window.setTimeout(() => {
      rightPointerRef.current = null;
      rightPointerCleanupTimerRef.current = null;
    }, RIGHT_POINTER_STALE_MS);
  };

  /** 取消或失焦时没有后续菜单事件，直接清理右键状态。 */
  const clearRightPointerState = () => {
    clearRightPointerCleanupTimer();
    rightPointerRef.current = null;
  };

  /** 清理右键状态的延迟任务，避免重复计时器持有旧闭包。 */
  const clearRightPointerCleanupTimer = () => {
    if (rightPointerCleanupTimerRef.current === null) {
      return;
    }

    window.clearTimeout(rightPointerCleanupTimerRef.current);
    rightPointerCleanupTimerRef.current = null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // Babylon 会在 canvas 上捕获指针，原生监听能稳定收到右键拖拽的移动事件。
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", scheduleRightPointerCleanup);
    canvas.addEventListener("pointercancel", clearRightPointerState);
    window.addEventListener("blur", clearRightPointerState);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", scheduleRightPointerCleanup);
      canvas.removeEventListener("pointercancel", clearRightPointerState);
      window.removeEventListener("blur", clearRightPointerState);
      clearRightPointerCleanupTimer();
    };
  }, [onModelContextMenu]);

  /** 右键菜单只在编辑态、未拖拽、非 Alt+右键缩放且命中可编辑场景对象时打开。 */
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    clearRightPointerCleanupTimer();
    const pointer = rightPointerRef.current;
    const dragged =
      pointer?.dragged ||
      (pointer ? Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > CONTEXT_MENU_DRAG_THRESHOLD : false);
    const cameraNavigation =
      previewMode || pointer?.cameraNavigation || event.altKey || Boolean(engineRef.current?.hasActiveOrRecentCameraNavigation());
    rightPointerRef.current = null;
    if (dragged || cameraNavigation) {
      onModelContextMenu(null, { x: event.clientX, y: event.clientY });
      return;
    }

    const target = engineRef.current?.pickContextMenuTargetFromClient(event.clientX, event.clientY) ?? null;
    onModelContextMenu(target, { x: event.clientX, y: event.clientY });
  };

  return (
    <main
      ref={shellRef}
      className="viewport-shell"
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className="viewport-canvas"
      />
    </main>
  );
}
