// Saving German words from any page. Selecting a word (double-click, or a
// long press on touch screens) or tapping a word in plain text shows a small
// "+ Wortliste" button next to it. Only text marked as German (lang="de")
// inside the main column counts; buttons, links and form fields keep their
// own behaviour.
import { t } from '../i18n/index.js';
import { cleanWord } from '../engine/words.js';
import { esc } from './html.js';
import { icons } from './icons.js';

const INTERACTIVE = 'a, button, input, textarea, select, label, summary, option, [contenteditable="true"], [role="button"]';
const WORD_CHAR = /[\p{L}\p{M}\p{N}'’-]/u;
const plus = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

const elementOf = node => (node?.nodeType === 3 ? node.parentElement : node);

// The German element a node belongs to, or null.
function germanText(node) {
  const el = elementOf(node);
  if (!el || !el.closest('#main') || el.closest(`${INTERACTIVE}, .word-pop`)) return null;
  const marked = el.closest('[lang]');
  return marked && /^de\b/i.test(marked.lang) ? el : null;
}

// The word under a point, as a range.
function wordRangeAt(x, y) {
  let node;
  let offset;
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    node = position?.offsetNode;
    offset = position?.offset;
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    node = range?.startContainer;
    offset = range?.startOffset;
  }
  if (!node || node.nodeType !== 3) return null;
  const text = node.data;
  let start = offset;
  let end = offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  if (start === end) return null;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const box = range.getBoundingClientRect();
  return x >= box.left - 2 && x <= box.right + 2 && y >= box.top - 2 && y <= box.bottom + 2 ? range : null;
}

export function mountWordPicker({ isSaved, save, blocked = () => false }) {
  const pop = document.createElement('div');
  pop.className = 'word-pop';
  pop.hidden = true;
  pop.innerHTML = '<button type="button" class="word-pop-btn"></button>';
  document.body.append(pop);
  const control = pop.firstElementChild;
  let current = null;
  let frame = 0;

  function hide() {
    pop.hidden = true;
    current = null;
  }

  function place(range) {
    const box = range.getBoundingClientRect();
    if (!box.width && !box.height) return hide();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const touch = matchMedia('(pointer: coarse)').matches;
    const x = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), innerWidth - width - 8);
    // Below the word on touch screens, where the system menu sits above it.
    let y = touch ? box.bottom + 12 : box.top - height - 8;
    if (y < 8) y = box.bottom + 8;
    if (y + height > innerHeight - 8) y = box.top - height - 8;
    pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function show(range, word) {
    current = word;
    const saved = isSaved(word);
    control.innerHTML = `${saved ? icons.check : plus}<span>${esc(t(saved ? 'wordSaved' : 'wordAdd'))}</span>`;
    control.setAttribute('aria-label', t(saved ? 'wordSavedNamed' : 'wordAddNamed', word));
    control.classList.toggle('saved', saved);
    pop.hidden = false;
    place(range);
  }

  function fromSelection() {
    const selection = getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return hide();
    const range = selection.getRangeAt(0);
    if (!germanText(range.startContainer) || !germanText(range.endContainer) || blocked(elementOf(range.startContainer))) return hide();
    const word = cleanWord(selection.toString());
    return word ? show(range, word) : hide();
  }

  let timer = 0;
  const onSelection = () => {
    clearTimeout(timer);
    timer = setTimeout(fromSelection, 100);
  };
  // A plain click or tap on a German word selects that word.
  const onClick = event => {
    if (event.button !== 0 || event.detail > 1 || event.target.closest('.word-pop')) return;
    if (!getSelection().isCollapsed || !germanText(event.target) || blocked(event.target)) return;
    const range = wordRangeAt(event.clientX, event.clientY);
    if (!range) return;
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const onScroll = () => {
    if (pop.hidden) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fromSelection);
  };
  const onKey = event => {
    if (event.key === 'Escape' && !pop.hidden) hide();
  };
  // Keep the selection while pressing the button.
  pop.addEventListener('mousedown', event => event.preventDefault());
  control.addEventListener('click', () => {
    if (!current || isSaved(current)) return;
    const word = current;
    save(word);
    getSelection().removeAllRanges();
    hide();
  });
  document.addEventListener('selectionchange', onSelection);
  document.addEventListener('click', onClick);
  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onScroll);
  document.addEventListener('keydown', onKey);
  return {
    hide() {
      hide();
    }
  };
}
