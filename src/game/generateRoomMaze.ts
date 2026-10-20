import { createReferenceMaze } from './referenceMaze';

const MIN_GRID_DIMENSION = 7;
const MAX_GRID_DIMENSION = 31;
const ROOM_EDGE_MARGIN = 0.82;
const TARGET_TILE_SIZE_METERS = 0.45;

export interface RoomMazeDimensions {
  width: number;
  height: number;
}

/** Converts a requested dimension to an odd grid size, within the renderer's limits. */
const toOddGridDimension = (dimensionInCells: number): number => {
  const bounded = Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, dimensionInCells));
  const nearestOdd = Math.round((bounded - 1) / 2) * 2 + 1;
  return Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, nearestOdd));
};

/** Choose a grid size with the same general aspect ratio as the detected surface. */
export const getRoomMazeDimensions = ({ roomWidth, roomDepth }: {
  roomWidth: number;
  roomDepth: number;
}): RoomMazeDimensions => {
  const safeWidth = Math.max(0.1, roomWidth);
  const safeDepth = Math.max(0.1, roomDepth);
  const shortSide = Math.min(safeWidth, safeDepth);
  const baseDimension = toOddGridDimension((shortSide * ROOM_EDGE_MARGIN) / TARGET_TILE_SIZE_METERS);
  const width = safeWidth <= safeDepth
    ? baseDimension
    : toOddGridDimension(baseDimension * (safeWidth / safeDepth));
  const height = safeDepth <= safeWidth
    ? baseDimension
    : toOddGridDimension(baseDimension * (safeDepth / safeWidth));
  return { width, height };
};

/**
 * Generate the reference-style wall language at a size suited to the detected area.
 * The pattern stays architectural and connected rather than switching to a random
 * perfect maze when room detection reports a different floor size.
 */
export const generateRoomMaze = ({ roomWidth, roomDepth }: {
  roomWidth: number;
  roomDepth: number;
  random?: () => number;
}): string[] => {
  const { width, height } = getRoomMazeDimensions({ roomWidth, roomDepth });
  return createReferenceMaze(width, height);
};
