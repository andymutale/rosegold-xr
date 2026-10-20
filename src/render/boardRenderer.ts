import * as THREE from 'three';
import type { Tile } from '../game/types';
import { gridPositionToWorld } from './coordinates';

export interface BoardRenderer {
  board: THREE.Group;
  drawGrid(grid: Tile[][]): void;
  dispose(): void;
}

const WALL_BODY_HEIGHT = 0.52;
const WALL_CAP_HEIGHT = 0.075;
const WALL_BODY_SIZE = 0.96;
const WALL_CAP_SIZE = 0.985;
const WALL_RAIL_Y = WALL_BODY_HEIGHT + WALL_CAP_HEIGHT + 0.006;
const PELLET_SIZE = 0.12;
const PELLET_HEIGHT = 0.028;
const POWER_PELLET_SCALE = 1.65;
const NORMAL_PELLET_SCALE = 1;
const FLOOR_THICKNESS = 0.13;

const WALL_COLOR = 0x21464e;
const WALL_CAP_COLOR = 0x747f82;
const WALL_BAND_COLOR = 0x286873;
const WALL_TRIM_COLOR = 0x08a3ef;
const RIVET_COLOR = 0xf9c933;
const FLOOR_COLOR = 0x151c1f;
const FLOOR_EDGE_COLOR = 0x0a1115;
const FLOOR_SEAM_COLOR = 0x233034;
const PELLET_COLOR = 0xffca2e;

interface PelletPosition {
  x: number;
  y: number;
  scale: number;
}

interface WallCell {
  x: number;
  z: number;
}

const setInstanceTransform = (
  mesh: THREE.InstancedMesh,
  index: number,
  object: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): void => {
  object.position.set(x, y, z);
  object.scale.set(scaleX, scaleY, scaleZ);
  object.rotation.set(0, 0, 0);
  object.updateMatrix();
  mesh.setMatrixAt(index, object.matrix);
};

const finishInstances = (mesh: THREE.InstancedMesh): void => {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
};

/**
 * Builds the tabletop board as instanced, layered wall modules and square pellets.
 * Instancing keeps the additional cap rails, bands, and gold rivets practical on phones.
 */
export const createBoardRenderer = (scene: THREE.Scene): BoardRenderer => {
  const board = new THREE.Group();
  board.name = 'rosegold-reference-board';
  scene.add(board);

  const floorGroup = new THREE.Group();
  floorGroup.name = 'maze-foundation-and-floor';
  board.add(floorGroup);

  const wallGroup = new THREE.Group();
  wallGroup.name = 'layered-teal-maze-walls';
  board.add(wallGroup);

  const unitBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
  const pelletGeometry = new THREE.BoxGeometry(PELLET_SIZE, PELLET_HEIGHT, PELLET_SIZE);
  const rivetGeometry = new THREE.SphereGeometry(0.014, 7, 5);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: WALL_COLOR,
    roughness: 0.84,
    metalness: 0.12,
  });
  const wallCapMaterial = new THREE.MeshStandardMaterial({
    color: WALL_CAP_COLOR,
    roughness: 0.91,
    metalness: 0.04,
  });
  const wallBandMaterial = new THREE.MeshStandardMaterial({
    color: WALL_BAND_COLOR,
    roughness: 0.72,
    metalness: 0.14,
  });
  const wallTrimMaterial = new THREE.MeshStandardMaterial({
    color: WALL_TRIM_COLOR,
    emissive: WALL_TRIM_COLOR,
    emissiveIntensity: 0.11,
    roughness: 0.42,
    metalness: 0.2,
  });
  const rivetMaterial = new THREE.MeshStandardMaterial({
    color: RIVET_COLOR,
    emissive: 0x8a5700,
    emissiveIntensity: 0.18,
    roughness: 0.4,
    metalness: 0.24,
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    roughness: 0.94,
    metalness: 0.06,
  });
  const foundationMaterial = new THREE.MeshStandardMaterial({
    color: FLOOR_EDGE_COLOR,
    roughness: 0.9,
    metalness: 0.08,
  });
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: FLOOR_SEAM_COLOR,
    roughness: 0.96,
    metalness: 0.02,
  });
  const pelletMaterial = new THREE.MeshStandardMaterial({
    color: PELLET_COLOR,
    emissive: 0xffa800,
    emissiveIntensity: 0.24,
    roughness: 0.38,
    metalness: 0.08,
  });

  let wallLayoutSignature = '';
  let floorLayoutSignature = '';
  let floorGeometries: THREE.BufferGeometry[] = [];
  let pelletsMesh: THREE.InstancedMesh | null = null;

  const drawFoundation = (gridWidth: number, gridHeight: number): void => {
    floorGroup.clear();
    floorGeometries.forEach((geometry) => geometry.dispose());
    floorGeometries = [];

    const boardCenterX = (gridWidth - 1) / 2;
    const boardCenterZ = (gridHeight - 1) / 2;
    const foundationWidth = gridWidth + 0.68;
    const foundationDepth = gridHeight + 0.68;

    const foundationGeometry = new THREE.BoxGeometry(foundationWidth, FLOOR_THICKNESS, foundationDepth);
    floorGeometries.push(foundationGeometry);
    const foundation = new THREE.Mesh(foundationGeometry, foundationMaterial);
    foundation.name = 'dark-board-foundation';
    foundation.position.set(boardCenterX, -FLOOR_THICKNESS / 2, boardCenterZ);
    foundation.receiveShadow = true;
    foundation.castShadow = true;
    floorGroup.add(foundation);

    const floorGeometry = new THREE.PlaneGeometry(foundationWidth, foundationDepth);
    floorGeometries.push(floorGeometry);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.name = 'charcoal-tiled-floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(boardCenterX, 0.002, boardCenterZ);
    floor.receiveShadow = true;
    floorGroup.add(floor);

    // Fine seams on the charcoal playing surface echo the modular square base tiles.
    const verticalLines = new THREE.InstancedMesh(unitBoxGeometry, seamMaterial, gridWidth + 1);
    const horizontalLines = new THREE.InstancedMesh(unitBoxGeometry, seamMaterial, gridHeight + 1);
    const helper = new THREE.Object3D();
    for (let line = 0; line <= gridWidth; line += 1) {
      setInstanceTransform(
        verticalLines,
        line,
        helper,
        line - 0.5,
        0.0055,
        boardCenterZ,
        0.009,
        0.004,
        gridHeight + 0.02,
      );
    }
    for (let line = 0; line <= gridHeight; line += 1) {
      setInstanceTransform(
        horizontalLines,
        line,
        helper,
        boardCenterX,
        0.0055,
        line - 0.5,
        gridWidth + 0.02,
        0.004,
        0.009,
      );
    }
    verticalLines.name = 'subtle-vertical-floor-seams';
    horizontalLines.name = 'subtle-horizontal-floor-seams';
    finishInstances(verticalLines);
    finishInstances(horizontalLines);
    floorGroup.add(verticalLines, horizontalLines);

    // A slim, low-profile teal border reads as the edge of a physical printed board.
    const edgeMesh = new THREE.InstancedMesh(unitBoxGeometry, wallBandMaterial, 4);
    const edgeY = 0.008;
    const edgeThickness = 0.026;
    setInstanceTransform(edgeMesh, 0, helper, boardCenterX, edgeY, -foundationDepth / 2 + boardCenterZ, foundationWidth, 0.012, edgeThickness);
    setInstanceTransform(edgeMesh, 1, helper, boardCenterX, edgeY, foundationDepth / 2 + boardCenterZ, foundationWidth, 0.012, edgeThickness);
    setInstanceTransform(edgeMesh, 2, helper, -foundationWidth / 2 + boardCenterX, edgeY, boardCenterZ, edgeThickness, 0.012, foundationDepth);
    setInstanceTransform(edgeMesh, 3, helper, foundationWidth / 2 + boardCenterX, edgeY, boardCenterZ, edgeThickness, 0.012, foundationDepth);
    edgeMesh.name = 'muted-teal-board-edge';
    finishInstances(edgeMesh);
    floorGroup.add(edgeMesh);

    floorLayoutSignature = `${gridWidth}x${gridHeight}`;
  };

  const drawWalls = (grid: Tile[][]): void => {
    wallGroup.clear();
    const wallCells: WallCell[] = [];
    grid.forEach((row, z) => {
      row.forEach((tile, x) => {
        if (tile === '#') wallCells.push({ x, z });
      });
    });
    if (wallCells.length === 0) return;

    const body = new THREE.InstancedMesh(wallGeometry, wallMaterial, wallCells.length);
    const cap = new THREE.InstancedMesh(wallGeometry, wallCapMaterial, wallCells.length);
    const rails = new THREE.InstancedMesh(wallGeometry, wallTrimMaterial, wallCells.length * 4);
    const bands = new THREE.InstancedMesh(wallGeometry, wallBandMaterial, wallCells.length * 4);
    const rivets = new THREE.InstancedMesh(rivetGeometry, rivetMaterial, wallCells.length * 24);
    const helper = new THREE.Object3D();

    let railIndex = 0;
    let bandIndex = 0;
    let rivetIndex = 0;
    const rivetOffsets = [-0.29, 0, 0.29];
    const rivetRows = [0.115, 0.245];

    wallCells.forEach(({ x, z }, index) => {
      setInstanceTransform(
        body,
        index,
        helper,
        x,
        WALL_BODY_HEIGHT / 2,
        z,
        WALL_BODY_SIZE,
        WALL_BODY_HEIGHT,
        WALL_BODY_SIZE,
      );
      setInstanceTransform(
        cap,
        index,
        helper,
        x,
        WALL_BODY_HEIGHT + WALL_CAP_HEIGHT / 2,
        z,
        WALL_CAP_SIZE,
        WALL_CAP_HEIGHT,
        WALL_CAP_SIZE,
      );

      // Bright blue rails run around the outside of the concrete-grey top cap.
      setInstanceTransform(rails, railIndex++, helper, x, WALL_RAIL_Y, z - 0.445, 0.93, 0.022, 0.035);
      setInstanceTransform(rails, railIndex++, helper, x, WALL_RAIL_Y, z + 0.445, 0.93, 0.022, 0.035);
      setInstanceTransform(rails, railIndex++, helper, x - 0.445, WALL_RAIL_Y, z, 0.035, 0.022, 0.93);
      setInstanceTransform(rails, railIndex++, helper, x + 0.445, WALL_RAIL_Y, z, 0.035, 0.022, 0.93);

      // A low teal belt gives the wall face the layered, moulded-plastic look.
      const bandY = WALL_BODY_HEIGHT * 0.42;
      setInstanceTransform(bands, bandIndex++, helper, x, bandY, z - 0.485, 0.92, 0.042, 0.018);
      setInstanceTransform(bands, bandIndex++, helper, x, bandY, z + 0.485, 0.92, 0.042, 0.018);
      setInstanceTransform(bands, bandIndex++, helper, x - 0.485, bandY, z, 0.018, 0.042, 0.92);
      setInstanceTransform(bands, bandIndex++, helper, x + 0.485, bandY, z, 0.018, 0.042, 0.92);

      // Tiny gold studs appear as two rows on all four outward-facing sides.
      rivetRows.forEach((rowY) => {
        rivetOffsets.forEach((offset) => {
          setInstanceTransform(rivets, rivetIndex++, helper, x + offset, rowY, z - 0.492, 1, 1, 1);
          setInstanceTransform(rivets, rivetIndex++, helper, x + offset, rowY, z + 0.492, 1, 1, 1);
          setInstanceTransform(rivets, rivetIndex++, helper, x - 0.492, rowY, z + offset, 1, 1, 1);
          setInstanceTransform(rivets, rivetIndex++, helper, x + 0.492, rowY, z + offset, 1, 1, 1);
        });
      });
    });

    body.name = 'teal-wall-bodies';
    cap.name = 'slate-wall-capstones';
    rails.name = 'electric-blue-wall-top-rails';
    bands.name = 'raised-teal-wall-belts';
    rivets.name = 'small-gold-wall-rivets';
    finishInstances(body);
    finishInstances(cap);
    finishInstances(rails);
    finishInstances(bands);
    rivets.instanceMatrix.needsUpdate = true;
    wallGroup.add(body, cap, rails, bands, rivets);
  };

  const drawGrid = (grid: Tile[][]): void => {
    const gridWidth = grid[0]?.length ?? 1;
    const gridHeight = grid.length;
    const nextWallLayoutSignature = grid
      .map((row) => row.map((tile) => (tile === '#' ? '#' : '.')).join(''))
      .join('\n');

    if (nextWallLayoutSignature !== wallLayoutSignature) {
      drawWalls(grid);
      wallLayoutSignature = nextWallLayoutSignature;
    }
    if (floorLayoutSignature !== `${gridWidth}x${gridHeight}`) {
      drawFoundation(gridWidth, gridHeight);
    }

    if (pelletsMesh) {
      board.remove(pelletsMesh);
      pelletsMesh = null;
    }

    const pellets: PelletPosition[] = [];
    grid.forEach((row, y) => {
      row.forEach((tile, x) => {
        if (tile === '.' || tile === 'o') {
          pellets.push({ x, y, scale: tile === 'o' ? POWER_PELLET_SCALE : NORMAL_PELLET_SCALE });
        }
      });
    });
    if (pellets.length === 0) return;

    pelletsMesh = new THREE.InstancedMesh(pelletGeometry, pelletMaterial, pellets.length);
    pelletsMesh.name = 'square-gold-pellets';
    const helper = new THREE.Object3D();
    pellets.forEach((pellet, index) => {
      const position = gridPositionToWorld({ x: pellet.x, y: pellet.y });
      setInstanceTransform(
        pelletsMesh!,
        index,
        helper,
        position.x,
        0.004 + (PELLET_HEIGHT * pellet.scale) / 2,
        position.z,
        pellet.scale,
        pellet.scale,
        pellet.scale,
      );
    });
    pelletsMesh.instanceMatrix.needsUpdate = true;
    board.add(pelletsMesh);
  };

  const dispose = (): void => {
    scene.remove(board);
    floorGeometries.forEach((geometry) => geometry.dispose());
    wallGeometry.dispose();
    unitBoxGeometry.dispose();
    pelletGeometry.dispose();
    rivetGeometry.dispose();
    wallMaterial.dispose();
    wallCapMaterial.dispose();
    wallBandMaterial.dispose();
    wallTrimMaterial.dispose();
    rivetMaterial.dispose();
    floorMaterial.dispose();
    foundationMaterial.dispose();
    seamMaterial.dispose();
    pelletMaterial.dispose();
  };

  return { board, drawGrid, dispose };
};
