export const GRAPH_VIEW_MIN_SCALE = 1 / 128;
export const GRAPH_VIEW_MAX_SCALE = 8;
const GRAPH_VIEW_WHEEL_SCALE = 1.5;
const GRAPH_VIEW_ZOOM_LERP = 0.85;

export type GraphViewCameraTransform = {
  panX: number;
  panY: number;
  scale: number;
};

export type GraphViewZoomCenter = {
  x: number;
  y: number;
};

export type GraphViewCameraViewport = {
  width: number;
  height: number;
};

export type GraphViewWheelInput = {
  deltaY: number;
  deltaMode?: number;
  offsetX: number;
  offsetY: number;
  devicePixelRatio: number;
};

export type GraphViewZoomUpdate = {
  transform: GraphViewCameraTransform;
  targetScale: number;
  zoomCenter: GraphViewZoomCenter;
  changed: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function safeDevicePixelRatio(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Normalize WheelEvent's pixel, line and page delta units. */
export function graphViewWheelDelta(deltaY: number, deltaMode = 0): number {
  const safeDelta = Number.isFinite(deltaY) ? deltaY : 0;
  if (deltaMode === 1) return safeDelta * 40;
  if (deltaMode === 2) return safeDelta * 800;
  return safeDelta;
}

/**
 * Apply the original wheel policy. Zoom-in uses the pointer as its anchor;
 * zoom-out resets the anchor to the viewport center (represented by 0, 0).
 */
export function graphViewWheelZoom(
  transform: GraphViewCameraTransform,
  input: GraphViewWheelInput,
  baseScale = transform.scale
): { targetScale: number; zoomCenter: GraphViewZoomCenter } {
  const delta = graphViewWheelDelta(input.deltaY, input.deltaMode);
  // The reference renderer applies each wheel event to targetScale, not to
  // the lagging rendered scale. Trackpads emit many small events before the
  // smoothed camera catches up; using transform.scale here would overwrite
  // those events and make pinch/scroll zoom feel unusually weak.
  const targetScale = baseScale * GRAPH_VIEW_WHEEL_SCALE ** (-delta / 120);
  const dpr = safeDevicePixelRatio(input.devicePixelRatio);
  return {
    targetScale,
    zoomCenter: targetScale < transform.scale ? { x: 0, y: 0 } : { x: input.offsetX * dpr, y: input.offsetY * dpr },
  };
}

/** Set a target zoom and optional physical-pixel anchor, matching zoomTo(). */
export function graphViewZoomTo(
  targetScale: number,
  center?: GraphViewZoomCenter
): { targetScale: number; zoomCenter: GraphViewZoomCenter } {
  return {
    targetScale,
    zoomCenter: center ? { ...center } : { x: 0, y: 0 },
  };
}

/**
 * Advance the smoothed zoom one render tick. Pan is solved from the world
 * point under the anchor, so zooming never makes that point jump.
 */
export function updateGraphViewZoom(
  transform: GraphViewCameraTransform,
  targetScale: number,
  zoomCenter: GraphViewZoomCenter,
  viewport: GraphViewCameraViewport,
  devicePixelRatio: number,
  interpolation = GRAPH_VIEW_ZOOM_LERP
): GraphViewZoomUpdate {
  const nextTarget = clamp(targetScale, GRAPH_VIEW_MIN_SCALE, GRAPH_VIEW_MAX_SCALE);
  const ratio = transform.scale > nextTarget ? transform.scale / nextTarget : nextTarget / transform.scale;
  if (ratio - 1 < 0.01) {
    return {
      transform: { ...transform },
      targetScale: nextTarget,
      zoomCenter: { ...zoomCenter },
      changed: false,
    };
  }

  let centerX = zoomCenter.x;
  let centerY = zoomCenter.y;
  if (centerX === 0 && centerY === 0) {
    const dpr = safeDevicePixelRatio(devicePixelRatio);
    centerX = (viewport.width / 2) * dpr;
    centerY = (viewport.height / 2) * dpr;
  }

  const worldX = (centerX - transform.panX) / transform.scale;
  const worldY = (centerY - transform.panY) / transform.scale;
  const nextScale = lerp(transform.scale, nextTarget, clamp(interpolation, 0, 1));
  return {
    transform: {
      panX: centerX - worldX * nextScale,
      panY: centerY - worldY * nextScale,
      scale: nextScale,
    },
    targetScale: nextTarget,
    zoomCenter: { ...zoomCenter },
    changed: true,
  };
}
