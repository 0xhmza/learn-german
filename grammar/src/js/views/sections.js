// Level pages (A1–C1) and the Vokabeln and Schreiben areas. Only B1 has
// content so far: the grammar course and the telc exam trainer. Everything
// else is an empty section that is ready for content.
import { t, num } from '../i18n/index.js';
import { overall } from '../engine/progress.js';
import { CEFR, cefrBySlug } from '../cefr.js';
import { icons } from '../components/icons.js';
import { esc, link, crumbs } from '../components/html.js';

const art = {
  vocab: `<svg viewBox="0 0 160 120" aria-hidden="true"><rect x="38" y="22" width="76" height="86" rx="10" fill="var(--t-sky)" transform="rotate(-8 76 65)"/>
    <rect x="48" y="16" width="76" height="86" rx="10" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="2"/>
    <rect x="60" y="34" width="40" height="8" rx="4" fill="var(--brand)"/><rect x="60" y="52" width="52" height="6" rx="3" fill="var(--line-strong)"/>
    <rect x="60" y="66" width="34" height="6" rx="3" fill="var(--line-strong)"/><circle cx="118" cy="96" r="16" fill="#ffd54a"/><path d="M111 96h14M118 89v14" stroke="#7a5a00" stroke-width="3" stroke-linecap="round"/></svg>`,
  writing: `<svg viewBox="0 0 160 120" aria-hidden="true"><rect x="30" y="14" width="86" height="96" rx="10" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="2"/>
    <rect x="44" y="32" width="50" height="7" rx="3.5" fill="var(--brand)"/><rect x="44" y="50" width="58" height="5" rx="2.5" fill="var(--line-strong)"/>
    <rect x="44" y="62" width="48" height="5" rx="2.5" fill="var(--line-strong)"/><rect x="44" y="74" width="54" height="5" rx="2.5" fill="var(--line-strong)"/>
    <path d="M104 98 136 60l10 9-32 37-13 4z" fill="#ffd54a" stroke="#7a5a00" stroke-width="2.5" stroke-linejoin="round"/></svg>`
};

function levelRows(kind) {
  return `<ul class="soon-list">${CEFR.map(level => `<li class="soon-row">
    <span class="level-code small ${level.tone}" lang="de" dir="ltr">${level.id}</span>
    <span class="soon-text"><strong>${esc(t('levelNames')[level.id])}</strong><small>${t(kind === 'vocab' ? 'vocabEmpty' : 'writingEmpty')}</small></span>
    <span class="soon-chip">${t('comingSoon')}</span></li>`).join('')}</ul>`;
}

function area(kind) {
  const vocab = kind === 'vocab';
  return `<section class="area-hero ${vocab ? 'sky' : 'peach'}">
      <span class="area-icon" aria-hidden="true">${vocab ? icons.vocab : icons.writing}</span>
      <div><h1>${t(vocab ? 'navVocab' : 'navWriting')}</h1><p>${t(vocab ? 'vocabIntro' : 'writingIntro')}</p></div>
    </section>
    <div class="area-grid">
      <section class="panel empty-state">
        <div class="empty-art">${art[kind]}</div>
        <h2>${t(vocab ? 'vocabEmpty' : 'writingEmpty')}</h2>
        <p>${t(vocab ? 'vocabEmptyText' : 'writingEmptyText')}</p>
        ${vocab ? link('cards', t('vocabBridge'), 'secondary') : link('model-exams/petra/schreiben', t('writingBridge'), 'secondary')}
      </section>
      <section class="panel"><h2>${t('levelsTitle')}</h2>${levelRows(kind)}</section>
    </div>`;
}

export const vocab = {
  title: () => t('navVocab'),
  render: () => area('vocab')
};

export const writing = {
  title: () => t('navWriting'),
  render: () => area('writing')
};

function courseCard({ icon, tone, title, text, href, soon, progress }) {
  const body = `<span class="course-card-icon ${tone}" aria-hidden="true">${icon}</span>
    <span class="course-card-text"><strong>${title}</strong><small>${text}</small>
      ${progress !== undefined ? `<span class="bar" aria-hidden="true"><i style="inline-size:${progress}%"></i></span>` : ''}</span>
    ${soon ? `<span class="soon-chip">${t('comingSoon')}</span>` : `<span class="course-card-go" aria-hidden="true">${icons.chevron}</span>`}`;
  return soon ? `<li><div class="course-card soon">${body}</div></li>` : `<li><a class="course-card" href="#${href}">${body}</a></li>`;
}

export const level = {
  title: (app, route) => t('levelTitle', cefrBySlug.get(route.key).id),
  render(app, route) {
    const { ctx, state } = app;
    const info = cefrBySlug.get(route.key);
    const stats = overall(ctx, state);
    const percent = Math.round((stats.learned / Math.max(1, stats.lessons)) * 100);
    const cards = [
      courseCard({ icon: icons.learn, tone: 'lilac', title: info.grammar ? t('grammarCourseName') : t('courseGrammar'),
        text: info.grammar ? `${t('grammarCourseSub', num(ctx.lessons.size), num(ctx.islands.length))} · ${t('courseProgressPct', num(percent))}` : t('grammarEmptyText'),
        href: 'home', soon: !info.grammar, progress: info.grammar ? percent : undefined }),
      courseCard({ icon: icons.vocab, tone: 'sky', title: t('navVocab'), text: t('vocabEmptyText'), href: 'vokabeln', soon: true }),
      courseCard({ icon: icons.writing, tone: 'peach', title: t('navWriting'), text: t('writingEmptyText'), href: 'schreiben', soon: true })
    ];
    if (info.grammar) cards.push(courseCard({ icon: icons.exam, tone: 'mint', title: t('courseExam'), text: t('examToolDesc'), href: 'model-exams' }));
    const tabs = CEFR.map(item => `<a class="level-tab ${item.tone}" href="#level/${item.slug}" ${item.slug === info.slug ? 'aria-current="page"' : ''} lang="de" dir="ltr">${item.id}</a>`).join('');
    return `${crumbs([['home', t('tabHome')], [null, t('levelTitle', info.id)]])}
      <nav class="level-tabs" aria-label="${esc(t('levelsTitle'))}">${tabs}</nav>
      <section class="level-hero ${info.tone}">
        <span class="level-code big" lang="de" dir="ltr">${info.id}</span>
        <div><small>${esc(t('levelNames')[info.id])}</small><h1>${t('levelTitle', info.id)}</h1><p>${esc(t('levelCan')[info.id])}</p></div>
      </section>
      ${info.grammar ? '' : `<section class="panel empty-state compact"><span class="empty-icon" aria-hidden="true">${icons.sparkle}</span>
        <div><h2>${t('levelSoonTitle', info.id)}</h2><p>${t('levelSoonText')}</p></div></section>`}
      <section class="home-section"><div class="section-row"><h2>${t('levelCourses')}</h2></div>
        <ul class="course-cards">${cards.join('')}</ul></section>`;
  }
};
