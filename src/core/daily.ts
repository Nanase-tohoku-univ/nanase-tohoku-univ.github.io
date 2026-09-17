import { addDays, daysBetween, parseYMD, type YMD } from './date';
import { milestonesOn, nextMilestone, type Milestone } from './milestones';
import { effectIndexForDay, rngFor } from './seed';
import type { AppState } from './state';

export type SpecialKind =
  | 'graduation'
  | 'after'
  | 'milestone-day'
  | 'milestone-eve'
  | 'round'
  | 'final-week'
  | 'christmas'
  | 'new-year-eve'
  | 'new-year';

export interface Special {
  kind: SpecialKind;
  title: string;
  subtitle: string;
  /** Effect id that should play instead of the daily rotation, if any. */
  effect?: string;
}

export interface DayProfile {
  today: YMD;
  days: number;
  totalDays: number;
  /** 0 at start date → 1 on graduation day */
  progress: number;
  /** Drives particle counts, shake, saturation. 0.35 .. 1 */
  intensity: number;
  effectId: string;
  special: Special | null;
  message: string;
  next: Milestone | null;
  nextDays: number | null;
  seedKey: string;
}

const EPOCH: YMD = '2026-01-01';

const MESSAGES = [
  '今日の1行は、未来の1章。',
  '実験が失敗した日も、カレンダーは1枚めくれる。',
  '査読者2号も、きっと今日は優しい。',
  'コーヒーを淹れて、図を1枚だけ直そう。',
  'LaTeXのエラーは、あなたの実力とは無関係です。',
  '昨日の自分より1ステップ先へ。',
  '研究は長距離走。今日は給水ポイント。',
  '参考文献を1本読めば、世界が1ミリ広がる。',
  'Overfull \\hbox は見なかったことにしてもいい日。',
  '完璧より提出。',
  '指導教員の「いいね」は伝説のアイテム。',
  '進捗ゼロの日も、生きていれば進捗です。',
  '今日のあなたは、昨日のあなたの共同研究者。',
  'バックアップは取りましたか？ 取りましょう。',
  '図のフォントサイズ、あと2pt大きくしよう。',
  'ゼミ資料は、未来の自分への手紙。',
  '仮説が崩れたら、それは新しい発見の入口。',
  'よく寝た研究者が、いちばん強い。',
  '先行研究の山の上に、あなたの旗を立てよう。',
  '今日も英語論文と和解しよう。',
  'git commit -m "今日もえらい"',
  'スライド1枚ぶん、修了に近づいた。',
  'わからないことを聞けるのは、学生の特権。',
  '結論から書くと、結論が見えてくる。',
  '修了式の自分が、今日の自分に手を振っている。',
  '有意差がなくても、あなたの価値は有意。',
  '深呼吸。Ctrl+S。',
  'たまには研究室の外の空を見よう。',
  'Abstractは最後に書けばいい。',
  '今日の小さな「できた」を数えよう。',
];

function specialFor(today: YMD, days: number, milestones: readonly Milestone[]): Special | null {
  if (days === 0) return { kind: 'graduation', title: '修了の日', subtitle: 'ここまで本当にお疲れさまでした', effect: 'finale' };
  if (days < 0) return { kind: 'after', title: '修了おめでとう', subtitle: `修了から${-days}日`, effect: 'finale' };

  const todays = milestonesOn(milestones, today).filter((m) => m.category !== 'ceremony');
  if (todays.length) return { kind: 'milestone-day', title: `本日 ${todays[0].title}`, subtitle: '全力を出し切ろう！', effect: 'fireworks' };
  const tomorrow = milestonesOn(milestones, addDays(today, 1)).filter((m) => m.category !== 'ceremony');
  if (tomorrow.length) return { kind: 'milestone-eve', title: `明日 ${tomorrow[0].title}`, subtitle: '準備は万全。今夜はよく寝よう', effect: 'supernova' };

  if ([150, 100, 50, 30, 10].includes(days)) return { kind: 'round', title: `残り${days}日`, subtitle: 'キリ番突破！', effect: 'supernova' };
  if (days <= 7) return { kind: 'final-week', title: `ラスト${days}日`, subtitle: 'ファイナルカウントダウン' };

  const { m, d } = parseYMD(today);
  if (m === 12 && d === 25) return { kind: 'christmas', title: 'Merry Christmas', subtitle: '研究室にもサンタは来る', effect: 'confetti' };
  if (m === 12 && d === 31) return { kind: 'new-year-eve', title: '大晦日', subtitle: '修了の年がやってくる', effect: 'fireworks' };
  if (m === 1 && d === 1) return { kind: 'new-year', title: '謹賀新年', subtitle: '2027年、修了の年', effect: 'fireworks' };
  return null;
}

/**
 * `rotationIds` are the effects in the daily shuffle bag; `allIds` additionally
 * contains special-day-only effects that may be selected by a special or forced.
 */
export function dayProfile(today: YMD, state: AppState, rotationIds: readonly string[], forcedEffect?: string | null, allIds: readonly string[] = rotationIds): DayProfile {
  const { graduationDate, startDate } = state.settings;
  const days = daysBetween(today, graduationDate);
  const totalDays = Math.max(1, daysBetween(startDate, graduationDate));
  const progress = Math.min(1, Math.max(0, 1 - days / totalDays));
  const special = specialFor(today, days, state.milestones);

  let intensity = 0.35 + 0.65 * Math.pow(progress, 1.6);
  if (special) intensity = Math.max(intensity, special.kind === 'final-week' || special.kind === 'graduation' ? 1 : 0.8);

  let effectId = rotationIds[effectIndexForDay(daysBetween(EPOCH, today), rotationIds.length)];
  if (special?.effect && allIds.includes(special.effect)) effectId = special.effect;
  if (forcedEffect && allIds.includes(forcedEffect)) effectId = forcedEffect;

  const rng = rngFor(`msg:${today}`);
  const next = nextMilestone(state.milestones, today);
  const specialMessage: Partial<Record<SpecialKind, string>> = {
    graduation: '修了おめでとうございます！ 最高の日に。',
    after: '修士、おめでとう。新しい章へ。',
    'milestone-day': '今日のために積み上げてきた。いってらっしゃい！',
    'milestone-eve': '準備は十分。あとは寝るだけ。',
    'final-week': days === 1 ? 'いよいよ明日、修了。' : `残り${days}日。ゴールはもう見えている。`,
  };
  return {
    today,
    days,
    totalDays,
    progress,
    intensity,
    effectId,
    special,
    message: (special && specialMessage[special.kind]) || rng.pick(MESSAGES),
    next,
    nextDays: next?.date ? daysBetween(today, next.date) : null,
    seedKey: `fx:${today}`,
  };
}
