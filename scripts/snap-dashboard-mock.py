"""Snapshot the new dashboard by mocking /auth/me with a fake user.
The dashboard route requires auth; we intercept the /auth/me fetch
and return a fake user so the React app renders DashboardLayout +
DashboardPage. We don't hit any other API, so the dashboard will
show the empty state with the 'Create new project' card.
"""
import asyncio
import os
from playwright.async_api import async_playwright

OUT = r"C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs"
BASE = "http://127.0.0.1:5174"

FAKE_USER = {
    "id": "u_mock",
    "username": "naitikgupta",
    "displayName": "Naitik Gupta",
    "avatarUrl": "https://avatars.githubusercontent.com/u/0",
    "email": "naitik@example.com",
}


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)

        # Intercept /auth/me BEFORE the page scripts run
        async def fulfill_auth_me(route):
            await route.fulfill(status=200, content_type="application/json", body=str(FAKE_USER).replace("'", '"'))

        await ctx.route("**/auth/me", fulfill_auth_me)
        # Stub other API calls so the dashboard doesn't show loading spinners
        await ctx.route("**/api/projects", lambda r: r.fulfill(status=200, content_type="application/json", body="[]"))

        page = await ctx.new_page()
        await page.goto(BASE + "/dashboard", wait_until="domcontentloaded", timeout=15000)
        await asyncio.sleep(2)

        # If we're still on landing (because /dashboard redirected), go back
        if "/dashboard" not in page.url:
            print(f"redirected to: {page.url}")
            # Force the dashboard path by setting window.location
            await page.evaluate("window.history.pushState({}, '', '/dashboard')")
            await asyncio.sleep(1)

        await page.screenshot(path=os.path.join(OUT, "dashboard-snap-4-dashboard.png"), full_page=False)
        print("wrote dashboard-snap-4-dashboard.png")

        await browser.close()


asyncio.run(main())