import * as THREE from 'three';
import { createXRStore } from '@pmndrs/xr';

/** WebXR capabilities exposed to main.ts without exposing the XR store implementation. */
export interface ArSession {
  getHitTestSource(): XRHitTestSource | null;
  getDetectedPlanes(): readonly XRPlane[];
  getDetectedMeshes(): readonly XRMesh[];
  update(frame: XRFrame | undefined, deltaMilliseconds: number): void;
  dispose(): void;
}

interface ArSessionOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  onStatus: (message: string) => void;
}

/** Adapts the framework's vanilla XR store to the game's small session interface. */
export const createArSession = ({ renderer, scene, camera, onStatus }: ArSessionOptions): ArSession => {
  const enterArButton = document.getElementById('enter-ar-button') as HTMLButtonElement | null;
  const domOverlayRoot = document.getElementById('game-ui');
  if (!enterArButton) {
    throw new Error('Missing #enter-ar-button in index.html');
  }
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
  let arSupported = false;

  // Hit-test setup is asynchronous; keep track of the session so late promises cannot revive stale state.
  const handleArSessionStart = async (): Promise<void> => {
    const session = renderer.xr.getSession() ?? null;
    activeXrSession = session;
    enterArButton.disabled = true;
    enterArButton.textContent = 'AR active';
    hitTestSource?.cancel();
    hitTestSource = null;

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
    activeXrSession = null;
    enterArButton.disabled = !arSupported;
    enterArButton.textContent = 'Enter AR';
    onStatus('AR ended. Use the keyboard or swipe controls to play.');
  };

  const handleEnterAr = async (): Promise<void> => {
    if (enterArButton.disabled) {
      return;
    }

    enterArButton.disabled = true;
    enterArButton.textContent = 'Starting AR…';
    try {
      await xrStore.enterAR();
    } catch (error) {
      console.error('Unable to start immersive AR:', error);
      onStatus('Could not start AR. Check browser/device support and use the 3D mode meanwhile.');
    } finally {
      if (!disposed) {
        enterArButton.disabled = renderer.xr.isPresenting || !arSupported;
        enterArButton.textContent = renderer.xr.isPresenting ? 'AR active' : 'Enter AR';
      }
    }
  };

  renderer.xr.addEventListener('sessionstart', handleArSessionStart);
  renderer.xr.addEventListener('sessionend', handleArSessionEnd);
  enterArButton.addEventListener('click', handleEnterAr);

  void isArSupported().then((supported) => {
    if (disposed) {
      return;
    }
    arSupported = supported;
    enterArButton.disabled = !supported || renderer.xr.isPresenting;
    enterArButton.textContent = renderer.xr.isPresenting ? 'AR active' : supported ? 'Enter AR' : 'AR unavailable';
    enterArButton.setAttribute('aria-disabled', String(!supported || renderer.xr.isPresenting));
    enterArButton.title = supported
      ? 'Start camera-based augmented reality'
      : 'Immersive AR is not supported in this browser/device.';
    if (!supported) {
      onStatus('Immersive AR is unavailable here. You can still play the 3D game with swipe or keyboard controls.');
    }
  }).catch((error: unknown) => {
    console.error('Unable to update AR availability:', error);
    if (!disposed) {
      onStatus('Could not check AR support. Try the 3D game controls.');
    }
  });

  // The caller invokes this inside Three.js's XR animation loop, once for each available XR frame.
  const update = (frame: XRFrame | undefined, deltaMilliseconds: number): void => {
    xrStore.update(frame, deltaMilliseconds);
  };

  // Cancel the outstanding hit-test source and release all listeners/store subscriptions on page exit.
  const dispose = (): void => {
    disposed = true;
    hitTestSource?.cancel();
    hitTestSource = null;
    activeXrSession = null;
    renderer.xr.removeEventListener('sessionstart', handleArSessionStart);
    renderer.xr.removeEventListener('sessionend', handleArSessionEnd);
    enterArButton.removeEventListener('click', handleEnterAr);
    xrStore.destroy();
  };

  return {
    getHitTestSource: () => hitTestSource,
    getDetectedPlanes: () => xrStore.getState().detectedPlanes,
    getDetectedMeshes: () => xrStore.getState().detectedMeshes,
    update,
    dispose,
  };
};

const isArSupported = async (): Promise<boolean> => {
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
