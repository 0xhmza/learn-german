"""Install the two available Arabic stories as one timed episode-1 track.

The source numbers eleven-minute stories separately; the German videos pair them.
Keep the originals, remove only uploader credit cues, and use separate timing
anchors for each story rather than stretching one subtitle across the whole video.
"""
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'media'
ARTIFACTS = ROOT / 'artifacts' / 'spongebob'
ORIGINALS = MEDIA / 'subtitles-original'
EPISODE = 'spongebob.s03e01'
SOURCES = [
    {'archive':'s03a.zip','url':'https://dl.subdl.com/subtitle/2378160-1920863.zip',
     'page':'https://subdl.com/s/info/tYUw42WBds/spongebob-squarepants',
     'story':'The Algae’s Always Greener','anchors':[[18.151,62.410],[690.450,735.510]]},
    {'archive':'s03b.zip','url':'https://dl.subdl.com/subtitle/2378159-1920865.zip',
     'page':'https://subdl.com/s/info/JTTMcexCAK/spongebob-squarepants',
     'story':'SpongeGuard on Duty','anchors':[[12.570,756.070],[648.340,1392.050]]},
]


def node(program, data):
    result = subprocess.run(['node','-e',program],input=json.dumps(data,ensure_ascii=False).encode('utf-8'),capture_output=True,cwd=ROOT,check=True)
    return json.loads(result.stdout)


def main():
    manifest = json.loads((MEDIA/'dub-transcripts'/'manifest.json').read_text(encoding='utf-8'))
    transcript = manifest['episodes'][EPISODE]
    if transcript['status'] != 'complete': raise ValueError('Generate the German audio transcript first.')
    video = MEDIA / f'{EPISODE}.mp4'
    with video.open('rb') as stream: fingerprint = hashlib.file_digest(stream,'sha256').hexdigest()
    if fingerprint != transcript['video_sha256']: raise ValueError('The German video changed; timing must be checked again.')
    ORIGINALS.mkdir(exist_ok=True)
    cues = []
    details = []
    for index, source in enumerate(SOURCES):
        with ZipFile(ARTIFACTS/source['archive']) as archive:
            members = [member for member in archive.infolist() if member.filename.lower().endswith('.srt') and member.file_size < 2_000_000]
            if len(members) != 1: raise ValueError('Expected exactly one SRT per story.')
            content = archive.read(members[0])
        try: text = content.decode('utf-8-sig')
        except UnicodeDecodeError: text = content.decode('windows-1256')
        text = text.replace('\r\n','\n').replace('\r','\n')
        original = ORIGINALS/f'{EPISODE}{chr(97+index)}.ar.srt'
        original.write_bytes(text.encode('utf-8'))
        parsed = node("const S=require('./public/subtitles');let x='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>x+=s);process.stdin.on('end',()=>console.log(JSON.stringify(S.parse(JSON.parse(x)))));",text)
        (a,b),(c,d) = source['anchors'];scale = (d-b)/(c-a);offset = b-a*scale
        # First cue is the uploader's name, not dialogue in the episode.
        mapped = [{**cue,'start':round(cue['start']*scale+offset,3),'end':round(cue['end']*scale+offset,3)} for cue in parsed[1:]]
        cues.extend(mapped)
        details.append({**source,'original':original.name,'original_sha256':hashlib.sha256(content).hexdigest(),'scale':scale,'offset':offset,'cues':len(mapped),'removed_uploader_credits':1})
    cues.sort(key=lambda cue:cue['start'])
    if any(cue['start'] < 0 or cue['end'] > transcript['last']+0.3 for cue in cues): raise ValueError('Arabic cue is outside the verified episode.')
    exported = node("const S=require('./public/subtitles');let x='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>x+=s);process.stdin.on('end',()=>console.log(JSON.stringify(S.srt(JSON.parse(x)))));",cues)
    target = MEDIA / f'{EPISODE}.ar.srt'
    if target.exists() and target.read_text(encoding='utf-8').replace('\r\n','\n') != exported: raise ValueError('Existing Arabic subtitles differ; preserve them for review.')
    target.write_bytes(exported.encode('utf-8'))
    report = {'episode':EPISODE,'file':target.name,'language':'ar','source':'Arabic subtitles by OmarKB · two paired stories',
              'video_sha256':fingerprint,'srt_sha256':hashlib.sha256(exported.encode('utf-8')).hexdigest(),'cues':len(cues),
              'timing_method':'Separate affine anchors against the downloaded German audio transcript for each story; not human verified throughout.',
              'tracks':details}
    (MEDIA/'spongebob.s03.subtitle-provenance.json').write_bytes(json.dumps(report,ensure_ascii=False,indent=2).encode('utf-8'))
    print(f'Arabic ready: {len(cues)} cues across both stories in episode 1. Other episodes have no Arabic track installed.')


if __name__ == '__main__': main()
