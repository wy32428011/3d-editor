# 工具栏网格显示与呼吸控制实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 工具栏新增“网格显示/隐藏”和“呼吸光晕开关”，呼吸效果由用户显式控制，不再由画质或降载模式决定。

**Architecture:** `App` 持有两个显式布尔状态并传给 `Toolbar` 与 `ViewportCanvas`；`Toolbar` 使用现有 icon-button 模式展示开关；`ViewportCanvas` 把状态同步到 `BabylonEditorEngine`；引擎负责隐藏/显示网格 helper 和启停呼吸 GlowLayer，画质/降载逻辑只影响渲染质量与拾取策略，不再控制呼吸开关。

**Tech Stack:** React 19、TypeScript、Babylon.js GlowLayer、lucide-react、Vite/Electron。

---

### Task 1: UI 状态链路

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/components/ViewportCanvas.tsx`

- [x] 在 `App` 新增 `gridVisible` 与 `gridBreathingEffectEnabled` 状态，默认均为 `true`。
- [x] `Toolbar` 增加两个图标按钮，保持现有工具栏按钮样式，分别切换网格显示与呼吸光晕。
- [x] `ViewportCanvas` 接收两个布尔值并同步调用引擎公开方法。

### Task 2: Babylon 网格运行态

**Files:**
- Modify: `src/engine/BabylonEditorEngine.ts`

- [x] 新增 `setGridVisible(enabled)`，控制网格 helper 显隐，保持透明拖放平面可用于拖放落点。
- [x] 新增 `setGridBreathingEffectEnabled(enabled)`，控制呼吸光晕是否运行。
- [x] 移除呼吸光晕对 `shouldReduceEditorVisualEffects()` 的依赖；画质和降载不再关闭、弱化或冻结用户开启的呼吸光晕。

### Task 3: 文档与验证

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-06-21-grid-breathing-glow.md`

- [x] 更新 README 工具栏、网格和画质说明，明确用户开关优先。
- [x] 更新上一份呼吸光晕计划文档，记录语义修订。
- [x] 运行 `npm run build`，结果：`tsc -b && vite build && npm run electron:build` 全部 exit 0；Vite 仍有既有大 chunk 警告。
- [x] 运行 `git diff --check`，结果：exit 0，仅提示 Windows 换行转换。
- [x] 检查并清理本次相关残留进程：当前仅匹配到检查命令自身，退出后无本项目残留进程需要结束。
