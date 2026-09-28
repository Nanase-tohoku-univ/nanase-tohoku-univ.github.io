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

export interface Publication {
  /** Full author list in paper order. Own name (English or Japanese, spaces ignored) is underlined. */
  authors: string[];
  title: string;
  /** Journal or conference name. */
  venue: string;
  /** Shown as "(year)" after the venue; omit when the venue already includes it. */
  year?: string;
  doi?: string;
  /** Japanese-language entry: authors separated by "，", venue not italicised. */
  ja?: boolean;
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

  publications: [
    {
      authors: [
        'Chihiro Hosoda',
        'Kenchi Hosokawa',
        'Takuto Matsuhashi',
        'Nanase Takahashi',
        'Yu Hayashizaki',
        'Yutaka Matsuzaki',
        'Ryuta Kawashima',
      ],
      title: 'Shifting academic fates in early adolescence are marked by concurrent behavioural change rather than baseline profiles',
      venue: 'Scientific Reports',
      year: '2026',
      doi: '10.1038/s41598-026-72860-w',
    },
    {
      authors: ['高橋 那々世', '坂本 修一'],
      title: '身体傾斜の弁別に全身振動と空間参照枠が異なる音像の提示が及ぼす影響',
      venue: '日本音響学会 2026年秋季研究発表会，3-P-6',
      ja: true,
    },
  ] as Publication[],

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
