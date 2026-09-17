import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isValidYMD, now, remainingUntil, toYMD } from '../src/core/date';
import { effectIndexForDay, rngFor } from '../src/core/seed';
import { defaultMilestones, nextMilestone, sortMilestones, type Milestone } from '../src/core/milestones';
import { normalizeState } from '../src/core/state';
import { dayProfile } from '../src/core/daily';

describe('date', () => {
  it('counts days to graduation', () => {
    expect(daysBetween('2026-09-17', '2027-03-25')).toBe(189);
    expect(daysBetween('2027-03-25', '2027-03-25')).toBe(0);
    expect(daysBetween('2027-03-26', '2027-03-25')).toBe(-1);
  });

  it('handles month and year boundaries (2027 is not a leap year)', () => {
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isValidYMD('2027-02-29')).toBe(false);
    expect(isValidYMD('2028-02-29')).toBe(true);
  });

  it('splits remaining time and clamps at zero', () => {
    const justBefore = new Date(2027, 2, 24, 23, 59, 59);
    expect(remainingUntil(justBefore, '2027-03-25')).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 1 });
    const midnight = new Date(2027, 2, 24, 0, 0, 0);
    expect(remainingUntil(midnight, '2027-03-25')).toMatchObject({ days: 1, hours: 0, minutes: 0, seconds: 0 });
    expect(remainingUntil(new Date(2027, 2, 26), '2027-03-25').totalMs).toBe(0);
  });

  it('supports ?date= override', () => {
    expect(toYMD(now('?date=2027-03-24'))).toBe('2027-03-24');
    expect(toYMD(now('?date=bogus'))).toBe(toYMD(new Date()));
  });
});

describe('seed', () => {
  it('is deterministic', () => {
    const a = rngFor('2026-09-17');
    const b = rngFor('2026-09-17');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('never repeats an effect on consecutive days and uses every effect each cycle', () => {
    const n = 16;
    let prev = -1;
    for (let day = 0; day < 1000; day++) {
      const idx = effectIndexForDay(day, n);
      expect(idx).not.toBe(prev);
      prev = idx;
    }
    for (let cycle = 0; cycle < 10; cycle++) {
      const seen = new Set<number>();
      for (let i = 0; i < n; i++) seen.add(effectIndexForDay(cycle * n + i, n));
      expect(seen.size).toBe(n);
    }
  });
});

describe('milestones', () => {
  const list: Milestone[] = [
    { id: 'a', title: 'undated', date: null, category: 'review', done: false, memo: '' },
    { id: 'b', title: 'late', date: '2027-02-10', category: 'review', done: false, memo: '' },
    { id: 'c', title: 'early', date: '2027-01-15', category: 'deadline', done: false, memo: '' },
    { id: 'd', title: 'past', date: '2026-09-01', category: 'other', done: false, memo: '' },
  ];

  it('sorts dated first, undated last', () => {
    expect(sortMilestones(list).map((m) => m.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('finds the next undone milestone', () => {
    expect(nextMilestone(list, '2026-09-17')?.id).toBe('c');
    const withDone = list.map((m) => (m.id === 'c' ? { ...m, done: true } : m));
    expect(nextMilestone(withDone, '2026-09-17')?.id).toBe('b');
    expect(nextMilestone(list, '2027-01-15')?.id).toBe('c');
  });

  it('ships presets with undated reviews', () => {
    const presets = defaultMilestones('2027-03-25');
    expect(presets.filter((m) => m.date === null)).toHaveLength(3);
  });
});

describe('dayProfile', () => {
  const ids = ['a', 'b', 'c', 'supernova', 'fireworks'];
  const all = [...ids, 'finale'];

  it('counts down and grows intensity toward graduation', () => {
    const s = normalizeState(null);
    const first = dayProfile('2026-09-17', s, ids, null, all);
    const late = dayProfile('2027-03-01', s, ids, null, all);
    expect(first.days).toBe(189);
    expect(late.intensity).toBeGreaterThan(first.intensity);
  });

  it('uses special effects on special days', () => {
    const s = normalizeState(null);
    expect(dayProfile('2027-03-25', s, ids, null, all)).toMatchObject({ days: 0, effectId: 'finale', special: { kind: 'graduation' } });
    expect(dayProfile('2026-12-15', s, ids, null, all).special?.kind).toBe('round'); // 100 days left
    s.milestones[0].date = '2027-01-20';
    expect(dayProfile('2027-01-20', s, ids, null, all)).toMatchObject({ effectId: 'fireworks', special: { kind: 'milestone-day' } });
    expect(dayProfile('2027-01-19', s, ids, null, all).special?.kind).toBe('milestone-eve');
  });

  it('honors a forced effect', () => {
    expect(dayProfile('2026-10-01', normalizeState(null), ids, 'c', all).effectId).toBe('c');
  });
});

describe('state', () => {
  it('normalizes garbage', () => {
    expect(normalizeState('nope').settings.graduationDate).toBe('2027-03-25');
    const s = normalizeState({ opened: ['2026-09-18', '2026-09-17', '2026-09-17'] });
    expect(s.opened).toEqual(['2026-09-17', '2026-09-18']);
  });
});
