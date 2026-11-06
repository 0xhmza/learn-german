import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('arabic_translation',ROOT/'scripts'/'translate-spongebob.py')
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)


class TranslationTests(unittest.TestCase):
    def test_incomplete_sentences_join_without_spanning_long_gaps_or_finished_sentences(self):
        cues=[{'start':1,'end':2,'text':'Guten'}, {'start':2.3,'end':3,'text':'Morgen!'}, {'start':3.1,'end':4,'text':'Mr.'}, {'start':4.3,'end':5,'text':'Krabs!'}, {'start':6,'end':7,'text':'Der'}, {'start':9,'end':10,'text':'Abend.'}]
        grouped=T.sentence_groups(cues)
        self.assertEqual([c['text'] for c in grouped],['Guten Morgen!','Mr. Krabs!','Der','Abend.'])
        self.assertEqual(grouped[0]['start'],1)
        self.assertEqual(grouped[0]['end'],3)
        self.assertEqual(grouped[0]['source_indices'],[0,1])

    def test_publication_is_atomic_resumable_and_backs_up_existing_track(self):
        class Engine:
            calls=0
            def translate(self,texts):
                self.calls+=1
                if self.calls==2: raise RuntimeError('interrupted')
                return ['مرحبا.' for _ in texts]
        with tempfile.TemporaryDirectory() as folder:
            media=Path(folder);work=media/'translations';work.mkdir()
            source=media/'spongebob.s03e01.de.srt'
            source.write_text('1\n00:00:01,000 --> 00:00:02,000\nHallo.\n\n2\n00:00:03,000 --> 00:00:04,000\nDanke.',encoding='utf-8')
            target=media/'spongebob.s03e01.ar.srt';target.write_text('previous track',encoding='utf-8')
            engine=Engine()
            with patch.object(T,'MEDIA',media),patch.object(T,'WORK',work):
                with self.assertRaises(RuntimeError): T.translate_episode(engine,1,{'revision':'pinned'},1)
                self.assertEqual(target.read_text(encoding='utf-8'),'previous track')
                T.translate_episode(engine,1,{'revision':'pinned'},1)
                self.assertEqual(engine.calls,3) # First completed batch was reused.
                manifest=T.read_json(work/'manifest.json',{})['episodes']['spongebob.s03e01']
                self.assertEqual(manifest['cue_count'],2)
                self.assertEqual(manifest['source_sha256'],T.digest(source.read_bytes()))
                self.assertEqual(manifest['srt_sha256'],T.digest(target.read_bytes()))
                self.assertFalse(manifest['human_verified'])
                backups=list((work/'previous-subtitles').glob('*.srt'))
                self.assertEqual(len(backups),1)
                self.assertEqual(backups[0].read_text(encoding='utf-8'),'previous track')

    def test_source_changed_during_inference_keeps_previous_arabic(self):
        with tempfile.TemporaryDirectory() as folder:
            media=Path(folder);work=media/'translations';work.mkdir()
            source=media/'spongebob.s03e01.de.srt';source.write_text('1\n00:00:01,000 --> 00:00:02,000\nHallo.',encoding='utf-8')
            target=media/'spongebob.s03e01.ar.srt';target.write_text('previous track',encoding='utf-8')
            class Engine:
                def translate(self,texts):
                    source.write_text('Changed',encoding='utf-8')
                    return ['مرحبا.']
            with patch.object(T,'MEDIA',media),patch.object(T,'WORK',work):
                with self.assertRaisesRegex(ValueError,'German subtitles changed'): T.translate_episode(Engine(),1,{'revision':'pinned'},1)
            self.assertEqual(target.read_text(encoding='utf-8'),'previous track')


if __name__ == '__main__': unittest.main()
