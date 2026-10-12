import * as THREE from 'three';

/**
 * Structural WebXR types keep the game compatible with browsers whose WebXR
 * typings do not yet include the optional plane/mesh-detection APIs.
 * The shape mirrors the plane and mesh data consumed by @pmndrs/xr's vanilla
 * XRPlaneModel/XRMeshModel helpers.
 */
interface PlanePoint {
  readonly x: number;
  readonly z: number;
  readonly y?: number;
}

interface DetectedPlaneLike {
  readonly planeSpace: XRSpace;
  readonly polygon: readonly PlanePoint[];
  readonly orientation?: string;
  readonly semanticLabel?: string;
  readonly lastChangedTime?: number;
}

interface DetectedMeshLike {
  readonly meshSpace: XRSpace;
  readonly vertices: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly semanticLabel?: string;
  readonly lastChangedTime?: number;
}

interface RoomFrameLike {
  readonly detectedPlanes?: Iterable<DetectedPlaneLike>;
  readonly detectedMeshes?: Iterable<DetectedMeshLike>;
}

/** Floor candidate in XR reference-space coordinates plus bounds in the plane's local polygon. */
export interface RoomFloor {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  polygon: readonly PlanePoint[];
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  semanticLabel?: string;
}

interface FloorCandidate extends RoomFloor {
  sourcePlane: DetectedPlaneLike;
}

export interface RoomScanSnapshot {
  floor: RoomFloor | null;
  planeCount: number;
  meshCount: number;
}

export interface RoomBoardPlacement {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
}

interface MeshPreview {
  object: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  lastChangedTime: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const PLANE_NORMAL = new THREE.Vector3(0, 1, 0);
const HORIZONTAL_ALIGNMENT = 0.82;
const MIN_FLOOR_DIMENSION = 1.8;
const FLOOR_EDGE_MARGIN = 0.82;
const MIN_BOARD_SCALE = 0.18;
const MAX_BOARD_SCALE = 1.25;
const FLOOR_OUTLINE_COLOR = 0x00ff88;
const FLOOR_OUTLINE_OPACITY = 0.9;
const FLOOR_OUTLINE_HEIGHT = 0.012;
const ROOM_MESH_COLOR = 0x65cfff;
const ROOM_MESH_OPACITY = 0.12;
const MAX_ROOM_MESH_PREVIEWS = 24;
const MAX_MESH_VERTEX_FLOATS = 180_000;

const finite = (value: number): boolean => Number.isFinite(value);

const getPlanePolygon = (plane: DetectedPlaneLike): PlanePoint[] =>
  Array.from(plane.polygon ?? []).filter((point) => finite(point.x) && finite(point.z));

/** Use a rectangle for a first fit; this is not a full polygon-aware room boundary. */
const getPlaneBounds = (polygon: readonly PlanePoint[]) => {
  const minX = Math.min(...polygon.map((point) => point.x));
  const maxX = Math.max(...polygon.map((point) => point.x));
  const minZ = Math.min(...polygon.map((point) => point.z));
  const maxZ = Math.max(...polygon.map((point) => point.z));

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
};

const getYawQuaternion = (rotation: THREE.Quaternion): THREE.Quaternion => {
  const yaw = new THREE.Euler().setFromQuaternion(rotation, 'YXZ');
  yaw.x = 0;
  yaw.z = 0;
  return new THREE.Quaternion().setFromEuler(yaw);
};

const getRoomFloor = (
  frame: XRFrame,
  referenceSpace: XRReferenceSpace,
  planes: readonly DetectedPlaneLike[],
): FloorCandidate | null => {
  const candidates: Array<FloorCandidate & { area: number; y: number; explicitlyFloor: boolean }> = [];

  for (const plane of planes) {
    const polygon = getPlanePolygon(plane);
    if (polygon.length < 3) {
      continue;
    }

    const pose = frame.getPose(plane.planeSpace, referenceSpace);
    if (!pose) {
      continue;
    }

    const poseMatrix = new THREE.Matrix4().fromArray(Array.from(pose.transform.matrix));
    const position = new THREE.Vector3();
    const rawRotation = new THREE.Quaternion();
    poseMatrix.decompose(position, rawRotation, new THREE.Vector3());

    // Some runtimes omit the orientation label, so infer horizontalness from the transformed plane normal.
    const normal = PLANE_NORMAL.clone().applyQuaternion(rawRotation).normalize();
    const isHorizontal = plane.orientation === 'horizontal' || Math.abs(normal.dot(WORLD_UP)) >= HORIZONTAL_ALIGNMENT;
    if (!isHorizontal) {
      continue;
    }

    const bounds = getPlaneBounds(polygon);
    if (bounds.width < MIN_FLOOR_DIMENSION || bounds.depth < MIN_FLOOR_DIMENSION) {
      continue;
    }

    candidates.push({
      position,
      quaternion: getYawQuaternion(rawRotation),
      polygon,
      width: bounds.width,
      depth: bounds.depth,
      centerX: bounds.centerX,
      centerZ: bounds.centerZ,
      semanticLabel: plane.semanticLabel,
      sourcePlane: plane,
      area: bounds.width * bounds.depth,
      y: position.y,
      explicitlyFloor: plane.semanticLabel?.toLowerCase() === 'floor',
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  // Prefer the device's semantic floor label when exposed. Otherwise prefer
  // the broadest horizontal surface near the lowest detected horizontal level,
  // which usually favours the room floor over a table or countertop.
  const explicitFloors = candidates.filter((candidate) => candidate.explicitlyFloor);
  const pool = explicitFloors.length > 0
    ? explicitFloors
    : (() => {
        const lowestY = Math.min(...candidates.map((candidate) => candidate.y));
        return candidates.filter((candidate) => candidate.y <= lowestY + 0.45);
      })();
  const selected = pool.reduce((best, candidate) => (candidate.area > best.area ? candidate : best));
  return {
    sourcePlane: selected.sourcePlane,
    position: selected.position,
    quaternion: selected.quaternion,
    polygon: selected.polygon,
    width: selected.width,
    depth: selected.depth,
    centerX: selected.centerX,
    centerZ: selected.centerZ,
    semanticLabel: selected.semanticLabel,
  };
};

/** Fits the fixed maze inside the detected floor polygon's rectangular bounds. */
export const fitBoardToRoomFloor = ({
  floor,
  gridWidth,
  gridHeight,
}: {
  floor: RoomFloor;
  gridWidth: number;
  gridHeight: number;
}): RoomBoardPlacement => {
  const requestedScale = Math.min(floor.width / gridWidth, floor.depth / gridHeight) * FLOOR_EDGE_MARGIN;
  const scale = THREE.MathUtils.clamp(requestedScale, MIN_BOARD_SCALE, MAX_BOARD_SCALE);

  // Maze coordinates represent tile centres from (0, 0) to (width - 1, height - 1).
  // Offset the board origin so those tile centres are centred inside the floor.
  const localOffset = new THREE.Vector3(
    floor.centerX - ((gridWidth - 1) * scale) / 2,
    FLOOR_OUTLINE_HEIGHT,
    floor.centerZ - ((gridHeight - 1) * scale) / 2,
  );

  return {
    position: floor.position.clone().add(localOffset.applyQuaternion(floor.quaternion)),
    quaternion: floor.quaternion.clone(),
    scale,
  };
};

/**
 * Reads native WebXR plane/mesh detection on each XR frame, displays a subtle
 * mesh scan overlay, and reports the best available floor candidate.
 */
export const createRoomUnderstanding = (scene: THREE.Scene) => {
  const floorOutlineMaterial = new THREE.LineBasicMaterial({
    color: FLOOR_OUTLINE_COLOR,
    transparent: true,
    opacity: FLOOR_OUTLINE_OPACITY,
    depthWrite: false,
  });
  const floorOutline = new THREE.LineLoop(new THREE.BufferGeometry(), floorOutlineMaterial);
  floorOutline.name = 'detected-room-floor-outline';
  floorOutline.visible = false;
  scene.add(floorOutline);

  const roomMeshMaterial = new THREE.MeshBasicMaterial({
    color: ROOM_MESH_COLOR,
    wireframe: true,
    transparent: true,
    opacity: ROOM_MESH_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const meshPreviews = new Map<DetectedMeshLike, MeshPreview>();
  let activeFloorPlane: DetectedPlaneLike | null = null;
  let activeFloorSignature = '';

  const updateFloorOutline = (floor: RoomFloor | null, plane: DetectedPlaneLike | null): void => {
    if (!floor || !plane) {
      floorOutline.visible = false;
      activeFloorPlane = null;
      activeFloorSignature = '';
      return;
    }

    const signature = `${plane.lastChangedTime ?? 0}:${floor.polygon.length}:${floor.width.toFixed(2)}:${floor.depth.toFixed(2)}`;
    if (plane !== activeFloorPlane || signature !== activeFloorSignature) {
      const points = floor.polygon.map((point) => new THREE.Vector3(point.x, 0, point.z));
      const nextGeometry = new THREE.BufferGeometry().setFromPoints(points);
      floorOutline.geometry.dispose();
      floorOutline.geometry = nextGeometry;
      activeFloorPlane = plane;
      activeFloorSignature = signature;
    }

    floorOutline.position.copy(floor.position);
    floorOutline.position.y += FLOOR_OUTLINE_HEIGHT;
    floorOutline.quaternion.copy(floor.quaternion);
    floorOutline.visible = true;
  };

  const removeMeshPreview = (preview: MeshPreview): void => {
    scene.remove(preview.object);
    preview.object.geometry.dispose();
    // The material is shared by all previews and is disposed by the owner.
  };

  // Reuse each detected mesh object and rebuild its geometry only when WebXR reports a change.
  const updateMeshPreviews = (
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
    detectedMeshes: readonly DetectedMeshLike[],
  ): void => {
    const visibleMeshes = detectedMeshes.slice(0, MAX_ROOM_MESH_PREVIEWS);
    const liveMeshes = new Set(visibleMeshes);

    for (const [meshData, preview] of meshPreviews) {
      if (!liveMeshes.has(meshData)) {
        removeMeshPreview(preview);
        meshPreviews.delete(meshData);
      }
    }

    for (const meshData of visibleMeshes) {
      // Skip absent/tiny meshes and very large meshes to cap per-frame GPU work on mobile devices.
      if (meshData.vertices.length > MAX_MESH_VERTEX_FLOATS || meshData.vertices.length < 9 || meshData.indices.length < 3) {
        continue;
      }

      let preview = meshPreviews.get(meshData);
      if (!preview) {
        const geometry = new THREE.BufferGeometry();
        const object = new THREE.Mesh(geometry, roomMeshMaterial);
        object.name = `detected-room-mesh-${meshPreviews.size + 1}`;
        object.matrixAutoUpdate = false;
        object.frustumCulled = false;
        scene.add(object);
        preview = { object, lastChangedTime: -1 };
        meshPreviews.set(meshData, preview);
      }

      if (preview.lastChangedTime !== (meshData.lastChangedTime ?? 0)) {
        const nextGeometry = new THREE.BufferGeometry();
        nextGeometry.setAttribute('position', new THREE.BufferAttribute(meshData.vertices, 3));
        nextGeometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
        nextGeometry.computeVertexNormals();
        preview.object.geometry.dispose();
        preview.object.geometry = nextGeometry;
        preview.lastChangedTime = meshData.lastChangedTime ?? 0;
      }

      const pose = frame.getPose(meshData.meshSpace, referenceSpace);
      if (pose) {
        preview.object.matrix.fromArray(Array.from(pose.transform.matrix));
        preview.object.matrixWorldNeedsUpdate = true;
        preview.object.visible = true;
      } else {
        preview.object.visible = false;
      }
    }
  };

  // Prefer data already synchronised by @pmndrs/xr, with frame properties as a compatibility fallback.
  const update = (
    frame: XRFrame,
    referenceSpace: XRReferenceSpace,
    detectedPlaneData?: Iterable<DetectedPlaneLike>,
    detectedMeshData?: Iterable<DetectedMeshLike>,
  ): RoomScanSnapshot => {
    const roomFrame = frame as unknown as RoomFrameLike;
    const planes = Array.from(detectedPlaneData ?? roomFrame.detectedPlanes ?? []);
    const meshes = Array.from(detectedMeshData ?? roomFrame.detectedMeshes ?? []);
    const floor = getRoomFloor(frame, referenceSpace, planes);
    const floorSource = floor?.sourcePlane ?? null;

    updateFloorOutline(floor, floorSource);
    updateMeshPreviews(frame, referenceSpace, meshes);
    return { floor, planeCount: planes.length, meshCount: meshes.length };
  };

  // Hide scan visuals between XR sessions but keep reusable resources allocated until final disposal.
  const clear = (): void => {
    floorOutline.visible = false;
    activeFloorPlane = null;
    activeFloorSignature = '';
    for (const preview of meshPreviews.values()) {
      preview.object.visible = false;
    }
  };

  const dispose = (): void => {
    scene.remove(floorOutline);
    floorOutline.geometry.dispose();
    floorOutlineMaterial.dispose();
    for (const preview of meshPreviews.values()) {
      removeMeshPreview(preview);
    }
    meshPreviews.clear();
    roomMeshMaterial.dispose();
  };

  return { update, clear, dispose };
};
