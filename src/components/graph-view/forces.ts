import type { GraphViewForceConfig } from './types';

export const DEFAULT_GRAPH_VIEW_FORCES: GraphViewForceConfig = {
  // These values mirror the graph engine's public force controls.  The graph
  // is deliberately allowed to breathe; density is controlled by the
  // simulation's collision radius rather than by a second layout pass.
  centerStrength: 0.1,
  repelStrength: 1000,
  repelDistanceMin: 30,
  repelDistanceMax: Number.POSITIVE_INFINITY,
  // d3-force's recovered fallback keeps its default Barnes-Hut theta (.81);
  // the original worker never overrides it.
  theta: 0.81,
  linkStrength: 1,
  linkDistance: 250,
  collisionRadius: 60,
  collisionStrength: 0.5,
  collisionIterations: 1,
  velocityDecay: 0.6,
  alphaDecay: 1 - 0.001 ** (1 / 300),
  alphaMin: 0.001,
};

export function mergeGraphViewForces(forces?: Partial<GraphViewForceConfig>): GraphViewForceConfig {
  return { ...DEFAULT_GRAPH_VIEW_FORCES, ...forces };
}

export function degreeWeightedRadius(degree: number, multiplier = 1): number {
  const safeDegree = Number.isFinite(degree) ? Math.max(0, degree) : 0;
  const safeMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  return safeMultiplier * Math.max(8, Math.min(3 * Math.sqrt(safeDegree + 1), 30));
}
