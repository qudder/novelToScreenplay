import { useEffect, useMemo, useRef } from "react";
import { Graph } from "@antv/g6";
import { PageHeader } from "../../shared/PageHeader";
import { useCurrentNovel } from "../../shared/currentNovel";
import { characters as mockCharacters, relationships as mockRelationships } from "../../shared/mockData";
import type { Character, Relationship } from "../../shared/types";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

type GraphNode = {
  id: string;
  data: {
    label: string;
    role: string;
    importance: number;
  };
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  data: {
    label: string;
    strength: number;
    evidence?: string;
  };
};

function resolveRelationshipEndpoint(value: string, characters: Character[]) {
  return characters.find((character) => character.id === value || character.name === value)?.id ?? value;
}

function buildGraphData(characters: Character[], relationships: Relationship[]) {
  const nodeIds = new Set(characters.map((character) => character.id));
  const nodes: GraphNode[] = characters.map((character) => ({
    id: character.id,
    data: {
      label: character.name,
      role: character.role,
      importance: character.importance
    }
  }));

  const edgeMap = new Map<string, GraphEdge>();

  relationships.forEach((relationship, index) => {
    const source = resolveRelationshipEndpoint(relationship.source, characters);
    const target = resolveRelationshipEndpoint(relationship.target, characters);
    if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return;

    const key = [source, target].sort().join("--");
    const existing = edgeMap.get(key);
    if (!existing) {
      edgeMap.set(key, {
        id: relationship.id || `edge-${source}-${target}-${index}`,
        source,
        target,
        data: {
          label: relationship.type,
          strength: relationship.strength,
          evidence: relationship.evidence
        }
      });
      return;
    }

    const labels = new Set(existing.data.label.split(" / ").filter(Boolean));
    labels.add(relationship.type);
    existing.data.label = Array.from(labels).join(" / ");
    existing.data.strength = Math.max(existing.data.strength, relationship.strength);
    existing.data.evidence = [existing.data.evidence, relationship.evidence].filter(Boolean).join(" / ");
  });

  const edges = Array.from(edgeMap.values());

  return { nodes, edges };
}

export function RelationshipsPage() {
  const sectionRef = useEntranceAnimation<HTMLDivElement>();
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const currentNovel = useCurrentNovel();

  const visibleCharacters = currentNovel ? currentNovel.characters : mockCharacters;
  const visibleRelationships = currentNovel ? currentNovel.relationships : mockRelationships;
  const graphData = useMemo(
    () => buildGraphData(visibleCharacters, visibleRelationships),
    [visibleCharacters, visibleRelationships]
  );

  useEffect(() => {
    if (!graphContainerRef.current || graphData.nodes.length === 0 || graphData.edges.length === 0) return;

    graphRef.current?.destroy();

    const graph = new Graph({
      container: graphContainerRef.current,
      autoFit: "view",
      data: graphData,
      layout: {
        type: "force",
        preventOverlap: true,
        linkDistance: 180
      },
      node: {
        style: {
          size: (datum) => Math.max(36, Math.min(72, Number(datum.data?.importance ?? 50))),
          fill: "#f8fbfb",
          stroke: "#2f6f73",
          lineWidth: 1.5,
          labelText: (datum) => String(datum.data?.label ?? ""),
          labelFill: "#173b3d",
          labelFontSize: 13,
          labelPlacement: "center",
          labelMaxWidth: 96
        },
        state: {
          active: {
            stroke: "#f0c45c",
            lineWidth: 3
          }
        }
      },
      edge: {
        style: {
          stroke: "#86a6a2",
          lineWidth: (datum) => Math.max(1, Math.min(5, Number(datum.data?.strength ?? 50) / 22)),
          labelText: (datum) => String(datum.data?.label ?? ""),
          labelFill: "#536467",
          labelFontSize: 11,
          endArrow: true
        },
        state: {
          active: {
            stroke: "#f0c45c",
            lineWidth: 4
          }
        }
      },
      behaviors: ["drag-canvas", "zoom-canvas", "drag-element", "hover-activate"]
    });

    graph.render();
    graphRef.current = graph;

    const resizeObserver = new ResizeObserver(() => {
      graph.resize();
      graph.fitView();
    });
    resizeObserver.observe(graphContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      graph.destroy();
      graphRef.current = null;
    };
  }, [graphData]);

  return (
    <section ref={sectionRef} className="page">
      <PageHeader
        eyebrow="Story Graph"
        title="人物关系图"
        description="基于 G6 展示角色网络，节点表示人物，边表示关系类型和强度。"
      />
      {currentNovel ? (
        <div className="current-novel-banner animate-in">
          当前小说：{currentNovel.filename} · 分析状态：{currentNovel.analysisStatus ?? "idle"} ·{" "}
          {visibleCharacters.length} 个角色 · {graphData.edges.length} 条关系
        </div>
      ) : null}
      <div className="graph-panel animate-in">
        {graphData.nodes.length > 0 && graphData.edges.length > 0 ? (
          <div ref={graphContainerRef} className="g6-graph-canvas" />
        ) : (
          <div className="empty-graph-state">
            <strong>暂无关系数据</strong>
            <p>当前小说还没有可展示的人物关系。请先在“小说导入”页启动并完成叙事分析。</p>
          </div>
        )}
      </div>
    </section>
  );
}
