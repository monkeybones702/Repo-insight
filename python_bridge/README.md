# Google AI Studio Playwright Automation Bridge

Production-grade Python automation suite bridging local orchestrators, CLI pipelines, or Gemini agents with the Google AI Studio web workspace (`https://aistudio.google.com/app/prompts/new_chat`).

---

## Recommended Configuration in AI Studio (Large Repository Analysis)

When evaluating large repositories or multi-module codebases, this tool pre-configures the AI Studio workspace with the following analytical baseline:

- **Model:** `Gemini 2.5 Pro` (`gemini-2.5-pro`) or `Gemini 2.5 Flash` (`gemini-2.5-flash`) (publicly available GA models selected for high context window capacity up to 1M–2M tokens).
- **Temperature:** `0.2 – 0.3` (default `0.25`; keeps architectural evaluations precise, objective, and analytical rather than overly creative).
- **Safety Settings:** `Default` or `Moderate`.

---

## 1. Installation & Environment Setup

```bash
# 1. Create and activate a Python 3.10+ virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install the Playwright Chromium binary
playwright install chromium
```

---

## 2. Initial Manual Google SSO Login (One-Time Setup)

Because Google accounts enforce 2FA and passkey challenges, perform the first login in **non-headless (headed)** mode. `BrowserManager` launches a persistent Chromium user data profile (`./aistudio_user_data`) and exports verified session cookies to `./storage_state.json`.

```bash
python browser_manager.py --login --timeout 300
```

1. A Chromium window will open at `https://aistudio.google.com/app/prompts/new_chat`.
2. Complete your Google Sign-In and 2FA challenge.
3. As soon as the AI Studio prompt textarea becomes visible in the DOM, `browser_manager.py` automatically snapshots `storage_state.json` and closes the browser cleanly.

---

## 3. Running Prompts & Repository Analysis

### Option A: Direct Python Async Interface

```python
import asyncio
from ai_studio_agent import run_ai_studio_task

async def main():
    result = await run_ai_studio_task(
        prompt="Audit this repository structure for circular dependencies and missing boundary layers...",
        model_name="gemini-2.5-pro",
        temperature=0.25,
        safety_settings="moderate",
        headless=True,
    )
    print(result)

asyncio.run(main())
```

### Option B: CLI Single-Shot Execution

```bash
python ai_studio_agent.py "Analyze the authentication middleware and list security invariants."
```

### Option C: FastAPI Server for External Agent Hooks

Start the local FastAPI server on port `8000`:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

Submit a prompt or repository analysis payload via `curl`:

```bash
curl -X POST http://localhost:8000/api/v1/task \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Evaluate this microservice repository for concurrency bottlenecks and database connection leaks.",
    "model_name": "gemini-2.5-pro",
    "temperature": 0.25,
    "safety_settings": "moderate",
    "headless": true
  }'
```

### Structured JSON Output Format

```json
{
  "status": "success",
  "prompt": "Evaluate this microservice repository...",
  "output_text": "### Architectural Audit Summary\n1. Connection Pool Exhaustion...",
  "execution_time_seconds": 12.4
}
```
