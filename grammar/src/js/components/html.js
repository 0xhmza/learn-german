// Small HTML builders shared by all views. Everything that comes from
// content goes through esc() or prose().
import { getLang, t, num } from '../i18n/index.js';
import { arabicLocale } from '../i18n/ar.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const plainText = value => value.replaceAll('`', '');
export const de = value => `<bdi lang="de" dir="ltr">${esc(value)}</bdi>`;
export const ar = value => `<span lang="ar" dir="rtl">${esc(value)}</span>`;
export const germanLine = value => `<div class="de" lang="de" dir="ltr">${esc(value)}</div>`;

// Explanatory text: `backticks` mark German terms. In Arabic text every
// run of Latin letters is isolated as German so the bidi order holds.
export function prose(value) {
  const lang = getLang();
  return String(value ?? '').split('`').map((part, i) => {
    if (i % 2) return `<bdi class="term" lang="de" dir="ltr">${esc(part)}</bdi>`;
    if (lang === 'de') return esc(part);
    if (/[A-Za-z]/.test(part) && !/\p{Script=Arabic}/u.test(part)) return de(part);
    return part.split(/([A-Za-zÄÖÜäöüẞß][A-Za-zÄÖÜäöüẞß0-9 .,:;!?…/„“’'()–—-]*[A-Za-zÄÖÜäöüẞß0-9]|[A-Za-zÄÖÜäöüẞß])/g)
      .map((piece, j) => (j % 2 ? de(piece) : esc(piece))).join('');
  }).join('');
}

export const link = (href, label, style = 'secondary', extra = '') => `<a class="btn ${style}" href="#${href}" ${extra}>${label}</a>`;
export const button = (action, label, style = 'secondary', attributes = '') => `<button type="button" class="btn ${style}" data-action="${action}" ${attributes}>${label}</button>`;

const STAR = 'M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';
export function stars(count, size = 16) {
  const icons = [1, 2, 3].map(n => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="${n <= count ? 'on' : 'off'}" aria-hidden="true"><path d="${STAR}"/></svg>`).join('');
  return `<span class="stars" role="img" aria-label="${esc(t('starsLabel', num(count)))}">${icons}</span>`;
}

export const levelChip = level => `<span class="level-chip ${level === 'B1.2' ? 'b12' : 'b11'}" lang="de" dir="ltr">${esc(level)}</span>`;

export function meter(value, max, label) {
  return `<progress value="${value}" max="${Math.max(max, 1)}" aria-label="${esc(label)}"></progress>`;
}

// Keep Arabic month names and use the same digits as the counters.
export function formatDay(day, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const [y, m, d] = day.split('-').map(Number);
  const locale = getLang() === 'ar' ? arabicLocale : 'de';
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export const crumbs = items => `<nav class="crumb" aria-label="${t('crumbLabel')}">${items.map(([href, label], i) =>
  (i ? `<span dir="ltr" aria-hidden="true">${t('sep')}</span>` : '') + (href ? `<a href="#${href}">${label}</a>` : `<span>${label}</span>`)).join('')}</nav>`;
