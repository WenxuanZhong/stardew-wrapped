"""Get bounding rects of adv-stat-row and stamp + scroll container, plus viewport size."""
import asyncio, json, os, sys, urllib.request, websockets

PORT = int(os.environ.get("DEVPORT", "9233"))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/?demo&card=7"
W, H = (sys.argv[2] if len(sys.argv) > 2 else "600x900").split("x")


async def probe():
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

        await call("Emulation.setDeviceMetricsOverride",
                   {"width": int(W), "height": int(H), "deviceScaleFactor": 1, "mobile": False})
        await call("Page.navigate", {"url": URL})
        await asyncio.sleep(3.5)
        expr = """
        (() => {
          const card = document.querySelector('.card.active');
          const scroll = card.querySelector('.adv-sheet-scroll');
          const rows = [...card.querySelectorAll('.adv-stat-row')];
          const stamp = card.querySelector('.adv-sheet-stamp');
          const inner = card.querySelector('.card-inner');
          const r = el => el ? (() => { const b = el.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height, bot: b.bottom}; })() : null;
          return JSON.stringify({
            viewport: { w: window.innerWidth, h: window.innerHeight },
            inner: r(inner),
            innerMaxH: getComputedStyle(inner).maxHeight,
            innerActualH: inner.offsetHeight,
            innerScrollH: inner.scrollHeight,
            innerOverflow: getComputedStyle(inner).overflow,
            scroll: r(scroll),
            stamp: r(stamp),
            stampDisplay: stamp ? getComputedStyle(stamp).display : null,
            rowCount: rows.length,
            rows: rows.map(x => ({label: x.querySelector('.adv-stat-label')?.textContent, ...r(x)})),
          });
        })()
        """
        await call("Runtime.enable")
        result = await call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": False})
        print(result.get("result", {}).get("value", result))


asyncio.run(probe())
