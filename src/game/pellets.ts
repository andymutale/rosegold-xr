import type { GridPosition, Tile } from './types';

const NORMAL_PELLET_SCORE = 10;
const POWER_PELLET_SCORE = 50;

/** Removes a pellet from the grid and returns its score; empty cells score zero. */
export const eatPellet = ({ grid, position }: { grid: Tile[][]; position: GridPosition }): number => {
  const row = grid[position.y];
  const tile = row?.[position.x];

  if (!row || tile === undefined) {
    return 0;
  }

  const score = tile === '.' ? NORMAL_PELLET_SCORE : tile === 'o' ? POWER_PELLET_SCORE : 0;

  if (score > 0) {
    row[position.x] = ' ';
  }

  return score;
};

/** Counts remaining normal and power pellets for the HUD and win-state display. */
export const countPellets = (grid: Tile[][]): number =>
  grid.reduce(
    (total, row) => total + row.filter((tile) => tile === '.' || tile === 'o').length,
    0,
  );
