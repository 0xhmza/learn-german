"""Translate the installed German SpongeBob subtitles into Arabic locally.

Uses OpenNMT's pinned NLLB-1.3B CTranslate2 weights. No text or video is uploaded.
Partial batches are resumable; existing subtitle tracks are backed up and only
replaced after an entire episode validates. Timestamps come from German cues.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sysconfig
import time

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT/'media'
WORK = MEDIA/'translations'
MODEL = ROOT/'.models'/'nllb-1.3b-int8'
PIPELINE = 1
DLL_HANDLES = []


def read_json(path, fallback):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except (OSError,ValueError): return fallback


def write_json(path, value):
    temporary = path.with_suffix(path.suffix+'.tmp')
    temporary.write_bytes(json.dumps(value,ensure_ascii=False,indent=2).encode('utf-8'))
    temporary.replace(path)


def digest(data): return hashlib.sha256(data).hexdigest()


def player_subtitles(operation, data):
    code = "const S=require('./public/subtitles');let x='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>x+=s);process.stdin.on('end',()=>console.log(JSON.stringify(S[process.argv[1]](JSON.parse(x)))));"
    task = subprocess.run(['node','-e',code,operation],input=json.dumps(data,ensure_ascii=False).encode('utf-8'),capture_output=True,cwd=ROOT,check=True,timeout=30)
    return json.loads(task.stdout)


def complete_sentence(text):
    return bool(re.search(r'[.!?…][\"\x27”»)]*$',text)) and not bool(re.search(r'\b(?:Mr|Mrs|Dr|Prof|bzw|usw|Nr)\.$',text))


def sentence_groups(cues):
    groups = []
    for index,cue in enumerate(cues):
        text = ' '.join(cue['text'].split())
        previous = groups[-1] if groups else None
        if previous and not complete_sentence(previous['text']) and cue['start']-previous['end'] <= 0.8 and cue['end']-previous['start'] <= 8 and len(previous['text'])+len(text) < 220:
            previous['text'] += ' '+text
            previous['end'] = max(previous['end'],cue['end'])
            previous['source_indices'].append(index)
        else: groups.append({'start':cue['start'],'end':cue['end'],'text':text,'source_indices':[index]})
    return groups


class Translator:
    def __init__(self, model):
        if os.name == 'nt':
            for folder in {str(p.parent) for p in (Path(sysconfig.get_paths()['purelib'])/'nvidia').rglob('*.dll')}:
                DLL_HANDLES.append(os.add_dll_directory(folder))
                os.environ['PATH'] = folder+os.pathsep+os.environ.get('PATH','')
        import ctranslate2
        from tokenizers import Tokenizer
        self.tokenizer = Tokenizer.from_file(str(model/'tokenizer.json'))
        self.model = ctranslate2.Translator(str(model),device='cuda',compute_type='int8_float16',inter_threads=1,intra_threads=6)

    def translate(self, texts):
        encoded = [['deu_Latn']+self.tokenizer.encode(text,add_special_tokens=False).tokens+['</s>'] for text in texts]
        if any(len(tokens)>512 for tokens in encoded): raise ValueError('A source sentence exceeds the model context; no subtitle was replaced.')
        results = self.model.translate_batch(encoded,target_prefix=[['arb_Arab'] for _ in texts],beam_size=4,max_batch_size=1024,batch_type='tokens',max_decoding_length=256,repetition_penalty=1.05)
        output = []
        for result in results:
            tokens = [token for token in result.hypotheses[0] if token not in ['arb_Arab','</s>','<s>','<pad>']]
            ids = [self.tokenizer.token_to_id(token) for token in tokens]
            if any(value is None for value in ids): raise ValueError('The model produced an unknown vocabulary token.')
            text = self.tokenizer.decode(ids,skip_special_tokens=True).strip()
            if not text or len(text)>4000: raise ValueError('The model produced an invalid or empty Arabic sentence.')
            output.append(text)
        return output


def translate_episode(engine, number, model_source, batch_size):
    episode = f'spongebob.s03e{number:02d}'
    source = MEDIA/f'{episode}.de.srt'
    data = source.read_bytes();source_hash = digest(data)
    cues = player_subtitles('parse',data.decode('utf-8-sig'))
    groups = sentence_groups(cues)
    cache_file = WORK/f'{episode}.ar.cache.json'
    cache = read_json(cache_file,{})
    if cache.get('source_sha256') != source_hash or cache.get('model') != model_source or cache.get('pipeline') != PIPELINE:
        cache = {'source_sha256':source_hash,'model':model_source,'pipeline':PIPELINE,'translations':[]}
    translated = cache['translations']
    if len(translated)>len(groups): raise ValueError('Cached translation count is invalid.')
    started = time.monotonic()
    for start in range(len(translated),len(groups),batch_size):
        texts = [group['text'] for group in groups[start:start+batch_size]]
        translated.extend(engine.translate(texts))
        write_json(cache_file,cache)
        write_json(WORK/'status.json',{'episode':episode,'status':'translating','done':len(translated),'total':len(groups),'updated':datetime.now(timezone.utc).isoformat()})
        if start % (batch_size*4) == 0: print(f'{episode}: {len(translated)}/{len(groups)} Arabic sentences',flush=True)
    target_cues = [{'start':group['start'],'end':group['end'],'text':text} for group,text in zip(groups,translated)]
    text = player_subtitles('srt',target_cues)
    verified = player_subtitles('parse',text)
    if len(verified) != len(groups) or any(abs(a['start']-b['start'])>0.002 or abs(a['end']-b['end'])>0.002 for a,b in zip(verified,groups)):
        raise ValueError('Translated subtitles failed cue count or timing checks.')
    if source.read_bytes() != data: raise ValueError('German subtitles changed during translation; the previous Arabic track was preserved.')
    target = MEDIA/f'{episode}.ar.srt'
    backup_dir = WORK/'previous-subtitles';backup_dir.mkdir(exist_ok=True)
    if target.exists() and target.read_bytes() != text.encode('utf-8'):
        backup = backup_dir/f'{episode}.{digest(target.read_bytes())[:12]}.ar.srt'
        if not backup.exists(): shutil.copy2(target,backup)
    temporary = WORK/f'{episode}.ar.srt.tmp';temporary.write_bytes(text.encode('utf-8'));temporary.replace(target)
    manifest = read_json(WORK/'manifest.json',{'version':1,'episodes':{}})
    manifest['episodes'][episode] = {'status':'complete','language':'ar','file':target.name,'source_file':source.name,'source_sha256':source_hash,'srt_sha256':digest(target.read_bytes()),'model':model_source,'pipeline':PIPELINE,'source_cues':len(cues),'cue_count':len(groups),'kind':'ai-translation','human_verified':False,'created':datetime.now(timezone.utc).isoformat()}
    write_json(WORK/'manifest.json',manifest)
    print(f'{episode}: Arabic ready, {len(groups)} timed sentences, {time.monotonic()-started:.0f}s',flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--episodes',default=','.join(str(i) for i in range(1,21)))
    parser.add_argument('--batch-size',type=int,default=16)
    args = parser.parse_args()
    numbers = sorted(set(int(value) for value in args.episodes.split(',')))
    if not numbers or any(number not in range(1,21) for number in numbers) or not 1<=args.batch_size<=64: parser.error('Choose valid season-3 episodes and a batch size from 1 to 64.')
    WORK.mkdir(exist_ok=True)
    model_source = read_json(MODEL/'source.json',{})
    if not model_source: raise ValueError('Install the pinned local NLLB model first.')
    print('Loading local NLLB German-to-Arabic model on CUDA.',flush=True)
    engine = Translator(MODEL);failures = []
    for number in numbers:
        try: translate_episode(engine,number,model_source,args.batch_size)
        except Exception as error:
            failures.append(number);print(f'Episode {number}: FAILED: {error}',flush=True)
    write_json(WORK/'status.json',{'status':'complete' if not failures else 'failed','episodes':numbers,'failures':failures,'updated':datetime.now(timezone.utc).isoformat()})
    print(f'Finished: {len(numbers)-len(failures)}/{len(numbers)} Arabic episodes.',flush=True)
    return bool(failures)


if __name__ == '__main__': raise SystemExit(main())
