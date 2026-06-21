# 工作网格呼吸光晕实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 2026-06-21 语义修订：用户明确“不需要按照模式来控制呼吸效果”，本计划中的“降载模式保留低强度呼吸光晕”策略已被废弃。最终实现以 `2026-06-21-toolbar-grid-controls.md` 为准，工作网格显示和呼吸光晕均由工具栏显式开关控制。

**Goal:** 历史目标为工作网格始终保持可感知的呼吸光晕；现已修订为呼吸效果由用户显式开关控制，画质和降载模式不再接管呼吸效果。

**Architecture:** WebGL 视觉行为继续集中在 `BabylonEditorEngine`。最终策略改为 `App -> Toolbar / ViewportCanvas -> BabylonEditorEngine` 单向同步两个显式布尔开关；隐藏网格只隐藏视觉 helper，透明拖放平面保留；关闭呼吸时基础网格保持可见，闪光层和 GlowLayer 关闭。

**Tech Stack:** TypeScript、Babylon.js GlowLayer、React/Electron/Vite。

---

### Task 1: 网格光晕运行态

**Files:**
- Modify: `src/engine/BabylonEditorEngine.ts`

- [x] 新增降载模式下的网格光晕强度常量。2026-06-21 后续修订中已移除，避免画质模式控制呼吸强度。
- [x] 调整 `updateGridGlow()`，不再因 `shouldReduceEditorVisualEffects()` 直接关闭光晕；后续进一步改为只受工具栏呼吸开关控制。
- [x] 调整 `updateGridFlash()`，降载时继续按呼吸周期更新 GlowLayer，但保持网格线可见性稳定，避免额外闪烁动画。2026-06-21 后续修订中已改为降载不再控制网格闪烁。

### Task 2: 文档和验证

**Files:**
- Modify: `README.md`

- [x] 更新工作网格说明；2026-06-21 后续修订已改为明确工具栏显式开关优先。
- [x] 添加 2026-06-21 变更记录。
- [x] 运行 `npm run build`，结果：`tsc -b && vite build && npm run electron:build` 全部 exit 0；Vite 仍有既有大 chunk 警告。
- [x] 运行 `git diff --check`，结果：exit 0，仅提示 Windows 换行转换。
- [x] 检查并清理本次相关残留进程：发现并结束 `F:\3d-editor` 相关 Electron renderer PID 9668，复查无匹配。
