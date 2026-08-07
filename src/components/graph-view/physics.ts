import { buildPackedSpatialTree, packedRecordAt } from './packed-spatial-tree';
import type { GraphViewWasmSimulationArguments } from './wasm-contract';

/**
 * Mutable node shape used by the worker-side physics kernel.
 *
 * The reference worker keeps velocity private to the renderer boundary.  This
 * module therefore operates on the same small mutable shape instead of
 * exposing a second graph model.
 */
export type GraphViewPhysicsNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  radius?: number;
};

export type GraphViewPhysicsLink = {
  source: number;
  target: number;
};

export type GraphViewPhysicsOptions = GraphViewWasmSimulationArguments & {
  /** The fallback worker uses a fixed 60px collide radius. */
  readonly collisionRadius?: number;
  readonly collisionStrength?: number;
  /** Barnes–Hut opening angle used by the TypeScript kernel. */
  readonly theta?: number;
  readonly distanceMin?: number;
  readonly distanceMax?: number;
  /** Emulate the f32 stores at the WASM linear-memory boundary. */
  readonly float32Storage?: boolean;
};

type LinkRuntime = GraphViewPhysicsLink & {
  bias: number;
  degree: number;
};

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function storageValue(value: number, float32Storage: boolean): number {
  return float32Storage ? Math.fround(value) : value;
}

function applyCharge(
  nodes: readonly GraphViewPhysicsNode[],
  strength: number,
  theta: number,
  distanceMin: number,
  distanceMax: number,
  alpha: number,
  float32Storage: boolean
): void {
  if (nodes.length < 2 || strength === 0 || alpha === 0) return;
  const positionsX = nodes.map((node) => finite(node.x, 0));
  const positionsY = nodes.map((node) => finite(node.y, 0));
  const tree = buildPackedSpatialTree(positionsX, positionsY, float32Storage);
  if (!tree) return;
  const distanceMinSquared = Math.max(0, distanceMin) ** 2;
  const distanceMaxSquared = Number.isFinite(distanceMax)
    ? Math.max(distanceMinSquared, distanceMax ** 2)
    : Number.POSITIVE_INFINITY;
  const scaledStrength = strength * alpha;

  const visit = (
    levelIndex: number,
    cellX: number,
    cellY: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    cellSpan: number,
    targetIndex: number,
    targetX: number,
    targetY: number
  ): void => {
    const record = packedRecordAt(tree, levelIndex, cellX, cellY);
    if (!record || record.count === 0) return;

    const centroidX = storageValue(record.sumX / record.count, float32Storage);
    const centroidY = storageValue(record.sumY / record.count, float32Storage);
    const dx = storageValue(centroidX - targetX, float32Storage);
    const dy = storageValue(centroidY - targetY, float32Storage);
    const distanceSquared = storageValue(
      storageValue(dx * dx, float32Storage) + storageValue(dy * dy, float32Storage),
      float32Storage
    );
    const thetaSquared = storageValue(theta * theta, float32Storage);
    const openingThreshold = storageValue(
      storageValue(cellSpan * cellSpan, float32Storage) / thetaSquared,
      float32Storage
    );

    // This is the recovered WASM's opening test. A sufficiently distant
    // aggregate is applied once; otherwise the regular tree is descended.
    if (distanceSquared > openingThreshold && Number.isFinite(distanceSquared)) {
      if (distanceSquared >= distanceMaxSquared || distanceSquared <= 0) return;
      const safeDx = dx === 0 ? 0.5 : dx;
      const safeDy = dy === 0 ? 0.5 : dy;
      let effectiveDistanceSquared = distanceSquared;
      if (dx === 0) effectiveDistanceSquared = storageValue(effectiveDistanceSquared + 0.25, float32Storage);
      if (dy === 0) effectiveDistanceSquared = storageValue(effectiveDistanceSquared + 0.25, float32Storage);
      if (effectiveDistanceSquared < distanceMinSquared) {
        effectiveDistanceSquared = storageValue(
          Math.sqrt(distanceMinSquared * effectiveDistanceSquared),
          float32Storage
        );
      }
      const force = storageValue((scaledStrength * record.count) / effectiveDistanceSquared, float32Storage);
      const node = nodes[targetIndex] as GraphViewPhysicsNode;
      node.vx = storageValue(node.vx + safeDx * force, float32Storage);
      node.vy = storageValue(node.vy + safeDy * force, float32Storage);
      return;
    }

    const level = tree.levels[levelIndex] as { size: number } | undefined;
    if (level && level.size < tree.baseSize) {
      const middleX = storageValue((x0 + x1) * 0.5, float32Storage);
      const middleY = storageValue((y0 + y1) * 0.5, float32Storage);
      const childSpan = storageValue(cellSpan * 0.5, float32Storage);
      visit(levelIndex - 1, cellX * 2, cellY * 2, x0, y0, middleX, middleY, childSpan, targetIndex, targetX, targetY);
      visit(
        levelIndex - 1,
        cellX * 2 + 1,
        cellY * 2,
        middleX,
        y0,
        x1,
        middleY,
        childSpan,
        targetIndex,
        targetX,
        targetY
      );
      visit(
        levelIndex - 1,
        cellX * 2,
        cellY * 2 + 1,
        x0,
        middleY,
        middleX,
        y1,
        childSpan,
        targetIndex,
        targetX,
        targetY
      );
      visit(
        levelIndex - 1,
        cellX * 2 + 1,
        cellY * 2 + 1,
        middleX,
        middleY,
        x1,
        y1,
        childSpan,
        targetIndex,
        targetX,
        targetY
      );
      return;
    }

    let point = record.head;
    while (point !== -1) {
      if (point !== targetIndex) {
        const pairDx = storageValue((positionsX[point] as number) - targetX, float32Storage);
        const pairDy = storageValue((positionsY[point] as number) - targetY, float32Storage);
        const pairDistanceSquared = storageValue(
          storageValue(pairDx * pairDx, float32Storage) + storageValue(pairDy * pairDy, float32Storage),
          float32Storage
        );
        if (pairDistanceSquared > 0 && pairDistanceSquared < distanceMaxSquared) {
          // The recovered WASM clamps the distance for aggregate records but
          // uses the raw squared distance for a base-cell leaf pair.
          const force = storageValue(scaledStrength / pairDistanceSquared, float32Storage);
          const node = nodes[targetIndex] as GraphViewPhysicsNode;
          node.vx = storageValue(node.vx + pairDx * force, float32Storage);
          node.vy = storageValue(node.vy + pairDy * force, float32Storage);
        }
      }
      point = tree.next[point] as number;
    }
  };

  for (let index = 0; index < nodes.length; index += 1) {
    visit(
      tree.levels.length - 1,
      0,
      0,
      tree.minX,
      tree.minY,
      tree.maxX,
      tree.maxY,
      // The reference starts the traversal with the complete simulation
      // bounds even when the first materialized level is already the base
      // grid (small graphs do not allocate a separate root record).
      tree.span,
      index,
      positionsX[index] as number,
      positionsY[index] as number
    );
  }
}

function applyCollision(
  nodes: readonly GraphViewPhysicsNode[],
  radius: number,
  strength: number,
  float32Storage: boolean
): void {
  if (nodes.length < 2 || radius <= 0 || strength <= 0) return;
  const positionsX = nodes.map((node) => finite(node.x, 0));
  const positionsY = nodes.map((node) => finite(node.y, 0));
  const tree = buildPackedSpatialTree(positionsX, positionsY, float32Storage);
  if (!tree) return;
  const diameter = storageValue(radius + radius, float32Storage);
  const diameterSquared = storageValue(diameter * diameter, float32Storage);

  const visit = (
    levelIndex: number,
    cellX: number,
    cellY: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    sourceIndex: number,
    queryX: number,
    queryY: number
  ): void => {
    const record = packedRecordAt(tree, levelIndex, cellX, cellY);
    if (!record || record.count === 0) return;
    if (
      storageValue(queryY - diameter, float32Storage) > y1 ||
      storageValue(diameter + queryY, float32Storage) < y0 ||
      storageValue(diameter + queryX, float32Storage) < x0 ||
      storageValue(queryX - diameter, float32Storage) > x1
    )
      return;

    const level = tree.levels[levelIndex] as { size: number } | undefined;
    if (level && level.size < tree.baseSize) {
      const middleX = storageValue((x0 + x1) * 0.5, float32Storage);
      const middleY = storageValue((y0 + y1) * 0.5, float32Storage);
      visit(levelIndex - 1, cellX * 2, cellY * 2, x0, y0, middleX, middleY, sourceIndex, queryX, queryY);
      visit(levelIndex - 1, cellX * 2 + 1, cellY * 2, middleX, y0, x1, middleY, sourceIndex, queryX, queryY);
      visit(levelIndex - 1, cellX * 2, cellY * 2 + 1, x0, middleY, middleX, y1, sourceIndex, queryX, queryY);
      visit(levelIndex - 1, cellX * 2 + 1, cellY * 2 + 1, middleX, middleY, x1, y1, sourceIndex, queryX, queryY);
      return;
    }

    let point = record.head;
    while (point !== -1) {
      if (point > sourceIndex) {
        const otherX = nodes[point]?.x ?? 0;
        const otherY = nodes[point]?.y ?? 0;
        const otherVx = nodes[point]?.vx ?? 0;
        const otherVy = nodes[point]?.vy ?? 0;
        const dx = storageValue(queryX - storageValue(otherX + otherVx, float32Storage), float32Storage);
        const dy = storageValue(queryY - storageValue(otherY + otherVy, float32Storage), float32Storage);
        const distanceSquared = storageValue(
          storageValue(dx * dx, float32Storage) + storageValue(dy * dy, float32Storage),
          float32Storage
        );
        if (distanceSquared > 0 && distanceSquared < diameterSquared) {
          const distance = storageValue(Math.sqrt(distanceSquared), float32Storage);
          const correction = storageValue(
            (storageValue(strength * storageValue(diameter - distance, float32Storage), float32Storage) / distance) *
              0.5,
            float32Storage
          );
          const correctionX = storageValue(dx * correction, float32Storage);
          const correctionY = storageValue(dy * correction, float32Storage);
          const source = nodes[sourceIndex] as GraphViewPhysicsNode;
          const other = nodes[point] as GraphViewPhysicsNode;
          source.vx = storageValue(source.vx + correctionX, float32Storage);
          source.vy = storageValue(source.vy + correctionY, float32Storage);
          other.vx = storageValue(other.vx - correctionX, float32Storage);
          other.vy = storageValue(other.vy - correctionY, float32Storage);
        }
      }
      point = tree.next[point] as number;
    }
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index] as GraphViewPhysicsNode;
    visit(
      tree.levels.length - 1,
      0,
      0,
      tree.minX,
      tree.minY,
      tree.maxX,
      tree.maxY,
      index,
      storageValue(node.x + node.vx, float32Storage),
      storageValue(node.y + node.vy, float32Storage)
    );
  }
}

function initializeLinks(
  nodes: readonly GraphViewPhysicsNode[],
  links: readonly GraphViewPhysicsLink[]
): LinkRuntime[] {
  const degrees = new Array<number>(nodes.length).fill(0);
  for (const link of links) {
    if (link.source < 0 || link.target < 0 || link.source >= nodes.length || link.target >= nodes.length) continue;
    degrees[link.source] = (degrees[link.source] as number) + 1;
    degrees[link.target] = (degrees[link.target] as number) + 1;
  }
  return links
    .filter(
      (link) =>
        link.source >= 0 &&
        link.target >= 0 &&
        link.source < nodes.length &&
        link.target < nodes.length &&
        link.source !== link.target
    )
    .map((link) => {
      const sourceDegree = degrees[link.source] as number;
      const targetDegree = degrees[link.target] as number;
      const total = sourceDegree + targetDegree;
      return {
        ...link,
        bias: total > 0 ? sourceDegree / total : 0.5,
        degree: Math.max(1, Math.min(sourceDegree, targetDegree)),
      };
    });
}

/**
 * Execute one recovered WASM-style physics step in editable TypeScript.
 *
 * The call order is deliberate and follows `simulate()` + `complete()` from
 * the analyzed module: center, links, Barnes–Hut charge, collision, velocity
 * damping, then position integration. It is a worker-safe kernel, so callers
 * can choose it without pulling Pixi, React, or d3 into the physics boundary.
 */
export function graphViewPhysicsStep(
  nodes: readonly GraphViewPhysicsNode[],
  links: readonly GraphViewPhysicsLink[],
  options: GraphViewPhysicsOptions
): void {
  const float32Storage = options.float32Storage === true;
  const alpha = Math.max(0, finite(options.alpha, 0));
  if (nodes.length === 0) return;
  if (float32Storage) {
    for (const node of nodes) {
      node.x = storageValue(finite(node.x, 0), true);
      node.y = storageValue(finite(node.y, 0), true);
      node.vx = storageValue(finite(node.vx, 0), true);
      node.vy = storageValue(finite(node.vy, 0), true);
    }
  }
  const center = alpha * finite(options.centerStrength, 0);
  for (const node of nodes) {
    node.vx = storageValue(node.vx - center * finite(node.x, 0), float32Storage);
    node.vy = storageValue(node.vy - center * finite(node.y, 0), float32Storage);
  }

  const runtimeLinks = initializeLinks(nodes, links);
  const linkAlpha = alpha * finite(options.linkStrength, 0);
  for (const link of runtimeLinks) {
    const source = nodes[link.source] as GraphViewPhysicsNode;
    const target = nodes[link.target] as GraphViewPhysicsNode;
    // The WASM link kernel uses d3's historical `|| 0.1` fallback for a
    // coincident axis. This is deliberately different from the tiny jiggle
    // used by charge/collision when two points occupy the same position.
    const dx = target.x + target.vx - source.x - source.vx || 0.1;
    const dy = target.y + target.vy - source.y - source.vy || 0.1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const safeDx = dx;
    const safeDy = dy;
    const force = (((distance - finite(options.linkDistance, 0)) / distance) * linkAlpha) / link.degree;
    const targetForce = force * link.bias;
    const sourceForce = force * (1 - link.bias);
    target.vx = storageValue(target.vx - safeDx * targetForce, float32Storage);
    target.vy = storageValue(target.vy - safeDy * targetForce, float32Storage);
    source.vx = storageValue(source.vx + safeDx * sourceForce, float32Storage);
    source.vy = storageValue(source.vy + safeDy * sourceForce, float32Storage);
  }

  const repelStrength = options.repelStrength === 0 ? 0 : -Math.abs(options.repelStrength);
  applyCharge(
    nodes,
    finite(repelStrength, 0),
    Math.max(0.01, finite(options.theta ?? 0.9, 0.9)),
    Math.max(0, finite(options.distanceMin ?? 30, 30)),
    finite(options.distanceMax ?? Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    alpha,
    float32Storage
  );
  applyCollision(
    nodes,
    Math.max(0, finite(options.collisionRadius ?? 60, 60)),
    Math.max(0, finite(options.collisionStrength ?? 0.5, 0.5)),
    float32Storage
  );

  const damping = Math.max(0, Math.min(1, finite(options.completionDamping, 0.6)));
  for (const node of nodes) {
    node.vx = storageValue(node.vx * damping, float32Storage);
    node.vy = storageValue(node.vy * damping, float32Storage);
    node.x = storageValue(node.x + node.vx, float32Storage);
    node.y = storageValue(node.y + node.vy, float32Storage);
    if (node.fx !== undefined && node.fx !== null) {
      node.x = storageValue(node.fx, float32Storage);
      node.vx = 0;
    }
    if (node.fy !== undefined && node.fy !== null) {
      node.y = storageValue(node.fy, float32Storage);
      node.vy = 0;
    }
  }
}
