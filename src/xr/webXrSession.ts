import { createXRStore } from '@pmndrs/xr';

import type { ArBackendOptions, ArBackendSession, ArPlacement } from './arSession';
import { getSurfaceHit, getSurfacePlacement } from './hitTest';

export const isWebXrArSupported = async (): Promise<boolean> => {
  if (!('xr' in navigator) || !navigator.xr) {
    return false;
  }

  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch (error) {
    console.error('Immersive AR support check failed:', error);
    return false;
  }
};

/** Adapts the framework's vanilla XR store to the game's small session interface. */
export const createWebXrSession = ({ renderer, scene, camera, onStatus, emit }: ArBackendOptions): ArBackendSession => {
  const domOverlayRoot = document.getElementById('game-ui');
  if (!domOverlayRoot) {
    throw new Error('Missing #game-ui DOM overlay in index.html');
  }

  // This is the vanilla Three.js entry point from the supplied @pmndrs/xr repo.
  // Plane, mesh and hit-test features are optional: devices that lack room
  // understanding can still enter AR and use the existing hit-test fallback.
  const xrStore = createXRStore(renderer.domElement, scene, () => camera, renderer.xr, {
    offerSession: false,
    enterGrantedSession: false,
    emulate: false,
    handTracking: false,
    bodyTracking: false,
    anchors: false,
    layers: false,
    hitTest: true,
    planeDetection: true,
    meshDetection: true,
    // The XR DOM overlay must be a child element, never document.body itself.
    domOverlay: domOverlayRoot,
    hand: false,
    controller: false,
    gaze: false,
    screenInput: false,
    transientPointer: false,
    htmlInput: false,
  });

  let hitTestSource: XRHitTestSource | null = null;
  let activeXrSession: XRSession | null = null;
  let disposed = false;

  // A screen tap in handheld AR arrives as the XR session's 'select' event.
  const handleSelect = (): void => emit('select');

  // Hit-test setup is asynchronous; keep track of the session so late promises cannot revive stale state.
  const handleArSessionStart = async (): Promise<void> => {
    const session = renderer.xr.getSession() ?? null;
    activeXrSession?.removeEventListener('select', handleSelect);
    activeXrSession = session;
    activeXrSession?.addEventListener('select', handleSelect);
    hitTestSource?.cancel();
    hitTestSource = null;
    emit('sessionstart');

    if (!session) {
      onStatus('AR started, but no XR session was available.');
      return;
    }

    if (typeof session.requestHitTestSource !== 'function') {
      onStatus('Hit testing is unavailable. The room scanner may still detect the floor.');
      return;
    }

    try {
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const nextHitTestSource = await session.requestHitTestSource({ space: viewerSpace });

      if (!nextHitTestSource) {
        onStatus('Hit testing is unavailable. The room scanner may still detect the floor.');
        return;
      }

      if (activeXrSession !== session || disposed) {
        nextHitTestSource.cancel();
        return;
      }

      hitTestSource = nextHitTestSource;
      onStatus('Move the phone slowly to scan the floor. Tap to fit the maze inside it.');
    } catch (error) {
      console.error('Unable to initialize AR hit testing:', error);
      hitTestSource?.cancel();
      hitTestSource = null;
      onStatus('Hit testing failed. The room scanner may still work on this device.');
    }
  };

  const handleArSessionEnd = (): void => {
    hitTestSource?.cancel();
    hitTestSource = null;
    activeXrSession?.removeEventListener('select', handleSelect);
    activeXrSession = null;
    emit('sessionend');
  };

  renderer.xr.addEventListener('sessionstart', handleArSessionStart);
  renderer.xr.addEventListener('sessionend', handleArSessionEnd);

  const start = async (): Promise<void> => {
    await xrStore.enterAR();
  };

  const end = (): void => {
    void renderer.xr.getSession()?.end();
  };

  const getSurfacePlacementForFrame = (frame: XRFrame | undefined): ArPlacement | null => {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const hit = getSurfaceHit({ frame, hitTestSource, referenceSpace });
    return hit && referenceSpace ? getSurfacePlacement({ hit, referenceSpace }) : null;
  };

  // The caller invokes this inside Three.js's XR animation loop, once for each available XR frame.
  const update = (frame: XRFrame | undefined, deltaMilliseconds: number): void => {
    xrStore.update(frame, deltaMilliseconds);
  };

  // Cancel the outstanding hit-test source and release all listeners/store subscriptions on page exit.
  const dispose = (): void => {
    disposed = true;
    hitTestSource?.cancel();
    hitTestSource = null;
    activeXrSession?.removeEventListener('select', handleSelect);
    activeXrSession = null;
    renderer.xr.removeEventListener('sessionstart', handleArSessionStart);
    renderer.xr.removeEventListener('sessionend', handleArSessionEnd);
    xrStore.destroy();
  };

  return {
    kind: 'webxr',
    getBackend: () => 'webxr',
    isPresenting: () => renderer.xr.isPresenting,
    getRenderCamera: () => null,
    getReferenceSpace: () => renderer.xr.getReferenceSpace(),
    getHitTestSource: () => hitTestSource,
    getSurfacePlacement: getSurfacePlacementForFrame,
    getDetectedPlanes: () => xrStore.getState().detectedPlanes,
    getDetectedMeshes: () => xrStore.getState().detectedMeshes,
    start,
    end,
    update,
    dispose,
  };
};
