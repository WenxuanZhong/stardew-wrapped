# Contributing

Keep changes scoped. This app is intentionally a static site: avoid adding a backend, account system, analytics, or network calls that touch user save data.

## Development Rules

- Keep save parsing in `src/parser/sdv-save.js`.
- Keep the app usable as a static site served from the repository root.
- Do not upload, beacon, log, or transmit save contents.
- New cards should register in `CARD_REGISTRY` and define `isApplicable(saveData)`.
- If a card can be hidden, add a learning guide hint.
- Add or update i18n keys for user-visible text.

## Testing

Start a local server:

```powershell
python -m http.server 8765
```

Run:

```powershell
python .tools\smoke_phase1.py
```

For parser changes, test with at least one single-player save and one multiplayer save when possible.

For release changes, build and test the full asset bundle:

```powershell
node .tools\build-full.mjs
node .tools\build-public.mjs
node .tools\release-check.mjs
```

For browser/runtime coverage of the full asset bundle:

```powershell
node .tools\build-full.mjs
cd dist-full
python -m http.server 8766
cd ..
$env:SMOKE_BASE_URL='http://127.0.0.1:8766'
python .tools\smoke_phase1.py
```

If you touch public-safe behavior, also build and test the optional fallback bundle:

```powershell
node .tools\build-public.mjs
cd dist-public
python -m http.server 8767
cd ..
$env:SMOKE_BASE_URL='http://127.0.0.1:8767'
python .tools\smoke_phase1.py
```

## Asset Policy

Do not add new extracted Stardew Valley assets unless the project owner has confirmed the publication rights.

The primary deployment artifact is `dist-full/` so the public site keeps the intended Stardew-style visuals. `dist-public/` remains available as a rights-conservative fallback.
