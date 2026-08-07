/**
 * Pointer decisions recovered from the Graph View canvas.
 *
 * The renderer keeps pointer bookkeeping mutable, but these two decisions are
 * pure: a five-pixel move is the boundary between click and drag, and only an
 * unmodified left/middle/touch release selects a node.
 */

export const GRAPH_VIEW_CLICK_DISTANCE_SQUARED = 25;

export function graphViewDragThresholdExceeded(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): boolean {
  const dx = currentX - startX;
  const dy = currentY - startY;
  return dx * dx + dy * dy > GRAPH_VIEW_CLICK_DISTANCE_SQUARED;
}

export type GraphViewNodeSelectionInput = {
  pointerType: string;
  button: number;
  modifier: boolean;
  dragging: boolean;
  cancelled: boolean;
};

export function shouldInvokeGraphViewContextAction(input: GraphViewNodeSelectionInput): boolean {
  return !input.dragging && !input.cancelled && (input.button === 2 || input.modifier);
}

export function shouldSelectGraphViewNode(input: GraphViewNodeSelectionInput): boolean {
  if (input.dragging || input.cancelled || input.modifier) return false;
  return input.pointerType === 'touch' || input.button === 0 || input.button === 1;
}
