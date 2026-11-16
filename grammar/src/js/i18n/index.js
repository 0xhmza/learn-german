import ar, { arabicNumbers } from './ar.js';
import de from './de.js';

export const dictionaries = { ar, de };
let lang = 'ar';
let numbers = arabicNumbers;

export function setLang(next) {
  lang = next === 'de' ? 'de' : 'ar';
  numbers = lang === 'ar' ? arabicNumbers : new Intl.NumberFormat('de');
}

export const getLang = () => lang;
export const num = value => numbers.format(value);

// t('key') returns the string; t('key', a, b) calls a function entry.
export function t(key, ...args) {
  const value = dictionaries[lang][key];
  if (value === undefined) return key;
  return typeof value === 'function' ? value(...args) : value;
}
