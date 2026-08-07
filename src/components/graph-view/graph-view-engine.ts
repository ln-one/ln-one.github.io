import { degreeWeightedRadius, mergeGraphViewForces } from './forces';
import { readGraphViewSharedVersion } from './shared-protocol';
import type {
  GraphViewData,
  GraphViewEdge,
  GraphViewForceConfig,
  GraphViewNode,
  GraphViewWorkerRequest,
  GraphViewWorkerResponse,
} from './types';

type GraphViewWorkerFactory = () => Worker;

export type GraphViewEngineOptions<TData = unknown> = {
  forces?: Partial<GraphViewForceConfig>;
  createWorker?: GraphViewWorkerFactory;
  /** Injected only for deterministic tests; production follows Math.random. */
  random?: () => number;
  onUpdate?: (nodes: readonly GraphViewNode<TData>[]) => void;
  onSettled?: () => void;
  onError?: (error: Error) => void;
};

type MutableGraphViewNode<TData> = GraphViewNode<TData>;

const DEFAULT_ALPHA = 1;
const GRAPH_UPDATE_ALPHA = 0.3;

function linkPairKey(source: string, target: string): string {
  return `${source}\u0000${target}`;
}

function normalizeLinks(
  links: readonly GraphViewData['links'][number][],
  nodeIds: ReadonlySet<string>
): GraphViewEdge[] {
  const normalized: GraphViewEdge[] = [];
  const seenPairs = new Set<string>();
  const seenIds = new Set<string>();
  for (const link of links) {
    if (link.source === link.target) continue;
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) continue;
    // The source renderer stores adjacency by target id, so repeated links
    // with different transport ids still represent one visible relationship.
    const pair = linkPairKey(link.source, link.target);
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    // The original renderer keys a visible relationship by its endpoints;
    // transport-level link ids are not part of the graph identity.
    const baseId = `${link.source}→${link.target}`;
    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) id = `${baseId}#${suffix++}`;
    seenIds.add(id);
    normalized.push({ id, source: link.source, target: link.target });
  }
  return normalized;
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./graph-view.worker.ts', import.meta.url), { type: 'module' });
}

export class GraphViewEngine<TData = unknown> {
  private readonly worker: Worker;
  private readonly onUpdate?: GraphViewEngineOptions<TData>['onUpdate'];
  private readonly onSettled?: GraphViewEngineOptions<TData>['onSettled'];
  private readonly onError?: GraphViewEngineOptions<TData>['onError'];
  private readonly random: () => number;
  private readonly nodesById = new Map<string, MutableGraphViewNode<TData>>();
  private nodes: MutableGraphViewNode<TData>[] = [];
  private links: GraphViewEdge[] = [];
  private forces: GraphViewForceConfig;
  private readonly initialPositions = new Map<string, { x: number; y: number }>();
  private version = 0;
  private commandSequence = 0;
  private minimumAcceptedSequence = 0;
  private revision = 0;
  private sharedPositionBuffer: SharedArrayBuffer | null = null;
  private sharedPositionVersion = -1;
  private disposed = false;

  constructor(options: GraphViewEngineOptions<TData> = {}) {
    this.forces = mergeGraphViewForces(options.forces);
    this.onUpdate = options.onUpdate;
    this.onSettled = options.onSettled;
    this.onError = options.onError;
    this.random = options.random ?? Math.random;
    this.worker = (options.createWorker ?? defaultWorkerFactory)();
    this.worker.onmessage = this.handleMessage;
    this.worker.onerror = (event) => {
      this.onError?.(new Error(event.message || 'Graph simulation worker failed'));
    };
  }

  getGraphData(): { nodes: readonly GraphViewNode<TData>[]; links: readonly GraphViewEdge[] } {
    return { nodes: this.nodes, links: this.links };
  }

  /**
   * Monotonically increasing render revision for consumers that keep a cached
   * canvas scene. It changes when graph data or worker positions change, not
   * when the camera moves.
   */
  getRevision(): number {
    return this.revision;
  }

  getForces(): GraphViewForceConfig {
    return { ...this.forces };
  }

  setData(data: GraphViewData<TData>): void {
    this.assertActive();
    const nextIds = new Set<string>();
    const inputById = new Map<string, GraphViewData<TData>['nodes'][number]>();
    for (const input of data.nodes) {
      if (nextIds.has(input.id)) {
        throw new Error(`Graph node ids must be unique: ${input.id}`);
      }
      nextIds.add(input.id);
      inputById.set(input.id, input);
    }

    const normalizedLinks = normalizeLinks(data.links, nextIds);
    const existingLinksByPair = new Map(
      this.links.map((link) => [linkPairKey(link.source, link.target), link] as const)
    );
    const nextLinks = normalizedLinks.map(
      (link) => existingLinksByPair.get(linkPairKey(link.source, link.target)) ?? link
    );
    const degreeById = new Map<string, number>();
    const neighborsById = new Map<string, string[]>();
    for (const link of nextLinks) {
      degreeById.set(link.source, (degreeById.get(link.source) ?? 0) + 1);
      degreeById.set(link.target, (degreeById.get(link.target) ?? 0) + 1);
      neighborsById.set(link.source, [...(neighborsById.get(link.source) ?? []), link.target]);
      neighborsById.set(link.target, [...(neighborsById.get(link.target) ?? []), link.source]);
    }

    // Build the complete node table before seeding new nodes. The source
    // renderer can place a new node around any node in the same update, not
    // just around nodes that happened to exist in the previous update.
    const nextNodes: MutableGraphViewNode<TData>[] = [];
    const nextNodesById = new Map<string, MutableGraphViewNode<TData>>();
    const newNodeIds = new Set<string>();
    const previousWeights = new Map([...this.nodesById].map(([id, node]) => [id, node.weight] as const));
    const inputOrder = [
      ...this.nodes.map((node) => node.id).filter((id) => nextIds.has(id)),
      ...data.nodes.map((input) => input.id).filter((id) => !this.nodesById.has(id)),
    ];
    for (const id of inputOrder) {
      const input = inputById.get(id);
      if (!input) continue;
      const existing = this.nodesById.get(input.id);
      const suppliedPosition =
        Number.isFinite(input.x) && Number.isFinite(input.y) ? { x: input.x as number, y: input.y as number } : null;
      const position = existing ? { x: existing.x, y: existing.y } : (suppliedPosition ?? { x: 0, y: 0 });
      const node =
        existing ??
        ({
          id: input.id,
          weight: 0,
          x: position.x,
          y: position.y,
          vx: 0,
          vy: 0,
          fx: null,
          fy: null,
        } satisfies MutableGraphViewNode<TData>);

      if (input.data === undefined) delete node.data;
      else node.data = input.data;
      const explicitWeight = data.weights?.[input.id];
      const weight =
        data.weights !== undefined
          ? Number.isFinite(explicitWeight)
            ? Math.max(0, explicitWeight as number)
            : 0
          : Number.isFinite(input.weight)
            ? Math.max(0, input.weight as number)
            : (degreeById.get(input.id) ?? 0);
      node.weight = weight;
      node.radius = input.radius ?? degreeWeightedRadius(weight);
      if (!existing) {
        newNodeIds.add(input.id);
        node.x = position.x;
        node.y = position.y;
      }
      nextNodes.push(node);
      nextNodesById.set(node.id, node);
    }

    const unpositionedNewNodes = nextNodes.filter((node) => {
      if (!newNodeIds.has(node.id)) return false;
      const input = inputById.get(node.id);
      return input !== undefined && !(Number.isFinite(input.x) && Number.isFinite(input.y));
    });
    const maxExistingDistanceSquared = this.nodes.reduce(
      (maximum, node) => Math.max(maximum, node.x * node.x + node.y * node.y),
      0
    );
    const seededArea = unpositionedNewNodes.length * 60 * 60;
    const outerRadius = Math.sqrt(maxExistingDistanceSquared);
    const annulusWidth = seededArea > 0 ? Math.sqrt(seededArea / Math.PI + outerRadius * outerRadius) - outerRadius : 0;
    const relatedJitter = Math.sqrt(seededArea);

    // The original renderer processes new nodes in insertion order. Once a
    // node has been seeded, later nodes in the same update may use it as an
    // already-positioned neighbour. This matters for a streamed branch: the
    // branch should grow outwards instead of putting every new node at the
    // same stale origin.
    const positionedNodeIds = new Set<string>(
      nextNodes.filter((node) => !newNodeIds.has(node.id)).map((node) => node.id)
    );

    // The original renderer seeds a new node around the average position of
    // already-positioned related nodes. Isolated nodes are placed in an
    // annulus outside the current graph so insertion does not cover the hub.
    for (const node of unpositionedNewNodes) {
      const input = inputById.get(node.id);
      if (!input || (Number.isFinite(input.x) && Number.isFinite(input.y))) continue;
      const neighbors = (neighborsById.get(node.id) ?? [])
        .map((id) => nextNodesById.get(id))
        .filter(
          (neighbor): neighbor is MutableGraphViewNode<TData> =>
            neighbor !== undefined &&
            positionedNodeIds.has(neighbor.id) &&
            Number.isFinite(neighbor.x) &&
            Number.isFinite(neighbor.y)
        );
      if (neighbors.length > 0) {
        const center = neighbors.reduce(
          (result, neighbor) => ({ x: result.x + neighbor.x, y: result.y + neighbor.y }),
          { x: 0, y: 0 }
        );
        node.x = center.x / neighbors.length + (this.random() - 0.5) * relatedJitter;
        node.y = center.y / neighbors.length + (this.random() - 0.5) * relatedJitter;
      } else {
        const angle = this.random() * Math.PI * 2;
        const radius = outerRadius + Math.sqrt(this.random()) * annulusWidth;
        node.x = radius * Math.cos(angle);
        node.y = radius * Math.sin(angle);
      }
      positionedNodeIds.add(node.id);
    }

    for (const node of nextNodes) {
      if (!this.initialPositions.has(node.id)) {
        this.initialPositions.set(node.id, { x: node.x, y: node.y });
      }
    }

    const sameNodeIds =
      this.nodes.length === nextNodes.length && nextNodes.every((node) => this.nodesById.has(node.id));
    const currentLinkPairs = new Set(this.links.map((link) => linkPairKey(link.source, link.target)));
    const sameLinkPairs =
      this.links.length === nextLinks.length &&
      nextLinks.every((link) => currentLinkPairs.has(linkPairKey(link.source, link.target)));
    const topologyChanged = !sameNodeIds || !sameLinkPairs;
    const weightsChanged = nextNodes.some((node) => previousWeights.get(node.id) !== node.weight);

    this.nodesById.clear();
    for (const node of nextNodes) this.nodesById.set(node.id, node);
    this.nodes = nextNodes;
    this.links = nextLinks;
    this.revision += 1;

    for (const id of this.initialPositions.keys()) {
      if (!nextIds.has(id)) this.initialPositions.delete(id);
    }

    if (topologyChanged || weightsChanged) {
      this.version += 1;
      this.sharedPositionBuffer = null;
      this.sharedPositionVersion = -1;
      this.commandSequence += 1;
      this.minimumAcceptedSequence = this.commandSequence;
      // The original worker raises a settled graph to .3 for ordinary data
      // updates, while its first simulation still begins at alpha=1.
      this.postGraph(GRAPH_UPDATE_ALPHA);
    } else {
      // Color, label, and other render-only changes are applied in place. The
      // original graph worker does not restart physics for those updates.
      this.onUpdate?.(this.nodes);
    }
  }

  resetLayout(): void {
    this.assertActive();
    for (const node of this.nodes) {
      const initial = this.initialPositions.get(node.id);
      if (!initial) continue;
      node.x = initial.x;
      node.y = initial.y;
      node.vx = 0;
      node.vy = 0;
      node.fx = null;
      node.fy = null;
    }
    this.version += 1;
    this.sharedPositionBuffer = null;
    this.sharedPositionVersion = -1;
    this.commandSequence += 1;
    this.minimumAcceptedSequence = this.commandSequence;
    this.revision += 1;
    this.postGraph(DEFAULT_ALPHA, true);
  }

  reheat(alpha = DEFAULT_ALPHA): void {
    this.assertActive();
    // Reheat is an interaction with the existing simulation, not a new graph
    // version. Keeping the stream sequence stable prevents valid neighbour
    // frames from being discarded while the user is manipulating the view.
    this.worker.postMessage({
      type: 'reheat',
      sequence: this.commandSequence,
      alpha: Math.max(0, alpha),
    });
  }

  private postGraph(alpha: number, reset = false): void {
    const message: GraphViewWorkerRequest = {
      type: 'set-graph',
      version: this.version,
      sequence: this.commandSequence,
      nodes: this.nodes.map((node) => ({
        id: node.id,
        ...(node.radius === undefined ? {} : { radius: node.radius }),
        x: node.x,
        y: node.y,
        vx: node.vx,
        vy: node.vy,
        fx: node.fx,
        fy: node.fy,
      })),
      links: this.links.map(({ source, target }) => ({ source, target })),
      forces: this.forces,
      alpha,
      ...(reset ? { reset: true } : {}),
    };
    this.worker.postMessage(message);
  }

  setForces(nextForces: Partial<GraphViewForceConfig>): void {
    this.assertActive();
    this.forces = mergeGraphViewForces({ ...this.forces, ...nextForces });
    const message: GraphViewWorkerRequest = {
      type: 'set-forces',
      sequence: this.commandSequence,
      forces: this.forces,
      alpha: GRAPH_UPDATE_ALPHA,
    };
    this.worker.postMessage(message);
  }

  dragNode(id: string, x: number, y: number): void {
    this.assertActive();
    const node = this.nodesById.get(id);
    if (!node) return;
    node.x = x;
    node.y = y;
    node.fx = x;
    node.fy = y;
    this.revision += 1;
    this.worker.postMessage({
      type: 'drag',
      sequence: this.commandSequence,
      id,
      x,
      y,
    });
  }

  releaseNode(id: string): void {
    this.assertActive();
    const node = this.nodesById.get(id);
    if (!node) return;
    node.fx = null;
    node.fy = null;
    this.revision += 1;
    this.worker.postMessage({ type: 'release', sequence: this.commandSequence, id });
  }

  stop(): void {
    if (this.disposed) return;
    this.worker.postMessage({ type: 'stop' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.postMessage({ type: 'destroy' });
    this.worker.terminate();
  }

  private readonly handleMessage = (event: MessageEvent<GraphViewWorkerResponse>): void => {
    const message = event.data;
    if (message.type === 'error') {
      this.onError?.(new Error(message.message));
      return;
    }
    if (message.type === 'shared-probe') return;
    if (message.version !== this.version || message.count !== this.nodes.length) return;
    if (message.sequence < this.minimumAcceptedSequence) return;
    if (
      typeof SharedArrayBuffer !== 'undefined' &&
      message.buffer instanceof SharedArrayBuffer &&
      message.positionVersion !== undefined
    ) {
      const lastConsumedVersion = this.sharedPositionBuffer === message.buffer ? this.sharedPositionVersion : -1;
      const publishedVersion = readGraphViewSharedVersion(message.buffer, lastConsumedVersion, message.positionVersion);
      if (publishedVersion === null) {
        return;
      }
      this.sharedPositionBuffer = message.buffer;
      this.sharedPositionVersion = publishedVersion;
    }

    const positions = new Float32Array(message.buffer);
    for (let index = 0; index < message.ids.length; index += 1) {
      const id = message.ids[index];
      const node = id === undefined ? undefined : this.nodesById.get(id);
      if (!node) continue;
      const offset = index * 2;
      node.x = positions[offset] ?? node.x;
      node.y = positions[offset + 1] ?? node.y;
      if (node.fx !== null) node.x = node.fx;
      if (node.fy !== null) node.y = node.fy;
    }
    this.revision += 1;
    this.onUpdate?.(this.nodes);
    if (message.settled) this.onSettled?.();
  };

  private assertActive(): void {
    if (this.disposed) throw new Error('GraphViewEngine has been disposed');
  }
}
