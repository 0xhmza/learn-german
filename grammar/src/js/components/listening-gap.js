import { esc } from './html.js';
import { h } from '../i18n/listening.js';

export function listeningInput({ id, attributes, value, readOnly, target = null }) {
  const settings = `id="${id}" ${attributes} lang="de" dir="ltr" maxlength="350" autocomplete="off"
    autocapitalize="off" spellcheck="false" ${readOnly ? 'readonly' : ''}`;
  if (target === null) {
    return `<textarea class="listening-answer listening-dictation" rows="2" ${settings}>${esc(value)}</textarea>`;
  }
  const width = Math.max(3, [...target].length * 1.2).toFixed(1);
  return `<input type="text" class="listening-answer listening-gap-input" ${settings}
    aria-label="${esc(h('blank'))}" style="--listening-gap-width:${width}ch" value="${esc(value)}">`;
}

export function sizeListeningGaps(root, answers) {
  if (!answers.length) return;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return;
  const fields = answers.map(([id, expected]) => [root.querySelector(`#${id}.listening-gap-input`), expected]);
  const measure = () => {
    for (const [field, expected] of fields) {
      if (!field?.isConnected) continue;
      const css = getComputedStyle(field);
      ctx.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const padding = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((sum, key) => sum + (parseFloat(css[key]) || 0), 0);
      const width = Math.ceil(ctx.measureText(expected).width * 1.2 + padding);
      field.style.setProperty('--listening-gap-width', `${width}px`);
    }
  };
  measure();
  if (document.fonts?.status === 'loading') void document.fonts.ready.then(measure);
}
