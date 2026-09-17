/**
 * "Uncertain future" text: the letters shimmer through an animated SVG noise
 * displacement, split into RGB ghosts and now and then flicker into glitch glyphs.
 * With prefers-reduced-motion it degrades to pale italic text.
 */

const GLITCH = '▓▒░#%&@$01';
const FILTER_ID = 'uncertain-noise';
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let filterInstalled = false;
let turbulence: SVGFETurbulenceElement | null = null;
const live = new Set<HTMLElement>();

function installFilter(): void {
  if (filterInstalled) return;
  filterInstalled = true;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `
    <filter id="${FILTER_ID}" x="-10%" y="-40%" width="120%" height="180%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9 0.08" numOctaves="1" seed="1" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  document.body.append(svg);
  turbulence = svg.querySelector('feTurbulence');

  if (reduced()) return;
  let seed = 1;
  let last = 0;
  const tick = (now: number) => {
    requestAnimationFrame(tick);
    if (now - last < 70) return;
    last = now;
    seed = (seed % 997) + 1;
    turbulence?.setAttribute('seed', String(seed));
    turbulence?.setAttribute('baseFrequency', `${0.7 + Math.random() * 0.5} ${0.04 + Math.random() * 0.1}`);
    // occasional glyph flicker
    for (const el of live) {
      if (!el.isConnected) {
        live.delete(el);
        continue;
      }
      if (Math.random() > 0.18) continue;
      const chars = el.querySelectorAll<HTMLElement>('.u-ch');
      const ch = chars[Math.floor(Math.random() * chars.length)];
      if (!ch || ch.dataset.busy) continue;
      const orig = ch.textContent ?? '';
      if (!orig.trim()) continue;
      ch.dataset.busy = '1';
      ch.textContent = GLITCH[Math.floor(Math.random() * GLITCH.length)];
      ch.classList.add('u-flick');
      setTimeout(() => {
        ch.textContent = orig;
        ch.classList.remove('u-flick');
        delete ch.dataset.busy;
      }, 60 + Math.random() * 90);
    }
  };
  requestAnimationFrame(tick);
}

/** Creates an element whose text looks like an unstable, not-yet-decided future. */
export function uncertain(text: string, tag: keyof HTMLElementTagNameMap = 'span'): HTMLElement {
  installFilter();
  const el = document.createElement(tag);
  el.className = 'uncertain';
  el.setAttribute('data-text', text);
  el.title = '未確定の未来';
  const inner = document.createElement('span');
  inner.className = 'u-inner';
  for (const c of text) {
    const s = document.createElement('span');
    s.className = 'u-ch';
    s.textContent = c;
    inner.append(s);
  }
  el.append(inner);
  // screen readers get the plain text once
  el.setAttribute('aria-label', `${text}（予定）`);
  inner.setAttribute('aria-hidden', 'true');
  live.add(el);
  return el;
}

/** Turns "〜{{2027年3月}}" into text nodes with uncertain parts. */
export function withUncertain(template: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const re = /\{\{(.+?)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) frag.append(template.slice(last, m.index));
    frag.append(uncertain(m[1]));
    last = m.index + m[0].length;
  }
  if (last < template.length) frag.append(template.slice(last));
  return frag;
}
