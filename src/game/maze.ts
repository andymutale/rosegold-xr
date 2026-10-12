import { z } from 'zod';
import type { GridPosition, MazeSymbol, Tile } from './types';

const MIN_MAZE_HEIGHT = 3;
const MIN_MAZE_WIDTH = 3;
const MAZE_ROW_PATTERN = /^[#.o PG]+$/;

export interface MazeLayout {
  grid: Tile[][];
  playerStart: GridPosition;
  ghostStart: GridPosition;
}

// Validate the text representation before converting it to a mutable tile grid.
export const MAZE_ROWS_SCHEMA = z
  .array(
    z
      .string()
      .min(MIN_MAZE_WIDTH, `Maze rows must be at least ${MIN_MAZE_WIDTH} tiles wide.`)
      .regex(MAZE_ROW_PATTERN, 'Maze contains an unsupported tile.'),
  )
  .min(MIN_MAZE_HEIGHT, `Maze must contain at least ${MIN_MAZE_HEIGHT} rows.`)
  .superRefine((rows, context) => {
    const rowWidth = rows[0]?.length;

    if (rowWidth === undefined) {
      return;
    }

    rows.forEach((row, rowIndex) => {
      if (row.length !== rowWidth) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [rowIndex],
          message: 'Every maze row must have the same width.',
        });
      }
    });

    const allTiles = rows.join('');
    const playerStartCount = [...allTiles].filter((tile) => tile === 'P').length;
    const ghostStartCount = [...allTiles].filter((tile) => tile === 'G').length;

    if (playerStartCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['P'],
        message: 'Maze must contain exactly one player start (P).',
      });
    }

    if (ghostStartCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['G'],
        message: 'Maze must contain exactly one ghost start (G).',
      });
    }
  });

/** Converts P/G markers into ordinary walkable tiles and records their start cells. */
export const parseMaze = (rows: string[]): MazeLayout => {
  const checkedRows = MAZE_ROWS_SCHEMA.parse(rows);
  const grid = checkedRows.map((row) =>
    [...row].map((symbol): Tile => {
      const tile = symbol as MazeSymbol;
      return tile === 'P' || tile === 'G' ? ' ' : tile;
    }),
  );

  return {
    grid,
    playerStart: findStartPosition({ rows: checkedRows, marker: 'P' }),
    ghostStart: findStartPosition({ rows: checkedRows, marker: 'G' }),
  };
};

const findStartPosition = ({
  rows,
  marker,
}: {
  rows: string[];
  marker: 'P' | 'G';
}): GridPosition => {
  const y = rows.findIndex((row) => row.includes(marker));
  return { x: rows[y].indexOf(marker), y };
};

/** Treat out-of-bounds cells as blocked, just like walls. */
export const isWalkable = ({
  grid,
  x,
  y,
}: {
  grid: Tile[][];
  x: number;
  y: number;
}): boolean => {
  const tile = grid[y]?.[x];
  return tile !== undefined && tile !== '#';
};
