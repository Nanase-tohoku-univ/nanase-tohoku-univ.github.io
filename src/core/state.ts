import type { YMD } from './date';
import { defaultMilestones, type Milestone } from './milestones';

export interface Settings {
  graduationDate: YMD;
  /** Day the journey started; used for the progress ring and the page corridor. */
  startDate: YMD;
  muted: boolean;
  haptics: boolean;
  /** HH:MM or '' for no daily reminder (Android only). */
  reminderTime: string;
}

export interface AppState {
  version: 1;
  settings: Settings;
  milestones: Milestone[];
  /** Days whose page has been torn off. */
  opened: YMD[];
}

export const DEFAULT_GRADUATION: YMD = '2027-03-25';
export const DEFAULT_START: YMD = '2026-09-17';

export function defaultState(): AppState {
  return {
    version: 1,
    settings: {
      graduationDate: DEFAULT_GRADUATION,
      startDate: DEFAULT_START,
      muted: false,
      haptics: true,
      reminderTime: '',
    },
    milestones: defaultMilestones(DEFAULT_GRADUATION),
    opened: [],
  };
}

/** Accepts anything parsed from storage and returns a well-formed state. */
export function normalizeState(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  return {
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    milestones: Array.isArray(r.milestones) ? r.milestones : base.milestones,
    opened: Array.isArray(r.opened) ? [...new Set(r.opened)].sort() : [],
  };
}
