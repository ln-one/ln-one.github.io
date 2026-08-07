/**
 * Pure renderer rules recovered from the Graph View bundle.
 *
 * Keeping these rules free of Pixi objects makes the reverse-engineered
 * behavior testable and prevents each canvas implementation from inventing a
 * slightly different fade or link policy.
 */

export const GRAPH_VIEW_BASE_ALPHA = 0.2;

export const GRAPH_VIEW_LAZY_NODE_BATCH_SIZE = 50;
const GRAPH_VIEW_LABEL_MOVE_DISTANCE = 15;
const GRAPH_VIEW_LABEL_VISIBILITY_EPSILON = 0.001;

export type GraphViewLabelLayoutInput = {
  x: number;
  y: number;
  size: number;
  scale: number;
  nodeScale: number;
  moveText: number;
  focused: boolean;
  textAlpha: number;
  fadeAlpha: number;
  textColorAlpha: number;
};

export type GraphViewLabelLayout = {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  targetMoveText: number;
  visible: boolean;
};

export type GraphViewLinkGeometryInput = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourceRadius: number;
  targetRadius: number;
  scale: number;
  lineSizeMultiplier: number;
};

export type GraphViewLinkGeometry = {
  distance: number;
  lineThickness: number;
  line: {
    x: number;
    y: number;
    rotation: number;
    width: number;
    height: number;
  };
  arrow: {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    visibleAtDistance: boolean;
  };
};

export type GraphViewLazyNode = {
  id: string;
  x: number;
  y: number;
};

/** The bundle's node-size curve, including the renderer's hard lower/upper bounds. */
export function graphViewNodeSize(weight: number, nodeSizeMultiplier = 1): number {
  const safeWeight = Number.isFinite(weight) ? weight : 0;
  const safeMultiplier = Number.isFinite(nodeSizeMultiplier) ? nodeSizeMultiplier : 1;
  return safeMultiplier * Math.max(8, Math.min(Math.sqrt(safeWeight + 1) * 3, 30));
}

/** Counter-scale used by the renderer so node circles do not grow with the camera. */
export function graphViewNodeScale(scale: number): number {
  return Math.sqrt(1 / scale);
}

/**
 * Compute the label transform before viewport culling. The stage applies the
 * camera scale afterwards, just like the retained Pixi renderer.
 */
export function graphViewLabelLayout(input: GraphViewLabelLayoutInput): GraphViewLabelLayout {
  const targetMoveText = input.focused ? GRAPH_VIEW_LABEL_MOVE_DISTANCE : 0;
  const alpha = (input.focused ? 1 : input.textAlpha * input.fadeAlpha) * input.textColorAlpha;
  return {
    x: input.x,
    y: input.y + (input.size + 5) * input.nodeScale + input.moveText / input.scale,
    scale: input.focused && input.scale < 1 ? 1 / input.scale : input.nodeScale,
    alpha,
    targetMoveText,
    visible: alpha > GRAPH_VIEW_LABEL_VISIBILITY_EPSILON,
  };
}

/**
 * Compute the retained line and arrow geometry. Coordinates are in graph
 * space; the caller applies the Pixi world transform once for both objects.
 */
export function graphViewLinkGeometry(input: GraphViewLinkGeometryInput): GraphViewLinkGeometry | null {
  const dx = input.targetX - input.sourceX;
  const dy = input.targetY - input.sourceY;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return null;

  const rotation = Math.atan2(dy, dx);
  const lineThickness = input.lineSizeMultiplier / input.scale;
  const sourceX = input.sourceX + (dx * input.sourceRadius) / distance;
  const sourceY = input.sourceY + (dy * input.sourceRadius) / distance;
  const arrowDistance = input.targetRadius + 1;
  return {
    distance,
    lineThickness,
    line: {
      x: sourceX,
      y: sourceY - lineThickness / 2,
      rotation,
      width: Math.max(0, distance - input.sourceRadius - input.targetRadius),
      height: lineThickness,
    },
    arrow: {
      x: input.targetX - (dx * arrowDistance) / distance,
      y: input.targetY - (dy * arrowDistance) / distance,
      rotation,
      scale: (Math.sqrt(input.lineSizeMultiplier) * 2) / input.scale,
      visibleAtDistance: distance > lineThickness,
    },
  };
}

/**
 * Select the nearest not-yet-created nodes in the same stable order as the
 * bundle. Stable ids/order are important: changing this order makes large
 * graphs visibly flicker as Pixi objects are allocated in different frames.
 */
export function graphViewLazyNodeIds(
  nodes: readonly GraphViewLazyNode[],
  renderedIds: ReadonlySet<string>,
  centerX: number,
  centerY: number,
  limit = GRAPH_VIEW_LAZY_NODE_BATCH_SIZE
): string[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0) return [];
  return nodes
    .map((node, index) => ({
      id: node.id,
      index,
      distance: (node.x - centerX) * (node.x - centerX) + (node.y - centerY) * (node.y - centerY),
    }))
    .filter((candidate) => !renderedIds.has(candidate.id))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .slice(0, safeLimit)
    .map((candidate) => candidate.id);
}

export function graphViewTextAlpha(scale: number, textFadeMultiplier: number): number {
  const safeScale = Math.max(1 / 128, Number.isFinite(scale) ? scale : 1);
  const value = Math.log(safeScale) / Math.log(2) + 1 - textFadeMultiplier;
  return Math.min(1, Math.max(0, value));
}

export function graphViewNodeTargetAlpha(hasHighlight: boolean, isHighlighted: boolean, isRelated: boolean): number {
  return !hasHighlight || isHighlighted || isRelated ? 1 : GRAPH_VIEW_BASE_ALPHA;
}

export function graphViewLinkTargetAlpha(hasHighlight: boolean, isRelated: boolean): number {
  return !hasHighlight || isRelated ? 1 : GRAPH_VIEW_BASE_ALPHA;
}

export function graphViewArrowAlpha(linkAlpha: number, scale: number, arrowColorAlpha = 1): number {
  const zoomAlpha = Math.min(1, Math.max(0, (scale - 0.3) * 2));
  return linkAlpha * zoomAlpha * arrowColorAlpha;
}

/**
 * The renderer has one visible line for a bidirectional pair. It keeps the
 * direction whose source id sorts after the target id, matching the bundle's
 * `localeCompare` branch.
 */
export function shouldRenderDirectedLink(sourceId: string, targetId: string, hasReverseLink: boolean): boolean {
  return !hasReverseLink || sourceId.localeCompare(targetId) >= 0;
}

export function graphViewFade(current: number, target: number, reduceMotion: boolean): number {
  return reduceMotion ? target : current * 0.9 + target * 0.1;
}
