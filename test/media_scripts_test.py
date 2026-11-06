import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent


def downloader():
    spec = importlib.util.spec_from_file_location('season_downloader', ROOT/'scripts'/'download-season.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CollectionMediaTests(unittest.TestCase):
    def test_reviewed_credit_tail_does_not_relax_the_default_completeness_guard(self):
        sys.path.insert(0,str(ROOT/'scripts'))
        try:
            spec = importlib.util.spec_from_file_location('dub_transcriber', ROOT/'scripts'/'transcribe-dub.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        finally: sys.path.pop(0)
        cues = []
        for index in range(100):
            start = f'00:{index//60:02d}:{index%60:02d},000'
            end = f'00:{(index+1)//60:02d}:{(index+1)%60:02d},000'
            cues.append(f'{index+1}\n{start} --> {end}\nEin Satz.')
        cues.append('101\n00:22:29,000 --> 00:22:30,000\nDer letzte Satz.')
        text = '\n\n'.join(cues)
        with self.assertRaises(ValueError): module.validate_srt(text,1738)
        self.assertEqual(module.validate_srt(text,1738,dialogue_end=1376)['cues'],101)
        with self.assertRaises(ValueError): module.validate_srt(text,1738,dialogue_end=1800)

    def test_episode_discovery_keeps_shows_separate_and_selects_german(self):
        module = downloader()
        module.SERIES, module.SEASON_NUMBER = 'spongebob', 3
        page = module.Page()
        page.feed('''<a href="/serie/spongebob/staffel-3/episode-1">1</a>
          <a href="/serie/simpsons/staffel-6/episode-1">other show</a>
          <a href="/serie/spongebob/staffel-2/episode-1">other season</a>
          <div data-language-id="2" data-provider-name="VOE" data-play-url="/english"></div>
          <div data-language-id="1" data-provider-name="VOE" data-play-url="/german"></div>''')
        self.assertEqual(page.episodes, ['https://serienstream.to/serie/spongebob/staffel-3/episode-1'])
        self.assertEqual([item['data-play-url'] for item in page.providers], ['/german'])

    def test_spongebob_status_does_not_overwrite_the_simpsons_download_report(self):
        module = downloader()
        with tempfile.TemporaryDirectory() as directory:
            module.MEDIA = Path(directory)
            original = module.MEDIA/'download-status.json'
            original.write_text('{"existing":"simpsons"}',encoding='utf-8')
            module.STATUS_NAME = 'spongebob.s03.download-status.json'
            module.REPORT = {'episodes':{}}
            module.record('spongebob.s03e01',status='failed',error='Temporary transport failure')
            module.record('spongebob.s03e01',status='complete',bytes=100)
            self.assertEqual(json.loads(original.read_text(encoding='utf-8')),{'existing':'simpsons'})
            report = json.loads((module.MEDIA/module.STATUS_NAME).read_text(encoding='utf-8'))
            self.assertEqual(report['episodes']['spongebob.s03e01']['status'],'complete')
            self.assertNotIn('error',report['episodes']['spongebob.s03e01'])
            self.assertEqual(report['episodes']['spongebob.s03e01']['downloaded_bytes'],100)

    def test_media_probe_accepts_short_spongebob_stories_and_requires_both_streams(self):
        module = downloader()
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory)/'episode.mp4'
            file.write_bytes(b'media')
            info = {'format':{'duration':'660'},'streams':[{'codec_type':'video'},{'codec_type':'audio'}]}
            completed = subprocess.CompletedProcess([],0,json.dumps(info),'')
            with patch.object(module.subprocess,'run',return_value=completed):
                module.SERIES = 'spongebob'
                self.assertEqual(module.probe(file)['duration'],660)
                module.SERIES = 'simpsons'
                with self.assertRaises(RuntimeError): module.probe(file)
            info['streams'] = [{'codec_type':'video'}]
            with patch.object(module.subprocess,'run',return_value=subprocess.CompletedProcess([],0,json.dumps(info),'')):
                module.SERIES = 'spongebob'
                with self.assertRaises(RuntimeError): module.probe(file)


if __name__ == '__main__': unittest.main()
