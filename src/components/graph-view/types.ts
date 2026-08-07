type GraphViewNodeId = string;

export type GraphViewNodeInput<TData = unknown> = {
  id: GraphViewNodeId;
  data?: TData;
  /** Stable semantic weight used by the recovered getSize() curve. */
  weight?: number;
  radius?: number;
  x?: number;
  y?: number;
};

export type GraphViewNode<TData = unknown> = GraphViewNodeInput<TData> & {
  weight: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
};

export type GraphViewEdgeInput = {
  id?: string;
  source: GraphViewNodeId;
  target: GraphViewNodeId;
};

export type GraphViewEdge = {
  id: string;
  source: GraphViewNodeId;
  target: GraphViewNodeId;
};

export type GraphViewData<TData = unknown> = {
  nodes: readonly GraphViewNodeInput<TData>[];
  links: readonly GraphViewEdgeInput[];
  /** Optional bundle-compatible semantic weights keyed by stable node id. */
  weights?: Readonly<Record<GraphViewNodeId, number>>;
};

export type GraphViewForceConfig = {
  centerStrength: number;
  repelStrength: number;
  repelDistanceMin: number;
  repelDistanceMax: number;
  theta: number;
  linkStrength: number;
  linkDistance: number;
  collisionRadius: number;
  collisionStrength: number;
  collisionIterations: number;
  velocityDecay: number;
  alphaDecay: number;
  alphaMin: number;
};

export type GraphViewWorkerNode = {
  id: GraphViewNodeId;
  radius?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
};

export type GraphViewWorkerLink = {
  source: GraphViewNodeId;
  target: GraphViewNodeId;
};

export type GraphViewWorkerRequest =
  | {
      type: 'set-graph';
      version: number;
      sequence: number;
      nodes: readonly GraphViewWorkerNode[];
      links: readonly GraphViewWorkerLink[];
      forces: GraphViewForceConfig;
      alpha: number;
      reset?: boolean;
    }
  | {
      type: 'set-forces';
      sequence: number;
      forces: GraphViewForceConfig;
      alpha: number;
    }
  | {
      type: 'drag';
      sequence: number;
      id: GraphViewNodeId;
      x: number;
      y: number;
    }
  | {
      type: 'release';
      sequence: number;
      id: GraphViewNodeId;
    }
  | {
      type: 'reheat';
      sequence: number;
      alpha: number;
    }
  | {
      type: 'stop';
    }
  | {
      type: 'destroy';
    };

export type GraphViewWorkerResponse =
  | {
      type: 'positions';
      version: number;
      sequence: number;
      buffer: ArrayBuffer | SharedArrayBuffer;
      ids: readonly GraphViewNodeId[];
      count: number;
      positionVersion?: number;
      settled?: boolean;
    }
  | {
      type: 'shared-probe';
      shared: SharedArrayBuffer;
    }
  | {
      type: 'error';
      message: string;
    };
