import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Vector3Snapshot } from "../types/editor";

/** 将弧度换算成面板更易读的角度值。 */
export function radiansToDegrees(value: number): number {
  return Number(((value * 180) / Math.PI).toFixed(2));
}

/** 将面板中的角度值换算回 Babylon 使用的弧度值。 */
export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** 从 Babylon Vector3 创建可序列化的轻量快照。 */
export function snapshotVector(vector: Vector3, mode: "raw" | "degrees" = "raw"): Vector3Snapshot {
  if (mode === "degrees") {
    return {
      x: radiansToDegrees(vector.x),
      y: radiansToDegrees(vector.y),
      z: radiansToDegrees(vector.z)
    };
  }

  return {
    x: Number(vector.x.toFixed(3)),
    y: Number(vector.y.toFixed(3)),
    z: Number(vector.z.toFixed(3))
  };
}

/** 将 React 面板传入的快照写回到 Babylon Vector3。 */
export function applySnapshotVector(target: Vector3, value: Vector3Snapshot, mode: "raw" | "degrees" = "raw"): void {
  if (mode === "degrees") {
    target.set(degreesToRadians(value.x), degreesToRadians(value.y), degreesToRadians(value.z));
    return;
  }

  target.set(value.x, value.y, value.z);
}

/** 生成紧凑的文件体积标签，避免资产面板显示过长数字。 */
export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
