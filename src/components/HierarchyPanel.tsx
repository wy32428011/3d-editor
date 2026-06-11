import {
  Box,
  Camera,
  ChevronDown,
  ChevronRight,
  Cuboid,
  Eye,
  EyeOff,
  FileAxis3d,
  FolderTree,
  Lightbulb,
  Lock,
  MapPin,
  Network,
  Plus,
  Search,
  Unlock
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { HierarchySelectionIntent, SceneNodeKind, SceneNodeSummary } from "../types/editor";

export interface HierarchyExpansionCommand {
  action: "expand" | "collapse" | "toggle";
  targetId?: number;
  token: number;
}

interface HierarchyPanelProps {
  title?: string;
  nodes: SceneNodeSummary[];
  expansionCommand?: HierarchyExpansionCommand | null;
  onSelect: (intent: HierarchySelectionIntent) => void;
  onFocus: (id: number) => void;
  onCreateNode: () => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
  onToggleLock: (id: number, locked: boolean) => void;
  onMoveNodeToGroup: (id: number, groupId: number | null) => void;
  onNodeContextMenu: (node: SceneNodeSummary, point: { x: number; y: number }) => void;
  onBlankContextMenu: (point: { x: number; y: number }) => void;
}

const nodeDragMimeType = "application/x-editor-scene-node";

/** 左侧模型树展示可编辑模型和逻辑分组，负责搜索、展开、锁定、显隐和拖拽归组。 */
export function HierarchyPanel({
  title = "模型树",
  nodes,
  expansionCommand,
  onSelect,
  onFocus,
  onCreateNode,
  onToggleVisibility,
  onToggleLock,
  onMoveNodeToGroup,
  onNodeContextMenu,
  onBlankContextMenu
}: HierarchyPanelProps) {
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | "root" | null>(null);
  const consumedExpansionTokenRef = useRef<number | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  useEffect(() => {
    setExpandedGroups((current) => {
      let changed = false;
      const next = { ...current };
      nodes.forEach((node) => {
        if (node.kind === "Group" && next[node.id] === undefined) {
          next[node.id] = true;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [nodes]);

  useEffect(() => {
    if (!expansionCommand || consumedExpansionTokenRef.current === expansionCommand.token) {
      return;
    }

    consumedExpansionTokenRef.current = expansionCommand.token;
    setExpandedGroups((current) => applyExpansionCommand(current, nodes, expansionCommand));
  }, [expansionCommand, nodes]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => shouldRenderNode(node, nodes, nodeById, expandedGroups, normalizedQuery)),
    [expandedGroups, nodeById, nodes, normalizedQuery]
  );

  /** 切换 group 展开状态，非 group 节点不会触发展开逻辑。 */
  const toggleExpanded = (node: SceneNodeSummary) => {
    if (node.kind !== "Group" || !node.hasChildren) {
      return;
    }

    setExpandedGroups((current) => ({
      ...current,
      [node.id]: current[node.id] === false
    }));
  };

  /** 开始拖拽未锁定节点，锁定节点只允许选择和解锁。 */
  const handleDragStart = (event: DragEvent<HTMLDivElement>, node: SceneNodeSummary) => {
    if (node.locked) {
      event.preventDefault();
      return;
    }

    setDraggingId(node.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(nodeDragMimeType, String(node.id));
  };

  /** 结束拖拽时清理所有高亮态。 */
  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  /** 判断当前拖拽节点能否投放到指定 group。 */
  const canDropOnGroup = (target: SceneNodeSummary): boolean => {
    if (draggingId === null || target.kind !== "Group" || target.locked || target.id === draggingId) {
      return false;
    }

    return !isNodeDescendant(target.id, draggingId, nodeById);
  };

  /** 允许把未锁定节点投放到 group 上。 */
  const handleRowDragOver = (event: DragEvent<HTMLDivElement>, node: SceneNodeSummary) => {
    if (!canDropOnGroup(node)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(node.id);
  };

  /** 把拖拽节点移动到目标 group 下，非法关系由引擎再次兜底拦截。 */
  const handleRowDrop = (event: DragEvent<HTMLDivElement>, node: SceneNodeSummary) => {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = readDraggedNodeId(event);
    if (nodeId === null || !canDropOnGroup(node)) {
      handleDragEnd();
      return;
    }

    onMoveNodeToGroup(nodeId, node.id);
    setExpandedGroups((current) => ({ ...current, [node.id]: true }));
    handleDragEnd();
  };

  /** 根区域允许把子节点移回场景根级。 */
  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (draggingId === null) {
      return;
    }

    const node = nodeById.get(draggingId);
    if (!node || node.locked || node.parentId === undefined) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId("root");
  };

  /** 拖到列表空白区域时把节点移回根级。 */
  const handleRootDrop = (event: DragEvent<HTMLDivElement>) => {
    if (draggingId === null) {
      return;
    }

    event.preventDefault();
    const nodeId = readDraggedNodeId(event);
    if (nodeId !== null) {
      onMoveNodeToGroup(nodeId, null);
    }
    handleDragEnd();
  };

  /** 打开节点右键菜单，具体可用命令由 App 按当前引擎状态继续校验。 */
  const handleNodeContextMenu = (event: ReactMouseEvent<HTMLDivElement>, node: SceneNodeSummary) => {
    event.preventDefault();
    event.stopPropagation();
    onNodeContextMenu(node, { x: event.clientX, y: event.clientY });
  };

  /** 把鼠标修饰键和当前可见行顺序交给 App 计算最终选区。 */
  const handleNodeSelect = (event: ReactMouseEvent<HTMLButtonElement>, node: SceneNodeSummary) => {
    onSelect({
      id: node.id,
      visibleIds: visibleNodes.map((item) => item.id),
      toggle: event.ctrlKey || event.metaKey,
      range: event.shiftKey
    });
  };

  /** 打开树空白区域右键菜单，用于新建文件夹和批量展开折叠。 */
  const handleBlankContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onBlankContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <aside className="panel hierarchy-panel">
      <div className="hierarchy-header">
        <div className="hierarchy-title" title={title}>
          {title}
        </div>
        <div className="hierarchy-label">模型树</div>
        <div className="hierarchy-toolbar">
          <label className="hierarchy-search">
            <Search size={16} />
            <input value={query} placeholder="请输入关键词搜索..." onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="hierarchy-create-button" type="button" onClick={onCreateNode}>
            <Plus size={14} />
            <span>新建</span>
          </button>
        </div>
      </div>
      <div
        className={`node-list ${dropTargetId === "root" ? "is-root-drop-target" : ""}`}
        onContextMenu={handleBlankContextMenu}
        onDragLeave={() => setDropTargetId((current) => (current === "root" ? null : current))}
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
      >
        {visibleNodes.length === 0 && <div className="empty-state">没有匹配的场景节点</div>}
        {visibleNodes.map((node) => {
          const Icon = getNodeIcon(node.kind);
          const expanded = expandedGroups[node.id] !== false;
          const canDrop = dropTargetId === node.id;
          return (
            <div
              key={node.id}
              className={`node-row ${node.selected ? "is-selected" : ""} ${node.primarySelected ? "is-primary-selected" : ""} ${
                node.visible ? "" : "is-hidden"
              } ${
                node.locked ? "is-locked" : ""
              } ${canDrop ? "is-drop-target" : ""}`}
              draggable={!node.locked}
              onDragStart={(event) => handleDragStart(event, node)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => setDropTargetId((current) => (current === node.id ? null : current))}
              onDragOver={(event) => handleRowDragOver(event, node)}
              onDrop={(event) => handleRowDrop(event, node)}
              onContextMenu={(event) => handleNodeContextMenu(event, node)}
            >
              <button
                className={`node-visibility-button ${node.visible ? "" : "is-hidden"}`}
                type="button"
                title={node.visible ? "隐藏模型" : "显示模型"}
                disabled={node.locked}
                onClick={() => onToggleVisibility(node.id, !node.visible)}
              >
                {node.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                className={`node-lock-button ${node.locked ? "is-locked" : ""}`}
                type="button"
                title={getLockTitle(node)}
                disabled={node.lockedByAncestor && !node.selfLocked}
                onClick={() => onToggleLock(node.id, !node.selfLocked)}
              >
                {node.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
              <button
                className="node-main-button"
                style={{ paddingLeft: 6 + node.depth * 18 }}
                type="button"
                title={`${node.name} (${node.kind})`}
                onClick={(event) => handleNodeSelect(event, node)}
                onDoubleClick={() => onFocus(node.id)}
              >
                <span className="node-expander-slot">
                  {node.kind === "Group" && node.hasChildren && (
                    <span
                      className="node-expander"
                      title={expanded ? "折叠分组" : "展开分组"}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleExpanded(node);
                      }}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  )}
                </span>
                <Icon className="node-kind-icon" size={15} />
                <span className="node-name">{node.name}</span>
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** 根据节点类型选择对应图标，提升层级扫描效率。 */
function getNodeIcon(kind: SceneNodeKind) {
  if (kind === "Group") {
    return FolderTree;
  }

  if (kind === "Light") {
    return Lightbulb;
  }

  if (kind === "Camera") {
    return Camera;
  }

  if (kind === "Transform") {
    return Network;
  }

  if (kind === "POI") {
    return MapPin;
  }

  if (kind === "CAD") {
    return FileAxis3d;
  }

  if (kind === "Locator") {
    return Cuboid;
  }

  return Box;
}

/** 执行外层快捷键或右键菜单下发的展开折叠命令，保持模型树状态仍归属本组件。 */
function applyExpansionCommand(
  current: Record<number, boolean>,
  nodes: SceneNodeSummary[],
  command: HierarchyExpansionCommand
): Record<number, boolean> {
  const groupIds = nodes.filter((node) => node.kind === "Group" && node.hasChildren).map((node) => node.id);
  if (groupIds.length === 0) {
    return current;
  }

  if (command.targetId !== undefined && groupIds.includes(command.targetId)) {
    const expanded = command.action === "toggle" ? current[command.targetId] === false : command.action === "expand";
    return {
      ...current,
      [command.targetId]: expanded
    };
  }

  const shouldExpand = command.action === "toggle" ? groupIds.some((id) => current[id] === false) : command.action === "expand";
  const next = { ...current };
  groupIds.forEach((id) => {
    next[id] = shouldExpand;
  });
  return next;
}

/** 判断节点是否匹配层级搜索关键词，支持名称和类型。 */
function matchesNodeQuery(node: SceneNodeSummary, query: string): boolean {
  return !query || node.name.toLowerCase().includes(query) || node.kind.toLowerCase().includes(query);
}

/** 判断节点是否应该渲染，搜索时会保留命中子节点的父级路径。 */
function shouldRenderNode(
  node: SceneNodeSummary,
  nodes: SceneNodeSummary[],
  nodeById: Map<number, SceneNodeSummary>,
  expandedGroups: Record<number, boolean>,
  query: string
): boolean {
  if (!query) {
    return areAncestorsExpanded(node, nodeById, expandedGroups);
  }

  if (matchesNodeQuery(node, query) || hasMatchingDescendant(node.id, nodes, query)) {
    return true;
  }

  return hasMatchingAncestor(node, nodeById, query);
}

/** 无搜索时，只有所有父级 group 展开才显示节点。 */
function areAncestorsExpanded(
  node: SceneNodeSummary,
  nodeById: Map<number, SceneNodeSummary>,
  expandedGroups: Record<number, boolean>
): boolean {
  let parentId = node.parentId;
  while (parentId !== undefined) {
    if (expandedGroups[parentId] === false) {
      return false;
    }
    parentId = nodeById.get(parentId)?.parentId;
  }
  return true;
}

/** 判断指定节点下是否有搜索命中的后代节点。 */
function hasMatchingDescendant(parentId: number, nodes: SceneNodeSummary[], query: string): boolean {
  return nodes.some((node) => node.parentId === parentId && (matchesNodeQuery(node, query) || hasMatchingDescendant(node.id, nodes, query)));
}

/** 判断节点的父级链路是否命中搜索，确保 group 命中时显示其子节点。 */
function hasMatchingAncestor(node: SceneNodeSummary, nodeById: Map<number, SceneNodeSummary>, query: string): boolean {
  let parentId = node.parentId;
  while (parentId !== undefined) {
    const parent = nodeById.get(parentId);
    if (!parent) {
      return false;
    }

    if (matchesNodeQuery(parent, query)) {
      return true;
    }
    parentId = parent.parentId;
  }
  return false;
}

/** 判断 candidateId 是否已经位于 ancestorId 下，避免拖拽形成循环。 */
function isNodeDescendant(candidateId: number, ancestorId: number, nodeById: Map<number, SceneNodeSummary>): boolean {
  let current = nodeById.get(candidateId);
  while (current?.parentId !== undefined) {
    if (current.parentId === ancestorId) {
      return true;
    }
    current = nodeById.get(current.parentId);
  }
  return false;
}

/** 从拖拽事件中读取节点 ID，非法 payload 会被忽略。 */
function readDraggedNodeId(event: DragEvent): number | null {
  const rawId = event.dataTransfer.getData(nodeDragMimeType);
  if (!rawId) {
    return null;
  }

  const id = Number(rawId);
  return Number.isInteger(id) ? id : null;
}

/** 生成锁按钮提示，区分自身锁定和父级继承锁定。 */
function getLockTitle(node: SceneNodeSummary): string {
  if (node.lockedByAncestor && !node.selfLocked) {
    return "父级分组已锁定";
  }

  return node.selfLocked ? "解锁模型" : "锁定模型";
}
