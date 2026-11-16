# Grammatikinseln · جُزُر القواعد

German grammar for levels B1.1 and B1.2, explained in Arabic and German. The topics follow the grammar progression of *Auf jeden Fall! Deutsch B1.1 / B1.2* (telc). All explanations, examples and exercises are original.

- **51 lessons on 10 grammar islands** (28 from B1.1, 23 for B1.2), grouped by grammar topic instead of by book chapter.
- **460 core exercises and 51 additional applications** with worked explanations, plus seven practice sets that combine lessons.
- **Four Sprachbausteine sets** across three difficulty levels, with ten gaps per letter. Part 1 uses three choices per gap and Part 2 uses a shared word bank. [telc Deutsch B1 sample format](https://shop.telc.net/media/catalog/product/file/telc_deutsch_b1_zd_uebungstest_1.pdf)
- **Three B1 readings** with offline Arabic word glosses, paragraph translations and comprehension checks.
- **102 grammar flashcards** for rule recall and application, with spaced review and two cards for every lesson.
- **telc B1 exam trainer** with 17 PDF-sourced models, saved drafts, section-level scoring and answer-key corrections. [Extraction report](docs/telc-extraction-report.md)
- **Dashboard** with your next lesson, daily goal, streak, due reviews, the island map and every topic with its progress.
- **Island map**: a boat sails from island to island as you learn; inside an island a walker moves along the lesson trail.
- **Gamification**: one to three stars per lesson, XP and nine ranks, daily goal and streak, 16 badges, an exam per island to conquer it, and spaced review of answered questions.
- Arabic (right to left) and German interface, light and dark theme, keyboard and screen-reader friendly, works offline.

Part of the [learn-german](docs/repository.md) repository.

## Use it

Open the [grammar website](https://0xhmza.github.io/learn-german/grammar/) or double-click `index.html` in this folder to use it offline.

## Develop it

The development commands require Node.js 22 or later.

Development server (reads the content files directly, no build needed):

```powershell
npm start
```

Open http://127.0.0.1:4180. On Windows you can also double-click `Start-Grammatik.cmd`.

Offline single file: run `npm run build` once (after `npm install`), then double-click `dist/Deutsch-Grammatik-B1.html`. It contains everything, including the Arabic font.

Progress is stored in the browser (`localStorage`), including unfinished practice and Sprachbausteine attempts and flashcard review dates. Back it up under **Settings → Download backup** and restore it in another browser. Progress from the original `Deutsch-B1.1-Arabic.html` page moves over automatically when the new file can read the original storage. You can also restore the results file exported by that page.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Development server on port 4180 |
| `npm test` | Engine, content, rendering and server tests |
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
| `content/lessons/*.json` | One file per lesson: rule, steps, pitfall, table, links and nine to ten questions, in Arabic and German |
| `content/lesson-study.json` | Worked comparisons, extra questions and application cards keyed by lesson ID |
| `content/practice-sets.json` | Curated sets that combine lessons and question types |
| `content/readings.json` | B1 passages with a shared glossary and inline `word{Arabic gloss}` annotations |
| `content/sprachbausteine.json` | Original letters, options and explanations for both exam-style formats |
| `content/telc-b1-model-tests.json` | Model tests from the supplied PDF, with page references, scan images, keys and audit statuses |
| `content/levels.json`, `content/badges.json` | Levels and badge texts |
| `content/sources/` | The original B1.1 page (`legacy/`) and the B1.2 grammar list. The publisher PDF stays local and is git-ignored |
| `src/index.html`, `src/styles/`, `src/fonts/` | Page shell, stylesheets, Noto Sans Arabic (SIL OFL) |
| `src/js/engine/` | Pure logic: grading, runs, progress, XP and badges, spaced review, state migration |
| `src/js/views/`, `src/js/components/` | Pages and building blocks (map, trail, sidebar, toasts) |
| `scripts/` | Build, validation, lesson scaffold, link check, legacy extraction |
| `test/` | `node:test` suites |

## Writing a lesson

1. `npm run new:lesson -- my-topic zeiten B1.2 10`
2. Replace every `TODO` in `content/lessons/my-topic.json`. German terms inside Arabic text go between backticks. Question 8 corrects the lesson's `pitfallPair`.
3. Add a worked comparison to `content/lesson-study.json` and include the lesson ID in a set in `content/practice-sets.json`. Keep published question IDs and answer indices stable so in-progress attempts can resume.
4. Run `npm run validate`, then check the lesson at http://127.0.0.1:4180/#lesson/my-topic in both languages.

The [grammar platform plan](docs/grammar-platform-plan.md) describes the content model, routes, gamification rules and map geometry in detail.
