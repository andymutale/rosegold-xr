/**
 * A repeatable, table-top maze inspired by the supplied physical Rosegold XR board.
 *
 * Instead of a conventional recursive-backtracker maze, this layout uses long,
 * staggered wall runs, open rectangular pockets, and deliberate breaks in the
 * barriers. That gives the renderer the chunky, modular wall shapes seen in the
 * reference photo while keeping all playable floor connected.
 */
export type ReferenceMazeSymbol = '#' | '.' | 'o' | 'P' | 'G';

const MIN_DIMENSION = 7;
const MAX_DIMENSION = 31;
const WALK_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

const normalizeDimension = (value: number): number => {
  const safeValue = Number.isFinite(value) ? Math.floor(value) : 25;
  const bounded = Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, safeValue));
  return bounded % 2 === 0 ? bounded - 1 : bounded;
};

const createGrid = (width: number, height: number): string[][] =>
  Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.',
    ),
  );

/** Places one horizontal obstacle row while leaving two-cell corridor openings. */
const addHorizontalRun = (grid: string[][], y: number, bandIndex: number): void => {
  const width = grid[0].length;
  const gapSpan = Math.max(1, width - 6);
  const firstGap = 2 + ((bandIndex * 5 + 1) % gapSpan);
  const secondGap = 2 + ((bandIndex * 7 + Math.floor(width / 2)) % gapSpan);
  const openings = new Set<number>();

  [firstGap, secondGap].forEach((start) => {
    openings.add(start);
    openings.add(Math.min(width - 3, start + 1));
  });

  for (let x = 2; x < width - 2; x += 1) {
    if (!openings.has(x)) grid[y][x] = '#';
  }
};

/** Places one vertical obstacle run with staggered cross-corridor openings. */
const addVerticalRun = (grid: string[][], x: number, bandIndex: number): void => {
  const height = grid.length;
  const gapSpan = Math.max(1, height - 6);
  const firstGap = 2 + ((bandIndex * 7 + 2) % gapSpan);
  const secondGap = 2 + ((bandIndex * 5 + Math.floor(height / 2)) % gapSpan);
  const openings = new Set<number>();

  [firstGap, secondGap].forEach((start) => {
    openings.add(start);
    openings.add(Math.min(height - 3, start + 1));
  });

  for (let y = 2; y < height - 2; y += 1) {
    if (!openings.has(y)) grid[y][x] = '#';
  }
};

/** An open-sided rectangular pocket, like the inset wall runs on the printed board. */
const addPocket = (
  grid: string[][],
  left: number,
  top: number,
  width: number,
  height: number,
  openingSide: 'top' | 'right' | 'bottom' | 'left',
): void => {
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;
  const right = left + width - 1;
  const bottom = top + height - 1;

  if (left < 2 || top < 2 || right > gridWidth - 3 || bottom > gridHeight - 3) return;

  for (let x = left; x <= right; x += 1) {
    grid[top][x] = '#';
    grid[bottom][x] = '#';
  }
  for (let y = top; y <= bottom; y += 1) {
    grid[y][left] = '#';
    grid[y][right] = '#';
  }

  const middleX = left + Math.floor(width / 2);
  const middleY = top + Math.floor(height / 2);
  if (openingSide === 'top') grid[top][middleX] = '.';
  if (openingSide === 'right') grid[middleY][right] = '.';
  if (openingSide === 'bottom') grid[bottom][middleX] = '.';
  if (openingSide === 'left') grid[middleY][left] = '.';
};

const getReachable = (grid: string[][], start: { x: number; y: number }): Set<string> => {
  const queue = [{ ...start }];
  const reachable = new Set<string>([`${start.x},${start.y}`]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    WALK_DIRECTIONS.forEach(({ x, y }) => {
      const next = { x: current.x + x, y: current.y + y };
      const key = `${next.x},${next.y}`;
      if (grid[next.y]?.[next.x] === undefined || grid[next.y][next.x] === '#' || reachable.has(key)) return;
      reachable.add(key);
      queue.push(next);
    });
  }
  return reachable;
};

/** Opens the shortest simple elbow connection to any pocket cut off by overlapping walls. */
const connectEveryOpenCell = (grid: string[][], start: { x: number; y: number }): void => {
  const height = grid.length;
  const width = grid[0].length;
  let reachable = getReachable(grid, start);

  // The board is at most 31 x 31, so this straightforward repair pass is cheap.
  while (true) {
    let target: { x: number; y: number } | null = null;
    for (let y = 1; y < height - 1 && !target; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        if (grid[y][x] !== '#' && !reachable.has(`${x},${y}`)) {
          target = { x, y };
          break;
        }
      }
    }
    if (!target) return;

    let anchor = start;
    let bestDistance = Number.POSITIVE_INFINITY;
    reachable.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      const distance = Math.abs(target!.x - x) + Math.abs(target!.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        anchor = { x, y };
      }
    });

    let x = target.x;
    let y = target.y;
    while (x !== anchor.x) {
      x += Math.sign(anchor.x - x);
      grid[y][x] = '.';
    }
    while (y !== anchor.y) {
      y += Math.sign(anchor.y - y);
      grid[y][x] = '.';
    }
    grid[target.y][target.x] = '.';
    reachable = getReachable(grid, start);
  }
};

/** Build a consistent, playable maze at a requested odd grid size. */
export const createReferenceMaze = (requestedWidth = 25, requestedHeight = 25): string[] => {
  const width = normalizeDimension(requestedWidth);
  const height = normalizeDimension(requestedHeight);
  const grid = createGrid(width, height);

  // Long, slightly irregular barrier runs form the main wall language.
  let horizontalIndex = 0;
  for (let y = 3; y < height - 2; y += 4) {
    addHorizontalRun(grid, y, horizontalIndex);
    horizontalIndex += 1;
  }
  let verticalIndex = 0;
  for (let x = 4; x < width - 2; x += 4) {
    addVerticalRun(grid, x, verticalIndex);
    verticalIndex += 1;
  }

  // Four offset, open-sided wall pockets give the layout the asymmetrical,
  // 3D-printed feel of the reference image instead of a regular square grid.
  if (width >= 17 && height >= 17) {
    const pocketWidth = Math.max(4, Math.min(6, Math.floor(width * 0.22)));
    const pocketHeight = Math.max(3, Math.min(5, Math.floor(height * 0.18)));
    addPocket(grid, 2, 2, pocketWidth, pocketHeight, 'right');
    addPocket(grid, width - pocketWidth - 3, 3, pocketWidth, pocketHeight, 'bottom');
    addPocket(
      grid,
      Math.floor(width * 0.36),
      Math.floor(height * 0.40),
      pocketWidth,
      pocketHeight,
      'left',
    );
    addPocket(
      grid,
      Math.floor(width * 0.62),
      Math.floor(height * 0.64),
      pocketWidth,
      pocketHeight,
      'top',
    );
  }

  const playerStart = { x: 1, y: 1 };
  const ghostStart = { x: width - 2, y: height - 2 };
  grid[playerStart.y][playerStart.x] = '.';
  grid[ghostStart.y][ghostStart.x] = '.';
  connectEveryOpenCell(grid, playerStart);

  // Scatter four power pellets around the board without placing them under walls
  // or on the player/ghost spawn cells.
  const powerTargets = [
    { x: Math.round(width * 0.23), y: Math.round(height * 0.22) },
    { x: Math.round(width * 0.77), y: Math.round(height * 0.24) },
    { x: Math.round(width * 0.22), y: Math.round(height * 0.76) },
    { x: Math.round(width * 0.76), y: Math.round(height * 0.76) },
  ];
  const chosenPowerPellets = new Set<string>();
  powerTargets.forEach((target) => {
    const candidates: Array<{ x: number; y: number; distance: number }> = [];
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const key = `${x},${y}`;
        if (
          grid[y][x] === '#' ||
          (x === playerStart.x && y === playerStart.y) ||
          (x === ghostStart.x && y === ghostStart.y) ||
          chosenPowerPellets.has(key)
        ) continue;
        candidates.push({ x, y, distance: Math.abs(target.x - x) + Math.abs(target.y - y) });
      }
    }
    candidates.sort((first, second) => first.distance - second.distance);
    const chosen = candidates[0];
    if (chosen) {
      const key = `${chosen.x},${chosen.y}`;
      chosenPowerPellets.add(key);
      grid[chosen.y][chosen.x] = 'o';
    }
  });

  grid[playerStart.y][playerStart.x] = 'P';
  grid[ghostStart.y][ghostStart.x] = 'G';
  return grid.map((row) => row.join(''));
};
