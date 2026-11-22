"""Turn word-timed German speech into readable, unabridged subtitle cues."""
from __future__ import annotations

import math
import re
import textwrap


def normal_text(words):
    text = ' '.join(str(word['word']).strip() for word in words).strip()
    text = re.sub(r'\s+([,.!?;:…])', r'\1', text)
    text = re.sub(r'([„«(])\s+', r'\1', text)
    return re.sub(r'\s+', ' ', text).strip()


def ends_sentence(text):
    if re.search(r'\b(?:Dr|Mr|Mrs|Prof|bzw|usw|ca|Nr)\.$', text):
        return False
    return bool(re.search(r'[.!?…][\"\x27”»)]*$', text))


def make_cues(segments, duration, max_chars=96, max_seconds=8.0):
    """Preserve all recognized words; split at sentences, pauses and size limits."""
    words = []
    for segment in segments:
        for word in segment.get('words') or []:
            start, end = float(word['start']), float(word['end'])
            if not (math.isfinite(start) and math.isfinite(end)) or start < 0 or end < start or end > duration + 0.5:
                raise ValueError('Invalid word timestamps in the audio transcript.')
            if str(word.get('word', '')).strip():
                words.append({**word, 'start': start, 'end': min(duration, end)})
    if not words:
        raise ValueError('No word-timed speech was recognized; existing subtitles were preserved.')
    words.sort(key=lambda word: (word['start'], word['end']))
    groups, pending = [], []
    for word in words:
        if pending:
            exceeds = len(normal_text(pending + [word])) > max_chars or word['end'] - pending[0]['start'] > max_seconds
            pause = word['start'] - pending[-1]['end'] > 0.75
            if exceeds or pause:
                groups.append(pending)
                pending = []
        pending.append(word)
        if ends_sentence(normal_text(pending)):
            groups.append(pending)
            pending = []
    if pending:
        groups.append(pending)
    cues = []
    for index, group in enumerate(groups):
        start = max(0, group[0]['start'] - 0.04)
        end = min(duration, max(group[-1]['end'] + 0.08, start + 0.12))
        if index + 1 < len(groups):
            next_start = max(0, groups[index + 1][0]['start'] - 0.04)
            if next_start > start:
                end = min(end, next_start)
        if end <= start:
            # A rare zero-duration token shares a boundary with the next word.
            # Keep it in the adjacent cue rather than dropping spoken text.
            if cues:
                cues[-1]['text'] += ' ' + normal_text(group)
                continue
            end = min(duration, start + 0.12)
        text = normal_text(group)
        wrapped = '\n'.join(textwrap.wrap(text, width=48, break_long_words=False, break_on_hyphens=False))
        cues.append({'start': round(start, 3), 'end': round(end, 3), 'text': wrapped,
                     'words': len(group), 'confidence': sum(float(word.get('probability', 0)) for word in group) / len(group)})
    return cues


def srt(cues):
    def clock(value):
        millis = round(max(0, value) * 1000)
        return f'{millis // 3600000:02d}:{millis // 60000 % 60:02d}:{millis // 1000 % 60:02d},{millis % 1000:03d}'
    return '\n'.join(f'{index}\n{clock(cue["start"])} --> {clock(cue["end"])}\n{cue["text"]}\n' for index, cue in enumerate(cues, 1))


def apply_text_corrections(cues, corrections):
    """Apply exact, episode-specific spelling fixes without changing timestamps."""
    result = []
    for cue in cues:
        cue = dict(cue)
        text = ' '.join(cue['text'].split())
        if text in corrections:
            replacement = corrections[text]
            if not isinstance(replacement, str) or not replacement.strip():
                raise ValueError('A transcript correction must contain nonempty text.')
            cue['text'] = '\n'.join(textwrap.wrap(replacement, width=48, break_long_words=False, break_on_hyphens=False))
            cue['spelling_corrected'] = True
        result.append(cue)
    return result


def review_flags(segments):
    flags = []
    for segment in segments:
        words = segment.get('words') or []
        uncertain = [word for word in words if float(word.get('probability', 1)) < 0.45]
        if segment.get('timing_needs_review') or float(segment.get('avg_logprob', 0)) < -0.8 or float(segment.get('compression_ratio', 0)) > 2.4 or uncertain:
            flags.append({'start': segment['start'], 'end': segment['end'], 'text': segment['text'],
                          'uncertain_words': [word['word'].strip() for word in uncertain],
                          'avg_logprob': segment.get('avg_logprob')})
    return flags
