"""Download the user-authorized German season into the local player library.

Requires the already installed yt-dlp, curl, ffmpeg and ffprobe. TLS verification
remains enabled. No site JavaScript is executed and no browser cookies are read.
Existing verified episodes are skipped; yt-dlp resumes interrupted fragments.
"""
from __future__ import annotations

import argparse
import base64
import codecs
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import urllib.parse
import urllib.request

import yt_dlp

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'media'
SOURCE = 'https://serienstream.to'
SERIES = 'simpsons'
SEASON_NUMBER = 6
STATUS_NAME = 'download-status.json'
SEASON = SOURCE + '/serie/simpsons/staffel-6'
UA = 'Mozilla/5.0'
LOCK = threading.Lock()
REPORT = {'source': SEASON, 'language': 'de', 'episodes': {}}
SOURCE_IP = None
VERIFICATION_NEEDED = threading.Event()


class VerificationRequired(RuntimeError):
    pass


def emit(message):
    with LOCK:
        print(message, flush=True)


def redact(message):
    return re.sub(r'https?://\S+', '[media URL]', str(message))


def record(episode, **values):
    with LOCK:
        REPORT['episodes'].setdefault(episode, {}).update(values)
        if values.get('status') == 'complete':
            REPORT['episodes'][episode].pop('error', None)
            if values.get('bytes'):
                REPORT['episodes'][episode]['downloaded_bytes'] = values['bytes']
                REPORT['episodes'][episode]['total_bytes_estimate'] = values['bytes']
        REPORT['updated'] = datetime.now(timezone.utc).isoformat()
        temporary = MEDIA / (STATUS_NAME + '.tmp')
        temporary.write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(MEDIA / STATUS_NAME)


def source_ip():
    # Resolve within this process; never change the user's OS or browser settings.
    query = 'https://dns.google/resolve?name=serienstream.to&type=A'
    with urllib.request.urlopen(query, timeout=20) as response:
        body = json.load(response)
    addresses = [answer['data'] for answer in body.get('Answer', []) if answer.get('type') == 1]
    if not addresses:
        raise RuntimeError('Could not resolve the source hostname.')
    return addresses[0]


def fetch_source(url):
    global SOURCE_IP
    for attempt in range(3):
        result = subprocess.run([
            'curl.exe' if shutil.which('curl.exe') else 'curl',
            '--resolve', f'serienstream.to:443:{SOURCE_IP}',
            '--location', '--fail', '--silent', '--show-error', '--max-time', '45',
            '--user-agent', UA, '--write-out', '\n__FINAL_URL__%{url_effective}', url,
        ], capture_output=True, timeout=50)
        if result.returncode == 0:
            break
        # Refresh ordinary DNS after a transport failure. Verification pages are
        # successful HTTP responses and are still handed to the user below.
        if attempt == 2:
            raise RuntimeError(redact(result.stderr.decode('utf-8', errors='replace')))
        time.sleep(2)
        SOURCE_IP = source_ip()
    page, separator, final = result.stdout.rpartition(b'\n__FINAL_URL__')
    if not separator:
        raise RuntimeError('Invalid response from the source.')
    return page.decode('utf-8', errors='replace'), final.decode('utf-8')


def fetch(url, referer=None):
    if urllib.parse.urlsplit(url).scheme != 'https':
        raise RuntimeError('The media URL must use HTTPS.')
    headers = {'User-Agent': UA}
    if referer:
        headers['Referer'] = referer
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=35) as response:
        content = response.read(4_000_001)
        if len(content) > 4_000_000:
            raise RuntimeError('Unexpectedly large player page or playlist.')
        return content.decode('utf-8', errors='replace'), response.url


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.providers = []
        self.episodes = []
        self.json_blocks = []
        self.in_json = False
        self.current_json = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('data-play-url') and attrs.get('data-language-id') == '1':
            self.providers.append(attrs)
        if tag == 'a' and re.search(rf'/serie/{SERIES}/staffel-{SEASON_NUMBER}/episode-\d+$', attrs.get('href', '')):
            self.episodes.append(urllib.parse.urljoin(SOURCE, attrs['href']))
        if tag == 'script' and attrs.get('type') == 'application/json':
            self.in_json = True
            self.current_json = ''

    def handle_data(self, data):
        if self.in_json:
            self.current_json += data

    def handle_endtag(self, tag):
        if tag == 'script' and self.in_json:
            self.json_blocks.append(self.current_json)
            self.in_json = False


def decode_player(page):
    parsed = Page()
    parsed.feed(page)
    for block in parsed.json_blocks:
        try:
            payload = json.loads(block)
            if not isinstance(payload, list) or not payload or not isinstance(payload[0], str):
                continue
            # The player's public configuration uses ROT13, separators and Base64.
            # Reimplement only those data transformations; do not eval downloaded JS.
            text = codecs.decode(payload[0], 'rot_13')
            for marker in ['@$', '^^', '~@', '%?', '*~', '!!', '#&']:
                text = text.replace(marker, '')
            text = base64.b64decode(text).decode('latin-1')
            text = ''.join(chr(ord(char) - 3) for char in text)[::-1]
            config = json.loads(base64.b64decode(text))
            if isinstance(config, dict) and config.get('source'):
                return config
        except (ValueError, TypeError, UnicodeError):
            continue
    raise RuntimeError('The player configuration could not be read. No media was downloaded.')


def resolve_episode(url):
    page, _ = fetch_source(url)
    parsed = Page()
    parsed.feed(page)
    providers = [p for p in parsed.providers if p.get('data-provider-name') == 'VOE']
    if not providers:
        raise RuntimeError('No German VOE playback link was found.')
    play_url = urllib.parse.urljoin(SOURCE, providers[0]['data-play-url'])
    page, player_url = fetch_source(play_url)
    for _ in range(4):
        if 'frameBridge' in page and 'postMessage' in page:
            VERIFICATION_NEEDED.set()
            raise VerificationRequired('The source requires browser verification before exposing this playback link.')
        try:
            return decode_player(page), player_url
        except RuntimeError:
            # Follow only a literal, ordinary player redirect; execute no scripts.
            redirect = re.search(r"window\.location\.href\s*=\s*['\"](https://[^'\"]+)['\"]", page)
            if not redirect:
                raise
            player_url = redirect.group(1)
            page, player_url = fetch(player_url)
    raise RuntimeError('Too many player redirects.')


def check_playlist(url, referer):
    playlist, final = fetch(url, referer)
    if not playlist.startswith('#EXTM3U'):
        raise RuntimeError('The player did not return an HLS playlist.')
    for marker in ['SAMPLE-AES', 'skd://', 'widevine', 'playready']:
        if marker.lower() in playlist.lower():
            raise RuntimeError('This stream requires DRM and was not downloaded.')
    variants = [line.strip() for line in playlist.splitlines() if line.strip() and not line.startswith('#')]
    if '#EXT-X-STREAM-INF' in playlist and variants:
        check_playlist(urllib.parse.urljoin(final, variants[-1]), referer)


def probe(file):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                             'format=duration,size:stream=codec_type,codec_name,width,height:stream_tags=language',
                             '-of', 'json', str(file)], capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError('ffprobe could not verify the downloaded file.')
    data = json.loads(result.stdout)
    duration = float(data.get('format', {}).get('duration', 0))
    streams = data.get('streams', [])
    if not (900 if SERIES == 'simpsons' else 300) < duration < (2000 if SERIES == 'simpsons' else 4000) or not any(s.get('codec_type') == 'audio' for s in streams) or not any(s.get('codec_type') == 'video' for s in streams):
        raise RuntimeError(f'Unexpected episode duration or missing audio/video: {duration:.1f}s.')
    return {'duration': round(duration, 3), 'bytes': file.stat().st_size, 'streams': streams}


class Logger:
    def __init__(self, episode): self.episode = episode
    def debug(self, message): pass
    def warning(self, message): emit(f'{self.episode}: warning: {redact(message)}')
    def error(self, message): emit(f'{self.episode}: {redact(message)}')


def download_episode(url):
    number = int(url.rsplit('-', 1)[1])
    episode = ('' if SERIES == 'simpsons' and SEASON_NUMBER == 6 else SERIES + '.') + f's{SEASON_NUMBER:02d}e{number:02d}'
    destination = MEDIA / (f'simpsons.{episode}.mp4' if SERIES == 'simpsons' and SEASON_NUMBER == 6 else f'{episode}.mp4')
    if destination.exists():
        verified = probe(destination)
        record(episode, status='complete', file=destination.name, **verified)
        emit(f'{episode}: already present and verified')
        return episode
    if VERIFICATION_NEEDED.is_set():
        raise VerificationRequired('Waiting for source verification; this episode was not requested again.')
    record(episode, status='resolving', episode_url=url)
    config, player_url = resolve_episode(url)
    title = config.get('title', episode)
    if not re.search(rf'S0?{SEASON_NUMBER}[. _-]?E0?{number}(?!\d)', title, re.I):
        raise RuntimeError(f'{episode}: player title does not match this episode.')
    record(episode, status='downloading', release=title, audio_language='de', language_evidence='German playback link (data-language-id=1) and source release title')
    emit(f'{episode}: German source found; downloading')
    check_playlist(config['source'], player_url)
    last_progress = [0.0]

    def progress(data):
        now = time.monotonic()
        if data.get('status') == 'downloading' and now - last_progress[0] > 25:
            done = data.get('downloaded_bytes', 0)
            total = data.get('total_bytes') or data.get('total_bytes_estimate')
            percent = f'{done / total * 100:.0f}%' if total else f'{done / 1048576:.1f} MiB'
            emit(f'{episode}: {percent}')
            record(episode, downloaded_bytes=done, total_bytes_estimate=total)
            last_progress[0] = now

    options = {
        'outtmpl': str(destination), 'format': 'best', 'noplaylist': True,
        'quiet': True, 'no_warnings': False, 'logger': Logger(episode),
        'http_headers': {'User-Agent': UA, 'Referer': player_url},
        'socket_timeout': 30, 'retries': 5, 'fragment_retries': 5,
        'file_access_retries': 12, 'retry_sleep_functions': {'file_access': lambda count: min(count, 4)},
        'concurrent_fragment_downloads': 4, 'skip_unavailable_fragments': False,
        'continuedl': True, 'overwrites': False,
        'hls_prefer_native': True, 'hls_use_mpegts': False,
        'postprocessors': [{'key': 'FFmpegVideoRemuxer', 'preferedformat': 'mp4'}],
        'progress_hooks': [progress],
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        downloader.download([config['source']])
    verified = probe(destination)
    record(episode, status='complete', file=destination.name, **verified)
    emit(f'{episode}: complete, {verified["duration"] / 60:.1f} minutes, {verified["bytes"] / 1048576:.1f} MiB')
    return episode


def main():
    global SOURCE_IP, SERIES, SEASON_NUMBER, SEASON, STATUS_NAME, REPORT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--series', default='simpsons', choices=['simpsons','spongebob'])
    parser.add_argument('--season', type=int)
    parser.add_argument('--episodes', help='Comma-separated episode numbers; default: all listed episodes')
    parser.add_argument('--workers', type=int, default=2, choices=[1, 2, 3])
    args = parser.parse_args()
    SERIES = args.series
    SEASON_NUMBER = args.season if args.season is not None else (6 if SERIES == 'simpsons' else 3)
    if not 1 <= SEASON_NUMBER <= 30: parser.error('Choose a season between 1 and 30.')
    SEASON = f'{SOURCE}/serie/{SERIES}/staffel-{SEASON_NUMBER}'
    STATUS_NAME = 'download-status.json' if SERIES == 'simpsons' and SEASON_NUMBER == 6 else f'{SERIES}.s{SEASON_NUMBER:02d}.download-status.json'
    REPORT = {'source':SEASON,'language':'de','episodes':{}}
    wanted = set(int(value) for value in args.episodes.split(',')) if args.episodes else None
    if wanted is not None and (not wanted or any(number < 1 or number > 100 for number in wanted)):
        parser.error('Episode numbers must be between 1 and 100.')
    for binary in ['ffmpeg', 'ffprobe']:
        if not shutil.which(binary): raise SystemExit(f'{binary} is required.')
    MEDIA.mkdir(exist_ok=True)
    if shutil.disk_usage(MEDIA).free < 8 * 1024**3:
        raise SystemExit('Keep at least 8 GiB free before downloading the season.')
    status_file = MEDIA / STATUS_NAME
    if status_file.exists():
        try: REPORT['episodes'] = json.loads(status_file.read_text(encoding='utf-8')).get('episodes', {})
        except (ValueError, OSError): pass
    SOURCE_IP = source_ip()
    page, _ = fetch_source(SEASON)
    parsed = Page()
    parsed.feed(page)
    urls = sorted(set(parsed.episodes), key=lambda value: int(value.rsplit('-', 1)[1]))
    if wanted is None: wanted = {int(url.rsplit('-', 1)[1]) for url in urls}
    urls = [url for url in urls if int(url.rsplit('-', 1)[1]) in wanted]
    if len(urls) != len(wanted):
        raise SystemExit('The source did not list all requested episode links.')
    emit(f'Found {len(urls)} requested episodes; {args.workers} concurrent downloads.')
    failures = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(download_episode, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            episode = ('' if SERIES == 'simpsons' and SEASON_NUMBER == 6 else SERIES + '.') + f's{SEASON_NUMBER:02d}e{int(url.rsplit("-", 1)[1]):02d}'
            try: future.result()
            except Exception as error:
                message = redact(error)
                failures.append(episode)
                record(episode, status='verification_required' if isinstance(error, VerificationRequired) else 'failed', error=message)
                emit(f'{episode}: FAILED: {message}')
    emit(f'Finished: {len(urls) - len(failures)}/{len(urls)} verified. Failed: {", ".join(failures) or "none"}.')
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
