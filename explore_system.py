"""Explore dashboard and logs after CPE connected"""
from playwright.sync_api import sync_playwright

URL = "http://177.93.157.113"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()

    page.on("console", lambda msg: print(f"  [CONSOLE {msg.type}] {msg.text}"))
    page.on("response", lambda resp: print(f"  [RESP {resp.status}] {resp.url}"))
    page.on("requestfailed", lambda req: print(f"  [REQ FAIL] {req.url}: {req.failure}"))

    # Login
    page.goto(f"{URL}/login", wait_until="networkidle")
    page.fill('input[type="email"]', "admin@acs.local")
    page.fill('input[type="password"]', "admin123")
    page.click("button:has-text('Sign In')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # Screenshot dashboard
    page.screenshot(path="dashboard.png", full_page=True)
    title = page.title()
    print(f"\n=== DASHBOARD (title: {title}) ===")
    print(f"URL: {page.url}")
    # Get dashboard text content
    body = page.inner_text("body")
    print(f"\nBody text:\n{body[:2000]}")

    # Navigate to /devices
    print("\n\n=== NAVIGATING TO /devices ===")
    page.goto(f"{URL}/devices", wait_until="networkidle")
    page.wait_for_timeout(2000)
    page.screenshot(path="devices.png", full_page=True)
    devices_text = page.inner_text("body")
    print(f"Devices page:\n{devices_text[:2000]}")

    # Navigate to /logs
    print("\n\n=== NAVIGATING TO /logs ===")
    page.goto(f"{URL}/logs", wait_until="networkidle")
    page.wait_for_timeout(3000)
    page.screenshot(path="logs.png", full_page=True)
    logs_text = page.inner_text("body")
    print(f"Logs page:\n{logs_text[:2000]}")

    # Also check /models
    print("\n\n=== NAVIGATING TO /models ===")
    page.goto(f"{URL}/models", wait_until="networkidle")
    page.wait_for_timeout(2000)
    page.screenshot(path="models.png", full_page=True)
    models_text = page.inner_text("body")
    print(f"Models page:\n{models_text[:2000]}")

    browser.close()
    print("\nDone!")
