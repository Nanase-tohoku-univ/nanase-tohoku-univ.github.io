import { normalizeState, type AppState } from '../core/state';

/** Interface exposed by android/app/.../bridge/NativeBridge.kt as `window.AndroidBridge`. */
interface AndroidBridge {
  loadState(): string;
  saveState(json: string): void;
  vibrate(patternCsv: string): void;
  setKeepScreenOn(on: boolean): void;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridge;
  }
}

const LS_KEY = 'graduation-advent-state';

export const isAndroid = (): boolean => typeof window !== 'undefined' && !!window.AndroidBridge;

export function loadState(): AppState {
  try {
    const json = window.AndroidBridge ? window.AndroidBridge.loadState() : localStorage.getItem(LS_KEY);
    return normalizeState(json ? JSON.parse(json) : null);
  } catch {
    return normalizeState(null);
  }
}

export function saveState(state: AppState): void {
  const json = JSON.stringify(state);
  try {
    if (window.AndroidBridge) window.AndroidBridge.saveState(json);
    else localStorage.setItem(LS_KEY, json);
  } catch {
    // storage unavailable (private mode etc.) — state stays in memory for this session
  }
}

export function vibrate(pattern: number[]): void {
  try {
    if (window.AndroidBridge) window.AndroidBridge.vibrate(pattern.join(','));
    else navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}
