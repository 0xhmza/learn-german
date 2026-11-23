export const EPISODE_FILE = /^(simpsons|spongebob)\.s\d{2}e\d{2}$/i;
const tokens = /[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu;
const clauses = new Set('als bevor bis da damit dass falls nachdem obwohl sobald solange während weil wenn wodurch wobei'.split(' '));
const links = new Set('allerdings außerdem dadurch danach dagegen daher damals deshalb deswegen inzwischen jedenfalls sonst trotzdem zunächst'.split(' '));
const conversation = /\b(?:Bescheid geben|hätte gern|würde gerne?|bin mir sicher|hast recht|habe vor|kommt darauf an|könntest du|könnten Sie|habe mich entschieden|wäre besser|ging davon aus|in Ordnung)\b/iu;

function exercise(sentence, matches, first, last) {
  const start = matches[first].index;
  const end = matches[last].index + matches[last][0].length;
  return { before: sentence.slice(0, start), answer: sentence.slice(start, end), after: sentence.slice(end) };
}

// Select full sentences with reasons, conditions, contrasts or useful spoken B1 phrases.
export function buildListeningClips(episode, subtitles, revision) {
  const seen = new Set();
  const clips = [];
  for (const [i, cue] of subtitles.entries()) {
    const length = cue.end - cue.start;
    if (length < 2 || length > 14 || !Number.isFinite(length)) continue;
    if (/^\s*[-–—]|[♪♫\[\]<>]|\n\s*[-–—]|\([^)]*\)|\.\.\.|…/.test(cue.text)) continue;
    const text = cue.text.replace(/\s+/g, ' ').trim();
    if (!/^\p{Lu}/u.test(text) || !/[.!?]$/.test(text) || seen.has(text.toLowerCase()) || !/[äöüß]|\b(?:ich|wir|du|Sie|er|sie)\b/i.test(text)) continue;
    const matches = [...text.matchAll(tokens)];
    if (matches.length < 8 || matches.length > 27 || matches.length / length > 4.4) continue;
    const terms = matches.map(match => match[0].toLowerCase());
    const clause = terms.findIndex((term, index) => clauses.has(term) && index + 3 <= terms.length && (index === 0 || /,\s*$/.test(text.slice(0, matches[index].index))));
    const connector = terms.findIndex((term, index) => index > 0 && index < terms.length - 1 && links.has(term));
    if (clause < 0 && connector < 0 && !conversation.test(text)) continue;
    const previous = subtitles[i - 1];
    const next = subtitles[i + 1];
    if ((previous && previous.end > cue.start + .06) || (next && next.start < cue.end - .06)) continue;

    const key = clause >= 0 ? clause : connector >= 0 ? connector : terms.findIndex((term, index) => index > 1 && index < terms.length - 2 && term.length >= 6);
    if (key < 0) continue;
    let from = key;
    let to = Math.min(key + 3, terms.length - 1);
    for (let j = key + 1; j <= to; j++) {
      if (/[.!?,;:]/.test(text.slice(matches[j - 1].index + matches[j - 1][0].length, matches[j].index))) {
        to = j - 1;
        break;
      }
    }
    if (to <= from && from > 0) from--;
    if (to <= from) continue;
    const start = Math.max(0, Math.min(cue.start, Math.max(cue.start - .10, previous?.end ?? 0)));
    const end = Math.max(cue.end, Math.min(cue.end + .13, next?.start ?? Infinity));
    clips.push({
      id: `${episode}-${revision}-${Math.round(cue.start * 1000)}`, start, end, text,
      word: exercise(text, matches, key, key),
      phrase: exercise(text, matches, from, to)
    });
    seen.add(text.toLowerCase());
  }
  return clips;
}

export function transcriptRevision(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
