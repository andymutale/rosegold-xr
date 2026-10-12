import type { GridPosition } from './types';

const MIN_GRID_DIMENSION = 7;
const MAX_GRID_DIMENSION = 31;
const ROOM_EDGE_MARGIN = 0.82;
const TARGET_TILE_SIZE_METERS = 0.45;
const LOOP_OPENING_CHANCE = 0.12;
const POWER_PELLET_COUNT = 4;

interface Neighbor {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

const DIRECTIONS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

/** Odd dimensions let the carving algorithm alternate cells and connectors cleanly. */
const toOddGridDimension = (dimensionInCells: number): number => {
  const bounded = Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, dimensionInCells));
  const nearestOdd = Math.round((bounded - 1) / 2) * 2 + 1;
  return Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, nearestOdd));
};

export interface RoomMazeDimensions {
  width: number;
  height: number;
}

/** Chooses an odd maze grid close to the detected floor's aspect ratio. */
export const getRoomMazeDimensions = ({ roomWidth, roomDepth }: {
  roomWidth: number;
  roomDepth: number;
}): RoomMazeDimensions => {
  // Start with a tile count based on the shorter room dimension, then derive
  // the other dimension from the floor's aspect ratio. This avoids a forced
  // 7 × 7 square in a long/narrow room when one dimension hits the minimum.
  const shortSide = Math.min(roomWidth, roomDepth);
  const baseDimension = toOddGridDimension((shortSide * ROOM_EDGE_MARGIN) / TARGET_TILE_SIZE_METERS);
  const width = roomWidth <= roomDepth
    ? baseDimension
    : toOddGridDimension(baseDimension * (roomWidth / roomDepth));
  const height = roomDepth <= roomWidth
    ? baseDimension
    : toOddGridDimension(baseDimension * (roomDepth / roomWidth));

  return { width, height };
};

const shuffle = <T,>(items: T[], random: () => number): T[] => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
};

const getWalkableNeighbors = ({
  grid,
  position,
}: {
  grid: string[][];
  position: GridPosition;
}): GridPosition[] => DIRECTIONS
  .map(({ dx, dy }) => ({ x: position.x + dx, y: position.y + dy }))
  .filter(({ x, y }) => grid[y]?.[x] !== undefined && grid[y][x] !== '#');

/** Breadth-first distances are reused to choose a reachable, distant ghost start. */
const getDistances = ({ grid, start }: { grid: string[][]; start: GridPosition }): Map<string, { position: GridPosition; distance: number }> => {
  const key = ({ x, y }: GridPosition): string => `${x},${y}`;
  const distances = new Map<string, { position: GridPosition; distance: number }>();
  const queue = [{ position: start, distance: 0 }];
  distances.set(key(start), { position: start, distance: 0 });

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const next of getWalkableNeighbors({ grid, position: current.position })) {
      const nextKey = key(next);
      if (distances.has(nextKey)) continue;
      const entry = { position: next, distance: current.distance + 1 };
      distances.set(nextKey, entry);
      queue.push(entry);
    }
  }

  return distances;
};

/**
 * Generates a connected, room-sized maze. The outer border remains closed;
 * every walkable cell is reachable from the player start, and the ghost starts
 * at a farthest reachable cell so the first turn is not an instant collision.
 */
export const generateRoomMaze = ({
  roomWidth,
  roomDepth,
  random = Math.random,
}: {
  roomWidth: number;
  roomDepth: number;
  random?: () => number;
}): string[] => {
  const { width, height } = getRoomMazeDimensions({ roomWidth, roomDepth });
  const grid = Array.from({ length: height }, () => Array<string>(width).fill('#'));
  const start: GridPosition = { x: 1, y: 1 };
  grid[start.y][start.x] = '.';

  // Recursive-backtracker maze carving, implemented with a stack to avoid call-stack limits.
  const stack: GridPosition[] = [{ ...start }];
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const unvisited: Neighbor[] = shuffle([...DIRECTIONS], random)
      .map(({ dx, dy }) => ({ x: current.x + dx * 2, y: current.y + dy * 2, dx, dy }))
      .filter(({ x, y }) => x > 0 && x < width - 1 && y > 0 && y < height - 1 && grid[y][x] === '#');

    const next = unvisited[0];
    if (!next) {
      stack.pop();
      continue;
    }

    grid[current.y + next.dy][current.x + next.dx] = '.';
    grid[next.y][next.x] = '.';
    stack.push({ x: next.x, y: next.y });
  }

  // A few extra openings make the layout feel more like Pac-Man and less like
  // a single-path perfect maze, while preserving the connected corridor graph.
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const isVerticalConnector = x % 2 === 0 && y % 2 === 1;
      const isHorizontalConnector = x % 2 === 1 && y % 2 === 0;
      if (!isVerticalConnector && !isHorizontalConnector) continue;
      if (random() >= LOOP_OPENING_CHANCE) continue;

      const oppositeWalkways = isVerticalConnector
        ? grid[y][x - 1] !== '#' && grid[y][x + 1] !== '#'
        : grid[y - 1][x] !== '#' && grid[y + 1][x] !== '#';
      if (oppositeWalkways) grid[y][x] = '.';
    }
  }

  const distances = [...getDistances({ grid, start }).values()]
    .sort((first, second) => second.distance - first.distance);
  const walkableCells = distances.map(({ position }) => position);
  const ghostStart = walkableCells.find((position) => position.x !== start.x || position.y !== start.y) ?? { x: width - 2, y: height - 2 };

  // Scatter power pellets across the more distant parts of the maze.
  const powerCandidates = walkableCells.filter(
    (position) => (position.x !== start.x || position.y !== start.y) &&
      (position.x !== ghostStart.x || position.y !== ghostStart.y),
  );
  for (let index = 0; index < POWER_PELLET_COUNT && powerCandidates.length > 0; index += 1) {
    const candidateIndex = Math.min(
      powerCandidates.length - 1,
      Math.floor(((index + 1) * powerCandidates.length) / (POWER_PELLET_COUNT + 1)),
    );
    const candidate = powerCandidates.splice(candidateIndex, 1)[0];
    grid[candidate.y][candidate.x] = 'o';
  }

  grid[start.y][start.x] = 'P';
  grid[ghostStart.y][ghostStart.x] = 'G';
  return grid.map((row) => row.join(''));
};
