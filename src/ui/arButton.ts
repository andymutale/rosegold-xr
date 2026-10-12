import type { ArBackendKind } from '../xr/arSession';

const ENTER_AR_BUTTON_ID = 'enter-ar-button';

export type ArButtonState = 'checking' | 'unavailable' | 'ready' | 'starting' | 'active';

interface ArButtonView {
  label: string;
  ariaLabel: string;
  title: string;
  disabled: boolean;
}

const ENTER_LABEL = 'Enter augmented reality';

const getView = (state: ArButtonState, backend: ArBackendKind | undefined): ArButtonView => {
  switch (state) {
    case 'checking':
      return { label: 'Checking AR…', ariaLabel: ENTER_LABEL, title: 'Checking AR support…', disabled: true };
    case 'unavailable':
      return {
        label: 'AR unavailable',
        ariaLabel: ENTER_LABEL,
        title: 'Augmented reality is not supported in this browser/device.',
        disabled: true,
      };
    case 'starting':
      return { label: 'Starting AR…', ariaLabel: ENTER_LABEL, title: 'Starting augmented reality…', disabled: true };
    case 'active':
      // WebXR sessions are exited through the browser's own AR UI; camera-tracked AR has no system UI.
      return backend === 'zappar'
        ? { label: 'Exit AR', ariaLabel: 'Exit augmented reality', title: 'Stop the camera and return to 3D mode', disabled: false }
        : { label: 'AR active', ariaLabel: ENTER_LABEL, title: 'Augmented reality is active', disabled: true };
    case 'ready':
      return {
        label: 'Enter AR',
        ariaLabel: ENTER_LABEL,
        title: backend === 'zappar'
          ? 'Start camera-tracked augmented reality'
          : 'Start camera-based augmented reality',
        disabled: false,
      };
  }
};

/** Owns the #enter-ar-button labels so every AR backend presents the same states. */
export const createArButton = () => {
  const element = document.getElementById(ENTER_AR_BUTTON_ID) as HTMLButtonElement | null;
  if (!element) {
    throw new Error(`Missing #${ENTER_AR_BUTTON_ID} in index.html`);
  }

  const setState = (state: ArButtonState, backend?: ArBackendKind): void => {
    const view = getView(state, backend);
    element.textContent = view.label;
    element.title = view.title;
    element.disabled = view.disabled;
    element.setAttribute('aria-label', view.ariaLabel);
    element.setAttribute('aria-disabled', String(view.disabled));
  };

  setState('checking');
  return { element, setState };
};
