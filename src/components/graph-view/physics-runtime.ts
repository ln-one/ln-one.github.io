import {
  type GraphViewPhysicsLink,
  type GraphViewPhysicsNode,
  type GraphViewPhysicsOptions,
  graphViewPhysicsStep,
} from './physics';
import type { GraphViewForceConfig } from './types';
import {
  GRAPH_VIEW_WASM_COLLISION_RADIUS,
  GRAPH_VIEW_WASM_COLLISION_STRENGTH,
  GRAPH_VIEW_WASM_COMPLETION_VELOCITY_DECAY,
  GRAPH_VIEW_WASM_THETA,
} from './wasm-contract';

export type GraphViewPhysicsRuntimeNode = GraphViewPhysicsNode & { id: string };

export type GraphViewPhysicsRuntimeLink = {
  source: string;
  target: string;
};

export type GraphViewPhysicsRuntimeState = {
  readonly alpha: number;
  readonly alphaTarget: number;
  readonly settled: boolean;
};

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function effectiveRepelStrength(value: number): number {
  return value < 1 ? 1 : value;
}

/**
 * Stateful worker-side adapter for the mechanically recovered WASM loop.
 *
 * The adapter owns alpha and id-to-index resolution; the actual force step is
 * pure graph data plus mutable node state. Keeping this boundary separate
 * makes it possible to compare a complete worker tick with the reference
 * binary without involving timers, message ports, or Pixi.
 */
export class GraphViewPhysicsRuntime {
  private forces: GraphViewForceConfig;
  private nodes: GraphViewPhysicsRuntimeNode[] = [];
  private links: GraphViewPhysicsLink[] = [];
  private nodeIndex = new Map<string, number>();
  private alpha = 1;
  private alphaTarget = 0;
  private initialized = false;

  constructor(forces: GraphViewForceConfig) {
    this.forces = { ...forces };
  }

  getState(): GraphViewPhysicsRuntimeState {
    return {
      alpha: this.alpha,
      alphaTarget: this.alphaTarget,
      settled: this.isSettled(),
    };
  }

  setForces(forces: GraphViewForceConfig): void {
    this.forces = { ...forces };
  }

  setGraph(
    nodes: readonly GraphViewPhysicsRuntimeNode[],
    links: readonly GraphViewPhysicsRuntimeLink[],
    alpha: number,
    reset = false
  ): void {
    this.nodes = [...nodes];
    this.nodeIndex = new Map(this.nodes.map((node, index) => [node.id, index] as const));
    this.links = links.flatMap((link) => {
      const source = this.nodeIndex.get(link.source);
      const target = this.nodeIndex.get(link.target);
      if (source === undefined || target === undefined || source === target) return [];
      return [{ source, target }];
    });
    if (!this.initialized || reset) {
      this.alpha = Math.max(1, finite(alpha, 1));
      this.alphaTarget = 0;
      this.initialized = true;
      return;
    }
    this.alpha = Math.max(this.alpha, finite(alpha, 0));
  }

  reheat(alpha: number): void {
    this.alpha = Math.max(this.alpha, Math.max(0, finite(alpha, 0)));
  }

  drag(id: string, x: number, y: number): boolean {
    const index = this.nodeIndex.get(id);
    const node = index === undefined ? undefined : this.nodes[index];
    if (!node) return false;
    node.fx = x;
    node.fy = y;
    node.x = x;
    node.y = y;
    this.alpha = 0.3;
    this.alphaTarget = 0.3;
    return true;
  }

  release(id: string): boolean {
    const index = this.nodeIndex.get(id);
    const node = index === undefined ? undefined : this.nodes[index];
    if (!node) return false;
    node.fx = null;
    node.fy = null;
    this.alphaTarget = 0;
    return true;
  }

  tick(): GraphViewPhysicsRuntimeState {
    if (this.nodes.length === 0) {
      this.alpha = 0;
      return this.getState();
    }

    // The reference worker updates alpha before invoking its WASM `simulate`
    // export. This order is observable during the first few frames.
    this.alpha += (this.alphaTarget - this.alpha) * this.forces.alphaDecay;

    const options: GraphViewPhysicsOptions = {
      nodeCount: this.nodes.length,
      linkCount: this.links.length,
      alpha: this.alpha,
      centerStrength: this.forces.centerStrength,
      linkStrength: this.forces.linkStrength,
      linkDistance: this.forces.linkDistance,
      repelStrength: effectiveRepelStrength(this.forces.repelStrength),
      simulationDamping: 0.9,
      completionDamping: GRAPH_VIEW_WASM_COMPLETION_VELOCITY_DECAY,
      // The WASM branch passes .9 and .5 directly to manyBody. The d3
      // fallback exposes different tunables (.81 theta, configurable
      // collision), so do not accidentally reuse fallback settings here.
      collisionRadius: GRAPH_VIEW_WASM_COLLISION_RADIUS,
      collisionStrength: GRAPH_VIEW_WASM_COLLISION_STRENGTH,
      theta: GRAPH_VIEW_WASM_THETA,
      distanceMin: 30,
      distanceMax: Number.POSITIVE_INFINITY,
      float32Storage: true,
    };
    graphViewPhysicsStep(this.nodes, this.links, options);
    return this.getState();
  }

  isSettled(): boolean {
    return this.alpha <= this.forces.alphaMin && this.alphaTarget <= this.forces.alphaMin;
  }
}
