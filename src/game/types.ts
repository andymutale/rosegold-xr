/** The four grid-aligned directions accepted by keyboard, swipe, and game logic. */
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Tile = '#' | '.' | 'o' | ' ';
export type MazeSymbol = Tile | 'P' | 'G';

/** Integer tile coordinates; x is the column and y is the row. */
export interface GridPosition {
  x: number;
  y: number;
}

/** A directional offset, not an absolute board position. */
export interface GridStep {
  x: number;
  y: number;
}

export interface CharacterPositions {
  playerPosition: GridPosition;
  ghostPosition: GridPosition;
}

/** Read-only snapshot shape passed from game rules to rendering and the HUD. */
export interface GameState extends CharacterPositions {
  grid: Tile[][];
  score: number;
  lives: number;
  isGameOver: boolean;
}

/** Small public API that lets UI/input drive the game without knowing its internals. */
export interface GameController {
  requestDirection(direction: Direction): void;
  setMaze(mazeRows: string[]): void;
  step(): void;
  reset(): void;
  getState(): GameState;
}
