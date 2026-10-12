import type { GridPosition, GridStep, Tile } from './types';
import { isWalkable } from './maze';

const positionKey = ({ x, y }: GridPosition): string => `${x},${y}`;
const NEIGHBOR_STEPS: GridStep[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

interface SearchStep {
  position: GridPosition;
  firstPosition: GridPosition | null;
}

/** Moves one tile along the shortest walkable route toward the player's current cell. */
export const findNextGhostPosition = ({
  grid,
  ghostPosition,
  playerPosition,
}: {
  grid: Tile[][];
  ghostPosition: GridPosition;
  playerPosition: GridPosition;
}): GridPosition => {
  if (positionKey(ghostPosition) === positionKey(playerPosition)) {
    return { ...ghostPosition };
  }

  // Breadth-first search is appropriate because every grid move has the same cost.
  // Carry the first step through the queue so the ghost only moves one tile this turn.
  const queue: SearchStep[] = [{ position: { ...ghostPosition }, firstPosition: null }];
  const visited = new Set<string>([positionKey(ghostPosition)]);

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const currentStep = queue[queueIndex];

    if (positionKey(currentStep.position) === positionKey(playerPosition)) {
      return { ...(currentStep.firstPosition ?? currentStep.position) };
    }

    NEIGHBOR_STEPS.forEach((step) => {
      const nextPosition = {
        x: currentStep.position.x + step.x,
        y: currentStep.position.y + step.y,
      };
      const nextKey = positionKey(nextPosition);

      if (!isWalkable({ grid, ...nextPosition }) || visited.has(nextKey)) {
        return;
      }

      visited.add(nextKey);
      queue.push({
        position: nextPosition,
        firstPosition: currentStep.firstPosition ?? nextPosition,
      });
    });
  }

  return { ...ghostPosition };
};
