import './styles.css';
import './profile/profile.css';
import { Sfx } from './audio/sfx';
import { loadState, saveState, vibrate } from './bridge/native';
import { dayProfile, type DayProfile } from './core/daily';
import { addDays, daysBetween, now, pad2, remainingUntil, toYMD } from './core/date';
import { rngFor } from './core/seed';
import { ALL_EFFECTS, EFFECTS, findEffect } from './effects/registry';
import { pickPalette } from './effects/palette';
import { Stage } from './effects/stage';
import { h } from './ui/dom';
import { runRitual, type PageInfo } from './ui/ritual';
import { PROFILE } from './profile/data';
import { heroCard, profileSections } from './profile/sections';

const params = new URLSearchParams(location.search);
const forcedEffect = params.get('effect');
const skipRitual = params.has('skip');

// Visitor state lives in localStorage; the owner's schedule comes from profile/data.ts.
const state = loadState();
state.settings.graduationDate = PROFILE.graduationDate;
state.milestones = [];

const sfx = new Sfx();
const canvas = document.getElementById('fx') as HTMLCanvasElement;
const app = document.getElementById('app')!;
const stage = new Stage(canvas);

let today = toYMD(now());
let profile: DayProfile = computeProfile();

function computeProfile(): DayProfile {
  return dayProfile(today, state, EFFECTS.map((e) => e.id), forcedEffect, ALL_EFFECTS.map((e) => e.id));
}

const haptic = (pattern: number[]) => vibrate(pattern);

// ---------- layout ----------
const hudDays = h('b', { class: 'hud-days' });
const hudClock = h('span', { class: 'hud-clock' });
const ring = h('div', { class: 'hud-ring' });
const muteBtn = h('button', { class: 'icon-btn', 'aria-label': '効果音' });
const replayBtn = h('button', { class: 'icon-btn', 'aria-label': 'もう一度めくる', title: 'もう一度めくる' }, '↺');
const hud = h(
  'header',
  { class: 'hud' },
  h('div', { class: 'hud-left' }, ring, h('div', {}, h('div', { class: 'hud-sub' }, '修了まで'), h('div', {}, hudDays, h('small', {}, '日'), hudClock))),
  h('div', { class: 'hud-right' }, replayBtn, muteBtn),
);

const heroSlot = h('div', { class: 'hero-slot' });
const hero = h('section', { class: 'hero', 'aria-label': PROFILE.nameEn }, heroSlot);
const sections = profileSections();
app.append(hud, hero, sections);

function renderMute(): void {
  muteBtn.textContent = state.settings.muted ? '🔇' : '🔊';
  sfx.muted = state.settings.muted;
}
muteBtn.addEventListener('click', () => {
  state.settings.muted = !state.settings.muted;
  sfx.unlock();
  saveState(state);
  renderMute();
});
replayBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  void begin(true);
});

function tickClock(): void {
  const t = now();
  const ymd = toYMD(t);
  if (ymd !== today) {
    today = ymd;
    profile = computeProfile();
  }
  const r = remainingUntil(t, PROFILE.graduationDate);
  hudDays.textContent = String(Math.max(0, profile.days));
  hudClock.textContent = profile.days > 0 ? ` ${pad2(r.hours)}:${pad2(r.minutes)}:${pad2(r.seconds)}` : '';
  ring.style.setProperty('--p', String(profile.progress));
}

// ---------- effect ----------
let playing = false;

function showHero(): void {
  heroSlot.replaceChildren(heroCard(profile.days));
  requestAnimationFrame(() => heroSlot.classList.add('shown'));
}

function playEffect(): void {
  const factory = findEffect(profile.effectId) ?? EFFECTS[0];
  const palette = pickPalette(rngFor(`pal:${profile.seedKey}`));
  document.documentElement.style.setProperty('--accent', palette.css.a);
  document.documentElement.style.setProperty('--accent2', palette.css.b);
  heroSlot.classList.remove('shown');
  playing = true;
  stage.play(factory, {
    rng: rngFor(profile.seedKey),
    palette,
    intensity: profile.intensity,
    quality: stage.quality,
    days: Math.max(0, profile.days),
    label: profile.days > 0 ? String(profile.days) : '修了',
    caption: 'DAYS LEFT',
    openedCount: state.opened.length,
    totalDays: profile.totalDays,
    sfx,
    haptic,
    onReveal: showHero,
    onDone: () => {
      playing = false;
    },
  });
  const seek = Number(params.get('seek'));
  if (seek > 0) stage.seek(seek);
}

function unopenedPages(): PageInfo[] {
  const last = state.opened.filter((d) => d < today).pop();
  const from = last ?? addDays(today, -1);
  const first = daysBetween(from, today) > 7 ? addDays(today, -7) : from;
  const pages: PageInfo[] = [];
  for (let d = first; d < today; d = addDays(d, 1)) pages.push({ date: d, days: daysBetween(d, PROFILE.graduationDate) });
  return pages.length ? pages : [{ date: addDays(today, -1), days: profile.days + 1 }];
}

async function begin(withRitual = !state.opened.includes(today)): Promise<void> {
  stage.clear();
  heroSlot.classList.remove('shown');
  document.body.classList.toggle('locked', withRitual && !skipRitual);
  hud.classList.toggle('dim', withRitual);
  let result: 'torn' | 'skipped' = 'torn';
  if (withRitual && !skipRitual) {
    const intro = h('div', { class: 'ritual-intro' }, h('span', { class: 'ja' }, PROFILE.nameJa), h('span', { class: 'en' }, PROFILE.nameEn));
    result = await runRitual(app, unopenedPages(), rngFor(`ritual:${today}:${Date.now()}`), sfx, haptic, intro);
  }
  document.body.classList.remove('locked');
  hud.classList.remove('dim');
  if (withRitual && result === 'torn' && !state.opened.includes(today)) {
    state.opened.push(today);
    state.opened.sort();
    saveState(state);
  }
  playEffect();
  if (result === 'skipped') {
    showHero();
    document.getElementById('education')?.scrollIntoView({ behavior: 'smooth' });
  }
}

(window as unknown as { __stage: Stage }).__stage = stage;

// ---------- interaction ----------
hero.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (playing && !(e.target as HTMLElement).closest('a,button')) stage.tap(e.clientX, e.clientY);
});

// Dim the background effect while reading, and pause it once it is fully covered.
let paused = false;
function onScroll(): void {
  const k = Math.min(1, window.scrollY / (window.innerHeight * 0.9));
  hud.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.5);
  canvas.style.opacity = String(1 - k * 0.65);
  canvas.style.filter = k > 0.01 ? `blur(${(k * 6).toFixed(1)}px) saturate(${1 - k * 0.3})` : '';
  const shouldPause = window.scrollY > window.innerHeight * 1.6;
  if (shouldPause !== paused) {
    paused = shouldPause;
    if (paused) stage.stop();
    else stage.start();
  }
}
window.addEventListener('scroll', onScroll, { passive: true });

// Fade sections in as they enter the viewport.
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add('visible');
  },
  { threshold: 0.15 },
);
document.querySelectorAll('.reveal-on-scroll').forEach((el) => io.observe(el));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stage.stop();
  else if (!paused) stage.start();
});

renderMute();
tickClock();
setInterval(tickClock, 1000);
void begin();
