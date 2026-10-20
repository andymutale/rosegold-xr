import * as THREE from 'three';
import type { CharacterPositions } from '../game/types';
import { gridPositionToWorld } from './coordinates';

export interface CharacterRenderer {
  updatePositions(positions: CharacterPositions): void;
  dispose(): void;
}

const PLAYER_RADIUS = 0.30;
const PLAYER_CENTER_HEIGHT = 0.30;
const GHOST_RADIUS = 0.27;
const GHOST_FLOOR_OFFSET = 0.04;

const PLAYER_COLOR = 0xffd928;
const GHOST_COLOR = 0xf0445b;
const EYE_WHITE = 0xf4f7f2;
const EYE_PUPIL = 0x10202d;

/** Small, low-poly arcade figures sized to sit just under the board's raised wall caps. */
export const createCharacterRenderer = (board: THREE.Group): CharacterRenderer => {
  const playerGroup = new THREE.Group();
  playerGroup.name = 'player-pacman-figure';
  const ghostGroup = new THREE.Group();
  ghostGroup.name = 'moving-red-ghost-figure';

  const playerGeometry = new THREE.SphereGeometry(
    PLAYER_RADIUS,
    30,
    20,
    Math.PI / 4,
    Math.PI * 1.5,
  );
  const playerMaterial = new THREE.MeshStandardMaterial({
    color: PLAYER_COLOR,
    roughness: 0.36,
    metalness: 0.02,
    emissive: 0x4a3300,
    emissiveIntensity: 0.05,
  });
  const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
  // Turn the open sector towards the camera so the character reads as Pac-Man, not a sphere.
  playerMesh.rotation.y = Math.PI / 2;
  playerMesh.castShadow = true;
  playerMesh.receiveShadow = true;
  playerGroup.add(playerMesh);

  const playerEyeGeometry = new THREE.SphereGeometry(0.026, 10, 8);
  const playerEyeMaterial = new THREE.MeshStandardMaterial({ color: EYE_PUPIL, roughness: 0.5 });
  const playerEye = new THREE.Mesh(playerEyeGeometry, playerEyeMaterial);
  playerEye.position.set(-0.035, 0.13, 0.255);
  playerGroup.add(playerEye);

  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: GHOST_COLOR,
    roughness: 0.5,
    metalness: 0.01,
    emissive: 0x3e0610,
    emissiveIntensity: 0.07,
  });
  const ghostBodyGeometry = new THREE.CylinderGeometry(GHOST_RADIUS, GHOST_RADIUS, 0.25, 24, 1, false);
  const ghostDomeGeometry = new THREE.SphereGeometry(GHOST_RADIUS, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  const ghostBody = new THREE.Mesh(ghostBodyGeometry, ghostMaterial);
  ghostBody.position.y = 0.125;
  ghostBody.castShadow = true;
  ghostBody.receiveShadow = true;
  const ghostDome = new THREE.Mesh(ghostDomeGeometry, ghostMaterial);
  ghostDome.position.y = 0.25;
  ghostDome.castShadow = true;
  ghostDome.receiveShadow = true;
  ghostGroup.add(ghostBody, ghostDome);

  // Rounded scallops at the base make the ghost silhouette distinct from a cylinder.
  const fringeGeometry = new THREE.SphereGeometry(0.079, 12, 9);
  [-0.18, -0.06, 0.06, 0.18].forEach((x) => {
    const fringe = new THREE.Mesh(fringeGeometry, ghostMaterial);
    fringe.position.set(x, 0.035, 0.005);
    fringe.scale.set(1, 0.8, 1);
    ghostGroup.add(fringe);
  });

  const eyeWhiteGeometry = new THREE.SphereGeometry(0.068, 16, 12);
  const eyeWhiteMaterial = new THREE.MeshStandardMaterial({ color: EYE_WHITE, roughness: 0.38 });
  const eyePupilGeometry = new THREE.SphereGeometry(0.032, 12, 9);
  const eyePupilMaterial = new THREE.MeshStandardMaterial({ color: EYE_PUPIL, roughness: 0.45 });
  [-0.085, 0.085].forEach((x) => {
    const eye = new THREE.Mesh(eyeWhiteGeometry, eyeWhiteMaterial);
    eye.position.set(x, 0.245, 0.215);
    ghostGroup.add(eye);
    const pupil = new THREE.Mesh(eyePupilGeometry, eyePupilMaterial);
    pupil.position.set(x + 0.018, 0.24, 0.273);
    ghostGroup.add(pupil);
  });

  playerGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) object.userData.isCharacter = true;
  });
  ghostGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) object.userData.isCharacter = true;
  });
  board.add(playerGroup, ghostGroup);

  const updatePositions = ({ playerPosition, ghostPosition }: CharacterPositions): void => {
    playerGroup.position.copy(gridPositionToWorld(playerPosition));
    playerGroup.position.y = PLAYER_CENTER_HEIGHT;
    ghostGroup.position.copy(gridPositionToWorld(ghostPosition));
    ghostGroup.position.y = GHOST_FLOOR_OFFSET;
  };

  const dispose = (): void => {
    board.remove(playerGroup, ghostGroup);
    playerGeometry.dispose();
    playerMaterial.dispose();
    playerEyeGeometry.dispose();
    playerEyeMaterial.dispose();
    ghostBodyGeometry.dispose();
    ghostDomeGeometry.dispose();
    fringeGeometry.dispose();
    ghostMaterial.dispose();
    eyeWhiteGeometry.dispose();
    eyeWhiteMaterial.dispose();
    eyePupilGeometry.dispose();
    eyePupilMaterial.dispose();
  };

  return { updatePositions, dispose };
};
