/**
 * The layout and call boundary recovered from the graph physics module.
 *
 * This is intentionally only an ABI description. It does not embed or load
 * the reference application's private binary. A future kernel can implement
 * this contract in TypeScript, WebAssembly, or another worker-safe backend.
 */

export const GRAPH_VIEW_WASM_NODE_FLOAT_STRIDE = 5;
export const GRAPH_VIEW_WASM_LINK_INT_STRIDE = 3;
const GRAPH_VIEW_WASM_SCRATCH_BYTES = 1024;
export const GRAPH_VIEW_WASM_SIMULATION_DAMPING = 0.9;
export const GRAPH_VIEW_WASM_COMPLETION_VELOCITY_DECAY = 0.6;
// These are fixed arguments passed by the recovered worker's WASM branch.
// They are not exposed as public Graph View controls.
export const GRAPH_VIEW_WASM_THETA = 0.9;
export const GRAPH_VIEW_WASM_COLLISION_RADIUS = 60;
export const GRAPH_VIEW_WASM_COLLISION_STRENGTH = 0.5;

export type GraphViewWasmNodeField = 'x' | 'y' | 'vx' | 'vy' | 'reserved';

type GraphViewWasmExportSignature = {
  readonly parameters: readonly ('i32' | 'f32')[];
  readonly result: null;
};

export type GraphViewWasmKernelContract = {
  readonly exports: Readonly<{
    readonly memory: 'memory';
    readonly memset: GraphViewWasmExportSignature;
    readonly init: GraphViewWasmExportSignature;
    readonly complete: GraphViewWasmExportSignature;
    readonly visitCharge: GraphViewWasmExportSignature;
    readonly visitCollide: GraphViewWasmExportSignature;
    readonly manyBody: GraphViewWasmExportSignature;
    readonly simulate: GraphViewWasmExportSignature;
  }>;
};

export const GRAPH_VIEW_WASM_KERNEL_CONTRACT: GraphViewWasmKernelContract = {
  exports: {
    memory: 'memory',
    memset: { parameters: ['i32', 'i32', 'i32'], result: null },
    init: { parameters: ['i32', 'i32', 'i32'], result: null },
    complete: { parameters: ['i32', 'i32', 'f32'], result: null },
    visitCharge: {
      parameters: ['i32', 'i32', 'i32', 'i32', 'i32', 'i32', 'f32'],
      result: null,
    },
    visitCollide: {
      parameters: ['i32', 'i32', 'i32', 'i32', 'f32', 'f32', 'i32', 'i32', 'f32', 'f32', 'f32', 'f32'],
      result: null,
    },
    manyBody: {
      parameters: ['i32', 'i32', 'i32', 'f32', 'f32', 'f32'],
      result: null,
    },
    simulate: {
      parameters: ['i32', 'i32', 'i32', 'f32', 'f32', 'f32', 'f32', 'f32', 'f32', 'f32'],
      result: null,
    },
  },
};

export function graphViewWasmNodeFloatOffset(nodeIndex: number, field: GraphViewWasmNodeField): number {
  const safeIndex = Math.max(0, Math.floor(nodeIndex));
  const fieldIndex: Record<GraphViewWasmNodeField, number> = {
    x: 0,
    y: 1,
    vx: 2,
    vy: 3,
    reserved: 4,
  };
  return safeIndex * GRAPH_VIEW_WASM_NODE_FLOAT_STRIDE + fieldIndex[field];
}

export function graphViewWasmLinkIntOffset(nodeCount: number, linkIndex: number, field = 0): number {
  const safeNodeCount = Math.max(0, Math.floor(nodeCount));
  const safeLinkIndex = Math.max(0, Math.floor(linkIndex));
  const safeField = Math.max(0, Math.min(GRAPH_VIEW_WASM_LINK_INT_STRIDE - 1, Math.floor(field)));
  return (
    safeNodeCount * GRAPH_VIEW_WASM_NODE_FLOAT_STRIDE + safeLinkIndex * GRAPH_VIEW_WASM_LINK_INT_STRIDE + safeField
  );
}

export function graphViewWasmBufferBytes(nodeCount: number, linkCount: number): number {
  const safeNodeCount = Math.max(0, Math.floor(nodeCount));
  const safeLinkCount = Math.max(0, Math.floor(linkCount));
  return (
    13 * safeNodeCount * Float32Array.BYTES_PER_ELEMENT +
    3 * safeLinkCount * Int32Array.BYTES_PER_ELEMENT +
    GRAPH_VIEW_WASM_SCRATCH_BYTES
  );
}

export type GraphViewWasmSimulationArguments = {
  readonly nodeCount: number;
  readonly linkCount: number;
  readonly alpha: number;
  readonly centerStrength: number;
  readonly linkStrength: number;
  readonly linkDistance: number;
  readonly repelStrength: number;
  readonly simulationDamping: number;
  readonly completionDamping: number;
};

export function graphViewWasmSimulationArguments(
  nodeCount: number,
  linkCount: number,
  alpha: number,
  centerStrength: number,
  linkStrength: number,
  linkDistance: number,
  repelStrength: number
): GraphViewWasmSimulationArguments {
  return {
    nodeCount: Math.max(0, Math.floor(nodeCount)),
    linkCount: Math.max(0, Math.floor(linkCount)),
    alpha,
    centerStrength,
    linkStrength,
    linkDistance,
    repelStrength,
    simulationDamping: GRAPH_VIEW_WASM_SIMULATION_DAMPING,
    completionDamping: GRAPH_VIEW_WASM_COMPLETION_VELOCITY_DECAY,
  };
}
