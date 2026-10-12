import type * as THREE from 'three';

import { createArButton } from '../ui/arButton';
import type { SurfacePlacement } from './hitTest';
import { createWebXrSession, isWebXrArSupported } from './webXrSession';

export type ArBackendKind = 'webxr' | 'zappar';
export type ArSessionEvent = 'sessionstart' | 'sessionend' | 'select';

/** A floor pose in the active backend's world coordinates, with optional backend-specific sizing. */
export interface ArPlacement extends SurfacePlacement {
  /** Board scale for surface placement; main.ts falls back to its WebXR (metre-based) default. */
  boardScale?: number;
  /** Placement-marker scale; defaults to 1. */
  markerScale?: number;
}

/** AR capabilities exposed to main.ts without exposing which backend (WebXR or Zappar) provides them. */
export interface ArSession {
  getBackend(): ArBackendKind | null;
  isPresenting(): boolean;
  /** Camera to render with while presenting, or null to keep using the scene camera. */
  getRenderCamera(): THREE.Camera | null;
  getReferenceSpace(): XRReferenceSpace | null;
  getHitTestSource(): XRHitTestSource | null;
  getSurfacePlacement(frame: XRFrame | undefined): ArPlacement | null;
  getDetectedPlanes(): readonly XRPlane[];
  getDetectedMeshes(): readonly XRMesh[];
  /** Subscribes to session lifecycle and placement taps; returns an unsubscribe function. */
  addEventListener(type: ArSessionEvent, listener: () => void): () => void;
  update(frame: XRFrame | undefined, deltaMilliseconds: number): void;
  dispose(): void;
}

/** A concrete backend. createArSession owns the Enter AR button and drives start/end. */
export interface ArBackendSession extends Omit<ArSession, 'addEventListener'> {
  readonly kind: ArBackendKind;
  /** Must be called directly from a user gesture; backends may request permissions synchronously. */
  start(): Promise<void>;
  end(): void;
}

export interface ArSessionOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  onStatus: (message: string) => void;
}

export interface ArBackendOptions extends ArSessionOptions {
  emit: (type: ArSessionEvent) => void;
}

type ArBackendFactory = (options: ArBackendOptions) => ArBackendSession;

const NO_PLANES: readonly XRPlane[] = [];
const NO_MESHES: readonly XRMesh[] = [];

/**
 * Zappar's camera-based tracking needs a camera, a secure context and a handheld device with motion
 * sensors. The SDK is imported lazily so WebXR-capable devices never download it.
 */
const loadZapparBackend = async (): Promise<ArBackendFactory | null> => {
  if (!window.isSecureContext || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return null;
  }
  if (!window.matchMedia?.('(pointer: coarse)').matches) {
    return null;
  }

  const zappar = await import('./zapparSession');
  return zappar.isZapparSupported() ? zappar.createZapparSession : null;
};

/** Single selection point: prefer native WebXR immersive-ar, otherwise fall back to Zappar. */
export const detectArBackend = async (): Promise<ArBackendFactory | null> => {
  if (await isWebXrArSupported()) {
    return createWebXrSession;
  }

  try {
    return await loadZapparBackend();
  } catch (error) {
    console.error('Zappar AR fallback is unavailable:', error);
    return null;
  }
};

/** Detects the best AR backend and adapts it to the game's session interface. */
export const createArSession = (options: ArSessionOptions): ArSession => {
  const { onStatus } = options;
  const arButton = createArButton();
  const listeners = new Map<ArSessionEvent, Set<() => void>>();
  let backend: ArBackendSession | null = null;
  let isStarting = false;
  let disposed = false;

  const emit = (type: ArSessionEvent): void => {
    if (backend && type === 'sessionstart') {
      arButton.setState('active', backend.kind);
    } else if (backend && type === 'sessionend') {
      arButton.setState('ready', backend.kind);
    }

    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener();
    }
  };

  const handleArButtonClick = async (): Promise<void> => {
    if (!backend || isStarting || disposed) {
      return;
    }

    if (backend.isPresenting()) {
      backend.end();
      return;
    }

    isStarting = true;
    arButton.setState('starting', backend.kind);
    try {
      await backend.start();
    } catch (error) {
      console.error('Unable to start AR:', error);
      onStatus('Could not start AR. Check browser/device support and use the 3D mode meanwhile.');
    } finally {
      isStarting = false;
      if (!disposed) {
        arButton.setState(backend.isPresenting() ? 'active' : 'ready', backend.kind);
      }
    }
  };

  arButton.element.addEventListener('click', handleArButtonClick);

  void detectArBackend()
    .then((createBackend) => {
      if (disposed) {
        return;
      }
      if (!createBackend) {
        arButton.setState('unavailable');
        onStatus('AR is unavailable here. You can still play the 3D game with swipe or keyboard controls.');
        return;
      }

      backend = createBackend({ ...options, emit });
      arButton.setState(backend.isPresenting() ? 'active' : 'ready', backend.kind);
    })
    .catch((error: unknown) => {
      console.error('Unable to update AR availability:', error);
      if (!disposed) {
        arButton.setState('unavailable');
        onStatus('Could not check AR support. Try the 3D game controls.');
      }
    });

  const addEventListener = (type: ArSessionEvent, listener: () => void): (() => void) => {
    const typeListeners = listeners.get(type) ?? new Set<() => void>();
    typeListeners.add(listener);
    listeners.set(type, typeListeners);
    return () => {
      typeListeners.delete(listener);
    };
  };

  const dispose = (): void => {
    disposed = true;
    listeners.clear();
    arButton.element.removeEventListener('click', handleArButtonClick);
    backend?.dispose();
    backend = null;
  };

  return {
    getBackend: () => backend?.kind ?? null,
    isPresenting: () => backend?.isPresenting() ?? false,
    getRenderCamera: () => backend?.getRenderCamera() ?? null,
    getReferenceSpace: () => backend?.getReferenceSpace() ?? null,
    getHitTestSource: () => backend?.getHitTestSource() ?? null,
    getSurfacePlacement: (frame) => backend?.getSurfacePlacement(frame) ?? null,
    getDetectedPlanes: () => backend?.getDetectedPlanes() ?? NO_PLANES,
    getDetectedMeshes: () => backend?.getDetectedMeshes() ?? NO_MESHES,
    addEventListener,
    update: (frame, deltaMilliseconds) => backend?.update(frame, deltaMilliseconds),
    dispose,
  };
};
