declare module 'd3-force-3d' {
  import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

  export type {
    ForceCenter,
    ForceCollide,
    ForceLink,
    ForceManyBody,
    ForceX,
    ForceY,
    Simulation,
    SimulationLinkDatum,
    SimulationNodeDatum,
  } from 'd3-force';
  export { forceCenter, forceCollide, forceLink, forceManyBody, forceX, forceY } from 'd3-force';

  export function forceSimulation<NodeDatum extends SimulationNodeDatum>(
    nodesData?: NodeDatum[],
    numDimensions?: number
  ): Simulation<NodeDatum, SimulationLinkDatum<NodeDatum>>;
}
