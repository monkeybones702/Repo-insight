from setuptools import setup, find_packages

setup(
    name="aistudio-automation-bridge",
    version="1.0.0",
    description="Production Playwright & FastAPI automation bridge for Google AI Studio web UI and repository analysis",
    author="Systems Architecture Team",
    python_requires=">=3.10",
    packages=find_packages(),
    py_modules=["browser_manager", "ai_studio_agent", "app"],
    install_requires=[
        "playwright>=1.49.0",
        "fastapi>=0.115.0",
        "uvicorn[standard]>=0.32.0",
        "pydantic>=2.10.0",
        "pydantic-settings>=2.6.0",
        "python-dotenv>=1.0.1",
        "httpx>=0.27.2",
    ],
    entry_points={
        "console_scripts": [
            "aistudio-bridge=app:start_server",
        ],
    },
)
