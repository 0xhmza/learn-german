# GitHub Pages and encrypted SFTP

GitHub Pages serves the static app over HTTPS. The browser contacts your HTTPS bridge, which authenticates with a configured SFTP server over SSH. The browser decrypts the catalog, video ranges, subtitles and progress with a 256-bit media key. The bridge sees the SFTP login and encrypted files.

## Pack and upload the library

With Node.js 22 or newer, run `npm run pack:media` in the project directory. It reads the recognized episodes in `media/` and encrypts each video and subtitle using AES-GCM. The output goes to `encrypted-library/`. The first run generates `.keys/media.key`, which contains the 64-character media key. Keep it in a private place and back it up separately. Repacking with the same key keeps existing progress readable.

Upload the `.szc` assets in `encrypted-library/` using your SFTP client, with `library.szc` uploaded last. The browser can discover episodes once that index is present. Upload to the library directory configured in the bridge. Store the key separately and share it only with the intended learners.

`--source`, `--output` and `--key-file` override the defaults. For later updates, pack into a fresh output directory with the same key file and upload the new assets before replacing the index. Keep the old assets available until browsers using the old index have refreshed. Using a different media key requires migrating the old encrypted progress or starting with a fresh progress directory.

## Run the HTTPS bridge

Install the branch on a trusted host that can reach your SFTP server. Use an SFTP account limited to read access for the encrypted library and write access for its own progress directory. Create that progress directory before connecting. For multiple accounts, use private home directories or chroots so each account has its own `progress` directory. The SFTP server must support the OpenSSH POSIX rename extension for atomic progress updates.

Run `npm ci` on the bridge host, then create an ignored `.env` with settings like these:

```dotenv
SFTP_ADDRESS=sftp://media.example.com:22
SFTP_HOST_KEY_SHA256=SHA256:replace-with-the-trusted-host-fingerprint
SFTP_HOST_KEY_ALGORITHM=ssh-ed25519
SFTP_LIBRARY_DIR=/library
SFTP_PROGRESS_DIR=progress
FRONTEND_ORIGINS=https://your-account.github.io
GATEWAY_BIND=127.0.0.1
GATEWAY_PORT=4174
```

Obtain the host fingerprint from the SFTP administrator or directly on the SFTP host, for example with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. The bridge pins that fingerprint and accepts only the configured SFTP address. `FRONTEND_ORIGINS` is a comma-separated list of exact origins, including any nondefault port and excluding any repository path.

Start it with `node --env-file=.env gateway.js`. Serve it behind your HTTPS reverse proxy at a URL such as `https://bridge.example.com/`. Forward the `/v1/` routes and preserve the request headers. Alternatively, set `GATEWAY_TLS_KEY` and `GATEWAY_TLS_CERT` to the PEM key and full certificate chain to let the bridge terminate TLS itself. The bridge permits cleartext HTTP only on loopback. Use one bridge instance for the progress directory so conditional updates are serialized.

## Publish the static site

`npm run build:pages` prepares `dist/`. The build copies only the frontend assets, with paths relative to the Pages project URL. The Pages artifact excludes the bridge, library, progress, and credentials.

To use the included manual workflow, push the reviewed source to your GitHub repository and make the workflow available on the repository's default branch. Select **GitHub Actions** in **Settings → Pages → Source**, then run **Publish Sprechzimmer** in the Actions tab. The workflow deploys `dist/` when triggered manually. You can also publish just the generated `dist/` files to a dedicated Pages publishing branch. [GitHub Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Open your Pages URL and enter the SFTP address, HTTPS bridge URL, SFTP username and password, and media key. **Remember on this browser** saves these in IndexedDB, wrapped by a browser-held key, so opening the site reconnects automatically. Use this on a browser profile and site origin you trust. Scripts running on that origin can use its saved credentials. **Forget and disconnect** removes the saved sign-in and key from that browser.

Watch positions sync as encrypted files in the user's SFTP progress directory. Newer positions win per episode. If the bridge drops, a local pending copy can sync after reconnecting. To migrate existing progress, export a backup from the local app and restore it after unlocking the Pages library. Stars, caption styling and other preferences stay in the browser. The static version plays existing translations and supports browser imports. On-demand Ollama translation is available in the local app.

For loopback testing, run `node scripts/build-pages.js --local-preview` to allow an HTTP bridge on localhost. Use the normal `npm run build:pages` for the HTTPS deployment.
