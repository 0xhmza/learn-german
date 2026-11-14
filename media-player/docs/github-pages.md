# GitHub Pages and encrypted remote storage

GitHub Pages serves a neutral access screen over HTTPS. A single access code unlocks the encrypted app and supplies its connection settings. For a Hetzner Storage Box, the browser extension connects directly over WebDAV. The HTTPS bridge mode supports other SFTP servers. Both modes decrypt the catalog, video ranges, subtitles and progress in your browser with the 256-bit key included in the code.

## Pack and upload the library

The new SFTP upload bundle is in `deploy/sftp-upload-short/`. It contains two directories:

- `library/` contains encrypted videos and subtitles (`.szc`) and one encrypted catalog (`.szi`). Each name is a random 32-character ID plus its extension. The mapping to the original media names lives in the encrypted catalog. Keep the generated names when uploading.
- `progress/` is an empty directory for encrypted watch progress. Create it on the server if your SFTP client skips empty directories.

Upload the `.szc` files first and the single `.szi` catalog last. Keep `library/` and `progress/` together under the folder you enter as the WebDAV URL. For the bridge, set `SFTP_LIBRARY_DIR` and `SFTP_PROGRESS_DIR` to their remote paths.

Keep `private/media-decryption.key` separately from the SFTP upload and the Pages files. The existing long filenames are still readable. To switch, upload the new library into a fresh remote folder with its own `library/` and `progress/`. To carry over synced progress, copy the encrypted progress files into the new `progress/` and keep the same host, username, and key.

With Node.js 22 or newer, run `npm run pack:media` to rebuild the library from `media/`. The command uses the existing media key and generates one only if its file is missing. `--source`, `--output` and `--key-file` override the defaults. To pack specific collections, use `npm run pack:media -- --collections simpsons-s07,spongebob-s04`. This keeps catalog entries for other collections.

When updating an existing bundle, the packer reuses its catalog filename. Upload the new assets first, then replace the existing `.szi` file. Keep old assets available until browsers using the previous catalog have refreshed. If you start a fresh bundle with a new catalog filename, upload it into a fresh remote library directory. Reusing the same media key keeps existing progress readable.

## Connect a Hetzner Storage Box

1. In Hetzner Console, enable **WebDAV** and **External Reachability** for the Storage Box. Enable WebDAV for your subaccount if applicable. Use a subaccount that can read `library/` and write to `progress/`. [Hetzner WebDAV guide](https://docs.hetzner.com/storage/storage-box/access/access-webdav/)
2. Publish the updated Pages build, then run `npm run build:storage-box -- https://your-account.github.io/learn-german/media-player/` with the exact player URL you open in your browser. This builds the extension in `deploy/storage-box-extension/` and authorizes only the specified site page. A loopback URL such as `http://127.0.0.1:4173/media-player/` also works for a local Pages preview.
3. Open the extensions page in Chrome or Edge, enable **Developer mode**, choose **Load unpacked**, and select `deploy/storage-box-extension/`. Use version 140 or newer. Reload the extension after changing its authorized site, then reload the site tab. [Chrome extension installation guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)
4. Run `npm run create:access-code` from the private source checkout. Enter the HTTPS WebDAV URL, exact `.szi` filename, username and password. Press Enter at the filename prompt to use the latest short-name pack's catalog. If you uploaded both directories under `sprechzimmer/`, use `https://u123456-sub1.your-storagebox.de/sprechzimmer/`. Copy the single line from `private/access-code.txt` into **Access code** on the site.

Install the extension once per browser profile. It sends WebDAV requests directly to the Storage Box and has network permission only for Storage Box hosts. The media key stays in the Pages app. The browser requests encrypted byte ranges for playback and uses conditional WebDAV writes to sync encrypted progress. [Chrome extension network permissions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

If folder listing returns HTTP 405, paste the exact `.szi` filename from `library/` into **Encrypted catalog filename**. The app can then request that file directly. Hetzner restricts WebDAV to GET for read-only accounts, so progress stays on the device when the account refuses writes. Enable write access to the progress directory for sync. [Hetzner WebDAV troubleshooting](https://docs.hetzner.com/storage/storage-box/access/access-webdav/#known-issues)

## Run an HTTPS bridge for SFTP

Install the branch on a trusted host that can reach your SFTP server. Give the SFTP account permission to list and read the encrypted library and to write to its own progress directory. Create that progress directory before connecting. For multiple accounts, use private home directories or chroots so each account has its own `progress` directory. The SFTP server must support the OpenSSH POSIX rename extension for atomic progress updates.

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

## Publish the combined site

From the source repository root, run these commands with Node.js 22 or later.

```sh
npm --prefix grammar ci
node media-player/scripts/build-site.mjs
```

The build uses `media-player/private/media-decryption.key` or the `PAGES_UNLOCK_KEY` environment variable. It writes the landing page, the grammar site at `grammar/`, and the encrypted player at `media-player/` inside `grammar/dist/pages/`. The player build encrypts the app HTML, JavaScript, styles, icons and sample clip into `data.bin` using the same key as the media.

Keep this source repository private. Copy the **contents** of `grammar/dist/pages/`, including `.nojekyll`, into the root of the publishing branch in a separate Pages repository. In **Settings → Pages**, choose **Deploy from a branch**, select that branch and choose **/(root)**. [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

For a local preview, serve the combined output with `python -m http.server 4173 --bind 127.0.0.1 --directory grammar/dist/pages` from the source repository root. To build just the encrypted player, run `npm run build:pages` from `media-player/`. Its standalone output is `deploy/pages/`.

For SFTP with a bridge, run `npm run create:access-code -- --bridge` and enter the SFTP address, bridge URL and SFTP credentials. Treat `private/access-code.txt` like a password. It contains the key as well as the encrypted connection details, so anyone with the whole code can unlock both. The app remembers a successful login in IndexedDB, wrapped by a browser-held key. Use **Forget and disconnect** in the app to clear it and return to the access screen.

Watch positions sync as encrypted files in the user's progress directory. Newer positions win per episode. If the connection drops, a local pending copy can sync after reconnecting. To migrate existing progress, export a backup from the local app and restore it after unlocking the Pages library. Stars, caption styling and other preferences stay in the browser. The static version plays existing translations and supports browser imports. On-demand Ollama translation is available in the local app.

For loopback testing, run `node scripts/build-pages.js --local-preview` to allow an HTTP bridge on localhost. Use the normal `npm run build:pages` for the HTTPS deployment.
