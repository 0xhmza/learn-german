import { num } from '../i18n/index.js';
import { w } from '../i18n/writing.js';

export function writingCounts(text) {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[’'\u2011-][\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0;
  return { words, lines: text ? text.split(/\r\n|\r|\n/).length : 0 };
}

export const expectedWords = prompt => prompt.expected ?? Math.max(5, Math.round(writingCounts(prompt.model).words / 5) * 5);
const hueFor = (words, expected) => {
  const gap = Math.max(0, Math.abs(words - expected) - expected * 0.08);
  return Math.round(8 + 138 * Math.max(0, 1 - gap / (expected * 0.8)));
};
const wordLabel = (words, expected) => `${w('words')}: ${num(words)} / ${w('expected')}: \u2066~${num(expected)}\u2069`;

export function writingMeter(id, expected, value) {
  const { words, lines } = writingCounts(value);
  return `<div class="writing-meter" id="${id}-meter" data-expected="${expected}">
    <span data-writing-words>${wordLabel(words, expected)}</span>
    <span data-writing-lines>${w('lines')}: ${num(lines)}</span>
  </div>`;
}

export function updateWritingMeter(editor) {
  const shell = editor.closest('.writing-editor');
  const meter = shell?.querySelector('.writing-meter');
  if (!meter) return;
  const expected = Number(meter.dataset.expected);
  const { words, lines } = writingCounts(editor.value);
  meter.querySelector('[data-writing-words]').textContent = wordLabel(words, expected);
  meter.querySelector('[data-writing-lines]').textContent = `${w('lines')}: ${num(lines)}`;
  shell.style.setProperty('--writing-hue', hueFor(words, expected));
  shell.classList.toggle('has-writing', words > 0);
}
