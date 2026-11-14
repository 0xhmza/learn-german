# Sprechzimmer

Part of the [learn-german](../grammar/docs/repository.md) repository. Run every command below from this `media-player/` folder. The grammar platform lives in [`../grammar`](../grammar/README.md).

A local German learning platform: watch your own German videos with German and mother-language subtitles, replay individual sentences, and collect useful expressions.

The [static GitHub Pages build](docs/github-pages.md) also supports encrypted media and progress, with a direct Storage Box connection through a Chrome or Edge extension.

## Project layout

| Location | Purpose |
| --- | --- |
| `deploy/sftp-upload-short/` | Upload bundle with short, opaque filenames and encrypted media and catalog |
| `private/media-decryption.key` | Key shared by the media pack, Pages build, and access code |
| `private/access-code.txt` | Single login code generated locally from the connection details and key |
| `deploy/pages/` | Neutral access screen and encrypted app for a separate public Pages repository |
| `extension/`, `deploy/storage-box-extension/` | Storage Box extension source and the generated extension configured for your Pages URL |
| `media/` | Local videos, subtitles, and processing records |
| `public/`, `lib/` | Player assets and shared code |
| `server.js`, `gateway.js` | Local player server and HTTPS-to-SFTP bridge |
| `scripts/`, `requirements/` | Media processing and build tools, plus Python dependencies |
| `docs/`, `examples/`, `test/` | Setup guides, practice subtitles, and tests |
| `artifacts/` | Local processing evidence and previews |

Git ignores the generated deployment folders and the private key. See the [SFTP upload instructions](docs/github-pages.md#pack-and-upload-the-library) for the upload order and remote directory settings.

## Start

Install Node.js 22 or later. On Windows, double-click `Start-Sprechzimmer.cmd`, or run from this folder:

```powershell
npm start
```

Open **http://127.0.0.1:4173** in a modern browser. The local app uses the vendored player and starts without installing packages. The server listens only on this computer. Keep the terminal running while using it. To choose another port:

```powershell
$env:PORT = '4174'
npm start
```

Use the same browser, hostname, and port each time: browser imports and learning data belong to that browser origin. `localhost` and `127.0.0.1` have separate storage.

## What's included

- A welcome guide with translation-language setup, a dashboard with continue-watching and actual learning statistics, and dedicated watching and sentence-collection pages. Back/forward navigation and page links work locally.
- Light and dark appearances. The first visit follows the system theme; the appearance button saves your preference without a page reload.
- A Media Chrome player with seeking, volume, speed, captions, optional picture in picture, and sentence controls in fullscreen. Controls fade during idle playback. **Aa** adjusts subtitle font, size, colors, opacity and edges.
- Local MP4/WebM playback with efficient byte-range streaming and seeking.
- German and translated captions, independent subtitle delays, German-only and captions-off modes, and right-to-left Arabic display.
- Click-to-replay transcript, previous/next sentence, sentence looping, auto-pause at the end of each line, and 0.5×–2× playback.
- Search German and translated sentences; hide translations for listening practice; optionally follow the current sentence.
- Starred sentences, flashcard review, CSV export, SRT export, progress resume, and JSON backup/restore.
- The Simpsons seasons 6 and 7 and SpongeBob seasons 3 and 4. Language badges and video availability reflect the files in `media/`.
- An original **40-second silent practice clip**, with 10 original German sentences and Arabic translations. This is a reading/player demonstration, not a Simpsons episode or a German audio sample. Its separate SRT files are in `examples/`.
- Optional generation of translated subtitles using a local Ollama model, in 8-cue batches. Existing tracks are retained unless a complete translation succeeds. The app does not claim that a generated track is human verified.
- Responsive interface, keyboard navigation, offline system fonts, no analytics, and no external front-end requests.

Player shortcuts: **Space / K** play or pause, **← / →** seek five seconds, **Shift + ← / →** previous/next sentence, **R** replay, **S** save, **L** loop, **T** toggle translation, **C** cycle caption modes, **M** mute, **F** fullscreen, and **[ / ]** change speed. Shortcuts pause in text fields and dialogs; focused buttons and sliders retain their native keyboard behavior. Picture in picture uses the browser’s video-only window; dual captions and learning controls are available in the main player and fullscreen.

Personal media and downloaded subtitle files live in the ignored `media/` folder and are excluded from source control. The player does not transcribe audio, identify the spoken language, or change a video's audio track.

## SpongeBob collection

The library also has **SpongeBob Schwammkopf, season 3**, with 20 episode slots from the user's source. The dashboard’s story collections and the library’s collection selector switch between shows. Existing Simpsons progress and saved-sentence keys keep their original IDs; SpongeBob uses `spongebob.s03e01` and separate keys.

The subtitle survey is retained in `artifacts/spongebob/subtitle-survey.json`. Available downloadable German series subtitles were not found in that survey; entries offering AI translation are not counted as existing tracks. German captions are generated directly from each German video's audio with the installed local Whisper model and labeled AI generated. They are not human verified.

All 20 SpongeBob episodes have Arabic tracks generated from the German transcripts with the local NLLB model. The player labels them as AI translations. The prior Arabic track for episode 1 is preserved in `media/translations/previous-subtitles/`. Run `scripts/translate-spongebob.py` with the installed transcription Python environment to regenerate the tracks from the pinned model in `.models/nllb-1.3b-int8/`.

Resume German downloads and generate audio captions:

```powershell
python scripts/download-season.py --series spongebob --season 3
.\.venv-transcribe\Scripts\python.exe scripts/transcribe-dub.py --series spongebob --season 3 --wait-for-media
python scripts/normalize-spongebob-spelling.py
.\.venv-transcribe\Scripts\python.exe scripts/transcribe-dub.py --series spongebob --season 3 --rebuild-from-cache
.\.venv-transcribe\Scripts\python.exe scripts/translate-spongebob.py
node scripts/verify-collection.js spongebob-s03
```

The completeness guard normally requires recognized speech near the end of the video. Two DVD files have unusually long closing-credit tails; their visually reviewed dialogue boundaries are recorded in `media/dub-transcripts/completeness-overrides.json` and apply only to the matching video hashes. They do not lower the default guard for other files.

Downloads retain their German provider/release evidence in `media/spongebob.s03.download-status.json`. The verifier checks H.264/AAC streams, fast-start layout, SRT timing, and German audio/transcript hashes. Missing translations are reported as availability, not invented. Refresh the media folder in the player after adding files.

## Download and verify this local collection

The user-authorized source is the [season page](https://serienstream.to/serie/simpsons/staffel-6). `scripts/download-season.py` selects its German playback links, downloads the available HLS streams, and remuxes to browser-compatible MP4 without reencoding. It verifies episode duration and the presence of video and audio using ffprobe. TLS verification stays enabled; no site JavaScript is executed and no browser cookies are read.

The downloader uses Python, yt-dlp, curl, ffmpeg, and ffprobe, separately from the dependency-free Node player. To resume interrupted downloads or retry missing episodes:

```powershell
python scripts/download-season.py
```

Verified MP4 files are skipped. The default is **two concurrent episodes**, with four HLS fragments each; use `--workers 3` for three episodes, or `--episodes 1,2,3` for a subset. Progress and per-episode validation are recorded in `media/download-status.json`. Stream links are resolved afresh rather than saving expiring URLs. Click **Refresh folder** in the app after downloads finish.

`scripts/download-subtitles.py` retrieves [German episode subtitles](https://subf2m.co/subtitles/the-simpsons-sixth-season/german) and an [Arabic season pack](https://subf2m.co/subtitles/the-simpsons-sixth-season/arabic). The downloaded DSNP subtitle release runs at 24000/1001 fps; the German videos run at 25 fps. The script applies the corresponding timestamp conversion, validates each SRT with the player's parser, and keeps unmodified copies in `media/subtitles-original/`. Download provenance and timing details are recorded in `media/subtitle-provenance.json`. Existing root-level subtitle files are preserved on reruns.

The two download helpers use the Python packages listed in `requirements/media.txt`. These packages are not required to run the player once the files are present.

If the source introduces a browser verification challenge, the downloader marks affected episodes as `verification_required` and leaves their downloads pending. It does not solve challenges. Files already downloaded remain usable. Run `node scripts/verify-media.js` to check available videos, MP4 fast-start layout, and both subtitle tracks; it saves the actual inventory and any timing errors in `media/media-validation.json`.

## Add your videos and subtitles

**Recommended for large videos:** put your own files in `media/`, then click **Refresh folder**:

```text
media/
  simpsons.s06e01.mp4
  simpsons.s06e01.de.srt
  simpsons.s06e01.ar.srt
  simpsons.s06e01.en.vtt
```

Use the show and episode stems in [the media naming guide](media/README.md). Use `.mp4`, `.m4v`, or `.webm` for video and a two-letter language code before `.srt` or `.vtt` for subtitles. The library streams videos directly from this folder.

**Alternatively:** click **Add files**, pick an episode slot, and select any video or subtitle files you have. You can import video, German subtitles, and the second language separately. Reimporting replaces the corresponding file or language. Imported videos are stored as IndexedDB blobs; subtitle metadata is stored separately so opening the library does not load every video. Browser imports take precedence over folder files for the same slot and language.

Use a German audio version yourself; the player uses the video's default audio track. MP4 with H.264 video and AAC audio is the most portable choice. MKV and multiple selectable audio tracks are not supported. Subtitles with UTF-8, UTF-16 BOM, Windows-1256 Arabic, or Windows-1252 Western encoding can be imported. Use the encoding dropdown if automatic detection is incorrect. Folder SRT/VTT files are also decoded automatically.

The app shows actual available subtitle languages. A missing Arabic track remains missing until you import it or generate a translation. German subtitles are required for sentence learning and AI translation. For mismatched subtitle releases, adjust German and translation delays in **Subtitle timing & display**.

## German subtitles that follow the dub

The downloaded Disney German subtitles use different wording from the spoken German dub. Changing their timestamps cannot fix that difference. The replacement German tracks are transcribed directly from each local video's German audio with the full multilingual Whisper large-v3 model, using [faster-whisper](https://github.com/SYSTRAN/faster-whisper) on the local NVIDIA GPU. The task is **German transcription**, with translation disabled.

The process keeps recognized wording rather than shortening or paraphrasing it. It uses word timestamps, groups words into replayable sentences, and makes a second recognition pass over uncertain passages and anomalous pauses. It does not upload the videos or audio. Model downloads and Python packages are the only network setup required.

These are **AI-generated audio transcripts**, not fully human-verified verbatim captions. Names, interjections, overlapping voices and music can still produce recognition errors. The app identifies their source explicitly. Each episode has a review report in `media/dub-transcripts/s06eXX.review.json`, plus the original recognized words and confidence values in `s06eXX.words.json`.

The old installed German tracks are preserved in `media/dub-transcripts/previous-subtitles/`. Arabic subtitle files are retained. A completed, validated German track replaces the root-level `simpsons.s06eXX.de.srt` atomically. The library checks its hash against the transcription manifest, gives it a versioned URL, and prefers it over old cached folder copies or legacy restored copies. Obsolete German subtitle delays are reset when the new audio-based timing is first selected; Arabic delays and later adjustments are preserved. A new German subtitle file that you explicitly import remains your chosen override.

The local transcription runtime is isolated in `.venv-transcribe`. Setup requires Python 3.11+, ffmpeg/ffprobe, and a compatible NVIDIA GPU. The current Windows setup uses the pinned packages in `requirements/transcribe.txt` and model files in `.models/whisper-large-v3/`:

```powershell
python -m venv .venv-transcribe
.\.venv-transcribe\Scripts\python.exe -m pip install -r requirements/transcribe.txt
.\.venv-transcribe\Scripts\python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-large-v3', revision='edaa852ec7e145841d8ffdb056a99866b5f0a478', local_dir='.models/whisper-large-v3', allow_patterns=['config.json','model.bin','preprocessor_config.json','tokenizer.json','vocabulary.json'])"
.\.venv-transcribe\Scripts\python.exe scripts/transcribe-dub.py --batch-size 4
```

Completed episode transcripts are cached and can be resumed. To test three minutes of episode 1 without replacing its installed subtitles:

```powershell
.\.venv-transcribe\Scripts\python.exe scripts/transcribe-dub.py --episodes 1 --sample-seconds 180
```

Small spelling corrections can be stored as exact per-episode sentence replacements in `media/dub-transcripts/corrections.json`. Rebuild from the recognized words without running the model again:

```powershell
.\.venv-transcribe\Scripts\python.exe scripts/transcribe-dub.py --episodes 1 --rebuild-from-cache
```

After a software update, reload the page once. **Refresh folder** then picks up newly completed transcript files. Saved sentences keep the wording they had when saved.

## Local AI translation

The app integrates with Ollama's documented [model listing](https://docs.ollama.com/api/tags) and [chat API](https://docs.ollama.com/api/chat). Ollama and model weights are **not installed by this project**. Install Ollama separately and download a multilingual model suitable for your computer and target language. The app uses the first installed model by default. Set a specific installed model before starting the server if needed:

```powershell
$env:OLLAMA_MODEL = 'your-installed-model-name'
$env:OLLAMA_URL = 'http://127.0.0.1:11434'
npm start
```

Then open an episode with German subtitles, click **Translate**, choose your language, and generate. Supported target languages: Arabic, English, French, Spanish, Turkish, Persian, Urdu, Russian, Ukrainian, Italian, Portuguese, Polish, Hindi, Chinese, Japanese, and Korean. Quality depends on the chosen model.

Only subtitle text is sent to the configured Ollama service; no video is sent. The default service is local. If you change `OLLAMA_URL` to another machine or hosted endpoint, subtitle text goes to that endpoint. Requests have a timeout and validated structured output; canceling or a failed batch keeps existing tracks unchanged. A canceled run currently restarts from the beginning. Long episodes can take substantial time on a CPU. Export the resulting track as SRT to keep a portable copy.

If no model service is available, the interface explains the missing setup. Playback, existing subtitles, and the included Arabic practice track still work.

## Learning data and backups

Progress, saved sentences, and preferences are stored locally. Clearing site data or using a private browser session can remove them. Use **Backup & export** regularly. JSON backups include saved sentences, progress, preferences, timing offsets, and browser subtitle tracks. They also include the currently loaded folder subtitle tracks. Other folder subtitles and all videos remain separate files. Restore merges saved sentences and newer progress, restores settings, and replaces matching subtitle languages while preserving existing videos.

CSV exports contain German, translation, language, episode, and timestamp, and can be used as a starting point for flashcards. A saved sentence keeps the translation available at the time it was saved.

Shortcuts (outside inputs, buttons, and dialogs): **Space** play/pause, **R** replay, **← / →** previous/next sentence, **S** star, **L** loop, **T** translation visibility, **F** fullscreen.

## Validation

```powershell
npm run check
npm test
python -m unittest discover -s test -p '*_test.py'
```

Tests cover subtitle parsing, Arabic text, timestamp alignment, gaps and overlaps, SRT round trips, large transcripts, file discovery, range requests, path boundaries, API validation, and mocked AI success/failure. The transcript renders at most 80 normal rows or 100 search results at once and indexes timestamps with binary search. Only the current video blob is opened. Actual translation quality requires a real multilingual Ollama model.

Main files: `server.js` (HTTP/range requests and AI), `lib/library.js` (file discovery), `public/app.js` (learning interactions), `public/storage.js` (IndexedDB), and `public/subtitles.js` (shared subtitle utilities).

After generating the local German audio transcripts, run `node scripts/verify-dub-transcripts.js`. It checks recognition-task metadata, SRT hashes, timestamps, backups, and whether the library selects the replacement tracks. These structural checks do not certify every recognized word; the source remains labeled AI-generated.
