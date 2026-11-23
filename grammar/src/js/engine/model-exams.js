export const isListening = section => section.id.startsWith('hoeren-');
export const isReading = section => section.id.startsWith('lesen-');
export const isMatching = section => ['lesen-1', 'lesen-3', 'sprache-2'].includes(section.id);

export function examChoices(section, item) {
  if (isListening(section)) return { '+': 'Richtig', '-': 'Falsch' };
  if (section.ads) return Object.fromEntries([...section.ads.map(ad => [ad.code, ad.title]), ['x', '']]);
  return item.choices ?? section.choices ?? {};
}

export function isAnswerable(section, item) {
  const choices = examChoices(section, item);
  if (['lesen-2', 'sprache-1'].includes(section.id) && Object.keys(choices).length !== 3) return false;
  if (section.id.startsWith('sprache-') && !section.passage?.some(text => text.includes(`{${item.number}}`))) return false;
  if ((section.id.startsWith('lesen-') || isListening(section)) && !item.prompt) return false;
  return Object.keys(choices).length > 1;
}

export function isScorable(section, item) {
  return !isListening(section) && Object.hasOwn(examChoices(section, item), item.answer);
}

export function examResult(section, responses) {
  const scorable = section.items.filter(item => isScorable(section, item));
  return {
    total: scorable.length,
    correct: scorable.filter(item => item.answer === responses[item.number]).length
  };
}

// Keep the last assessed response separate from a new practice draft.
export function lastReadingResult(section, draft) {
  if (!isReading(section) || !draft) return null;
  if (draft.checked === true) return examResult(section, draft.responses || {});
  const score = draft.readingResult;
  const total = examResult(section, {}).total;
  if (total && score?.total === total && Number.isInteger(score.correct) && score.correct >= 0 && score.correct <= total) {
    return { total, correct: score.correct };
  }
  return null;
}
