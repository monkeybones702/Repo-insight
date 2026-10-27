"""
ai_studio_agent.py
~~~~~~~~~~~~~~~~~~
Core Playwright automation engine for Google AI Studio.
Navigates to https://aistudio.google.com/app/prompts/new_chat, applies
recommended repository analysis settings (Model: Gemini 2.5 Pro / Gemini 2.5 Flash,
Temperature: 0.2 - 0.3, Safety: Default/Moderate), injects the prompt,
triggers execution, monitors DOM completion state, and extracts rendered
markdown and code block artifacts.
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from playwright.async_api import Locator, Page, TimeoutError as PlaywrightTimeoutError

from browser_manager import (
    AI_STUDIO_BASE_URL,
    DEFAULT_STORAGE_STATE_PATH,
    DEFAULT_USER_DATA_DIR,
    BrowserManager,
)

logger = logging.getLogger("aistudio_bridge.agent")

# Publicly Available Model Mapping for Large Repository Analysis (1M-2M Token Context)
MODEL_ALIASES: Dict[str, str] = {
    "default": "Gemini 2.5 Pro",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
    "gemini-flash-latest": "Gemini Flash Latest",
    "2.5-pro": "Gemini 2.5 Pro",
    "2.5-flash": "Gemini 2.5 Flash",
}

# Resilient selector cascade for the main prompt input box
PROMPT_INPUT_SELECTORS: List[str] = [
    'textarea[aria-label*="Type something" i]',
    'textarea[aria-label*="prompt" i]',
    'textarea[placeholder*="Type something" i]',
    'textarea[placeholder*="Start typing a prompt" i]',
    "ms-autosize-textarea textarea",
    "ms-prompt-input-wrapper textarea",
    '[role="textbox"][contenteditable="true"]',
    "footer textarea",
]

# Resilient selector cascade for the Run / Submit button
RUN_BUTTON_SELECTORS: List[str] = [
    'button[aria-label*="Run" i]',
    "ms-run-button button",
    'button:has-text("Run")',
    ".run-button",
]

# Selectors that indicate generation is actively running
GENERATION_ACTIVE_SELECTORS: List[str] = [
    'button[aria-label*="Stop" i]',
    'button:has-text("Stop")',
    'ms-run-button button:has-text("Stop")',
    '[aria-busy="true"]',
    "mat-progress-spinner",
    ".loading-spinner",
]

# Selectors for model output containers in the chat transcript
MODEL_OUTPUT_SELECTORS: List[str] = [
    'ms-chat-turn[data-turn-role="Model"] ms-cmark-node',
    ".model-prompt-container ms-cmark-node",
    "ms-chat-turn .turn-content ms-cmark-node",
    'ms-chat-turn:has(.author-label:has-text("Model")) .turn-content',
    "ms-cmark-node",
]


class AIStudioAgent:
    """
    Automates Google AI Studio prompt submission, run-settings tuning,
    state monitoring, and clean output/artifact extraction.
    """

    def __init__(
        self,
        browser_manager: Optional[BrowserManager] = None,
        headless: bool = True,
        error_screenshot_path: Path = Path("./error_screenshot.png"),
    ) -> None:
        self.browser_manager = browser_manager or BrowserManager(
            user_data_dir=DEFAULT_USER_DATA_DIR,
            storage_state_path=DEFAULT_STORAGE_STATE_PATH,
            headless=headless,
        )
        self.error_screenshot_path = Path(error_screenshot_path).resolve()

    async def _find_first_visible(
        self, page: Page, selectors: List[str], timeout_ms: int = 15000
    ) -> Locator:
        """
        Waits for the first matching visible selector from a prioritized fallback list.
        """
        combined = ", ".join(selectors)
        await page.wait_for_selector(combined, state="visible", timeout=timeout_ms)

        for selector in selectors:
            locator = page.locator(selector).first
            if await locator.count() > 0 and await locator.is_visible():
                return locator

        raise PlaywrightTimeoutError(
            f"None of the candidate selectors became visible: {selectors}"
        )

    async def configure_run_settings(
        self,
        page: Page,
        model_name: str = "default",
        temperature: float = 0.25,
        safety_level: str = "moderate",
    ) -> Dict[str, Any]:
        """
        Applies the Recommended Configuration in AI Studio for analyzing large repositories:
        - Model: Gemini 1.5 Pro or Gemini 2.0 Flash (1M-2M token context window)
        - Temperature: 0.2 - 0.3 (objective, analytical evaluation)
        - Safety Settings: Default or Moderate
        """
        applied: Dict[str, Any] = {
            "target_model": MODEL_ALIASES.get(model_name.lower(), model_name),
            "temperature": round(max(0.0, min(2.0, temperature)), 2),
            "safety_settings": safety_level,
        }

        # 1. Select Model if non-default selector is accessible in the right-hand Run Settings panel
        target_label = applied["target_model"]
        try:
            model_dropdown = page.locator(
                'ms-model-selector, [aria-label*="Model" i][role="combobox"], mat-select[aria-label*="Model" i]'
            ).first
            if await model_dropdown.count() > 0 and await model_dropdown.is_visible():
                await model_dropdown.click()
                option = page.locator(
                    f'mat-option:has-text("{target_label}"), [role="option"]:has-text("{target_label}")'
                ).first
                if await option.count() > 0:
                    await option.click()
                    logger.info("Selected AI Studio model: %s", target_label)
                else:
                    await page.keyboard.press("Escape")
        except Exception as exc:
            logger.debug("Model selector skipped (using workspace default): %s", exc)

        # 2. Set Temperature (Recommended: 0.2 - 0.3 for repository analysis)
        try:
            temp_input = page.locator(
                'input[aria-label*="Temperature" i], ms-slider[aria-label*="Temperature" i] input[type="number"]'
            ).first
            if await temp_input.count() > 0 and await temp_input.is_visible():
                await temp_input.fill(str(applied["temperature"]))
                await temp_input.press("Enter")
                logger.info("Configured temperature to %.2f", applied["temperature"])
        except Exception as exc:
            logger.debug("Temperature input skipped: %s", exc)

        return applied

    async def _extract_latest_response(self, page: Page) -> Dict[str, Any]:
        """
        Extracts the generated text and any fenced code blocks from the latest
        model output node in the DOM, cleaning out UI button labels (e.g. 'Copy', 'Use code').
        """
        combined_output = ", ".join(MODEL_OUTPUT_SELECTORS)
        await page.wait_for_selector(combined_output, state="attached", timeout=15000)

        # Evaluate directly in DOM to cleanly reconstruct text & code blocks
        extraction: Dict[str, Any] = await page.evaluate(
            """
            (selectors) => {
                let nodes = [];
                for (const sel of selectors) {
                    const found = Array.from(document.querySelectorAll(sel));
                    if (found.length > 0) {
                        nodes = found;
                        break;
                    }
                }
                if (nodes.length === 0) {
                    return { text: "", code_blocks: [] };
                }
                const latestNode = nodes[nodes.length - 1];
                const clone = latestNode.cloneNode(true);

                // Remove copy buttons, action toolbars, and hidden assistive spans
                clone.querySelectorAll('button, mat-icon, .code-block-header, .action-bar').forEach(el => el.remove());

                const codeBlocks = Array.from(latestNode.querySelectorAll('pre code, code.language-python, pre')).map(block => {
                    return (block.textContent || '').trim();
                }).filter(Boolean);

                const cleanText = (clone.innerText || clone.textContent || '').trim();
                return {
                    text: cleanText,
                    code_blocks: codeBlocks
                };
            }
            """,
            MODEL_OUTPUT_SELECTORS,
        )
        return extraction

    async def run_task(
        self,
        prompt: str,
        model_name: str = "gemini-2.5-pro",
        temperature: float = 0.25,
        safety_settings: str = "moderate",
        timeout_ms: int = 180000,
    ) -> Dict[str, Any]:
        """
        Executes a full end-to-end prompt cycle in Google AI Studio:
        1. Opens https://aistudio.google.com/app/prompts/new_chat
        2. Configures Model (Gemini 2.5 Pro / Gemini 2.5 Flash) & Temperature (0.2-0.3)
        3. Injects prompt text into workspace input
        4. Triggers Run (Click or Control+Enter)
        5. Monitors execution state (Stop button / spinner -> Run button active)
        6. Extracts output text & code artifacts
        """
        start_time = time.perf_counter()
        page: Optional[Page] = None

        try:
            page = await self.browser_manager.get_page()
            logger.info("Navigating to Google AI Studio new chat workspace...")
            await page.goto(AI_STUDIO_BASE_URL, wait_until="domcontentloaded", timeout=45000)

            # Locate the main prompt input box using resilient selector cascade
            prompt_box = await self._find_first_visible(
                page, PROMPT_INPUT_SELECTORS, timeout_ms=30000
            )

            # Configure recommended model & temperature settings
            applied_config = await self.configure_run_settings(
                page,
                model_name=model_name,
                temperature=temperature,
                safety_level=safety_settings,
            )

            # Count existing model turns before submitting
            initial_turn_count = await page.locator(", ".join(MODEL_OUTPUT_SELECTORS)).count()

            # Inject prompt into workspace input
            await prompt_box.click()
            await prompt_box.fill(prompt)
            logger.info("Injected prompt (%d chars). Triggering generation...", len(prompt))

            # Trigger generation via Run button or Control+Enter fallback
            triggered = False
            for run_sel in RUN_BUTTON_SELECTORS:
                btn = page.locator(run_sel).first
                if await btn.count() > 0 and await btn.is_visible() and await btn.is_enabled():
                    await btn.click()
                    triggered = True
                    break

            if not triggered:
                await prompt_box.press("Control+Enter")

            # Phase 1: Detect execution start (Stop button, spinner, or new model turn node)
            stop_combined = ", ".join(GENERATION_ACTIVE_SELECTORS)
            try:
                await page.wait_for_selector(stop_combined, state="visible", timeout=10000)
                logger.info("Generation started (active state indicator detected).")
            except PlaywrightTimeoutError:
                logger.debug(
                    "Fast response or Stop indicator skipped; verifying output turn appearance."
                )

            # Phase 2: Wait for generation completion (Stop indicator disappears & output stabilizes)
            await page.wait_for_function(
                """
                ({ stopSelectors, outputSelectors, prevCount }) => {
                    const isRunning = stopSelectors.some(sel => {
                        const el = document.querySelector(sel);
                        return el && el.offsetParent !== null;
                    });
                    let currentOutputs = 0;
                    for (const sel of outputSelectors) {
                        const found = document.querySelectorAll(sel);
                        if (found.length > 0) {
                            currentOutputs = found.length;
                            break;
                        }
                    }
                    return !isRunning && currentOutputs > prevCount;
                }
                """,
                arg={
                    "stopSelectors": GENERATION_ACTIVE_SELECTORS,
                    "outputSelectors": MODEL_OUTPUT_SELECTORS,
                    "prevCount": initial_turn_count,
                },
                timeout=timeout_ms,
            )

            # Extract response text and markdown code blocks
            extracted = await self._extract_latest_response(page)
            elapsed = round(time.perf_counter() - start_time, 2)

            return {
                "status": "success",
                "prompt": prompt,
                "output_text": extracted.get("text", ""),
                "code_blocks": extracted.get("code_blocks", []),
                "configuration": applied_config,
                "execution_time_seconds": elapsed,
            }

        except Exception as exc:
            elapsed = round(time.perf_counter() - start_time, 2)
            logger.error("AI Studio automation error after %.2fs: %s", elapsed, exc)

            if page is not None:
                try:
                    await page.screenshot(
                        path=str(self.error_screenshot_path), full_page=True
                    )
                    logger.info(
                        "Captured diagnostic failure screenshot to %s",
                        self.error_screenshot_path,
                    )
                except Exception as shot_exc:
                    logger.warning("Failed to capture error screenshot: %s", shot_exc)

            return {
                "status": "error",
                "prompt": prompt,
                "output_text": "",
                "error_message": str(exc),
                "error_screenshot": str(self.error_screenshot_path),
                "execution_time_seconds": elapsed,
            }


async def run_ai_studio_task(
    prompt: str,
    model_name: str = "default",
    temperature: float = 0.25,
    safety_settings: str = "moderate",
    headless: bool = True,
) -> Dict[str, Any]:
    """
    High-level asynchronous Python interface required by external Gemini agents
    or local orchestrators.

    Returns:
        {
            "status": "success | error",
            "prompt": "...",
            "output_text": "...",
            "execution_time_seconds": 12.4
        }
    """
    manager = BrowserManager(headless=headless)
    agent = AIStudioAgent(browser_manager=manager, headless=headless)
    try:
        result = await agent.run_task(
            prompt=prompt,
            model_name=model_name,
            temperature=temperature,
            safety_settings=safety_settings,
        )
        return {
            "status": result["status"],
            "prompt": result["prompt"],
            "output_text": result.get("output_text", ""),
            "execution_time_seconds": result["execution_time_seconds"],
            **(
                {"error_message": result["error_message"]}
                if "error_message" in result
                else {}
            ),
        }
    finally:
        await manager.close()


if __name__ == "__main__":
    import json
    import sys

    sample_prompt = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "Summarize the key architectural benefits of a 2M token context window for repository analysis."
    )
    output = asyncio.run(
        run_ai_studio_task(
            prompt=sample_prompt,
            model_name="gemini-2.5-pro",
            temperature=0.25,
        )
    )
    print(json.dumps(output, indent=2))
