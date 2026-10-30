"""WebKit (closest to iOS Safari on Windows) check for the chunked HTTPS loader.

Run: $env:HTTPS_URL='https://...'; python qa/run-https-webkit.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

base = os.environ.get("HTTPS_URL", "").rstrip("/")
if not base.startswith("https://"):
    raise SystemExit("HTTPS_URL must be https://")
OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(parents=True, exist_ok=True)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

with sync_playwright() as p:
    browser = p.webkit.launch()
    context = browser.new_context(**p.devices["iPhone 13"], locale="zh-CN", ignore_https_errors=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{base}/play", wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_function("() => Boolean(window.__poker)", timeout=120000)
        loaded = True
    except Exception:
        loaded = False
    info = page.evaluate("""() => ({
        title: document.title,
        url: location.href,
        secure: window.isSecureContext,
        protocol: location.protocol,
        poker: Boolean(window.__poker),
        stage: window.__loaderStage || '',
        loaderError: window.__loaderError || '',
        mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
        body: (document.body?.innerText || '').slice(0, 160),
    })""")
    print(json.dumps(info, ensure_ascii=False, indent=2))
    print("errors", errors[:5])
    page.screenshot(path=str(OUT / "https-webkit-loader.png"))
    if not loaded or not info["secure"]:
        raise SystemExit(1)
    print("WEBKIT_HTTPS_OK")
    browser.close()
