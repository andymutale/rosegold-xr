import * as THREE from 'three';
import type { Tile } from '../game/types';
import { gridPositionToWorld } from './coordinates';

export interface BoardRenderer {
  board: THREE.Group;
  drawGrid(grid: Tile[][]): void;
  dispose(): void;
}

const WALL_COLOR = 0x3155a6;
const PELLET_COLOR = 0xffdc91;
const WALL_HEIGHT = 1;
const WALL_SIZE = 0.92;
const PELLET_RADIUS = 0.105;
const POWER_PELLET_SCALE = 1.7;
const PELLET_HEIGHT_SCALE = 1.3;
const PELLET_WIDTH_SEGMENTS = 12;
const PELLET_HEIGHT_SEGMENTS = 8;
const WALL_ROUGHNESS = 0.75;
const WALL_METALNESS = 0.05;
const PELLET_EMISSIVE_INTENSITY = 0.15;
const PELLET_ROUGHNESS = 0.5;
const NORMAL_PELLET_SCALE = 1;

interface PelletPosition {
  x: number;
  y: number;
  scale: number;
}

/** Builds static wall geometry and a separate instanced mesh for collectible pellets. */
export const createBoardRenderer = (scene: THREE.Scene): BoardRenderer => {
  const board = new THREE.Group();
  board.name = 'maze-board';
  scene.add(board);

  const wallGroup = new THREE.Group();
  wallGroup.name = 'maze-walls';
  board.add(wallGroup);

  const wallGeometry = new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, WALL_SIZE);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: WALL_COLOR,
    roughness: WALL_ROUGHNESS,
    metalness: WALL_METALNESS,
  });
  const pelletGeometry = new THREE.SphereGeometry(
    PELLET_RADIUS,
    PELLET_WIDTH_SEGMENTS,
    PELLET_HEIGHT_SEGMENTS,
  );
  const pelletMaterial = new THREE.MeshStandardMaterial({
    color: PELLET_COLOR,
    emissive: PELLET_COLOR,
    emissiveIntensity: PELLET_EMISSIVE_INTENSITY,
    roughness: PELLET_ROUGHNESS,
  });

  let wallLayoutSignature = '';
  let pelletsMesh: THREE.InstancedMesh | null = null;

  const drawGrid = (grid: Tile[][]): void => {
    // Wall geometry only changes when the maze changes. Pellet collection updates
    // this grid every score tick, so preserve walls instead of rebuilding hundreds
    // of wall objects over and over (especially for room-sized generated mazes).
    const nextWallLayoutSignature = grid
      .map((row) => row.map((tile) => (tile === '#' ? '#' : '.')).join(''))
      .join('\n');

    if (nextWallLayoutSignature !== wallLayoutSignature) {
      wallGroup.clear();
      grid.forEach((row, y) => {
        row.forEach((tile, x) => {
          if (tile !== '#') return;

          const wall = new THREE.Mesh(wallGeometry, wallMaterial);
          const position = gridPositionToWorld({ x, y });
          wall.position.set(position.x, WALL_HEIGHT / 2, position.z);
          wall.castShadow = true;
          wall.receiveShadow = true;
          wallGroup.add(wall);
        });
      });
      wallLayoutSignature = nextWallLayoutSignature;
    }

    if (pelletsMesh) {
      board.remove(pelletsMesh);
      pelletsMesh = null;
    }

    // A pellet disappears by leaving the instance list; walls are independent of pellet state.
    const pelletPositions: PelletPosition[] = [];
    grid.forEach((row, y) => {
      row.forEach((tile, x) => {
        if (tile === '.' || tile === 'o') {
          pelletPositions.push({ x, y, scale: tile === 'o' ? POWER_PELLET_SCALE : NORMAL_PELLET_SCALE });
        }
      });
    });

    if (pelletPositions.length === 0) return;

    pelletsMesh = new THREE.InstancedMesh(pelletGeometry, pelletMaterial, pelletPositions.length);
    pelletsMesh.name = 'maze-pellets';
    const temporaryObject = new THREE.Object3D();

    pelletPositions.forEach((pellet, index) => {
      const position = gridPositionToWorld(pellet);
      temporaryObject.position.set(position.x, PELLET_RADIUS * PELLET_HEIGHT_SCALE, position.z);
      temporaryObject.scale.setScalar(pellet.scale);
      temporaryObject.updateMatrix();
      pelletsMesh?.setMatrixAt(index, temporaryObject.matrix);
    });

    pelletsMesh.instanceMatrix.needsUpdate = true;
    board.add(pelletsMesh);
  };

  // Geometries/materials are shared by many meshes, so dispose each shared resource exactly once.
  const dispose = (): void => {
    scene.remove(board);
    wallGeometry.dispose();
    wallMaterial.dispose();
    pelletGeometry.dispose();
    pelletMaterial.dispose();
  };

  return { board, drawGrid, dispose };
};
