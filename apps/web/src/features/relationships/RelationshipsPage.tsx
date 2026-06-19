import { useEffect, useMemo, useRef } from "react";
import { Graph } from "@antv/g6";
import { useNavigate } from "react-router-dom";
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
    size: number;
    isMainCharacter: boolean;
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

function resolveRelationshipEndpoint(value: string, characterIdMap: Map<string, string>) {
  return characterIdMap.get(value) ?? value;
}

function getCharacterNodeSize(importance: number) {
  return Math.max(46, Math.min(86, importance));
}

function buildGraphData(characters: Character[], relationships: Relationship[]) {
  const mainCharacter = [...characters].sort((a, b) => b.importance - a.importance)[0];
  const nodeIds = new Set(characters.map((character) => character.id));
  const characterIdMap = new Map<string, string>();
  characters.forEach((character) => {
    characterIdMap.set(character.id, character.id);
    characterIdMap.set(character.name, character.id);
  });

  const nodes: GraphNode[] = characters.map((character) => ({
    id: character.id,
    data: {
      label: character.name,
      role: character.role,
      importance: character.importance,
      size: getCharacterNodeSize(character.importance),
      isMainCharacter: character.id === mainCharacter?.id
    }
  }));

  const edgeMap = new Map<string, GraphEdge>();

  relationships.forEach((relationship, index) => {
    const source = resolveRelationshipEndpoint(relationship.source, characterIdMap);
    const target = resolveRelationshipEndpoint(relationship.target, characterIdMap);
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

  return { nodes, edges, mainCharacterId: mainCharacter?.id ?? "" };
}

function buildGraphDataSignature(characters: Character[], relationships: Relationship[]) {
  return JSON.stringify({
    characters: characters.map((character) => [
      character.id,
      character.name,
      character.role,
      character.importance
    ]),
    relationships: relationships.map((relationship) => [
      relationship.id,
      relationship.source,
      relationship.target,
      relationship.type,
      relationship.strength,
      relationship.evidence
    ])
  });
}

export function RelationshipsPage() {
  const sectionRef = useEntranceAnimation<HTMLDivElement>();
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const navigate = useNavigate();
  const currentNovel = useCurrentNovel();

  const visibleCharacters = currentNovel ? currentNovel.characters : mockCharacters;
  const visibleRelationships = currentNovel ? currentNovel.relationships : mockRelationships;
  const graphDataSignature = useMemo(
    () => buildGraphDataSignature(visibleCharacters, visibleRelationships),
    [visibleCharacters, visibleRelationships]
  );
  const graphData = useMemo(
    () => buildGraphData(visibleCharacters, visibleRelationships),
    [graphDataSignature]
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
        nodeSize: (datum: unknown) => {
          const node = datum as { data?: { size?: number } };
          return Number(node.data?.size ?? 56) + 34;
        },
        nodeSpacing: 28,
        collideStrength: 1,
        linkDistance: 230,
        center: [graphContainerRef.current.clientWidth / 2, graphContainerRef.current.clientHeight / 2],
        nodeStrength: (datum: unknown) => {
          const node = datum as { data?: { isMainCharacter?: boolean } };
          return node.data?.isMainCharacter ? -420 : -180;
        }
      },
      node: {
        style: {
          size: (datum) => Number(datum.data?.size ?? 56),
          fill: (datum) => (datum.data?.isMainCharacter ? "#fff4d2" : "#f8fbfb"),
          stroke: (datum) => (datum.data?.isMainCharacter ? "#c28c15" : "#2f6f73"),
          lineWidth: (datum) => (datum.data?.isMainCharacter ? 2.5 : 1.5),
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
    graph.on("node:click", (event: unknown) => {
      const nodeId = getGraphNodeId(event);
      if (!nodeId) return;
      navigate(`/characters?characterId=${encodeURIComponent(nodeId)}&from=relationships`);
    });

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        graph.resize();
      });
    });
    resizeObserver.observe(graphContainerRef.current);

    const fitFrame = window.requestAnimationFrame(() => {
      graph.resize();
      graph.focusElement(graphData.mainCharacterId || graphData.nodes[0]?.id, {
        duration: 240
      });
    });

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      window.cancelAnimationFrame(fitFrame);
      resizeObserver.disconnect();
      graph.destroy();
      graphRef.current = null;
    };
  }, [graphData, navigate]);

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

function getGraphNodeId(event: unknown) {
  const payload = event as {
    target?: { id?: string };
    targetType?: string;
    data?: { id?: string };
    item?: { id?: string; getID?: () => string };
  };
  return payload.target?.id || payload.data?.id || payload.item?.id || payload.item?.getID?.() || "";
}
