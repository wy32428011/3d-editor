# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — 安装项目依赖。README 当前使用 npm 命令作为标准工作流。
- `npm run dev` — 启动 Vite 渲染端开发服务器，脚本监听 `0.0.0.0`。
- `npm run electron:dev` — 桌面开发模式；`scripts/dev-electron.mjs` 会先编译 Electron 主进程/preload，再启动 Vite，最后打开 Electron 窗口。
- `set ELECTRON_DEV_SMOKE_EXIT_MS=3000&& npm run electron:dev` — README 记录的 Windows cmd 冒烟验证命令；在 PowerShell 中可用 `$env:ELECTRON_DEV_SMOKE_EXIT_MS='3000'; npm run electron:dev` 达到同样效果。
- `npm run electron:build` — 单独编译 `electron/*.ts` 到 `dist-electron/`。
- `npm run build` — 完整生产构建：`tsc -b && vite build && npm run electron:build`。
- `npm run preview` — 启动 Vite preview，脚本监听 `0.0.0.0`。
- `npm run pack` — 构建并生成未安装版 Electron 应用目录。
- `npm run dist` — 构建并运行 `electron-builder` 打包。
- `npm run dist:win` — 构建并生成 Windows NSIS 安装程序。

当前 `package.json` 没有 `test`、`lint` 或单测脚本；不要假设存在 `npm test`、`npm run lint` 或“运行单个测试”的命令。若后续新增测试框架，先把脚本写入 `package.json` 和文档，再引用它们。

## High-level Architecture

这是一个 React 19 + Vite 6 + TypeScript + Electron 42 + Babylon.js 9 的桌面 3D 场景编辑器。渲染端负责 UI 和状态编排，Babylon 引擎类集中管理 WebGL 运行时，Electron 主进程负责本地项目文件与桌面窗口能力。

- `src/main.tsx` 挂载 React 应用，`src/App.tsx` 是渲染端状态编排入口。`App` 管理项目、场景、资产、选择、性能预览和保存状态，并把命令转发给 Babylon 引擎或 Electron bridge。
- `src/components/ViewportCanvas.tsx` 是 Babylon canvas 的生命周期边界：创建/释放 `BabylonEditorEngine`，同步工具模式、性能模式、预览模式，并处理基础对象、POI、资产和外部文件拖放。
- `src/engine/BabylonEditorEngine.ts` 是核心 3D 运行时。它负责 `Engine`/`Scene`/`ArcRotateCamera`、`GizmoManager`、选中高亮、动态工作网格、POI、资产登记、模型导入、场景实例化、场景序列化和米制元数据。
- `src/types/editor.ts` 定义 React 面板和 Babylon 引擎之间传递的稳定快照类型，如 `SceneNodeSummary`、`TransformSnapshot`、`AssetRecord` 和 `EditorStats`。
- `src/editor/math.ts` 与 `src/editor/units.ts` 放置通用转换和米制单位常量。编辑器约定 `1 Babylon unit = 1 m`，导入模型、属性面板和保存元数据都应保持该契约。
- `electron/main.ts` 是 Electron 主进程，负责窗口生命周期、外链拦截、单实例应用、最近项目、项目清单、场景文件、保存前备份和项目资产源文件持久化。
- `electron/preload.ts` 通过 `contextBridge` 暴露极小的 `window.electronApp` 能力面；`src/types/electron-app.d.ts` 定义渲染端可见的全局类型。IPC 改动通常需要同步这三处以及 `App` 中的调用点。
- `scripts/dev-electron.mjs` 串联 Electron 开发模式，直接用当前 Node 启动 TypeScript、Vite 和 Electron CLI，并在退出时清理子进程，避免 Windows `.cmd` shim 的 spawn 兼容问题。

## Project Data Flow

应用启动后先进入 `ProjectLauncher`。用户创建、打开或选择最近项目后，`App` 激活项目和场景，再通过 `window.electronApp.projects.loadScene()` 读取场景数据，并交给 `BabylonEditorEngine.loadSerializedScene()` 恢复 Babylon 内容。

项目数据采用本地文件优先格式：`.babylon-editor/project.json` 保存项目清单，`scenes/*.scene.json` 保存单个场景，`scenes/.backups/` 保存覆盖前备份，`assets/source/` 保存导入资产的源文件副本。保存场景时主进程会先备份旧文件；渲染端在场景读取中、读取失败或预览播放中会阻止保存，避免空场景或动画中间帧覆盖磁盘。

资产导入有两条语义：工具栏和资产面板选择模型文件时只登记到资产浏览器，不立即写入当前场景；从资产区拖入视口时才实例化。外部文件直接拖到视口会立即导入到场景，并同步登记为可复用资产。维护导入相关逻辑时要同时考虑资产记录、项目内源文件、同批依赖文件、Babylon `FilesInputStore`、模型单位 metadata 和场景序列化元数据。

## Working Notes for Future Claude Instances

- React 组件应保持 UI 展示和命令转发职责；不要把 Babylon 场景生命周期或 WebGL 资源管理分散到面板组件中。优先在 `BabylonEditorEngine` 内扩展 3D 行为。
- 修改 Electron 项目文件能力时，同步检查 `electron/main.ts`、`electron/preload.ts`、`src/types/electron-app.d.ts` 和渲染端调用点，确保 IPC 名称、参数和返回类型一致。
- 场景加载失败保护是核心数据安全逻辑。不要绕过 `sceneLoading`、`sceneLoadFailed`、保存前备份或“加载失败不清空当前场景”的保护。
- Babylon.js 采用子路径按需导入，并依赖若干副作用导入注册 loader/序列化能力；不要轻易改回 `@babylonjs/core` 桶导入。Inspector 相关实现需以 `BabylonEditorEngine` 中的实际加载逻辑为准，避免把 Inspector 直接纳入生产构建依赖图。
- 模型进入编辑器后统一以米为场景单位；不要通过修改源 GLB/GLTF 文件修复单位问题。导入逻辑应在 Babylon/glTF 节点变换生效后按世界包围盒推断源单位，不要重复应用非标准的 `extras.transformData.scale`，并保持 `AssetRecord` 中的单位 metadata 可保存、可恢复、可复用。
- `dist/`、`dist-electron/`、`release/` 和 `node_modules/` 不是源码修复入口。Electron 源码在 `electron/*.ts`，渲染端源码在 `src/`。
- 仓库未发现 `.cursorrules`、`.cursor/rules/` 或 `.github/copilot-instructions.md`；README 是当前项目说明的主要来源。

## Verification Guidance

文档改动只需核对内容。代码改动的常用验证是 `npm run build`；涉及 Electron 启动、窗口生命周期或 IPC 时，优先补跑 Electron 开发模式或 `ELECTRON_DEV_SMOKE_EXIT_MS` 冒烟验证。由于当前没有测试脚本，不要在未实际运行对应命令时声称测试或 lint 已通过。
