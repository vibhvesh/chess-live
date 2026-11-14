#!/usr/bin/env python3
"""Headless check that Stockfish loads and moves under the app base path.

Usage:
  E2E_BASE=https://vibhvesh.github.io/chess-live/ python3 scripts/test-engine-e2e.py
  E2E_BASE=http://127.0.0.1:4173/chess-live/ python3 scripts/test-engine-e2e.py
"""

from __future__ import annotations

import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

BASE = os.environ.get("E2E_BASE", "https://vibhvesh.github.io/chess-live/").rstrip("/") + "/"
ENGINE_TIMEOUT_MS = 45_000

# Console noise we ignore (fonts, extensions, third-party).
IGNORE_CONSOLE = (
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "Download the React DevTools",
)


def is_relevant_error(text: str) -> bool:
    lower = text.lower()
    if any(s in lower for s in IGNORE_CONSOLE):
        return False
    return True


def collect_page_errors(page):
    errors: list[str] = []

    def on_console(msg):
        if msg.type == "error":
            text = msg.text
            if is_relevant_error(text):
                errors.append(f"console.error: {text}")

    def on_pageerror(err):
        errors.append(f"pageerror: {err}")

    def on_request_failed(req):
        url = req.url
        if "stockfish" in url or "/engine/" in url:
            errors.append(f"request failed: {url} ({req.failure})")

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("requestfailed", on_request_failed)
    return errors


def assert_no_engine_error(page, errors):
    visible = page.locator(".error-text")
    if visible.count() and visible.first.is_visible():
        text = visible.first.inner_text()
        raise AssertionError(f"UI engine error: {text}")
    nasty = [
        e
        for e in errors
        if "invalid base url" in e.lower()
        or "failed to construct 'url'" in e.lower()
        or "stockfish" in e.lower()
        or "engine:" in e.lower()
    ]
    if nasty:
        raise AssertionError("Engine-related errors:\n  " + "\n  ".join(nasty))


def start_computer_game(page, color: str, level: str = "1"):
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("text=Play vs Computer")
    page.locator("select").nth(0).select_option(color)
    page.locator("select").nth(1).select_option(level)
    page.get_by_role("button", name="Start game").click()
    page.wait_for_url("**/#/c/**", timeout=10_000)
    page.wait_for_selector(".board-wrap")


def move_count(page) -> int:
    return page.locator("button.san").count()


def wait_for_engine_move(page, errors, before: int, label: str):
    deadline = time.time() + ENGINE_TIMEOUT_MS / 1000
    last = ""
    while time.time() < deadline:
        assert_no_engine_error(page, errors)
        turn = ""
        if page.locator(".turn-line").count():
            turn = page.locator(".turn-line").inner_text()
            last = turn
        count = move_count(page)
        if count > before and "Computer is thinking" not in turn:
            # After Black's opening wait, "Your move" appears.
            return count
        page.wait_for_timeout(250)
    raise AssertionError(
        f"{label}: engine did not move in time (moves={move_count(page)}, last status={last!r}, errors={errors})"
    )


def click_square(page, square: str):
    loc = page.locator(f'[data-square="{square}"]')
    loc.first.click()


def run() -> None:
    print(f"E2E against {BASE}")
    with sync_playwright() as pw:
        chrome = os.environ.get("E2E_CHROME", "/usr/bin/google-chrome")
        launch_opts = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if chrome and os.path.exists(chrome):
            launch_opts["executable_path"] = chrome
        browser = pw.chromium.launch(**launch_opts)
        failed = []

        # --- Play vs Computer as Black (engine must move first) ---
        try:
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            errors = collect_page_errors(page)
            start_computer_game(page, "b", "1")
            wait_for_engine_move(page, errors, 0, "as Black")
            turn = page.locator(".turn-line").inner_text()
            if "Your move" not in turn and "Computer is thinking" in turn:
                raise AssertionError(f"as Black: stuck thinking: {turn}")
            assert_no_engine_error(page, errors)
            leftover = [e for e in errors if is_relevant_error(e)]
            if leftover:
                raise AssertionError("console errors as Black:\n  " + "\n  ".join(leftover))
            print(f"  ok  Play vs Computer as Black — engine moved ({move_count(page)} ply), no console errors")
            context.close()
        except Exception as err:
            failed.append(("as Black", err))
            print(f"  FAIL as Black: {err}")
            try:
                context.close()
            except Exception:
                pass

        # --- Play vs Computer as White, then review ---
        try:
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page = context.new_page()
            errors = collect_page_errors(page)
            start_computer_game(page, "w", "1")
            page.wait_for_selector(".turn-line", timeout=10_000)
            # Human to move first.
            deadline = time.time() + 15
            while time.time() < deadline:
                assert_no_engine_error(page, errors)
                text = page.locator(".turn-line").inner_text()
                if "Your move" in text:
                    break
                page.wait_for_timeout(200)
            else:
                raise AssertionError(
                    f"as White: never got 'Your move' (status={page.locator('.turn-line').inner_text()!r}, errors={errors})"
                )

            before = move_count(page)
            click_square(page, "e2")
            click_square(page, "e4")
            # Human ply should appear quickly; then the engine replies.
            page.wait_for_function("() => document.querySelectorAll('button.san').length >= 1", timeout=8_000)
            wait_for_engine_move(page, errors, max(before, 1), "as White")
            if move_count(page) < 2:
                raise AssertionError("as White: expected at least two plies after the engine reply")
            assert_no_engine_error(page, errors)
            leftover = [e for e in errors if is_relevant_error(e)]
            if leftover:
                raise AssertionError("console errors as White:\n  " + "\n  ".join(leftover))
            print(f"  ok  Play vs Computer as White — engine replied ({move_count(page)} ply), no console errors")

            # Finish and open review, then run Stockfish analysis once.
            page.get_by_role("button", name="Resign").click()
            page.get_by_role("button", name="Review").first.click()
            page.wait_for_url("**/#/r/**", timeout=10_000)
            page.get_by_role("button", name="Analyze with Stockfish").click()
            # Wait until analysis finished (Accuracy) or a visible engine error.
            try:
                page.wait_for_selector(".review-stats, .summary", timeout=ENGINE_TIMEOUT_MS)
            except PlaywrightTimeout:
                assert_no_engine_error(page, errors)
                raise AssertionError(
                    f"review analysis did not finish (errors={errors}, body excerpt={page.locator('.panel').nth(0).inner_text()[:400]!r})"
                )
            assert_no_engine_error(page, errors)
            leftover = [e for e in errors if is_relevant_error(e)]
            if leftover:
                raise AssertionError("console errors during review:\n  " + "\n  ".join(leftover))
            stats = page.locator(".review-stats").inner_text() if page.locator(".review-stats").count() else ""
            print(f"  ok  Review analysis finished ({stats.replace(chr(10), ' ')[:120]})")
            context.close()
        except Exception as err:
            failed.append(("as White / review", err))
            print(f"  FAIL as White / review: {err}")
            try:
                context.close()
            except Exception:
                pass

        browser.close()

    if failed:
        print(f"\n{len(failed)} e2e check(s) failed")
        sys.exit(1)
    print("\nAll e2e engine checks passed")


if __name__ == "__main__":
    run()
