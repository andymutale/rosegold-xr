import type { Direction, GameController } from '../game/types';

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

/** Attaches keyboard direction requests and returns the matching listener cleanup function. */
export const attachKeyboardInput = (game: GameController): (() => void) => {
  const handleKeyDown = (event: KeyboardEvent): void => {
    const direction = KEY_TO_DIRECTION[event.key] ?? KEY_TO_DIRECTION[event.key.toLowerCase()];

    if (!direction || isTextInput(event.target)) {
      return;
    }

    event.preventDefault();
    game.requestDirection(direction);
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
};

const isTextInput = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
};
