import * as THREE from 'three';
import * as ZapparThree from '@zappar/zappar-threejs';

import type { ArBackendOptions, ArBackendSession, ArPlacement } from './arSession';

/**
 * Zappar instant tracking is monocular, so its world units are not metres. The anchor is placed on
 * the surface this far in front of the camera (Zappar's documented default), and the board/marker
 * are sized relative to that distance rather than to WebXR's metre-based scale.
 */
const ANCHOR_CAMERA_OFFSET_Z = -5;
const ZAPPAR_BOARD_SCALE = 0.5;
const ZAPPAR_MARKER_SCALE = 2;
const NO_PLANES: readonly XRPlane[] = [];
const NO_MESHES: readonly XRMesh[] = [];

export const isZapparSupported = (): boolean => !ZapparThree.browserIncompatible();

/**
 * Camera-tracked AR for browsers without WebXR immersive-ar (notably iOS Safari).
 *
 * The Zappar camera runs in anchor-origin pose mode: the instant-tracking anchor is the world origin
 * (Y up, -Z pointing away from the user) and the camera moves around it. Until the player taps, the
 * anchor follows the surface point in front of the camera; the tap locks it, so a board placed at
 * the origin stays fixed on the floor, just like a WebXR hit-test pose.
 */
export const createZapparSession = ({ renderer, scene, onStatus, emit }: ArBackendOptions): ArBackendSession => {
  const canvas = renderer.domElement;
  let zapparCamera: ZapparThree.Camera | null = null;
  let instantTracker: ZapparThree.InstantWorldTracker | null = null;
  let presenting = false;
  let hasCameraFrame = false;
  let isAnchorLocked = false;
  let disposed = false;
  let previousBackground: THREE.Scene['background'] = null;

  // Zappar processes camera frames with the renderer's GL context, so create the pipeline lazily once.
  const ensurePipeline = (): { camera: ZapparThree.Camera; tracker: ZapparThree.InstantWorldTracker } => {
    if (!zapparCamera || !instantTracker) {
      ZapparThree.glContextSet(renderer.getContext() as WebGLRenderingContext);
      zapparCamera = new ZapparThree.Camera();
      instantTracker = new ZapparThree.InstantWorldTracker();
      zapparCamera.setPoseModeAnchorOrigin(instantTracker.anchor);
    }
    return { camera: zapparCamera, tracker: instantTracker };
  };

  // Taps on the canvas (not the HUD overlay) are the Zappar equivalent of the WebXR 'select' event.
  const handleCanvasClick = (): void => {
    if (!presenting || !hasCameraFrame) {
      return;
    }
    isAnchorLocked = true;
    emit('select');
  };

  const start = async (): Promise<void> => {
    if (presenting || disposed) {
      return;
    }

    // Must run synchronously inside the button's click handler: iOS only grants camera and
    // motion-sensor permission prompts during a user gesture.
    const granted = await ZapparThree.permissionRequest();
    if (!granted) {
      ZapparThree.permissionDeniedUI();
      onStatus('Camera and motion access are needed for AR. You can still play the 3D game.');
      return;
    }
    if (disposed) {
      return;
    }

    const { camera, tracker } = ensurePipeline();
    tracker.enabled = true;
    camera.start();
    previousBackground = scene.background;
    scene.background = camera.backgroundTexture;
    hasCameraFrame = false;
    isAnchorLocked = false;
    presenting = true;
    canvas.addEventListener('click', handleCanvasClick);
    emit('sessionstart');
    onStatus('Point the camera at the floor, then tap to place the maze.');
  };

  const end = (): void => {
    if (!presenting) {
      return;
    }

    presenting = false;
    hasCameraFrame = false;
    isAnchorLocked = false;
    canvas.removeEventListener('click', handleCanvasClick);
    zapparCamera?.stop();
    if (instantTracker) {
      instantTracker.enabled = false;
    }
    scene.background = previousBackground;
    emit('sessionend');
  };

  // Called every animation frame while presenting; Zappar has no XRFrame, so the frame argument is unused.
  const update = (): void => {
    if (!presenting || !zapparCamera || !instantTracker) {
      return;
    }

    if (!isAnchorLocked) {
      instantTracker.setAnchorPoseFromCameraOffset(0, 0, ANCHOR_CAMERA_OFFSET_Z);
    }
    zapparCamera.updateFrame(renderer);
    hasCameraFrame = true;
  };

  // In anchor-origin mode the tracked surface point is always the world origin.
  const getSurfacePlacement = (): ArPlacement | null =>
    presenting && hasCameraFrame
      ? {
          position: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
          boardScale: ZAPPAR_BOARD_SCALE,
          markerScale: ZAPPAR_MARKER_SCALE,
        }
      : null;

  const dispose = (): void => {
    canvas.removeEventListener('click', handleCanvasClick);
    if (presenting) {
      presenting = false;
      scene.background = previousBackground;
    }
    disposed = true;
    zapparCamera?.dispose();
    instantTracker?.destroy();
    zapparCamera = null;
    instantTracker = null;
  };

  return {
    kind: 'zappar',
    getBackend: () => 'zappar',
    isPresenting: () => presenting,
    getRenderCamera: () => (presenting ? zapparCamera : null),
    getReferenceSpace: () => null,
    // Zappar surfaces placement through instant tracking rather than an XRHitTestSource.
    getHitTestSource: () => null,
    getSurfacePlacement,
    // Zappar does not expose plane or mesh detection, so room fitting is unavailable on this backend.
    getDetectedPlanes: () => NO_PLANES,
    getDetectedMeshes: () => NO_MESHES,
    start,
    end,
    update,
    dispose,
  };
};
