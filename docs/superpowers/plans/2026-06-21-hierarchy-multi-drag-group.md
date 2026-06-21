# 模型树多选拖入 Group 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 左侧模型树多选后，拖拽任一已选节点时可把当前选区内可移动的顶层节点一起放入目标 group，或从 group 移回根级。

**Architecture:** `HierarchyPanel` 负责把拖拽起点解析成批量节点 ID，并在 UI 层过滤明显非法目标；`App` 只转发批量移动命令；`BabylonEditorEngine` 新增批量重父级 API，统一处理锁定、自身/后代循环、重复父子选区、undo、树刷新和选区快照。旧单节点 API 保留为兼容封装。

**Tech Stack:** React 19、TypeScript、Babylon.js、Electron/Vite。

---

### Task 1: 层级树拖拽批量语义

**Files:**
- Modify: `src/components/HierarchyPanel.tsx`

- [x] 将 `draggingId` 扩展为拖拽 ID 集合，拖拽已选节点时使用当前多选集合，拖拽未选节点时保持单节点语义。
- [x] group 投放校验改为检查每个拖拽节点，过滤锁定、目标自身、目标后代和已在目标下的节点。
- [x] drop 到 group 或根级时调用批量回调，drop 成功后展开目标 group。

### Task 2: App 与引擎批量移动接口

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/engine/BabylonEditorEngine.ts`

- [x] `App` 的 `handleMoveNodeToGroup` 接受 `number[]` 并调用引擎批量方法。
- [x] 引擎新增 `moveNodesToGroup(nodeIds, groupId)`，单次记录 undo，批量移动顶层合法节点，保持世界变换，刷新树和选区。
- [x] 保留 `moveNodeToGroup(nodeId, groupId)`，内部委托批量方法，兼容已有解组等调用。

### Task 3: 文档与验证

**Files:**
- Modify: `README.md`

- [x] 更新模型树功能说明和更新记录，明确多选拖拽归组。
- [x] 运行 `npm run build`，结果：`tsc -b && vite build && npm run electron:build` 全部 exit 0；Vite 仍有既有大 chunk 警告。
- [x] 运行 `git diff --check`，结果：exit 0，仅提示 Windows 换行转换。
- [x] 使用 `wmic process ... | findstr` 检查当前仓库相关 `node` / `electron` / `vite` / `chrome` 残留进程，结果：无匹配。
