import * as THREE from 'three';

const MARKER_INNER_RADIUS = 0.09;
const MARKER_OUTER_RADIUS = 0.12;
const MARKER_SEGMENTS = 48;
const MARKER_COLOR = 0x00ff88;
const MARKER_OPACITY = 0.85;

/** Creates a horizontal ring used only while the player is choosing an AR placement point. */
export const createPlacementMarker = (): THREE.Mesh => {
  const geometry = new THREE.RingGeometry(
    MARKER_INNER_RADIUS,
    MARKER_OUTER_RADIUS,
    MARKER_SEGMENTS,
  );
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    color: MARKER_COLOR,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: MARKER_OPACITY,
    depthWrite: false,
  });

  const marker = new THREE.Mesh(geometry, material);
  marker.name = 'ar-placement-marker';
  marker.visible = false;

  return marker;
};

/** Applies a surface pose and uniform board scale in one place to avoid drift between callers. */
export const placeAtSurface = ({
  object,
  position,
  quaternion,
  scale = 1,
}: {
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale?: number;
}): void => {
  object.position.copy(position);
  object.quaternion.copy(quaternion);
  object.scale.setScalar(scale);
  object.updateMatrix();
  object.updateMatrixWorld(true);
};
