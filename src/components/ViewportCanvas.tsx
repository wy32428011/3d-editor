import { useEffect, useRef } from "react";
import { BabylonEditorEngine } from "../engine/BabylonEditorEngine";
import type { EditorEngineCallbacks, EditorTool, PrimitiveKind } from "../types/editor";

interface ViewportCanvasProps {
  callbacks: EditorEngineCallbacks;
  tool: EditorTool;
  performanceMode: boolean;
  onEngineReady: (engine: BabylonEditorEngine | null) => void;
}

/** 中央视口承载 Babylon canvas，并处理文件拖拽和内置资产拖拽。 */
export function ViewportCanvas({ callbacks, tool, performanceMode, onEngineReady }: ViewportCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BabylonEditorEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const editorEngine = new BabylonEditorEngine(canvasRef.current, callbacks);
    engineRef.current = editorEngine;
    onEngineReady(editorEngine);

    return () => {
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

    if (event.dataTransfer.files.length) {
      void engine.importFiles(event.dataTransfer.files, point);
    }
  };

  return (
    <main className="viewport-shell" onDragOver={handleDragOver} onDrop={handleDrop}>
      <canvas ref={canvasRef} className="viewport-canvas" />
      <div className="viewport-corner">
        <span>X</span>
        <span>Y</span>
        <span>Z</span>
      </div>
    </main>
  );
}
