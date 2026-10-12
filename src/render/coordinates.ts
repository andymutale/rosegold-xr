import * as THREE from 'three';
import type { GridPosition } from '../game/types';

/** Maps a cell centre to world space; room placement applies the board's scale afterwards. */
export const gridPositionToWorld = ({ x, y }: GridPosition): THREE.Vector3 =>
  new THREE.Vector3(x, 0, y);
