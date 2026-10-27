"""
browser_manager.py
~~~~~~~~~~~~~~~~~~
Manages the Playwright asynchronous browser lifecycle, persistent Chromium
user profile directory, storage_state.json synchronization, and the interactive
first-time Google SSO authentication workflow for Google AI Studio.
"""

import argparse
import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from playwright.async_api import (
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

logger = logging.getLogger("aistudio_bridge.browser")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

AI_STUDIO_BASE_URL = "https://aistudio.google.com/app/prompts/new_chat"
DEFAULT_USER_DATA_DIR = Path("./aistudio_user_data").resolve()
DEFAULT_STORAGE_STATE_PATH = Path("./storage_state.json").resolve()


class BrowserManager:
    """
    Lifecycle manager for a persistent Chromium context tailored for Google AI Studio.
    Uses `launch_persistent_context` so Google SSO cookies, IndexedDB tokens,
    and 2FA trust state persist across runs.
    """

    def __init__(
        self,
        user_data_dir: Path = DEFAULT_USER_DATA_DIR,
        storage_state_path: Path = DEFAULT_STORAGE_STATE_PATH,
        headless: bool = True,
        slow_mo: int = 0,
        viewport_width: int = 1440,
        viewport_height: int = 900,
    ) -> None:
        self.user_data_dir = Path(user_data_dir).resolve()
        self.storage_state_path = Path(storage_state_path).resolve()
        self.headless = headless
        self.slow_mo = slow_mo
        self.viewport = {"width": viewport_width, "height": viewport_height}

        self._playwright: Optional[Playwright] = None
        self._context: Optional[BrowserContext] = None
        self._lock = asyncio.Lock()

    def has_saved_session(self) -> bool:
        """
        Checks whether storage_state.json exists and contains Google auth cookies.
        """
        if not self.storage_state_path.exists():
            return False
        try:
            data = json.loads(self.storage_state_path.read_text(encoding="utf-8"))
            cookies = data.get("cookies", [])
            return any(
                c.get("name") in {"SID", "__Secure-1PSID", "__Secure-3PSID"}
                for c in cookies
            )
        except Exception as exc:
            logger.warning("Failed to inspect storage_state.json: %s", exc)
            return False

    async def start(self, force_headed: bool = False) -> BrowserContext:
        """
        Starts Playwright and launches the persistent Chromium browser context.
        If `force_headed` is True or no valid session exists yet, launches in
        non-headless mode to permit manual Google SSO completion.
        """
        async with self._lock:
            if self._context is not None:
                return self._context

            self.user_data_dir.mkdir(parents=True, exist_ok=True)
            effective_headless = False if force_headed else self.headless

            if effective_headless and not self.has_saved_session():
                logger.warning(
                    "No verified storage_state.json found at %s. "
                    "Switching to non-headless mode for initial Google login.",
                    self.storage_state_path,
                )
                effective_headless = False

            self._playwright = await async_playwright().start()

            chromium_args = [
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-infobars",
            ]

            logger.info(
                "Launching persistent browser context (headless=%s, profile=%s)",
                effective_headless,
                self.user_data_dir,
            )

            self._context = await self._playwright.chromium.launch_persistent_context(
                user_data_dir=str(self.user_data_dir),
                headless=effective_headless,
                slow_mo=self.slow_mo,
                viewport=self.viewport,
                args=chromium_args,
                ignore_default_args=["--enable-automation"],
            )

            # Mask navigator.webdriver to prevent Google SSO automation blocks
            await self._context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            )

            return self._context

    async def get_page(self) -> Page:
        """
        Returns the active page from the persistent context or opens a new tab.
        """
        context = await self.start()
        if context.pages:
            return context.pages[0]
        return await context.new_page()

    async def save_storage_state(self) -> Path:
        """
        Snapshots cookies and localStorage from the persistent context into
        `storage_state.json` for auditability and headless readiness checks.
        """
        if self._context is None:
            raise RuntimeError("Browser context is not initialized.")
        await self._context.storage_state(path=str(self.storage_state_path))
        logger.info("Saved session state to %s", self.storage_state_path)
        return self.storage_state_path

    async def perform_interactive_login(self, timeout_seconds: int = 300) -> bool:
        """
        Opens Google AI Studio in a headed browser window and waits for the user
        to complete Google SSO + 2FA login, then exports `storage_state.json`.
        """
        await self.start(force_headed=True)
        page = await self.get_page()

        logger.info("Navigating to %s for interactive Google SSO...", AI_STUDIO_BASE_URL)
        await page.goto(AI_STUDIO_BASE_URL, wait_until="domcontentloaded")

        logger.info(
            "Please complete Google Sign-In and 2FA in the opened browser window. "
            "Waiting up to %d seconds for the AI Studio prompt workspace to load...",
            timeout_seconds,
        )

        workspace_selectors = [
            'textarea[aria-label*="prompt" i]',
            'textarea[placeholder*="Type something" i]',
            'textarea[placeholder*="Start typing" i]',
            "ms-autosize-textarea textarea",
            '[role="textbox"][contenteditable="true"]',
        ]
        combined_selector = ", ".join(workspace_selectors)

        try:
            await page.wait_for_selector(
                combined_selector,
                state="visible",
                timeout=timeout_seconds * 1000,
            )
            await self.save_storage_state()
            logger.info("Authentication verified and session saved successfully.")
            return True
        except Exception as exc:
            logger.error("Interactive login timed out or failed: %s", exc)
            await page.screenshot(path="login_error_screenshot.png", full_page=True)
            return False

    async def close(self) -> None:
        """
        Flushes storage state and cleanly shuts down the browser context and Playwright.
        """
        async with self._lock:
            if self._context is not None:
                try:
                    await self.save_storage_state()
                except Exception as exc:
                    logger.debug("Could not save storage state on close: %s", exc)
                await self._context.close()
                self._context = None

            if self._playwright is not None:
                await self._playwright.stop()
                self._playwright = None
                logger.info("BrowserManager shut down cleanly.")


async def _cli_main() -> None:
    parser = argparse.ArgumentParser(
        description="Google AI Studio Persistent Browser & SSO Manager"
    )
    parser.add_argument(
        "--login",
        action="store_true",
        help="Launch non-headless browser to complete initial Google SSO login",
    )
    parser.add_argument(
        "--user-data-dir",
        type=Path,
        default=DEFAULT_USER_DATA_DIR,
        help="Path to persistent Chromium user profile directory",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=300,
        help="Timeout in seconds for interactive login (default: 300)",
    )
    args = parser.parse_args()

    manager = BrowserManager(
        user_data_dir=args.user_data_dir,
        headless=not args.login,
    )
    try:
        if args.login:
            ok = await manager.perform_interactive_login(timeout_seconds=args.timeout)
            if not ok:
                raise SystemExit(1)
        else:
            print(f"Session saved: {manager.has_saved_session()}")
    finally:
        await manager.close()


if __name__ == "__main__":
    asyncio.run(_cli_main())
