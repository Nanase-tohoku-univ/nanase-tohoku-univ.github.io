import { daysBetween, type YMD } from './date';

export type MilestoneCategory = 'review' | 'deadline' | 'presentation' | 'ceremony' | 'other';

export interface Milestone {
  id: string;
  title: string;
  /** null = 日付未定 */
  date: YMD | null;
  category: MilestoneCategory;
  done: boolean;
  memo: string;
}

export const CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  review: '審査',
  deadline: '締切',
  presentation: '発表',
  ceremony: '式典',
  other: 'その他',
};

export const CATEGORY_ICONS: Record<MilestoneCategory, string> = {
  review: '⚖️',
  deadline: '⏰',
  presentation: '🎤',
  ceremony: '🎓',
  other: '📌',
};

export function newId(): string {
  return `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function defaultMilestones(graduationDate: YMD): Milestone[] {
  return [
    { id: 'preset-prelim', title: '修士論文 予備審査', date: null, category: 'review', done: false, memo: '' },
    { id: 'preset-submit', title: '修士論文 提出', date: null, category: 'deadline', done: false, memo: '' },
    { id: 'preset-final', title: '修士論文 本審査', date: null, category: 'review', done: false, memo: '' },
    { id: 'preset-ceremony', title: '学位記授与式', date: graduationDate, category: 'ceremony', done: false, memo: '' },
  ];
}

/** Dated milestones in chronological order, then undated ones in their original order. */
export function sortMilestones(list: readonly Milestone[]): Milestone[] {
  const dated = list.filter((m) => m.date !== null);
  const undated = list.filter((m) => m.date === null);
  dated.sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0));
  return [...dated, ...undated];
}

/** The earliest milestone on or after `today` that is not done. */
export function nextMilestone(list: readonly Milestone[], today: YMD): Milestone | null {
  return sortMilestones(list).find((m) => m.date !== null && !m.done && m.date >= today) ?? null;
}

export function milestonesOn(list: readonly Milestone[], day: YMD): Milestone[] {
  return list.filter((m) => m.date === day);
}

export function daysUntil(m: Milestone, today: YMD): number | null {
  return m.date === null ? null : daysBetween(today, m.date);
}
