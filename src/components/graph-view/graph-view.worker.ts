import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force-3d';
import { mergeGraphViewForces } from './forces';
import { GraphViewPhysicsRuntime } from './physics-runtime';
import { publishGraphViewSharedVersion } from './shared-protocol';
import type {
  GraphViewWorkerLink,
  GraphViewWorkerNode,
  GraphViewWorkerRequest,
  GraphViewWorkerResponse,
} from './types';

type SimulationNode = GraphViewWorkerNode & { index?: number };
type SimulationLink = { source: SimulationNode | string; target: SimulationNode | string };

type StrengthForceHandle = {
  strength: (value: number | ((node: SimulationNode) => number)) => StrengthForceHandle;
  distanceMin: (value: number) => StrengthForceHandle;
  distanceMax: (value: number) => StrengthForceHandle;
  theta: (value: number) => StrengthForceHandle;
};

type LinkForceHandle = {
  distance: (value: number) => LinkForceHandle;
  strength: (value: (link: SimulationLink) => number) => LinkForceHandle;
  links: (value: readonly SimulationLink[]) => LinkForceHandle;
};

type CollisionForceHandle = {
  radius: (value: number) => CollisionForceHandle;
  strength: (value: number) => CollisionForceHandle;
  iterations: (value: number) => CollisionForceHandle;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<GraphViewWorkerRequest>) => void) | null;
  postMessage(message: GraphViewWorkerResponse, transfer?: Transferable[]): void;
};

const scope = globalThis as unknown as WorkerScope;
const INITIAL_ALPHA = 1;
// The recovered WASM-equivalent TypeScript kernel is the primary backend.
// d3-force remains in this file as a controlled fallback for environments in
// which the kernel is disabled while diagnosing a worker integration issue.
const USE_RECOVERED_TYPESCRIPT_KERNEL = true;

let forces = mergeGraphViewForces();
let version = 0;
let commandSequence = 0;
let nodesById = new Map<string, SimulationNode>();
let nodeOrder: string[] = [];
let links: GraphViewWorkerLink[] = [];
let degrees = new Map<string, number>();
let simulation: ReturnType<typeof forceSimulation<SimulationNode>> | null = null;
let simulationNodes: SimulationNode[] = [];
let simulationLinks: SimulationLink[] = [];
let activeLinkForce: LinkForceHandle | null = null;
let activeChargeForce: StrengthForceHandle | null = null;
let activeCenterXForce: StrengthForceHandle | null = null;
let activeCenterYForce: StrengthForceHandle | null = null;
let activeCollisionForce: CollisionForceHandle | null = null;
let physicsRuntime: GraphViewPhysicsRuntime | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let sharedBuffer: SharedArrayBuffer | null = null;
let sharedPositions: Float32Array | null = null;
let sharedBufferSupported: boolean | null = null;

if (typeof SharedArrayBuffer !== 'undefined') {
  try {
    // The original worker sends a one-byte capability probe before the first
    // position frame. The main engine intentionally ignores this message;
    // retaining it keeps the worker protocol mechanically recognizable.
    scope.postMessage({ type: 'shared-probe', shared: new SharedArrayBuffer(1) });
  } catch {
    // Cross-origin isolation may expose the constructor but reject allocation.
  }
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function stopTimer(): void {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

function scheduleTick(): void {
  if (!running || timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    tick();
  }, 16);
}

function postPositions(settled = false): void {
  // The renderer consumes the same x/y stream that the original worker
  // exposes. Velocities remain private to the simulation and are never
  // copied through the render boundary.
  const ids = [...nodeOrder];

  let buffer: ArrayBuffer | SharedArrayBuffer;
  let positions: Float32Array;
  let positionVersion: number | undefined;
  if (sharedBufferSupported === null) {
    sharedBufferSupported = false;
    if (typeof SharedArrayBuffer !== 'undefined') {
      try {
        // Match the source worker's capability probe. Browsers may expose the
        // constructor while still refusing to allocate a shared buffer.
        new SharedArrayBuffer(1);
        sharedBufferSupported = true;
      } catch {
        sharedBufferSupported = false;
      }
    }
  }
  const sharedEnabled = sharedBufferSupported;
  if (sharedEnabled) {
    const byteLength = nodeOrder.length * 2 * Float32Array.BYTES_PER_ELEMENT + 4;
    if (!sharedBuffer || sharedBuffer.byteLength !== byteLength) {
      try {
        sharedBuffer = new SharedArrayBuffer(byteLength);
        sharedPositions = new Float32Array(sharedBuffer, 0, nodeOrder.length * 2);
      } catch {
        sharedBufferSupported = false;
        sharedBuffer = null;
        sharedPositions = null;
      }
    }
  }
  if (sharedBuffer && sharedPositions) {
    buffer = sharedBuffer;
    positions = sharedPositions;
    // The renderer receives the version observed before this frame is
    // published. It compares that token with the slot after the write, which
    // is how the source avoids repainting the same SAB frame twice.
    positionVersion = new Uint32Array(sharedBuffer, sharedBuffer.byteLength - 4, 1)[0];
  } else {
    buffer = new ArrayBuffer(nodeOrder.length * 2 * Float32Array.BYTES_PER_ELEMENT);
    positions = new Float32Array(buffer);
  }

  ids.forEach((id, index) => {
    const node = nodesById.get(id);
    if (!node) return;
    const offset = index * 2;
    positions[offset] = finite(node.x, 0);
    positions[offset + 1] = finite(node.y, 0);
  });

  if (sharedBuffer && positionVersion !== undefined) {
    const versionSlot = new Uint32Array(sharedBuffer, sharedBuffer.byteLength - 4, 1);
    publishGraphViewSharedVersion(versionSlot);
  }

  const response: GraphViewWorkerResponse = {
    type: 'positions',
    version,
    sequence: commandSequence,
    buffer,
    ids,
    count: ids.length,
    ...(settled ? { settled: true } : {}),
    ...(positionVersion === undefined ? {} : { positionVersion }),
  };
  if (buffer instanceof ArrayBuffer) scope.postMessage(response, [buffer]);
  else scope.postMessage(response);
}

function updateDegrees(): void {
  degrees = new Map<string, number>();
  for (const link of links) {
    degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
  }
}

function linkStrength(link: SimulationLink): number {
  const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
  const targetId = typeof link.target === 'string' ? link.target : link.target.id;
  return forces.linkStrength / Math.max(1, Math.min(degrees.get(sourceId) ?? 1, degrees.get(targetId) ?? 1));
}

function configureForces(): void {
  if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    physicsRuntime.setForces(forces);
    return;
  }
  if (!activeLinkForce || !activeChargeForce || !activeCenterXForce || !activeCenterYForce) {
    return;
  }

  activeCenterXForce.strength(forces.centerStrength);
  activeCenterYForce.strength(forces.centerStrength);
  activeLinkForce.distance(forces.linkDistance).strength(linkStrength);
  activeChargeForce
    .strength(-(forces.repelStrength < 1 ? 1 : forces.repelStrength))
    .distanceMin(forces.repelDistanceMin)
    .distanceMax(forces.repelDistanceMax)
    .theta(forces.theta);
  activeCollisionForce
    ?.radius(forces.collisionRadius)
    .strength(forces.collisionStrength)
    .iterations(forces.collisionIterations);

  simulation
    ?.velocityDecay(1 - forces.velocityDecay)
    .alphaDecay(forces.alphaDecay)
    .alphaMin(forces.alphaMin);
}

function buildSimulation(alpha: number): void {
  simulationNodes = nodeOrder
    .map((id) => nodesById.get(id))
    .filter((node): node is SimulationNode => node !== undefined);
  simulationLinks = links.map((link) => ({
    source: link.source,
    target: link.target,
  }));
  updateDegrees();

  if (USE_RECOVERED_TYPESCRIPT_KERNEL) {
    physicsRuntime = new GraphViewPhysicsRuntime(forces);
    physicsRuntime.setGraph(simulationNodes, links, alpha, true);
    simulation = null;
    activeLinkForce = null;
    activeChargeForce = null;
    activeCenterXForce = null;
    activeCenterYForce = null;
    activeCollisionForce = null;
    return;
  }

  const linkForce = forceLink<SimulationNode, SimulationLink>(simulationLinks)
    .id((node) => node.id)
    .distance(forces.linkDistance)
    // This is the original d3-force link strength: 1/min(degree(source),
    // degree(target)), multiplied by the public link-strength control.
    .strength(linkStrength);
  const chargeForce = forceManyBody()
    .strength(-(forces.repelStrength < 1 ? 1 : forces.repelStrength))
    .distanceMin(forces.repelDistanceMin)
    .distanceMax(forces.repelDistanceMax)
    .theta(forces.theta);

  const centerXForce = forceX<SimulationNode>(0).strength(forces.centerStrength);
  const centerYForce = forceY<SimulationNode>(0).strength(forces.centerStrength);
  const collisionForce = forceCollide<SimulationNode>(forces.collisionRadius)
    .strength(forces.collisionStrength)
    .iterations(forces.collisionIterations);

  activeLinkForce = linkForce as unknown as LinkForceHandle;
  activeChargeForce = chargeForce as unknown as StrengthForceHandle;
  activeCenterXForce = centerXForce as unknown as StrengthForceHandle;
  activeCenterYForce = centerYForce as unknown as StrengthForceHandle;
  activeCollisionForce = collisionForce as unknown as CollisionForceHandle;

  simulation = forceSimulation(simulationNodes, 2)
    .force('x', centerXForce)
    .force('y', centerYForce)
    .force('link', linkForce)
    .force('charge', chargeForce)
    .force('collision', collisionForce)
    // d3's public setter accepts decay (the amount removed), while the
    // recovered simulator stores the remaining velocity multiplier (0.6).
    .velocityDecay(1 - forces.velocityDecay)
    .alphaDecay(forces.alphaDecay)
    .alphaMin(forces.alphaMin)
    .alpha(Math.max(INITIAL_ALPHA, alpha));
  configureForces();
  simulation.stop();
}

function start(alpha: number): void {
  if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    physicsRuntime.reheat(alpha);
    running = true;
    scheduleTick();
    return;
  }
  if (!simulation) return;
  // alphaTarget is a persistent part of the source simulation. Only the
  // explicit release command clears it; ordinary graph updates and reheats
  // must not cancel an active drag.
  simulation.alpha(Math.max(simulation.alpha(), alpha));
  running = true;
  scheduleTick();
}

function tick(): void {
  if (!running) return;
  if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    const state = physicsRuntime.tick();
    postPositions(state.settled);
    if (state.settled) {
      running = false;
      return;
    }
    scheduleTick();
    return;
  }
  if (!simulation) return;
  simulation.tick();
  const settled = simulation.alpha() <= forces.alphaMin && simulation.alphaTarget() <= forces.alphaMin;
  postPositions(settled);
  if (settled) {
    running = false;
    return;
  }
  scheduleTick();
}

function setGraph(message: Extract<GraphViewWorkerRequest, { type: 'set-graph' }>): void {
  version = message.version;
  commandSequence = message.sequence;
  forces = mergeGraphViewForces(message.forces);
  const previous = nodesById;
  const next = new Map<string, SimulationNode>();

  for (const input of message.nodes) {
    const existing = previous.get(input.id);
    const node = existing ?? {
      id: input.id,
      x: finite(input.x, 0),
      y: finite(input.y, 0),
      vx: finite(input.vx, 0),
      vy: finite(input.vy, 0),
      fx: input.fx ?? null,
      fy: input.fy ?? null,
    };
    if (message.reset || !existing) {
      node.x = finite(input.x, node.x);
      node.y = finite(input.y, node.y);
      node.vx = finite(input.vx, 0);
      node.vy = finite(input.vy, 0);
      node.fx = input.fx ?? null;
      node.fy = input.fy ?? null;
    } else {
      // The source worker refreshes x/y for every node-table update but keeps
      // accumulated velocity and fixed-node state. This is distinct from a
      // reset: ordinary graph updates may reposition a node without erasing
      // the ongoing physics stream.
      node.x = finite(input.x, node.x);
      node.y = finite(input.y, node.y);
    }
    if (input.radius === undefined) delete node.radius;
    else node.radius = input.radius;
    next.set(input.id, node);
  }

  nodesById = next;
  nodeOrder = message.nodes.map((node) => node.id);
  links = message.links.map((link) => ({ source: link.source, target: link.target }));
  updateDegrees();

  if (!simulation && !physicsRuntime) {
    buildSimulation(message.alpha);
  } else if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    simulationNodes = nodeOrder
      .map((id) => nodesById.get(id))
      .filter((node): node is SimulationNode => node !== undefined);
    physicsRuntime.setForces(forces);
    physicsRuntime.setGraph(simulationNodes, links, message.alpha, message.reset === true);
  } else {
    // Keep the same force instances and simulation state. The reference
    // worker only refreshes force inputs; rebuilding here would discard the
    // accumulated velocity and visibly reset neighboring nodes.
    simulationNodes = nodeOrder
      .map((id) => nodesById.get(id))
      .filter((node): node is SimulationNode => node !== undefined);
    simulationLinks = links.map((link) => ({
      source: link.source,
      target: link.target,
    }));
    const currentSimulation = simulation;
    if (!currentSimulation) return;
    currentSimulation.nodes(simulationNodes);
    activeLinkForce?.links(simulationLinks);
    configureForces();
    currentSimulation.alpha(Math.max(currentSimulation.alpha(), message.alpha));
  }
  start(message.alpha);
}

function setForces(message: Extract<GraphViewWorkerRequest, { type: 'set-forces' }>): void {
  commandSequence = message.sequence;
  forces = mergeGraphViewForces(message.forces);
  if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    physicsRuntime.setForces(forces);
    start(message.alpha);
    return;
  }
  if (
    !simulation ||
    !activeLinkForce ||
    !activeChargeForce ||
    !activeCenterXForce ||
    !activeCenterYForce ||
    !activeCollisionForce
  ) {
    buildSimulation(message.alpha);
    start(message.alpha);
    return;
  }

  // The original worker mutates its force instances in place. Rebuilding the
  // simulation here would reinitialize the spatial index and make a settled
  // graph visibly jump whenever a force control changes.
  configureForces();
  const currentSimulation = simulation;
  if (!currentSimulation) return;
  currentSimulation.alpha(Math.max(currentSimulation.alpha(), message.alpha));
  start(message.alpha);
}

function updateDraggedNode(message: Extract<GraphViewWorkerRequest, { type: 'drag' }>): void {
  const node = nodesById.get(message.id);
  if (!node || (!simulation && !physicsRuntime)) return;
  commandSequence = message.sequence;
  if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    physicsRuntime.drag(message.id, message.x, message.y);
    running = true;
    scheduleTick();
    return;
  }
  node.fx = message.x;
  node.fy = message.y;
  node.x = message.x;
  node.y = message.y;
  const currentSimulation = simulation;
  if (!currentSimulation) return;
  currentSimulation.alpha(0.3).alphaTarget(0.3);
  running = true;
  scheduleTick();
}

function releaseDraggedNode(message: Extract<GraphViewWorkerRequest, { type: 'release' }>): void {
  const node = nodesById.get(message.id);
  if (!node || (!simulation && !physicsRuntime)) return;
  commandSequence = message.sequence;
  if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    physicsRuntime.release(message.id);
    if (!physicsRuntime.isSettled()) {
      running = true;
      scheduleTick();
    }
    return;
  }
  // Do not write x/y or zero velocity here. The force simulation owns the
  // release and its current momentum is what gives neighboring nodes their
  // natural rebound.
  node.fx = null;
  node.fy = null;
  const currentSimulation = simulation;
  if (!currentSimulation) return;
  currentSimulation.alphaTarget(0);
  // Releasing a node resumes the current simulation energy. It does not
  // inject a fresh alpha=1 pulse; that distinction is what keeps a settled
  // graph from visibly jumping after every click/drag.
  if (currentSimulation.alpha() > forces.alphaMin) {
    running = true;
    scheduleTick();
  }
}

function reheatSimulation(message: Extract<GraphViewWorkerRequest, { type: 'reheat' }>): void {
  if (USE_RECOVERED_TYPESCRIPT_KERNEL && physicsRuntime) {
    commandSequence = message.sequence;
    physicsRuntime.reheat(message.alpha);
    start(message.alpha);
    return;
  }
  if (!simulation) return;
  commandSequence = message.sequence;
  simulation.alpha(Math.max(simulation.alpha(), message.alpha));
  start(message.alpha);
}

scope.onmessage = (event) => {
  try {
    const message = event.data;
    switch (message.type) {
      case 'set-graph':
        setGraph(message);
        break;
      case 'set-forces':
        setForces(message);
        break;
      case 'drag':
        updateDraggedNode(message);
        break;
      case 'release':
        releaseDraggedNode(message);
        break;
      case 'reheat':
        reheatSimulation(message);
        break;
      case 'stop':
        running = false;
        stopTimer();
        simulation?.stop();
        break;
      case 'destroy':
        running = false;
        stopTimer();
        simulation?.stop();
        scope.onmessage = null;
        break;
    }
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Graph simulation failed',
    });
  }
};
