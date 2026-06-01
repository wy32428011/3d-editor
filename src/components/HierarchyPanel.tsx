import { Camera, Eye, EyeOff, Lightbulb, Network, Shapes } from "lucide-react";
import type { SceneNodeKind, SceneNodeSummary } from "../types/editor";

interface HierarchyPanelProps {
  nodes: SceneNodeSummary[];
  onSelect: (id: number) => void;
}

/** 左侧层级面板展示 Babylon 场景节点，并负责把选择意图传回引擎。 */
export function HierarchyPanel({ nodes, onSelect }: HierarchyPanelProps) {
  return (
    <aside className="panel hierarchy-panel">
      <div className="panel-title">层级</div>
      <div className="node-list">
        {nodes.map((node) => {
          const Icon = getNodeIcon(node.kind);
          return (
            <button
              key={node.id}
              className={`node-row ${node.selected ? "is-selected" : ""}`}
              style={{ paddingLeft: 12 + node.depth * 16 }}
              type="button"
              onClick={() => onSelect(node.id)}
            >
              <Icon size={15} />
              <span className="node-name">{node.name}</span>
              <span className="node-meta">{node.kind}</span>
              {node.visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
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

  return Shapes;
}
