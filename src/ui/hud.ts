import type { GameState } from '../game/types';
import { countPellets } from '../game/pellets';
import { GAME_STATE_SCHEMA } from '../validation/schemas';

const STATUS_ID = 'status';
const SCORE_ID = 'hud-score';
const LIVES_ID = 'hud-lives';
const PELLETS_ID = 'hud-pellets';
const MESSAGE_ID = 'hud-message';

let hasWarnedAboutMissingStatus = false;

const setElementText = ({ elementId, text }: { elementId: string; text: string }): void => {
  const element = document.getElementById(elementId);

  if (element) {
    element.textContent = text;
  }
};

/** Updates the live status area without replacing its DOM node or event handlers. */
export const showStatusMessage = (message: string): void => {
  const statusElement = document.getElementById(STATUS_ID);

  if (!statusElement) {
    if (!hasWarnedAboutMissingStatus) {
      console.warn(`Missing DOM element: #${STATUS_ID}`);
      hasWarnedAboutMissingStatus = true;
    }
    return;
  }

  statusElement.textContent = message;
};

/** Validate state at the UI boundary so corrupted game state never becomes misleading HUD text. */
export const showGameState = (state: GameState): void => {
  const result = GAME_STATE_SCHEMA.safeParse(state);

  if (!result.success) {
    console.error('Invalid game state for display:', result.error.issues);
    setElementText({ elementId: MESSAGE_ID, text: 'Unable to display game status.' });
    return;
  }

  const { grid, score, lives, isGameOver } = result.data;
  const pelletsRemaining = countPellets(grid);
  const message = isGameOver
    ? 'Game over. Reset to play again.'
    : pelletsRemaining === 0
      ? 'All pellets collected! Keep moving or reset to play again.'
      : 'Collect pellets and avoid the ghost.';

  setElementText({ elementId: SCORE_ID, text: String(score) });
  setElementText({ elementId: LIVES_ID, text: String(lives) });
  setElementText({ elementId: PELLETS_ID, text: String(pelletsRemaining) });
  setElementText({ elementId: MESSAGE_ID, text: message });
};
