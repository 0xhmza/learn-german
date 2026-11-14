# learn-german

Two independent German learning projects share this repository. Each folder has its own `package.json`, README and tests.

| Folder | Project | Start |
| --- | --- | --- |
| [`grammar/`](../README.md) | **Grammatikinseln**: B1.1 and B1.2 grammar in Arabic and German, with a gamified island map, practice, exams and spaced review | `npm --prefix grammar start`, then open http://127.0.0.1:4180 |
| [`media-player/`](../../media-player/README.md) | **Sprechzimmer**: German series with dual subtitles, sentence replay and an encrypted remote library | `npm --prefix media-player start`, then open http://127.0.0.1:4173 |

Both need Node.js 22 or later.

```powershell
npm --prefix grammar test
npm --prefix media-player test
```

Planning notes are in the [grammar platform plan](grammar-platform-plan.md). See [the GitHub Pages setup](../../media-player/docs/github-pages.md#publish-the-combined-site) for building and publishing both projects with the two-button landing page.
