# Changelog

## Unreleased

- Added static deployment metadata: manifest, favicon, social preview, robots, sitemap, and Cloudflare-style headers.
- Localized key web fonts into `assets/fonts` to avoid third-party font requests on page load.
- Removed unused silent IP/weather API code; weather remains a local visual control.
- Added README, MIT license for original code, contribution notes, and asset notices.
- Added a full asset deployment build at `dist-full/` that preserves Stardew-style image, audio, UI, character, farmer, and portrait assets.
- Added `node .tools/build-full.mjs` and `node .tools/build-public.mjs` with bundle audit checks, plus smoke-test support for custom local base URLs.
- Kept `dist-public/` as an optional rights-conservative fallback instead of the primary visual build.
- Removed the low-variance festival recap card from the current carousel while keeping parsed festival fields available for future use.
- Replaced the mechanical synthesized click cue with a softer Stardew `bigSelect`-derived `assets/audio/sfx_click.ogg`, with a gentle synthesized fallback.
- Added a 1200×630 PNG social preview, canonical/OG/Twitter metadata, robots/sitemap/manifest checks, CSP headers for the full asset build, and `node .tools/release-check.mjs` as a reusable release gate.
- Hardened `.tools/release-browser-check.py` with direct demo-summary navigation, stage logs, separate Chrome startup and DevTools hard timeouts, landing legal/asset notice visibility, parser/upload failure fixtures, compact poster overlap checks, click SFX validation, and foreground grass/tree regression checks.
- Added a visible landing-page unofficial fan-made / Stardew Valley asset ownership notice and static checks to keep it in both release bundles.
- Added `.tools/hosted-check.mjs` for post-deploy live-domain checks covering headers, metadata, manifest, sitemap, robots, cache policy, and social image size.
- Fixed the corner NPC cameo sprite positioning so original character heads remain visible instead of being clipped by the card frame.
- Moved export-time anonymization controls below the summary poster, removed the low-variance festival recap card from the active carousel, and kept the full build on original Stardew-style tree/grass resources instead of generated replacements.
- Added `LAUNCH_CHECKLIST.md` to separate automated release evidence from the remaining real-save, cross-browser, Lighthouse, hosted-domain, and external tester gates.
