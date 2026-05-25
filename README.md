# Stardew Wrapped

A fan-made, browser-only Stardew Valley save recap. It turns a Stardew Valley 1.6 save file into a Wrapped-style carousel and shareable poster without uploading the save anywhere.

## Current Status

The app is a static site and can be hosted on GitHub Pages, Cloudflare Pages, Netlify, Vercel static hosting, or any plain file server.

For the intended Stardew-style deployment, use the generated `dist-full/` bundle. It includes the local Stardew-style image, audio, UI, character, farmer, and portrait assets so the deployed site keeps the original visual feel. A `dist-public/` bundle still exists as an optional fallback when you need a version without copied game assets.

Implemented:

- Local XML save parsing for Stardew Valley 1.6 saves.
- Single-player and multiplayer farmhand selection.
- Demo mode for users without a save nearby.
- Privacy mode and export-time anonymization.
- Conditional card visibility and a learning guide card for locked sections.
- Poster export with bundled `html-to-image` and QR generation.
- Static deploy metadata: `robots.txt`, `sitemap.xml`, `_headers`, `site.webmanifest`, favicon, and social preview art.
- Full asset deployment bundle generation with asset-audit checks.
- Optional public-safe deployment bundle generation for hosts that cannot publish copied game assets.
- Hosted-domain verification with `.tools/hosted-check.mjs` after deployment.

Current release evidence, last checked on 2026-05-25:

- `dist-full/` keeps the original-resource visual path: Stardew-style images, audio, UI, character sprites, farmer sprites, trees, and portraits.
- `dist-public/` remains a fallback without copied game image/audio/portrait assets.
- The static release gate and full-asset browser release gate pass for bundle structure, final-domain static metadata, the demo summary flow, poster export, click SFX, landing legal/asset notice visibility, parser/upload failure fixtures, compact poster layout, and foreground grass/tree regressions.
- Remaining launch proof still needs real-save coverage and cross-browser manual checks beyond the automated Chromium gate.

Known launch gaps:

- 5+ real Stardew Valley 1.6 save files, including early/late-game, single-player, multiplayer, Chinese, and English saves.
- Desktop Edge, Safari, and Firefox verification.
- Lighthouse desktop score and final hosted-domain runtime/header check. Current `https://stardew-wrapped.pages.dev/` probe fails from this environment, so the hosted pass is still open.
- External user feedback from a small private test before public launch.

Use [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) as the launch-readiness source of truth.

## Run Locally

```powershell
python -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/
```

Demo and screenshot-friendly URLs:

```text
http://127.0.0.1:8765/index.html?demo
http://127.0.0.1:8765/index.html?demo&lang=en
http://127.0.0.1:8765/index.html?demo&card=16
http://127.0.0.1:8765/index.html?demo&share
```

## How To Find A Save File

Ask users to choose the main save file with no extension, usually named like `FarmName_123456789`. Do not choose `SaveGameInfo` or `_old` backups.

Common locations:

- Windows: `%AppData%\StardewValley\Saves`
- macOS: `~/.config/StardewValley/Saves`
- Linux: `~/.config/StardewValley/Saves`

## Deploy

This repository is static. For the Stardew-style launch build, generate and deploy the full asset bundle:

```powershell
npm run build:full
```

Deploy the contents of `dist-full/` as the site root.

Cloudflare Pages:

- Framework preset: `None`
- Build command: `npm run build:full`
- Output directory: `dist-full`
- Project name: `stardew-wrapped`
- `wrangler.toml` is included for reproducible Pages deploys.

Cloudflare Pages CLI:

```powershell
npm install
npm run build:full
npm run deploy:cf
```

To build for a custom domain, set `SITE_URL` before running the build. The build rewrites `index.html` canonical/OG/Twitter metadata, `robots.txt`, and `sitemap.xml` inside the generated bundle:

```powershell
$env:SITE_URL='https://your-domain.example/'
npm run build:full
```

GitHub Pages or other static hosts:

- Publish the contents of `dist-full/`.
- Keep `.nojekyll` so underscored files such as `_headers` are not treated specially by Jekyll.

Optional fallback without copied game image/audio/portrait assets:

```powershell
npm run build:public
```

That writes `dist-public/`, which uses CSS/emoji fallback visuals and is not the primary visual build.

## Verification

Run the release gate after generating both static bundles:

```powershell
npm run build:full
npm run build:public
npm run check:release
npm run check:browser
```

The release check verifies the full asset build, public-safe fallback, required Stardew-style assets, click SFX, social preview PNG, canonical/OG/Twitter metadata, `robots.txt`, `sitemap.xml`, `site.webmanifest`, CSP headers, landing legal/asset notice, literal static references, and the removed festival recap card.

The browser release check serves `dist-full/` with production-like headers, opens the demo summary route directly, verifies demo rendering and poster export under CSP, checks the softer click SFX, verifies the landing legal/asset notice, exercises parser/upload failure fixtures, and guards the compact poster layout plus the foreground grass/tree visual regressions. It prints stage logs and has hard timeouts around Chrome startup and DevTools calls so failures should identify the stuck phase instead of hanging silently.

After deploying `dist-full/`, verify the live domain:

```powershell
npm run check:hosted
```

That check fetches the live root, `index.html`, `robots.txt`, `sitemap.xml`, `site.webmanifest`, and social PNG, then verifies status codes, CSP/security headers, cache policy, metadata, manifest fields, and social image size. Set `SITE_URL` for a custom domain:

```powershell
$env:SITE_URL='https://your-domain.example/'
npm run check:hosted
```

Run the smoke test after starting a local server when you need browser/runtime coverage:

```powershell
python .tools\smoke_phase1.py
```

To verify the full asset bundle locally:

```powershell
npm run build:full
cd dist-full
python -m http.server 8766
cd ..
$env:SMOKE_BASE_URL='http://127.0.0.1:8766'
python .tools\smoke_phase1.py
```

To verify the optional public-safe bundle locally:

```powershell
npm run build:public
cd dist-public
python -m http.server 8767
cd ..
$env:SMOKE_BASE_URL='http://127.0.0.1:8767'
python .tools\smoke_phase1.py
```

The current smoke test checks the demo flow, visible card registry, the learning guide card, and the Phase 2 cards already implemented.

## Privacy Model

- Save files are read with the browser `File` API.
- Parsing happens in the browser.
- No backend is used.
- Weather controls are local visual toggles only and do not call geolocation or weather APIs.
- Exported posters are generated locally in the browser.

## License

Project source code that is original to this repository is licensed under MIT. See `LICENSE`.

Stardew Valley names, marks, images, audio, and other game assets are not covered by this repository's MIT license. See `NOTICE.md`.
