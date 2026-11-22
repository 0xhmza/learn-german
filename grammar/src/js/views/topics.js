// All topics: the searchable index with both roadmaps and the island map.
import { t } from '../i18n/index.js';
import { nextLesson } from '../engine/progress.js';
import { mountMap } from '../components/map.js';
import { createTopicBrowser, bindTopicBrowser, renderTopicBrowser, disclosureIcon } from '../components/sidebar.js';
import { crumbs } from '../components/html.js';

export const title = () => t('allTopics');
const browser = createTopicBrowser();

const topicOptions = app => ({
  ctx: app.ctx, state: app.state, id: 'all-topics', browser,
  defaultTopic: nextLesson(app.ctx, app.state)?.id
});

export function render(app) {
  const { state } = app;
  return `${crumbs([['home', t('tabHome')], ['grammatik', t('courseGrammar')], [null, t('allTopics')]])}
    <section class="page-head"><h1>${t('allTopics')}</h1><p>${t('allTopicsIntro')}</p></section>
    <section class="panel topics-panel">
      ${renderTopicBrowser({
        ...topicOptions(app),
        overview: state.settings.roadmap === 'islands' ? `<details class="map-panel"><summary>${disclosureIcon}${t('mapTitle')}</summary>
          <p class="muted">${t('mapHelp')}</p><div class="map-host" id="map-host"></div>
        </details>` : ''
      })}
    </section>`;
}

export function mount(app, root) {
  bindTopicBrowser(root, () => topicOptions(app));
  const host = root.querySelector('#map-host');
  if (!host) return null;
  const map = host.closest('details');
  let dispose;
  const openMap = () => { if (map.open && !dispose) dispose = mountMap(host, app); };
  map.addEventListener('toggle', openMap);
  return () => { map.removeEventListener('toggle', openMap); dispose?.(); };
}
