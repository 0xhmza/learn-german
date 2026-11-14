# learn-german

Two independent German learning projects share this repository. Each folder has its own `package.json`, README and tests. Run commands inside the folder, or use the shortcuts below from the repository root.

| Folder | Project | Start |
| --- | --- | --- |
| [`grammar/`](grammar/README.md) | **Grammatikinseln**: B1.1 and B1.2 grammar in Arabic and German, with a gamified island map, practice, exams and spaced review | `npm run grammar`, then open http://127.0.0.1:4180 |
| [`media-series/`](media-series/README.md) | **Sprechzimmer**: German series with dual subtitles, sentence replay and an encrypted remote library | `npm run media`, then open http://127.0.0.1:4173 |

Both need Node.js 22 or later.

```powershell
npm run grammar          # grammar platform, development server
npm run grammar:build    # grammar/dist/: hostable site and a single offline HTML file
npm run media            # Sprechzimmer player
npm test                 # tests of both projects
```

Planning notes for the grammar platform are in [docs/grammar-platform-plan.md](docs/grammar-platform-plan.md). The GitHub Pages workflow (`.github/workflows/media-pages.yml`) publishes only the media project.
