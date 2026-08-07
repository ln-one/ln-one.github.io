import { Application, Circle, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import { GRAPH_VIEW_MAX_SCALE, GRAPH_VIEW_MIN_SCALE, graphViewWheelZoom, updateGraphViewZoom } from './camera';
import { graphViewDisplayText, isGraphViewMarkdownPath } from './display-text';
import styles from './graph-view-engine-demo.module.css';
import { graphViewDragThresholdExceeded, shouldSelectGraphViewNode } from './pointer-behavior';
import {
  GRAPH_VIEW_BASE_ALPHA,
  graphViewArrowAlpha,
  graphViewFade,
  graphViewLabelLayout,
  graphViewLazyNodeIds,
  graphViewLinkGeometry,
  graphViewLinkTargetAlpha,
  graphViewNodeScale,
  graphViewNodeSize,
  graphViewNodeTargetAlpha,
  graphViewTextAlpha,
  shouldRenderDirectedLink,
} from './renderer-behavior';
import { DEFAULT_GRAPH_VIEW_THEME, readGraphViewTheme } from './theme';
import type { GraphViewEdge, GraphViewNode } from './types';

export type GraphViewCanvasData = {
  label?: string;
  color?: string;
  degree?: number;
  type?: 'focused' | 'tag' | 'unresolved' | 'attachment';
  pathState?: 'neutral' | 'selected' | 'cited' | 'citation';
  root?: boolean;
  selected?: boolean;
};

type GraphViewPathState = 'neutral' | 'selected' | 'cited' | 'citation';

type GraphViewCanvasEngine<TData> = {
  getGraphData: () => {
    nodes: readonly GraphViewNode<TData>[];
    links: readonly GraphViewEdge[];
  };
  getRevision?: () => number;
  dragNode: (id: string, x: number, y: number) => void;
  releaseNode: (id: string) => void;
};

type GraphViewCamera = {
  x: number;
  y: number;
  zoom: number;
};

type Viewport = {
  width: number;
  height: number;
};

type PanVelocity = {
  x: number;
  y: number;
};

type PointerState = {
  pointerId: number;
  pointerType: string;
  mode: 'node' | 'pan';
  id?: string;
  button: number;
  modifier: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  lastTime: number;
  elapsedBlend: number;
  dragging: boolean;
  originPanX: number;
  originPanY: number;
};

type PinchState = {
  distance: number;
  midpoint: { x: number; y: number };
};

type NodeDisplay<TData> = {
  node: GraphViewNode<TData>;
  container: Container;
  body: Graphics;
  highlight: Graphics | null;
  rootHalo: Graphics | null;
  label: Text | null;
  radius: number;
  color: number;
  tint: number;
  fadeAlpha: number;
  moveText: number;
  outlineAlpha: number;
};

type LinkDisplay = {
  link: GraphViewEdge;
  container: Container;
  line: Sprite;
  arrow: Graphics;
  flow: Graphics | null;
  alpha: number;
  arrowAlpha: number;
  tint: number;
};

type CameraTransition = {
  from: { panX: number; panY: number; scale: number };
  to: { panX: number; panY: number; scale: number };
  startedAt: number;
  duration: number;
};

export type PixiGraphViewCanvasHandle = {
  fitGraph: (duration?: number) => void;
  focusNode: (id: string, duration?: number) => void;
  focusNodes: (ids: readonly string[], duration?: number) => void;
  scaleBy: (factor: number) => void;
  translateBy: (x: number, y: number) => void;
  invalidate: () => void;
  getTransparentScreenshot: () => HTMLCanvasElement | null;
  getBackgroundScreenshot: () => HTMLCanvasElement | null;
};

export type PixiGraphViewCanvasProps<TData> = {
  engine: GraphViewCanvasEngine<TData> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRightClick?: (id: string) => void;
  onHover: (id: string | null) => void;
  onCameraChange?: (camera: GraphViewCamera) => void;
  onReady?: (handle: PixiGraphViewCanvasHandle | null) => void;
  getLinkPathState?: (link: GraphViewEdge) => GraphViewPathState;
  reducedMotion?: boolean;
  nodeSizeMultiplier?: number;
  lineSizeMultiplier?: number;
  textFadeMultiplier?: number;
  showArrow?: boolean;
};

const DEFAULT_SCALE = 1;
const MIN_SCALE = GRAPH_VIEW_MIN_SCALE;
const MAX_SCALE = GRAPH_VIEW_MAX_SCALE;
const NODE_FADE = 0.1;
const CAMERA_FADE = 0.15;
// The recovered renderer keeps non-highlighted links at its normal .2 alpha
// while a node is hovered. Only the active path is promoted to full alpha.
const INITIAL_LINK_ALPHA = GRAPH_VIEW_BASE_ALPHA;
const CITATION_PATH_THEME = { rgb: 0xd45170, a: 0.96 };
const CITATION_FLOW_PERIOD = 1450;
const CITATION_FLOW_OFFSETS = [0, 0.34, 0.68] as const;
const FONT_FAMILY =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

// The original renderer's XU helper uses the third argument as the amount of
// the current value retained, rather than the amount of the target value.
function retainLerp(current: number, target: number, retention: number): number {
  return current * retention + target * (1 - retention);
}

function lerpColor(from: number, to: number, amount: number): number {
  const red = Math.round(lerp((from >> 16) & 0xff, (to >> 16) & 0xff, amount));
  const green = Math.round(lerp((from >> 8) & 0xff, (to >> 8) & 0xff, amount));
  const blue = Math.round(lerp(from & 0xff, to & 0xff, amount));
  return (red << 16) | (green << 8) | blue;
}

function toColor(value: string | undefined, fallback = 0x5069d9): number {
  if (!value) return fallback;
  const normalized = value.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized, 16) : fallback;
}

function displayLabel(value: string): string {
  return graphViewDisplayText(value, isGraphViewMarkdownPath(value));
}

function isMacControlClick(event: { ctrlKey?: boolean }): boolean {
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) && Boolean(event.ctrlKey);
}

function worldViewport(panX: number, panY: number, scale: number, viewport: Viewport): Rectangle {
  const left = -panX / scale;
  const top = -panY / scale;
  return new Rectangle(left, top, viewport.width / scale, viewport.height / scale);
}

function intersectsViewport(viewport: Rectangle, bounds: Rectangle): boolean {
  return (
    bounds.right >= viewport.left &&
    bounds.left <= viewport.right &&
    bounds.bottom >= viewport.top &&
    bounds.top <= viewport.bottom
  );
}

function cameraFromTransform(panX: number, panY: number, scale: number, viewport: Viewport): GraphViewCamera {
  return {
    x: (viewport.width / 2 - panX) / scale,
    y: (viewport.height / 2 - panY) / scale,
    zoom: scale,
  };
}

export function PixiGraphViewCanvas<TData extends GraphViewCanvasData>({
  engine,
  selectedId,
  onSelect,
  onRightClick,
  onHover,
  onCameraChange,
  onReady,
  getLinkPathState,
  reducedMotion = false,
  nodeSizeMultiplier = 1,
  lineSizeMultiplier = 1,
  textFadeMultiplier = 0,
  showArrow = false,
}: PixiGraphViewCanvasProps<TData>): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GraphViewCanvasEngine<TData> | null>(engine);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onRightClickRef = useRef(onRightClick);
  const onHoverRef = useRef(onHover);
  const onCameraChangeRef = useRef(onCameraChange);
  const onReadyRef = useRef(onReady);
  const getLinkPathStateRef = useRef(getLinkPathState);
  const reducedMotionRef = useRef(reducedMotion);
  const nodeSizeMultiplierRef = useRef(nodeSizeMultiplier);
  const lineSizeMultiplierRef = useRef(lineSizeMultiplier);
  const textFadeMultiplierRef = useRef(textFadeMultiplier);
  const showArrowRef = useRef(showArrow);
  const invalidateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    engineRef.current = engine;
    invalidateRef.current?.();
  }, [engine]);

  useEffect(() => {
    selectedRef.current = selectedId;
    invalidateRef.current?.();
  }, [selectedId]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onRightClickRef.current = onRightClick;
  }, [onRightClick]);

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    getLinkPathStateRef.current = getLinkPathState;
    invalidateRef.current?.();
  }, [getLinkPathState]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
    invalidateRef.current?.();
  }, [reducedMotion]);

  useEffect(() => {
    nodeSizeMultiplierRef.current = nodeSizeMultiplier;
    lineSizeMultiplierRef.current = lineSizeMultiplier;
    textFadeMultiplierRef.current = textFadeMultiplier;
    showArrowRef.current = showArrow;
    invalidateRef.current?.();
  }, [lineSizeMultiplier, nodeSizeMultiplier, showArrow, textFadeMultiplier]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;
    let interactionCanvas: HTMLCanvasElement | null = null;
    let animationFrame: number | null = null;
    let idleFrames = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let reduceMotion = reducedMotionRef.current || prefersReducedMotion;
    let theme = readGraphViewTheme(document, DEFAULT_GRAPH_VIEW_THEME);
    const viewport: Viewport = { width: 1, height: 1 };
    const transform = { panX: 0, panY: 0, scale: DEFAULT_SCALE };
    // Pan is a live camera value in the reference renderer. Only zoom has a
    // target value; a second pan target causes gestures to snap back.
    const target = { scale: DEFAULT_SCALE };
    const zoomCenter = { x: 0, y: 0 };
    const panVelocity: PanVelocity = { x: 0, y: 0 };
    const pointerRef: { current: PointerState | null } = { current: null };
    const pinchRef: { current: PinchState | null } = { current: null };
    const activePointers = new Map<number, { x: number; y: number }>();
    const hoveredIdRef: { current: string | null } = { current: null };
    const mousePosition: { x: number | null; y: number | null } = { x: null, y: null };
    const nodeRecords = new Map<string, GraphViewNode<TData>>();
    const linkRecords = new Map<string, GraphViewEdge>();
    const nodeDisplays = new Map<string, NodeDisplay<TData>>();
    const linkDisplays = new Map<string, LinkDisplay>();
    const reverseLinkIds = new Set<string>();
    const world = new Container();
    const linkLayer = new Container();
    const nodeLayer = new Container();
    const labelLayer = new Container();
    const panLayer = new Graphics();
    let cameraTransition: CameraTransition | null = null;
    let lastGraphEngine: GraphViewCanvasEngine<TData> | null = null;
    let lastNodes: readonly GraphViewNode<TData>[] | null = null;
    let lastLinks: readonly GraphViewEdge[] | null = null;
    let lastRevision = -1;
    let lastFocusId: string | null = null;
    let lastSelectedId: string | null = selectedRef.current;
    let lastWidth = 0;
    let lastHeight = 0;
    let lastDpr = dpr;
    let lastCameraNotification = 0;

    const getFocusId = (): string | null => {
      const pointer = pointerRef.current;
      return pointer?.mode === 'node' ? (pointer.id ?? null) : hoveredIdRef.current;
    };

    const scheduleRender = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const invalidate = () => {
      idleFrames = 0;
      scheduleRender();
    };

    const markDirty = () => {
      idleFrames = 0;
      scheduleRender();
    };

    const themeObserver = new MutationObserver(() => {
      theme = readGraphViewTheme(document, DEFAULT_GRAPH_VIEW_THEME);
      markDirty();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    const setCursor = (cursor: 'default' | 'pointer' | 'grabbing') => {
      if (interactionCanvas) interactionCanvas.style.cursor = cursor;
    };

    const setBodyGrabbing = (grabbing: boolean) => {
      document.body.classList.toggle('is-grabbing', grabbing);
    };

    const notifyCamera = (now: number) => {
      if (now - lastCameraNotification < 40) return;
      lastCameraNotification = now;
      onCameraChangeRef.current?.(cameraFromTransform(transform.panX, transform.panY, transform.scale, viewport));
    };

    const setTransform = (panX: number, panY: number, scale: number) => {
      transform.panX = panX;
      transform.panY = panY;
      transform.scale = clamp(scale, MIN_SCALE, MAX_SCALE);
      if (app) {
        world.position.set(transform.panX, transform.panY);
        world.scale.set(transform.scale);
      }
    };

    const stopCameraTransition = () => {
      cameraTransition = null;
      // Keep the pending zoom target. Obsidian treats the camera target as
      // continuous state: wheel/pinch events accumulate on it while the
      // rendered scale is still catching up. Resetting it here makes a
      // sequence of small trackpad deltas repeatedly start from the lagging
      // rendered scale and effectively swallows most of the gesture.
      panVelocity.x = 0;
      panVelocity.y = 0;
    };

    const updateZoom = () => {
      const result = updateGraphViewZoom(
        transform,
        target.scale,
        zoomCenter,
        { width: viewport.width / dpr, height: viewport.height / dpr },
        dpr,
        reduceMotion ? 1 : CAMERA_FADE
      );
      target.scale = result.targetScale;
      zoomCenter.x = result.zoomCenter.x;
      zoomCenter.y = result.zoomCenter.y;
      setTransform(result.transform.panX, result.transform.panY, result.transform.scale);
    };

    const fitGraph = (duration = 680) => {
      const graph = engineRef.current?.getGraphData();
      if (!graph || graph.nodes.length === 0) return;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const node of graph.nodes) {
        const radius = visualRadius(node);
        minX = Math.min(minX, node.x - radius);
        maxX = Math.max(maxX, node.x + radius);
        minY = Math.min(minY, node.y - radius);
        maxY = Math.max(maxY, node.y + radius);
      }
      const padding = 55 * dpr;
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const nextScale = clamp(
        Math.min((viewport.width - padding * 2) / spanX, (viewport.height - padding * 2) / spanY),
        MIN_SCALE,
        MAX_SCALE
      );
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const next = {
        panX: viewport.width / 2 - centerX * nextScale,
        panY: viewport.height / 2 - centerY * nextScale,
        scale: nextScale,
      };
      if (reduceMotion || duration <= 0) {
        cameraTransition = null;
        target.scale = next.scale;
        setTransform(next.panX, next.panY, next.scale);
      } else {
        cameraTransition = {
          from: { ...transform },
          to: next,
          startedAt: performance.now(),
          duration,
        };
        target.scale = next.scale;
      }
      markDirty();
    };

    const focusNode = (id: string, duration = 680) => {
      const graphNode = nodeRecords.get(id) ?? engineRef.current?.getGraphData().nodes.find((node) => node.id === id);
      if (!graphNode || !Number.isFinite(graphNode.x) || !Number.isFinite(graphNode.y)) return;
      stopCameraTransition();
      const nextScale = clamp(Math.max(transform.scale * 1.45, 1), MIN_SCALE, MAX_SCALE);
      const next = {
        panX: viewport.width / 2 - graphNode.x * nextScale,
        panY: viewport.height / 2 - graphNode.y * nextScale,
        scale: nextScale,
      };
      if (reduceMotion || duration <= 0) {
        target.scale = next.scale;
        setTransform(next.panX, next.panY, next.scale);
      } else {
        cameraTransition = {
          from: { ...transform },
          to: next,
          startedAt: performance.now(),
          duration,
        };
        target.scale = next.scale;
      }
      markDirty();
    };

    const focusNodes = (ids: readonly string[], duration = 680) => {
      const graph = engineRef.current?.getGraphData();
      if (!graph || ids.length === 0) return;
      const requestedIds = new Set(ids);
      const nodes = graph.nodes.filter(
        (node) => requestedIds.has(node.id) && Number.isFinite(node.x) && Number.isFinite(node.y)
      );
      if (nodes.length === 0) return;

      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const node of nodes) {
        const radius = visualRadius(node);
        minX = Math.min(minX, node.x - radius);
        maxX = Math.max(maxX, node.x + radius);
        minY = Math.min(minY, node.y - radius);
        maxY = Math.max(maxY, node.y + radius);
      }

      stopCameraTransition();
      const padding = 96 * dpr;
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const fittedScale = Math.min((viewport.width - padding * 2) / spanX, (viewport.height - padding * 2) / spanY);
      // Keep the path readable without turning a short Source→Workspace path
      // into a full-canvas zoom. The whole graph remains available around it.
      const nextScale = clamp(Math.min(fittedScale, Math.max(transform.scale * 1.45, 1)), MIN_SCALE, MAX_SCALE);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const next = {
        panX: viewport.width / 2 - centerX * nextScale,
        panY: viewport.height / 2 - centerY * nextScale,
        scale: nextScale,
      };
      if (reduceMotion || duration <= 0) {
        target.scale = next.scale;
        setTransform(next.panX, next.panY, next.scale);
      } else {
        cameraTransition = {
          from: { ...transform },
          to: next,
          startedAt: performance.now(),
          duration,
        };
        target.scale = next.scale;
      }
      markDirty();
    };

    const scaleBy = (factor: number) => {
      stopCameraTransition();
      target.scale *= factor;
      zoomCenter.x = viewport.width / 2;
      zoomCenter.y = viewport.height / 2;
      markDirty();
    };

    const translateBy = (x: number, y: number) => {
      stopCameraTransition();
      transform.panX += x * dpr;
      transform.panY += y * dpr;
      setTransform(transform.panX, transform.panY, transform.scale);
      markDirty();
    };

    const resize = () => {
      if (!app || !interactionCanvas) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      dpr = Math.max(1, window.devicePixelRatio || 1);
      const physicalWidth = Math.round(width * dpr);
      const physicalHeight = Math.round(height * dpr);
      if (width === lastWidth && height === lastHeight && dpr === lastDpr) return;
      const hadViewport = lastWidth > 0 && lastHeight > 0;
      const oldPhysicalWidth = viewport.width;
      const oldPhysicalHeight = viewport.height;
      lastWidth = width;
      lastHeight = height;
      lastDpr = dpr;
      viewport.width = physicalWidth;
      viewport.height = physicalHeight;
      app.canvas.style.width = `${width}px`;
      app.canvas.style.height = `${height}px`;
      app.renderer.resize(physicalWidth, physicalHeight);
      interactionCanvas.width = width;
      interactionCanvas.height = height;
      interactionCanvas.style.width = `${width}px`;
      interactionCanvas.style.height = `${height}px`;
      const events = app.renderer.events as unknown as {
        resolutionChange?: (resolution: number) => void;
      };
      events.resolutionChange?.(1 / dpr);
      if (hadViewport) {
        transform.panX += (physicalWidth - oldPhysicalWidth) / 2;
        transform.panY += (physicalHeight - oldPhysicalHeight) / 2;
      } else {
        transform.panX = physicalWidth / 2;
        transform.panY = physicalHeight / 2;
      }
      panLayer.clear().rect(0, 0, physicalWidth, physicalHeight).fill({
        color: 0,
        alpha: 0.0001,
      });
      panLayer.hitArea = new Rectangle(0, 0, physicalWidth, physicalHeight);
      setTransform(transform.panX, transform.panY, transform.scale);
      markDirty();
    };

    const createLabel = (display: NodeDisplay<TData>): Text => {
      const label = new Text({
        text: displayLabel(display.node.data?.label ?? display.node.id),
        style: new TextStyle({
          fontSize: 14 + display.radius / 4,
          fill: theme.text.rgb,
          fontFamily: FONT_FAMILY,
          wordWrap: true,
          wordWrapWidth: 300,
          align: 'center',
        }),
        anchor: { x: 0.5, y: 0 },
      });
      label.eventMode = 'none';
      label.resolution = 2;
      label.zIndex = 2;
      labelLayer.addChild(label);
      display.label = label;
      return label;
    };

    const setHovered = (id: string | null) => {
      if (hoveredIdRef.current === id) return;
      hoveredIdRef.current = id;
      onHoverRef.current(id);
      markDirty();
    };

    // Pixi's event system is intentionally configured with a physical-pixel
    // resolution so its world coordinates line up with the rendered graph.
    // Native pointer events below are CSS-pixel coordinates. Keep gesture
    // bookkeeping in CSS pixels and convert only when writing to the world.
    const logicalPointFromPixiEvent = (event: { global: { x: number; y: number } }) => ({
      x: event.global.x / dpr,
      y: event.global.y / dpr,
    });

    const logicalPointFromDomEvent = (event: { clientX: number; clientY: number }) => {
      const rect = interactionCanvas?.getBoundingClientRect();
      return {
        x: event.clientX - (rect?.left ?? 0),
        y: event.clientY - (rect?.top ?? 0),
      };
    };

    const registerPointer = (event: { pointerId: number; global: { x: number; y: number } }) => {
      const point = logicalPointFromPixiEvent(event);
      activePointers.set(event.pointerId, point);
      try {
        interactionCanvas?.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort on browsers that do not expose it
        // for synthetic or touch events.
      }
      if (activePointers.size < 2) return;
      const pointer = pointerRef.current;
      if (pointer?.mode === 'node' && pointer.id) {
        engineRef.current?.releaseNode(pointer.id);
      }
      pointerRef.current = null;
      const [first, second] = [...activePointers.values()];
      if (!first || !second) return;
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        midpoint: {
          x: ((first.x + second.x) / 2) * dpr,
          y: ((first.y + second.y) / 2) * dpr,
        },
      };
      stopCameraTransition();
      setBodyGrabbing(true);
      setCursor('grabbing');
      markDirty();
    };

    const visualRadius = (node: GraphViewNode<TData>): number =>
      graphViewNodeSize(node.weight, nodeSizeMultiplierRef.current);

    const nodeFillTheme = (node: GraphViewNode<TData>) => {
      // Focused nodes take the dedicated theme color before custom query
      // colors, matching the renderer's `getFillColor` branch ordering.
      if (node.data?.type === 'focused') {
        return theme.fillFocused.a > 0 ? theme.fillFocused : theme.fill;
      }
      if (node.data?.color) return { rgb: toColor(node.data.color, theme.fill.rgb), a: 1 };
      switch (node.data?.type) {
        case 'tag':
          return theme.fillTag;
        case 'unresolved':
          return theme.fillUnresolved;
        case 'attachment':
          return theme.fillAttachment;
        default:
          return theme.fill;
      }
    };

    const createNodeDisplay = (node: GraphViewNode<TData>): NodeDisplay<TData> => {
      const radius = visualRadius(node);
      const color = nodeFillTheme(node).rgb;
      const container = new Container();
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.zIndex = 1;
      container.hitArea = new Circle(0, 0, radius);
      const body = new Graphics().circle(0, 0, radius).fill({ color: 0xffffff });
      body.eventMode = 'none';
      const rootHalo = node.data?.root ? new Graphics() : null;
      if (rootHalo) {
        rootHalo.eventMode = 'none';
        container.addChild(rootHalo);
      }
      container.addChild(body);
      nodeLayer.addChild(container);
      const display: NodeDisplay<TData> = {
        node,
        container,
        body,
        highlight: null,
        rootHalo,
        label: null,
        radius,
        color,
        tint: color,
        fadeAlpha: 0,
        moveText: 0,
        outlineAlpha: 0,
      };
      container.on('pointerdown', (event) => {
        // Record every pointer button first. The reference renderer waits for
        // the later click/rightclick event to classify context actions, so a
        // right-drag never opens a menu from pointerdown.
        event.stopPropagation();
        registerPointer(event);
        if (activePointers.size >= 2) return;
        const point = logicalPointFromPixiEvent(event);
        pointerRef.current = {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          mode: 'node',
          id: node.id,
          button: event.button,
          modifier: isMacControlClick(event),
          startX: point.x,
          startY: point.y,
          lastX: point.x,
          lastY: point.y,
          startedAt: performance.now(),
          lastTime: performance.now(),
          elapsedBlend: 0,
          dragging: false,
          originPanX: transform.panX,
          originPanY: transform.panY,
        };
        stopCameraTransition();
        markDirty();
      });
      // Labels are allocated with the node display in the reference renderer;
      // visibility and alpha are still controlled by the zoom threshold.
      createLabel(display);
      container.on('pointerover', (event) => {
        if (event.pointerType !== 'touch') {
          setCursor('pointer');
          setHovered(node.id);
        }
      });
      const handleContextAction = (event: {
        button?: number;
        ctrlKey?: boolean;
        nativeEvent?: { button?: number; ctrlKey?: boolean };
        stopPropagation?: () => void;
      }) => {
        const nativeEvent = event.nativeEvent ?? event;
        if (nativeEvent.button !== 2 && !isMacControlClick(nativeEvent)) return;
        event.stopPropagation?.();
        onRightClickRef.current?.(node.id);
      };
      container.on('click', handleContextAction);
      container.on('rightclick', handleContextAction);
      container.on('pointerout', (event) => {
        if (event.pointerType !== 'touch') {
          setCursor('default');
          setHovered(null);
        }
      });
      nodeDisplays.set(node.id, display);
      return display;
    };

    const createLinkDisplay = (link: GraphViewEdge): LinkDisplay => {
      const container = new Container();
      const line = new Sprite(Texture.WHITE);
      // The recovered renderer positions the line sprite at its clipped
      // source endpoint and offsets it by half its thickness in local space.
      line.anchor.set(0, 0);
      line.eventMode = 'none';
      line.alpha = INITIAL_LINK_ALPHA * theme.line.a;
      container.addChild(line);
      linkLayer.addChild(container);
      // The reference renderer keeps the arrow as a sibling of the line
      // container. This matters when the line is culled: the arrow has its
      // own visibility/alpha state and must not inherit the line container's
      // visibility.
      const arrow = new Graphics();
      arrow.eventMode = 'none';
      arrow.poly([0, 0, -4, -2, -3, 0, -4, 2]).fill({ color: 0xffffff });
      arrow.alpha = INITIAL_LINK_ALPHA * theme.text.a;
      arrow.tint = theme.text.rgb;
      linkLayer.addChild(arrow);
      const display: LinkDisplay = {
        link,
        container,
        line,
        arrow,
        flow: null,
        alpha: INITIAL_LINK_ALPHA,
        arrowAlpha: INITIAL_LINK_ALPHA,
        tint: theme.line.rgb,
      };
      linkDisplays.set(link.id, display);
      return display;
    };

    const updateNodeGeometry = (display: NodeDisplay<TData>, node: GraphViewNode<TData>) => {
      const radius = visualRadius(node);
      const color = nodeFillTheme(node).rgb;
      display.node = node;
      if (display.radius === radius && display.color === color) {
        if (display.label) display.label.text = displayLabel(node.data?.label ?? node.id);
        return;
      }
      display.radius = radius;
      display.color = color;
      display.body.clear().circle(0, 0, radius).fill({ color: 0xffffff });
      display.container.hitArea = new Circle(0, 0, radius);
      if (display.label) {
        display.label.text = displayLabel(node.data?.label ?? node.id);
        display.label.style.fontSize = 14 + radius / 4;
      }
    };

    const reconcileGraph = (graph: { nodes: readonly GraphViewNode<TData>[]; links: readonly GraphViewEdge[] }) => {
      nodeRecords.clear();
      linkRecords.clear();
      reverseLinkIds.clear();
      const directedPairs = new Set<string>();
      for (const node of graph.nodes) {
        nodeRecords.set(node.id, node);
        const display = nodeDisplays.get(node.id);
        if (display) updateNodeGeometry(display, node);
      }
      for (const link of graph.links) {
        linkRecords.set(link.id, link);
        directedPairs.add(`${link.source}\u0000${link.target}`);
      }
      for (const link of linkRecords.values()) {
        const reverse = `${link.target}\u0000${link.source}`;
        if (directedPairs.has(reverse) && !shouldRenderDirectedLink(link.source, link.target, true)) {
          reverseLinkIds.add(link.id);
        }
      }
      for (const [id, display] of nodeDisplays) {
        if (nodeRecords.has(id)) continue;
        display.container.destroy({ children: true });
        display.highlight?.destroy();
        display.label?.destroy();
        nodeDisplays.delete(id);
      }
      for (const [id, display] of linkDisplays) {
        if (linkRecords.has(id)) continue;
        display.container.destroy({ children: true });
        display.arrow.destroy();
        linkDisplays.delete(id);
      }
    };

    const ensureRenderedDisplays = (graphCenter: { x: number; y: number }): boolean => {
      if (nodeRecords.size === 0) return false;
      const nearest: Array<{ node: GraphViewNode<TData>; distance: number }> = [];
      for (const node of nodeRecords.values()) {
        if (nodeDisplays.has(node.id)) continue;
        const dx = node.x - graphCenter.x;
        const dy = node.y - graphCenter.y;
        nearest.push({ node, distance: dx * dx + dy * dy });
      }
      const selectedIds = new Set(
        graphViewLazyNodeIds(
          nearest.map(({ node }) => node),
          new Set(),
          graphCenter.x,
          graphCenter.y
        )
      );
      for (const candidate of nearest) {
        if (selectedIds.has(candidate.node.id)) createNodeDisplay(candidate.node);
      }
      for (const link of linkRecords.values()) {
        if (linkDisplays.has(link.id)) continue;
        if (!nodeDisplays.has(link.source) || !nodeDisplays.has(link.target)) continue;
        createLinkDisplay(link);
      }
      return nearest.length > 0;
    };

    const getRelated = (focusId: string | null) => {
      const nodeIds = new Set<string>();
      const linkIds = new Set<string>();
      if (!focusId) return { nodeIds, linkIds };
      nodeIds.add(focusId);
      for (const link of linkRecords.values()) {
        if (link.source !== focusId && link.target !== focusId) continue;
        nodeIds.add(link.source);
        nodeIds.add(link.target);
        linkIds.add(link.id);
      }
      return { nodeIds, linkIds };
    };

    const renderNodes = (view: Rectangle, focusId: string | null, now: number): boolean => {
      const related = getRelated(focusId);
      const fade = graphViewTextAlpha(transform.scale, textFadeMultiplierRef.current);
      const nodeScale = graphViewNodeScale(transform.scale);
      let animating = false;
      for (const [id, display] of nodeDisplays) {
        const node = nodeRecords.get(id);
        if (!node) continue;
        updateNodeGeometry(display, node);
        const focused = id === focusId;
        const pathState = node.data?.pathState ?? 'neutral';
        const isRoot = Boolean(node.data?.root);
        const selected = selectedRef.current === id || Boolean(node.data?.selected);
        // The bundle has no renderer-level selected state. Selection is an
        // application callback; only hover/drag drives the graph highlight.
        const highlighted = focused;
        const fill = nodeFillTheme(node);
        const highlightedFill = theme.fillHighlight;
        const targetFade = graphViewNodeTargetAlpha(focusId !== null, focused, related.nodeIds.has(id));
        display.fadeAlpha = graphViewFade(display.fadeAlpha, targetFade, reduceMotion);
        display.tint = lerpColor(
          display.tint,
          highlighted ? highlightedFill.rgb : fill.rgb,
          reduceMotion ? 1 : NODE_FADE
        );
        display.container.position.set(node.x, node.y);
        display.container.scale.set(nodeScale);
        display.body.tint = display.tint;
        display.body.alpha = display.fadeAlpha * (highlighted ? highlightedFill.a : fill.a);
        if (display.rootHalo) {
          const rootScale = isRoot && pathState === 'citation' && !reduceMotion ? 1 + Math.sin(now / 700) * 0.035 : 1;
          const haloWidth = Math.max(1.5, 2 / (transform.scale * nodeScale));
          const haloRadius = display.radius + 5 / (transform.scale * nodeScale);
          display.rootHalo
            .clear()
            .circle(0, 0, haloRadius)
            .stroke({ color: theme.fillFocused.rgb, width: haloWidth, alpha: 0.72 });
          display.rootHalo.scale.set(rootScale);
          display.rootHalo.alpha = isRoot ? 1 : 0;
          display.rootHalo.visible = isRoot;
        }
        const bodyVisible =
          focused ||
          intersectsViewport(
            view,
            new Rectangle(
              node.x - display.radius * nodeScale - 1,
              node.y - display.radius * nodeScale - 1,
              display.radius * 2 * nodeScale + 2,
              display.radius * 2 * nodeScale + 2
            )
          );
        display.container.visible = bodyVisible;
        animating ||= Math.abs(display.fadeAlpha - targetFade) > 0.005;

        if (display.label) {
          const nextLabel = graphViewLabelLayout({
            x: node.x,
            y: node.y,
            size: display.radius,
            scale: transform.scale,
            nodeScale,
            moveText: display.moveText,
            focused,
            textAlpha: fade,
            fadeAlpha: display.fadeAlpha,
            textColorAlpha: theme.text.a,
          });
          display.moveText = lerp(display.moveText, nextLabel.targetMoveText, reduceMotion ? 1 : NODE_FADE);
          const labelLayout = graphViewLabelLayout({
            x: node.x,
            y: node.y,
            size: display.radius,
            scale: transform.scale,
            nodeScale,
            moveText: display.moveText,
            focused,
            textAlpha: fade,
            fadeAlpha: display.fadeAlpha,
            textColorAlpha: theme.text.a,
          });
          display.label.position.set(labelLayout.x, labelLayout.y);
          display.label.scale.set(labelLayout.scale);
          const labelAlpha = labelLayout.alpha;
          display.label.alpha = labelAlpha;
          display.label.tint = theme.text.rgb;
          const labelBounds = new Rectangle(node.x - 300, node.y, 600, 200);
          display.label.visible = focused || (labelLayout.visible && intersectsViewport(view, labelBounds));
          animating ||= Math.abs(display.moveText - labelLayout.targetMoveText) > 0.05;
        }

        const needsHighlight = focused || selected || pathState !== 'neutral';
        const targetOutlineAlpha = needsHighlight ? 1 : 0;
        display.outlineAlpha = lerp(display.outlineAlpha, targetOutlineAlpha, reduceMotion ? 1 : NODE_FADE);
        if ((needsHighlight || display.outlineAlpha > 0.001) && !display.highlight) {
          display.highlight = new Graphics();
          display.highlight.eventMode = 'none';
          display.container.addChild(display.highlight);
        }
        if (display.highlight) {
          display.highlight.visible = display.outlineAlpha > 0.001;
          const outlineWidth = Math.max(1, 1 / (transform.scale * nodeScale));
          const outlineColor =
            pathState === 'citation'
              ? CITATION_PATH_THEME.rgb
              : focused || pathState === 'selected'
                ? theme.circle.rgb
                : pathState === 'cited'
                  ? theme.lineHighlight.rgb
                  : theme.circle.rgb;
          display.highlight
            .clear()
            .circle(0, 0, display.radius + outlineWidth / 2)
            .stroke({
              color: outlineColor,
              width: outlineWidth,
              alpha: pathState === 'citation' ? CITATION_PATH_THEME.a : theme.circle.a,
            });
          display.highlight.alpha = display.outlineAlpha;
          animating ||= Math.abs(display.outlineAlpha - targetOutlineAlpha) > 0.005;
          if (!needsHighlight && display.outlineAlpha <= 0.001) {
            display.highlight.destroy();
            display.highlight = null;
          }
        }
      }
      return animating;
    };

    const renderLinks = (view: Rectangle, focusId: string | null, now: number): boolean => {
      const related = getRelated(focusId);
      const nodeScale = graphViewNodeScale(transform.scale);
      const lineHeight = lineSizeMultiplierRef.current / transform.scale;
      let animating = false;
      for (const display of linkDisplays.values()) {
        const link = display.link;
        const source = nodeRecords.get(link.source);
        const target = nodeRecords.get(link.target);
        const sourceDisplay = nodeDisplays.get(link.source);
        const targetDisplay = nodeDisplays.get(link.target);
        if (!source || !target || !sourceDisplay || !targetDisplay || reverseLinkIds.has(link.id)) {
          display.container.visible = false;
          display.arrow.visible = false;
          if (display.flow) display.flow.visible = false;
          continue;
        }
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const pathState = getLinkPathStateRef.current?.(link) ?? 'neutral';
        const citationPath = pathState === 'citation';
        const effectiveLineSizeMultiplier = citationPath
          ? lineSizeMultiplierRef.current * 1.55
          : lineSizeMultiplierRef.current;
        const geometry = graphViewLinkGeometry({
          sourceX: source.x,
          sourceY: source.y,
          targetX: target.x,
          targetY: target.y,
          sourceRadius: sourceDisplay.radius * nodeScale,
          targetRadius: targetDisplay.radius * nodeScale,
          scale: transform.scale,
          lineSizeMultiplier: effectiveLineSizeMultiplier,
        });
        if (!geometry) {
          display.container.visible = false;
          display.arrow.visible = false;
          if (display.flow) display.flow.visible = false;
          continue;
        }
        const relatedLink = related.linkIds.has(link.id);
        const highlighted = relatedLink || pathState !== 'neutral';
        const linkTheme =
          pathState === 'citation' ? CITATION_PATH_THEME : highlighted ? theme.lineHighlight : theme.line;
        const targetAlpha =
          pathState === 'citation' || pathState === 'cited'
            ? 1
            : pathState === 'selected'
              ? 0.86
              : graphViewLinkTargetAlpha(focusId !== null, relatedLink);
        display.alpha = graphViewFade(display.alpha, targetAlpha, reduceMotion);
        display.arrowAlpha = graphViewFade(
          display.arrowAlpha,
          graphViewArrowAlpha(targetAlpha, transform.scale, theme.arrow.a),
          reduceMotion
        );
        display.tint = lerpColor(display.tint, linkTheme.rgb, reduceMotion ? 1 : NODE_FADE);
        display.container.position.set(0, 0);
        display.line.position.set(geometry.line.x, geometry.line.y);
        display.line.rotation = geometry.line.rotation;
        display.line.width = geometry.line.width;
        display.line.height = geometry.line.height;
        display.line.tint = display.tint;
        display.line.alpha = display.alpha * linkTheme.a;
        const lineVisible = intersectsViewport(
          view,
          new Rectangle(
            Math.min(source.x, target.x) - lineHeight,
            Math.min(source.y, target.y) - lineHeight,
            Math.abs(dx) + lineHeight * 2,
            Math.abs(dy) + lineHeight * 2
          )
        );
        display.container.visible = lineVisible;

        if (citationPath && !reduceMotion && geometry.line.width > 0) {
          if (!display.flow) {
            display.flow = new Graphics();
            display.flow.eventMode = 'none';
            display.container.addChild(display.flow);
          }
          const flowProgress = (now % CITATION_FLOW_PERIOD) / CITATION_FLOW_PERIOD;
          const lineStartX = geometry.line.x;
          const lineStartY = geometry.line.y + geometry.line.height / 2;
          const unitX = dx / geometry.distance;
          const unitY = dy / geometry.distance;
          // Evidence returns from the cited Source toward the current
          // Workspace. The graph edge keeps its declared direction, so the
          // particle phase travels along the same segment in reverse.
          const flowDirectionX = -unitX;
          const flowDirectionY = -unitY;
          const flowRadius = Math.max(1.1, geometry.lineThickness * 1.55);
          display.flow.clear();
          for (const offset of CITATION_FLOW_OFFSETS) {
            const distance = ((flowProgress + offset) % 1) * geometry.line.width;
            const x = lineStartX + unitX * (geometry.line.width - distance);
            const y = lineStartY + unitY * (geometry.line.width - distance);
            display.flow
              .circle(x - flowDirectionX * flowRadius * 2.8, y - flowDirectionY * flowRadius * 2.8, flowRadius * 0.55)
              .fill({ color: CITATION_PATH_THEME.rgb, alpha: 0.28 })
              .circle(x, y, flowRadius)
              .fill({ color: CITATION_PATH_THEME.rgb, alpha: 0.94 });
          }
          display.flow.alpha = display.alpha;
          display.flow.visible = lineVisible;
          animating = true;
        } else if (display.flow) {
          display.flow.destroy();
          display.flow = null;
        }

        const arrow = display.arrow;
        if (showArrowRef.current) {
          arrow.position.set(geometry.arrow.x, geometry.arrow.y);
          arrow.rotation = geometry.arrow.rotation;
          arrow.scale.set(geometry.arrow.scale);
          arrow.tint = theme.arrow.rgb;
          // The original renderer smooths line and arrow alpha independently.
          // This keeps toggling arrows from changing the line's weight.
          arrow.alpha = display.arrowAlpha;
          arrow.visible = lineVisible && geometry.arrow.visibleAtDistance && display.arrowAlpha > 0.001;
        } else {
          arrow.visible = false;
        }
      }
      return animating;
    };

    const updatePinch = (): boolean => {
      if (activePointers.size < 2) return false;
      const values = [...activePointers.values()];
      const first = values[0];
      const second = values[1];
      const pinch = pinchRef.current;
      if (!first || !second || !pinch) return false;
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const midpointPhysical = { x: midpoint.x * dpr, y: midpoint.y * dpr };
      const ratio = distance / pinch.distance;
      const nextScale = clamp(target.scale * ratio, MIN_SCALE, MAX_SCALE);
      const panX = transform.panX + midpointPhysical.x - pinch.midpoint.x;
      const panY = transform.panY + midpointPhysical.y - pinch.midpoint.y;
      pinch.distance = distance;
      pinch.midpoint = midpointPhysical;
      target.scale = nextScale;
      setTransform(panX, panY, transform.scale);
      markDirty();
      return true;
    };

    const startPan = (event: {
      pointerId: number;
      pointerType: string;
      global: { x: number; y: number };
      button?: number;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
    }) => {
      if (event.button !== undefined && event.button !== 0) return;
      registerPointer(event);
      if (activePointers.size >= 2) return;
      const point = logicalPointFromPixiEvent(event);
      pointerRef.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        mode: 'pan',
        button: event.button ?? 0,
        modifier: isMacControlClick(event),
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        startedAt: performance.now(),
        lastTime: performance.now(),
        elapsedBlend: 0,
        dragging: false,
        originPanX: transform.panX,
        originPanY: transform.panY,
      };
      stopCameraTransition();
      setBodyGrabbing(true);
      setCursor('grabbing');
      markDirty();
    };

    const handleStageMove = (event: { pointerId: number; global: { x: number; y: number } }) => {
      const active = activePointers.get(event.pointerId);
      if (active) {
        active.x = event.global.x;
        active.y = event.global.y;
      }
      if (updatePinch()) {
        setCursor('grabbing');
        return;
      }
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      const now = performance.now();
      const elapsed = Math.max(1, now - pointer.lastTime);
      const dx = event.global.x - pointer.lastX;
      const dy = event.global.y - pointer.lastY;
      pointer.elapsedBlend = retainLerp(pointer.elapsedBlend, elapsed, 0.8);
      if (pointer.mode === 'node' && pointer.id) {
        const worldX = (event.global.x * dpr - transform.panX) / transform.scale;
        const worldY = (event.global.y * dpr - transform.panY) / transform.scale;
        engineRef.current?.dragNode(pointer.id, worldX, worldY);
        if (graphViewDragThresholdExceeded(pointer.startX, pointer.startY, event.global.x, event.global.y)) {
          pointer.dragging = true;
        }
      } else {
        const nextPanX = pointer.originPanX + (event.global.x - pointer.startX) * dpr;
        const nextPanY = pointer.originPanY + (event.global.y - pointer.startY) * dpr;
        if (graphViewDragThresholdExceeded(pointer.startX, pointer.startY, event.global.x, event.global.y)) {
          pointer.dragging = true;
        }
        panVelocity.x = retainLerp(panVelocity.x, nextPanX - transform.panX, 0.8);
        panVelocity.y = retainLerp(panVelocity.y, nextPanY - transform.panY, 0.8);
        setTransform(nextPanX, nextPanY, transform.scale);
      }
      pointer.lastX = event.global.x;
      pointer.lastY = event.global.y;
      pointer.lastTime = now;
      markDirty();
      void dx;
      void dy;
    };

    const handleStageUp = (
      event: {
        pointerId: number;
        pointerType: string;
      },
      cancelled = false
    ) => {
      try {
        if (interactionCanvas?.hasPointerCapture(event.pointerId)) {
          interactionCanvas.releasePointerCapture(event.pointerId);
        }
      } catch {
        // The pointer may already have been cancelled by the browser.
      }
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) pinchRef.current = null;
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) {
        if (activePointers.size === 0) setBodyGrabbing(false);
        if (activePointers.size === 0) setCursor(hoveredIdRef.current ? 'pointer' : 'default');
        return;
      }
      if (pointer.mode === 'node' && pointer.id) {
        engineRef.current?.releaseNode(pointer.id);
        if (
          shouldSelectGraphViewNode({
            pointerType: pointer.pointerType,
            button: pointer.button,
            modifier: pointer.modifier,
            dragging: pointer.dragging,
            cancelled,
          })
        ) {
          onSelectRef.current(pointer.id);
        }
      } else if (pointer.mode === 'pan' && !cancelled) {
        if (!pointer.dragging) onSelectRef.current(null);
        // The original renderer measures the interval since the last move,
        // not the complete pointer lifetime. Using startedAt makes a quick
        // drag produce an oversized inertial velocity and a long press reset
        // the gesture at the wrong time.
        const elapsed = performance.now() - pointer.lastTime;
        pointer.elapsedBlend = retainLerp(pointer.elapsedBlend, Math.max(1, elapsed), 0.8);
        if (elapsed > 100) {
          panVelocity.x = 0;
          panVelocity.y = 0;
        } else {
          const divisor = Math.max(1, pointer.elapsedBlend);
          panVelocity.x /= divisor;
          panVelocity.y /= divisor;
        }
      }
      pointerRef.current = null;
      if (activePointers.size === 0) setBodyGrabbing(false);
      setCursor(hoveredIdRef.current ? 'pointer' : 'default');
      markDirty();
      void event;
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      stopCameraTransition();
      const point = logicalPointFromDomEvent(event);
      const result = graphViewWheelZoom(
        transform,
        {
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          offsetX: point.x,
          offsetY: point.y,
          devicePixelRatio: dpr,
        },
        target.scale
      );
      target.scale = result.targetScale;
      zoomCenter.x = result.zoomCenter.x;
      zoomCenter.y = result.zoomCenter.y;
      markDirty();
    };

    const handleMouseMove = (event: MouseEvent) => {
      const point = logicalPointFromDomEvent(event);
      mousePosition.x = point.x;
      mousePosition.y = point.y;
      markDirty();
    };

    const handleMouseDown = (event: MouseEvent) => {
      // Match the original canvas surface: browser-native text/image drag
      // must not compete with the retained Pixi gesture state machine.
      event.preventDefault();
    };

    const handleMouseOut = () => {
      mousePosition.x = null;
      mousePosition.y = null;
    };

    const handleDomPointerMove = (event: PointerEvent) => {
      const point = logicalPointFromDomEvent(event);
      handleStageMove({
        pointerId: event.pointerId,
        global: point,
      });
    };

    const handleDomPointerUp = (event: PointerEvent) => {
      handleStageUp({ pointerId: event.pointerId, pointerType: event.pointerType });
    };

    const handleDomPointerCancel = (event: PointerEvent) => {
      handleStageUp({ pointerId: event.pointerId, pointerType: event.pointerType }, true);
    };

    const keyboardActions = {
      shift: false,
      up: false,
      down: false,
      left: false,
      right: false,
      zoomin: false,
      zoomout: false,
    };
    const handleKeyboard = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTextEntry =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        activeElement?.getAttribute('contenteditable') === 'true';
      if (event.type === 'keydown' && event.key === 'Escape' && !isTextEntry) {
        event.preventDefault();
        onSelectRef.current(null);
        markDirty();
        return;
      }
      const actions: Record<number, keyof typeof keyboardActions> = {
        38: 'up',
        40: 'down',
        37: 'left',
        39: 'right',
        187: 'zoomin',
        189: 'zoomout',
      };
      keyboardActions.shift = event.shiftKey;
      if (
        event.type === 'keydown' &&
        (event.repeat || event.defaultPrevented || document.activeElement !== document.body)
      ) {
        return;
      }
      const action = actions[event.which || event.keyCode];
      if (!action) return;
      keyboardActions[action] = event.type === 'keydown';
      markDirty();
    };

    const renderFrame = (now: number) => {
      animationFrame = null;
      if (disposed || !app) return;
      reduceMotion = reducedMotionRef.current || prefersReducedMotion;
      resize();

      if (!pointerRef.current) {
        transform.panX += (panVelocity.x * 1000) / 60;
        transform.panY += (panVelocity.y * 1000) / 60;
        const keyX = (keyboardActions.left ? 1 : 0) - (keyboardActions.right ? 1 : 0);
        const keyY = (keyboardActions.up ? 1 : 0) - (keyboardActions.down ? 1 : 0);
        const keyMultiplier = keyboardActions.shift ? 3 : 1;
        panVelocity.x = retainLerp(panVelocity.x, keyX * keyMultiplier, 0.9);
        panVelocity.y = retainLerp(panVelocity.y, keyY * keyMultiplier, 0.9);
        const zoomStep = 1 + (keyboardActions.shift ? 0.1 : 0.03);
        if (keyboardActions.zoomin) target.scale *= zoomStep;
        if (keyboardActions.zoomout) target.scale /= zoomStep;
        if (keyX !== 0 || keyY !== 0 || keyboardActions.zoomin || keyboardActions.zoomout) {
          zoomCenter.x = viewport.width / 2;
          zoomCenter.y = viewport.height / 2;
        }
      }

      if (cameraTransition) {
        const progress = clamp((now - cameraTransition.startedAt) / cameraTransition.duration, 0, 1);
        const eased = 1 - (1 - progress) ** 3;
        setTransform(
          lerp(cameraTransition.from.panX, cameraTransition.to.panX, eased),
          lerp(cameraTransition.from.panY, cameraTransition.to.panY, eased),
          lerp(cameraTransition.from.scale, cameraTransition.to.scale, eased)
        );
        if (progress >= 1) cameraTransition = null;
      }
      updateZoom();
      if (!cameraTransition) setTransform(transform.panX, transform.panY, transform.scale);
      notifyCamera(now);

      const currentEngine = engineRef.current;
      const graph = currentEngine?.getGraphData() ?? { nodes: [], links: [] };
      const revision = currentEngine?.getRevision?.() ?? 0;
      const graphChanged = currentEngine !== lastGraphEngine || graph.nodes !== lastNodes || graph.links !== lastLinks;
      if (graphChanged) {
        lastGraphEngine = currentEngine;
        lastNodes = graph.nodes;
        lastLinks = graph.links;
        lastRevision = revision;
        reconcileGraph(graph);
      } else if (revision !== lastRevision) {
        lastRevision = revision;
      }
      const focusId = getFocusId();
      if (focusId !== lastFocusId || selectedRef.current !== lastSelectedId) {
        lastFocusId = focusId;
        lastSelectedId = selectedRef.current;
        idleFrames = 0;
      }
      const view = worldViewport(transform.panX, transform.panY, transform.scale, viewport);
      const center = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
      const added = ensureRenderedDisplays(center);
      const nodeScale = Math.sqrt(1 / transform.scale);
      const nodeAnimating = renderNodes(view, focusId, now);
      const linkAnimating = renderLinks(view, focusId, now);
      app.render();
      if (hoveredIdRef.current && mousePosition.x !== null && mousePosition.y !== null) {
        const hovered = nodeRecords.get(hoveredIdRef.current);
        if (hovered) {
          const mouseWorldX = (mousePosition.x * dpr - transform.panX) / transform.scale;
          const mouseWorldY = (mousePosition.y * dpr - transform.panY) / transform.scale;
          const distance = Math.hypot(hovered.x - mouseWorldX, hovered.y - mouseWorldY);
          if (distance > (nodeDisplays.get(hovered.id)?.radius ?? 8) * nodeScale + 2) {
            setHovered(null);
            setCursor('default');
          }
        }
      }
      idleFrames += 1;

      const cameraMoving = cameraTransition !== null || Math.abs(transform.scale - target.scale) > 0.0001;
      const moving = Math.hypot(panVelocity.x, panVelocity.y) >= 0.001;
      const keysActive =
        keyboardActions.up ||
        keyboardActions.down ||
        keyboardActions.left ||
        keyboardActions.right ||
        keyboardActions.zoomin ||
        keyboardActions.zoomout;
      const pending = nodeDisplays.size < nodeRecords.size || linkDisplays.size < linkRecords.size;
      if (
        cameraMoving ||
        moving ||
        keysActive ||
        nodeAnimating ||
        linkAnimating ||
        added ||
        pending ||
        idleFrames <= 60
      ) {
        scheduleRender();
      }
    };

    const init = async () => {
      const nextApp = new Application();
      await nextApp.init({
        antialias: true,
        autoStart: false,
        backgroundAlpha: 0,
        resolution: 1,
      });
      if (disposed) {
        nextApp.destroy(true);
        return;
      }
      app = nextApp;
      app.canvas.className = styles.pixiCanvas ?? 'pixiCanvas';
      app.canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(app.canvas);
      interactionCanvas = document.createElement('canvas');
      interactionCanvas.className = styles.pixiInteraction ?? 'pixiInteraction';
      interactionCanvas.setAttribute('aria-hidden', 'true');
      app.renderer.events.setTargetElement(interactionCanvas);
      host.appendChild(interactionCanvas);
      interactionCanvas.addEventListener('wheel', handleWheel, { passive: false });
      interactionCanvas.addEventListener('mousedown', handleMouseDown);
      interactionCanvas.addEventListener('mousemove', handleMouseMove, { passive: true });
      interactionCanvas.addEventListener('mouseout', handleMouseOut, { passive: true });
      interactionCanvas.addEventListener('pointermove', handleDomPointerMove);
      interactionCanvas.addEventListener('pointerup', handleDomPointerUp);
      interactionCanvas.addEventListener('pointercancel', handleDomPointerCancel);
      window.addEventListener('keydown', handleKeyboard);
      window.addEventListener('keyup', handleKeyboard);

      app.stage.eventMode = 'static';
      panLayer.eventMode = 'static';
      panLayer.cursor = 'default';
      panLayer.on('pointerdown', (event) => {
        startPan(event);
      });
      world.addChild(linkLayer, nodeLayer, labelLayer);
      app.stage.addChild(panLayer, world);
      resize();
      setCursor('default');
      invalidateRef.current = invalidate;
      onReadyRef.current?.({
        fitGraph,
        focusNode,
        focusNodes,
        scaleBy,
        translateBy,
        invalidate,
        getTransparentScreenshot: () => {
          if (!app) return null;
          app.render();
          return app.canvas;
        },
        getBackgroundScreenshot: () => {
          if (!app) return null;
          app.render();
          const screenshot = document.createElement('canvas');
          screenshot.width = app.canvas.width;
          screenshot.height = app.canvas.height;
          const context = screenshot.getContext('2d');
          if (!context) return null;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, screenshot.width, screenshot.height);
          context.drawImage(app.canvas, 0, 0);
          return screenshot;
        },
      });
      invalidate();
    };

    void init();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      themeObserver.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      setBodyGrabbing(false);
      invalidateRef.current = null;
      window.removeEventListener('keydown', handleKeyboard);
      window.removeEventListener('keyup', handleKeyboard);
      interactionCanvas?.removeEventListener('wheel', handleWheel);
      interactionCanvas?.removeEventListener('mousedown', handleMouseDown);
      interactionCanvas?.removeEventListener('mousemove', handleMouseMove);
      interactionCanvas?.removeEventListener('mouseout', handleMouseOut);
      interactionCanvas?.removeEventListener('pointermove', handleDomPointerMove);
      interactionCanvas?.removeEventListener('pointerup', handleDomPointerUp);
      interactionCanvas?.removeEventListener('pointercancel', handleDomPointerCancel);
      if (app) {
        app.destroy(true);
        app = null;
      }
      interactionCanvas?.remove();
      interactionCanvas = null;
      nodeDisplays.clear();
      linkDisplays.clear();
      onReadyRef.current?.(null);
    };
  }, []);

  return <div ref={hostRef} className={styles.pixiViewport} role="img" aria-label="Force-directed graph" />;
}
