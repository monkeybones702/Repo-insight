"""
app.py
~~~~~~
Lightweight FastAPI server allowing external models, local UIs, or Gemini hooks
to send prompts and repository analysis tasks to Google AI Studio via POST requests.
"""

from contextlib import asynccontextmanager
from typing import Any, Dict, List, Literal, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ai_studio_agent import AIStudioAgent, run_ai_studio_task
from browser_manager import BrowserManager

shared_browser_manager: Optional[BrowserManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global shared_browser_manager
    shared_browser_manager = BrowserManager(headless=True)
    yield
    if shared_browser_manager is not None:
        await shared_browser_manager.close()


app = FastAPI(
    title="Google AI Studio Automation Bridge API",
    description=(
        "FastAPI service bridging local tools and Gemini agents with the "
        "Google AI Studio Web UI via Playwright persistent browser contexts."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskRequest(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        description="The prompt or repository context payload to submit to AI Studio.",
    )
    model_name: str = Field(
        default="gemini-2.5-pro",
        description="Publicly available target model in AI Studio ('gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', or 'gemini-flash-latest').",
    )
    temperature: float = Field(
        default=0.25,
        ge=0.0,
        le=2.0,
        description="Recommended 0.2 - 0.3 for analytical repository evaluations.",
    )
    safety_settings: Literal["default", "moderate", "strict"] = Field(
        default="moderate",
        description="Safety filter configuration ('default' or 'moderate' recommended).",
    )
    headless: bool = Field(
        default=True,
        description="Run browser in headless mode (requires prior storage_state.json login).",
    )
    timeout_ms: int = Field(
        default=180000,
        ge=10000,
        le=600000,
        description="Maximum wait time in milliseconds for generation completion.",
    )


class TaskResponse(BaseModel):
    status: Literal["success", "error"]
    prompt: str
    output_text: str
    execution_time_seconds: float
    code_blocks: Optional[List[str]] = None
    configuration: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    error_screenshot: Optional[str] = None


@app.get("/api/v1/health")
async def health_check() -> Dict[str, Any]:
    has_session = (
        shared_browser_manager.has_saved_session()
        if shared_browser_manager
        else False
    )
    return {
        "status": "ok",
        "session_authenticated": has_session,
        "recommended_config": {
            "models": ["Gemini 2.5 Pro", "Gemini 2.5 Flash", "Gemini 2.5 Flash-Lite"],
            "temperature_range": [0.2, 0.3],
            "default_temperature": 0.25,
            "safety_settings": "moderate",
        },
    }


@app.post("/api/v1/task", response_model=TaskResponse)
async def execute_ai_studio_task(payload: TaskRequest) -> Dict[str, Any]:
    """
    Executes a prompt task in Google AI Studio using the shared persistent context
    or an isolated context if custom headless mode is requested.
    """
    if shared_browser_manager and payload.headless:
        agent = AIStudioAgent(browser_manager=shared_browser_manager, headless=True)
        result = await agent.run_task(
            prompt=payload.prompt,
            model_name=payload.model_name,
            temperature=payload.temperature,
            safety_settings=payload.safety_settings,
            timeout_ms=payload.timeout_ms,
        )
        return result

    return await run_ai_studio_task(
        prompt=payload.prompt,
        model_name=payload.model_name,
        temperature=payload.temperature,
        safety_settings=payload.safety_settings,
        headless=payload.headless,
    )


@app.post("/api/v1/auth/login")
async def trigger_interactive_login() -> Dict[str, Any]:
    """
    Launches a headed browser window on the host machine so the operator can
    complete first-time Google SSO + 2FA login and persist storage_state.json.
    """
    manager = BrowserManager(headless=False)
    try:
        success = await manager.perform_interactive_login(timeout_seconds=300)
        if not success:
            raise HTTPException(
                status_code=408,
                detail="Interactive Google login timed out before workspace loaded.",
            )
        return {
            "status": "authenticated",
            "storage_state_path": str(manager.storage_state_path),
        }
    finally:
        await manager.close()


def start_server() -> None:
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    start_server()
