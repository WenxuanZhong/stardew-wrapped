"""Take screenshots of the running site using local Chrome via DevTools Protocol."""

import asyncio, base64, json, os, socket, subprocess, sys, time, urllib.request, websockets

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = int(os.environ.get("DEVPORT", "9233"))
TARGET = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
OUT = sys.argv[2] if len(sys.argv) > 2 else "C:/Users/zhong/Desktop/stardew-wrapped/.tools/snap.png"
WIDTH = int(os.environ.get("WIDTH", "1280"))
HEIGHT = int(os.environ.get("HEIGHT", "800"))


def free_port_busy(p):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", p)); s.close(); return False
    except OSError:
        return True


async def grab():
    if not free_port_busy(PORT):
        os.makedirs(r"C:\Users\zhong\Desktop\stardew-wrapped\.tools\chrome-profile", exist_ok=True)
        subprocess.Popen([
            CHROME,
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir=C:/Users/zhong/Desktop/stardew-wrapped/.tools/chrome-profile",
            "--headless=new",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            f"--window-size={WIDTH},{HEIGHT}",
            "about:blank",
        ], creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | 0x08000000)
        for _ in range(80):
            time.sleep(0.25)
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1).read(); break
            except Exception:
                pass
        else:
            print("ERROR: Chrome devtools never came up", file=sys.stderr)
            sys.exit(1)

    targets = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=2).read())
    page = next(t for t in targets if t["type"] == "page")
    ws = page["webSocketDebuggerUrl"]
    nid = 0
    async with websockets.connect(ws, max_size=64 * 1024 * 1024) as sock:
        async def call(method, params=None):
            nonlocal nid
            nid += 1
            await sock.send(json.dumps({"id": nid, "method": method, "params": params or {}}))
            while True:
                msg = json.loads(await sock.recv())
                if msg.get("id") == nid:
                    return msg.get("result", {})

        await call("Emulation.setDeviceMetricsOverride", {"width": WIDTH, "height": HEIGHT, "deviceScaleFactor": 1, "mobile": False})
        await call("Page.navigate", {"url": TARGET})
        # wait for load
        await asyncio.sleep(float(os.environ.get("WAIT", "2.2")))
        result = await call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        data = base64.b64decode(result["data"])
        with open(OUT, "wb") as f:
            f.write(data)
        print(f"saved {OUT} ({len(data)} bytes)")


asyncio.run(grab())
