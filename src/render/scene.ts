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
const MAX_PIXEL_RATIO = 2;
const BACKGROUND_COLOR = 0x10131c;
const MIN_VIEWPORT_HEIGHT = 1;
const DEFAULT_PIXEL_RATIO = 1;
const MIN_GRID_DIMENSION = 1;
const MIN_CAMERA_HEIGHT = 5;
const CAMERA_HEIGHT_SCALE = 0.85;
const CAMERA_DISTANCE_SCALE = 0.9;
const AMBIENT_SKY_COLOR = 0xffffff;
const AMBIENT_GROUND_COLOR = 0x303040;
const AMBIENT_LIGHT_INTENSITY = 2;
const KEY_LIGHT_COLOR = 0xffffff;
const KEY_LIGHT_INTENSITY = 2;
const KEY_LIGHT_POSITION = { x: 4, y: 8, z: 6 };

/** Creates the renderer, camera, lights, resize handling, and one cleanup function. */
export const createScene = (): SceneSetup => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW,
    window.innerWidth / Math.max(window.innerHeight, MIN_VIEWPORT_HEIGHT),
    CAMERA_NEAR_CLIP,
    CAMERA_FAR_CLIP,
  );
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });

  scene.background = null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || DEFAULT_PIXEL_RATIO, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(BACKGROUND_COLOR, 0);
  // Enable Three.js's XR camera/render loop integration; the XR session itself is managed separately.
  renderer.xr.enabled = true;
  renderer.domElement.setAttribute('aria-label', '3D Pac-Man maze');
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

  const positionCameraForBoard = ({
    gridWidth,
    gridHeight,
  }: {
    gridWidth: number;
    gridHeight: number;
  }): void => {
    const width = Math.max(gridWidth, MIN_GRID_DIMENSION);
    const height = Math.max(gridHeight, MIN_GRID_DIMENSION);
    const centerX = (width - 1) / 2;
    const centerZ = (height - 1) / 2;
    const size = Math.max(width, height);

    camera.position.set(
      centerX,
      Math.max(MIN_CAMERA_HEIGHT, size * CAMERA_HEIGHT_SCALE),
      centerZ + Math.max(MIN_CAMERA_HEIGHT, size * CAMERA_DISTANCE_SCALE),
    );
    camera.lookAt(centerX, 0, centerZ);
    camera.updateProjectionMatrix();
  };

  // Resize both the viewport and projection; cap pixel ratio to avoid excessive mobile GPU cost.
  const handleResize = (): void => {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, MIN_VIEWPORT_HEIGHT);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || DEFAULT_PIXEL_RATIO, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', handleResize);

  const dispose = (): void => {
    window.removeEventListener('resize', handleResize);
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { scene, camera, renderer, positionCameraForBoard, dispose };
};
