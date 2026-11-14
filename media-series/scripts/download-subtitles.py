"""Fetch the German episode tracks and an Arabic season pack for local use.

ZIP members are read individually without extracting paths or executable files.
Files are normalized to UTF-8 and validated by the player's own SRT parser.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import subprocess
import urllib.parse
import zipfile

from curl_cffi import requests

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'media'
ORIGINALS = MEDIA / 'subtitles-original'
# The downloaded German WEB release is 25 fps; DSNP subtitles use 24000/1001.
PAL_SCALE = 960 / 1001
BASE = 'https://subf2m.co'
SEASON = BASE + '/subtitles/the-simpsons-sixth-season'


class Items(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.text = []
        self.url = None
        self.items = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'li':
            if 'item' in attrs.get('class', '').split() and not self.depth:
                self.depth = 1
                self.text = []
                self.url = None
            elif self.depth:
                self.depth += 1
        if self.depth and tag == 'a' and re.search(r'/(german|arabic)/\d+$', attrs.get('href', '')):
            self.url = urllib.parse.urljoin(BASE, attrs['href'])

    def handle_data(self, data):
        if self.depth:
            self.text.append(data.strip())

    def handle_endtag(self, tag):
        if tag == 'li' and self.depth:
            self.depth -= 1
            if not self.depth and self.url:
                self.items.append({'text': ' '.join(s for s in self.text if s), 'url': self.url})


def get(url):
    response = requests.get(url, impersonate='chrome', timeout=40)
    response.raise_for_status()
    if len(response.content) > 5_000_000:
        raise ValueError('Unexpectedly large subtitle response.')
    return response


def listing(language):
    parsed = Items()
    parsed.feed(get(SEASON + '/' + language).text)
    return parsed.items


def decode(data, language):
    for encoding in ['utf-8-sig', 'utf-16' if data[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8', 'windows-1256' if language == 'ar' else 'windows-1252']:
        try:
            return data.decode(encoding)
        except UnicodeError:
            continue
    raise ValueError('Unrecognized subtitle encoding.')


def validate(text):
    program = "const S=require('./public/subtitles');let x='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>x+=s);process.stdin.on('end',()=>{const c=S.parse(x);console.log(JSON.stringify({cues:c.length,first:c[0].start,last:c.at(-1).end}));});"
    result = subprocess.run(['node', '-e', program], input=text.encode('utf-8'), capture_output=True, cwd=ROOT, timeout=15)
    if result.returncode:
        raise ValueError('The player rejected the subtitle file.')
    info = json.loads(result.stdout)
    if info['cues'] < 100 or info['last'] < 900:
        raise ValueError('Incomplete episode subtitle track.')
    return info


def pal_timing(text):
    def replace(match):
        hours, minutes, seconds, millis = map(int, match.groups())
        value = round((hours * 3600000 + minutes * 60000 + seconds * 1000 + millis) * PAL_SCALE)
        return f'{value // 3600000:02d}:{value // 60000 % 60:02d}:{value // 1000 % 60:02d},{value % 1000:03d}'
    return re.sub(r'(\d{2}):(\d{2}):(\d{2})[,.](\d{3})', replace, text)


def download(item, language, expected=None):
    content = get(item['url'] + '/download').content
    if not content.startswith(b'PK'):
        raise ValueError('The subtitle provider did not return a ZIP archive.')
    saved = []
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        for member in archive.infolist():
            if not member.filename.lower().endswith('.srt') or member.file_size > 2_000_000:
                continue
            match = re.search(r'S0?6[. _-]?E(\d{1,2})(?!\d)|(?:\b|_)6x(\d{1,2})(?!\d)', member.filename, re.I)
            number = int(next(value for value in match.groups() if value)) if match else expected
            if number not in range(1, 26):
                continue
            if expected and number != expected:
                raise ValueError('Subtitle filename does not match the selected episode.')
            text = decode(archive.read(member), language)
            episode = f's06e{number:02d}'
            validate(text)
            ORIGINALS.mkdir(exist_ok=True)
            original = ORIGINALS / f'simpsons.{episode}.{language}.srt'
            if not original.exists():
                original.write_bytes(text.replace('\r\n', '\n').encode('utf-8'))
            text = pal_timing(text)
            info = validate(text)
            target = MEDIA / f'simpsons.{episode}.{language}.srt'
            if not target.exists():
                target.write_text(text.replace('\r\n', '\n'), encoding='utf-8')
            saved.append({'episode': episode, 'language': language, 'file': target.name, 'source': item['url'], 'release': item['text'], 'time_scale': PAL_SCALE, 'timing_note': 'DSNP 24000/1001 fps converted to the German 25 fps video; unmodified copy retained in subtitles-original.', **info})
            print(f'{episode}: {language.upper()} subtitle ready ({info["cues"]} cues)', flush=True)
    if not saved:
        raise ValueError('No matching episode SRT files were present in the archive.')
    return saved


def main():
    MEDIA.mkdir(exist_ok=True)
    german = listing('german')
    tasks = []
    for item in german:
        match = re.search(r'S06E(\d{2})', item['text'], re.I)
        if match:
            tasks.append((item, int(match.group(1))))
    if len(tasks) != 25:
        raise SystemExit('The source did not list exactly 25 German episode tracks.')
    metadata = []
    failures = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(download, item, 'de', number): number for item, number in tasks}
        for future in as_completed(futures):
            try:
                metadata.extend(future.result())
            except Exception as error:
                number = futures[future]
                failures.append(f'DE episode {number}: {type(error).__name__}')
                print(f'DE episode {number}: failed ({type(error).__name__}: {error})', flush=True)
    arabic = listing('arabic')
    # Prefer the season pack explicitly listing the Disney Web releases.
    packs = [item for item in arabic if 'DSNP' in item['text'] and not re.search(r'S06E\d', item['text'], re.I)]
    for item in packs:
        try:
            metadata.extend(download(item, 'ar'))
            break
        except Exception as error:
            print(f'Arabic pack: failed ({type(error).__name__}: {error})', flush=True)
    else:
        failures.append('Arabic season pack unavailable')
    (MEDIA / 'subtitle-provenance.json').write_text(json.dumps({'tracks': metadata, 'failures': failures}, ensure_ascii=False, indent=2), encoding='utf-8')
    counts = {language: len(list(MEDIA.glob(f'simpsons.s06e*.{language}.srt'))) for language in ['de', 'ar']}
    print(f'Subtitles ready: German {counts["de"]}/25; Arabic {counts["ar"]}/25.', flush=True)
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
