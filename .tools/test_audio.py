"""Probe whether a wav file plays in the headless Chrome we already have running."""

import asyncio, json, os, socket, subprocess, sys, time, urllib.request, websockets

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = int(os.environ.get("DEVPORT", "9233"))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/assets/audio_test.wav"


def busy(p):
    s = socket.socket()
    try: s.bind(("127.0.0.1", p)); s.close(); return False
    except OSError: return True


async def main():
    if not busy(PORT):
        os.makedirs(r"C:\Users\zhong\Desktop\stardew-wrapped\.tools\chrome-profile", exist_ok=True)
        subprocess.Popen([CHROME, f"--remote-debugging-port={PORT}",
                          "--user-data-dir=C:/Users/zhong/Desktop/stardew-wrapped/.tools/chrome-profile",
                          "--headless=new", "--hide-scrollbars", "--no-first-run",
                          "--no-default-browser-check",
                          "--autoplay-policy=no-user-gesture-required",
                          "--window-size=1280,800", "about:blank"], creationflags=0x08000000)
        for _ in range(80):
            time.sleep(0.25)
            try: urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1).read(); break
            except Exception: pass

    targets = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=2).read())
    page = next(t for t in targets if t["type"] == "page")
    nid = 0
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024) as sock:
        async def call(method, params=None):
            nonlocal nid; nid += 1
            await sock.send(json.dumps({"id": nid, "method": method, "params": params or {}}))
            while True:
                msg = json.loads(await sock.recv())
                if msg.get("id") == nid: return msg.get("result", {})

        await call("Runtime.enable")
        await call("Page.navigate", {"url": "http://127.0.0.1:8765/"})
        await asyncio.sleep(3.5)
        expr = f"""
        (async () => {{
            const url = {json.dumps(URL)};
            try {{
                const r = await fetch(url, {{ method: 'HEAD' }});
                if (!r.ok) return JSON.stringify({{ ok: false, status: r.status }});
            }} catch (e) {{ return JSON.stringify({{ ok: false, fetchErr: e.message }}); }}
            return new Promise(resolve => {{
                const a = new Audio(url);
                a.preload = 'auto';
                const t = setTimeout(() => resolve(JSON.stringify({{
                    ok: false, reason: 'timeout',
                    readyState: a.readyState,
                    networkState: a.networkState,
                    err: a.error ? a.error.code : null,
                    msg: a.error ? a.error.message : null
                }})), 12000);
                a.addEventListener('canplaythrough', () => {{
                    clearTimeout(t);
                    resolve(JSON.stringify({{ ok: true, duration: a.duration }}));
                }});
                a.addEventListener('loadedmetadata', () => {{
                    /* surface duration even before canplaythrough */
                }});
                a.addEventListener('error', () => {{
                    clearTimeout(t);
                    resolve(JSON.stringify({{ ok: false, reason: 'error', err: a.error ? a.error.code : null, msg: a.error ? a.error.message : null }}));
                }});
                a.load();
            }});
        }})()
        """
        r = await call("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
        print(r.get("result", {}).get("value", json.dumps(r)))

asyncio.run(main())
