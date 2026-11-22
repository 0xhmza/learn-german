"""Generate German SRTs directly from the German audio, locally on the GPU.

Use the isolated .venv-transcribe runtime. Model weights are local CTranslate2
data, never executable remote code. Completed episodes are resumable. Old
subtitles are backed up before an atomic replacement; Arabic tracks are retained.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from difflib import SequenceMatcher
import hashlib
import inspect
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import sysconfig
import time

from transcript_tools import apply_text_corrections, make_cues, review_flags, srt

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'media'
WORK = MEDIA / 'dub-transcripts'
BACKUP = WORK / 'previous-subtitles'
DEFAULT_MODEL = ROOT / '.models' / 'whisper-large-v3'
DLL_HANDLES = []


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        return fallback


def configure_cuda():
    if os.name != 'nt':
        return
    directory = Path(sysconfig.get_paths()['purelib']) / 'nvidia'
    folders = sorted({str(file.parent) for file in directory.rglob('*.dll')})
    for folder in folders:
        DLL_HANDLES.append(os.add_dll_directory(folder))
    if folders:
        os.environ['PATH'] = os.pathsep.join(folders) + os.pathsep + os.environ.get('PATH', '')


def video_info(video):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', str(video)], capture_output=True, check=True, timeout=30)
    info = json.loads(result.stdout)
    if not any(stream['codec_type'] == 'audio' for stream in info['streams']):
        raise ValueError(f'{video.name} has no audio stream.')
    with video.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return float(info['format']['duration']), digest


def validate_srt(text, duration, pilot=False, dialogue_end=None):
    code = "const S=require('./public/subtitles');let x='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>x+=s);process.stdin.on('end',()=>{const c=S.parse(x);console.log(JSON.stringify({cues:c.length,first:c[0].start,last:c.at(-1).end,ordered:c.every((q,i)=>!i||q.start>=c[i-1].start)}));});"
    result = subprocess.run(['node', '-e', code], input=text.encode('utf-8'), capture_output=True, cwd=ROOT, timeout=15, check=True)
    info = json.loads(result.stdout)
    if not info['ordered'] or info['last'] > duration + 0.2 or info['cues'] < (5 if pilot else 100):
        raise ValueError('The recognized subtitles failed duration, ordering or completeness checks.')
    if dialogue_end is not None and not 0 < dialogue_end <= duration:
        raise ValueError('The reviewed dialogue boundary is outside the video.')
    expected_end = dialogue_end * 0.98 if dialogue_end is not None else duration * 0.8
    if not pilot and info['last'] < expected_end:
        raise ValueError('Recognition ended too early; the previous subtitle file was preserved.')
    return info


def segment_record(segment, offset=0):
    return {'start': segment.start + offset, 'end': segment.end + offset, 'text': segment.text,
            'avg_logprob': segment.avg_logprob, 'no_speech_prob': segment.no_speech_prob,
            'compression_ratio': segment.compression_ratio,
            'words': [{'start': word.start + offset, 'end': word.end + offset, 'word': word.word, 'probability': word.probability} for word in segment.words or []]}


def refine_gaps(model, audio, segments, duration, pipeline=None, batch_size=4):
    """Recheck anomalous timestamps against an uncropped audio window.

    VAD concatenation can attach a sentence's first word to an earlier speech
    island. A second recognition pass includes the intervening original audio;
    it is accepted only when it agrees with the sentence, not an external script.
    """
    normalize = lambda text: re.sub(r'\W+', '', text.casefold())
    windows = {}
    for index, segment in enumerate(segments):
        words = segment.get('words') or []
        gaps = [(words[index + 1]['start'] - word['end'], index) for index, word in enumerate(words[:-1])]
        mean_confidence = sum(float(word.get('probability', 0)) for word in words) / max(1, len(words))
        uncertain = mean_confidence < 0.82 or any(len(re.sub(r'\W', '', word['word'])) > 2 and word['probability'] < 0.55 for word in words)
        timing_gap = bool(gaps and max(gaps)[0] >= 1.5)
        if not timing_gap and not uncertain:
            continue
        gap, word_index = max(gaps) if gaps else (0, 0)
        start = max(0, words[word_index + 1]['start'] - 2 if timing_gap and gap > 3 else segment['start'] - 0.6)
        end = min(duration, segment['end'] + 0.6)
        windows[index] = (start, end, timing_gap, mean_confidence)

    batched = {}
    if pipeline and windows:
        # The batched API returns the original clip offset in its seek field.
        # Skip duplicate offsets and clips that exceed its 30-second limit.
        by_seek = {}
        for index, (start, end, _, _) in windows.items():
            seek = int(int(start * 16000) / 16000 * model.frames_per_second)
            by_seek.setdefault(seek, []).append(index)
        unique = {seek:indices[0] for seek,indices in by_seek.items()
                  if len(indices) == 1 and 0.02 < windows[indices[0]][1] - windows[indices[0]][0] <= 30}
        clips = [{'start':windows[index][0], 'end':windows[index][1]} for index in unique.values()]
        if clips:
            batched = {index:[] for index in unique.values()}
            candidates, _ = pipeline.transcribe(audio, language='de', task='transcribe', clip_timestamps=clips,
                                                beam_size=10, temperature=0.0, word_timestamps=True, batch_size=batch_size)
            for candidate in candidates:
                if candidate.seek in unique:
                    batched[unique[candidate.seek]].append(segment_record(candidate))

    refined = []
    for index, segment in enumerate(segments):
        if index not in windows:
            refined.append(segment)
            continue
        start, end, timing_gap, mean_confidence = windows[index]
        if index in batched:
            candidates = batched[index]
        else:
            candidates, _ = model.transcribe(audio[round(start * 16000):round(end * 16000)], language='de', task='transcribe',
                                            beam_size=10, temperature=0.0, word_timestamps=True,
                                            vad_filter=False, condition_on_previous_text=False)
            candidates = [segment_record(candidate, start) for candidate in candidates]
        if not timing_gap:
            # Context can include a neighboring utterance; retain only words in
            # this utterance's own time window rather than duplicate its neighbor.
            for candidate in candidates:
                candidate['words'] = [word for word in candidate['words'] if segment['start'] - 0.2 <= (word['start'] + word['end']) / 2 <= segment['end'] + 0.2]
                if candidate['words']:
                    candidate['start'] = candidate['words'][0]['start'];candidate['end'] = candidate['words'][-1]['end']
                    candidate['text'] = ''.join(word['word'] for word in candidate['words'])
            candidates = [candidate for candidate in candidates if candidate['words']]
        agreement = SequenceMatcher(None, normalize(segment['text']), normalize(' '.join(candidate['text'] for candidate in candidates))).ratio()
        candidate_words = [word for candidate in candidates for word in candidate['words']]
        candidate_confidence = sum(word['probability'] for word in candidate_words) / max(1,len(candidate_words))
        if candidates and agreement >= (0.85 if timing_gap else 0.6) and (timing_gap or candidate_confidence > mean_confidence + 0.03):
            for candidate in candidates:
                candidate['rechecked_against_original_audio'] = True
            refined.extend(candidates)
        else:
            if timing_gap: segment['timing_needs_review'] = True
            refined.append(segment)
    return refined


def transcribe(model, pipeline, video, episode, args, status):
    duration, fingerprint = video_info(video)
    raw_path = WORK / f'{episode}.words.json'
    raw = read_json(raw_path, {})
    model_source = read_json(args.model / 'source.json', {'repository': 'Systran/faster-whisper-large-v3'})
    refine_mode = 'batched' if getattr(args, 'batch_refine', False) else 'serial'
    reusable = (raw.get('complete') and raw.get('pipeline_version') == 3 and raw.get('video_sha256') == fingerprint
                and raw.get('model') == model_source and not args.sample_seconds
                and (args.rebuild_from_cache or raw.get('refinement', 'serial') == refine_mode))
    started = time.monotonic()
    if reusable:
        print(f'{episode}: reusing completed audio transcript', flush=True)
    else:
        if args.rebuild_from_cache:
            raise ValueError('No matching completed audio transcript is cached; installed subtitles were preserved.')
        from faster_whisper.audio import decode_audio
        print(f'{episode}: decoding the German audio', flush=True)
        audio = decode_audio(str(video), sampling_rate=16000)
        if args.sample_seconds:
            audio = audio[:round(args.sample_seconds * 16000)]
            duration = min(duration, args.sample_seconds)
        options = {'language': 'de', 'task': 'transcribe', 'beam_size': 5, 'temperature': 0.0, 'without_timestamps': False,
                   'word_timestamps': True, 'vad_filter': True,
                   'vad_parameters': {'threshold': 0.35, 'min_speech_duration_ms': 120, 'min_silence_duration_ms': 500, 'speech_pad_ms': 500},
                   'batch_size': args.batch_size, 'condition_on_previous_text': False}
        parameters = inspect.signature(pipeline.transcribe).parameters
        options = {key: value for key, value in options.items() if key in parameters}
        segments, info = pipeline.transcribe(audio, **options)
        raw = {'episode': episode, 'model': model_source, 'pipeline_version': 3, 'video': video.name, 'video_sha256': fingerprint,
               'language': 'de', 'task': 'transcribe', 'sample_seconds': args.sample_seconds,
               'duration': duration, 'complete': False, 'segments': [], 'refinement': refine_mode, 'created_at': datetime.now(timezone.utc).isoformat()}
        last_output = 0
        for segment in segments:
            item = segment_record(segment)
            raw['segments'].append(item)
            now = time.monotonic()
            if now - last_output >= 20:
                print(f'{episode}: recognized through {segment.end / 60:.1f} / {duration / 60:.1f} min', flush=True)
                if not args.sample_seconds:
                    write_json(raw_path, raw)
                status['episodes'][episode] = {'status': 'transcribing', 'audio_seconds': segment.end, 'duration': duration}
                write_json(WORK / 'status.json', status)
                last_output = now
        raw['segments'] = refine_gaps(model, audio, raw['segments'], duration,
                                     pipeline if refine_mode == 'batched' else None, min(8,args.batch_size))
        raw['complete'] = True
        raw['elapsed_seconds'] = round(time.monotonic() - started, 2)
        write_json(WORK / (f'pilot.{episode}.words.json' if args.sample_seconds else raw_path.name), raw)
    cues = apply_text_corrections(make_cues(raw['segments'], duration), read_json(WORK / 'corrections.json', {}).get(episode, {}))
    text = srt(cues)
    boundary = read_json(WORK / 'completeness-overrides.json', {}).get(episode, {})
    dialogue_end = boundary.get('dialogue_end') if not args.sample_seconds and boundary.get('video_sha256') == fingerprint else None
    validated = validate_srt(text, duration, bool(args.sample_seconds), dialogue_end)
    review = review_flags(raw['segments'])
    write_json(WORK / (f'pilot.{episode}.review.json' if args.sample_seconds else f'{episode}.review.json'), {'episode': episode, 'model': model_source, 'flags': review})
    if args.sample_seconds:
        target = WORK / f'pilot.{episode}.de.srt'
        target.write_bytes(text.encode('utf-8'))
        status['episodes'][episode] = {'status': 'pilot_complete', 'cues': len(cues)}
        write_json(WORK / 'status.json', status)
        print(f'{episode}: pilot ready, {len(cues)} cues; root subtitles unchanged', flush=True)
        return
    BACKUP.mkdir(exist_ok=True)
    destination = MEDIA / (f'{episode}.de.srt' if '.' in episode else f'simpsons.{episode}.de.srt')
    old = BACKUP / destination.name
    if destination.exists() and not old.exists():
        shutil.copy2(destination, old)
    temporary = WORK / f'{episode}.de.srt.tmp'
    temporary.write_bytes(text.encode('utf-8'))
    temporary.replace(destination)
    manifest_path = WORK / 'manifest.json'
    manifest = read_json(manifest_path, {'version': 1, 'episodes': {}})
    manifest['episodes'][episode] = {'status': 'complete', 'kind': 'audio-transcript', 'file': destination.name,
                                    'source': 'German audio transcript · AI generated', 'model': model_source,
                                    'srt_sha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
                                    'video_sha256': fingerprint, 'created_at': raw['created_at'],
                                    'cue_count': len(cues), 'word_count': sum(cue['words'] for cue in cues),
                                    'spelling_corrections': sum(bool(cue.get('spelling_corrected')) for cue in cues),
                                    'review_flags': len(review), 'human_verified': False, **validated}
    if dialogue_end is not None:
        manifest['episodes'][episode]['completeness_review'] = boundary
    write_json(manifest_path, manifest)
    status['episodes'][episode] = {'status': 'complete', 'cues': len(cues), 'review_flags': len(review)}
    write_json(WORK / 'status.json', status)
    print(f'{episode}: published {len(cues)} cues from German audio; {len(review)} passages flagged for review; {time.monotonic()-started:.0f}s', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--series', choices=['simpsons','spongebob'], default='simpsons')
    parser.add_argument('--season', type=int)
    parser.add_argument('--wait-for-media', action='store_true', help='Wait up to 25 minutes for each queued local video.')
    parser.add_argument('--episodes')
    parser.add_argument('--model', type=Path, default=DEFAULT_MODEL)
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--batch-refine', action='store_true', help='Recheck uncertain audio windows in GPU batches.')
    parser.add_argument('--sample-seconds', type=float, default=0, help='Create a pilot without replacing installed subtitles.')
    parser.add_argument('--rebuild-from-cache', action='store_true', help='Apply text corrections from cached recognized words without rerunning the model.')
    args = parser.parse_args()
    season = args.season if args.season is not None else (6 if args.series == 'simpsons' else 3)
    maximum = 25 if args.series == 'simpsons' else 20
    numbers = sorted(set(int(value) for value in args.episodes.split(','))) if args.episodes else list(range(1,maximum+1))
    if not 1 <= season <= 30 or not numbers or any(number not in range(1, maximum+1) for number in numbers):
        parser.error(f'Choose a valid season and episodes 1–{maximum}.')
    if not 1 <= args.batch_size <= 16 or args.sample_seconds < 0:
        parser.error('Invalid batch size or sample duration.')
    args.model = args.model.resolve()
    WORK.mkdir(exist_ok=True)
    model = pipeline = None
    if not args.rebuild_from_cache:
        configure_cuda()
        import ctranslate2
        from faster_whisper import WhisperModel, BatchedInferencePipeline
        if ctranslate2.get_cuda_device_count() < 1:
            raise SystemExit('No CUDA GPU is available; no subtitle files were replaced.')
        print('Loading the local large-v3 multilingual model on CUDA (int8_float16).', flush=True)
        model = WhisperModel(str(args.model), device='cuda', compute_type='int8_float16', cpu_threads=6, num_workers=1, local_files_only=True)
        pipeline = BatchedInferencePipeline(model=model)
    status = read_json(WORK / 'status.json', {'episodes': {}})
    failures = []
    for number in numbers:
        episode = ('' if args.series == 'simpsons' and season == 6 else args.series + '.') + f's{season:02d}e{number:02d}'
        try:
            video = MEDIA / (f'{episode}.mp4' if '.' in episode else f'simpsons.{episode}.mp4')
            if args.wait_for_media and not video.exists():
                print(f'{episode}: waiting for its German video download',flush=True)
                deadline = time.monotonic()+1500
                while not video.exists() and time.monotonic()<deadline: time.sleep(5)
            transcribe(model, pipeline, video, episode, args, status)
        except Exception as error:
            failures.append(episode)
            status['episodes'][episode] = {'status': 'failed', 'error': str(error)}
            write_json(WORK / 'status.json', status)
            print(f'{episode}: FAILED: {type(error).__name__}: {error}', flush=True)
    print(f'Finished: {len(numbers) - len(failures)}/{len(numbers)} episodes. Failures: {", ".join(failures) or "none"}.', flush=True)
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
