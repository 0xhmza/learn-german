"""Record narrow name/spelling corrections without changing recognized timing.

Run after all twenty audio caches complete, then rebuild SRTs with
transcribe-dub.py --series spongebob --season 3 --rebuild-from-cache.
Existing manually entered cue corrections take precedence.
"""
import json
from pathlib import Path
import re
from transcript_tools import make_cues

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT/'media'/'dub-transcripts'
REPLACEMENTS = [
    (r'\bThaddeus\b','Thaddäus'),(r'\bVadeus\b','Thaddäus'),
    (r'\bSchwankopf\b','Schwammkopf'),(r'\bSpongebob\b','SpongeBob'),
    (r'\bKrabbenbürger(s|n)?\b',r'Krabbenburger\1'),
    (r'\bKrabbenberger(s|n)?\b',r'Krabbenburger\1'),
]


def main():
    target = WORK/'corrections.json'
    corrections = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
    report = []
    for number in range(1,21):
        episode = f'spongebob.s03e{number:02d}'
        raw = json.loads((WORK/f'{episode}.words.json').read_text(encoding='utf-8'))
        if not raw.get('complete') or raw['language'] != 'de' or raw['task'] != 'transcribe':
            raise ValueError(f'{episode}: complete the German audio transcription first.')
        changes = {}
        for cue in make_cues(raw['segments'],raw['duration']):
            original = ' '.join(cue['text'].split())
            replacement = original
            for pattern, spelling in REPLACEMENTS: replacement = re.sub(pattern,spelling,replacement)
            if original != replacement: changes[original] = replacement
        existing = corrections.setdefault(episode,{})
        for original,replacement in changes.items(): existing.setdefault(original,replacement)
        report.append({'episode':episode,'spelling_cues':len(changes)})
    temporary = target.with_suffix('.json.tmp')
    temporary.write_bytes(json.dumps(corrections,ensure_ascii=False,indent=2).encode('utf-8'))
    temporary.replace(target)
    (WORK/'spongebob-spelling-normalization.json').write_bytes(json.dumps({'purpose':'Canonical spelling of familiar names and terms only; cue timing and dialogue meaning are retained. This does not constitute human verification of the transcript.','episodes':report},ensure_ascii=False,indent=2).encode('utf-8'))
    print(f'Recorded spelling corrections in {sum(row["spelling_cues"] for row in report)} cues. Rebuild the cached SRTs to apply them.')


if __name__ == '__main__': main()
