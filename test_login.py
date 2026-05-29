"""Test login with correct credentials and capture API errors"""
from playwright.sync_api import sync_playwright

URL = "http://177.93.157.113"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Capture console messages
    page.on("console", lambda msg: print(f"  [CONSOLE {msg.type}] {msg.text}"))
    page.on("response", lambda resp: print(f"  [RESP {resp.status}] {resp.url}"))
    page.on("requestfailed", lambda req: print(f"  [REQ FAIL] {req.url}: {req.failure}"))

    page.goto(f"{URL}/login", wait_until="networkidle")

    # Fill credentials
    page.fill('input[type="email"]', "admin@acs.local")
    page.fill('input[type="password"]', "admin123")

    # Click Sign In
    page.click("button:has-text('Sign In')")

    # Wait for navigation/response
    page.wait_for_timeout(5000)

    page.screenshot(path="login_result.png", full_page=True)
    print(f"\nFinal URL: {page.url}")

    # If still on login, show error text
    if "login" in page.url.lower():
        body = page.inner_text("body")
        print(f"\nPage body:\n{body[:1000]}")

    browser.close()
