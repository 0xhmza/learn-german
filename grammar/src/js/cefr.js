// The CEFR levels of the platform. Only B1 has a course so far
// (the grammar islands, books B1.1 and B1.2); the other levels show an
// empty section until their content exists.
export const CEFR = [
  { id: 'A1', slug: 'a1', tone: 'mint' },
  { id: 'A2', slug: 'a2', tone: 'sky' },
  { id: 'B1', slug: 'b1', tone: 'lilac', grammar: true },
  { id: 'B2', slug: 'b2', tone: 'peach' },
  { id: 'C1', slug: 'c1', tone: 'coral' },
  { id: 'C2', slug: 'c2', tone: 'lilac' }
];

export const cefrBySlug = new Map(CEFR.map(level => [level.slug, level]));
