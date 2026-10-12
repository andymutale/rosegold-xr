import { Clock, MeshBasicMaterial } from 'three';

import { createGame } from './game/game';
import { generateRoomMaze } from './game/generateRoomMaze';
import type { GameState } from './game/types';
import { attachKeyboardInput } from './input/keyboardInput';
import { attachSwipeInput } from './input/swipeInput';
import { createBoardRenderer } from './render/boardRenderer';
import { createCharacterRenderer } from './render/characterRenderer';
import { createPlacementMarker, placeAtSurface } from './render/placementMarker';
import { createScene } from './render/scene';
import { showGameState, showStatusMessage } from './ui/hud';
import { createArSession } from './xr/arSession';
import { getSurfaceHit, getSurfacePlacement } from './xr/hitTest';
import { createRoomUnderstanding, fitBoardToRoomFloor } from './xr/roomUnderstanding';

/** Keeps game simulation speed independent from the display refresh rate. */
const GAME_STEP_SECONDS = 0.16;
const MARKER_HEIGHT_OFFSET = 0.01;
const FALLBACK_GRID_DIMENSION = 1;
const DEFAULT_BOARD_SCALE = 1;
const FALLBACK_AR_BOARD_SCALE = 0.25;
const RESET_BUTTON_ID = 'reset-button';

/** Small, deterministic layout used before AR placement and outside AR mode. */
const MAZE: string[] = [
  '#########',
  '#P..#...#',
  '#.##.##.#',
  '#..G....#',
  '#########',
];

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
    const clock = new Clock();
    const startingState = game.getState();
    let gridDimensions = getGridDimensions(startingState);

    // Keep full redraws in one place so startup, reset, and maze replacement stay in sync.
    const drawGame = (state: GameState): void => {
      boardRenderer.drawGrid(state.grid);
      characterRenderer.updatePositions(state);
      showGameState(state);
    };

    drawGame(startingState);
    positionCameraForBoard(gridDimensions);
    showStatusMessage('Use arrow keys, WASD, or swipe to move. Enter AR to place the maze.');

    let timeSinceLastStep = 0;
    let previousScore = startingState.score;
    let hasBoardBeenPlaced = false;
    let latestSurfaceHit: XRHitTestResult | null = null;
    let latestRoomFloor: ReturnType<typeof roomUnderstanding.update>['floor'] = null;
    let activeXrSession: XRSession | null = null;
    let previousRoomScanLabel = '';
    let floorWasDetected = false;

    // Called by the XR 'select' event (a screen tap in handheld AR), not by every frame.
    const placeBoardOnSurface = (): void => {
      if (!renderer.xr.isPresenting || hasBoardBeenPlaced) {
        return;
      }

      const referenceSpace = renderer.xr.getReferenceSpace();
      if (!referenceSpace) {
        showStatusMessage('Unable to determine the AR reference space.');
        return;
      }

      if (latestRoomFloor) {
        // A detected floor gives us room dimensions, so replace the demo maze before scaling it.
        const roomMazeRows = generateRoomMaze({
          roomWidth: latestRoomFloor.width,
          roomDepth: latestRoomFloor.depth,
        });
        game.setMaze(roomMazeRows);
        const roomMazeState = game.getState();
        gridDimensions = getGridDimensions(roomMazeState);
        previousScore = roomMazeState.score;
        timeSinceLastStep = 0;
        drawGame(roomMazeState);

        const fittedPlacement = fitBoardToRoomFloor({
          floor: latestRoomFloor,
          gridWidth: gridDimensions.gridWidth,
          gridHeight: gridDimensions.gridHeight,
        });
        placeAtSurface({ object: boardRenderer.board, ...fittedPlacement });
        boardRenderer.board.visible = true;
        hasBoardBeenPlaced = true;
        placementMarker.visible = false;
        showStatusMessage(
          `Room maze ready: ${gridDimensions.gridWidth} × ${gridDimensions.gridHeight} tiles across a ${latestRoomFloor.width.toFixed(1)} × ${latestRoomFloor.depth.toFixed(1)} m floor. Swipe to move.`,
        );
        return;
      }

      // Surface-hit fallback keeps AR playable on browsers that do not expose
      // plane detection. It intentionally uses a smaller, phone-friendly board.
      if (!latestSurfaceHit) {
        showStatusMessage('Still scanning for a floor. Move the phone slowly, then tap again.');
        return;
      }

      const surfacePlacement = getSurfacePlacement({ hit: latestSurfaceHit, referenceSpace });
      if (!surfacePlacement) {
        showStatusMessage('Could not read the surface pose. Move the camera and try again.');
        return;
      }

      placeAtSurface({ object: boardRenderer.board, ...surfacePlacement, scale: FALLBACK_AR_BOARD_SCALE });
      boardRenderer.board.visible = true;
      hasBoardBeenPlaced = true;
      placementMarker.visible = false;
      showStatusMessage('Maze placed using surface hit testing. Room fitting is unavailable on this device.');
    };

    // XR sessions can end and restart; keep exactly one placement listener on the current session.
    const syncArSelectListener = (): void => {
      const nextSession = renderer.xr.getSession() ?? null;

      if (nextSession === activeXrSession) {
        return;
      }

      activeXrSession?.removeEventListener('select', placeBoardOnSurface);
      activeXrSession = nextSession;
      activeXrSession?.addEventListener('select', placeBoardOnSurface);
    };

    const stepGame = (): void => {
      game.step();
      const state = game.getState();

      // Pellet tiles change only when score changes, so static walls need no redraw on ordinary steps.
      if (state.score !== previousScore) {
        boardRenderer.drawGrid(state.grid);
      }

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
        renderer.xr.isPresenting && !hasBoardBeenPlaced
          ? 'Move the phone slowly to scan the room floor, then tap to place the maze.'
          : 'Game reset. Use arrow keys, WASD, or swipe to move.',
      );
    };

    // Every AR session starts with a fresh scan and requires a new placement tap.
    const handleArSessionStart = (): void => {
      latestSurfaceHit = null;
      latestRoomFloor = null;
      hasBoardBeenPlaced = false;
      floorWasDetected = false;
      previousRoomScanLabel = '';
      placementMarker.visible = false;
      boardRenderer.board.visible = false;
      roomUnderstanding.clear();
      const roomScanElement = document.getElementById('room-scan');
      if (roomScanElement) roomScanElement.textContent = 'Room scan: scanning…';
      showStatusMessage('Move the phone slowly to scan the room floor. Tap to fit the maze inside the detected floor.');
    };

    // AR coordinates are session-relative; restore the known demo layout and origin after leaving AR.
    const handleArSessionEnd = (): void => {
      latestSurfaceHit = null;
      latestRoomFloor = null;
      hasBoardBeenPlaced = false;
      floorWasDetected = false;
      previousRoomScanLabel = '';
      roomUnderstanding.clear();
      const roomScanElement = document.getElementById('room-scan');
      if (roomScanElement) roomScanElement.textContent = 'Room scan: inactive until AR starts.';
      game.setMaze(MAZE);
      const defaultState = game.getState();
      gridDimensions = getGridDimensions(defaultState);
      previousScore = defaultState.score;
      drawGame(defaultState);
      placementMarker.visible = false;
      boardRenderer.board.visible = true;
      boardRenderer.board.position.set(0, 0, 0);
      boardRenderer.board.quaternion.identity();
      boardRenderer.board.scale.setScalar(DEFAULT_BOARD_SCALE);
      boardRenderer.board.updateMatrix();
      positionCameraForBoard(gridDimensions);
      showStatusMessage('AR ended. Use keyboard or swipe controls to play.');
    };

    resetButton?.addEventListener('click', resetGame);
    renderer.xr.addEventListener('sessionstart', handleArSessionStart);
    renderer.xr.addEventListener('sessionend', handleArSessionEnd);

    renderer.setAnimationLoop((_timestamp, frame) => {
      const elapsedSeconds = clock.getDelta();
      syncArSelectListener();

      if (renderer.xr.isPresenting && frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        latestSurfaceHit = getSurfaceHit({
          frame,
          hitTestSource: arSession.getHitTestSource(),
          referenceSpace,
        });

        // Update the XR store before reading its plane/mesh arrays; they are refreshed from this frame.
        arSession.update(frame, elapsedSeconds * 1000);
        const roomScan = referenceSpace
          ? roomUnderstanding.update(
              frame,
              referenceSpace,
              arSession.getDetectedPlanes(),
              arSession.getDetectedMeshes(),
            )
          : { floor: null, planeCount: 0, meshCount: 0 };
        latestRoomFloor = roomScan.floor;

        const floorDimensions = latestRoomFloor
          ? `${latestRoomFloor.width.toFixed(1)} × ${latestRoomFloor.depth.toFixed(1)} m`
          : 'looking for a large horizontal floor';
        const roomScanLabel = `${roomScan.planeCount} planes · ${roomScan.meshCount} meshes · ${floorDimensions}`;
        if (roomScanLabel !== previousRoomScanLabel) {
          const roomScanElement = document.getElementById('room-scan');
          if (roomScanElement) roomScanElement.textContent = `Room scan: ${roomScanLabel}`;
          previousRoomScanLabel = roomScanLabel;
        }

        if (latestRoomFloor && !floorWasDetected && !hasBoardBeenPlaced) {
          floorWasDetected = true;
          showStatusMessage(
            `Floor detected (${latestRoomFloor.width.toFixed(1)} × ${latestRoomFloor.depth.toFixed(1)} m). Tap to fit the maze.`,
          );
        }

        const surfacePlacement = latestSurfaceHit && referenceSpace
          ? getSurfacePlacement({ hit: latestSurfaceHit, referenceSpace })
          : null;
        placementMarker.visible = surfacePlacement !== null && !hasBoardBeenPlaced && !latestRoomFloor;

        if (placementMarker.visible && surfacePlacement) {
          placeAtSurface({ object: placementMarker, ...surfacePlacement });
          placementMarker.position.y += MARKER_HEIGHT_OFFSET;
        }
      } else {
        latestSurfaceHit = null;
        latestRoomFloor = null;
        roomUnderstanding.clear();
        const roomScanElement = document.getElementById('room-scan');
        if (roomScanElement) roomScanElement.textContent = 'Room scan: inactive until AR starts.';
        placementMarker.visible = false;
      }

      // Pause simulation while scanning so Pac-Man cannot move away from the placed maze origin.
      const isWaitingForBoardPlacement = renderer.xr.isPresenting && !hasBoardBeenPlaced;

      if (!isWaitingForBoardPlacement) {
        timeSinceLastStep += elapsedSeconds;

        if (timeSinceLastStep >= GAME_STEP_SECONDS) {
          timeSinceLastStep = 0;
          stepGame();
        }
      }

      renderer.render(scene, camera);
    });

    // Remove listeners and GPU resources together; pagehide can otherwise leave XR/input callbacks alive.
    const handlePageHide = (): void => {
      renderer.setAnimationLoop(null);
      activeXrSession?.removeEventListener('select', placeBoardOnSurface);
      renderer.xr.removeEventListener('sessionstart', handleArSessionStart);
      renderer.xr.removeEventListener('sessionend', handleArSessionEnd);
      resetButton?.removeEventListener('click', resetGame);
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
