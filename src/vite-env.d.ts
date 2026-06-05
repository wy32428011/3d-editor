/// <reference types="vite/client" />

declare module "earcut" {
  export default function earcut(data: number[], holeIndices?: number[], dim?: number): number[];
}
