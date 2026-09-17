import { h } from '../ui/dom';
import { SEARCH_ENGINE_ID, SEARCH_QUERY } from './data';

interface CseElement {
  execute(query: string): void;
}
declare global {
  interface Window {
    __gcse?: { parsetags: string; initializationCallback: () => void };
    google?: {
      search: {
        cse: {
          element: {
            render(opts: { div: string; tag: string; gname: string; attributes?: Record<string, unknown> }): void;
            getElement(gname: string): CseElement | undefined;
          };
        };
      };
    };
  }
}

const GOOGLE_URL = `https://www.google.com/search?q=${encodeURIComponent(SEARCH_QUERY)}`;

/**
 * Live web results for the owner's name, fetched when the page is opened, via the
 * Google Programmable Search Engine element (the supported way to embed Google results).
 */
export function searchSection(): HTMLElement {
  const results = h('div', { id: 'gcse-results', class: 'search-results' });
  const status = h('p', { class: 'search-status' }, '検索中…');
  const section = h(
    'section',
    { class: 'block search', id: 'search' },
    h('h2', { class: 'block-title' }, h('span', { class: 'en' }, 'ON THE WEB'), 'Web上の「髙橋那々世」'),
    h('p', { class: 'block-lead' }, 'このページを開いた瞬間に ', h('code', {}, SEARCH_QUERY), ' で検索した結果です。同姓同名の方の情報が含まれる場合があります。'),
    status,
    results,
    h('a', { class: 'btn ghost small', href: GOOGLE_URL, target: '_blank', rel: 'noopener' }, 'Google で直接検索する ↗'),
  );

  if (!SEARCH_ENGINE_ID) {
    status.textContent = '（検索エンジンIDが未設定のため、ライブ検索はオフです）';
    return section;
  }

  const run = () => {
    const g = window.google?.search.cse.element;
    if (!g) return;
    g.render({ div: 'gcse-results', tag: 'searchresults-only', gname: 'profile', attributes: { linkTarget: '_blank', enableHistory: false } });
    g.getElement('profile')?.execute(SEARCH_QUERY);
    status.remove();
  };
  window.__gcse = {
    parsetags: 'explicit',
    initializationCallback: () => {
      if (document.readyState === 'complete') run();
      else window.addEventListener('load', run, { once: true });
    },
  };
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(SEARCH_ENGINE_ID)}`;
  script.onerror = () => {
    status.textContent = '検索結果を読み込めませんでした（広告ブロッカー等が原因の場合があります）';
  };
  document.head.append(script);
  return section;
}
