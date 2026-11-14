// The archipelago: ten islands on a sea route that ends at a treasure.
// The boat token sails between islands when the learner moves on.
import { t, num, getLang } from '../i18n/index.js';
import { islandName } from '../content.js';
import { islandProgress, nextLesson } from '../engine/progress.js';
import { esc } from './html.js';

export const LAYOUTS = {
  wide: { width: 1200, height: 800, scale: 1, treasure: [940, 650] },
  tall: { width: 600, height: 1800, scale: 0.85, treasure: [190, 1735] }
};
export const WIDE_MIN = 720;
const DOCK = 62;

export function routePoints(ctx, layout) {
  const { scale, treasure } = LAYOUTS[layout];
  return [...ctx.islands.map(island => [island.pos[layout][0], island.pos[layout][1] + DOCK * scale]), treasure];
}

const r1 = value => Math.round(value * 10) / 10;

// Catmull-Rom through the dock points, one cubic Bézier per hop.
export function routeSegments(points) {
  return points.slice(0, -1).map((p1, i) => {
    const p0 = points[i - 1] || p1;
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    return `M${r1(p1[0])} ${r1(p1[1])}C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  });
}

// Position of the token: the island of the given lesson, or the treasure.
export function stopIndex(ctx, lessonId) {
  const lesson = ctx.lessons.get(lessonId);
  if (!lesson) return ctx.islands.length;
  return ctx.islands.findIndex(island => island.id === lesson.island);
}

function waves(layout) {
  const { width, height } = LAYOUTS[layout];
  let seed = layout === 'wide' ? 11 : 29;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: layout === 'wide' ? 14 : 18 }, () => {
    const x = r1(40 + rand() * (width - 80));
    const y = r1(30 + rand() * (height - 60));
    return `<path class="wave" d="M${x} ${y}q7 -6 14 0t14 0t14 0"/>`;
  }).join('');
}

export function renderMap({ ctx, state }, layout) {
  const lang = getLang();
  const { width, height, scale, treasure } = LAYOUTS[layout];
  const points = routePoints(ctx, layout);
  const segments = routeSegments(points);
  const target = nextLesson(ctx, state, 'all');
  const allConquered = ctx.islands.every(island => state.islands[island.id]?.conquered);
  const tokenAt = points[stopIndex(ctx, state.player.at)] || treasure;

  const route = segments.map((d, i) => `<path class="route-seg" d="${d}"/>`).join('');
  const sailed = segments.map((d, i) => (state.islands[ctx.islands[i]?.id]?.conquered ? `<path class="route-done" d="${d}"/>` : '')).join('');

  const islands = ctx.islands.map(island => {
    const p = islandProgress(ctx, state, island.id);
    const [x, y] = island.pos[layout];
    const stage = p.conquered ? 'conquered' : p.stars ? 'progress' : 'untouched';
    const share = p.maxStars ? p.stars / p.maxStars : 0;
    const circumference = 2 * Math.PI * 18;
    const name = islandName(island, lang);
    const width = Math.max(120, Math.round(name.length * (lang === 'ar' ? 8.4 : 8.6) + 32));
    return `<a href="#island/${island.id}" class="isle ${stage} ${target?.island === island.id ? 'next' : ''}" data-island="${island.id}"
        aria-label="${esc(t('islandAria', name, num(p.learnedAll), num(p.totalAll), Boolean(p.conquered)))}">
      <g transform="translate(${x} ${y}) scale(${scale})">
        ${target?.island === island.id ? '<circle class="pulse" r="98"/>' : ''}
        <ellipse class="isle-water" rx="104" ry="70"/>
        <ellipse class="isle-beach" rx="88" ry="58"/>
        <ellipse class="isle-land" style="--isle-tint:var(--t-${island.palette})" cy="-6" rx="74" ry="46"/>
        <text class="isle-emoji" y="-8" text-anchor="middle" dominant-baseline="central" aria-hidden="true">${island.emoji}</text>
        ${stage === 'untouched' ? '<ellipse class="isle-fog" cy="-6" rx="80" ry="52"/>' : ''}
        <g class="ring" transform="translate(-72 -46)">
          <circle class="ring-bg" r="20"/>
          <circle class="ring-track" r="18"/>
          <circle class="ring-arc" r="18" transform="rotate(-90)" stroke-dasharray="${r1(circumference * share)} ${r1(circumference)}"/>
          <text class="ring-num" text-anchor="middle" dominant-baseline="central">${num(island.order)}</text>
        </g>
        ${p.conquered ? '<text class="flag" x="50" y="-50" text-anchor="middle" dominant-baseline="central" aria-hidden="true">🚩</text>' : ''}
        <g class="plate" transform="translate(0 118)">
          <rect x="${-width / 2}" y="-23" width="${width}" height="46" rx="12"/>
          <text class="plate-name" y="-5" text-anchor="middle" dominant-baseline="central" ${lang === 'ar' ? 'direction="rtl"' : ''}>${esc(name)}</text>
          <text class="plate-sub" y="13" text-anchor="middle" dominant-baseline="central" direction="ltr">${num(p.learnedAll)}/${num(p.totalAll)} · ★ ${num(p.stars)}</text>
        </g>
      </g>
    </a>`;
  }).join('');

  return `<svg class="map-svg ${layout}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(t('mapTitle'))}" direction="ltr">
    <rect class="sea" width="${width}" height="${height}" rx="24"/>
    <g aria-hidden="true">${waves(layout)}</g>
    <g class="route" aria-hidden="true">${route}${sailed}</g>
    ${islands}
    <g class="treasure ${allConquered ? 'open' : ''}" transform="translate(${treasure[0]} ${treasure[1]})" role="img" aria-label="${esc(t('treasureAria'))}">
      <circle r="32"/><text text-anchor="middle" dominant-baseline="central" aria-hidden="true">🏆</text>
    </g>
    <g class="token" transform="translate(${r1(tokenAt[0])} ${r1(tokenAt[1])})" aria-hidden="true">
      <circle r="23"/><text class="boat" text-anchor="middle" dominant-baseline="central">⛵</text>
    </g>
  </svg>`;
}

function fitPlates(svg) {
  for (const plate of svg.querySelectorAll('.plate')) {
    try {
      const width = Math.max(...[...plate.querySelectorAll('text')].map(text => text.getBBox().width)) + 30;
      const rect = plate.querySelector('rect');
      if (width > 30) {
        rect.setAttribute('x', String(-width / 2));
        rect.setAttribute('width', String(width));
      }
    } catch { /* not rendered yet */ }
  }
}

const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function sail(svg, from, to, onDone) {
  const segments = [...svg.querySelectorAll('.route-seg')];
  const lengths = segments.map(path => path.getTotalLength());
  const offsets = lengths.reduce((list, length) => [...list, list[list.length - 1] + length], [0]);
  const token = svg.querySelector('.token');
  const boat = token.querySelector('.boat');
  const start = offsets[from];
  const end = offsets[to];
  const duration = Math.min(2400, 900 * Math.abs(to - from));
  const pointAt = distance => {
    let k = 0;
    while (k < segments.length - 1 && offsets[k + 1] < distance) k++;
    return segments[k].getPointAtLength(Math.max(0, Math.min(lengths[k], distance - offsets[k])));
  };
  let last = pointAt(start);
  const began = performance.now();
  const frame = time => {
    if (!token.isConnected) return;
    const progress = Math.min(1, (time - began) / duration);
    const point = pointAt(start + (end - start) * ease(progress));
    token.setAttribute('transform', `translate(${r1(point.x)} ${r1(point.y)})`);
    if (Math.abs(point.x - last.x) > 0.2) boat.setAttribute('transform', point.x > last.x ? 'scale(-1 1)' : '');
    last = point;
    if (progress < 1) requestAnimationFrame(frame);
    else onDone?.();
  };
  requestAnimationFrame(frame);
}

// Draws the map into the host, picks the layout from the host's width and
// plays the pending boat trip once.
export function mountMap(host, app) {
  let layout = null;
  let trip = null;
  const { player } = app.state;
  if (player.animate) {
    const from = stopIndex(app.ctx, player.from);
    const to = stopIndex(app.ctx, player.at);
    if (player.from && from !== to && !app.reduceMotion()) trip = [from, to];
    if (from !== to || !player.from) app.store.update(state => { state.player.animate = false; });
  }
  const draw = () => {
    const next = host.clientWidth >= WIDE_MIN ? 'wide' : 'tall';
    if (next === layout) return;
    layout = next;
    host.innerHTML = renderMap(app, layout);
    const svg = host.querySelector('svg');
    fitPlates(svg);
    if (trip) {
      const [from, to] = trip;
      trip = null;
      const points = routePoints(app.ctx, layout);
      svg.querySelector('.token').setAttribute('transform', `translate(${points[from][0]} ${points[from][1]})`);
      sail(svg, from, to);
    }
  };
  draw();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(draw);
  observer.observe(host);
  return () => observer.disconnect();
}
