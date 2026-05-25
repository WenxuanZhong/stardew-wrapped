# Stardew Wrapped Launch Checklist

Last updated: 2026-05-25

This checklist separates automated release evidence from the remaining manual launch proof. Do not mark the project launch-ready until every required item below has direct evidence.

## Automated Gates

- [x] Build full asset bundle: `node .tools\build-full.mjs`
  - Current evidence: `dist-full/` generated with 88 Stardew files, 12 audio files, and 37 portraits.
- [x] Build public-safe fallback bundle: `node .tools\build-public.mjs`
  - Current evidence: `dist-public/` generated without copied game image/audio/portrait assets.
- [x] Static release gate: `node .tools\release-check.mjs`
  - Current evidence: passed on 2026-05-25.
  - Covers full/public bundle structure, required assets, social preview PNG, canonical/OG/Twitter metadata, `robots.txt`, `sitemap.xml`, `site.webmanifest`, CSP headers, landing legal/asset notice, literal static references, and removed festival recap card.
- [x] Full browser release gate: `python .tools\release-browser-check.py`
  - Current evidence: passed on 2026-05-25.
  - Covers full build under production-like headers, direct demo summary rendering, poster export under CSP, click SFX Ogg loading, landing legal/asset notice visibility, synthetic parser and upload failure fixtures, compact summary layout, export anonymization controls below the poster, hidden HUD in compact summary, foreground grass scatter, original-resource trees, tree roots, and no stump-like foreground tiles.

## Recent Feedback Coverage

- [x] Keep the main visual build on original Stardew-style resources instead of generated replacements.
- [x] Corner NPC cameo head is visible and not clipped by the card frame.
- [x] Export-time anonymization control no longer overlaps the summary poster.
- [x] Festival recap card is removed from the active carousel.
- [x] Click SFX uses the softer local `assets/audio/sfx_click.ogg` path with a synthesized fallback.
- [x] Grass foreground is scattered rather than a rigid grid.
- [x] Foreground trees use original tree assets, sit on the grass, include root overlays, and do not use stump-like tiles.
- [x] Parser and upload error fixtures reject non-main, old-version, future-version, oversized, and malformed files with visible user-facing error cards.
- [x] Landing page includes a visible unofficial fan-made / Stardew Valley asset ownership notice.

## Manual Launch Gates

- [ ] Test at least 5 different Stardew Valley 1.6 saves.
  - Required coverage: early-game, late-game, single-player, multiplayer, Chinese save/user context, English save/user context.
- [ ] Invite 3-5 external testers to run real saves and report confusing copy, missing data, broken cards, or export failures.
- [ ] Verify card applicability with real saves.
  - No spouse or house signal should hide the family/home card.
  - Locked sections should appear in the learning guide with useful unlock hints.
  - Top NPC, crop, fishing, adventure, numbers, grandpa, community/Joja, radar, and profession cards should be plausible for each save.
- [ ] Verify upload failure states with real or external fixture files.
  - Error cards for non-main, old-version, future-version, oversized, and malformed XML cases are already covered by synthetic browser fixtures.
  - Before launch, confirm at least one real or externally produced bad file still reaches the intended error UI.
- [ ] Desktop browser pass.
  - Chrome.
  - Edge.
  - Firefox.
  - Safari.
- [ ] Hosted-domain final pass.
  - Static bundle metadata is already checked by `node .tools\release-check.mjs`.
  - Run `node .tools\hosted-check.mjs` after deployment.
  - Current evidence: failed on 2026-05-25 because `https://stardew-wrapped.pages.dev/` and related files could not be fetched from this environment.
  - `_headers` are active on the host and CSP still allows the app to run.
  - Social preview image renders in link debuggers.
- [ ] Lighthouse desktop score is at least 90 or any lower score has an accepted launch rationale.
- [x] Legal/asset notice is visible enough for a fan-made project using local Stardew-style assets.

## Release Command Sequence

```powershell
npm run build:full
npm run build:public
npm run check:release
npm run check:browser
```

After the static bundle is deployed, run:

```powershell
npm run check:hosted
```

## Current Decision

The current code is much closer to a launch candidate, but launch readiness is not yet proven because the manual real-save, external tester, cross-browser, Lighthouse, and hosted-domain checks are still open. The hosted-domain check is currently blocked by the live `pages.dev` domain being unreachable from this environment.
