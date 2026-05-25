"""Phase 1 smoke test: console errors + visibleCards + guide card + error-page i18n keys.
Headless Chrome via existing probe pattern.
Run after `python -m http.server 8765` from project root."""

import asyncio, json, os, socket, subprocess, sys, time, urllib.request, websockets

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = int(os.environ.get("DEVPORT", "9233"))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROFILE_DIR = os.environ.get("SMOKE_CHROME_PROFILE", os.path.join(ROOT, ".tools", f"chrome-profile-{PORT}"))
BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://127.0.0.1:8765").rstrip("/")
TARGET = os.environ.get("SMOKE_TARGET", f"{BASE_URL}/index.html?demo&smoke={int(time.time())}")


def busy(p):
    s = socket.socket()
    try: s.bind(("127.0.0.1", p)); s.close(); return False
    except OSError: return True


async def main():
    if not busy(PORT):
        os.makedirs(PROFILE_DIR, exist_ok=True)
        subprocess.Popen([CHROME, f"--remote-debugging-port={PORT}",
                          f"--user-data-dir={PROFILE_DIR}",
                          "--headless=new", "--hide-scrollbars", "--no-first-run",
                          "--no-default-browser-check", "--window-size=1280,800", "about:blank"],
                         creationflags=0x08000000)
        for _ in range(80):
            time.sleep(0.25)
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1).read()
                break
            except Exception: pass
        else:
            raise RuntimeError(f"Chrome remote debugging did not start on port {PORT} with profile {PROFILE_DIR}")

    targets = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=2).read())
    print("=== TARGETS ===")
    for t in targets:
        print(t.get("type"), "|", t.get("url"), "|", t.get("title"))
    page = next(t for t in targets if t["type"] == "page")
    nid = 0
    errors = []
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024) as sock:
        async def call(method, params=None):
            nonlocal nid; nid += 1
            await sock.send(json.dumps({"id": nid, "method": method, "params": params or {}}))
            while True:
                msg = json.loads(await sock.recv())
                if msg.get("method") == "Runtime.consoleAPICalled":
                    p = msg["params"]
                    if p["type"] == "error":
                        text = " ".join(str(a.get("value", a.get("description", ""))) for a in p["args"])
                        errors.append(("console.error", text))
                    continue
                if msg.get("method") == "Runtime.exceptionThrown":
                    ex = msg["params"]["exceptionDetails"]
                    errors.append(("uncaught", ex.get("text", "") + " " + ex.get("exception", {}).get("description", "")))
                    continue
                if msg.get("id") == nid:
                    return msg.get("result", {})

        await call("Runtime.enable")
        await call("Page.enable")
        await call("Page.navigate", {"url": TARGET})
        await asyncio.sleep(6.0)

        # quick: is document.body present?
        diag = await call("Runtime.evaluate", {"expression": "JSON.stringify({body: !!document.body, ready: document.readyState, url: location.href})", "returnByValue": True})
        print("=== DIAG ===")
        print(diag)

        expr = """
        (() => {
            const out = {};
            // module globals not exposed; verify via DOM
            out.bodyClass = document.body.className;
            const cards = document.querySelectorAll('.card');
            out.allCards = cards.length;
            const visibleCards = [...cards].filter(c => c.style.display !== 'none');
            out.visibleCardCount = visibleCards.length;
            out.visibleIdx = visibleCards.map(c => c.dataset.idx);
            out.guideCardExists = !!document.querySelector('.card[data-idx="14"]');
            out.guideCardVisible = document.querySelector('.card[data-idx="14"]')?.style.display !== 'none';
            const guideRows = document.querySelectorAll('#guide-list .guide-row');
            const guideEmpty = document.querySelectorAll('#guide-list .guide-empty');
            out.guideRowCount = guideRows.length;
            out.guideEmptyShown = guideEmpty.length > 0;
            out.farmhandModalExists = !!document.getElementById('farmhand-modal');
            out.errBoxExists = !!document.getElementById('err');
            out.errUseDemoBtn = !!document.getElementById('err-use-demo');
            out.errRetryBtn = !!document.getElementById('err-retry');
            // err-box i18n labels were translated by applyLang?
            out.errUseDemoText = document.getElementById('err-use-demo')?.textContent;
            out.guideTagText = document.querySelector('.card[data-idx="14"] .card-tag')?.textContent;
            out.phase2Cards = {
              advsheet: !!document.querySelector('.card[data-idx="15"]') && document.querySelector('.card[data-idx="15"]')?.style.display !== 'none',
              radar: !!document.querySelector('.card[data-idx="16"]') && document.querySelector('.card[data-idx="16"]')?.style.display !== 'none',
              community: !!document.querySelector('.card[data-idx="17"]') && document.querySelector('.card[data-idx="17"]')?.style.display !== 'none',
            };
            out.festivalCardExists = !!document.querySelector('.card[data-idx="18"]');
            out.radarAxisCount = document.querySelectorAll('#radar-axes line').length;
            out.radarLabelCount = document.querySelectorAll('#radar-labels > g').length;
            out.radarTotalText = document.querySelector('#radar-summary')?.textContent?.replace(/\\s+/g, ' ').trim();
            out.communityRoomCount = document.querySelectorAll('#cc-rooms-grid .cc-room-tile').length;
            out.adventureRowCount = document.querySelectorAll('#adv-sheet-rows .adv-stat-row').length;
            out.registryCheck = window.__stardewWrappedDevCheck ? window.__stardewWrappedDevCheck() : null;
            out.emptySaveRegistryCheck = window.__stardewWrappedDevCheck ? window.__stardewWrappedDevCheck({
              name: 'Fresh',
              farmName: 'Fresh Farm',
              ccPath: 'none',
              ccRoomsCompleted: 0,
              friendships: []
            }) : null;
            return JSON.stringify(out);
        })()
        """
        r = await call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        print("=== RAW EVAL ===")
        print(json.dumps(r, indent=2, ensure_ascii=False)[:2000])
        result = r.get("result", {}).get("value")
        print("=== PAGE STATE ===")
        try: print(json.dumps(json.loads(result), indent=2, ensure_ascii=False))
        except Exception: print(result)

        state = json.loads(result)
        assert state["phase2Cards"]["advsheet"], "advsheet card hidden or missing"
        assert state["phase2Cards"]["radar"], "radar card hidden or missing"
        assert state["phase2Cards"]["community"], "community card hidden or missing"
        assert not state["festivalCardExists"], "festival recap card should be removed"
        assert state["radarAxisCount"] == 6, f"expected 6 radar axes, got {state['radarAxisCount']}"
        assert state["radarLabelCount"] == 6, f"expected 6 radar labels, got {state['radarLabelCount']}"
        assert state["communityRoomCount"] == 6, f"expected 6 community rooms, got {state['communityRoomCount']}"
        assert state["adventureRowCount"] == 6, f"expected 6 adventure rows, got {state['adventureRowCount']}"
        assert state["registryCheck"] and state["registryCheck"]["ok"], f"card registry check failed: {state['registryCheck']}"
        empty_hidden = set(state["emptySaveRegistryCheck"]["hidden"])
        for key in ["advsheet", "radar", "cc"]:
            assert key in empty_hidden, f"expected fresh save to hide {key}, got {sorted(empty_hidden)}"

        print("\n=== ERRORS (filtered) ===")
        # Suppress html-to-image deferred warnings, png fallback messages, fonts.
        IGNORES = ["html-to-image", "fontfaceobserver", "fonts.googleapis", "Failed to decode", "favicon"]
        filtered_errors = []
        for kind, txt in errors:
            if any(ig in txt for ig in IGNORES): continue
            filtered_errors.append((kind, txt))
            print(f"[{kind}] {txt}")
        if not filtered_errors:
            print("(none)")
        assert not filtered_errors, f"console/runtime errors found: {filtered_errors}"

asyncio.run(main())
