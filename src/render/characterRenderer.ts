import * as THREE from 'three';
import type { CharacterPositions } from '../game/types';
import { gridPositionToWorld } from './coordinates';

export interface CharacterRenderer {
  updatePositions(positions: CharacterPositions): void;
  dispose(): void;
}

const CHARACTER_RADIUS = 0.32;
const CHARACTER_HEIGHT = 0.34;
const SPHERE_SEGMENTS = 20;
const PLAYER_COLOR = 0xffe04a;
const GHOST_COLOR = 0xff4057;
const PLAYER_ROUGHNESS = 0.45;
const PLAYER_METALNESS = 0.05;
const GHOST_ROUGHNESS = 0.5;
const GHOST_METALNESS = 0;

/** Keeps visual character meshes as children of the board so AR scaling/placement moves them too. */
export const createCharacterRenderer = (board: THREE.Group): CharacterRenderer => {
  const geometry = new THREE.SphereGeometry(CHARACTER_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
  const playerMaterial = new THREE.MeshStandardMaterial({
    color: PLAYER_COLOR,
    roughness: PLAYER_ROUGHNESS,
    metalness: PLAYER_METALNESS,
  });
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: GHOST_COLOR,
    roughness: GHOST_ROUGHNESS,
    metalness: GHOST_METALNESS,
  });

  const playerMesh = new THREE.Mesh(geometry, playerMaterial);
  const ghostMesh = new THREE.Mesh(geometry, ghostMaterial);
  playerMesh.userData.isCharacter = true;
  ghostMesh.userData.isCharacter = true;
  playerMesh.castShadow = true;
  ghostMesh.castShadow = true;
  board.add(playerMesh, ghostMesh);

  const updatePositions = ({ playerPosition, ghostPosition }: CharacterPositions): void => {
    playerMesh.position.copy(gridPositionToWorld(playerPosition));
    playerMesh.position.y = CHARACTER_HEIGHT;
    ghostMesh.position.copy(gridPositionToWorld(ghostPosition));
    ghostMesh.position.y = CHARACTER_HEIGHT;
  };

  const dispose = (): void => {
    board.remove(playerMesh, ghostMesh);
    geometry.dispose();
    playerMaterial.dispose();
    ghostMaterial.dispose();
  };

  return { updatePositions, dispose };
};
