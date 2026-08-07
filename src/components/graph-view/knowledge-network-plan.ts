import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force-3d';

export type KnowledgeNetworkWorkspace = {
  id: string;
  name: string;
  detail: string;
  relation: 'current' | 'referenced';
};

export type KnowledgeNetworkReference = {
  id: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
};

export type KnowledgeNetworkSourceFamily =
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'text'
  | 'table'
  | 'structured'
  | 'code'
  | 'captions'
  | 'notebook'
  | 'image'
  | 'audio'
  | 'video'
  | 'neutral';

export type KnowledgeNetworkArtifactTone = 'orange' | 'blue' | 'teal' | 'rose' | 'violet' | 'green';

export type KnowledgeNetworkSource = {
  id: string;
  workspaceId: string;
  name: string;
  detail: string;
  family: KnowledgeNetworkSourceFamily;
  artifactTone?: KnowledgeNetworkArtifactTone;
  chunkCount: number;
};

export type KnowledgeNetworkTrace = {
  id: string;
  query: string;
  currentWorkspaceId: string;
  workspaces: KnowledgeNetworkWorkspace[];
  references: KnowledgeNetworkReference[];
  sources: KnowledgeNetworkSource[];
  chunks: Array<{ id: string; sourceId: string; label: string; locator: string; rank: number }>;
  paths: Array<{ id: string; workspaceIds: string[]; sourceId?: string; chunkId?: string }>;
  selectedChunkIds: string[];
  citedChunkIds: string[];
};

export type KnowledgeNetworkDiscoveryEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: 'workspace' | 'source';
};

export type KnowledgeNetworkNodeVisualMetric = {
  weight: number;
  radius: number;
  inbound: number;
  outbound: number;
};

export type KnowledgeNetworkGraphPlan = {
  layout: Record<string, { x: number; y: number }>;
  nodeMetrics: Record<string, KnowledgeNetworkNodeVisualMetric>;
  visibleNodeIds: string[];
  visibleEdges: KnowledgeNetworkDiscoveryEdge[];
};

type KnowledgeNetworkNodeKind = 'workspace' | 'source';

const KNOWLEDGE_NETWORK_NODE_SIZE_MULTIPLIER = 1.25;
const LAYOUT_TICKS = 420;

const KNOWLEDGE_NETWORK_PHYSICS = {
  linkDistance: { workspace: 128, source: 86 },
  linkStrength: { workspace: 0.36, source: 0.22 },
  charge: { workspace: -92, source: -24 },
  collisionPadding: { workspace: 4, source: 3 },
  collisionStrength: 0.9,
  collisionIterations: 2,
  chargeDistanceMin: 1,
  chargeDistanceMax: 360,
  centerStrength: 0.06,
  velocityDecay: 0.4,
  alphaDecay: 0.0228,
  alphaMin: 0.001,
} as const;

type LayoutNode = {
  id: string;
  kind: KnowledgeNetworkNodeKind;
  radius: number;
  x: number;
  y: number;
};

type LayoutLink = {
  source: string;
  target: string;
  kind: KnowledgeNetworkDiscoveryEdge['kind'];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nodeRadius(weight: number): number {
  return KNOWLEDGE_NETWORK_NODE_SIZE_MULTIPLIER * clamp(3 * Math.sqrt(Math.max(0, weight) + 1), 8, 30);
}

function nodeKindById(trace: KnowledgeNetworkTrace): Map<string, KnowledgeNetworkNodeKind> {
  const kinds = new Map<string, KnowledgeNetworkNodeKind>();
  for (const workspace of trace.workspaces) kinds.set(workspace.id, 'workspace');
  for (const source of trace.sources) kinds.set(source.id, 'source');
  return kinds;
}

function discoveryEdges(trace: KnowledgeNetworkTrace): KnowledgeNetworkDiscoveryEdge[] {
  const workspaceIds = new Set(trace.workspaces.map((workspace) => workspace.id));
  const edgeIds = new Set<string>();
  const edges: KnowledgeNetworkDiscoveryEdge[] = [];

  for (const reference of trace.references) {
    if (
      !workspaceIds.has(reference.sourceWorkspaceId) ||
      !workspaceIds.has(reference.targetWorkspaceId) ||
      reference.sourceWorkspaceId === reference.targetWorkspaceId
    ) {
      continue;
    }
    const id = `workspace-reference:${reference.id}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      fromId: reference.sourceWorkspaceId,
      toId: reference.targetWorkspaceId,
      kind: 'workspace',
    });
  }

  for (const source of trace.sources) {
    if (!workspaceIds.has(source.workspaceId)) continue;
    const id = `workspace-source:${source.workspaceId}:${source.id}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({ id, fromId: source.workspaceId, toId: source.id, kind: 'source' });
  }

  return edges;
}

function nodeMetrics(
  trace: KnowledgeNetworkTrace,
  edges: KnowledgeNetworkDiscoveryEdge[]
): Record<string, KnowledgeNetworkNodeVisualMetric> {
  const kinds = nodeKindById(trace);
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();

  for (const edge of edges) {
    if (!kinds.has(edge.fromId) || !kinds.has(edge.toId)) continue;
    outbound.set(edge.fromId, (outbound.get(edge.fromId) ?? 0) + 1);
    inbound.set(edge.toId, (inbound.get(edge.toId) ?? 0) + 1);
  }

  const metrics: Record<string, KnowledgeNetworkNodeVisualMetric> = {};
  for (const [id] of kinds) {
    const nodeInbound = inbound.get(id) ?? 0;
    const nodeOutbound = outbound.get(id) ?? 0;
    const weight = nodeInbound + nodeOutbound;
    metrics[id] = {
      weight,
      radius: nodeRadius(weight),
      inbound: nodeInbound,
      outbound: nodeOutbound,
    };
  }
  return metrics;
}

function stableHash(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableAngle(id: string): number {
  return ((stableHash(id) % 3600) / 3600) * Math.PI * 2;
}

function seedLayout(nodes: LayoutNode[], trace: KnowledgeNetworkTrace): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const current = nodeById.get(trace.currentWorkspaceId);
  if (current) {
    current.x = 0;
    current.y = 0;
  }

  for (const workspace of trace.workspaces) {
    if (workspace.id === trace.currentWorkspaceId) continue;
    const node = nodeById.get(workspace.id);
    if (!node) continue;
    const angle = stableAngle(workspace.id);
    const radius = 160 + (stableHash(workspace.id) % 4) * 42;
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
  }

  for (const source of trace.sources) {
    const node = nodeById.get(source.id);
    const workspace = nodeById.get(source.workspaceId);
    if (!node) continue;
    const angle = stableAngle(source.id);
    const radius = 74 + (stableHash(source.id) % 3) * 18;
    node.x = (workspace?.x ?? 0) + Math.cos(angle) * radius;
    node.y = (workspace?.y ?? 0) + Math.sin(angle) * radius;
  }
}

function computeLayout(
  trace: KnowledgeNetworkTrace,
  edges: KnowledgeNetworkDiscoveryEdge[],
  metrics: Record<string, KnowledgeNetworkNodeVisualMetric>
): Record<string, { x: number; y: number }> {
  const nodes: LayoutNode[] = [...nodeKindById(trace)].map(([id, kind]) => ({
    id,
    kind,
    radius: metrics[id]?.radius ?? 10,
    x: 0,
    y: 0,
  }));
  seedLayout(nodes, trace);

  const links: LayoutLink[] = edges.map((edge) => ({
    source: edge.fromId,
    target: edge.toId,
    kind: edge.kind,
  }));
  const simulation = forceSimulation(nodes, 2)
    .force(
      'link',
      forceLink<LayoutNode, LayoutLink>(links)
        .id((node: LayoutNode) => node.id)
        .distance((link: LayoutLink) => KNOWLEDGE_NETWORK_PHYSICS.linkDistance[link.kind])
        .strength((link: LayoutLink) => KNOWLEDGE_NETWORK_PHYSICS.linkStrength[link.kind])
    )
    .force(
      'charge',
      forceManyBody<LayoutNode>()
        .strength((node: LayoutNode) => KNOWLEDGE_NETWORK_PHYSICS.charge[node.kind])
        .distanceMin(KNOWLEDGE_NETWORK_PHYSICS.chargeDistanceMin)
        .distanceMax(KNOWLEDGE_NETWORK_PHYSICS.chargeDistanceMax)
    )
    .force('center', forceCenter(0, 0).strength(KNOWLEDGE_NETWORK_PHYSICS.centerStrength))
    .force(
      'collision',
      forceCollide<LayoutNode>((node) => node.radius + KNOWLEDGE_NETWORK_PHYSICS.collisionPadding[node.kind])
        .strength(KNOWLEDGE_NETWORK_PHYSICS.collisionStrength)
        .iterations(KNOWLEDGE_NETWORK_PHYSICS.collisionIterations)
    )
    .velocityDecay(KNOWLEDGE_NETWORK_PHYSICS.velocityDecay)
    .alphaDecay(KNOWLEDGE_NETWORK_PHYSICS.alphaDecay)
    .alphaMin(KNOWLEDGE_NETWORK_PHYSICS.alphaMin)
    .stop();

  for (let index = 0; index < LAYOUT_TICKS; index += 1) simulation.tick();
  return Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

export function prepareKnowledgeNetworkGraphPlan(trace: KnowledgeNetworkTrace): KnowledgeNetworkGraphPlan {
  if (trace.sources.length === 0 && trace.references.length === 0) {
    return { layout: {}, nodeMetrics: {}, visibleNodeIds: [], visibleEdges: [] };
  }

  const visibleNodeIds = [
    ...trace.workspaces.map((workspace) => workspace.id),
    ...trace.sources.map((source) => source.id),
  ];
  const visibleEdges = discoveryEdges(trace);
  const metrics = nodeMetrics(trace, visibleEdges);
  return {
    layout: computeLayout(trace, visibleEdges, metrics),
    nodeMetrics: metrics,
    visibleNodeIds,
    visibleEdges,
  };
}
