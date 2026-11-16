import { examChoices, isAnswerable, isListening, isMatching, isScorable } from '../src/js/engine/model-exams.js';

const sections = [
  ['lesen-1', 1, 5], ['lesen-2', 6, 10], ['lesen-3', 11, 20],
  ['sprache-1', 21, 30], ['sprache-2', 31, 40],
  ['hoeren-1', 41, 45], ['hoeren-2', 46, 55], ['hoeren-3', 56, 60], ['schreiben', 0, -1]
];
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const hasOnly = (object, fields) => Object.keys(object).every(field => fields.includes(field));
const numbered = (items, start, end) => Array.isArray(items)
  && items.length === end - start + 1 && items.every((item, index) => item.number === start + index);

function validateItems(errors, label, part, items) {
  const used = new Set();
  for (const item of items) {
    const question = `${label}/${item.number}`;
    const choices = examChoices(part, item);
    if (!hasOnly(item, ['number', 'prompt', 'choices', 'answer']) || !isAnswerable(part, item)
        || Object.entries(choices).some(([code, value]) => code !== 'x' && !hasText(value))) {
      errors.push(`${question} has incomplete exercise content`);
    }
    if (isListening(part)) {
      if (Object.hasOwn(item, 'answer')) errors.push(`${question} must be ungraded`);
      continue;
    }
    if (!isScorable(part, item)) errors.push(`${question} needs a valid answer`);
    if (isMatching(part) && item.answer !== 'x' && used.has(item.answer)) errors.push(`${question} reuses a matching answer`);
    used.add(item.answer);
  }
}

export function validateModelTests(data) {
  if (data?.schemaVersion !== 2 || !Array.isArray(data.models) || data.models.length !== 17
      || !hasOnly(data, ['schemaVersion', 'models'])) return ['Invalid telc model-test dataset'];
  const errors = [];
  const ids = new Set();
  const titles = { ar: new Set(), de: new Set() };
  for (const [index, model] of data.models.entries()) {
    if (!/^[a-z0-9-]+$/.test(model.id) || ids.has(model.id) || model.number !== index + 1
        || !hasOnly(model, ['id', 'number', 'title', 'sections'])) errors.push(`Invalid model entry ${model.id}`);
    ids.add(model.id);
    for (const [lang, names] of Object.entries(titles)) {
      const title = model.title?.[lang];
      if (!hasText(title) || names.has(title)) errors.push(`${model.id} has a missing or repeated ${lang} title`);
      names.add(title);
    }
    if (!Array.isArray(model.sections) || model.sections.map(part => part.id).join() !== sections.map(([id]) => id).join()) {
      errors.push(`${model.id} has invalid section order`);
      continue;
    }
    for (const [partIndex, part] of model.sections.entries()) {
      const label = `${model.id}/${part.id}`;
      const [, start, end] = sections[partIndex];
      if (!hasOnly(part, ['id', 'passage', 'choices', 'ads', 'items', 'variants'])) errors.push(`${label} has unexpected metadata`);
      if (!numbered(part.items, start, end)) {
        errors.push(`${label} has unexpected question numbers`);
        continue;
      }
      if (['lesen-2', 'sprache-1', 'sprache-2', 'schreiben'].includes(part.id)
          && (!part.passage?.length || !part.passage.every(hasText))) errors.push(`${label} needs a passage`);
      if (part.id.startsWith('sprache-')) {
        const gaps = [...(part.passage || []).join(' ').matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
        if (gaps.length !== 10 || gaps.some((n, i) => n !== start + i)) errors.push(`${label} has invalid gap markers`);
      }
      if (part.id === 'lesen-3') {
        if (!Array.isArray(part.ads) || part.ads.map(ad => ad.code).join('') !== 'abcdefghijkl'
            || part.ads.some(ad => !hasOnly(ad, ['code', 'title', 'text']) || !hasText(ad.title) || !hasText(ad.text))) {
          errors.push(`${label} needs twelve ads with codes A to L`);
          continue;
        }
      }
      validateItems(errors, label, part, part.items);
      for (const variant of part.variants || []) {
        if (!hasOnly(variant, ['items']) || !numbered(variant.items, start, end)) errors.push(`${label} has an invalid extra exercise`);
        else validateItems(errors, `${label}/extra`, part, variant.items);
      }
    }
  }
  return errors;
}
