import { z } from 'zod';

const MIN_GRID_HEIGHT = 3;
const MIN_GRID_WIDTH = 3;
const TILE_SCHEMA = z.enum(['#', '.', 'o', ' ']);

// Keep rendering validation at the UI boundary separate from validation of maze source strings.
const GRID_SCHEMA = z
  .array(z.array(TILE_SCHEMA))
  .min(MIN_GRID_HEIGHT, `Game grid must contain at least ${MIN_GRID_HEIGHT} rows.`)
  .superRefine((grid, context) => {
    const rowWidth = grid[0]?.length;

    if (rowWidth === undefined || rowWidth < MIN_GRID_WIDTH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Game grid must be at least ${MIN_GRID_WIDTH} tiles wide.`,
      });
      return;
    }

    grid.forEach((row, rowIndex) => {
      if (row.length !== rowWidth) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [rowIndex],
          message: 'Every game-grid row must have the same width.',
        });
      }
    });
  });

const POSITION_SCHEMA = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  })
  .strict();

/** Guards the HUD against invalid positions, wall collisions, and malformed score/lives values. */
export const GAME_STATE_SCHEMA = z
  .object({
    grid: GRID_SCHEMA,
    playerPosition: POSITION_SCHEMA,
    ghostPosition: POSITION_SCHEMA,
    score: z.number().int().nonnegative(),
    lives: z.number().int().nonnegative(),
    isGameOver: z.boolean(),
  })
  .strict()
  .superRefine((state, context) => {
    const characters = [
      { name: 'playerPosition', position: state.playerPosition },
      { name: 'ghostPosition', position: state.ghostPosition },
    ];

    characters.forEach(({ name, position }) => {
      const row = state.grid[position.y];
      const tile = row?.[position.x];

      if (!row || tile === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} must be inside the game grid.`,
        });
        return;
      }

      if (tile === '#') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [name],
          message: `${name} cannot be on a wall.`,
        });
      }
    });
  });
