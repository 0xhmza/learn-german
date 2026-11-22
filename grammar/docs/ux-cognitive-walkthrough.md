# Cognitive walkthrough: daily tasks

November 2026. Covers the redesigned platform (Deutschpfad). The walkthrough looks at the tasks a learner does on most days, on a phone (375 × 812) and on a desktop (1366 × 900), in German and Arabic.

## Method

For each task, every step is checked against the four walkthrough questions:

1. **Goal:** Will the learner try to reach the right result?
2. **Visible:** Will the learner see the control for this step?
3. **Match:** Will the learner connect the control with the goal?
4. **Feedback:** After the action, will the learner see that it worked?

Each target on the home page was also measured in the browser: its position and how far the learner must scroll to reach it. The scroll distance counts the part of the page the bottom tab bar covers. The figures below are from a learner with some progress and a review due.

The persona is an adult learner on B1 who studies for 10–15 minutes a day, mostly on a phone. They know apps like Sololearn and expect one clear next step, a streak and short lessons.

## Daily tasks

| # | Task | Phone before | Phone after | Desktop |
| --- | --- | --- | --- | --- |
| 1 | Continue the current lesson | 1 tap, no scrolling | 1 tap, no scrolling | 1 click |
| 2 | Do today's review | 1 tap only when the continue card offers it; otherwise scroll **2435 px** | 1 tap, no scrolling | 1 click |
| 3 | Check streak and daily goal | Streak in top bar; goal after **2136 px** | Both visible on the first screen | Side cards |
| 4 | Open the exam trainer | Scroll **2562 px**, or Üben → tile (2 taps) | 1 tap, no scrolling | Rail, 1 click |
| 5 | Practise mistakes | Üben → button (2 taps) | Same | Same |
| 6 | Find a grammar topic | Icon-only button (36 px) | Icon button (40 px); labelled "Regel suchen" on tablet and desktop | Labelled button |
| 7 | Reach the first exercise in a lesson | **10** "Weiter" taps | **2** taps | Same |
| 8 | Go to the next lesson after finishing | "Erklärung gelesen", then the "Nächste Lektion" link | One button on the completion screen | Same |
| 9 | Switch the language | 1 tap in the top bar | 1 tap, also inside lessons | Same |
| 10 | Leave a lesson and come back later | ✕ in the player; the continue card offers "Lektion fortsetzen" | Same; Escape also closes | Same |

## Walkthrough: "Do today's lesson" (phone, after the redesign)

| Step | Goal | Visible | Match | Feedback |
| --- | --- | --- | --- | --- |
| Open the app | ✔ Lands on Lernen | ✔ Continue card at the top | ✔ "Weiterlernen" names the lesson | ✔ |
| Tap "Lektion öffnen" | ✔ | ✔ Large primary button | ✔ | ✔ Player opens, segmented progress at the top |
| Read the overview and the rule | ✔ | ✔ One "Weiter" button at the bottom | ✔ | ✔ The next segment turns green |
| Answer the first check | ✔ "Kurz prüfen" label | ✔ "Antwort prüfen" stays disabled until there is an answer | ✔ | ✔ Green or red answer sheet with the solution |
| Continue through steps and questions | ✔ | ✔ | ✔ Always the same button in the same place | ✔ Progress track |
| Finish | ✔ | ✔ Completion screen | ✔ Shows XP, score and streak | ✔ Stars and "Nächste Lektion" |

No step fails. The remaining frictions are listed under open points.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| High | On phones the streak week, daily goal, review and exam trainer sat below the whole course path (2.1–2.6 k px of scrolling). | A "Heute" strip under the continue card on phones and tablets: streak, daily goal ring, review count and the exam trainer. |
| High | Lessons were not Sololearn-like: phase tabs, an outline, a separate exercise block with its own buttons, two button bars, a skip button, and the first exercise after 10 slides. | The lesson is one linear sequence of screens: explanation slides with a short check after the rule, after the examples and after the typical mistake, then the remaining questions. One bottom bar with one main button. After "Antwort prüfen", a green or red answer sheet with the solution, the explanation and "Weiter". A completion screen at the end. Practice runs use the same player. |
| Medium | Finishing a lesson needed a "mark as read" button and gave no summary. | Reaching the end completes the lesson. The completion screen shows XP, correct answers, streak and stars, with "Nächste Lektion", "Zum Kurs", flashcards, "Fehler üben" and "Lektion wiederholen". |
| Medium | XP toasts after every answer covered the lesson. | XP toasts are hidden in the player; the total appears on the completion screen. Other notices appear at the top. |
| Medium | Topic search was an unlabelled icon in the middle of the page. | Labelled button "Regel suchen" on tablet and desktop. |
| Low | Empty levels (A1, A2, B2, C1) showed a lock, which suggests they must be unlocked. | Lock removed; the cards say "Bald verfügbar". |
| Low | The exam trainer had three names (Prüfung, Modelltests, Prüfungstraining). | "Prüfung" in the navigation, "telc-Prüfungstraining" on cards and tiles. |
| Low | The current lesson's "Start/Weiter" tip was hidden on phones. | Shown in a smaller size. |
| Low | Muted text on grey backgrounds had a contrast of 4.2–4.35:1 (found by the visual tests). | Muted colour darkened; all checked text meets WCAG AA. |
| Low | Breadcrumbs, profile lesson links and "Erklärung"/"Quellen" toggles were under 24 px tall. | All are at least 24 px. |
| Low | In Arabic, "+70 XP" was shown as "70+". | The number is isolated as left-to-right. |
| Bug | The new completion screen's class also matched finished modules on the path and squeezed their header (found when reviewing the Arabic tablet screenshot). | Class renamed. The screenshot baseline now guards against this. |

## Open points

- The continue card prefers an unfinished practice run over the next lesson. That is the existing study rule; consider offering both when a lesson is waiting.
- Sololearn has no way back inside a lesson, and neither does the player now. A learner who wants to reread the rule during the questions has to finish or restart the lesson. A "show rule" link on question screens would help without breaking the flow.
- There are no hearts or lives. They were left out on purpose because they would punish mistakes in self-study.
- On phones the topic search stays an icon button for lack of space in the course header.

## How this is tested

- `npm test` includes `test/lesson-flow.test.js`. It checks the screen order of every lesson, walks a lesson to its end, checks that questions cannot be skipped and that a finished lesson restarts, renders every screen of all 51 lessons in German and Arabic, and checks that German text is marked as left-to-right in Arabic pages.
- `npm run test:visual` opens 18 screens in a headless browser: on phone, tablet and desktop, in German and Arabic, with light mode and a dark mode subset (128 captures). It checks text direction, sideways scrolling, elements outside the viewport, cut-off text, covered controls, touch targets under 24 px, WCAG AA text contrast, and that the navigation rail, tab bar and lesson close button follow the reading direction. It also compares every screenshot with a local baseline (`--update` accepts the current state). The report is `visual-report/index.html`.
