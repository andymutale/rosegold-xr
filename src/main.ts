import { Clock, MeshBasicMaterial, Vector3 } from 'three';
import { createGame } from './game/game';
import { createReferenceMaze } from './game/referenceMaze';
import type { Direction, GameState } from './game/types';
import { attachKeyboardInput } from './input/keyboardInput';
import { attachSwipeInput } from './input/swipeInput';
import { createBoardRenderer } from './render/boardRenderer';
import { createCharacterRenderer } from './render/characterRenderer';
import { createPlacementMarker, placeAtSurface } from './render/placementMarker';
import { createScene } from './render/scene';
import { showGameState, showStatusMessage } from './ui/hud';
import { createArSession, type ArPlacement } from './xr/arSession';
import { createRoomUnderstanding } from './xr/roomUnderstanding';

/** Keeps game simulation speed independent from the display refresh rate. */
const GAME_STEP_SECONDS = 0.16;
const MARKER_HEIGHT_OFFSET = 0.012;
const FALLBACK_GRID_DIMENSION = 1;
const DEFAULT_BOARD_SCALE = 1;
const AR_TARGET_BOARD_METERS = 0.95;
const ZAPPAR_TARGET_BOARD_UNITS = 1.9;
const RESET_BUTTON_ID = 'reset-button';

/** A repeatable, photo-inspired tabletop layout for both desktop and AR. */
const MAZE: string[] = createReferenceMaze(25, 25);

const getGridDimensions = ({ grid }: Pick<GameState, 'grid'>): { gridWidth: number; gridHeight: number } => ({
  gridWidth: grid[0]?.length ?? FALLBACK_GRID_DIMENSION,
  gridHeight: grid.length,
});

/** Creates the game once, wires input/rendering/XR together, and owns their cleanup. */
function main(): void {
  try {
    const game = createGame(MAZE);
    const { scene, camera, renderer, positionCameraForBoard, dispose: disposeScene } = createScene();
    const boardRenderer = createBoardRenderer(scene);
    const characterRenderer = createCharacterRenderer(boardRenderer.board);
    const arSession = createArSession({ renderer, scene, camera, onStatus: showStatusMessage });
    const placementMarker = createPlacementMarker();
    scene.add(placementMarker);
    const roomUnderstanding = createRoomUnderstanding(scene);
    const detachKeyboardInput = attachKeyboardInput(game);
    const detachSwipeInput = attachSwipeInput({ element: window, onDirection: game.requestDirection });
    const resetButton = document.getElementById(RESET_BUTTON_ID);
    const directionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-direction]'));
    const directionButtonHandlers = new Map<HTMLButtonElement, () => void>();
    directionButtons.forEach((button) => {
      const direction = button.dataset.direction as Direction | undefined;
      if (!direction) return;
      const handler = (): void => game.requestDirection(direction);
      directionButtonHandlers.set(button, handler);
      button.addEventListener('click', handler);
    });

    const clock = new Clock();
    const startingState = game.getState();
    const gridDimensions = getGridDimensions(startingState);
    const getArBoardScale = (): number => {
      const targetSpan = arSession.getBackend() === 'zappar'
        ? ZAPPAR_TARGET_BOARD_UNITS
        : AR_TARGET_BOARD_METERS;
      return targetSpan / Math.max(gridDimensions.gridWidth, gridDimensions.gridHeight);
    };

    // Keep full redraws in one place so startup and reset stay in sync.
    const drawGame = (state: GameState): void => {
      boardRenderer.drawGrid(state.grid);
      characterRenderer.updatePositions(state);
      showGameState(state);
    };

    drawGame(startingState);
    positionCameraForBoard(gridDimensions);
    showStatusMessage('Use WASD, arrow keys, swipe, or the on-screen pad. Enter AR to place the tabletop maze.');

    let timeSinceLastStep = 0;
    let previousScore = startingState.score;
    let hasBoardBeenPlaced = false;
    let latestSurfacePlacement: ArPlacement | null = null;
    let latestRoomFloor: ReturnType<typeof roomUnderstanding.update>['floor'] = null;
    let previousRoomScanLabel = '';
    let floorWasDetected = false;

    // Places the same compact reference board on a tapped surface; no room-wide stretching.
    const placeBoardOnSurface = (): void => {
      if (!arSession.isPresenting() || hasBoardBeenPlaced) return;

      const boardScale = getArBoardScale();
      if (latestSurfacePlacement) {
        const { position, quaternion } = latestSurfacePlacement;
        // The hit-test ring marks the board centre, while maze coordinates begin at (0, 0).
        const boardOriginOffset = new Vector3(
          -((gridDimensions.gridWidth - 1) * boardScale) / 2,
          MARKER_HEIGHT_OFFSET,
          -((gridDimensions.gridHeight - 1) * boardScale) / 2,
        );
        const boardOrigin = position.clone().add(boardOriginOffset.applyQuaternion(quaternion));
        placeAtSurface({ object: boardRenderer.board, position: boardOrigin, quaternion, scale: boardScale });
        boardRenderer.board.visible = true;
        hasBoardBeenPlaced = true;
        placementMarker.visible = false;
        showStatusMessage(
          arSession.getBackend() === 'zappar'
            ? 'Maze placed. Swipe or use the pad to collect the square pellets.'
            : 'Maze placed at tabletop scale. Swipe or use the pad to collect the square pellets.',
        );
        return;
      }

      // Plane detection remains a fallback on devices that expose room planes but no hit-test pose.
      if (latestRoomFloor) {
        const localOffset = new Vector3(
          latestRoomFloor.centerX - ((gridDimensions.gridWidth - 1) * boardScale) / 2,
          MARKER_HEIGHT_OFFSET,
          latestRoomFloor.centerZ - ((gridDimensions.gridHeight - 1) * boardScale) / 2,
        );
        const position = latestRoomFloor.position.clone().add(
          localOffset.applyQuaternion(latestRoomFloor.quaternion),
        );
        placeAtSurface({
          object: boardRenderer.board,
          position,
          quaternion: latestRoomFloor.quaternion,
          scale: boardScale,
        });
        boardRenderer.board.visible = true;
        hasBoardBeenPlaced = true;
        placementMarker.visible = false;
        showStatusMessage('Maze placed on the detected horizontal surface. Swipe or use the pad to play.');
        return;
      }

      showStatusMessage('Still looking for a flat surface. Move the phone slowly, point at the tabletop, then tap again.');
    };

    const stepGame = (): void => {
      game.step();
      const state = game.getState();
      // Pellet instances change only when score changes; the detailed walls stay in place.
      if (state.score !== previousScore) boardRenderer.drawGrid(state.grid);
      previousScore = state.score;
      characterRenderer.updatePositions(state);
      showGameState(state);
    };

    const resetGame = (): void => {
      game.reset();
      timeSinceLastStep = 0;
      const state = game.getState();
      previousScore = state.score;
      drawGame(state);
      showStatusMessage(
        arSession.isPresenting() && !hasBoardBeenPlaced
          ? 'Point at a flat surface and tap to place the maze.'
          : 'Game reset. Use the pad, swipe, WASD, or arrow keys to play.',
      );
    };

    // Each AR session begins with a fresh scan and requires a new placement tap.
    const handleArSessionStart = (): void => {
      latestSurfacePlacement = null;
      latestRoomFloor = null;
      hasBoardBeenPlaced = false;
      floorWasDetected = false;
      previousRoomScanLabel = '';
      placementMarker.visible = false;
      boardRenderer.board.visible = false;
      roomUnderstanding.clear();
      const roomScanElement = document.getElementById('room-scan');
      if (roomScanElement) roomScanElement.textContent = 'Surface scan: looking for a flat area…';
      showStatusMessage('Move the phone slowly over a tabletop, then tap when the placement ring appears.');
    };

    // The board returns to its known origin in 3D mode after AR ends.
    const handleArSessionEnd = (): void => {
      latestSurfacePlacement = null;
      latestRoomFloor = null;
      hasBoardBeenPlaced = false;
      floorWasDetected = false;
      previousRoomScanLabel = '';
      roomUnderstanding.clear();
      const roomScanElement = document.getElementById('room-scan');
      if (roomScanElement) roomScanElement.textContent = 'Surface scan: inactive until AR starts.';
      game.setMaze(MAZE);
      const defaultState = game.getState();
      previousScore = defaultState.score;
      drawGame(defaultState);
      placementMarker.visible = false;
      boardRenderer.board.visible = true;
      boardRenderer.board.position.set(0, 0, 0);
      boardRenderer.board.quaternion.identity();
      boardRenderer.board.scale.setScalar(DEFAULT_BOARD_SCALE);
      boardRenderer.board.updateMatrix();
      positionCameraForBoard(gridDimensions);
      showStatusMessage('Back in 3D mode. Use the pad, swipe, WASD, or arrow keys to play.');
    };

    resetButton?.addEventListener('click', resetGame);
    const removeArListeners = [
      arSession.addEventListener('sessionstart', handleArSessionStart),
      arSession.addEventListener('sessionend', handleArSessionEnd),
      arSession.addEventListener('select', placeBoardOnSurface),
    ];

    renderer.setAnimationLoop((_timestamp, frame) => {
      const elapsedSeconds = clock.getDelta();
      const isArPresenting = arSession.isPresenting();

      // WebXR supplies an XRFrame; Zappar camera tracking runs without one.
      if (isArPresenting && (frame || arSession.getBackend() !== 'webxr')) {
        arSession.update(frame, elapsedSeconds * 1000);
        const referenceSpace = arSession.getReferenceSpace();
        latestSurfacePlacement = arSession.getSurfacePlacement(frame);
        const roomScan = frame && referenceSpace
          ? roomUnderstanding.update(
              frame,
              referenceSpace,
              arSession.getDetectedPlanes(),
              arSession.getDetectedMeshes(),
            )
          : { floor: null, planeCount: 0, meshCount: 0 };
        latestRoomFloor = roomScan.floor;
        const surfaceSummary = latestSurfacePlacement
          ? 'surface target found · tap to place'
          : latestRoomFloor
            ? `large surface ${latestRoomFloor.width.toFixed(1)} × ${latestRoomFloor.depth.toFixed(1)} m`
            : 'looking for a flat surface';
        const roomScanLabel = arSession.getBackend() === 'zappar'
          ? 'camera tracking · point at a tabletop and tap'
          : `${roomScan.planeCount} planes · ${roomScan.meshCount} meshes · ${surfaceSummary}`;
        if (roomScanLabel !== previousRoomScanLabel) {
          const roomScanElement = document.getElementById('room-scan');
          if (roomScanElement) roomScanElement.textContent = `Surface scan: ${roomScanLabel}`;
          previousRoomScanLabel = roomScanLabel;
        }

        if (latestRoomFloor && !floorWasDetected && !hasBoardBeenPlaced) {
          floorWasDetected = true;
          showStatusMessage(
            `Horizontal area detected (${latestRoomFloor.width.toFixed(1)} × ${latestRoomFloor.depth.toFixed(1)} m). Tap to place the compact board.`,
          );
        }

        placementMarker.visible = latestSurfacePlacement !== null && !hasBoardBeenPlaced;
        if (placementMarker.visible && latestSurfacePlacement) {
          const { position, quaternion, markerScale = 1 } = latestSurfacePlacement;
          placeAtSurface({ object: placementMarker, position, quaternion, scale: markerScale });
          placementMarker.position.y += MARKER_HEIGHT_OFFSET;
        }
      } else {
        latestSurfacePlacement = null;
        latestRoomFloor = null;
        roomUnderstanding.clear();
        const roomScanElement = document.getElementById('room-scan');
        if (roomScanElement) roomScanElement.textContent = 'Surface scan: inactive until AR starts.';
        placementMarker.visible = false;
      }

      // Pause movement until the player locks the board to a surface in AR.
      const isWaitingForBoardPlacement = isArPresenting && !hasBoardBeenPlaced;
      if (!isWaitingForBoardPlacement) {
        timeSinceLastStep += elapsedSeconds;
        if (timeSinceLastStep >= GAME_STEP_SECONDS) {
          timeSinceLastStep = 0;
          stepGame();
        }
      }
      renderer.render(scene, arSession.getRenderCamera() ?? camera);
    });

    // Remove listeners and GPU resources together so page navigation leaves no live callbacks.
    const handlePageHide = (): void => {
      renderer.setAnimationLoop(null);
      removeArListeners.forEach((removeListener) => removeListener());
      resetButton?.removeEventListener('click', resetGame);
      directionButtonHandlers.forEach((handler, button) => button.removeEventListener('click', handler));
      detachKeyboardInput();
      detachSwipeInput();
      arSession.dispose();
      roomUnderstanding.dispose();
      characterRenderer.dispose();
      boardRenderer.dispose();
      placementMarker.geometry.dispose();
      (placementMarker.material as MeshBasicMaterial).dispose();
      disposeScene();
    };
    window.addEventListener('pagehide', handlePageHide, { once: true });
  } catch (error) {
    console.error('Failed to initialize the maze game:', error);
    showStatusMessage('The game could not start. Check the console for details.');
  }
}

main();
