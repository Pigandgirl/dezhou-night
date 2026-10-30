"""iOS Safari engine smoke test with Playwright WebKit + iPhone 13 profile.

Playwright's WebKit is not Mobile Safari, but it is the closest engine available
on Windows: it validates the install sheet, manifest metadata, and layout.
Run: python qa/run-ios-webkit.py
"""
from __future__ import annotations

import json
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "qa" / "out"
OUT.mkdir(parents=True, exist_ok=True)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def start_server() -> tuple[subprocess.Popen, int, Path]:
    tmp = Path(tempfile.mkdtemp(prefix="dz-webkit-"))
    shutil.copytree(ROOT / "server", tmp / "server")
    (tmp / "server" / "data").mkdir(parents=True, exist_ok=True)
    (tmp / "server" / "data" / "store.json").write_text(json.dumps({
        "users": [], "codes": [], "history": [],
        "meta": {"currentDay": time.strftime("%Y-%m-%d"), "lastHonor": None},
    }), encoding="utf-8")
    port = free_port()
    env = {
        **dict(__import__("os").environ),
        "PORT": str(port),
        "ADMIN_USER": "admin",
        "ADMIN_PASSWORD": "test-pass-123",
    }
    proc = subprocess.Popen(["node", "server.js"], cwd=tmp / "server", env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 20
    import urllib.request
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as res:
                if res.status == 200:
                    return proc, port, tmp
        except Exception:
            time.sleep(0.2)
    proc.kill()
    raise SystemExit("server did not start")


def main() -> int:
    proc, port, tmp = start_server()
    results = []

    def check(name: str, ok: bool, detail: object = "") -> None:
        results.append({"id": name, "ok": bool(ok), "detail": str(detail)})
        print(f"{'PASS' if ok else 'FAIL'} {name} {detail}")
        if not ok:
            raise RuntimeError(name)

    try:
        with sync_playwright() as p:
            browser = p.webkit.launch()
            context = browser.new_context(**p.devices["iPhone 13"], locale="zh-CN")
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda err: errors.append(str(err)))
            page.goto(f"http://127.0.0.1:{port}/play", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_function("() => Boolean(window.__DZ_IOS_INSTALL__)", timeout=20000)
            page.wait_for_selector("#iosInstallSheet:not(.hidden)", timeout=12000)
            page.wait_for_timeout(700)

            env = page.evaluate("""() => ({
                ua: navigator.userAgent,
                ios: window.__DZ_IOS_INSTALL__.isIOS,
                safari: window.__DZ_IOS_INSTALL__.isSafari,
                standalone: window.__DZ_IOS_INSTALL__.standalone,
                secure: window.isSecureContext,
                title: document.getElementById('iosInstallTitle').textContent,
                steps: [...document.querySelectorAll('#iosInstallSteps li')].length,
                sheet: (() => { const r = document.querySelector('.ios-install-panel').getBoundingClientRect();
                    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
                viewport: { w: innerWidth, h: innerHeight },
            })""")
            print("webkit", json.dumps(env, ensure_ascii=False))
            check("W1 iOS Safari detected", env["ios"] and env["safari"] and not env["standalone"], env["ua"])
            check("W2 install sheet", "装到桌面" in env["title"] and env["steps"] == 3, env["title"])
            check("W3 sheet fits", env["sheet"]["y"] >= 0 and env["sheet"]["y"] + env["sheet"]["h"] <= env["viewport"]["h"] + 1, env["sheet"])
            page.screenshot(path=str(OUT / "ios-webkit-sheet.png"))

            scope = page.evaluate("""async () => {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    return { scope: reg.scope, active: Boolean(reg.active) };
                } catch (e) { return { error: String(e) }; }
            }""")
            print("webkit sw", scope)
            check("W4 service worker", scope.get("active") is True and scope.get("scope", "").endswith("/play"), scope)
            check("W5 no page errors", not errors, errors[:3])

            # Standalone mode via the Safari-only navigator.standalone flag.
            context2 = browser.new_context(**p.devices["iPhone 13"], locale="zh-CN")
            page2 = context2.new_page()
            page2.add_init_script("Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });")
            page2.goto(f"http://127.0.0.1:{port}/play", wait_until="domcontentloaded", timeout=30000)
            page2.wait_for_function("() => Boolean(window.__DZ_IOS_INSTALL__)", timeout=20000)
            page2.wait_for_timeout(1200)
            standalone = page2.evaluate("""() => ({
                standalone: window.__DZ_IOS_INSTALL__.standalone,
                cls: document.documentElement.className,
                sheet: Boolean(document.getElementById('iosInstallSheet')),
                entryHidden: document.getElementById('btnInstallApp')?.classList.contains('hidden'),
            })""")
            print("webkit standalone", standalone)
            check("W6 standalone mode", standalone["standalone"] and "ios-standalone" in standalone["cls"], standalone)
            check("W7 no sheet in standalone", not standalone["sheet"] and standalone["entryHidden"], standalone)

            browser.close()
    finally:
        proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    (OUT / "ios-webkit-results.json").write_text(json.dumps({
        "when": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "results": results,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{sum(1 for r in results if r['ok'])}/{len(results)} checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
