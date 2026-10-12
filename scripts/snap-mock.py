"""Snapshot the static mock of the new dashboard layout (no auth required)."""
import asyncio
import os
from playwright.async_api import async_playwright

OUT = r"C:\Users\naiti\Desktop\MINIMAX\MiniMax_Projects\deplox\.runlogs"
MOCK = "file:///" + os.path.join(OUT, "dashboard-mock.html").replace("\\", "/")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = await ctx.new_page()
        await page.goto(MOCK, wait_until="domcontentloaded", timeout=10000)
        await asyncio.sleep(1)
        await page.screenshot(path=os.path.join(OUT, "dashboard-snap-5-mock.png"), full_page=False)
        print("wrote dashboard-snap-5-mock.png")
        await browser.close()


asyncio.run(main())