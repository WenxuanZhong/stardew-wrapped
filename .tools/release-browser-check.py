"""Browser-level release check for the full asset build.

This starts a local static server for dist-full with production-like security
headers, opens headless Chrome through the DevTools protocol, and verifies:

- demo flow renders in full asset mode, not public-safe mode
- festival recap card is absent
- original-resource click SFX is referenced
- html-to-image can export the share card to a PNG data URL under CSP
- parser failure states return stable user-facing error codes
- upload failure fixtures render the intended error cards
- landing page shows the fan-made / asset ownership notice

Run after:
  node .tools\\build-full.mjs
"""

import asyncio
import json
import os
import socket
import subprocess
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist-full"
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
CDP_CALL_TIMEOUT = int(os.environ.get("CDP_CALL_TIMEOUT", "30"))
BROWSER_CHECK_TIMEOUT = int(os.environ.get("BROWSER_CHECK_TIMEOUT", "120"))
CHROME_START_TIMEOUT = int(os.environ.get("CHROME_START_TIMEOUT", "120"))
CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "media-src 'self'; "
    "object-src 'none'; "
    "base-uri 'none'; "
    "form-action 'none'; "
    "frame-ancestors 'none'"
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def log(stage):
    print(f"[release-browser-check] {stage}", flush=True)


def free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def fetch_local_http(port, path="/json/version", timeout=0.75):
    with socket.create_connection(("127.0.0.1", port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(
            (
                f"GET {path} HTTP/1.1\r\n"
                f"Host: 127.0.0.1:{port}\r\n"
                "Connection: close\r\n"
                "\r\n"
            ).encode("ascii")
        )
        chunks = []
        while True:
            try:
                chunk = sock.recv(65536)
            except socket.timeout as exc:
                if chunks:
                    break
                raise exc
            if not chunk:
                break
            chunks.append(chunk)

    raw = b"".join(chunks)
    headers, _, body = raw.partition(b"\r\n\r\n")
    status = headers.splitlines()[0] if headers else b""
    if b" 200 " not in status:
        raise RuntimeError(f"Unexpected HTTP response from Chrome DevTools: {status!r}")
    if b"transfer-encoding: chunked" in headers.lower():
        decoded = []
        rest = body
        while rest:
            line, _, rest = rest.partition(b"\r\n")
            if not line:
                break
            size = int(line.split(b";", 1)[0], 16)
            if size == 0:
                break
            decoded.append(rest[:size])
            rest = rest[size + 2:]
        body = b"".join(decoded)
    return body


class ReleaseHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", CSP)
        if self.path.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        return


async def wait_for_json(port, path="/json/version", timeout=60, proc=None):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        if proc is not None and proc.poll() is not None:
            raise RuntimeError(f"Chrome exited before DevTools was ready: code={proc.returncode}")
        try:
            return fetch_local_http(port, path)
        except Exception as exc:
            last = exc
            await asyncio.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for Chrome on port {port}: {last}")


async def run_cdp_check(site_port, debug_port):
    log("reading Chrome targets")
    targets = json.loads((await wait_for_json(debug_port, "/json", timeout=5)).decode("utf-8"))
    page = next(t for t in targets if t.get("type") == "page")
    nid = 0
    errors = []

    log("importing websockets")
    import websockets

    log("connecting to Chrome DevTools")
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024) as sock:
        async def call(method, params=None, timeout=CDP_CALL_TIMEOUT):
            nonlocal nid
            nid += 1
            call_id = nid
            await asyncio.wait_for(
                sock.send(json.dumps({"id": call_id, "method": method, "params": params or {}})),
                timeout=timeout,
            )
            deadline = time.time() + timeout
            while True:
                remaining = deadline - time.time()
                if remaining <= 0:
                    raise RuntimeError(f"Timed out waiting for CDP response: {method}")
                msg = json.loads(await asyncio.wait_for(sock.recv(), timeout=remaining))
                if msg.get("method") == "Runtime.consoleAPICalled":
                    p = msg["params"]
                    if p.get("type") == "error":
                        text = " ".join(str(a.get("value", a.get("description", ""))) for a in p.get("args", []))
                        errors.append(("console.error", text))
                    continue
                if msg.get("method") == "Runtime.exceptionThrown":
                    ex = msg["params"]["exceptionDetails"]
                    errors.append(("uncaught", ex.get("text", "") + " " + ex.get("exception", {}).get("description", "")))
                    continue
                if msg.get("method") == "Log.entryAdded":
                    entry = msg["params"]["entry"]
                    if entry.get("level") in ("error", "warning"):
                        errors.append((entry.get("level"), entry.get("text", "")))
                    continue
                if msg.get("id") == call_id:
                    if msg.get("error"):
                        raise RuntimeError(f"CDP {method} failed: {msg['error']}")
                    return msg.get("result", {})

        async def wait_for_expr(expression, timeout=20):
            deadline = time.time() + timeout
            last = None
            while time.time() < deadline:
                result = await call("Runtime.evaluate", {
                    "expression": expression,
                    "returnByValue": True,
                })
                if result.get("result", {}).get("value"):
                    return result
                last = result
                await asyncio.sleep(0.25)
            raise RuntimeError(f"Timed out waiting for page expression: {expression}\nLast result: {last}")

        log("enabling CDP domains")
        await call("Runtime.enable")
        await call("Log.enable")
        await call("Page.enable")

        url = f"http://127.0.0.1:{site_port}/index.html?demo&card=12&lang=zh&releaseBrowserCheck={int(time.time())}"
        log("navigating full build summary page")
        await call("Page.navigate", {"url": url})
        log("waiting for summary page")
        await wait_for_expr(
            "document.readyState !== 'loading' && document.body.classList.contains('cards-mode') && "
            "document.querySelector('.card.active')?.dataset.idx === '12' && "
            "typeof window.htmlToImage === 'object' && !!document.getElementById('share-card')",
            timeout=25,
        )

        log("checking export, SFX, and card state")
        expr = """
        (async () => {
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          const visible = [...document.querySelectorAll('.card')].filter(c => c.style.display !== 'none');
          const node = document.getElementById('share-card');
          const lib = window.htmlToImage || (typeof htmlToImage !== 'undefined' ? htmlToImage : null);
          const sfxRes = await fetch('assets/audio/sfx_click.ogg', { cache: 'no-store' });
          const sfxBytes = new Uint8Array(await sfxRes.arrayBuffer());
          const sfxSig = String.fromCharCode(...sfxBytes.slice(0, 4));
          const out = {
            ready: document.readyState,
            bodyClass: document.body.className,
            activeIdx: document.querySelector('.card.active')?.dataset.idx,
            publicSafe: document.body.dataset.publicSafe === 'true',
            cardCount: document.querySelectorAll('.card').length,
            visibleCount: visible.length,
            visibleIdx: visible.map(c => c.dataset.idx),
            festivalCardExists: !!document.querySelector('.card[data-idx="18"]'),
            shareCardExists: !!node,
            runtimeDevCheck: window.__stardewWrappedDevCheck ? window.__stardewWrappedDevCheck() : null,
            htmlToImageType: typeof window.htmlToImage,
            sfxClickStatus: sfxRes.status,
            sfxClickSignature: sfxSig,
            sfxClickOk: sfxRes.ok && sfxSig === 'OggS'
          };
          if (lib && node) {
            try {
              const dataUrl = await lib.toPng(node, {
                pixelRatio: 1,
                cacheBust: true,
                backgroundColor: '#f6d27a',
                filter: n => !(n.classList && n.classList.contains('debug-panel'))
              });
              out.exportOk = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,');
              out.exportLength = dataUrl.length;
            } catch (e) {
              out.exportOk = false;
              out.exportError = String(e && (e.stack || e.message || e));
            }
          } else {
            out.exportOk = false;
            out.exportError = 'missing htmlToImage or share-card';
          }
          return JSON.stringify(out);
        })()
        """
        result = await call("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True}, timeout=45)
        state = json.loads(result.get("result", {}).get("value") or "{}")

        log("checking parser failure fixtures")
        parser_expr = """
        (async () => {
          try {
            const mod = await import('./src/parser/sdv-save.js');
            const fixtures = [
              {
                name: 'malformedXml',
                expected: 'PARSE_FAILED',
                xml: '<SaveGame><gameVersion>1.6.15</gameVersion><player></SaveGame>'
              },
              {
                name: 'notMainSave',
                expected: 'NOT_MAIN_SAVE',
                xml: '<SaveGame><gameVersion>1.6.15</gameVersion></SaveGame>'
              },
              {
                name: 'oldVersion',
                expected: 'OLD_VERSION',
                xml: '<SaveGame><gameVersion>1.5.6</gameVersion><player><name>Test</name></player></SaveGame>'
              },
              {
                name: 'futureVersion',
                expected: 'FUTURE_VERSION',
                xml: '<SaveGame><gameVersion>1.7.0</gameVersion><player><name>Test</name></player></SaveGame>'
              }
            ];
            const cases = fixtures.map(fixture => {
              try {
                mod.parseStardewSave(fixture.xml);
                return { name: fixture.name, expected: fixture.expected, code: 'NO_THROW' };
              } catch (err) {
                return {
                  name: fixture.name,
                  expected: fixture.expected,
                  code: err && err.code ? err.code : 'UNKNOWN_THROW',
                  errorName: err && err.name ? err.name : ''
                };
              }
            });
            const maxSaveBytes = mod.MAX_SAVE_BYTES;
            return JSON.stringify({
              ok: cases.every(c => c.code === c.expected) && maxSaveBytes === 10 * 1024 * 1024,
              maxSaveBytes,
              expectedMaxSaveBytes: 10 * 1024 * 1024,
              cases
            });
          } catch (err) {
            return JSON.stringify({
              ok: false,
              moduleError: String(err && (err.stack || err.message || err))
            });
          }
        })()
        """
        parser_result = await call(
            "Runtime.evaluate",
            {"expression": parser_expr, "awaitPromise": True, "returnByValue": True},
            timeout=45,
        )
        state["parser"] = json.loads(parser_result.get("result", {}).get("value") or "{}")

        upload_url = f"http://127.0.0.1:{site_port}/index.html?lang=zh&releaseUploadCheck={int(time.time())}"
        log("navigating landing page for upload failure checks")
        await call("Page.navigate", {"url": upload_url})
        log("waiting for landing upload page")
        await wait_for_expr(
            "document.readyState === 'complete' && document.body.classList.contains('landing-mode') && "
            "!!document.getElementById('file-input') && !!document.getElementById('err')",
            timeout=25,
        )
        log("checking landing legal notice")
        legal_expr = """
        (() => {
          const el = document.querySelector('.landing-legal-note');
          if (!el) return JSON.stringify({ ok: false, exists: false });
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const text = (el.innerText || el.textContent || '').trim();
          return JSON.stringify({
            ok: r.width > 0 &&
              r.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              r.bottom >= 0 &&
              r.top <= innerHeight &&
              text.includes('ConcernedApe') &&
              text.includes('Stardew Valley'),
            exists: true,
            rect: {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
              bottom: Math.round(innerHeight - r.bottom)
            },
            display: style.display,
            visibility: style.visibility,
            textLength: text.length,
            hasConcernedApe: text.includes('ConcernedApe'),
            hasStardewValley: text.includes('Stardew Valley')
          });
        })()
        """
        legal_result = await call(
            "Runtime.evaluate",
            {"expression": legal_expr, "returnByValue": True},
            timeout=45,
        )
        state["landingLegal"] = json.loads(legal_result.get("result", {}).get("value") or "{}")

        log("checking upload failure error cards")
        upload_expr = """
        (async () => {
          try {
            const mod = await import('./src/parser/sdv-save.js');
            const input = document.getElementById('file-input');
            const err = document.getElementById('err');
            const title = document.getElementById('err-title');
            const body = document.getElementById('err-body');
            const originalConsoleError = console.error;
            console.error = (...args) => {
              const first = String(args && args[0] ? args[0] : '');
              if (!first.includes('[Stardew Wrapped] load failed:')) {
                originalConsoleError(...args);
              }
            };
            const clearError = () => {
              err.classList.remove('show');
              err.style.display = 'none';
              delete err.dataset.errCode;
              title.textContent = '';
              body.textContent = '';
              input.value = '';
            };
            const waitForError = async () => {
              const deadline = performance.now() + 4000;
              while (performance.now() < deadline) {
                if (err.dataset.errCode) return true;
                await new Promise(resolve => setTimeout(resolve, 50));
              }
              return false;
            };
            const runCase = async ({ name, expected, file, detailText }) => {
              clearError();
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
              input.dispatchEvent(new Event('change', { bubbles: true }));
              const appeared = await waitForError();
              const bodyText = body.innerText || body.textContent || '';
              const titleText = title.innerText || title.textContent || '';
              return {
                name,
                expected,
                code: err.dataset.errCode || '',
                appeared,
                visible: err.classList.contains('show') && getComputedStyle(err).display !== 'none',
                titleLength: titleText.trim().length,
                bodyLength: bodyText.trim().length,
                detailText: detailText || '',
                detailOk: !detailText || bodyText.includes(detailText)
              };
            };
            try {
              const maxBytes = mod.MAX_SAVE_BYTES;
              const cases = [];
              cases.push(await runCase({
                name: 'notMainSave',
                expected: 'NOT_MAIN_SAVE',
                file: new File(['<SaveGame></SaveGame>'], 'SaveGameInfo', { type: 'text/xml' })
              }));
              cases.push(await runCase({
                name: 'oldVersion',
                expected: 'OLD_VERSION',
                detailText: '1.5.6',
                file: new File(
                  ['<SaveGame><gameVersion>1.5.6</gameVersion><player><name>Test</name></player></SaveGame>'],
                  'OldFarm_123456789',
                  { type: 'text/xml' }
                )
              }));
              cases.push(await runCase({
                name: 'futureVersion',
                expected: 'FUTURE_VERSION',
                detailText: '1.7.0',
                file: new File(
                  ['<SaveGame><gameVersion>1.7.0</gameVersion><player><name>Test</name></player></SaveGame>'],
                  'FutureFarm_123456789',
                  { type: 'text/xml' }
                )
              }));
              cases.push(await runCase({
                name: 'malformedXml',
                expected: 'PARSE_FAILED',
                file: new File(
                  ['<SaveGame><gameVersion>1.6.15</gameVersion><player></SaveGame>'],
                  'BrokenFarm_123456789',
                  { type: 'text/xml' }
                )
              }));
              cases.push(await runCase({
                name: 'tooLarge',
                expected: 'TOO_LARGE',
                detailText: '10.0 MB',
                file: new File(
                  [new Uint8Array(maxBytes + 1)],
                  'BigFarm_123456789',
                  { type: 'text/xml' }
                )
              }));
              return JSON.stringify({
                ok: cases.every(c =>
                  c.appeared &&
                  c.visible &&
                  c.code === c.expected &&
                  c.titleLength > 0 &&
                  c.bodyLength > 0 &&
                  c.detailOk
                ),
                cases
              });
            } finally {
              console.error = originalConsoleError;
            }
          } catch (err) {
            return JSON.stringify({
              ok: false,
              moduleError: String(err && (err.stack || err.message || err))
            });
          }
        })()
        """
        upload_result = await call(
            "Runtime.evaluate",
            {"expression": upload_expr, "awaitPromise": True, "returnByValue": True},
            timeout=45,
        )
        state["uploadFailures"] = json.loads(upload_result.get("result", {}).get("value") or "{}")

        log("switching to compact viewport")
        await call("Emulation.setDeviceMetricsOverride", {
            "width": 751,
            "height": 620,
            "deviceScaleFactor": 1,
            "mobile": False,
        })
        visual_url = f"http://127.0.0.1:{site_port}/index.html?demo&card=12&season=spring&releaseVisualCheck={int(time.time())}"
        log("navigating compact visual check page")
        await call("Page.navigate", {"url": visual_url})
        log("waiting for compact summary page")
        await wait_for_expr(
            "document.readyState !== 'loading' && document.body.classList.contains('cards-mode') && "
            "document.querySelector('.card.active')?.dataset.idx === '12'",
            timeout=25,
        )

        log("checking compact poster and foreground visuals")
        visual_expr = """
        (async () => {
          document.body.classList.add('snap-mode');
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          const rectOf = sel => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
              bottom: Math.round(innerHeight - r.bottom),
              text: el.innerText || el.textContent || ''
            };
          };
          const intersects = (a, b) => Boolean(
            a && b &&
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
          );
          const poster = rectOf('.poster');
          const privacy = rectOf('.export-privacy');
          const buttons = rectOf('.poster-action-buttons');
          const foreground = rectOf('.farm-foreground');
          const tilePos = el => getComputedStyle(el).backgroundPosition;
          const treeRects = [...document.querySelectorAll('.farm-prop.tree')].map(el => {
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
              bottom: Math.round(innerHeight - r.bottom)
            };
          });
          const rootRects = [...document.querySelectorAll('.farm-prop.tree-root')].map(el => {
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
              bottom: Math.round(innerHeight - r.bottom)
            };
          });
          return JSON.stringify({
            ready: document.readyState,
            bodyClass: document.body.className,
            activeIdx: document.querySelector('.card.active')?.dataset.idx,
            viewport: { w: innerWidth, h: innerHeight },
            poster,
            privacy,
            buttons,
            foreground,
            posterFullyInViewport: !!poster &&
              poster.x >= 0 &&
              poster.y >= 0 &&
              poster.x + poster.w <= innerWidth &&
              poster.y + poster.h <= innerHeight,
            privacyOverPoster: intersects(privacy, poster),
            buttonsOverPoster: intersects(buttons, poster),
            privacyBelowPoster: !!poster && !!privacy && privacy.y >= poster.y + poster.h + 8,
            buttonsBelowPoster: !!poster && !!buttons && buttons.y >= poster.y + poster.h + 8,
            hudOpacity: getComputedStyle(document.querySelector('.game-hud')).opacity,
            worldSwitchOpacity: getComputedStyle(document.querySelector('.world-switch')).opacity,
            treeCount: treeRects.length,
            rootCount: rootRects.length,
            looseGrassCount: document.querySelectorAll('.farm-loose-grass').length,
            grassTileCount: document.querySelectorAll('.farm-tile.grass-accent').length,
            purpleGrassFrameCount: [...document.querySelectorAll('.farm-loose-grass, .title-grass-tuft')]
              .filter(el => getComputedStyle(el).backgroundPosition.includes('-100px')).length,
            suspiciousStumpTiles: [...document.querySelectorAll('.farm-tile.front')]
              .filter(el => ['0px -384px', '-32px -384px'].includes(tilePos(el))).length,
            treeRects,
            rootRects
          });
        })()
        """
        visual_result = await call("Runtime.evaluate", {"expression": visual_expr, "awaitPromise": True, "returnByValue": True}, timeout=45)
        state["visual"] = json.loads(visual_result.get("result", {}).get("value") or "{}")
        log("closing Chrome")
        await call("Browser.close")

    return state, errors


async def main():
    if not DIST.exists():
        raise RuntimeError("dist-full does not exist. Run node .tools\\build-full.mjs first.")

    log(f"serving {DIST}")
    site = ThreadingHTTPServer(("127.0.0.1", 0), ReleaseHandler)
    site_port = site.server_address[1]
    site_task = asyncio.to_thread(site.serve_forever)
    site_future = asyncio.create_task(site_task)

    debug_port = free_port()
    profile = ROOT / ".tools" / f"chrome-release-browser-check-{debug_port}"
    profile.mkdir(parents=True, exist_ok=True)

    log(f"launching Chrome on DevTools port {debug_port}")
    chrome = subprocess.Popen([
        CHROME,
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={profile}",
        "--headless=new",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-component-update",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--metrics-recording-only",
        "--mute-audio",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1280,800",
        "about:blank",
    ], creationflags=0x08000000)

    try:
        log("waiting for Chrome DevTools endpoint")
        await asyncio.wait_for(wait_for_json(debug_port, proc=chrome), timeout=CHROME_START_TIMEOUT)
        state, errors = await asyncio.wait_for(
            run_cdp_check(site_port, debug_port),
            timeout=BROWSER_CHECK_TIMEOUT,
        )
        log("browser assertions finished")
    except asyncio.TimeoutError as exc:
        raise RuntimeError(f"Browser release check timed out after {BROWSER_CHECK_TIMEOUT}s") from exc
    finally:
        log("stopping local server and Chrome")
        site.shutdown()
        site.server_close()
        site_future.cancel()
        try:
            chrome.terminate()
            chrome.wait(timeout=5)
        except Exception:
            chrome.kill()

    failures = []
    if state.get("ready") not in ("interactive", "complete"):
        failures.append(f"document not ready: {state.get('ready')}")
    if state.get("activeIdx") != "12":
        failures.append(f"release browser check did not land on summary poster: {state.get('activeIdx')}")
    if state.get("publicSafe"):
        failures.append("dist-full unexpectedly ran in public-safe mode")
    if state.get("cardCount") != 18 or state.get("visibleCount") != 18:
        failures.append(f"expected 18 cards visible, got {state.get('visibleCount')} of {state.get('cardCount')}")
    if state.get("festivalCardExists"):
        failures.append("festival recap card exists")
    runtime_dev_check = state.get("runtimeDevCheck")
    if not runtime_dev_check or not runtime_dev_check.get("ok"):
        failures.append(f"runtime dev self-check failed: {runtime_dev_check}")
    if not state.get("sfxClickOk"):
        failures.append(
            f"click SFX did not load as Ogg: status={state.get('sfxClickStatus')} "
            f"signature={state.get('sfxClickSignature')}"
        )
    if state.get("htmlToImageType") != "object":
        failures.append(f"htmlToImage missing: {state.get('htmlToImageType')}")
    if not state.get("exportOk") or int(state.get("exportLength") or 0) < 10000:
        failures.append(f"share-card export failed: {state.get('exportError') or state.get('exportLength')}")

    parser = state.get("parser") or {}
    if parser.get("maxSaveBytes") != 10 * 1024 * 1024:
        failures.append(f"MAX_SAVE_BYTES mismatch: {parser.get('maxSaveBytes')}")
    for case in parser.get("cases") or []:
        if case.get("code") != case.get("expected"):
            failures.append(
                f"parser fixture {case.get('name')} expected {case.get('expected')} got {case.get('code')}"
            )
    if not parser.get("ok"):
        failures.append(f"parser failure-state check failed: {parser}")

    upload_failures = state.get("uploadFailures") or {}
    for case in upload_failures.get("cases") or []:
        if case.get("code") != case.get("expected"):
            failures.append(
                f"upload fixture {case.get('name')} expected {case.get('expected')} got {case.get('code')}"
            )
        if not case.get("appeared") or not case.get("visible"):
            failures.append(f"upload fixture {case.get('name')} did not render a visible error card")
        if int(case.get("titleLength") or 0) <= 0 or int(case.get("bodyLength") or 0) <= 0:
            failures.append(f"upload fixture {case.get('name')} rendered an empty error card")
        if not case.get("detailOk"):
            failures.append(
                f"upload fixture {case.get('name')} missing detail text {case.get('detailText')}"
            )
    if not upload_failures.get("ok"):
        failures.append(f"upload failure-state check failed: {upload_failures}")

    landing_legal = state.get("landingLegal") or {}
    if not landing_legal.get("ok"):
        failures.append(f"landing legal notice is missing or not visible: {landing_legal}")

    visual = state.get("visual") or {}
    if visual.get("ready") not in ("interactive", "complete"):
        failures.append(f"visual page not ready: {visual.get('ready')}")
    if visual.get("activeIdx") != "12":
        failures.append(f"visual check did not land on summary poster: {visual.get('activeIdx')}")
    if not visual.get("posterFullyInViewport"):
        failures.append(f"summary poster is clipped in compact viewport: {visual.get('poster')}")
    if visual.get("privacyOverPoster"):
        failures.append(f"export privacy control overlaps poster: {visual.get('privacy')}")
    if visual.get("buttonsOverPoster"):
        failures.append(f"poster action buttons overlap poster: {visual.get('buttons')}")
    if not visual.get("privacyBelowPoster"):
        failures.append(f"export privacy control should sit below poster: poster={visual.get('poster')} privacy={visual.get('privacy')}")
    if not visual.get("buttonsBelowPoster"):
        failures.append(f"poster action buttons should sit below poster: poster={visual.get('poster')} buttons={visual.get('buttons')}")
    if visual.get("hudOpacity") not in ("0", "0.0"):
        failures.append(f"compact summary HUD should be hidden, opacity={visual.get('hudOpacity')}")
    if visual.get("worldSwitchOpacity") not in ("0", "0.0"):
        failures.append(f"compact summary season switch should be hidden, opacity={visual.get('worldSwitchOpacity')}")
    if int(visual.get("treeCount") or 0) < 2:
        failures.append(f"expected original-resource foreground trees, got {visual.get('treeCount')}")
    if int(visual.get("rootCount") or 0) < 2:
        failures.append(f"expected tree root overlays, got {visual.get('rootCount')}")
    if int(visual.get("looseGrassCount") or 0) < 34:
        failures.append(f"loose grass sprite layer is missing or too sparse: {visual.get('looseGrassCount')}")
    if int(visual.get("grassTileCount") or 0) != 0:
        failures.append(f"square grass tile accents returned: {visual.get('grassTileCount')}")
    if int(visual.get("purpleGrassFrameCount") or 0) != 0:
        failures.append(f"purple grass sprite frames returned: {visual.get('purpleGrassFrameCount')}")
    if int(visual.get("suspiciousStumpTiles") or 0) != 0:
        failures.append(f"stump-like foreground tiles returned: {visual.get('suspiciousStumpTiles')}")
    for label, rects in (("tree", visual.get("treeRects") or []), ("root", visual.get("rootRects") or [])):
        for rect in rects:
            bottom = int(rect.get("bottom") or 0)
            if bottom < 0 or bottom > 12:
                failures.append(f"{label} is not grounded on grass: {rect}")

    filtered_errors = [
        (kind, text) for kind, text in errors
        if not any(needle in text for needle in [
            "favicon",
            "Failed to decode",
            "The AudioContext was not allowed to start",
        ])
    ]
    if filtered_errors:
        failures.append(f"browser errors: {filtered_errors}")

    output = {
        "ok": not failures,
        "site": f"http://127.0.0.1:{site_port}/",
        "state": state,
        "errors": filtered_errors,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit("\n".join(failures))


asyncio.run(main())
