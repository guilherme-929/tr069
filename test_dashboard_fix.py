"""Test updated dashboard with real API data"""
from playwright.sync_api import sync_playwright

URL = "http://177.93.157.113"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    page.on("console", lambda msg: print(f"  [CONSOLE {msg.type}] {msg.text}"))
    page.on("response", lambda resp: print(f"  [RESP {resp.status}] {resp.url}"))

    # Login
    page.goto(f"{URL}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "admin@acs.local")
    page.fill('input[type="password"]', "admin123")
    page.click("button:has-text('Sign In')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    page.screenshot(path="dashboard_real.png", full_page=True)
    print(f"\n=== DASHBOARD URL: {page.url} ===")
    body = page.inner_text("body")
    print(body[:2500])

    # Test devices page
    page.goto(f"{URL}/devices", wait_until="networkidle")
    page.wait_for_timeout(2000)
    print(f"\n=== DEVICES ===")
    print(page.inner_text("body")[:1500])

    browser.close()
