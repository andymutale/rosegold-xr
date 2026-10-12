import type { Direction, GameController, GameState, GridPosition, Tile } from './types';
import { parseMaze } from './maze';
import { moveCharacter } from './movement';
import { eatPellet } from './pellets';
import { findNextGhostPosition } from './ghostMovement';

const STARTING_DIRECTION: Direction = 'right';
const STARTING_LIVES = 3;

const areSamePosition = ({
  firstPosition,
  secondPosition,
}: {
  firstPosition: GridPosition;
  secondPosition: GridPosition;
}): boolean => firstPosition.x === secondPosition.x && firstPosition.y === secondPosition.y;

/** Builds the rules-only game controller; this module deliberately has no DOM or Three.js dependency. */
export const createGame = (mazeRows: string[]): GameController => {
  let startingGrid: Tile[][] = [];
  let playerStart: GridPosition = { x: 1, y: 1 };
  let ghostStart: GridPosition = { x: 1, y: 1 };
  let grid: Tile[][] = [];
  let playerPosition: GridPosition = { x: 1, y: 1 };
  let ghostPosition: GridPosition = { x: 1, y: 1 };
  let score = 0;
  let lives = STARTING_LIVES;
  let isGameOver = false;
  let currentDirection: Direction = STARTING_DIRECTION;
  let wantedDirection: Direction = STARTING_DIRECTION;

  // Copy start coordinates so live movement never mutates the saved spawn positions.
  const resetCharacters = (): void => {
    playerPosition = { ...playerStart };
    ghostPosition = { ...ghostStart };
    currentDirection = STARTING_DIRECTION;
    wantedDirection = STARTING_DIRECTION;
  };

  // setMaze also resets the run: old score/lives and character coordinates belong to the old layout.
  const setMaze = (rows: string[]): void => {
    const layout = parseMaze(rows);
    startingGrid = layout.grid.map((row) => [...row]);
    playerStart = { ...layout.playerStart };
    ghostStart = { ...layout.ghostStart };
    grid = startingGrid.map((row) => [...row]);
    score = 0;
    lives = STARTING_LIVES;
    isGameOver = false;
    resetCharacters();
  };

  const requestDirection = (direction: Direction): void => {
    wantedDirection = direction;
  };

  // One fixed simulation tick moves the player, scores a pellet, then moves the ghost and checks contact.
  const step = (): void => {
    if (isGameOver) {
      return;
    }

    const playerMove = moveCharacter({
      grid,
      position: playerPosition,
      wantedDirection,
      currentDirection,
    });
    playerPosition = playerMove.position;
    currentDirection = playerMove.direction;
    score += eatPellet({ grid, position: playerPosition });
    ghostPosition = findNextGhostPosition({ grid, ghostPosition, playerPosition });

    if (!areSamePosition({ firstPosition: playerPosition, secondPosition: ghostPosition })) {
      return;
    }

    lives = Math.max(0, lives - 1);
    isGameOver = lives === 0;

    if (!isGameOver) {
      resetCharacters();
    }
  };

  const reset = (): void => {
    grid = startingGrid.map((row) => [...row]);
    score = 0;
    lives = STARTING_LIVES;
    isGameOver = false;
    resetCharacters();
  };

  // Return copies so a renderer cannot accidentally mutate the game’s internal grid or positions.
  const getState = (): GameState => ({
    grid: grid.map((row) => [...row]),
    playerPosition: { ...playerPosition },
    ghostPosition: { ...ghostPosition },
    score,
    lives,
    isGameOver,
  });

  setMaze(mazeRows);
  return { requestDirection, setMaze, step, reset, getState };
};
