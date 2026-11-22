// Gap texts with a shared word list (Sprachbausteine, part 2). Words are
// dragged from the list into a gap with mouse, pen or finger, or placed by
// tapping a word and then a gap, which also works with the keyboard. A
// filled gap is emptied by tapping it. Every word can be used once.
import { t, num } from '../i18n/index.js';
import { esc } from './html.js';

// One gap in the running text.
export function dropGap({ key, number, value, label }) {
  const name = label ? t('gapFilled', num(number), label) : t('gapEmpty', num(number));
  return `<button type="button" class="drop-gap ${label ? 'filled' : ''}" data-drop-gap="${esc(key)}" ${label ? `data-value="${esc(value)}"` : ''} aria-label="${esc(name)}">
    <span class="gap-no" aria-hidden="true">${num(number)}</span>${label ? `<span class="gap-word">${esc(label)}</span>` : ''}</button>`;
}

// The word list. `words` is a list of [value, label, used].
export function wordChips(words, heading) {
  return `<div class="drag-bank">
    <h2>${heading}</h2>
    <div class="drag-chips" role="group" aria-label="${esc(heading)}" lang="de" dir="ltr">${words.map(([value, label, used]) =>
      `<button type="button" class="bank-chip ${used ? 'used' : ''}" data-bank-value="${esc(value)}" aria-pressed="false" ${used ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div>
    <p class="drag-help">${t('dragHelp')}</p>
  </div>`;
}

// Wires dragging and tapping inside `root`. `place(key, value)` puts a word
// into a gap, `clear(key)` empties it; both redraw the page.
export function mountDragDrop(root, { place, clear }) {
  let picked = null;
  let drag = null;
  let suppressClick = false;

  const gapAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop-gap]');
  const pick = chip => {
    for (const other of root.querySelectorAll('.bank-chip[aria-pressed="true"]')) other.setAttribute('aria-pressed', 'false');
    picked = chip && chip !== picked ? chip : null;
    picked?.setAttribute('aria-pressed', 'true');
    root.classList.toggle('placing', Boolean(picked));
  };
  const stopDrag = () => {
    if (!drag) return;
    drag.ghost?.remove();
    drag.over?.classList.remove('over');
    drag.chip.classList.remove('dragging');
    root.classList.remove('drag-active');
    cancelAnimationFrame(drag.scroll);
    drag = null;
  };

  const onPointerDown = event => {
    const chip = event.target.closest('.bank-chip:not(:disabled)');
    if (!chip || event.button > 0) return;
    drag = { chip, x: event.clientX, y: event.clientY, moved: false, pointer: event.pointerId };
    chip.setPointerCapture?.(event.pointerId);
  };
  const autoScroll = () => {
    if (!drag?.moved) return;
    const edge = 70;
    const speed = drag.lastY < edge ? -12 : drag.lastY > innerHeight - edge ? 12 : 0;
    if (speed) window.scrollBy(0, speed);
    drag.scroll = requestAnimationFrame(autoScroll);
  };
  const onPointerMove = event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      pick(null);
      const ghost = drag.chip.cloneNode(true);
      ghost.className = 'bank-chip drag-ghost';
      ghost.removeAttribute('data-bank-value');
      document.body.append(ghost);
      drag.ghost = ghost;
      drag.chip.classList.add('dragging');
      root.classList.add('drag-active');
      drag.scroll = requestAnimationFrame(autoScroll);
    }
    event.preventDefault();
    drag.lastY = event.clientY;
    drag.ghost.style.transform = `translate(${event.clientX - drag.ghost.offsetWidth / 2}px, ${event.clientY - drag.ghost.offsetHeight - 14}px)`;
    const gap = gapAt(event.clientX, event.clientY);
    if (gap !== drag.over) {
      drag.over?.classList.remove('over');
      gap?.classList.add('over');
      drag.over = gap;
    }
  };
  const onPointerUp = event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { moved, chip } = drag;
    const gap = moved ? gapAt(event.clientX, event.clientY) : null;
    stopDrag();
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (gap) place(gap.dataset.dropGap, chip.dataset.bankValue);
  };
  const onClick = event => {
    if (suppressClick) return;
    const chip = event.target.closest('.bank-chip:not(:disabled)');
    if (chip) {
      pick(chip);
      return;
    }
    const gap = event.target.closest('[data-drop-gap]');
    if (!gap) return;
    if (picked) {
      const key = gap.dataset.dropGap;
      const value = picked.dataset.bankValue;
      pick(null);
      place(key, value, true);
    } else if (gap.dataset.value) clear(gap.dataset.dropGap, true);
    else root.querySelector('.bank-chip:not(:disabled)')?.focus();
  };
  const onKey = event => {
    if (event.key === 'Escape' && picked) {
      const chip = picked;
      pick(null);
      chip.focus();
    }
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', stopDrag);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  return () => {
    stopDrag();
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', stopDrag);
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
  };
}

// After a keyboard or tap placement, continue with the next empty gap.
export function focusAfterPlacing(root, key) {
  const gaps = [...root.querySelectorAll('[data-drop-gap]')];
  const index = gaps.findIndex(gap => gap.dataset.dropGap === key);
  const next = gaps.slice(index + 1).concat(gaps.slice(0, index)).find(gap => !gap.dataset.value);
  (next ? root.querySelector('.bank-chip:not(:disabled)') : gaps[index])?.focus({ preventScroll: true });
}
