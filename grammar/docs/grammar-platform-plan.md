# Grammatikinseln — implementation plan

Plan for turning `Deutsch-B1.1-Arabic.html` into a complete, gamified, grammar-only learning platform covering B1.1 and B1.2, and for splitting this repository into two self-contained projects.

Status: **implemented** on branch `grammar-platform` (2026-11-14). §18 lists where the implementation differs from the original plan.
Written: 2026-11-14.

---

## 0. Decisions at a glance

| # | Decision | Value |
|---|---|---|
| D1 | Repository split | Two self-contained folders: `grammar/` (new platform) and `media-series/` (existing Sprechzimmer app, moved unchanged) |
| D2 | Platform name | **Grammatikinseln** / **جُزُر القواعد** |
| D3 | Scope | Grammar only. No vocabulary fields, no learning goals, no chapter themes, no videos |
| D4 | Organisation | 10 grammar categories ("islands"), 51 lessons (28 existing B1.1 + 23 new B1.2). Book chapters disappear from the UI; they survive only as provenance inside each lesson's collapsed *Sources* panel |
| D5 | Stack | Vanilla ES modules, no framework, no runtime dependency. One dev dependency (`esbuild`) for the bundle. Node ≥ 22, `node:test` |
| D6 | Deliverables of the build | `grammar/dist/site/` (multi-file, hostable) and `grammar/dist/Deutsch-Grammatik-B1.html` (single self-contained file that opens by double-click, successor of the current file) |
| D7 | Languages | UI and explanations in Arabic (default, RTL) and German (LTR), same toggle as today |
| D8 | Locks | Soft. Every lesson is always openable. Only the island exam is gated (all lessons of the island learned) |
| D9 | Progress storage | `localStorage`, new key `gi-state-v1`, automatic migration from the legacy key, JSON backup/restore |
| D10 | Hosting | Local only in v1 (file + local server on port 4180). The existing Pages workflow stays media-only. See §16 for the open question |
| D11 | Content language model | Symmetric `i18n.ar` / `i18n.de` blocks per lesson and per question (legacy "Arabic base + `de` overlay" is converted once by script) |
| D12 | Question types in v1 | The four existing ones: `cloze`, `mcq`, `order`, `text`. No new types |

---

## 1. What exists today (verified facts)

### 1.1 `Deutsch-B1.1-Arabic.html` (680 KB, 1 598 lines, untracked in git)

- Single file: inline CSS (lines 10–568), body markup (570–613), course JSON on line 615 (359 KB), app script (616–1596).
- Line 111 is a base64 Noto Sans Arabic variable font (221 KB) with its OFL licence text above it.
- Course JSON: `{chapters[6], topics[28], sample, solutions}`.
  - 28 lessons, 253 questions: 89 cloze, 58 mcq, 22 order, 84 text. Difficulty 1/2/3 = 84/113/56.
  - Every lesson has 9 questions (`infinitiv-zu` has 10), 4–5 steps, 1–2 explanation paragraphs, a `pattern`, `frames`, one pitfall, one recall pair, 2–4 links. 9 lessons have a `table`.
  - Dominant question sequence per lesson: `cloze1 cloze1 mcq1 cloze2 order2 mcq2 text3 text3 text2`. The second `text3` always carries a `context` (error correction that mirrors the lesson pitfall).
  - Lesson fields: `id, chapter, title, german, emoji, links, steps, explain, questions, src, grounded, lead, example, translation, pitfall, recall, de, pattern, frames, table?`.
  - `de` overlay: `title, lead, steps[{text,why}], explain, pitfall, recall, links, table?`.
  - Question `de` overlay: `prompt, explain, hints` and sometimes `options` (15 mcqs), `answer`, `text`.
- Routes: `#home`, `#lesson/<id>`, `#practice`, `#practice/<key>` (key = lesson id, `unit-1..6`, `mixed`, `test`, `mistakes`), `#progress`.
- Storage keys: `deutsch-b11-ar-2026-1` (state: `completed, results, runs, lastRun, lastLesson`), `deutsch-b11-lang`, `deutsch-b11-theme`.
- Grading: `normalize()` = NFC, trim, lower-case (de locale), collapse spaces, strip trailing `.!?`. Cloze accepts any listed variant per blank. Order must match the original item order. Text is self-graded.
- `record()`: `{correct, streak, topic, tries, needsReview}`; an item leaves review after two correct answers in a row.
- Breakpoints: 1110, 860, 560, 430 px. Light and dark token sets, `prefers-reduced-motion` and print rules exist.

### 1.2 `4011-baf-2501a_bib.pdf` (4.3 MB, 12 pages, untracked)

Publisher sample of *Auf jeden Fall! Deutsch B1.2*. Pages 3–4 are the table of contents, the rest is a sample of Lektion 12 (book pages 62–63, 66, 71, 76, 142–143). The PDF carries owner restrictions (the Read tool refuses it; `pdftotext` and PyMuPDF work).

Grammar per Lektion, transcribed from the contents pages and checked against the rendered page images:

| Lektion | Grammar line in the book |
|---|---|
| 7 Man lernt nie aus | Indefinitpronomen Singular und Plural im Nominativ, Akkusativ und Dativ · Verben als Nomen · kausale Nebensätze mit *da/weil* und die konsekutiven Verbindungsadverbien *deshalb/daher/darum/deswegen* · Nebensätze mit *obwohl* und das konzessive Verbindungsadverb *trotzdem* |
| 8 Gemeinsam in Vielfalt | Gradpartikeln · Relativsätze mit *was* |
| 9 Für eine nachhaltigere Zukunft | N-Deklination · konsekutive Nebensätze mit *sodass / so … dass* · modale Nebensätze mit *indem* · das Verb *brauchen* |
| 10 Im Laufe der Zeit | Das Plusquamperfekt · temporale Nebensätze mit *bevor, bis, seit/seitdem, während* · temporale Nebensätze mit *nachdem* |
| 11 Im Namen der Gerechtigkeit | das Erststellen-*es* · irreale Bedingungssätze mit Konjunktiv II der Vergangenheit · nominalisierte Adjektive und Partizipien · adversative Nebensätze mit *während* |
| 12 Zukunftsvisionen | Indefinitpronomen mit *irgend-* · irreale Bedingungssätze in der Vergangenheit · Futur I |

Only Lektion 12 has its grammar page in the sample (book page 71). For Lektionen 7–11 only the topic titles are known, so lesson content for those is original work under the book's topic title.

### 1.3 The rest of the repository (Sprechzimmer)

Node 22 app without a build step: `server.js` (port 4173), `gateway.js`, `lib/`, `public/`, `scripts/` (JS and Python), `test/`, `extension/`, `requirements/`, `examples/`, `docs/github-pages.md`, `.github/workflows/pages.yml`, `Start-Sprechzimmer.cmd`. Ignored local folders: `media/`, `deploy/`, `private/`, `artifacts/`, `.keys/`, `.models/`, `.venv-transcribe/`, `node_modules/`, `graphify-out/`.

Every internal path is relative to the file's own location (`path.join(__dirname,'..',…)`, `Path(__file__).resolve().parent.parent`, `lib/project-paths.js`). Moving the whole tree one level down therefore needs **no source edits**.

---

## 2. Target repository layout

```
learn-german/
├─ README.md                      short hub page: the two projects and how to start each
├─ package.json                   proxy scripts only (no dependencies, no workspaces)
├─ .gitignore                     node_modules/, .env, *.log, graphify-out/
├─ .graphifyignore                same entries as today, prefixed with media-series/
├─ .github/workflows/
│  └─ media-pages.yml             renamed from pages.yml, runs inside media-series/
├─ docs/
│  └─ grammar-platform-plan.md    this file
│
├─ grammar/                       ← NEW platform
│  ├─ package.json                "type": "module", devDependency esbuild
│  ├─ README.md
│  ├─ Start-Grammatik.cmd
│  ├─ .gitignore                  dist/, node_modules/, content/sources/*.pdf
│  ├─ server.js                   static dev server, 127.0.0.1:4180
│  ├─ content/
│  │  ├─ levels.json
│  │  ├─ islands.json
│  │  ├─ badges.json
│  │  ├─ lessons/<lesson-id>.json            51 files
│  │  └─ sources/
│  │     ├─ legacy/Deutsch-B1.1-Arabic.html  frozen original
│  │     ├─ b1.2-toc.md                      the table in §1.2
│  │     └─ 4011-baf-2501a_bib.pdf           local only, git-ignored
│  ├─ src/
│  │  ├─ index.html
│  │  ├─ fonts/NotoSansArabic-Variable.woff2, OFL.txt
│  │  ├─ styles/  tokens.css base.css layout.css components.css lesson.css
│  │  │           quiz.css dashboard.css map.css island.css gamification.css print.css
│  │  └─ js/
│  │     ├─ main.js  content.js  state.js  router.js  theme.js  dates.js
│  │     ├─ i18n/    index.js  ar.js  de.js
│  │     ├─ engine/  grading.js  runs.js  progress.js  gamification.js  srs.js  migrate.js
│  │     ├─ views/   home.js  island.js  lesson.js  practice.js  quiz.js  results.js
│  │     │           progress.js  settings.js
│  │     └─ components/  html.js  hud.js  sidebar.js  map.js  trail.js  toast.js  stars.js
│  ├─ scripts/
│  │  ├─ extract-legacy.js        one-time: legacy HTML → content/lessons/*.json + font
│  │  ├─ assemble-content.js      lessons + islands + levels + badges → one object
│  │  ├─ validate-content.js      schema and cross-reference checks
│  │  ├─ build.js                 dist/site and dist/Deutsch-Grammatik-B1.html
│  │  ├─ new-lesson.js            scaffold a lesson file from the template
│  │  └─ check-links.js           optional, network: HEAD every lesson link
│  └─ test/
│     ├─ content.test.js  grading.test.js  runs.test.js  progress.test.js
│     ├─ gamification.test.js  srs.test.js  migrate.test.js  router.test.js  views.test.js
│     └─ fixtures/legacy-state.json
│
└─ media-series/                  ← existing Sprechzimmer, moved as is
   ├─ package.json  package-lock.json  README.md  Start-Sprechzimmer.cmd  .gitignore
   ├─ server.js  gateway.js
   ├─ lib/  public/  scripts/  test/  extension/  requirements/  examples/  docs/
   └─ (local, ignored) media/  deploy/  private/  artifacts/  .keys/  .models/
                       .venv-transcribe/  node_modules/
```

Why no npm workspaces: `media-series/scripts/vendor-player.js` reads `../node_modules/media-chrome`. Hoisting to the root would break it. Two independent packages keep every existing path valid.

### 2.1 Root `package.json`

```json
{
  "name": "learn-german",
  "private": true,
  "scripts": {
    "grammar": "npm --prefix grammar start",
    "grammar:build": "npm --prefix grammar run build",
    "grammar:test": "npm --prefix grammar test",
    "media": "npm --prefix media-series start",
    "media:test": "npm --prefix media-series test",
    "test": "npm run grammar:test && npm run media:test"
  }
}
```

### 2.2 Migration procedure (Phase 1, exact order)

1. **Preflight.** The working tree has 29 uncommitted changes on `github-pages-sftp`. Commit them first (owner's call on the message) so that the move is a pure rename commit. Tag the result `pre-split`.
2. Create `media-series/`.
3. `git mv` these tracked paths into `media-series/`: `server.js gateway.js package.json package-lock.json Start-Sprechzimmer.cmd README.md lib public scripts test extension requirements examples media docs/github-pages.md → media-series/docs/github-pages.md`. `.gitignore` moves too (its anchored patterns `/deploy/`, `/private/`, `media/*` then resolve inside `media-series/`).
4. `git mv media media-series/media` renames the directory on disk, so the untracked videos and subtitles travel with it (same drive, instant). Move the remaining ignored local folders with a plain filesystem move: `deploy/`, `private/`, `artifacts/`, `.keys/`, `.models/`, `node_modules/`.
5. **Do not move `.venv-transcribe/`.** Python virtual environments embed absolute paths. Recreate it inside `media-series/` with the commands already in the README (`python -m venv .venv-transcribe`, `pip install -r requirements/transcribe.txt`), verify, then delete the old one.
6. `git mv .github/workflows/pages.yml .github/workflows/media-pages.yml` and edit it: add `defaults: { run: { working-directory: media-series } }` to the build job and change the upload path to `media-series/deploy/pages`.
7. Write the new root `package.json`, root `.gitignore`, root `README.md` (two short sections with start commands and links to each project README).
8. Prefix every entry of `.graphifyignore` with `media-series/` (keep `graphify-out/`, `.git/`, `.env*` and the extension globs unprefixed) and add `grammar/dist/`, `grammar/node_modules/`.
9. In `media-series/README.md` fix the three kinds of references: the *Project layout* table stays valid as is (paths are relative to the project), add one line at the top pointing to the root README, and change `docs/github-pages.md` link targets only if they were root-relative.
10. Create `grammar/content/sources/legacy/` and move `Deutsch-B1.1-Arabic.html` into it; move the PDF to `grammar/content/sources/`. Add the HTML to git (it is the only copy of 28 lessons), keep the PDF ignored.
11. Verify: `cd media-series && npm test && npm run check && npm start` (open http://127.0.0.1:4173, play one episode), `python -m unittest discover -s test -p "*_test.py"` if that is how the Python tests are run today.
12. Commit as `Split repository into grammar/ and media-series/`.

Acceptance: `git status` clean; `git log --follow media-series/server.js` shows history; Sprechzimmer behaves exactly as before; no file other than the workflow, ignore files and READMEs has content changes.

---

## 3. Grammar taxonomy

### 3.1 The ten islands

Route order is the recommended learning order. `palette` names map to tint tokens (§11).

| # | id | German name | Island nickname | Arabic name | Emoji | Palette | Lessons |
|---|---|---|---|---|---|---|---|
| 1 | `nomen-kasus` | Nomen & Kasus | Kasus-Kap | الأسماء والحالات الإعرابية | 🏷️ | blue | 7 |
| 2 | `adjektive` | Adjektive & Partizipien | Adjektiv-Atoll | الصفات واسما الفاعل والمفعول | 🎨 | pink | 6 |
| 3 | `pronomen` | Pronomen & Verweiswörter | Pronomen-Riff | الضمائر وكلمات الإحالة | 🎲 | yellow | 4 |
| 4 | `relativsaetze` | Relativsätze | Relativ-Insel | جمل الوصل | 🔗 | lilac | 6 |
| 5 | `infinitiv-verben` | Infinitiv & besondere Verben | Infinitiv-Bucht | المصدر وأفعال خاصة | ✍️ | peach | 5 |
| 6 | `passiv` | Passiv | Passiv-Hafen | المبني للمجهول | 🧰 | mint | 4 |
| 7 | `zeiten` | Zeiten & Zeitsätze | Zeit-Archipel | الأزمنة والجمل الزمنية | ⏳ | sky | 5 |
| 8 | `grund-folge` | Grund, Folge & Mittel | Insel der Gründe | السبب والنتيجة والوسيلة | 🧭 | sand | 4 |
| 9 | `gegensatz-vergleich` | Gegensatz & Vergleich | Kontrast-Klippen | التضاد والمقارنة | ⚖️ | coral | 5 |
| 10 | `konjunktiv-bedingung` | Bedingungen & Konjunktiv II | Konjunktiv-Vulkan | الشرط والتمنّي | 💭 | teal | 5 |

Total 51. B1.1 lessons: 28. B1.2 lessons: 23.

### 3.2 Lesson assignment

`order` is the position inside the island. `Lkt` is the book Lektion (1–6 = B1.1, 7–12 = B1.2). **New** marks lessons to be authored.

**1 · `nomen-kasus`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `genitiv` | Der Genitiv | B1.1 | 4 | — | |
| 2 | `genitiv-praep` | Präpositionen mit Genitiv | B1.1 | 4 | genitiv | |
| 3 | `lokale-praep` | um … herum · an … entlang | B1.1 | 3 | — | |
| 4 | `n-deklination` | N-Deklination | B1.2 | 9 | genitiv | New |
| 5 | `diminutiv` | Diminutiv | B1.1 | 3 | — | |
| 6 | `verben-als-nomen` | Verben als Nomen | B1.2 | 7 | — | New |
| 7 | `nominalisierte-adjektive` | Nominalisierte Adjektive und Partizipien | B1.2 | 11 | genitiv-adjektiv, partizip-adjektiv | New |

**2 · `adjektive`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `komparativ` | Adjektivdeklination mit Komparativ | B1.1 | 5 | — | |
| 2 | `superlativ` | Adjektivdeklination mit Superlativ | B1.1 | 5 | komparativ | |
| 3 | `genitiv-adjektiv` | Adjektivdeklination im Genitiv | B1.1 | 4 | genitiv | |
| 4 | `partizip1` | Partizip I | B1.1 | 2 | — | |
| 5 | `partizip-adjektiv` | Partizip I und II als Adjektiv | B1.1 | 2 | partizip1 | |
| 6 | `gradpartikeln` | Gradpartikeln | B1.2 | 8 | — | New |

**3 · `pronomen`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `irgendein` | irgendein / irgendeine / irgendwelche | B1.1 | 3 | — | |
| 2 | `indefinitpronomen` | Indefinitpronomen im Nominativ, Akkusativ und Dativ | B1.2 | 7 | — | New |
| 3 | `irgend-pronomen` | Indefinitpronomen mit irgend- | B1.2 | 12 | irgendein | New |
| 4 | `pronominaladverbien` | Präpositionaladverbien | B1.1 | 6 | — | |

**4 · `relativsaetze`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `relativ-dativ` | Relativpronomen und Relativsätze im Dativ | B1.1 | 1 | — | |
| 2 | `relativ-praep` | Relativsätze mit Präpositionen | B1.1 | 1 | relativ-dativ | |
| 3 | `relativ-einschub` | Eingeschobene Relativsätze | B1.1 | 1 | relativ-dativ | |
| 4 | `relativ-genitiv` | Relativpronomen und Relativsätze im Genitiv | B1.1 | 4 | relativ-dativ, genitiv | |
| 5 | `relativ-ort` | Relativsätze mit wo, wohin und woher | B1.1 | 4 | — | |
| 6 | `relativ-was` | Relativsätze mit was | B1.2 | 8 | relativ-dativ | New |

**5 · `infinitiv-verben`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `infinitiv-zu` | Infinitiv mit zu | B1.1 | 2 | — | |
| 2 | `statt-zu` | Infinitivsätze mit (an)statt … zu | B1.1 | 5 | infinitiv-zu | |
| 3 | `ohne-zu` | Infinitivsätze mit ohne … zu | B1.1 | 5 | infinitiv-zu | |
| 4 | `brauchen` | Das Verb brauchen | B1.2 | 9 | infinitiv-zu | New |
| 5 | `lassen` | Das Verb lassen | B1.1 | 6 | — | |

**6 · `passiv`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `passiv-perfekt` | Passiv Perfekt | B1.1 | 1 | — | |
| 2 | `passiv-modal` | Passiv mit Modalverben | B1.1 | 5 | — | |
| 3 | `subjektlos` | Subjektloses Passiv | B1.1 | 6 | — | |
| 4 | `erststellen-es` | Das Erststellen-es | B1.2 | 11 | subjektlos | New |

**7 · `zeiten`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `plusquamperfekt` | Das Plusquamperfekt | B1.2 | 10 | — | New |
| 2 | `nachdem` | Temporale Nebensätze mit nachdem | B1.2 | 10 | plusquamperfekt | New |
| 3 | `bevor-bis` | Temporale Nebensätze mit bevor / bis | B1.2 | 10 | — | New |
| 4 | `seit-waehrend` | Temporale Nebensätze mit seit(dem) / während | B1.2 | 10 | — | New |
| 5 | `futur1` | Futur I | B1.2 | 12 | — | New |

**8 · `grund-folge`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `kausal-da-weil` | Kausale Nebensätze mit da / weil | B1.2 | 7 | — | New |
| 2 | `deshalb-daher` | Konsekutive Verbindungsadverbien deshalb / daher / darum / deswegen | B1.2 | 7 | kausal-da-weil | New |
| 3 | `sodass` | Konsekutive Nebensätze mit sodass / so … dass | B1.2 | 9 | — | New |
| 4 | `indem` | Modale Nebensätze mit indem | B1.2 | 9 | — | New |

**9 · `gegensatz-vergleich`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `obwohl` | Nebensätze mit obwohl | B1.2 | 7 | — | New |
| 2 | `trotzdem` | Konzessives Verbindungsadverb trotzdem | B1.2 | 7 | obwohl | New |
| 3 | `waehrend-adversativ` | Adversative Nebensätze mit während | B1.2 | 11 | seit-waehrend | New |
| 4 | `je-desto` | je … desto / umso | B1.1 | 1 | komparativ | |
| 5 | `doppelkonjunktionen` | Doppelkonjunktionen | B1.1 | 2 | — | |

**10 · `konjunktiv-bedingung`**

| order | id | German title | Level | Lkt | Prerequisites | |
|---|---|---|---|---|---|---|
| 1 | `falls` | Konditionale Nebensätze mit falls | B1.1 | 3 | — | |
| 2 | `sonst` | Satzverbindendes Adverb andernfalls / sonst | B1.1 | 6 | — | |
| 3 | `irreale-bedingung` | Irreale Bedingungssätze | B1.1 | 3 | — | |
| 4 | `konjunktiv2-vergangenheit` | Irreale Bedingungssätze mit Konjunktiv II der Vergangenheit | B1.2 | 11 | irreale-bedingung, plusquamperfekt | New |
| 5 | `konjunktiv2-vergangenheit-modal` | Irreale Bedingungen in der Vergangenheit: Modalverb und Passiv | B1.2 | 12 | konjunktiv2-vergangenheit, passiv-modal | New |

How the 20 book items became 23 lessons: the two paired items of Lektion 7 are split (`kausal-da-weil` / `deshalb-daher`, `obwohl` / `trotzdem`) because clause type and verb position differ, and the four temporal conjunctions of Lektion 10 are split into two lessons. The two "irreale Bedingungssätze in der Vergangenheit" items (Lektion 11 and 12) stay two lessons: basic form first, modal verb and passive second, which is exactly what the book's page 71 adds.

Prerequisites never lock anything. A lesson whose prerequisite is not yet learned shows one chip under its title: "يُفضَّل أولًا: …" / "Am besten zuerst: …" linking to it.

---

## 4. B1.2 lesson briefs (authoring specification)

Rules for all 23 new lessons:

- All explanations, examples and exercises are original. Do not copy sentences or exercises from the book or its sample pages. The book contributes only the topic title. Exception: `irgend-pronomen`, `konjunktiv2-vergangenheit-modal` and `futur1` may follow the rule statements on book page 71 in their own words, and get `source.kind: "sample"`.
- Voice, length and structure match the existing 28 lessons: `lead` is one or two sentences ending in what the learner will do; 4–5 `steps`, each with a German example and a "why"; 1–2 `explain` paragraphs; exactly one pitfall written as `wrong → right`; one recall pair; German terms inside backticks in Arabic prose.
- Everyday adult vocabulary at B1 level (flat, work, appointments, shopping, health, city). No topic vocabulary from the book chapters is required.
- 9 questions per lesson following the template in §5.4.
- 2–4 links per lesson. Use grammis (IDS Mannheim) systematic-grammar pages and comparable institutional references. Every URL must be opened and confirmed by the author; never guess a URL. If a telc B1.2 link cannot be confirmed, leave it out.

Each brief gives: Arabic title · emoji · scope · `pattern` · model sentence · pitfall · table · frames to show · the lesson to contrast with.

**L7**

1. `indefinitpronomen` — "ضمائر غير محددة تحلّ محل الاسم" · 👥
   - Scope: `einer / eine / eins`, `keiner / keine / keins`, plural `welche`, `jeder`, `alle`, `man → einen / einem`, `jemand / niemand` (`jemanden`, `jemandem`), `etwas / nichts`. The pronoun carries the article ending.
   - Pattern: `["Artikelwort ohne Nomen", "→", "Pronomen mit Endung"]`
   - Model: `Hast du einen Stift? – Ja, ich habe einen. / Nein, ich habe keinen.`
   - Pitfall: `Das ist ein von meinen Kollegen. → Das ist einer von meinen Kollegen.`
   - Table: Nominativ / Akkusativ / Dativ × maskulin / feminin / neutral / Plural for `ein-` (einer, eine, eins, welche · einen, eine, eins, welche · einem, einer, einem, welchen) and a second block for `kein-`.
   - Frames: `main` (question) + `main` (answer with pronoun highlighted `hl`). Contrast: `irgendein`.
2. `verben-als-nomen` — "تحويل الفعل إلى اسم" · 🔤
   - Scope: infinitive as neuter noun, capitalised, no plural; `das Lernen`, `beim Lernen` (while), `zum Lernen` (purpose), `nach dem Essen`, `vom Arbeiten`.
   - Pattern: `["das", "+", "Infinitiv (großgeschrieben)"]`
   - Model: `Ich lerne gern. → Das Lernen macht mir Spaß.`
   - Pitfall: `Beim lernen höre ich Musik. → Beim Lernen höre ich Musik.`
   - Table: `beim` / `zum` / `nach dem` / `vom` + meaning + example. Frames: `np` + `main`.
3. `kausal-da-weil` — "ذكر السبب بـ weil و da" · 🌧️
   - Scope: verb-final subordinate clause; `weil` neutral and usual after the main clause; `da` for a reason already known, usually in first position, more written. Subordinate clause first → main clause starts with the verb.
   - Pattern: `["Hauptsatz", ",", "weil / da", "…", "Verb am Ende"]`
   - Model: `Ich bleibe zu Hause, weil ich krank bin.` / `Da ich krank bin, bleibe ich zu Hause.`
   - Pitfall: `Ich bleibe zu Hause, weil ich bin krank. → Ich bleibe zu Hause, weil ich krank bin.`
   - Frames: `main` + `sub`; second frame `sub` + `main` with verb first. Contrast: `deshalb-daher`.
4. `deshalb-daher` — "ذكر النتيجة بـ deshalb وأخواتها" · ➡️
   - Scope: `deshalb, daher, darum, deswegen` are adverbs in a main clause: position 1 followed by the verb, or in the middle field. Reason sentence comes first, consequence second.
   - Pattern: `["Grund", ".", "deshalb", "+", "Verb", "+", "Subjekt"]`
   - Model: `Ich bin krank. Deshalb bleibe ich zu Hause.`
   - Pitfall: `Ich bin krank, deshalb ich bleibe zu Hause. → Ich bin krank, deshalb bleibe ich zu Hause.`
   - Table: `weil / da` (Nebensatz, Verb am Ende, nennt den Grund) · `denn` (Position 0) · `deshalb / daher / darum / deswegen` (Hauptsatz, Verb auf Position 2, nennt die Folge).
5. `obwohl` — "مع أنّ: التناقض بـ obwohl" · 🌦️
   - Scope: concessive subordinate clause, verb final, either order.
   - Pattern: `["obwohl", "…", "Verb am Ende", ",", "Verb", "+", "Subjekt"]`
   - Model: `Obwohl es regnet, gehe ich spazieren.`
   - Pitfall: `Obwohl es regnet, ich gehe spazieren. → Obwohl es regnet, gehe ich spazieren.`
6. `trotzdem` — "ومع ذلك: trotzdem" · 💪
   - Scope: adverb in the clause that states the unexpected result; position 1 + verb or middle field. Same content as `obwohl`, opposite clause.
   - Pattern: `["Tatsache", ".", "trotzdem", "+", "Verb", "+", "Subjekt"]`
   - Model: `Es regnet. Trotzdem gehe ich spazieren.`
   - Pitfall: `Trotzdem es regnet, gehe ich spazieren. → Obwohl es regnet, gehe ich spazieren.`
   - Table: obwohl-Satz ↔ trotzdem-Satz, three sentence pairs.

**L8**

7. `gradpartikeln` — "تقوية الصفة وتخفيفها" · 🎚️
   - Scope: `etwas, ein bisschen, ziemlich, recht, ganz, sehr, besonders, wirklich, echt, total, zu, kaum, gar nicht, überhaupt nicht`; stands directly before the adjective or adverb; with comparatives use `viel` / `etwas`, not `sehr`.
   - Pattern: `["Gradpartikel", "+", "Adjektiv / Adverb"]`
   - Model: `Der Film war ziemlich spannend.`
   - Pitfall: `Das neue Handy ist sehr besser. → Das neue Handy ist viel besser.`
   - Table: scale from weakening to strengthening with one example per row.
8. `relativ-was` — "جملة الوصل بـ was" · ❔
   - Scope: `was` after `alles, nichts, etwas, vieles, das`, after a neuter superlative noun (`das Beste, was`), and referring to a whole clause; with a preposition `wo(r)-` (`etwas, worüber …`).
   - Pattern: `["alles / nichts / etwas / das", ",", "was", "…", "Verb am Ende"]`
   - Model: `Das ist alles, was ich weiß.`
   - Pitfall: `Das ist alles, das ich weiß. → Das ist alles, was ich weiß.`
   - Frames: `main` + `rel`. Contrast: `relativ-dativ`, `pronominaladverbien`.

**L9**

9. `n-deklination` — "أسماء مذكرة تأخذ ‎-n" · 🧑‍💼
   - Scope: masculine nouns that add `-(e)n` everywhere except nominative singular: ending in `-e` (`der Kollege, der Kunde, der Junge`), `-ent, -ant, -ist, -at, -oge` (`der Student, der Praktikant, der Polizist`), plus `der Mensch, der Herr (Herrn), der Nachbar`. Mention `der Name → des Namens` in the explanation.
   - Pattern: `["der Kunde", "→", "den / dem / des Kunden"]`
   - Model: `Der Kunde wartet. → Ich rufe den Kunden an.`
   - Pitfall: `Ich kenne den Student. → Ich kenne den Studenten.`
   - Table: Nominativ / Akkusativ / Dativ / Genitiv × Singular / Plural for `der Kunde`.
10. `sodass` — "نتيجة الفعل بـ sodass و so … dass" · 🌊
    - Scope: consequence clause, always after the main clause, verb final; `so` + adjective in the main clause moves the stress onto the degree.
    - Pattern: `["Hauptsatz", ",", "sodass", "…", "Verb am Ende"]`
    - Model: `Es hat stark geregnet, sodass wir zu Hause geblieben sind.` / `Es hat so stark geregnet, dass wir zu Hause geblieben sind.`
    - Pitfall: `Es war so kalt, sodass wir gefroren haben. → Es war so kalt, dass wir gefroren haben.`
11. `indem` — "الوسيلة والطريقة بـ indem" · 🛠️
    - Scope: answers "Wie? / Wodurch?"; verb final; usually the same subject in both clauses; alternative `durch` + nominalised verb.
    - Pattern: `["Ziel", ",", "indem", "…", "Verb am Ende"]`
    - Model: `Man spart Strom, indem man das Licht ausschaltet.`
    - Pitfall: `Das ist das Haus, indem ich wohne. → Das ist das Haus, in dem ich wohne.`
12. `brauchen` — "الفعل brauchen بمعنييه" · 🧺
    - Scope: full verb + Akkusativ; `nicht / kein / nur` + `brauchen` + `zu` + Infinitiv = `nicht müssen` / `nur müssen`; positive obligation needs `müssen`.
    - Pattern: `["nicht / nur", "+", "brauchen", "+", "zu", "+", "Infinitiv"]`
    - Model: `Du brauchst nicht zu warten.` / `Du brauchst nur anzurufen.`
    - Pitfall: `Du brauchst morgen zu kommen. → Du musst morgen kommen.`
    - Table: `brauchen + Akkusativ` · `nicht brauchen zu` · `nur brauchen zu` · `müssen`.

**L10**

13. `plusquamperfekt` — "الماضي الأسبق" · ⏪
    - Scope: `hatte / war` + Partizip II for the earlier of two past events; choice of auxiliary as in Perfekt.
    - Pattern: `["hatte / war", "+", "Partizip II"]`
    - Model: `Als ich am Bahnhof ankam, war der Zug schon abgefahren.`
    - Pitfall: `Ich hatte schon nach Hause gegangen. → Ich war schon nach Hause gegangen.`
    - Table: conjugation of `hatte` and `war`.
14. `bevor-bis` — "قبل أن وإلى أن: bevor و bis" · ⏱️
    - Scope: `bevor` (main-clause action happens first; same tense in both clauses) and `bis` (end point); conjunction `bevor` versus preposition `vor`.
    - Pattern: `["bevor / bis", "…", "Verb am Ende"]`
    - Model: `Bevor ich frühstücke, dusche ich.` / `Ich warte, bis du kommst.`
    - Pitfall: `Vor ich esse, wasche ich mir die Hände. → Bevor ich esse, wasche ich mir die Hände.`
15. `seit-waehrend` — "منذ أن وبينما: seit(dem) و während" · 🕰️
    - Scope: `seit / seitdem` (started in the past, still true, present tense in the main clause) and temporal `während` (two actions at the same time).
    - Pattern: `["seit(dem) / während", "…", "Verb am Ende"]`
    - Model: `Seit ich in Berlin wohne, lerne ich Deutsch.` / `Während ich koche, höre ich Radio.`
    - Pitfall: `Seit ich bin in Berlin, lerne ich Deutsch. → Seit ich in Berlin bin, lerne ich Deutsch.`
16. `nachdem` — "بعد أن: nachdem وتتابع الأزمنة" · 🔁
    - Scope: the `nachdem` clause is one tense earlier than the main clause.
    - Pattern: `["nachdem", "+", "Plusquamperfekt", ",", "Präteritum / Perfekt"]`
    - Model: `Nachdem ich gegessen hatte, ging ich spazieren.` / `Nachdem ich gegessen habe, gehe ich spazieren.`
    - Pitfall: `Nachdem ich aß, ging ich spazieren. → Nachdem ich gegessen hatte, ging ich spazieren.`
    - Table: Nebensatz Plusquamperfekt → Hauptsatz Präteritum / Perfekt; Nebensatz Perfekt → Hauptsatz Präsens / Futur.

**L11**

17. `erststellen-es` — "es يملأ الموقع الأول" · 🪑
    - Scope: `es` only fills position 1 and disappears when anything else stands there; the verb agrees with the real subject; frequent in the subjectless passive.
    - Pattern: `["Es", "+", "Verb", "+", "Subjekt", "…"]`
    - Model: `Es kamen viele Gäste. → Viele Gäste kamen.` / `Es wurde viel gelacht. → Gestern wurde viel gelacht.`
    - Pitfall: `Gestern wurde es viel gelacht. → Gestern wurde viel gelacht.`
18. `konjunktiv2-vergangenheit` — "لو أنّ… في الماضي" · 🕳️
    - Scope: `hätte / wäre` + Partizip II in both clauses; German has one past form of Konjunktiv II; variant without `wenn`, verb first (`Hätte ich das gewusst, …`).
    - Pattern: `["wenn", "…", "Partizip II", "+", "hätte / wäre", ",", "hätte / wäre", "…", "Partizip II"]`
    - Model: `Wenn ich das gewusst hätte, wäre ich früher gekommen.`
    - Pitfall: `Wenn ich Zeit gehabt hätte, würde ich gekommen. → Wenn ich Zeit gehabt hätte, wäre ich gekommen.`
    - Table: Gegenwart (`wenn ich Zeit hätte, würde ich kommen`) versus Vergangenheit.
19. `nominalisierte-adjektive` — "صفات تصير أسماء" · 🧍
    - Scope: adjectives and participles used as nouns keep adjective endings and are capitalised: `der Angestellte / ein Angestellter / die Angestellten`, `der Deutsche / ein Deutscher`, `die Reisenden`, `der Verletzte`; neuter after `etwas / nichts / viel`: `etwas Neues`.
    - Pattern: `["Artikel", "+", "Adjektiv mit Endung (großgeschrieben)"]`
    - Model: `Ein Bekannter von mir arbeitet hier.`
    - Pitfall: `Ein Deutsche wohnt neben mir. → Ein Deutscher wohnt neben mir.`
    - Table: `der Bekannte / ein Bekannter / die Bekannte / die Bekannten / Bekannte` across Nominativ, Akkusativ, Dativ.
20. `waehrend-adversativ` — "في حين أنّ: während للمقابلة" · ↔️
    - Scope: `während` contrasting two facts, verb final; how to tell it from temporal `während`; alternatives `aber`, `dagegen`.
    - Pattern: `["während", "…", "Verb am Ende", ",", "Verb", "+", "Subjekt"]`
    - Model: `Während mein Bruder gern Sport macht, lese ich lieber.`
    - Pitfall: `Während mein Bruder macht gern Sport, ich lese lieber. → Während mein Bruder gern Sport macht, lese ich lieber.`

**L12**

21. `irgend-pronomen` — "irgendwo و irgendwann وأخواتهما" · 🌫️
    - Scope: `irgendwann` (time), `irgendwo` (place), `irgendwie` (manner), `irgendwer / irgendjemand` (person), `irgendwas / irgendetwas` (thing); mostly spoken language.
    - Pattern: `["irgend", "+", "wann / wo / wie / wer / was"]`
    - Model: `Ich habe das irgendwo gelesen.`
    - Pitfall: `Ich habe das irgendwie im Internet gelesen. → Ich habe das irgendwo im Internet gelesen.`
    - Table: form → what is left open (Zeit, Ort, Art und Weise, Person, Sache).
22. `konjunktiv2-vergangenheit-modal` — "الشرط غير الواقعي في الماضي مع الأفعال الناقصة والمجهول" · 🧪
    - Scope: `hätte` + Infinitiv + Modalverb im Infinitiv; in a subordinate clause `hätte` stands before the two infinitives; passive `wäre` + Partizip II + `worden`.
    - Pattern: `["hätte", "+", "Infinitiv", "+", "können / müssen / sollen"]`
    - Model: `Ich hätte dir helfen können.` / `Der Fehler wäre fast übersehen worden.`
    - Pitfall: `Ich hätte kommen gekonnt. → Ich hätte kommen können.`
23. `futur1` — "المستقبل والتوقّع بـ werden" · 🔮
    - Scope: `werden` + Infinitiv for forecasts, assumptions (`wohl, wahrscheinlich, sicherlich`) and statements about the future; present tense + time expression for fixed plans; `werden` at the end in subordinate clauses.
    - Pattern: `["werden", "+", "…", "+", "Infinitiv"]`
    - Model: `In zehn Jahren werden viele Menschen von zu Hause arbeiten.`
    - Pitfall: `Morgen werde ich gehe zum Arzt. → Morgen werde ich zum Arzt gehen.`
    - Table: conjugation of `werden`. Contrast: passive (`werden` + Partizip II).

---

## 5. Content data model

All content lives in `grammar/content/`. `scripts/assemble-content.js` merges it into one object `{version, levels, islands, badges, lessons}`; the dev server serves it as `/content.json`, the build writes it into `dist/site/content.json` and inlines it in the single file as `<script id="content" type="application/json">`.

### 5.1 `levels.json`

```json
[
  { "id": "B1.1", "book": "Auf jeden Fall! Deutsch B1.1", "lektionen": [1, 6],
    "sample": "https://www.telc.net/fileadmin/user_upload/Downloads_Verlag/Auf_jeden_Fall/Probekapitel/V01-4011-WPK-BAE00_Auf_jeden_Fall_B1.1_Probekapitel_Web.pdf" },
  { "id": "B1.2", "book": "Auf jeden Fall! Deutsch B1.2", "lektionen": [7, 12], "sample": null }
]
```

### 5.2 `islands.json` (one entry per row of §3.1)

```json
{
  "id": "nomen-kasus",
  "order": 1,
  "emoji": "🏷️",
  "palette": "blue",
  "name": { "de": "Nomen & Kasus", "ar": "الأسماء والحالات الإعرابية" },
  "nickname": { "de": "Kasus-Kap", "ar": "رأس الحالات" },
  "blurb": { "de": "Genitiv, N-Deklination und Nomen aus anderen Wortarten.", "ar": "حالة Genitiv وتصريف الأسماء وتكوين أسماء من أفعال وصفات." },
  "pos": { "wide": [150, 160], "tall": [190, 150] }
}
```

`pos` values are in §8.1. The lesson list of an island is derived from the lessons' own `island` and `order` fields, never duplicated here.

### 5.3 Lesson file `lessons/<id>.json`

```json
{
  "id": "passiv-perfekt",
  "level": "B1.1",
  "island": "passiv",
  "order": 1,
  "prereqs": [],
  "emoji": "🧰",
  "german": "Passiv Perfekt",
  "source": { "lektion": 1, "kind": "toc" },
  "pattern": ["sein", "+", "Partizip II", "+", "worden"],
  "frames": [
    { "k": "main", "parts": [["vf", "Das Fenster"], ["v", "ist"], ["mf", "(von der Firma)"], ["ve", "repariert worden"]] },
    { "k": "sub",  "parts": [["c", "weil"], ["mf", "die Fenster"], ["ve", "repariert worden sind"]] }
  ],
  "example": "Die Firma hat das Fenster repariert. → Das Fenster ist repariert worden.",
  "stepExamples": ["Die Firma hat das Fenster repariert.", "Das Fenster ist …", "…"],
  "pitfallPair": "Der Aufzug ist repariert geworden. → Der Aufzug ist repariert worden.",
  "links": ["https://…", "https://…"],
  "i18n": {
    "ar": {
      "title": "المبني للمجهول في الماضي",
      "lead": "…",
      "translation": "أصلحت الشركة النافذة ← أُصلحت النافذة.",
      "steps": [{ "text": "…", "why": "…" }],
      "explain": ["…"],
      "pitfall": "…",
      "recall": ["question", "answer"],
      "linkTitles": ["…", "…"],
      "table": [["header", "…"], ["row label", "…"]]
    },
    "de": { "title": "Passiv im Perfekt", "lead": "…", "steps": [{ "text": "…", "why": "…" }],
            "explain": ["…"], "pitfall": "…", "recall": ["…", "…"], "linkTitles": ["…"], "table": null }
  },
  "questions": []
}
```

Field rules (enforced by `validate-content.js`):

| Field | Rule |
|---|---|
| `id` | `^[a-z0-9]+(-[a-z0-9]+)*$`, equals the file name, unique |
| `level` | `B1.1` or `B1.2`; must agree with `source.lektion` (1–6 / 7–12) |
| `island` | existing island id |
| `order` | integer ≥ 1, unique inside the island, contiguous |
| `prereqs` | existing lesson ids, no cycles |
| `source.kind` | `toc` (title only known from the contents page) or `sample` (rule appears in a publisher sample). Legacy rule: chapter 3 → `sample`, everything else `toc` |
| `pattern` | 2–12 strings; operators are exactly `+ , · … →` |
| `frames[].k` | `main, sub, rel, inf, np` |
| `frames[].parts[][0]` | `vf, v, mf, ve, c, n, hl` |
| `stepExamples` | same length as `i18n.*.steps` (4 or 5) |
| `pitfallPair` | contains exactly one ` → ` |
| `links` / `linkTitles` | same length (2–4), URLs start with `https://` |
| `i18n.ar.translation` | required; absent in `de` |
| `table` | optional; if present in `ar` and absent in `de`, the German view shows the Arabic-header table (legacy behaviour); all rows same length |
| text fields | non-empty, no leading or trailing whitespace, backticks balanced |

### 5.4 Questions

Common shape:

```json
{ "id": "passiv-perfekt-1", "type": "cloze", "difficulty": 1,
  "i18n": { "ar": { "prompt": "…", "explain": "…", "hints": ["…"] },
            "de": { "prompt": "…", "explain": "…", "hints": ["…"] } } }
```

Type-specific fields:

| type | Fields | Rules |
|---|---|---|
| `cloze` | `text`, `blanks` | `text` contains `{{1}}`…`{{n}}`; `blanks` is an array of n arrays of accepted answers (first = shown solution) |
| `mcq` | `options`, `answer` | 3–4 options, `answer` is a valid index. If the options are language-dependent, omit the top-level `options`/`answer` and give them in both `i18n.ar` and `i18n.de` |
| `order` | `items` | 4–8 items in the correct order; no two identical items |
| `text` | `answer`, `context?` | `answer` is the model solution; `context` is a German sentence shown above the input |

`id` is `<lessonId>-<n>` with n starting at 1 and contiguous. The lesson id is implicit (no `topic` field in the file; `content.js` adds `q.lesson` when indexing). The legacy `src` and `grounded` fields are dropped.

Template for the 9 questions of a new lesson:

| n | type | difficulty | Purpose |
|---|---|---|---|
| 1 | cloze | 1 | one blank, the core form |
| 2 | cloze | 1 | one or two blanks, second core case |
| 3 | mcq | 1 | recognise the correct sentence among three |
| 4 | cloze | 2 | two blanks or a less obvious context |
| 5 | order | 2 | build the clause (sentence-level topics). Word-level topics (`indefinitpronomen`, `verben-als-nomen`, `gradpartikeln`, `n-deklination`, `nominalisierte-adjektive`, `irgend-pronomen`) may use a second cloze here |
| 6 | mcq | 2 | meaning or contrast with the neighbouring lesson |
| 7 | text | 3 | transform a given sentence |
| 8 | text | 3 | with `context`: correct the lesson's pitfall sentence and say why |
| 9 | text | 2 | produce an own sentence from a short Arabic/German cue |

Each question has exactly one hint. Explanations are one or two sentences.

### 5.5 `badges.json`

Array of `{id, emoji, name:{de,ar}, text:{de,ar}}`; conditions live in code (§7.6).

---

## 6. Application architecture

### 6.1 Module responsibilities

| Module | Responsibility | Pure? |
|---|---|---|
| `main.js` | boot order: theme → content → state (+migration) → chrome → router | no |
| `content.js` | load content (inline script tag first, else `fetch('content.json')`), build `lessons: Map`, `questions: Map`, `islandLessons(id)`, `route(levelFilter)`, `localize(lesson, lang)`, `localizeQuestion(q, lang)` | mostly |
| `state.js` | `load()`, `save()` (debounced 150 ms, flush on `pagehide`), `update(fn)`, `subscribe(fn)`, `exportBackup()`, `importBackup(json)`, `reset(scope)` | no |
| `router.js` | `parse(hash) → {view, key}`; validation against content; unknown → `home`; legacy `#practice/unit-N` → `#practice` | `parse` pure |
| `dates.js` | `today()` → local `YYYY-MM-DD`, `addDays`, `diffDays`; one injectable clock for tests | pure |
| `i18n/index.js` | `t(key, ...args)`, `setLang`, `num()`; `ar.js` / `de.js` export flat objects with identical keys | pure |
| `engine/grading.js` | `normalize`, `isCorrect`, `answered` — ported verbatim from the legacy file | pure |
| `engine/runs.js` | `newRun(key, ctx, rng)`, `mixedQuestions`, `examQuestions`, `reviewQuestions`, `permutation` | pure (rng injected) |
| `engine/progress.js` | `record(state, q, correct, meta)`, `lessonStars`, `islandProgress`, `overall`, `nextLesson`, `pendingErrors` | pure |
| `engine/gamification.js` | `award(state, event) → {xp, levelUp, badges[]}`, `levelFor(xp)`, `updateStreak`, `checkBadges` | pure |
| `engine/srs.js` | `schedule(result, correct, today)`, `dueIds(state, today)` | pure |
| `engine/migrate.js` | `migrateLegacy(legacyState, content, today) → state`, `importLegacyExport(json, …)`, version upgrades | pure |
| `views/*.js` | `render(model) → html string` plus `mount(root)` for events | render pure |
| `components/map.js` | archipelago SVG string + token animation | render pure |
| `components/trail.js` | island lesson trail | render pure |
| `components/hud.js` | streak, XP, level chip in the top bar | render pure |
| `components/toast.js` | XP, level-up, badge and conquest toasts with `aria-live="polite"` | no |
| `components/html.js` | `esc`, `prose`, `de`, `germanLine`, `link`, `button` — ported verbatim | pure |

Rule: views never write to `localStorage` and never compute XP. They call `state.update(s => engine…)` and render from state.

### 6.2 Routes

> **Update, November 2026 (redesign).** The platform is now called Deutschpfad and the grammar islands are its B1 course. The shell has a navigation rail on desktop and a five-tab bar on phones (Lernen, Vokabeln, Schreiben, Üben, Profil; the exam trainer sits in the rail and on the practice page). New routes: `#level/<a1|a2|b1|b2|c1>`, `#vokabeln`, `#schreiben` and `#topics` (the topic index and island map that used to sit in the sidebar and on the dashboard). `#home` shows the course path, with one module per island, and `#island/<id>` shows one module. The trail walker and `components/trail.js` were removed. Lessons and practice runs open as a focused player without the navigation. The table below describes the original routes.

| Hash | View | Notes |
|---|---|---|
| `#home` (or empty) | dashboard | map + all topics + progress summary |
| `#island/<islandId>` | island trail | lessons of one island + exam node |
| `#lesson/<lessonId>` | lesson | same hash as the legacy file, old bookmarks keep working |
| `#practice` | practice launcher | |
| `#practice/<key>` | quiz / results | key ∈ lesson id · `island-<islandId>` · `exam-<islandId>` · `mixed` · `test` · `mistakes` · `review` |
| `#progress` | statistics and badges | |
| `#settings` | settings, backup, reset | |

Tab highlighting: `home` and `island/*` and `lesson/*` → Home tab; `practice*` → Practice; `progress` → Progress.

### 6.3 Run kinds

| key | Selection | Size | Mode |
|---|---|---|---|
| `<lessonId>` | all questions of the lesson, original order | 9–10 | practice (feedback after each answer) |
| `island-<id>` | all questions of the island's lessons (level filter applied), shuffled | all | practice |
| `exam-<id>` | §7.5 | 8–12 | exam (no hints, results at the end, no timer) |
| `mixed` | for each island (level filter applied) two different random lessons: one question of difficulty 1 or 2 from the first, one of difficulty 2 or 3 from the second; shuffled | up to 20 | practice |
| `test` | same as `mixed` but never `text`, difficulties 1–2 and 2; 20-minute deadline | up to 20 | test (legacy behaviour) |
| `mistakes` | all questions with `needsReview` | all | practice |
| `review` | questions with `due ≤ today`, oldest first | max 20 | practice |

The `Run` object keeps the legacy shape: `{key, mode, deadline, ids, answers, grades, order, position, finished}` with `mode ∈ practice | test | exam`.

---

## 7. Gamification rules

### 7.1 Lesson state and stars

| Stars | Meaning | How |
|---|---|---|
| 0 | not learned | default |
| ★ | learned | press "أنهيتُ الدرس / Lektion abschließen". The button is enabled once every step has been revealed. Not reversible from the lesson (reset lives in Settings) |
| ★★ | practised | finish the lesson's own practice run with `correct / total ≥ 0.66` (6 of 9, 7 of 10) |
| ★★★ | mastered | finish the lesson's own practice run with `correct / total ≥ 0.88` (8 of 9, 9 of 10) |

Stars only go up: `stars[id] = max(old, new)`. Reaching ★★ or ★★★ without ★ also marks the lesson learned and pays the lesson XP. Self-graded text answers count as the learner marks them.

### 7.2 XP

| Event | XP | Limit |
|---|---|---|
| Lesson learned (first ★) | 20 | once per lesson |
| Question correct for the first time | 5 / 8 / 12 for difficulty 1 / 2 / 3; halved (rounded down) if a hint was opened on that attempt | once per question (`xpDone`) |
| Question correct again | 1 | once per question per day |
| Due review answered correctly (`review` run) | 3 | replaces the 1 above |
| Lesson practice run finished | 10 | once per lesson per day |
| Lesson practice run with every answer correct | 15 | once per lesson ever |
| Island exam passed | 100 the first time, 20 afterwards | — |
| Timed test finished | 15, plus 15 if ≥ 90 % | once per day |
| Daily goal reached | 10 | once per day, does not count towards the goal |

In `test` and `exam` mode question XP is paid when the run is submitted. XP is never taken away.

### 7.3 Ranks

| Level | XP from | German | Arabic |
|---|---|---|---|
| 1 | 0 | Neu an Bord | مُبحر جديد |
| 2 | 150 | Matrose·in | بحّار |
| 3 | 400 | Am Steuer | على الدفّة |
| 4 | 800 | Navigator·in | ملّاح |
| 5 | 1 400 | Entdecker·in | مستكشف |
| 6 | 2 200 | Kartograf·in | رسّام خرائط |
| 7 | 3 200 | Kapitän·in | قبطان |
| 8 | 4 500 | Inselmeister·in | سيّد الجزر |
| 9 | 6 000 | Grammatik-Legende | أسطورة القواعد |

Reference: learning everything once with good results yields about 6 900 XP (51×20 lessons + 51×71 first-time questions + 51×25 run bonuses + 10×100 exams).

### 7.4 Daily goal and streak

- Daily goal: 15, 30 (default) or 60 XP, chosen in Settings.
- `xp.byDay[today]` accumulates every XP event except the daily-goal bonus. Keep the last 400 days.
- When `byDay[today]` first reaches the goal: if `streak.lastGoalDay` is yesterday → `current += 1`; if it is today → nothing; otherwise `current = 1`. Then `lastGoalDay = today`, `best = max(best, current)`.
- On load: if `lastGoalDay` is older than yesterday, show `current` as 0 (do not rewrite history until the next goal day).
- Days are local device days from `dates.today()`.

### 7.5 Island exam and conquest

- The exam node is active when every lesson of the island (all levels, ignoring the level filter) has ★ or more. Otherwise it is shown dimmed with the text "تعلّم كل دروس الجزيرة أولًا (٣ من ٥)" / "Lerne zuerst alle Lektionen der Insel (3 von 5)".
- Question count `n = clamp(2 × lessonCount, 8, 12)`.
- Selection: shuffle the island's lessons; go round-robin; from each lesson take a not-yet-chosen non-`text` question, alternating difficulty 2 then 1; stop at `n`.
- Mode `exam`: no hints, no per-question feedback, free navigation, submit with confirmation (reuse the legacy test confirmation), results list afterwards.
- Pass mark: `correct ≥ ceil(0.8 × n)`.
- Passing sets `islands[id].conquered = today` (kept forever), plants the flag on the map, pays XP, may award badges. `examBest` and `examTries` are always updated.

### 7.6 Badges

| id | Emoji | German · Arabic | Condition |
|---|---|---|---|
| `first-step` | 👣 | Erster Schritt · الخطوة الأولى | 1 lesson learned |
| `bullseye` | 🎯 | Volltreffer · إصابة كاملة | first ★★★ |
| `streak-3` | 🔥 | 3 Tage am Stück · ثلاثة أيام متتالية | streak 3 |
| `streak-7` | 🔥 | Eine Woche · أسبوع كامل | streak 7 |
| `streak-30` | 🌋 | Ein Monat · شهر كامل | streak 30 |
| `land-ho` | 🚩 | Land in Sicht · أرضٌ في الأفق | 1 island conquered |
| `half-chart` | 🗺️ | Halbe Seekarte · نصف الخريطة | 5 islands conquered |
| `all-islands` | 👑 | Alle Inseln · كل الجزر | 10 islands conquered |
| `b11` | 📘 | B1.1 komplett · أتممتَ B1.1 | all 28 B1.1 lessons learned |
| `b12` | 📗 | B1.2 komplett · أتممتَ B1.2 | all 23 B1.2 lessons learned |
| `flawless-exam` | 💎 | Fehlerfrei · بلا أخطاء | an island exam with 100 % |
| `mistake-hunter` | 🧹 | Fehlerjäger·in · صيّاد الأخطاء | 20 questions cleared from review (`stats.mistakesCleared`) |
| `reviewer` | 🔁 | Dranbleiben · المواظبة | 50 due reviews answered (`stats.reviewsDone`) |
| `timed-ace` | ⏱️ | Gegen die Uhr · سباق مع الوقت | timed test ≥ 90 % |
| `xp-1000` / `xp-5000` | ⭐ / 🌟 | 1 000 XP / 5 000 XP | total XP |

`checkBadges` runs after every `award`. New badges produce one toast each and appear on the Progress page (earned in colour with date, unearned greyed with the condition text).

### 7.7 Spaced review (Leitner)

- Every attempted question has `box` 1–5 and `due`. Intervals in days by box: 1 → 1, 2 → 3, 3 → 7, 4 → 14, 5 → 30.
- Correct: `box = min(5, box + 1)`, `due = today + interval[box]`. Wrong: `box = 1`, `due = today + 1`, `needsReview = true`.
- `needsReview` keeps the legacy rule (cleared after two correct answers in a row); clearing it increments `stats.mistakesCleared`.
- Answers in `test` and `exam` runs update boxes too.
- The dashboard "Today" card shows the number of due questions; the button opens `#practice/review`.

### 7.8 Player position and movement

- `player.at` is a lesson id. Initial value: first lesson of the route.
- Opening a lesson sets `player.from = player.at`, `player.at = lessonId`, `player.animate = (from !== at)`.
- Earning the first ★ of a lesson sets `player.from = that lesson`, `player.at = nextLesson(state)`, `player.animate = true`.
- `nextLesson`: walk the route (islands by `order`, lessons by `order`, level filter applied); first lesson with 0 stars; if none, first with fewer than 3 stars; if none, `null` (token sits on the treasure).
- The next time the map or a trail is rendered with `player.animate === true`, the token starts at `from`, travels to `at` and the flag is cleared. On the archipelago the token is a boat that sails between islands; inside an island it is a walker that moves between lesson nodes. If `from` and `at` are on the same island, the archipelago shows no movement.

---

## 8. Island map specification

### 8.1 Archipelago (`components/map.js`)

One inline SVG, two layouts chosen by container width (`ResizeObserver`): **wide** when the map container is ≥ 720 px, otherwise **tall**.

| Layout | viewBox | Island scale |
|---|---|---|
| wide | `0 0 1200 800` | 1 |
| tall | `0 0 600 1800` | 0.85 |

Island centres (route order 1–10) and the treasure goal:

| # | Island | wide x,y | tall x,y |
|---|---|---|---|
| 1 | nomen-kasus | 150, 160 | 190, 150 |
| 2 | adjektive | 420, 120 | 410, 310 |
| 3 | pronomen | 690, 170 | 190, 470 |
| 4 | relativsaetze | 980, 130 | 410, 630 |
| 5 | infinitiv-verben | 1040, 390 | 190, 790 |
| 6 | passiv | 770, 420 | 410, 950 |
| 7 | zeiten | 500, 380 | 190, 1110 |
| 8 | grund-folge | 220, 420 | 410, 1270 |
| 9 | gegensatz-vergleich | 330, 640 | 190, 1430 |
| 10 | konjunktiv-bedingung | 620, 640 | 410, 1590 |
| — | treasure 🏆 | 940, 650 | 190, 1735 |

Layers, back to front:

1. Sea: `<rect>` filling the viewBox, `fill: var(--sea)`, corner radius 24. Twelve decorative wave marks (`~` shaped paths, `stroke: var(--sea-deep)`, opacity 0.6) at fixed positions; hidden from assistive tech.
2. Route: one `<path id="route">` through the 11 dock points (island centre + (0, 62·scale)). Build with a Catmull-Rom → cubic Bézier conversion: for segment Pᵢ→Pᵢ₊₁ the control points are `Pᵢ + (Pᵢ₊₁ − Pᵢ₋₁)/6` and `Pᵢ₊₁ − (Pᵢ₊₂ − Pᵢ)/6`, with the end points duplicated. Style: `stroke: var(--line-strong)`, width 3, `stroke-dasharray: 2 10`, round caps. A second path over it (`stroke: var(--brand)`, width 4, solid) is clipped with `stroke-dasharray` to the length reached by the last conquered island.
3. Islands: each a `<g>` wrapped in `<a href="#island/<id>">` with `role="link"` and an `aria-label` such as "Passiv, 2 of 4 lessons learned, not conquered".
   - shallow water: ellipse rx 104 ry 70, `fill: var(--sea-shallow)`
   - beach: ellipse rx 88 ry 58, `fill: var(--sand)`
   - land: ellipse rx 74 ry 46, centre shifted (0, −6), `fill: var(--t-<palette>)`, `stroke: var(--line-strong)`
   - landmark: island emoji, font-size 40, at (0, −14)
   - progress ring: circle r 18 at (−72, −48), track `var(--line)`, arc `var(--brand)` (gold when conquered) showing `stars / (3 × lessons)`; the percentage is in the `aria-label`, not drawn as text
   - flag 🚩 at (48, −50) when conquered
   - name plate: rounded rect (height 44, radius 12, `fill: var(--surface)`, shadow) centred at (0, 96) with two lines: island name in the UI language (bold 15 px) and "3/5 · ★ 7" (12 px, muted)
   - states: *untouched* (0 stars): land at 55 % opacity plus a white "fog" ellipse at 35 % opacity; *in progress*: full colour; *conquered*: full colour, gold ring, flag
   - hover/focus: translateY(−3 px) and a 3 px focus ring in `var(--focus)`
4. Next-stop marker: pulsing ring (r 96→110, 1.6 s, infinite, disabled under reduced motion) around the island that contains `nextLesson`.
5. Player token: `<g id="token">`: white circle r 22, 3 px `var(--brand)` stroke, ⛵ emoji 24 px. Rest position: dock point of the island of `player.at`.
6. Treasure: 🏆 at the goal position, dimmed until all islands are conquered.

Token animation: with `route.getTotalLength()` and the cumulative length at each dock point, animate the token's `transform` from the dock of `from`'s island to the dock of `at`'s island with `requestAnimationFrame`, sampling `getPointAtLength`. Duration `min(2400, 900 × hops)` ms, ease-in-out cubic. Travelling backwards along the route works the same way. With `prefers-reduced-motion: reduce` or the Settings switch, place the token at the destination immediately.

Keyboard: islands are in DOM order 1–10, reachable with Tab; Enter opens the island. A visually hidden list of the same links precedes the SVG for screen readers, and the SVG itself is `aria-hidden="true"` except for that list (so there is a single accessible representation).

RTL: the map is not mirrored (`direction: ltr` on the SVG); only the text inside name plates follows the UI language.

### 8.2 Island trail (`#island/<id>`, `components/trail.js`)

- Header banner in the island palette: emoji, name, nickname, blurb, progress bar, "x of y learned", star total, buttons "Practise this island" (`#practice/island-<id>`) and "Back to the map".
- Trail: `<ol class="trail">`, one `<li>` per lesson in `order`, plus a final `<li>` for the exam. Nodes alternate start/end alignment (zigzag) on screens ≥ 560 px and form a single column below. A decorative SVG connector (dashed curve) runs behind the nodes.
- Lesson node (an `<a href="#lesson/<id>">`): 72 px circle with the lesson emoji; ring colour by state (grey = 0 stars, brand = ★, brand + check = ★★, gold = ★★★); beside it the title in the UI language, the German name, a level chip (`B1.1` / `B1.2`), three stars, and, if any prerequisite is unlearned, the "best first" chip.
- Exam node: 🏰 with the text and gating of §7.5; when conquered it shows 🚩, the best score and "Repeat exam".
- Walker token (🚶 in a 36 px brand circle) sits beside the node of `player.at` when that lesson belongs to this island; it moves between nodes with a FLIP transform transition of 600 ms.

---

## 9. Screens

### 9.1 Shell (all views)

- Top bar: menu button (mobile), brand ("جُزُر القواعد" / "Grammatikinseln", sub-line `B1.1 · B1.2`), tabs Home 🗺️ · Practice ✏️ · Progress 📈, HUD (🔥 streak number, level chip with XP bar that opens `#progress`), language toggle `ع | DE`, theme button, settings ⚙️.
- Sidebar (desktop ≥ 1110 px; drawer below): search field, then one collapsible group per island (emoji, name, `learned/total`), each lesson as a link with its star count, footer with overall progress. Search matches Arabic title, German title, German name, island names (reuse `localeSearch`).
- Bottom navigation on mobile with the same three tabs.
- Footer: "Based on the grammar progression of *Auf jeden Fall! Deutsch B1.1 / B1.2* (telc). All explanations and exercises are original."

### 9.2 Dashboard (`#home`)

Top to bottom:

1. **Continue card** (two thirds width on desktop): greeting, rank and XP bar to the next rank, the next recommended lesson (emoji, title, island, level chip) with primary button "تابع / Weiter", secondary "Choose a practice".
2. **Today card** (one third): daily-goal ring (`xp today / goal`), streak with the last seven days as dots, due reviews count with button, pending mistakes count with button.
3. **Map**: the archipelago of §8.1 inside a panel titled "خريطة الجزر / Inselkarte", max height 560 px on desktop.
4. **All topics**: heading with overall numbers ("51 lessons · 460 exercises · 10 islands", computed from the content) and level filter chips `الكل / Alle · B1.1 · B1.2`. Grid `repeat(auto-fill, minmax(300px, 1fr))` of ten island cards. Each card: emoji on palette tile, name in the UI language with the other language as sub-line, progress bar with `learned/total`, conquest state, then the lesson list (title, German name, level chip, stars; a row is a link to the lesson), and a footer link "Open island".

The level filter hides non-matching lessons in the cards and the sidebar, and restricts `mixed`, `test`, `review` and `nextLesson`. Island cards with no remaining lessons are hidden. The map always shows all ten islands.

### 9.3 Lesson (`#lesson/<id>`)

Same content blocks as today, in this order: breadcrumb (Home › island name), banner (emoji, "lesson x of y on this island", title, German name, level chip, prerequisite chip, lead, buttons "Lesson exercises · 9" and stars display), *rule at a glance* (pattern + frames), step-by-step example, detailed explanation, pitfall, recall, reference table, sources (collapsed; first line "Auf jeden Fall! B1.2 · Lektion 9" plus the sample/contents note), then the **completion bar**: "أنهيتُ الدرس / Lektion abschließen" (primary, enabled when all steps are shown) and "Next lesson" / "Back to the island". Previous/next navigation follows the island order, then continues to the next island.

### 9.4 Practice launcher (`#practice`)

Panels: *By topic* (select with optgroups per island: whole island, then each lesson; plus "Mixed"), *Due reviews*, *Timed test*, *My mistakes*, *Island exams* (ten rows with state and button). Unfinished run notice as today.

### 9.5 Quiz and results

Ported from the legacy file without behavioural change (question header with kind and difficulty label, hints, check, self-grading for text, order pieces, test timer and confirmation). Additions: XP toast after a correct answer in practice mode; results page shows XP earned in this run, stars gained (lesson runs), pass/fail and conquest (exam runs), and buttons "Back to the island" / "New run".

### 9.6 Progress (`#progress`)

Rank card with XP bar; three stat tiles (lessons learned, total stars of 153, islands conquered); streak calendar of the last 12 weeks (7×12 grid from `xp.byDay`, four intensity steps); badges grid; table per island with per-lesson correct counts (the legacy "by lesson" list grouped by island); export button.

### 9.7 Settings (`#settings`)

Language, theme (auto / light / dark), daily goal, level filter, reduce motion, backup download, restore from file (new backup format or legacy results export), reset one lesson, reset everything (confirmation by typing the word shown).

---

## 10. State and migration

### 10.1 Keys

| Key | Content |
|---|---|
| `gi-state-v1` | the state object below |
| `gi-lang` | `ar` or `de` (read by the pre-paint inline script) |
| `gi-theme` | `light` or `dark`; absent = follow the system |

### 10.2 State object

```json
{
  "v": 1,
  "createdAt": "2026-11-14",
  "settings": { "levelFilter": "all", "dailyGoal": 30, "reduceMotion": false },
  "completed": { "<lessonId>": "YYYY-MM-DD" },
  "stars": { "<lessonId>": 3 },
  "lessonBonus": { "<lessonId>": { "runDay": "YYYY-MM-DD", "perfect": true } },
  "results": { "<questionId>": { "correct": true, "streak": 2, "tries": 3, "needsReview": false,
                                "box": 3, "due": "YYYY-MM-DD", "last": "YYYY-MM-DD", "xpDone": true } },
  "runs": { "<runKey>": {} },
  "lastRun": "mixed",
  "lastLesson": "genitiv",
  "islands": { "<islandId>": { "conquered": "YYYY-MM-DD", "examBest": 11, "examTries": 2 } },
  "xp": { "total": 0, "byDay": { "YYYY-MM-DD": 0 }, "goalBonusDay": null, "testDay": null },
  "streak": { "current": 0, "best": 0, "lastGoalDay": null },
  "badges": { "<badgeId>": "YYYY-MM-DD" },
  "stats": { "mistakesCleared": 0, "reviewsDone": 0 },
  "player": { "at": "genitiv", "from": null, "animate": false }
}
```

`load()` fills missing keys with defaults, drops ids that no longer exist in the content, and falls back to an in-memory state when storage is unavailable (keep the legacy "storage unavailable" notice).

### 10.3 Migration from the legacy file

Runs once when `gi-state-v1` is absent and `deutsch-b11-ar-2026-1` is present:

1. `completed[id] = today` for every legacy `completed[id] === true`.
2. `results`: copy `correct, streak, tries, needsReview`; set `xpDone = correct`, `last = today`, `due = today`, `box = correct ? clamp(streak, 1, 2) : 1`. Drop the `topic` field.
3. `stars`: ★ for completed lessons; if every question of a lesson has a result, apply the §7.1 thresholds to the share of `correct` ones.
4. XP: 20 per completed lesson plus first-time question XP for every correct result. This XP does not enter `byDay` (no instant streak).
5. `runs` are dropped (`unit-N` keys no longer exist). `lastLesson` is kept.
6. Copy `deutsch-b11-lang` → `gi-lang`, `deutsch-b11-theme` → `gi-theme`.
7. Badges are evaluated once, silently (no toasts).
8. Legacy keys are left untouched.

Because `localStorage` is bound to the origin, this automatic path only works when the new single file is opened the same way as the old one (same `file://` origin in Chromium browsers). For every other case Settings → Restore accepts the legacy export (`{als:"1", kind:"results", items:[…]}`) and applies steps 2–4 to it; completed lessons cannot be recovered from that file and are inferred as "all questions attempted".

---

## 11. Visual design

Keep the existing design language: tokens, radius 18 px, Noto Sans Arabic, panel/card/button classes, sentence-frame colours, light and dark sets. Split the legacy stylesheet into the files listed in §2 without renaming classes. Add:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--sea` | `#dff1fb` | `#14202b` | map background |
| `--sea-deep` | `#c9e6f7` | `#101a24` | wave marks |
| `--sea-shallow` | `#eef9ff` | `#1b2c3a` | water around islands |
| `--sand` | `#f7e7c2` | `#4a4130` | beaches |
| `--gold` | `#b97f00` | `#f2c94c` | stars, conquered ring |
| `--gold-bg` | `#fff4d1` | `#3a3115` | star chips, badge tiles |
| `--t-sky` | `#e0f3fd` | `#1b3140` | palette `sky` |
| `--t-sand` | `#fbefd5` | `#3a3220` | palette `sand` |
| `--t-coral` | `#ffe4dc` | `#40251f` | palette `coral` |
| `--t-teal` | `#dff5f2` | `#17332f` | palette `teal` |

Existing palettes `lilac, peach, mint, blue, pink, yellow` keep their values. Each palette gets a utility class (`.sky { background: var(--t-sky) }` …) like the existing six.

Stars are drawn as inline SVG (filled `var(--gold)`, empty `var(--line-strong)`), never as emoji, so they stay legible in both themes. Text on tinted tiles uses `var(--ink)`; check 4.5:1 contrast for `--gold` on `--surface` in both themes (the light value above is chosen for that).

Motion: toasts slide in 200 ms; star gain scales 1 → 1.25 → 1 in 300 ms; all disabled under `prefers-reduced-motion` or the Settings switch.

---

## 12. Interface strings

`i18n/ar.js` and `i18n/de.js` start from the two `UI` objects of the legacy file (all keys stay). Remove or reword the chapter-based keys and add the new ones:

| Key | Arabic | German |
|---|---|---|
| `brand` | جُزُر القواعد | Grammatikinseln |
| `docTitle` | جُزُر القواعد · قواعد الألمانية B1 | Grammatikinseln · Deutsche Grammatik B1 |
| `tabHome` | الرئيسية | Start |
| `mapTitle` | خريطة الجزر | Inselkarte |
| `allTopics` | كل الموضوعات | Alle Themen |
| `topicsCount` (l, q, i) | ‎{l} درسًا · {q} تمرينًا · {i} جزر | {l} Lektionen · {q} Übungen · {i} Inseln |
| `filterAll` | الكل | Alle |
| `continueTitle` | تابع رحلتك | Setz deine Reise fort |
| `continueBtn` | تابع ← | Weiter → |
| `todayTitle` | اليوم | Heute |
| `dailyGoal` (a, b) | ‎{a} من {b} نقطة | {a} von {b} XP |
| `streakDays` (n) | ‎{n} يومًا متتاليًا | {n} Tage in Folge |
| `dueReviews` (n) | أسئلة حان وقت مراجعتها: {n} | Fällige Wiederholungen: {n} |
| `startReview` | راجِع الآن | Jetzt wiederholen |
| `openIsland` | افتح الجزيرة | Insel öffnen |
| `backToMap` | → العودة إلى الخريطة | ← Zur Karte |
| `learnedOf` (a, b) | تعلّمتَ {a} من {b} | {a} von {b} gelernt |
| `conquered` | جزيرة مفتوحة 🚩 | Insel erobert 🚩 |
| `islandExam` | اختبار الجزيرة | Inselprüfung |
| `examLocked` (a, b) | تعلّم كل دروس الجزيرة أولًا ({a} من {b}) | Lerne zuerst alle Lektionen der Insel ({a} von {b}) |
| `examIntro` (n, p) | ‎{n} سؤالًا من دروس الجزيرة. تنجح بـ {p} إجابات صحيحة | {n} Fragen aus allen Lektionen der Insel. Bestanden ab {p} richtigen Antworten |
| `examPassed` | نجحتَ! الجزيرة صارت لك | Bestanden! Die Insel gehört dir |
| `examFailed` (a, p) | ‎{a} إجابات صحيحة، وتحتاج إلى {p}. راجع الدروس وحاول مجددًا | {a} richtig, nötig sind {p}. Wiederhole die Lektionen und versuch es noch einmal |
| `practiceIsland` | تدرّب على الجزيرة كلها | Ganze Insel üben |
| `finishLesson` | أنهيتُ الدرس | Lektion abschließen |
| `finishHint` | اعرض كل الخطوات أولًا | Zeig zuerst alle Schritte |
| `bestFirst` | يُفضَّل أولًا: | Am besten zuerst: |
| `lessonOnIsland` (a, b) | الدرس {a} من {b} في هذه الجزيرة | Lektion {a} von {b} auf dieser Insel |
| `sourceLine` (book, n) | ‎{book} · الدرس {n} | {book} · Lektion {n} |
| `stars` (n) | ‎{n} من 3 نجوم | {n} von 3 Sternen |
| `xpGain` (n) | ‎+{n} نقطة | +{n} XP |
| `levelUp` (name) | مرتبة جديدة: {name} | Neuer Rang: {name} |
| `badgeNew` (name) | وسام جديد: {name} | Neues Abzeichen: {name} |
| `rank` | المرتبة | Rang |
| `toNextRank` (n) | ‎{n} نقطة حتى المرتبة التالية | Noch {n} XP bis zum nächsten Rang |
| `badges` | الأوسمة | Abzeichen |
| `calendar` | نشاط آخر 12 أسبوعًا | Aktivität der letzten 12 Wochen |
| `settings` | الإعدادات | Einstellungen |
| `setGoal` | الهدف اليومي | Tagesziel |
| `setLevel` | المستوى المعروض | Angezeigte Stufe |
| `setMotion` | تقليل الحركة | Bewegung reduzieren |
| `backup` | نزّل نسخة احتياطية | Sicherung herunterladen |
| `restore` | استعِد من ملف | Aus Datei wiederherstellen |
| `restoreDone` (n) | استُعيدت نتائج {n} سؤالًا | Ergebnisse für {n} Fragen wiederhergestellt |
| `resetAll` | امسح كل التقدّم | Gesamten Fortschritt löschen |
| `resetConfirm` (w) | اكتب «{w}» للتأكيد | Tippe „{w}“ zur Bestätigung |
| `reviewName` | مراجعة اليوم | Heutige Wiederholung |
| `treasure` | أتممتَ كل الجزر! | Alle Inseln geschafft! |
| `footNote` | مبنيّ على تسلسل القواعد في «Auf jeden Fall! Deutsch B1.1 / B1.2» من telc. كل الشروح والتمارين أصلية | Folgt der Grammatikprogression von „Auf jeden Fall! Deutsch B1.1 / B1.2“ (telc). Alle Erklärungen und Übungen sind eigene Inhalte |

Keys to delete: `unitsTitle, unitsCount, unitN, statUnits, indexLabel` (replace with island wording), and reword `heroText, byTopicText, testText, sourceLink` so that "six units" no longer appears. A test asserts that both language files have exactly the same key set and that function-valued keys have the same arity.

---

## 13. Accessibility and RTL

- Keep: skip link, focus management on route change, `aria-current` on tabs, `aria-live` regions in the quiz, `<bdi lang="de" dir="ltr">` around German fragments (`prose()`), keyboard step reveal.
- Arrow glyphs in button labels follow the language as today (`←` forward in Arabic, `→` in German).
- Map and trail: §8 rules. No information by colour alone: every state also has an icon or text (check mark, flag, star count).
- Toasts: one polite live region, maximum three queued, each visible 4 s, dismissible, never stealing focus.
- Hit targets ≥ 44 px. Page never scrolls horizontally at 360 px width.
- Targets: WCAG 2.1 AA contrast in both themes; full keyboard operation of every flow (lesson, quiz with order pieces, exam submission, settings).

---

## 14. Build, tests, tooling

### 14.1 `grammar/package.json`

```json
{
  "name": "grammatikinseln",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node server.js",
    "validate": "node scripts/validate-content.js",
    "test": "node --test",
    "build": "node scripts/validate-content.js && node scripts/build.js",
    "extract:legacy": "node scripts/extract-legacy.js",
    "new:lesson": "node scripts/new-lesson.js",
    "check:links": "node scripts/check-links.js"
  },
  "devDependencies": { "esbuild": "<pin the current stable version when installing>" }
}
```

### 14.2 Dev server (`server.js`)

Static server on `127.0.0.1:${PORT || 4180}`: `/` → `src/index.html`; `/content.json` → output of `assemble-content.js` (rebuilt on every request); everything else from `src/` with path-traversal protection (same approach as `safeFile` in the media project, reimplemented locally, no cross-project imports). No dependencies. `Start-Grammatik.cmd` mirrors `Start-Sprechzimmer.cmd`.

### 14.3 `scripts/extract-legacy.js` (run once, keep in the repo)

1. Read `content/sources/legacy/Deutsch-B1.1-Arabic.html`; parse the `<script id="course">` JSON.
2. For each topic write `content/lessons/<id>.json` in the §5.3 shape: `level: "B1.1"`, `island`/`order`/`prereqs` from a mapping table inside the script that equals §3.2, `source: {lektion: chapter, kind: chapter === 3 ? "sample" : "toc"}`, `stepExamples` from `steps[].example`, `pitfallPair = pitfall[0]`, `i18n.ar.pitfall = pitfall[1]`, `links` = URLs, `linkTitles` per language, questions converted to §5.4 (drop `topic`, `src`, `grounded`; move `de.options/answer/text` into `i18n.de`, and when `de.options` exists also move the base `options/answer` into `i18n.ar`).
3. Decode the base64 font on line 111 to `src/fonts/NotoSansArabic-Variable.woff2` and write the licence comment to `src/fonts/OFL.txt`.
4. Print a summary: 28 lessons, 253 questions, counts per type. A test re-runs the extraction in memory and compares totals (28 / 253 / 89 / 58 / 22 / 84).

### 14.4 `scripts/build.js`

1. Assemble and validate content.
2. Bundle `src/js/main.js` with esbuild: `bundle, format: iife, target: es2022, minify`.
3. Concatenate the CSS files in the order listed in §2.
4. `dist/site/`: `index.html` (links `app.css`, `app.js`), `content.json`, `fonts/`.
5. `dist/Deutsch-Grammatik-B1.html`: one file with inline CSS (font as base64 `data:` URL, licence text kept as a CSS comment), inline content JSON, inline script. JSON is embedded with `<` escaped as `<`.
6. Print sizes. Budget: single file ≤ 1.5 MB, script ≤ 160 KB minified.

### 14.5 Tests (`node --test`)

| File | Covers |
|---|---|
| `content.test.js` | validator passes on real content; 51 lessons once B1.2 is complete (until then: every listed id either exists or is on an explicit `pending` list in the test); every island has ≥ 1 lesson; no prerequisite cycles; question ids unique; each lesson has 9–10 questions with at least one of each difficulty |
| `grading.test.js` | `normalize` (case, spaces, trailing punctuation, NFC, ß/umlauts), cloze variants, order, mcq, `answered` |
| `runs.test.js` | sizes and composition of `mixed`, `test` (no text), `exam` (n, round-robin, no text), `review` (due only, max 20), level filter; deterministic with a seeded rng |
| `progress.test.js` | star thresholds for 9 and 10 questions, stars never decrease, island progress, `nextLesson` in all three phases and with filter |
| `gamification.test.js` | every row of §7.2 including limits, level boundaries, streak across days and gaps, each badge condition |
| `srs.test.js` | box transitions and due dates |
| `migrate.test.js` | fixture legacy state → expected new state; legacy export import; idempotence |
| `router.test.js` | valid and invalid hashes, legacy hashes |
| `views.test.js` | each `render()` returns markup for both languages without `undefined` / `[object Object]`, and contains the expected landmarks |

### 14.6 CI

No new workflow in v1. `media-pages.yml` stays manual (`workflow_dispatch`). Optional later: a `grammar-ci.yml` running `npm --prefix grammar ci && npm --prefix grammar test && npm --prefix grammar run build` on pull requests that touch `grammar/**`.

---

## 15. Phases

Each phase ends with a commit (or pull request) and its acceptance check. Phases 6 and 8 can run in parallel with 3–5 and 7 once Phase 2 has frozen the content schema.

| Phase | Work | Acceptance |
|---|---|---|
| 0 Preflight | Commit the current working tree on `github-pages-sftp`, tag `pre-split`, create branch `grammar-platform` | clean tree |
| 1 Split | §2.2 | Sprechzimmer tests and manual start pass from `media-series/`; pure rename history |
| 2 Scaffold and content | `grammar/` skeleton, `extract-legacy.js`, `levels.json`, `islands.json`, `badges.json`, validator, `assemble-content.js`, dev server | `npm run validate` passes; 28 lesson files; counts match §1.1; font extracted |
| 3 Engine and state | `grading`, `runs`, `progress`, `srs`, `gamification`, `migrate`, `state`, `dates`, `router`, i18n files, all engine tests | `npm test` green; no DOM code in `engine/` |
| 4 Parity views | Shell, sidebar by island, lesson, practice launcher, quiz, results, progress (basic), CSS split | Every legacy flow works on the 28 lessons in both languages and themes; side-by-side check of three lessons against the legacy file shows identical lesson content |
| 5 Dashboard | Continue card, Today card, all-topics grid, level filter, settings page with backup/restore/reset | Dashboard shows all islands and lessons with correct numbers; filter behaves as §9.2; backup round-trips |
| 6 Gamification | Stars, XP, ranks, streak, badges, toasts, HUD, completion button, progress page extras | Manual script: learn a lesson → +20 XP toast, ★; finish its run with 8/9 → ★★★, run bonuses; values match §7 |
| 7 Map and islands | Archipelago, island trail, exam runs, conquest, token movement, tall layout | Token sails after a first ★ that changes island; exam gate and pass mark behave as §7.5; map usable by keyboard and at 360 px; reduced motion respected |
| 8 B1.2 content | 23 lessons per §4, in six batches by Lektion (7 → 12), each batch validated and reviewed by a German speaker for correctness and by an Arabic speaker for wording | 51 lessons, about 460 questions; `content.test.js` has no pending ids; every link opened once |
| 9 Build and release | `build.js`, single-file output, size budget, READMEs, `Start-Grammatik.cmd`, final migration test against a real legacy browser profile | Double-clicking `dist/Deutsch-Grammatik-B1.html` works offline in Chrome, Edge and Firefox; legacy progress appears after migration or import |
| 10 QA and cleanup | Accessibility pass (keyboard, screen reader spot check, contrast), RTL/LTR pass, print styles for lessons, remove dead CSS, decide on the legacy HTML (keep under `content/sources/legacy/`) | Checklist in the pull request ticked; no console errors |

Suggested order for one implementer: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10, with Phase 8 batches interleaved after Phase 4 so new lessons can be read in the real UI while they are written.

---

## 16. Risks and open points

| # | Topic | Default taken in this plan | Who decides |
|---|---|---|---|
| R1 | Uncommitted work on `github-pages-sftp` | Commit before the split; the split is not started on a dirty tree | owner |
| R2 | Hosting the grammar platform online | Not in v1. The current Pages site is a deliberately neutral, encrypted shell for the media app; mixing a public grammar site into the same deployment would change that. If online access is wanted, publish `grammar/dist/site` from a separate repository | owner |
| R3 | B1.2 content for Lektionen 7–11 | Written from the topic titles only, because the sample contains no grammar pages for them. If the full book is available, its grammar overview pages should be read before authoring to align scope and terminology | owner / author |
| R4 | The B1.2 PDF | Kept local and git-ignored (publisher material). Only the topic list is stored in the repository | — |
| R5 | Progress migration across origins | Automatic only for the same origin; otherwise import of the legacy export. Announce this in the release notes | — |
| R6 | Content quality | Two-person review per batch (German correctness, Arabic wording). The validator catches structure, not grammar mistakes | author |
| R7 | Scope creep in gamification | No sound, no accounts, no leaderboards, no streak freezes, no new question types in v1 | — |
| R8 | `.venv-transcribe` after the move | Moved (2.3 GB of CUDA libraries); the absolute paths in `pyvenv.cfg` and the activate scripts were rewritten. `Scripts\python.exe` works; console entry points such as `pip.exe` still point to the old path, so use `python -m pip` | — |

---

## 17. Definition of done

- The repository root contains only `grammar/`, `media-series/`, `docs/`, `.github/` and the root config files.
- `npm run media` starts Sprechzimmer exactly as before; all its tests pass from the new location.
- `npm run grammar` serves the platform; `npm run grammar:build` produces the site folder and the single file.
- The platform shows 10 islands and 51 grammar lessons (28 B1.1, 23 B1.2) in Arabic and German, with no chapter-theme grouping anywhere in the UI.
- The dashboard lists every topic with its progress, the map shows the player token moving along the route, and stars, XP, ranks, streak, badges, island exams and spaced review work as specified in §7.
- Legacy progress can be brought over.
- `npm test` is green in both projects.

---

## 18. Implementation notes

What was built differs from the sections above in these points:

| Area | Implemented |
| --- | --- |
| Map geometry (§8.1) | Wide viewBox is `0 0 1200 800`; name plates sit at (0, 118) below the dock so the boat never covers them; island 10 moved to (620, 640) and the treasure to (940, 650) to avoid overlaps. Land colour is a mix of the island palette and a green base (`--isle-green`), the fog is lighter |
| Map accessibility | No hidden duplicate list: the SVG is a labelled group and each island is a real link with an `aria-label`, reachable with Tab |
| Token movement | The archipelago consumes `player.animate` when the trip changes island; the island trail consumes it when both lessons are on that island. Re-rendering a lesson in place never counts as a visit |
| Starting runs | All "start" buttons (lesson exercises, exams, review, mistakes) use one `run` action that restarts a finished run instead of reopening its results |
| Stats in state | `stats` also counts `flawlessExams` and `timedAce` for the badges |
| Arabic search | Search ignores short vowels, letter variants (ة/ه, ى/ي, أ/ا) and the article in all its prefixed forms, so «المجهول» finds «للمجهول» |
| Counted nouns | `streakDays`, `hudStreak` and `lessonsN` get raw numbers and apply Arabic number agreement (1 / 2 / 3–10 / 11+) and German singular |
| B1.2 references | 2 per lesson from grammis (IDS Mannheim) and the DWDS dictionary; all 59 links of the platform are checked by `npm run check:links` |
| Lesson sources | `irgend-pronomen`, `konjunktiv2-vergangenheit-modal` and `futur1` have `source.kind: "sample"` (book page 71); the other B1.2 lessons are `toc` |
| Tooling | Added `npm run preview` (serves `dist/` on port 4181) and `.claude/launch.json` entries; the validator also rejects `TODO` placeholders left by `new:lesson` |
| Tests | 50 tests: engine, migration, router, content coverage, string parity, every page rendered in both languages, server path safety |
