import ReactFlow, { Background, Controls, Edge, Node } from "reactflow";
import { PageHeader } from "../../shared/PageHeader";
import { characters, relationships } from "../../shared/mockData";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

const nodes: Node[] = characters.map((character, index) => ({
  id: character.id,
  position: {
    x: 120 + (index % 2) * 320,
    y: 80 + Math.floor(index / 2) * 180
  },
  data: {
    label: `${character.name} · ${character.role}`
  },
  style: {
    border: "1px solid #2f6f73",
    borderRadius: 8,
    padding: 10,
    width: 160,
    background: "#f8fbfb",
    color: "#173b3d"
  }
}));

const edges: Edge[] = relationships.map((relationship) => ({
  id: relationship.id,
  source: relationship.source,
  target: relationship.target,
  label: `${relationship.type} ${relationship.strength}`,
  animated: relationship.strength > 80,
  style: {
    strokeWidth: Math.max(1, relationship.strength / 30),
    stroke: relationship.type === "敌对" ? "#b84a4a" : "#2f6f73"
  }
}));

export function RelationshipsPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="Story Graph"
        title="人物关系图"
        description="以人物为节点、关系为边，展示互动强度、关系类型和核心矛盾。"
      />
      <div className="graph-panel animate-in">
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}

