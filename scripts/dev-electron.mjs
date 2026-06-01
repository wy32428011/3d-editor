import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const nodeCommand = process.execPath;
const tscEntry = path.join(root, "node_modules", "typescript", "bin", "tsc");
const viteEntry = path.join(root, "node_modules", "vite", "bin", "vite.js");
const electronEntry = path.join(root, "node_modules", "electron", "cli.js");
const rendererUrl = "http://127.0.0.1:5173";
const smokeExitMs = Number.parseInt(process.env.ELECTRON_DEV_SMOKE_EXIT_MS ?? "0", 10);
const children = new Set();

/** 启动子进程并统一继承终端输出，便于开发时直接看错误。 */
function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    ...options
  });

  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

/** 执行一次性命令，失败时终止整个开发启动流程。 */
function runOnce(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} 退出码：${code}`));
    });
  });
}

/** 等待 Vite 开发服务器可访问后再启动 Electron。 */
async function waitForRenderer(url, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`等待渲染进程超时：${url}`);
}

/** 清理开发进程，避免 Vite 或 Electron 在后台残留。 */
function cleanup() {
  for (const child of children) {
    child.kill();
  }
}

/** 冒烟验证时自动退出，正常开发运行不会启用。 */
function scheduleSmokeExit() {
  if (!Number.isFinite(smokeExitMs) || smokeExitMs <= 0) {
    return;
  }

  setTimeout(() => {
    cleanup();
    process.exit(0);
  }, smokeExitMs);
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

await runOnce(nodeCommand, [tscEntry, "-p", "tsconfig.electron.json"]);
spawnProcess(nodeCommand, [viteEntry, "--host", "0.0.0.0"]);
await waitForRenderer(rendererUrl);

const electronProcess = spawnProcess(nodeCommand, [electronEntry, "."], {
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl
  }
});

scheduleSmokeExit();

electronProcess.once("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
