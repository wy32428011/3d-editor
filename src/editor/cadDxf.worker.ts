import { parseCadDxfLineStream, type CadDxfLineChunk, type CadDxfLineProgress, type CadLineImportSummary } from "./cadDxf";

interface CadDxfWorkerStartMessage {
  type: "start";
  fileName: string;
  text: string;
  sourcePath?: string;
  projectMode?: boolean;
}

interface CadDxfWorkerChunkMessage {
  type: "chunk";
  chunkId: string;
  style: CadDxfLineChunk["style"];
  segmentCount: number;
  positionsBuffer: ArrayBuffer;
  bounds: CadDxfLineChunk["bounds"];
}

interface CadDxfWorkerProgressMessage {
  type: "progress";
  progress: CadDxfLineProgress;
}

interface CadDxfWorkerDoneMessage {
  type: "done";
  summary: CadLineImportSummary;
}

interface CadDxfWorkerErrorMessage {
  type: "error";
  message: string;
  detail?: string;
}

type CadDxfWorkerOutboundMessage =
  | CadDxfWorkerChunkMessage
  | CadDxfWorkerProgressMessage
  | CadDxfWorkerDoneMessage
  | CadDxfWorkerErrorMessage;

interface CadDxfWorkerScope {
  onmessage: ((event: MessageEvent<CadDxfWorkerStartMessage>) => void) | null;
  postMessage: (message: CadDxfWorkerOutboundMessage, transfer?: Transferable[]) => void;
}

const ctx = self as unknown as CadDxfWorkerScope;

/** CAD Worker 只负责解析和二进制线段输出，Babylon mesh 创建留在主线程。 */
ctx.onmessage = (event: MessageEvent<CadDxfWorkerStartMessage>) => {
  const message = event.data;
  if (!message || message.type !== "start") {
    return;
  }

  try {
    const summary = parseCadDxfLineStream(message.fileName, message.text, {
      emitChunk: (chunk) => {
        const positionsBuffer = chunk.positions.buffer as ArrayBuffer;
        const outbound: CadDxfWorkerOutboundMessage = {
          type: "chunk",
          chunkId: chunk.chunkId,
          style: chunk.style,
          segmentCount: chunk.segmentCount,
          positionsBuffer,
          bounds: chunk.bounds
        };
        ctx.postMessage(outbound, [positionsBuffer]);
      },
      reportProgress: (progress) => {
        ctx.postMessage({ type: "progress", progress } satisfies CadDxfWorkerProgressMessage);
      }
    });
    ctx.postMessage({ type: "done", summary } satisfies CadDxfWorkerDoneMessage);
  } catch (error) {
    ctx.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "CAD 解析失败。",
      detail: error instanceof Error ? error.stack : String(error)
    } satisfies CadDxfWorkerErrorMessage);
  }
};
