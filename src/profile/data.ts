/** All profile content lives here. Edit this file to update the site. */

export interface TimelineItem {
  /** e.g. "2021.04" */
  from: string;
  /** "現在" for ongoing, or a period end such as "2025.03" */
  to?: string;
  title: string;
  detail?: string;
  /** Not yet happened — rendered with the "uncertain future" noise effect. */
  future?: boolean;
}

export interface ContactItem {
  label: string;
  /** Shown after the label, e.g. validity period. Wrap uncertain parts in {{ }}. */
  note?: string;
  kind: 'email' | 'link';
  /** For emails: [user, domain] so the address is not in the HTML source as-is. */
  email?: [string, string];
  href?: string;
  text?: string;
}

export const PROFILE = {
  nameJa: '髙橋那々世',
  nameJaSearchVariants: ['高橋那々世', '髙橋那々世'],
  nameEn: 'Nanase Takahashi',
  headline: '東北大学大学院 情報科学研究科 システム情報科学専攻 修士課程',
  lab: '先端音情報システム研究室',
  graduationDate: '2027-03-25',

  education: [
    { from: '2021.04', to: '2025.03', title: '東北大学 工学部 電気情報物理工学科' },
    { from: '2025.04', to: '現在', title: '東北大学大学院 情報科学研究科', detail: 'システム情報科学専攻 修士課程' },
    { from: '2027.03', title: '東北大学大学院 情報科学研究科 修了予定', future: true },
  ] as TimelineItem[],

  research: [{ from: '2024.04', to: '現在', title: '先端音情報システム研究室' }] as TimelineItem[],

  work: [{ from: '2022.09', to: '現在', title: '細田千尋研究室', detail: 'アドミニストレイティブ・アシスタント' }] as TimelineItem[],

  contacts: [
    { label: 'Official E-Mail', note: '〜{{2027年3月}}', kind: 'email', email: ['takahashi.nanase.q6', 'dc.tohoku.ac.jp'] },
    { label: 'Private E-Mail', kind: 'email', email: ['nanase.t0322', 'gmail.com'] },
    { label: 'X (Twitter)', kind: 'link', href: 'https://x.com/natrium_tantal', text: '@natrium_tantal' },
    { label: 'GitHub', kind: 'link', href: 'https://github.com/Nanase-tohoku-univ', text: 'Nanase-tohoku-univ' },
  ] as ContactItem[],
};

/**
 * Google Programmable Search Engine ID ("cx").
 * Create one at https://programmablesearchengine.google.com/ with "Search the entire web" enabled
 * and paste the ID here. Leave empty to show a plain "search on Google" link instead.
 */
export const SEARCH_ENGINE_ID = '';

export const SEARCH_QUERY = PROFILE.nameJaSearchVariants.map((n) => `"${n}"`).join(' OR ');
