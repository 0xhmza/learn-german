import { assembleContent } from '../../scripts/assemble-content.js';
import { indexContent } from '../../src/js/content.js';
import { defaultState, normalizeState } from '../../src/js/engine/migrate.js';

export const raw = await assembleContent();

// Each call returns a fresh index, because indexing annotates questions.
export function context() {
  return indexContent(structuredClone(raw));
}

export function freshState(ctx, day = '2026-11-14') {
  return normalizeState(defaultState(day), ctx, day);
}

// Deterministic random numbers (mulberry32).
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
