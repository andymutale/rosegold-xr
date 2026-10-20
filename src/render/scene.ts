import * as THREE from 'three';

export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  positionCameraForBoard({ gridWidth, gridHeight }: { gridWidth: number; gridHeight: number }): void;
  dispose(): void;
}

const CAMERA_FIELD_OF_VIEW = 50;
const CAMERA_NEAR_CLIP = 0.01;
const CAMERA_FAR_CLIP = 1000;
const MAX_PIXEL_RATIO = 1.75;
const MIN_VIEWPORT_HEIGHT = 1;
const DEFAULT_PIXEL_RATIO = 1;
const MIN_GRID_DIMENSION = 1;
const MIN_CAMERA_DISTANCE = 5;
const CAMERA_ELEVATION_RATIO = 0.64;
const CAMERA_DEPTH_RATIO = 0.77;
const FIT_MARGIN = 1.16;
const BACKGROUND_COLOR = 0x0b1115;
const AMBIENT_SKY_COLOR = 0xe4f7ff;
const AMBIENT_GROUND_COLOR = 0x24333a;
const AMBIENT_LIGHT_INTENSITY = 1.18;
const KEY_LIGHT_COLOR = 0xffffff;
const KEY_LIGHT_INTENSITY = 1.65;
const KEY_LIGHT_POSITION = { x: 4, y: 10, z: 7 };

/** Creates the renderer, camera, lights, responsive framing, and one cleanup function. */
export const createScene = (): SceneSetup => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW,
    window.innerWidth / Math.max(window.innerHeight, MIN_VIEWPORT_HEIGHT),
    CAMERA_NEAR_CLIP,
    CAMERA_FAR_CLIP,
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  scene.background = null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || DEFAULT_PIXEL_RATIO, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(BACKGROUND_COLOR, 0);
  // WebXR's camera and composition are driven by the active AR session.
  renderer.xr.enabled = true;
  renderer.domElement.setAttribute('aria-label', 'Three-dimensional Rosegold XR maze');
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  document.body.appendChild(renderer.domElement);

  const ambientLight = new THREE.HemisphereLight(
    AMBIENT_SKY_COLOR,
    AMBIENT_GROUND_COLOR,
    AMBIENT_LIGHT_INTENSITY,
  );
  const keyLight = new THREE.DirectionalLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY);
  keyLight.position.set(KEY_LIGHT_POSITION.x, KEY_LIGHT_POSITION.y, KEY_LIGHT_POSITION.z);
  scene.add(ambientLight, keyLight);

  const positionCameraForBoard = ({ gridWidth, gridHeight }: {
    gridWidth: number;
    gridHeight: number;
  }): void => {
    const width = Math.max(gridWidth, MIN_GRID_DIMENSION);
    const height = Math.max(gridHeight, MIN_GRID_DIMENSION);
    const centerX = (width - 1) / 2;
    const centerZ = (height - 1) / 2;
    const verticalFov = THREE.MathUtils.degToRad(CAMERA_FIELD_OF_VIEW);
    const safeAspect = Math.max(camera.aspect, 0.35);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
    const widthDistance = width / (2 * Math.tan(horizontalFov / 2)) * FIT_MARGIN;
    // The board is viewed obliquely, so only its projected depth has to fit vertically.
    const projectedDepth = height * CAMERA_ELEVATION_RATIO;
    const heightDistance = projectedDepth / (2 * Math.tan(verticalFov / 2)) * FIT_MARGIN;
    const distance = Math.max(MIN_CAMERA_DISTANCE, widthDistance, heightDistance);

    camera.position.set(
      centerX,
      Math.max(3, distance * CAMERA_ELEVATION_RATIO),
      centerZ + distance * CAMERA_DEPTH_RATIO,
    );
    camera.lookAt(centerX, 0, centerZ);
    camera.updateProjectionMatrix();
  };

  const handleResize = (): void => {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, MIN_VIEWPORT_HEIGHT);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || DEFAULT_PIXEL_RATIO, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Resizing changes the horizontal field of view, so keep the whole maze framed.
    const size = camera.userData.boardDimensions as { gridWidth: number; gridHeight: number } | undefined;
    if (size) positionCameraForBoard(size);
  };

  // Cache the dimensions in camera metadata so responsive changes keep the board fully visible.
  const originalPositionCameraForBoard = positionCameraForBoard;
  const responsivePositionCameraForBoard = ({ gridWidth, gridHeight }: { gridWidth: number; gridHeight: number }): void => {
    camera.userData.boardDimensions = { gridWidth, gridHeight };
    originalPositionCameraForBoard({ gridWidth, gridHeight });
  };

  window.addEventListener('resize', handleResize);
  const dispose = (): void => {
    window.removeEventListener('resize', handleResize);
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { scene, camera, renderer, positionCameraForBoard: responsivePositionCameraForBoard, dispose };
};
