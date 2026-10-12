import type { Direction } from '../game/types';

const MIN_SWIPE_DISTANCE = 24;

type SwipeOptions = {
  element: HTMLElement | Window;
  onDirection: (direction: Direction) => void;
  minDistance?: number;
};

/** Converts each completed swipe into one direction request and returns a detach function. */
export const attachSwipeInput = ({
  element,
  onDirection,
  minDistance = MIN_SWIPE_DISTANCE,
}: SwipeOptions): (() => void) => {
  let startX = 0;
  let startY = 0;
  let isTrackingTouch = false;

  const handleTouchStart = (event: TouchEvent): void => {
    const touch = event.changedTouches[0] ?? event.touches[0];

    if (!touch) {
      return;
    }

    startX = touch.clientX;
    startY = touch.clientY;
    isTrackingTouch = true;
  };

  const handleTouchEnd = (event: TouchEvent): void => {
    if (!isTrackingTouch) {
      return;
    }

    isTrackingTouch = false;
    const touch = event.changedTouches[0];

    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    // Ignore taps and tiny hand movement so touching the screen doesn't turn Pac-Man accidentally.
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < minDistance) {
      return;
    }

    onDirection(getSwipeDirection({ deltaX, deltaY }));
  };

  const handleTouchCancel = (): void => {
    isTrackingTouch = false;
  };

  element.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
  element.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true });
  element.addEventListener('touchcancel', handleTouchCancel as EventListener, { passive: true });

  return () => {
    element.removeEventListener('touchstart', handleTouchStart as EventListener);
    element.removeEventListener('touchend', handleTouchEnd as EventListener);
    element.removeEventListener('touchcancel', handleTouchCancel as EventListener);
  };
};

const getSwipeDirection = ({ deltaX, deltaY }: { deltaX: number; deltaY: number }): Direction => {
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? 'right' : 'left';
  }

  return deltaY > 0 ? 'down' : 'up';
};
