# Deutschpfad · درب الألمانية

A German-learning platform for levels A1 to C1. Its first course, **Grammatikinseln · جُزُر القواعد**, covers the B1 grammar.

German grammar for levels B1.1 and B1.2, explained in Arabic and German. The topics follow the grammar progression of *Auf jeden Fall! Deutsch B1.1 / B1.2* (telc). All explanations, examples and exercises are original.

- **51 lessons on 10 grammar islands** (28 from B1.1, 23 for B1.2), grouped by grammar topic instead of by book chapter.
- **460 core exercises and 51 additional applications** with worked explanations, plus seven practice sets that combine lessons.
- **Four Sprachbausteine sets** across three difficulty levels, with ten gaps per letter. In Part 1 every gap in the letter is a dropdown with three choices. In Part 2 words are dragged from the shared word list into the gaps (mouse or finger), or placed by tapping a word and then a gap. The Sprachbausteine parts of the mock exams work the same way. [telc Deutsch B1 sample format](https://shop.telc.net/media/catalog/product/file/telc_deutsch_b1_zd_uebungstest_1.pdf)
- **Hören B1** has 24 practice recordings, 4 assessment recordings, and 120 exercises. The original German recordings use Piper voices and work offline. **Mit Serien üben** adds 24 short clips from the German dubs of The Simpsons and SpongeBob, with 72 comprehension, gap-fill and dictation exercises. [Piper](https://github.com/OHF-Voice/piper1-gpl)
- **Karteikarten** (`#karten`, in the side navigation and on the dashboard) is a page only for flashcards. It has 47 decks with 645 cards from A1 to C1: vocabulary, verbs, grammar and phrases.
  - Levels are tabs and topics are filters. Each deck tile shows how many cards are due and how many are sure.
  - The B1 grammar decks are built from the 156 lesson flashcards and share their review dates with the lessons.
  - Study opens in focus mode. You can flip the card (Space, or tap), take a four-answer quiz, or type the German word, where nouns need their article.
  - You grade each card Nochmal, Schwer, Gut or Leicht (keys 1–4, or swipe on a phone). A Leitner schedule brings it back the same day, tomorrow, or in 3, 7, 14 or 30 days.
  - Articles are coloured by gender, and German is read aloud with the browser's voices. Each round ends with a summary and a retry of the missed cards.
  - The content is in `content/karten/a1.json` … `c1.json`.
- **Hörtraining** (`#hoertraining`, linked from Hören) trains recognising words in connected speech, from A2 to B2. It has a placement check of about 12 minutes and a daily round of 10 to 15 minutes. The drills are:
  - dictation of 60 sentences, with each mistake labelled as a sound, an ending, a word boundary, a number, an unknown or a missing word
  - 13 sound contrasts for Arabic speakers, such as `b/p`, `o/u`, `ie/ei`, vowel length and `-en/-em`
  - numbers, prices, times, dates, years and phone numbers
  - predicting the verb at the end of the sentence
  - everyday reduced forms such as `haste` and `hab's`
  - audio review cards and nine listening texts, each heard for the gist, for details and with the transcript

  A listening profile shows the estimated level, replays, speaking rate and mistake types, and a speed ladder suggests when to go faster. The drills use the browser's German speech voices. `#hoertraining/methode` explains the research behind each drill.
- **Three B1 readings** with offline Arabic word glosses, paragraph translations and comprehension checks.
- **156 grammar flashcards** for recalling endings, irregular forms, connector meanings and word order, with spaced review for every lesson.
- **telc Deutsch B1 exam trainer** with 17 named mock exams, saved drafts, scored reading and Sprachbausteine sections, and writing practice. Listening statements are available for practice.
- **Dashboard** (Lernen tab): progress cards for grammar, vocabulary, writing and exams. Each opens its area page. The current level card sits above **Lernserie** and opens the level picker.
- **Area pages** start with **Hier hast du aufgehört**: the last lesson, writing task or exam part with its date and a button to continue. The **Grammatik** page (`#grammatik`) has the course path: each grammar island is a module whose lessons sit on a vertical path that ends with the module exam. **Schreiben** lists every writing task with its status; **Prüfung** shows the checked exam parts; **Vokabeln** the last saved word.
- **Levels A1, A2, B1, B2, C1**: switch on the level page (`#level`), opened from the level card. B1 has the grammar course, writing tasks and the telc exam trainer; the other levels show what is still in preparation.
- **Own word list**: tap a German word anywhere on the platform, or select it (double-click or long press), and choose **Zur Wortliste**. Words in the readings have the same button in the meaning panel. The exact string is saved with the date in the browser, included in backups, and listed under **Vokabeln → Meine Wörter**, where it can be removed or copied. The button stays hidden while a question is unanswered.
- **Vokabeln** (`#vokabeln`) has a personal word list that is shared across levels. **Schreiben** (`#schreiben`) links back to the last writing task and shows the status of each task.
- **Lesson player** in the style of mobile course apps: each lesson is a linear sequence of screens. Short explanation slides are followed by a quick check after the rule, the examples and the typical mistake, then the remaining questions and a completion screen with XP, score and streak. One button sits in the bottom bar; after checking, a green or red answer sheet shows the solution. Practice runs use the same player. Escape or ✕ closes it.
- **All topics** (`#topics`): search, the telc book order, the hide-completed filter and the island map (a boat sails from island to island as you learn).
- **Gamification**: one to three stars per lesson, XP and nine ranks, daily goal and streak, 16 badges, an exam per island to conquer it, and spaced review of answered questions.
- Arabic (right to left) and German interface, light and dark theme, keyboard and screen-reader friendly, works offline.

Part of the [learn-german](docs/repository.md) repository.

## Use it

Open the [grammar website](https://0xhmza.github.io/learn-german/grammar/) or double-click `index.html` in this folder to use it offline. Choose **Hören → Mit Serien üben** to play the built-in clips and answer questions about what you heard.

## Develop it

The development commands require Node.js 22 or later.

Development server (reads the content files directly, no build needed):

```powershell
npm start
```

Open http://127.0.0.1:4180. On Windows you can also double-click `Start-Grammatik.cmd`.

The published clip pack lives in `listening-clips/`. The dev server also lists compatible local episodes under **Weitere Folgen auf diesem Gerät**. The Hörcheck supplies the listening score on the dashboard.

To preview new cuts, run `npm run prepare:series` with FFmpeg on your path and a local editorial file at `.listening-private/editorial.json`. The script reads the German dubs and matching transcripts in `../media-player/media` and `../media`. Run `npm run build:series` and open `dist/mit-serien/Deutsch-Grammatik-B1.html` to review the staged pack. To publish an updated pack, copy the selected MP3 files and their matching manifest into `listening-clips/`, run `npm run build`, and copy `dist/Deutsch-Grammatik-B1.html` to `index.html`.

Offline single file: run `npm run build` once (after `npm install`), then double-click `dist/Deutsch-Grammatik-B1.html`. It contains everything, including the Arabic font.

Progress is stored in the browser (`localStorage`), including unfinished practice and Sprachbausteine attempts and flashcard review dates. Back it up under **Settings → Download backup** and restore it in another browser. Progress from the original `Deutsch-B1.1-Arabic.html` page moves over automatically when the new file can read the original storage. You can also restore the results file exported by that page.

The **All topics** page (search button on the course header) lets you switch between grammar islands and the order of the telc books *Auf jeden Fall! Deutsch B1.1* and *B1.2*. Both views share the same progress. The hide-completed filter applies to the topic lists.

Each lesson opens as a sequence of screens with questions in between. Your place in the lesson is saved, and a finished lesson starts again from the beginning when you open it. The completion screen links to the lesson's flashcards and to a practice round for its mistakes.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Development server on port 4180 |
| `npm test` | Engine, content, rendering, lesson flow and server tests |
| `npm run test:visual` | Layout, contrast and screenshot tests in a headless Chromium browser (German and Arabic; phone, tablet and desktop); add `-- --update` to accept new baselines. Report in `visual-report/index.html` |
| `npm run validate` | Structural checks for all content |
| `npm run build` | Validate, then write `dist/site/` (hostable) and `dist/Deutsch-Grammatik-B1.html` (single file) |
| `npm run preview` | Serve `dist/` on port 4181 to try the build |
| `npm run new:lesson -- <id> <island> <level> <lektion>` | Create a lesson file with every field to fill in |
| `npm run check:links` | Open every reference link once (needs network) |
| `npm run extract:legacy` | Re-create the 28 B1.1 lesson files from the original page |

## Layout

| Path | Contents |
| --- | --- |
| `content/islands.json` | The ten islands: names, colours, map positions |
| `content/lessons/*.json` | One file per lesson: rule, steps, pitfall, table, links and nine to twelve questions, in Arabic and German |
| `content/lesson-study.json` | Worked comparisons and extra practice questions keyed by lesson ID |
| `content/flashcards.json` | Topic decks keyed by lesson and concept. Each card lists its German prompt, Arabic prompt and short answer. A shared answer gives the German form or pattern. Use `de` and `ar` for explanations that need translation. |
| `content/practice-sets.json` | Curated sets that combine lessons and question types |
| `content/readings.json` | B1 passages with a shared glossary and inline `word{Arabic gloss}` annotations |
| `content/sprachbausteine.json` | Original letters, options and explanations for both exam-style formats |
| `content/telc-b1-model-tests.json` | Model tests with Arabic and German titles, digital reading ads, and a single answer per scored question |
| `content/levels.json`, `content/badges.json` | Levels and badge texts |
| `content/sources/` | The original B1.1 page (`legacy/`) and the B1.2 grammar list. The publisher PDF stays local and is git-ignored |
| `content/roadmap.json` | Grammar topic order by chapter, based on the publisher samples listed in `content/levels.json` |
| `src/index.html`, `src/styles/`, `src/fonts/` | Page shell, stylesheets, Noto Sans Arabic (SIL OFL) |
| `src/js/engine/` | Pure logic: grading, runs, progress, XP and badges, spaced review, state migration |
| `src/js/cefr.js` | The five levels and which of them have a course |
| `src/js/views/`, `src/js/components/` | Pages (learn tab, module, lesson player, levels, Vokabeln, Schreiben, all topics, profile) and building blocks (course path, side widgets, icons, map, topic index, toasts) |
| `scripts/` | Build, validation, lesson scaffold, link check, legacy extraction |
| `test/` | `node:test` suites |

## Writing a lesson

1. `npm run new:lesson -- my-topic zeiten B1.2 10`
2. Replace every `TODO` in `content/lessons/my-topic.json`. German terms inside Arabic text go between backticks. Question 8 corrects the lesson's `pitfallPair`.
3. Add a worked comparison to `content/lesson-study.json`, short recall cards to `content/flashcards.json`, a bilingual outcome to `content/learning.json`, and include the lesson ID in a set in `content/practice-sets.json`. Keep published card and question IDs stable so review schedules and in-progress attempts can resume.
4. Run `npm run validate`, then check the lesson at http://127.0.0.1:4180/#lesson/my-topic in both languages.

The [grammar platform plan](docs/grammar-platform-plan.md) describes the content model, routes, gamification rules and map geometry in detail.
