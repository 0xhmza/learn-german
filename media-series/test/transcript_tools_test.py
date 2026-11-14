import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from transcript_tools import apply_text_corrections, make_cues, normal_text, review_flags, srt


class TranscriptTests(unittest.TestCase):
    def test_sentences_preserve_every_spoken_word(self):
        words = [{'start': i * 0.3 + 1, 'end': i * 0.3 + 1.25, 'word': text, 'probability': 0.9}
                 for i, text in enumerate([' Guten', ' Morgen!', ' Was', ' machst', ' du?'])]
        cues = make_cues([{'words': words}], 10)
        self.assertEqual([cue['text'] for cue in cues], ['Guten Morgen!', 'Was machst du?'])
        self.assertEqual(sum(cue['words'] for cue in cues), len(words))
        self.assertLessEqual(cues[0]['end'], cues[1]['start'])
        self.assertIn('00:00:00,960 -->', srt(cues))

    def test_long_pause_does_not_create_one_long_replay(self):
        cues = make_cues([{'words': [{'start': 1, 'end': 1.5, 'word': 'Ach'}, {'start': 8, 'end': 8.5, 'word': 'so.'}]}], 10)
        self.assertEqual(len(cues), 2)
        self.assertLess(cues[0]['end'], 2)

    def test_invalid_timestamps_cannot_replace_existing_subtitles(self):
        for start, end in [(float('nan'), 1), (-1, 1), (2, 1), (1, 20)]:
            with self.assertRaises(ValueError):
                make_cues([{'words': [{'start': start, 'end': end, 'word': 'Hallo'}]}], 10)

    def test_uncertainty_is_recorded_without_changing_words(self):
        segment = {'start': 1, 'end': 2, 'text': 'Homer!', 'avg_logprob': -0.1,
                   'words': [{'start': 1, 'end': 2, 'word': 'Homer!', 'probability': 0.2}]}
        self.assertEqual(review_flags([segment])[0]['uncertain_words'], ['Homer!'])
        self.assertEqual(make_cues([segment], 10)[0]['text'], 'Homer!')

    def test_spelling_corrections_are_exact_and_keep_word_timing(self):
        cues = [{'start':1,'end':2,'text':'Oh, verfliegst.'}, {'start':3,'end':4,'text':'Du verfliegst dich.'}]
        corrected = apply_text_corrections(cues, {'Oh, verfliegst.':'Oh, verflixt!'})
        self.assertEqual(corrected[0]['text'],'Oh, verflixt!')
        self.assertEqual(corrected[1],cues[1])
        self.assertEqual(corrected[0]['start'],1)
        self.assertEqual(corrected[0]['end'],2)
        self.assertEqual(cues[0]['text'],'Oh, verfliegst.')


if __name__ == '__main__':
    unittest.main()
