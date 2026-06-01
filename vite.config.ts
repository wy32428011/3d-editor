import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 配置 Vite 构建入口，保持开发与生产构建一致。 */
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173
  }
});
