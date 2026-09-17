import type { Sfx } from '../audio/sfx';
import { formatJa, parseYMD, type YMD } from '../core/date';
import type { Rng } from '../core/seed';
import { h } from './dom';

export interface PageInfo {
  date: YMD;
  days: number;
}

const MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

function pageEl(p: PageInfo): HTMLElement {
  const { y, m, d } = parseYMD(p.date);
  const dow = new Date(y, m - 1, d).getDay();
  return h(
    'div',
    { class: `page${dow === 0 ? ' sun' : dow === 6 ? ' sat' : ''}` },
    h('div', { class: 'page-holes' }, h('i'), h('i')),
    h('div', { class: 'page-head' }, h('span', {}, `${y}`), h('span', {}, MONTHS_EN[m - 1])),
    h('div', { class: 'page-date' }, `${m}/${d}`),
    h('div', { class: 'page-label' }, '修了まで あと'),
    h('div', { class: 'page-days' }, `${p.days}`, h('small', {}, '日')),
    h('div', { class: 'page-foot' }, formatJa(p.date)),
  );
}

type Variant = (page: HTMLElement, x: number, y: number) => Promise<void>;

const finished = (a: Animation) => a.finished.then(() => undefined);

const tear: Variant = async (page) => {
  const rect = page.getBoundingClientRect();
  const pts: string[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) pts.push(`${48 + (Math.random() - 0.5) * 10}% ${(i / steps) * 100}%`);
  const left = page.cloneNode(true) as HTMLElement;
  const right = page.cloneNode(true) as HTMLElement;
  left.style.clipPath = `polygon(0 0, ${pts.join(', ')}, 0 100%)`;
  right.style.clipPath = `polygon(100% 0, ${pts.join(', ')}, 100% 100%)`;
  for (const el of [left, right]) {
    el.classList.add('shard');
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    page.parentElement!.append(el);
  }
  page.style.visibility = 'hidden';
  await Promise.all([
    finished(left.animate([{ transform: 'translate(-50%,-50%)' }, { transform: 'translate(-50%,-50%) translate(-4vw, 1vh) rotate(-4deg)', offset: 0.2 }, { transform: 'translate(-50%,-50%) translate(-90vw, 60vh) rotate(-60deg)' }], { duration: 900, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' })),
    finished(right.animate([{ transform: 'translate(-50%,-50%)' }, { transform: 'translate(-50%,-50%) translate(4vw, -1vh) rotate(5deg)', offset: 0.2 }, { transform: 'translate(-50%,-50%) translate(90vw, 70vh) rotate(75deg)' }], { duration: 950, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' })),
  ]);
  left.remove();
  right.remove();
};

const shatter: Variant = async (page, x, y) => {
  const rect = page.getBoundingClientRect();
  const cols = 5;
  const rows = 7;
  const jit = () => (Math.random() - 0.5) * 8;
  const grid: Array<[number, number]> = [];
  for (let r = 0; r <= rows; r++)
    for (let c = 0; c <= cols; c++) {
      const edge = r === 0 || c === 0 || r === rows || c === cols;
      grid.push([(c / cols) * 100 + (edge ? 0 : jit()), (r / rows) * 100 + (edge ? 0 : jit())]);
    }
  const P = (r: number, c: number) => grid[r * (cols + 1) + c];
  const anims: Promise<void>[] = [];
  const cx = ((x - rect.left) / rect.width) * 100;
  const cy = ((y - rect.top) / rect.height) * 100;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      for (const tri of [
        [P(r, c), P(r, c + 1), P(r + 1, c)],
        [P(r, c + 1), P(r + 1, c + 1), P(r + 1, c)],
      ]) {
        const el = page.cloneNode(true) as HTMLElement;
        el.classList.add('shard');
        el.style.width = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
        el.style.clipPath = `polygon(${tri.map(([px, py]) => `${px}% ${py}%`).join(',')})`;
        page.parentElement!.append(el);
        const mx = tri.reduce((s, p) => s + p[0], 0) / 3;
        const my = tri.reduce((s, p) => s + p[1], 0) / 3;
        const dx = mx - cx;
        const dy = my - cy;
        const len = Math.hypot(dx, dy) + 1;
        const force = 60 + Math.random() * 90;
        const tx = (dx / len) * force;
        const ty = (dy / len) * force + 30;
        anims.push(
          finished(
            el.animate(
              [
                { transform: 'translate(-50%,-50%)', opacity: 1 },
                { transform: `translate(-50%,-50%) translate(${tx}vw, ${ty}vh) rotate3d(${Math.random()},${Math.random()},${Math.random()},${(Math.random() - 0.5) * 900}deg) scale(${0.6 + Math.random() * 0.8})`, opacity: 0 },
              ],
              { duration: 900 + Math.random() * 500, delay: len * 2, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' },
            ),
          ).then(() => el.remove()),
        );
      }
    }
  page.style.visibility = 'hidden';
  await Promise.all(anims);
};

const burn: Variant = async (page, x, y) => {
  const rect = page.getBoundingClientRect();
  const ox = x - rect.left;
  const oy = y - rect.top;
  const maxR = Math.hypot(rect.width, rect.height) * 1.1;
  const glow = h('div', { class: 'burn-glow' });
  page.append(glow);
  const start = performance.now();
  const dur = 1300;
  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const r = maxR * k * k;
      const mask = `radial-gradient(circle at ${ox}px ${oy}px, transparent ${r}px, #000 ${r + 26}px)`;
      page.style.maskImage = mask;
      page.style.webkitMaskImage = mask;
      glow.style.background = `radial-gradient(circle at ${ox}px ${oy}px, transparent ${Math.max(0, r - 6)}px, #fff6c0 ${r + 2}px, #ff8a00 ${r + 12}px, #d10000 ${r + 26}px, rgba(40,0,0,.6) ${r + 44}px, transparent ${r + 70}px)`;
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
};

const flyUp: Variant = async (page) => {
  page.style.transformOrigin = '50% 0%';
  await finished(
    page.animate(
      [
        { transform: 'translate(-50%,-50%) perspective(900px) rotateX(0deg)' },
        { transform: 'translate(-50%,-50%) perspective(900px) rotateX(-35deg) translateY(-2vh)', offset: 0.25 },
        { transform: 'translate(-50%,-50%) perspective(900px) rotateX(-170deg) translateY(-120vh) rotateZ(25deg)', opacity: 0.2 },
      ],
      { duration: 850, easing: 'cubic-bezier(.6,0,.7,.3)', fill: 'forwards' },
    ),
  );
};

const VARIANTS: Array<[Variant, (sfx: Sfx) => void]> = [
  [tear, (s) => s.tear()],
  [shatter, (s) => (s.glitch(0.15), s.boom(0.4))],
  [burn, (s) => (s.crackle(1.3), s.whoosh(1.2))],
  [flyUp, (s) => (s.tear(), s.whoosh(0.7))],
];

/**
 * Shows the stack of unopened pages. Each tap tears the front page; resolves
 * after the last one is gone.
 */
export function runRitual(root: HTMLElement, pages: PageInfo[], rng: Rng, sfx: Sfx, haptic: (p: number[]) => void, top?: HTMLElement): Promise<'torn' | 'skipped'> {
  return new Promise((resolve) => {
    const stack = h('div', { class: 'page-stack' });
    const hint = h('div', { class: 'ritual-hint' }, 'タップしてめくる');
    const counter = h('div', { class: 'ritual-count' });
    const skip = h('button', { class: 'ritual-skip' }, 'プロフィールへスキップ →');
    const wrap = h('div', { class: 'ritual' }, stack, top ?? null, counter, hint, skip);
    root.append(wrap);
    skip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      wrap.removeEventListener('pointerdown', onTap);
      wrap.classList.add('fade-out');
      setTimeout(() => wrap.remove(), 400);
      resolve('skipped');
    });

    const els = pages.map((p, i) => {
      const el = pageEl(p);
      el.style.zIndex = String(100 - i);
      el.style.setProperty('--i', String(i));
      stack.append(el);
      return el;
    });
    let idx = 0;
    let busy = false;
    const update = () => {
      counter.textContent = pages.length - idx > 1 ? `未開封 ${pages.length - idx} 枚` : '';
    };
    update();

    const onTap = async (ev: PointerEvent) => {
      if (busy) return;
      busy = true;
      sfx.unlock();
      hint.classList.add('hidden');
      const [variant, sound] = rng.pick(VARIANTS);
      sound(sfx);
      haptic([0, 40, 20, 60]);
      const el = els[idx];
      await variant(el, ev.clientX, ev.clientY);
      el.remove();
      idx++;
      update();
      busy = false;
      if (idx >= els.length) {
        wrap.removeEventListener('pointerdown', onTap);
        wrap.classList.add('fade-out');
        setTimeout(() => wrap.remove(), 400);
        resolve('torn');
      }
    };
    wrap.addEventListener('pointerdown', onTap);
  });
}
