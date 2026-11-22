// Hash routes. Unknown or malformed routes fall back to the dashboard;
// links from the original B1.1 file keep working.
import { parseRunKey } from './engine/runs.js';
import { cefrBySlug } from './cefr.js';

export function parse(hash, ctx) {
  const raw = String(hash || '').replace(/^#/, '');
  const parts = raw.split('/');
  const [view, key, extra] = parts;
  const home = { view: 'home', key: null, hash: 'home', tab: 'home' };
  if (view === 'model-exams' && parts.length <= 3) {
    const exam = ctx.modelTests.get(key);
    if (key === undefined || exam) {
      const sample = exam && ctx.learning.examSample?.model === exam.id;
      const section = sample && ['audio-practice', 'speaking-practice'].includes(extra) ? extra : exam?.sections.find(section => section.id === extra)?.id;
      return { view, key, section, hash: raw, tab: 'model-exams' };
    }
  }
  if (!raw || extra !== undefined) return home;
  if (view === 'vokabeln' && key === undefined) return { view: 'vocab', key: null, hash: raw, tab: 'vocab' };
  if (view === 'schreiben' && key === undefined) return { view: 'writing', key: null, hash: raw, tab: 'writing' };
  if (view === 'topics' && key === undefined) return { view: 'topics', key: null, hash: raw, tab: 'home' };
  if (view === 'grammatik' && key === undefined) return { view: 'grammar', key: null, hash: raw, tab: 'home' };
  if (view === 'level' && (key === undefined || cefrBySlug.has(key))) return { view: 'level', key: key ?? null, hash: raw, tab: 'home' };
  if (view === 'island' && ctx.islandById.has(key)) return { view, key, hash: raw, tab: 'home' };
  if (view === 'lesson' && ctx.lessons.has(key)) return { view, key, hash: raw, tab: 'home' };
  if (view === 'cards' && (key === undefined || ctx.decks.has(key))) return { view, key, hash: raw, tab: 'practice' };
  const libraries = { readings: ctx.readings, sprachbausteine: ctx.sprachbausteine };
  if (Object.hasOwn(libraries, view) && (key === undefined || libraries[view].has(key))) return { view, key, hash: raw, tab: 'practice' };
  if (view === 'practice') {
    if (key === undefined || key === '') return { view: 'practice', key: null, hash: 'practice', tab: 'practice' };
    if (/^unit-\d+$/.test(key)) return { view: 'practice', key: null, hash: 'practice', tab: 'practice' };
    if (parseRunKey(ctx, key)) return { view: 'quiz', key, hash: raw, tab: 'practice' };
    return { view: 'practice', key: null, hash: 'practice', tab: 'practice' };
  }
  if ((view === 'progress' || view === 'settings') && key === undefined) return { view, key: null, hash: view, tab: view === 'progress' ? 'progress' : 'settings' };
  return home;
}
