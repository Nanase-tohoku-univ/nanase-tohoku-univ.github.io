import { h } from '../ui/dom';
import { PROFILE, type ContactItem, type TimelineItem } from './data';
import { searchSection } from './search';
import { uncertain, withUncertain } from './uncertain';

function timeline(items: TimelineItem[]): HTMLElement {
  return h(
    'ol',
    { class: 'timeline' },
    ...items.map((it) =>
      h(
        'li',
        { class: `tl-item${it.future ? ' future' : ''}${it.to === '現在' ? ' current' : ''}` },
        h('div', { class: 'tl-period' }, it.future ? uncertain(it.from) : `${it.from}${it.to ? ` – ${it.to}` : ''}`),
        h(
          'div',
          { class: 'tl-body' },
          h('div', { class: 'tl-title' }, it.future ? uncertain(it.title) : it.title),
          it.detail ? h('div', { class: 'tl-detail' }, it.detail) : null,
        ),
      ),
    ),
  );
}

function contact(c: ContactItem): HTMLElement {
  let link: HTMLElement;
  if (c.kind === 'email' && c.email) {
    // assembled at runtime so the plain address is not in the static HTML
    const addr = `${c.email[0]}@${c.email[1]}`;
    link = h('a', { href: `mailto:${addr}` }, addr);
  } else {
    link = h('a', { href: c.href ?? '#', target: '_blank', rel: 'noopener me' }, c.text ?? c.href ?? '');
  }
  return h(
    'li',
    { class: 'contact' },
    h('span', { class: 'contact-label' }, c.label, c.note ? h('small', {}, ' ', withUncertain(c.note)) : null),
    link,
  );
}

function block(id: string, en: string, ja: string, ...children: Array<Node | null>): HTMLElement {
  return h('section', { class: 'block reveal-on-scroll', id }, h('h2', { class: 'block-title' }, h('span', { class: 'en' }, en), ja), ...children);
}

/** Name card shown over the effect after the page has been torn off. */
export function heroCard(days: number): HTMLElement {
  return h(
    'div',
    { class: 'hero-card' },
    h('div', { class: 'hero-days' }, days > 0 ? withUncertain(`修了まで {{あと ${days} 日}}`) : '修了しました'),
    h('h1', { class: 'hero-name' }, h('span', { class: 'ja', lang: 'ja' }, PROFILE.nameJa), h('span', { class: 'en' }, PROFILE.nameEn)),
    h('p', { class: 'hero-headline' }, PROFILE.headline),
    h('p', { class: 'hero-lab' }, PROFILE.lab),
    h('a', { class: 'scroll-cue', href: '#education', 'aria-label': 'プロフィールへ' }, h('span', {}, 'PROFILE'), h('i')),
  );
}

export function profileSections(): HTMLElement {
  return h(
    'main',
    { class: 'profile' },
    block('education', 'EDUCATION', '学歴', timeline(PROFILE.education)),
    block('research', 'RESEARCH', '研究室', timeline(PROFILE.research)),
    block('work', 'WORK', '職歴', timeline(PROFILE.work)),
    block('contact', 'CONTACT', '連絡先', h('ul', { class: 'contacts' }, ...PROFILE.contacts.map(contact))),
    searchSection(),
    h(
      'footer',
      { class: 'site-footer' },
      h('p', {}, '背景の演出は毎日変わる日めくりカレンダーです。'),
      h(
        'p',
        {},
        h('a', { href: 'https://github.com/Nanase-tohoku-univ/Advent-Calender', target: '_blank', rel: 'noopener' }, 'Advent-Calender'),
        ' · ',
        h('a', { href: './THIRD_PARTY_NOTICES.txt', target: '_blank', rel: 'noopener' }, 'Third-party notices'),
      ),
    ),
  );
}
