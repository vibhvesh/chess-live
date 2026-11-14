#!/usr/bin/env python3
"""Two-browser Sanket PTT check on Chess Live (presence + floor + audio).

Usage:
  E2E_BASE=https://vibhvesh.github.io/chess-live/ python3 scripts/test-ptt-e2e.py
"""

from __future__ import annotations

import os
import sys
import time
import uuid

from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_BASE", "https://vibhvesh.github.io/chess-live/").rstrip("/") + "/"
CHANNEL = os.environ.get("E2E_PTT_CHANNEL", "chess")
TIMEOUT = 40_000


def launch_browser(pw):
    chrome = os.environ.get("E2E_CHROME", "/usr/bin/google-chrome")
    opts = {
        "headless": True,
        "args": [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
        ],
    }
    if chrome and os.path.exists(chrome):
        opts["executable_path"] = chrome
    return pw.chromium.launch(**opts)


def new_page(browser):
    ctx = browser.new_context(viewport={"width": 1100, "height": 900})
    ctx.grant_permissions(["microphone"])
    page = ctx.new_page()
    return ctx, page


def connect(page, name: str):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="ptt-panel"]', timeout=20_000)
    page.locator('[data-testid="ptt-channel"]').fill(CHANNEL)
    page.locator('[data-testid="ptt-name"]').fill(name)
    page.locator('[data-testid="ptt-connect"]').click()
    page.wait_for_function(
        "() => document.querySelector('[data-testid=ptt-button]')",
        timeout=TIMEOUT,
    )


def online_text(page) -> str:
    loc = page.locator('[data-testid="ptt-online"]')
    return loc.inner_text() if loc.count() else ""


def wait_for_names(page, names, label):
    deadline = time.time() + TIMEOUT / 1000
    last = ""
    while time.time() < deadline:
        last = online_text(page)
        if all(n.lower() in last.lower() for n in names):
            return last
        # also accept the name in the whole panel (you vs peers)
        panel = page.locator('[data-testid="ptt-panel"]').inner_text()
        last = panel
        if all(n.lower() in panel.lower() for n in names):
            return panel
        page.wait_for_timeout(300)
    raise AssertionError(f"{label}: presence did not show {names!r}. Last UI:\n{last}")


def hook_frames(page):
    return page.evaluate("() => (window.__chessPtt && window.__chessPtt.framesRecv) || 0")


def run():
    print(f"PTT e2e against {BASE} channel={CHANNEL}")
    suffix = uuid.uuid4().hex[:6]
    name_a = f"e2ea{suffix}"
    name_b = f"e2eb{suffix}"
    with sync_playwright() as pw:
        browser = launch_browser(pw)
        ctx_a, page_a = new_page(browser)
        ctx_b, page_b = new_page(browser)
        try:
            connect(page_a, name_a)
            connect(page_b, name_b)
            # Each client lists the other under online (self is labelled "(you)").
            wait_for_names(page_a, [name_b], "A sees B")
            wait_for_names(page_b, [name_a], "B sees A")
            print(f"  ok  presence: both {name_a} and {name_b} visible on '{CHANNEL}'")

            before = hook_frames(page_b)
            btn = page_a.locator('[data-testid="ptt-button"]')
            started = page_a.evaluate("async () => window.__chessPtt && window.__chessPtt.startTalk && window.__chessPtt.startTalk()")
            if started is False:
                box = btn.bounding_box()
                page_a.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                page_a.mouse.down()
            # Hold long enough for a floor claim + ~1024-sample frames (~85ms each).
            page_a.wait_for_timeout(2000)
            floor_b = page_b.locator('[data-testid="ptt-floor"]').inner_text()
            floor_a = page_a.locator('[data-testid="ptt-floor"]').inner_text()
            if name_a.lower() not in floor_a.lower() and "you" not in floor_a.lower():
                raise AssertionError(f"A did not hold the floor (A floor={floor_a!r})")
            if name_a.lower() not in floor_b.lower():
                raise AssertionError(f"B did not see A's floor claim (B floor={floor_b!r})")
            print(f"  ok  floor claim: B sees {floor_b!r}")

            deadline = time.time() + 8
            recv = before
            while time.time() < deadline:
                recv = hook_frames(page_b)
                if recv > before:
                    break
                page_b.wait_for_timeout(200)
            page_a.evaluate("() => window.__chessPtt && window.__chessPtt.stopTalk && window.__chessPtt.stopTalk()")
            try:
                page_a.mouse.up()
            except Exception:
                pass
            if recv <= before:
                # one more moment for in-flight frames after release
                page_b.wait_for_timeout(500)
                recv = hook_frames(page_b)
            if recv <= before:
                raise AssertionError(
                    f"B received no audio frames while A held PTT (before={before}, after={recv})"
                )
            print(f"  ok  audio frames received on '{CHANNEL}' ({recv - before} frames)")
        finally:
            ctx_a.close()
            ctx_b.close()
            browser.close()
    print("\nPTT e2e passed")


if __name__ == "__main__":
    try:
        run()
    except Exception as err:
        print(f"FAIL: {err}")
        sys.exit(1)
