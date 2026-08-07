/**
 * The primary Graph View worker does not use d3-quadtree. The recovered WASM
 * builds a fixed power-of-two grid, aggregates it into a regular hierarchy,
 * and traverses that hierarchy in a stable child order. Keeping that data
 * structure explicit is important for dense graphs: an adaptive quadtree can
 * produce the same broad shape while changing pair order enough to drift.
 */

export type PackedSpatialRecord = {
  sumX: number;
  sumY: number;
  count: number;
  head: number;
};

type PackedSpatialLevel = {
  size: number;
  records: PackedSpatialRecord[];
};

export type PackedSpatialTree = {
  baseSize: number;
  levels: PackedSpatialLevel[];
  next: Int32Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  span: number;
};

function stored(value: number, float32Storage: boolean): number {
  return float32Storage ? Math.fround(value) : value;
}

function addStored(left: number, right: number, float32Storage: boolean): number {
  return stored(left + right, float32Storage);
}

function emptyRecord(): PackedSpatialRecord {
  return { sumX: 0, sumY: 0, count: 0, head: -1 };
}

function baseGridSize(nodeCount: number): number {
  let size = 1;
  while ((size * 2) ** 2 < nodeCount) size *= 2;
  return size;
}

/** Build the same current-position tree used by the recovered WASM kernel. */
export function buildPackedSpatialTree(
  positionsX: readonly number[],
  positionsY: readonly number[],
  float32Storage: boolean
): PackedSpatialTree | null {
  if (positionsX.length === 0 || positionsX.length !== positionsY.length) return null;

  const count = positionsX.length;
  const baseSize = baseGridSize(count);
  const safeX = positionsX.map((value) => stored(Number.isFinite(value) ? value : 0, float32Storage));
  const safeY = positionsY.map((value) => stored(Number.isFinite(value) ? value : 0, float32Storage));

  let minX = safeX[0] as number;
  let minY = safeY[0] as number;
  let maxX = minX;
  let maxY = minY;
  for (let index = 1; index < count; index += 1) {
    const x = safeX[index] as number;
    const y = safeY[index] as number;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  minX = stored(minX, float32Storage);
  minY = stored(minY, float32Storage);
  maxX = stored(maxX, float32Storage);
  maxY = stored(maxY, float32Storage);

  const width = stored(maxX - minX, float32Storage);
  const height = stored(maxY - minY, float32Storage);
  const cellWidth = width === 0 ? 1 : stored(width / baseSize, float32Storage);
  const cellHeight = height === 0 ? 1 : stored(height / baseSize, float32Storage);
  const baseRecords = Array.from({ length: baseSize * baseSize }, emptyRecord);
  const next = new Int32Array(count);
  next.fill(-1);

  for (let index = 0; index < count; index += 1) {
    let cellX = Math.trunc(
      Math.floor(stored(stored((safeX[index] as number) - minX, float32Storage) / cellWidth, float32Storage))
    );
    let cellY = Math.trunc(
      Math.floor(stored(stored((safeY[index] as number) - minY, float32Storage) / cellHeight, float32Storage))
    );
    // The reference clamps the upper edge. The lower edge is already safe
    // because the minimum is taken from the same f32 coordinate stream.
    cellX = Math.min(baseSize - 1, cellX);
    cellY = Math.min(baseSize - 1, cellY);
    const record = baseRecords[cellX * baseSize + cellY] as PackedSpatialRecord;
    next[index] = record.head;
    record.head = index;
    record.sumX = addStored(record.sumX, safeX[index] as number, float32Storage);
    record.sumY = addStored(record.sumY, safeY[index] as number, float32Storage);
    record.count += 1;
  }

  const levels: PackedSpatialLevel[] = [{ size: baseSize, records: baseRecords }];
  for (let currentSize = baseSize; currentSize >= 2; currentSize >>= 1) {
    const parentSize = currentSize >> 1;
    const children = levels[levels.length - 1] as PackedSpatialLevel;
    const parentRecords = Array.from({ length: parentSize * parentSize }, emptyRecord);
    for (let cellX = 0; cellX < parentSize; cellX += 1) {
      for (let cellY = 0; cellY < parentSize; cellY += 1) {
        const parent = parentRecords[cellX * parentSize + cellY] as PackedSpatialRecord;
        // This is the WAT aggregation order: (x+1,y), (x,y),
        // (x,y+1), (x+1,y+1). The order matters when every sum is stored f32.
        const childCoordinates = [
          [1, 0],
          [0, 0],
          [0, 1],
          [1, 1],
        ] as const;
        for (const [offsetX, offsetY] of childCoordinates) {
          const child = children.records[
            (2 * cellX + offsetX) * currentSize + (2 * cellY + offsetY)
          ] as PackedSpatialRecord;
          parent.sumX = addStored(parent.sumX, child.sumX, float32Storage);
          parent.sumY = addStored(parent.sumY, child.sumY, float32Storage);
          parent.count += child.count;
        }
      }
    }
    levels.push({ size: parentSize, records: parentRecords });
  }

  return {
    baseSize,
    levels,
    next,
    minX,
    minY,
    maxX,
    maxY,
    span: Math.max(width, height),
  };
}

export function packedRecordAt(
  tree: PackedSpatialTree,
  levelIndex: number,
  cellX: number,
  cellY: number
): PackedSpatialRecord | undefined {
  const level = tree.levels[levelIndex];
  if (!level || cellX < 0 || cellY < 0 || cellX >= level.size || cellY >= level.size) {
    return undefined;
  }
  return level.records[cellX * level.size + cellY];
}
