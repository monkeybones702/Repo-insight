export interface DeliverableFile {
  id: string;
  filename: string;
  title: string;
  category: string;
  language: 'python' | 'plaintext' | 'markdown';
  description: string;
  content: string;
  lines: number;
  bytes: number;
}

export type PublicGeminiModel =
  | 'Gemini 2.5 Pro'
  | 'Gemini 2.5 Flash'
  | 'Gemini 2.5 Flash-Lite';

export interface RepoPreset {
  id: string;
  title: string;
  domain: string;
  estimatedTokens: string;
  recommendedModel: PublicGeminiModel;
  recommendedTemp: number;
  recommendedSafety: 'default' | 'moderate';
  repositoryContext: string;
  prompt: string;
}

export interface SelectorCascadeRule {
  id: string;
  stageOrder: string;
  stageName: string;
  purpose: string;
  primarySelector: string;
  fallbackSelectors: string[];
  waitCondition: string;
  timeoutMs: number;
  recoveryAction: string;
}

export interface ExecutionRecord {
  id: string;
  timestamp: string;
  status: 'success' | 'error';
  modelName: string;
  temperature: number;
  safetySettings: 'default' | 'moderate' | 'strict';
  prompt: string;
  outputText: string;
  codeBlocks: string[];
  executionTimeSeconds: number;
  errorMessage?: string;
}

export const REPO_ANALYSIS_PRESETS: RepoPreset[] = [
  {
    id: 'monorepo-payment-audit',
    title: '01. Distributed Ledger & Payment Gateway Audit',
    domain: 'FinTech Monorepo · 1.4M Context Window',
    estimatedTokens: '1,420,000 tokens',
    recommendedModel: 'Gemini 2.5 Pro',
    recommendedTemp: 0.2,
    recommendedSafety: 'moderate',
    repositoryContext: `Repository: acme-payments-core (148 files)
├── services/settlement-engine/
│   ├── dispatcher.py       # AsyncPG connection pool (max_size=10), unguarded retry loop on line 84
│   ├── idempotency.py      # Redis SETNX lock with 30s TTL; missing Lua atomic release
│   └── webhook_signer.py   # HMAC-SHA256 verification without constant-time compare
├── services/ledger-writer/
│   └── batch_committer.py  # Two-phase commit across shard_01 and shard_02`,
    prompt:
      'Perform an objective architectural audit of the settlement-engine and ledger-writer modules. Identify concurrency race conditions, idempotency lock expiration hazards, and connection pool bottlenecks. Provide concrete Python remediation snippets.',
  },
  {
    id: 'playwright-bridge-self-audit',
    title: '02. Playwright AI Studio Automation Resilience Review',
    domain: 'Browser Automation · 850K Context Window',
    estimatedTokens: '850,000 tokens',
    recommendedModel: 'Gemini 2.5 Flash',
    recommendedTemp: 0.25,
    recommendedSafety: 'default',
    repositoryContext: `Repository: aistudio-automation-bridge (6 files)
├── browser_manager.py      # launch_persistent_context(./aistudio_user_data), storage_state.json sync
├── ai_studio_agent.py      # Selector cascade for aistudio.google.com/app/prompts/new_chat
│                           # Monitors Stop button -> Run button active transition
└── app.py                  # FastAPI /api/v1/task endpoint with shared BrowserManager lifespan`,
    prompt:
      'Evaluate the Playwright automation architecture in browser_manager.py and ai_studio_agent.py. Analyze how concurrent FastAPI requests interact with a single persistent browser context, and provide an async page-pool or tab-isolation pattern for high-throughput execution.',
  },
  {
    id: 'event-mesh-backpressure',
    title: '03. Event-Driven Worker Mesh & DLQ Topology Evaluation',
    domain: 'Cloud Infrastructure · 1.8M Context Window',
    estimatedTokens: '1,810,000 tokens',
    recommendedModel: 'Gemini 2.5 Pro',
    recommendedTemp: 0.3,
    recommendedSafety: 'moderate',
    repositoryContext: `Repository: telemetry-ingestion-mesh (312 files)
├── ingest-gateway/         # gRPC stream receiver -> Kafka topic 'raw-telemetry-v3'
├── stream-aggregator/      # Consumer group lag spikes during 60s window flush
└── dlq-reprocessor/        # Exponential backoff missing jitter; replays poison pills indefinitely`,
    prompt:
      'Analyze the ingestion mesh for consumer lag amplification and poison-pill replay storms. Recommend exact partition rebalancing parameters, circuit-breaker thresholds, and a bounded dead-letter queue retry implementation.',
  },
];

export const SELECTOR_CASCADE_MATRIX: SelectorCascadeRule[] = [
  {
    id: 'workspace-auth-gate',
    stageOrder: '01',
    stageName: 'SSO Session Verification',
    purpose: 'Confirms storage_state.json cookies bypass 2FA and reach the authenticated prompt workspace.',
    primarySelector: 'ms-autosize-textarea textarea',
    fallbackSelectors: [
      'textarea[aria-label*="prompt" i]',
      'textarea[placeholder*="Type something" i]',
      '[role="textbox"][contenteditable="true"]',
    ],
    waitCondition: 'state="visible"',
    timeoutMs: 30000,
    recoveryAction: 'Switch BrowserManager to force_headed=True and invoke perform_interactive_login().',
  },
  {
    id: 'model-temp-tuning',
    stageOrder: '02',
    stageName: 'Model & Temperature Calibration',
    purpose: 'Selects publicly available Gemini 2.5 Pro or Gemini 2.5 Flash (1M-2M tokens) and locks Temperature to 0.2 - 0.3.',
    primarySelector: 'ms-model-selector, input[aria-label*="Temperature" i]',
    fallbackSelectors: [
      '[aria-label*="Model" i][role="combobox"]',
      'mat-select[aria-label*="Model" i]',
      'ms-slider[aria-label*="Temperature" i] input[type="number"]',
    ],
    waitCondition: 'state="attached"',
    timeoutMs: 10000,
    recoveryAction: 'Log non-blocking warning and retain workspace default run settings.',
  },
  {
    id: 'prompt-injection',
    stageOrder: '03',
    stageName: 'Prompt Payload Injection',
    purpose: 'Focuses the main prompt input field and injects large repository context strings.',
    primarySelector: 'textarea[aria-label*="Type something" i]',
    fallbackSelectors: [
      'textarea[placeholder*="Start typing a prompt" i]',
      'ms-prompt-input-wrapper textarea',
      'footer textarea',
    ],
    waitCondition: 'state="visible" && is_enabled()',
    timeoutMs: 20000,
    recoveryAction: 'Capture error_screenshot.png and raise PlaywrightTimeoutError.',
  },
  {
    id: 'execution-trigger',
    stageOrder: '04',
    stageName: 'Run Trigger Dispatch',
    purpose: 'Submits the prompt via the primary Run button or keyboard shortcut fallback.',
    primarySelector: 'button[aria-label*="Run" i]',
    fallbackSelectors: [
      'ms-run-button button',
      'button:has-text("Run")',
      'Keyboard: Control+Enter',
    ],
    waitCondition: 'is_enabled()',
    timeoutMs: 5000,
    recoveryAction: 'Dispatch prompt_box.press("Control+Enter") directly to the active textarea.',
  },
  {
    id: 'state-monitoring',
    stageOrder: '05',
    stageName: 'Generation Completion Barrier',
    purpose: 'Detects Stop button / spinner appearance and waits until generation settles.',
    primarySelector: 'button[aria-label*="Stop" i]',
    fallbackSelectors: [
      'ms-run-button button:has-text("Stop")',
      '[aria-busy="true"]',
      'mat-progress-spinner',
    ],
    waitCondition: 'wait_for_function(!isRunning && currentOutputs > prevCount)',
    timeoutMs: 180000,
    recoveryAction: 'Capture full-page error_screenshot.png and return structured timeout error payload.',
  },
  {
    id: 'artifact-extraction',
    stageOrder: '06',
    stageName: 'DOM Output & Code Artifact Scraper',
    purpose: 'Clones latest Model turn node, strips UI chrome buttons, and extracts markdown + code blocks.',
    primarySelector: 'ms-chat-turn[data-turn-role="Model"] ms-cmark-node',
    fallbackSelectors: [
      '.model-prompt-container ms-cmark-node',
      'ms-chat-turn .turn-content ms-cmark-node',
      'ms-cmark-node',
    ],
    waitCondition: 'state="attached"',
    timeoutMs: 15000,
    recoveryAction: 'Fallback to raw innerText extraction on the last ms-chat-turn container.',
  },
];

export const INITIAL_EXECUTION_RECORDS: ExecutionRecord[] = [
  {
    id: 'exec-9042',
    timestamp: '2026-10-01 13:48:12',
    status: 'success',
    modelName: 'Gemini 2.5 Pro',
    temperature: 0.2,
    safetySettings: 'moderate',
    prompt:
      'Perform an objective architectural audit of the settlement-engine and ledger-writer modules. Identify concurrency race conditions and idempotency lock expiration hazards.',
    outputText: `### Architectural Evaluation: Settlement Engine & Ledger Writer

1. **Non-Atomic Redis Idempotency Lock Release (\`services/settlement-engine/idempotency.py\`)**
   - **Finding:** Using \`SETNX\` with a static 30-second TTL without a fencing token or Lua ownership check allows Worker A's lock to expire during a slow downstream bank call, causing Worker B to acquire the lock and Worker A to delete Worker B's key upon completion.
   - **Remediation:** Store a unique \`request_uuid\` value and release only via an atomic Lua compare-and-delete script.

2. **Timing Side-Channel in Webhook Verification (\`services/settlement-engine/webhook_signer.py\`)**
   - **Finding:** Standard string equality (\`==\`) leaks signature byte prefixes across network timing distribution.
   - **Remediation:** Replace with \`hmac.compare_digest(expected_sig, received_sig)\`.`,
    codeBlocks: [
      `import hmac
import hashlib

def verify_webhook_signature(payload: bytes, secret: str, signature_header: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.strip())`,
    ],
    executionTimeSeconds: 11.84,
  },
  {
    id: 'exec-9041',
    timestamp: '2026-10-01 13:42:05',
    status: 'success',
    modelName: 'Gemini 2.5 Flash',
    temperature: 0.25,
    safetySettings: 'default',
    prompt:
      'Evaluate the Playwright automation architecture in browser_manager.py and ai_studio_agent.py for concurrent FastAPI request handling.',
    outputText: `### Concurrency Analysis for Persistent Playwright Contexts

1. **Tab Isolation within Shared \`BrowserContext\`**
   - **Finding:** \`BrowserManager.get_page()\` returns \`context.pages[0]\` by default. Under concurrent FastAPI requests to \`POST /api/v1/task\`, simultaneous navigation calls on the same \`Page\` instance will interrupt in-flight generations.
   - **Remediation:** Allocate an ephemeral tab via \`await context.new_page()\` guarded by an \`asyncio.Semaphore(max_concurrent_tabs)\` and close the tab in a \`finally\` block while keeping the parent persistent context warm.`,
    codeBlocks: [
      `from contextlib import asynccontextmanager
from playwright.async_api import BrowserContext, Page

@asynccontextmanager
async def acquire_isolated_tab(context: BrowserContext, semaphore: asyncio.Semaphore):
    async with semaphore:
        page: Page = await context.new_page()
        try:
            yield page
        finally:
            await page.close()`,
    ],
    executionTimeSeconds: 6.42,
  },
];
