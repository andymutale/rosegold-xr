import type { Direction, GridPosition, GridStep, Tile } from './types';
import { isWalkable } from './maze';

export interface MoveResult {
  position: GridPosition;
  direction: Direction;
}

const DIRECTION_STEPS: Record<Direction, GridStep> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const directionStep = (direction: Direction): GridStep => ({
  ...DIRECTION_STEPS[direction],
});

const tryMove = ({
  grid,
  position,
  direction,
}: {
  grid: Tile[][];
  position: GridPosition;
  direction: Direction;
}): MoveResult | null => {
  const step = directionStep(direction);
  const nextPosition = { x: position.x + step.x, y: position.y + step.y };

  return isWalkable({ grid, ...nextPosition })
    ? { position: nextPosition, direction }
    : null;
};

/** Turns when the requested direction becomes possible; otherwise keeps the current course. */
export const moveCharacter = ({
  grid,
  position,
  wantedDirection,
  currentDirection,
}: {
  grid: Tile[][];
  position: GridPosition;
  wantedDirection: Direction;
  currentDirection: Direction;
}): MoveResult => {
  // Buffer the player's next turn: a blocked wanted direction must not cancel a valid current move.
  const wantedMove = tryMove({ grid, position, direction: wantedDirection });

  if (wantedMove) {
    return wantedMove;
  }

  const currentMove = tryMove({ grid, position, direction: currentDirection });
  return currentMove ?? { position: { ...position }, direction: currentDirection };
};
