"""Probe via Chrome DevTools — read text content of #adv-sheet-rows + #radar-summary."""
import asyncio, json, os, socket, subprocess, sys, time, urllib.request, websockets

PORT = int(os.environ.get("DEVPORT", "9233"))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/?demo&card=7"
SEL = sys.argv[2] if len(sys.argv) > 2 else "#adv-sheet-rows"


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

        await call("Page.navigate", {"url": URL})
        await asyncio.sleep(4)
        # Capture multiple things at once. Use try/catch + returnByValue.
        expr = """
        (() => {
          try {
            const visibleCount = document.querySelectorAll('.card:not([style*="display: none"])').length;
            return JSON.stringify({
              ok: true,
              cardsHTMLCount: document.querySelectorAll('.card').length,
              visibleCount,
              activeCardDataIdx: document.querySelector('.card.active')?.dataset?.idx,
              activeCardClass: document.querySelector('.card.active')?.className,
              activeCardInnerHTMLstart: document.querySelector('.card.active .card-inner')?.outerHTML?.slice(0, 600),
              advRowsCount: document.querySelectorAll('#adv-sheet-rows .adv-stat-row').length,
              advRowsHTMLPreview: document.getElementById('adv-sheet-rows')?.innerHTML?.slice(0, 600),
              radarPoly: document.getElementById('radar-poly')?.getAttribute('points'),
              radarRingsCount: document.getElementById('radar-rings')?.children?.length,
              radarLabelsCount: document.getElementById('radar-labels')?.children?.length,
              radarTotal: document.getElementById('radar-total')?.textContent,
            });
          } catch (e) {
            return JSON.stringify({ ok: false, error: String(e) });
          }
        })()
        """
        await call("Runtime.enable")
        result = await call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": False})
        print(json.dumps(result, indent=2)[:4000])


asyncio.run(probe())
