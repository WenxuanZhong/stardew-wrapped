"""Dump body classes + computed background of key elements after page load."""

import asyncio, json, os, socket, subprocess, sys, time, urllib.request, websockets

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = int(os.environ.get("DEVPORT", "9233"))
TARGET = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
WAIT = float(os.environ.get("WAIT", "2.5"))


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
                          "--no-default-browser-check", "--window-size=1280,800", "about:blank"],
                         creationflags=0x08000000)
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
                if msg.get("method") == "Runtime.consoleAPICalled":
                    pass

        await call("Runtime.enable")
        await call("Page.navigate", {"url": TARGET})
        await asyncio.sleep(WAIT)
        expr = """
        (() => {
            const out = { bodyClass: document.body.className,
                          dataSeason: document.body.dataset.season,
                          fileInputExists: !!document.getElementById('file-input'),
                          titleScene: !!document.querySelector('.title-scene'),
                          treeImg: getComputedStyle(document.querySelector('.title-scene .title-tree')).backgroundImage,
                          audioToggle: !!document.getElementById('audio-toggle'),
                          landingDisplay: getComputedStyle(document.getElementById('landing')).display,
                          cardsDisplay: getComputedStyle(document.getElementById('cards')).display,
                          windowH: innerHeight, windowW: innerWidth };
            return JSON.stringify(out);
        })()
        """
        r = await call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        print(json.dumps(r))

asyncio.run(main())
