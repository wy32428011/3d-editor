import { Box, Camera, Eye, EyeOff, FileAxis3d, Lightbulb, MapPin, Network, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { SceneNodeKind, SceneNodeSummary } from "../types/editor";

interface HierarchyPanelProps {
  nodes: SceneNodeSummary[];
  onSelect: (id: number) => void;
  onFocus: (id: number) => void;
  onCreateNode: () => void;
  onToggleVisibility: (id: number, visible: boolean) => void;
}

/** 左侧层级面板展示 Babylon 场景节点，并负责搜索、选择、新建和显隐切换。 */
export function HierarchyPanel({ nodes, onSelect, onFocus, onCreateNode, onToggleVisibility }: HierarchyPanelProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredNodes = useMemo(
    () => nodes.filter((node) => matchesNodeQuery(node, normalizedQuery)),
    [nodes, normalizedQuery]
  );

  return (
    <aside className="panel hierarchy-panel">
      <div className="hierarchy-toolbar">
        <label className="hierarchy-search">
          <Search size={19} />
          <input value={query} placeholder="请输入关键词搜索..." onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className="hierarchy-create-button" type="button" onClick={onCreateNode}>
          <Plus size={17} />
          <span>新建</span>
        </button>
      </div>
      <div className="node-list">
        {filteredNodes.length === 0 && <div className="empty-state">没有匹配的场景节点</div>}
        {filteredNodes.map((node) => {
          const Icon = getNodeIcon(node.kind);
          return (
            <div
              key={node.id}
              className={`node-row ${node.selected ? "is-selected" : ""} ${node.visible ? "" : "is-hidden"}`}
            >
              <button
                className={`node-visibility-button ${node.visible ? "" : "is-hidden"}`}
                type="button"
                title={node.visible ? "隐藏模型" : "显示模型"}
                onClick={() => onToggleVisibility(node.id, !node.visible)}
              >
                {node.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button
                className="node-main-button"
                style={{ paddingLeft: 20 + node.depth * 16 }}
                type="button"
                title={`${node.name} (${node.kind})`}
                onClick={() => onSelect(node.id)}
                onDoubleClick={() => onFocus(node.id)}
              >
                <Icon className="node-kind-icon" size={18} />
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

  return Box;
}

/** 判断节点是否匹配层级搜索关键词，支持名称和类型。 */
function matchesNodeQuery(node: SceneNodeSummary, query: string): boolean {
  return !query || node.name.toLowerCase().includes(query) || node.kind.toLowerCase().includes(query);
}
