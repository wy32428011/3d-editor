import { useEffect, useRef } from "react";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BabylonEditorEngine } from "../engine/BabylonEditorEngine";
import { isPoiKind } from "../editor/poiCatalog";
import type { EditorEngineCallbacks, EditorTool, PoiKind, PrimitiveKind } from "../types/editor";

interface ViewportCanvasProps {
  callbacks: EditorEngineCallbacks;
  tool: EditorTool;
  performanceMode: boolean;
  previewMode: boolean;
  onEngineReady: (engine: BabylonEditorEngine | null) => void;
  onDropAsset: (assetId: string, position: Vector3, engine: BabylonEditorEngine) => void | Promise<void>;
  onDropFiles: (files: FileList, position: Vector3, engine: BabylonEditorEngine) => void | Promise<void>;
}

/** 中央视口承载 Babylon canvas，并处理文件拖拽和内置资产拖拽。 */
export function ViewportCanvas({
  callbacks,
  tool,
  performanceMode,
  previewMode,
  onEngineReady,
  onDropAsset,
  onDropFiles
}: ViewportCanvasProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BabylonEditorEngine | null>(null);

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
    engineRef.current?.setPerformanceMode(performanceMode);
  }, [performanceMode]);

  useEffect(() => {
    engineRef.current?.setPreviewMode(previewMode);
  }, [previewMode]);

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

  return (
    <main ref={shellRef} className="viewport-shell" onDragOver={handleDragOver} onDrop={handleDrop}>
      <canvas ref={canvasRef} className="viewport-canvas" />
    </main>
  );
}
