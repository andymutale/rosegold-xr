import * as THREE from 'three';

export interface SurfacePlacement {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/** Returns the closest hit for the current frame, or null until tracking is ready. */
export const getSurfaceHit = ({
  frame,
  hitTestSource,
  referenceSpace,
}: {
  frame: XRFrame | undefined;
  hitTestSource: XRHitTestSource | null;
  referenceSpace: XRReferenceSpace | null;
}): XRHitTestResult | null => {
  if (!frame || !hitTestSource || !referenceSpace) {
    return null;
  }

  return frame.getHitTestResults(hitTestSource)[0] ?? null;
};

/** Converts a hit pose into Three.js coordinates and flattens it to a horizontal board. */
export const getSurfacePlacement = ({
  hit,
  referenceSpace,
}: {
  hit: XRHitTestResult;
  referenceSpace: XRReferenceSpace;
}): SurfacePlacement | null => {
  const pose = hit.getPose(referenceSpace);

  if (!pose) {
    return null;
  }

  const matrix = new THREE.Matrix4().fromArray(Array.from(pose.transform.matrix));
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  matrix.decompose(position, rotation, new THREE.Vector3());

  // The board must stay level even if a device reports a tilted surface pose; preserve only its heading.
  const yaw = new THREE.Euler().setFromQuaternion(rotation, 'YXZ');
  yaw.x = 0;
  yaw.z = 0;

  return { position, quaternion: new THREE.Quaternion().setFromEuler(yaw) };
};
