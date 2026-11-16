import { examChoices, isMatching } from '../src/js/engine/model-exams.js';

const sections = [
  ['lesen-1', 1, 5], ['lesen-2', 6, 10], ['lesen-3', 11, 20],
  ['sprache-1', 21, 30], ['sprache-2', 31, 40],
  ['hoeren-1', 41, 45], ['hoeren-2', 46, 55], ['hoeren-3', 56, 60], ['schreiben', 0, -1]
];
const statuses = new Set(['verified', 'source-key', 'corrected', 'disputed', 'missing']);

export function validateModelTests(data) {
  const errors = [];
  const ids = new Set();
  const counts = {};
  if (data?.schemaVersion !== 1 || data.source !== 'telc b1 modal tests' || !Array.isArray(data.models)) return ['Invalid telc model-test dataset'];
  const validPage = page => Number.isInteger(page) && page > 0 && page <= data.sourcePageCount;
  for (const model of data.models) {
    if (!/^[a-z0-9-]+$/.test(model.id) || ids.has(model.id) || !model.label) errors.push(`Invalid or repeated exam ID ${model.id}`);
    ids.add(model.id);
    if (model.sourcePages.length !== 2 || !model.sourcePages.every(validPage) || !validPage(model.keyPage)) errors.push(`${model.id} has invalid source page references`);
    if (model.sections.map(part => part.id).join() !== sections.map(part => part[0]).join()) errors.push(`${model.id} has invalid section order`);
    for (const [index, part] of model.sections.entries()) {
      const label = `${model.id}/${part.id}`;
      if (part.availability === 'missing') {
        if (part.sourcePages.length || part.items.length) errors.push(`${label} contains material marked absent`);
        continue;
      }
      if (part.availability !== 'available' || !part.sourcePages.length || !part.sourcePages.every(validPage)) errors.push(`${label} has invalid section provenance`);
      if (!sections[index]) continue;
      const [, start, end] = sections[index];
      if (part.items.length !== end - start + 1 || part.items.some((item, i) => item.number !== start + i)) errors.push(`${label} has unexpected question numbers`);
      if (part.id === 'schreiben' && !part.passage?.length) errors.push(`${label} has no writing prompt`);
      if (part.id.startsWith('sprache-')) {
        const gaps = [...part.passage.join(' ').matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
        if (gaps.length !== 10 || gaps.some((n, i) => n !== start + i)) errors.push(`${label} has invalid gap markers`);
      }
      const used = new Set();
      for (const item of part.items) {
        const status = item.key?.status;
        if (!statuses.has(status)) { errors.push(`${label}/${item.number} has invalid key status`); continue; }
        counts[status] = (counts[status] || 0) + 1;
        if (status === 'disputed' || status === 'missing') {
          if (item.key.choice) errors.push(`${label}/${item.number} assigns an unresolved answer`);
          continue;
        }
        const choices = examChoices(part, item);
        const { choice, page } = item.key;
        if (Object.keys(choices).length < 2 || !Object.hasOwn(choices, choice) || !validPage(page)) errors.push(`${label}/${item.number} cannot be scored from the supplied key`);
        if (isMatching(part) && choice !== 'x' && used.has(choice)) errors.push(`${label}/${item.number} reuses a matching answer`);
        used.add(choice);
      }
      for (const scan of part.scans || []) {
        if (!validPage(scan.page) || !scan.data?.startsWith('data:image/webp;base64,')) errors.push(`${label} has an invalid scan`);
      }
    }
  }
  for (const model of data.models) for (const part of model.sections) {
    if (part.related && !ids.has(part.related)) errors.push(`${model.id}/${part.id} has an unknown linked model`);
  }
  if ([...statuses].some(status => (counts[status] || 0) !== (data.audit?.[status] || 0))) errors.push('Model-test audit totals are outdated');
  return errors;
}
