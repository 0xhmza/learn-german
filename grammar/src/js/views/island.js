// One island: banner, lesson trail and the island exam.
import { t, num, getLang } from '../i18n/index.js';
import { islandName } from '../content.js';
import { islandProgress } from '../engine/progress.js';
import { renderTrail, mountTrail } from '../components/trail.js';
import { esc, link, meter, crumbs } from '../components/html.js';

export function title(app, route) {
  return islandName(app.ctx.islandById.get(route.key), getLang());
}

export function render(app, route) {
  const { ctx, state } = app;
  const lang = getLang();
  const island = ctx.islandById.get(route.key);
  const p = islandProgress(ctx, state, island.id);
  const other = lang === 'de' ? island.nickname.ar : island.nickname.de;
  return `${crumbs([['home', t('home')], [null, esc(islandName(island, lang))]])}
    <section class="lesson-banner island-banner ${island.palette}">
      <div class="unit-head"><span class="lesson-emoji" aria-hidden="true">${island.emoji}</span>
        <div><span class="lesson-count">${t('islandCount', num(island.order), num(ctx.islands.length))}</span>
          <h1>${esc(islandName(island, lang))} ${p.conquered ? '<span class="flag-inline" aria-hidden="true">🚩</span>' : ''}</h1>
          <div class="lesson-sub"><span ${lang === 'de' ? 'lang="ar" dir="rtl"' : 'lang="de" dir="ltr"'}>${esc(other)}</span> · <span>${esc(island.nickname[lang])}</span></div></div></div>
      <p class="lead">${esc(island.blurb[lang])}</p>
      <div class="island-meter">${meter(p.learnedAll, p.totalAll, islandName(island, lang))}<span>${t('learnedOf', num(p.learnedAll), num(p.totalAll))}</span><span class="star-sum">★ ${num(p.stars)} / ${num(p.maxStars)}</span>
        ${p.conquered ? `<span class="conquered-chip">${t('conquered')}</span>` : ''}</div>
      <div class="actions">${link(`practice/island-${island.id}`, t('practiceIsland'), 'primary')}${link('home', t('backToMap'))}</div>
    </section>
    ${renderTrail(app, island)}`;
}

export function mount(app, root, route) {
  return mountTrail(root, app, app.ctx.islandById.get(route.key));
}
