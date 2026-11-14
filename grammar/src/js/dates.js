// Calendar days as local "YYYY-MM-DD" strings. The clock is replaceable
// so tests can move through days deterministically.
let clock = () => new Date();

export function setClock(fn) {
  clock = fn;
}

export function now() {
  return clock().getTime();
}

export function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today() {
  return iso(clock());
}

const toUtc = day => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(day, count) {
  const date = new Date(toUtc(day) + count * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function diffDays(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 86400000);
}

export function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
