import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode,
  Play,
  RotateCcw,
  Search,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Code2,
  BookOpen,
} from 'lucide-react';
import {
  DeliverableFile,
  ExecutionRecord,
  INITIAL_EXECUTION_RECORDS,
  PublicGeminiModel,
  REPO_ANALYSIS_PRESETS,
  RepoPreset,
  SELECTOR_CASCADE_MATRIX,
} from './data/bridgeData';

type ActiveSection =
  | 'workbench'
  | 'deliverables'
  | 'selectors'
  | 'logs'
  | 'guide';

const MODEL_API_SLUG_MAP: Record<PublicGeminiModel, string> = {
  'Gemini 2.5 Pro': 'gemini-2.5-pro',
  'Gemini 2.5 Flash': 'gemini-2.5-flash',
  'Gemini 2.5 Flash-Lite': 'gemini-2.5-flash-lite',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('workbench');

  // Recommended Configuration in AI Studio state (Publicly Available GA Models)
  const [selectedModel, setSelectedModel] =
    useState<PublicGeminiModel>('Gemini 2.5 Pro');
  const [temperature, setTemperature] = useState<number>(0.25);
  const [safetySettings, setSafetySettings] = useState<
    'default' | 'moderate' | 'strict'
  >('moderate');
  const [headlessMode, setHeadlessMode] = useState<boolean>(true);
  const [userDataDir, setUserDataDir] = useState<string>('./aistudio_user_data');
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(180);

  // Workbench Prompt & Repository Context state
  const [activePresetId, setActivePresetId] = useState<string>(
    REPO_ANALYSIS_PRESETS[0].id
  );
  const [repositoryContext, setRepositoryContext] = useState<string>(
    REPO_ANALYSIS_PRESETS[0].repositoryContext
  );
  const [promptInput, setPromptInput] = useState<string>(
    REPO_ANALYSIS_PRESETS[0].prompt
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [outputViewMode, setOutputViewMode] = useState<
    'formatted' | 'json' | 'python_call'
  >('formatted');

  // Deliverables state
  const [deliverables, setDeliverables] = useState<DeliverableFile[]>([]);
  const [isLoadingDeliverables, setIsLoadingDeliverables] =
    useState<boolean>(true);
  const [activeFileId, setActiveFileId] = useState<string>('ai_studio_agent');
  const [fileSearchQuery, setFileSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Selector Matrix filter state
  const [selectorSearch, setSelectorSearch] = useState<string>('');

  // Execution Log state
  const [executionRecords, setExecutionRecords] = useState<ExecutionRecord[]>(
    INITIAL_EXECUTION_RECORDS
  );
  const [selectedRecordId, setSelectedRecordId] = useState<string>(
    INITIAL_EXECUTION_RECORDS[0].id
  );
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [logStatusFilter, setLogStatusFilter] = useState<
    'all' | 'success' | 'error'
  >('all');

  // Fetch real Python files from server.ts /python_bridge
  useEffect(() => {
    let mounted = true;
    async function loadDeliverables() {
      setIsLoadingDeliverables(true);
      try {
        const res = await fetch('/api/deliverables');
        const data = await res.json();
        if (mounted && data.status === 'ok' && Array.isArray(data.files)) {
          setDeliverables(data.files);
        }
      } catch (err) {
        console.error('Failed to load Python deliverables:', err);
      } finally {
        if (mounted) {
          setIsLoadingDeliverables(false);
        }
      }
    }
    loadDeliverables();
    return () => {
      mounted = false;
    };
  }, []);

  const currentRecord = useMemo(() => {
    return (
      executionRecords.find((r) => r.id === selectedRecordId) ||
      executionRecords[0] ||
      null
    );
  }, [executionRecords, selectedRecordId]);

  const handleApplyPreset = (preset: RepoPreset) => {
    setActivePresetId(preset.id);
    setSelectedModel(preset.recommendedModel);
    setTemperature(preset.recommendedTemp);
    setSafetySettings(preset.recommendedSafety);
    setRepositoryContext(preset.repositoryContext);
    setPromptInput(preset.prompt);
  };

  const handleResetRecommendedConfig = () => {
    setSelectedModel('Gemini 2.5 Pro');
    setTemperature(0.25);
    setSafetySettings('moderate');
    setHeadlessMode(true);
    setUserDataDir('./aistudio_user_data');
    setTimeoutSeconds(180);
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch {
      // Fallback copy
    }
  };

  const handleDownloadSingleFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCompleteBundle = () => {
    // Generates a single self-extracting Python script that creates the entire /python_bridge directory
    const bundlePayload = deliverables.map((f) => ({
      filename: f.filename,
      content: f.content,
    }));

    const installerScript = `#!/usr/bin/env python3
"""
Self-extracting bundle for Google AI Studio Playwright Automation Bridge.
Run: python3 install_aistudio_bridge.py
"""
import json
from pathlib import Path

FILES = ${JSON.stringify(bundlePayload, null, 2)}

def main():
    target_dir = Path("./aistudio_bridge")
    target_dir.mkdir(parents=True, exist_ok=True)
    for item in FILES:
        dest = target_dir / item["filename"]
        dest.write_text(item["content"], encoding="utf-8")
        print(f"Created {dest} ({len(item['content'])} bytes)")
    print("\\nNext steps:")
    print("  1. cd aistudio_bridge")
    print("  2. pip install -r requirements.txt && playwright install chromium")
    print("  3. python browser_manager.py --login")
    print("  4. uvicorn app:app --host 0.0.0.0 --port 8000")

if __name__ == "__main__":
    main()
`;
    handleDownloadSingleFile('install_aistudio_bridge.py', installerScript);
  };

  const handleExecuteTask = async () => {
    if (!promptInput.trim() || isExecuting) return;
    setIsExecuting(true);
    setActiveSection('workbench');

    try {
      const response = await fetch('/api/execute-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptInput,
          model_name: selectedModel,
          temperature,
          safety_settings: safetySettings,
          repository_context: repositoryContext,
        }),
      });

      const data = await response.json();
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const newRecord: ExecutionRecord = {
        id: `exec-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: nowStr,
        status: data.status === 'success' ? 'success' : 'error',
        modelName: selectedModel,
        temperature,
        safetySettings,
        prompt: promptInput,
        outputText: data.output_text || '',
        codeBlocks: Array.isArray(data.code_blocks) ? data.code_blocks : [],
        executionTimeSeconds: Number(data.execution_time_seconds) || 0,
        errorMessage: data.error_message,
      };

      setExecutionRecords((prev) => [newRecord, ...prev]);
      setSelectedRecordId(newRecord.id);
    } catch (err: any) {
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const errorRecord: ExecutionRecord = {
        id: `exec-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: nowStr,
        status: 'error',
        modelName: selectedModel,
        temperature,
        safetySettings,
        prompt: promptInput,
        outputText: '',
        codeBlocks: [],
        executionTimeSeconds: 0.12,
        errorMessage: err?.message || 'Network request failed.',
      };
      setExecutionRecords((prev) => [errorRecord, ...prev]);
      setSelectedRecordId(errorRecord.id);
    } finally {
      setIsExecuting(false);
    }
  };

  const activeDeliverable = useMemo(() => {
    return (
      deliverables.find((d) => d.id === activeFileId) || deliverables[0] || null
    );
  }, [deliverables, activeFileId]);

  const filteredDeliverables = useMemo(() => {
    if (!fileSearchQuery.trim()) return deliverables;
    const q = fileSearchQuery.toLowerCase();
    return deliverables.filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.content.toLowerCase().includes(q)
    );
  }, [deliverables, fileSearchQuery]);

  const filteredSelectors = useMemo(() => {
    if (!selectorSearch.trim()) return SELECTOR_CASCADE_MATRIX;
    const q = selectorSearch.toLowerCase();
    return SELECTOR_CASCADE_MATRIX.filter(
      (s) =>
        s.stageName.toLowerCase().includes(q) ||
        s.primarySelector.toLowerCase().includes(q) ||
        s.purpose.toLowerCase().includes(q) ||
        s.fallbackSelectors.some((fb) => fb.toLowerCase().includes(q))
    );
  }, [selectorSearch]);

  const filteredLogs = useMemo(() => {
    return executionRecords.filter((rec) => {
      if (logStatusFilter !== 'all' && rec.status !== logStatusFilter) {
        return false;
      }
      if (!logSearchQuery.trim()) return true;
      const q = logSearchQuery.toLowerCase();
      return (
        rec.id.toLowerCase().includes(q) ||
        rec.prompt.toLowerCase().includes(q) ||
        rec.outputText.toLowerCase().includes(q) ||
        rec.modelName.toLowerCase().includes(q)
      );
    });
  }, [executionRecords, logStatusFilter, logSearchQuery]);

  const dynamicPythonInvocation = useMemo(() => {
    const modelSlug = MODEL_API_SLUG_MAP[selectedModel];
    return `import asyncio
from ai_studio_agent import run_ai_studio_task

async def analyze_repository():
    response = await run_ai_studio_task(
        prompt=${JSON.stringify(promptInput.slice(0, 120) + (promptInput.length > 120 ? '...' : ''))},
        model_name="${modelSlug}",
        temperature=${temperature.toFixed(2)},
        safety_settings="${safetySettings}",
        headless=${headlessMode ? 'True' : 'False'},
    )
    print(response)

if __name__ == "__main__":
    asyncio.run(analyze_repository())`;
  }, [selectedModel, temperature, safetySettings, headlessMode, promptInput]);

  const isTempInRecommendedBand = temperature >= 0.2 && temperature <= 0.3;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Strictly 3 zones (Brand wordmark, 5 nav links, 2 primary actions) */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200">
        <a
          href="#workbench"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('workbench');
          }}
          className="text-lg font-semibold tracking-tight text-slate-900 whitespace-nowrap"
        >
          AI Studio Bridge
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveSection('workbench')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'workbench'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Analytical Workbench
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('deliverables')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'deliverables'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Python Deliverables
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('selectors')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'selectors'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Selector Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('logs')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'logs'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Execution Log
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('guide')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'guide'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            CLI Setup Guide
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadCompleteBundle}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Python Suite</span>
          </button>
          <button
            type="button"
            onClick={handleExecuteTask}
            disabled={isExecuting}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isExecuting ? 'Running Evaluation...' : 'Run Evaluation'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-2 overflow-x-auto px-4 py-2 bg-white border-b border-slate-200">
        {(
          [
            ['workbench', 'Workbench'],
            ['deliverables', 'Python Code'],
            ['selectors', 'Selectors'],
            ['logs', 'Execution Log'],
            ['guide', 'CLI Guide'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveSection(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeSection === key
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Content Container (1440px Desktop Baseline) */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-8">
        {/* Contextual Header Banner with Recommended Configuration Summary (Unboxed Metadata) */}
        <section className="pb-8 mb-8 border-b border-slate-200 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
              <span>Playwright Async Engine</span>
              <span aria-hidden="true">·</span>
              <span>Target Context: 1M–2M Tokens</span>
              <span aria-hidden="true">·</span>
              <span>Recommended Temperature: 0.20–0.30</span>
              <span aria-hidden="true">·</span>
              <span>Safety: Default / Moderate</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 text-balance">
              Google AI Studio Automation Bridge & Large Repository Evaluator
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Full-stack Python Playwright automation suite (
              <code className="text-xs font-mono text-slate-800">
                browser_manager.py
              </code>
              ,{' '}
              <code className="text-xs font-mono text-slate-800">
                ai_studio_agent.py
              </code>
              ,{' '}
              <code className="text-xs font-mono text-slate-800">app.py</code>)
              paired with an interactive calibration studio for high-context
              repository analysis.
            </p>
          </div>

          {/* Quick Key Metrics Bar (Unboxed with hairline vertical dividers & tabular numerals) */}
          <div className="grid grid-cols-3 gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-200 shrink-0">
            <div>
              <div className="text-xs text-slate-500">Active Model Profile</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5 tabular-nums">
                {selectedModel}
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {MODEL_API_SLUG_MAP[selectedModel]}
              </div>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <div className="text-xs text-slate-500">Analytical Temp</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5 font-mono tabular-nums">
                {temperature.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">
                {isTempInRecommendedBand
                  ? 'Optimal 0.2–0.3 band'
                  : 'Outside 0.2–0.3 band'}
              </div>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <div className="text-xs text-slate-500">Python Deliverables</div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5 font-mono tabular-nums">
                {deliverables.length || 6} modules
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                Playwright + FastAPI
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: ANALYTICAL WORKBENCH */}
        {activeSection === 'workbench' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column (5 cols): Recommended Configuration in AI Studio & Presets */}
            <div className="lg:col-span-5 space-y-8">
              {/* Recommended Configuration Calibration Panel */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      01. Recommended Configuration in AI Studio
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Calibrated for large repository evaluations up to 2M tokens
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetRecommendedConfig}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                {/* 1. Model Selector (Publicly Available Gemini 2.5 GA Models) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-800">
                      Public Model Selection (1M–2M Context)
                    </label>
                    <span className="text-slate-500 font-mono tabular-nums">
                      {MODEL_API_SLUG_MAP[selectedModel]}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        {
                          name: 'Gemini 2.5 Pro',
                          sub: 'gemini-2.5-pro · Deep reasoning',
                        },
                        {
                          name: 'Gemini 2.5 Flash',
                          sub: 'gemini-2.5-flash · High speed',
                        },
                        {
                          name: 'Gemini 2.5 Flash-Lite',
                          sub: 'gemini-2.5-flash-lite · Efficient',
                        },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => setSelectedModel(m.name)}
                        className={`px-3 py-2.5 rounded-md text-left transition-colors ${
                          selectedModel === m.name
                            ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <div className="text-xs font-semibold whitespace-nowrap truncate">
                          {m.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">
                          {m.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Temperature Calibration (0.2 - 0.3 Recommended) */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="temperature-slider"
                      className="font-semibold text-slate-800"
                    >
                      Temperature (Objective & Analytical)
                    </label>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {temperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="temperature-slider"
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                    <span>0.00 (Deterministic)</span>
                    <button
                      type="button"
                      onClick={() => setTemperature(0.25)}
                      className="text-blue-600 hover:underline font-medium whitespace-nowrap"
                    >
                      Set 0.20–0.30 Recommended Band
                    </button>
                    <span>1.00 (Creative)</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed pt-1">
                    {isTempInRecommendedBand ? (
                      <span className="text-emerald-700 font-medium">
                        Within recommended 0.20–0.30 range: keeps repository
                        evaluations precise, objective, and analytical.
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium">
                        Outside recommended 0.20–0.30 range: higher values may
                        introduce speculative refactoring suggestions.
                      </span>
                    )}
                  </p>
                </div>

                {/* 3. Safety Settings (Default or Moderate) */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-slate-800">
                      Safety Settings
                    </label>
                    <span className="text-slate-500">
                      Default or Moderate recommended
                    </span>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        ['default', 'Default'],
                        ['moderate', 'Moderate (Recommended)'],
                        ['strict', 'Strict'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSafetySettings(val)}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                          safetySettings === val
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Playwright Persistent Context Settings */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-800">
                    Playwright Browser Context Parameters
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="user-data-dir"
                        className="block text-[11px] text-slate-500 mb-1"
                      >
                        Persistent Profile Directory
                      </label>
                      <input
                        id="user-data-dir"
                        type="text"
                        value={userDataDir}
                        onChange={(e) => setUserDataDir(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="timeout-sec"
                        className="block text-[11px] text-slate-500 mb-1"
                      >
                        Generation Timeout (seconds)
                      </label>
                      <input
                        id="timeout-sec"
                        type="number"
                        min={30}
                        max={600}
                        value={timeoutSeconds}
                        onChange={(e) =>
                          setTimeoutSeconds(Number(e.target.value) || 180)
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-600">
                      Execution Mode (toggle non-headless for initial Google SSO)
                    </span>
                    <button
                      type="button"
                      onClick={() => setHeadlessMode((prev) => !prev)}
                      className="px-3 py-1 text-xs font-mono font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors whitespace-nowrap"
                    >
                      {headlessMode ? 'headless=True' : 'headless=False (SSO)'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Curated Large Repository Evaluation Presets */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    02. Repository Analysis Scenarios
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Load a multi-service repository snapshot to test analytical
                    prompts
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  {REPO_ANALYSIS_PRESETS.map((preset) => {
                    const isSelected = preset.id === activePresetId;
                    return (
                      <div
                        key={preset.id}
                        className="py-3.5 first:pt-1 last:pb-1 flex items-start justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="text-xs text-slate-500 tabular-nums">
                            <span>{preset.domain}</span>
                            <span aria-hidden="true"> · </span>
                            <span>Temp {preset.recommendedTemp.toFixed(2)}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900">
                            {preset.title}
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {preset.prompt}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(preset)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected ? 'Loaded' : 'Load Preset'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column (7 cols): Prompt Injection & Structured Output Inspector */}
            <div className="lg:col-span-7 space-y-8">
              {/* Prompt & Repository Context Input Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      03. Repository Context & Prompt Injection Workspace
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 tabular-nums">
                      <span>Target: aistudio.google.com/app/prompts/new_chat</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {(repositoryContext.length + promptInput.length).toLocaleString()}{' '}
                        chars
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExecuteTask}
                    disabled={isExecuting || !promptInput.trim()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {isExecuting
                        ? 'Evaluating Repository...'
                        : 'Execute Task (Ctrl+Enter)'}
                    </span>
                  </button>
                </div>

                {/* Repository Structure / File Snapshot Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="repo-context-box"
                      className="font-semibold text-slate-700"
                    >
                      Repository Tree / Code Context Snapshot
                    </label>
                    <button
                      type="button"
                      onClick={() => setRepositoryContext('')}
                      className="text-slate-500 hover:text-slate-800 text-xs"
                    >
                      Clear Context
                    </button>
                  </div>
                  <textarea
                    id="repo-context-box"
                    rows={4}
                    value={repositoryContext}
                    onChange={(e) => setRepositoryContext(e.target.value)}
                    placeholder="Paste repository file tree, module signatures, or git diff..."
                    className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600 leading-relaxed"
                  />
                </div>

                {/* Main Analytical Prompt Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="main-prompt-box"
                      className="font-semibold text-slate-700"
                    >
                      Analytical Prompt Payload
                    </label>
                    <span className="text-slate-500 font-mono text-[11px]">
                      Selector: textarea[aria-label*=&quot;Type something&quot; i]
                    </span>
                  </div>
                  <textarea
                    id="main-prompt-box"
                    rows={4}
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleExecuteTask();
                      }
                    }}
                    placeholder="Enter your architectural evaluation prompt..."
                    className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-blue-600 leading-relaxed"
                  />
                </div>
              </div>

              {/* Output & Structured Artifact Inspector */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      04. Extracted Output & Bridge Response Payload
                    </h2>
                    {currentRecord && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 tabular-nums">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                          {currentRecord.status === 'success' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          )}
                          {currentRecord.status === 'success'
                            ? 'Status: success'
                            : 'Status: error'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{currentRecord.modelName}</span>
                        <span aria-hidden="true">·</span>
                        <span>Temp {currentRecord.temperature.toFixed(2)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{currentRecord.executionTimeSeconds.toFixed(2)}s</span>
                      </div>
                    )}
                  </div>

                  {/* Interactive Output Mode Segmented Control */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        ['formatted', 'Extracted Report'],
                        ['json', 'Structured JSON'],
                        ['python_call', 'Python Bridge Call'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setOutputViewMode(mode)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          outputViewMode === mode
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Loading Skeleton State */}
                {isExecuting ? (
                  <div className="space-y-4 py-6">
                    <div className="flex items-center gap-2 text-xs text-blue-700 font-medium">
                      <Sliders className="w-4 h-4 animate-spin" />
                      <span>
                        Executing analytical evaluation with Model={selectedModel}{' '}
                        and Temperature={temperature.toFixed(2)}...
                      </span>
                    </div>
                    <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse" />
                    <div className="h-4 bg-slate-100 rounded w-full animate-pulse" />
                    <div className="h-4 bg-slate-100 rounded w-5/6 animate-pulse" />
                    <div className="h-28 bg-slate-100 rounded w-full animate-pulse mt-4" />
                  </div>
                ) : !currentRecord ? (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-sm text-slate-600">
                      No evaluation records available yet. Run an evaluation above
                      to inspect the extracted output and JSON contract.
                    </p>
                    <button
                      type="button"
                      onClick={handleExecuteTask}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Run First Evaluation
                    </button>
                  </div>
                ) : outputViewMode === 'formatted' ? (
                  <div className="space-y-4">
                    {currentRecord.status === 'error' ? (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span>Execution Error Captured</span>
                        </div>
                        <p>{currentRecord.errorMessage}</p>
                        <p className="font-mono text-[11px] text-red-700">
                          Fallback diagnostic screenshot path: error_screenshot.png
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                          {currentRecord.outputText}
                        </div>

                        {currentRecord.codeBlocks.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between text-xs text-slate-600">
                              <span className="font-semibold">
                                Extracted Code Artifacts (
                                {currentRecord.codeBlocks.length})
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyText(
                                    currentRecord.codeBlocks.join('\n\n'),
                                    'copy-artifacts'
                                  )
                                }
                                className="text-blue-600 hover:underline flex items-center gap-1"
                              >
                                {copiedId === 'copy-artifacts' ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy Code Blocks</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
                              {currentRecord.codeBlocks.join('\n\n# ---\n\n')}
                            </pre>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : outputViewMode === 'json' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Return contract from{' '}
                        <code className="font-mono text-slate-800">
                          run_ai_studio_task(prompt, model_name)
                        </code>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            JSON.stringify(
                              {
                                status: currentRecord.status,
                                prompt: currentRecord.prompt,
                                output_text: currentRecord.outputText,
                                execution_time_seconds:
                                  currentRecord.executionTimeSeconds,
                              },
                              null,
                              2
                            ),
                            'copy-json'
                          )
                        }
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {copiedId === 'copy-json' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied JSON</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy JSON</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed tabular-nums">
                      {JSON.stringify(
                        {
                          status: currentRecord.status,
                          prompt: currentRecord.prompt,
                          output_text: currentRecord.outputText,
                          execution_time_seconds:
                            currentRecord.executionTimeSeconds,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Configured Python invocation using current workbench
                        parameters
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(dynamicPythonInvocation, 'copy-py-call')
                        }
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {copiedId === 'copy-py-call' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied Snippet</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Snippet</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
                      {dynamicPythonInvocation}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: PYTHON DELIVERABLES CODEBASE INSPECTOR */}
        {activeSection === 'deliverables' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Sidebar File List (4 cols) */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Deliverable Modules
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {filteredDeliverables.length} of {deliverables.length} files
                </span>
              </div>

              {/* Search Deliverables */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  placeholder="Search filename or Python symbol..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              {isLoadingDeliverables ? (
                <div className="space-y-2 py-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="h-14 bg-slate-100 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredDeliverables.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-slate-500">
                    No Python files match &quot;{fileSearchQuery}&quot;.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFileSearchQuery('')}
                    className="text-xs text-blue-600 font-medium hover:underline"
                  >
                    Reset search filter
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredDeliverables.map((file) => {
                    const isSelected =
                      activeDeliverable?.id === file.id;
                    return (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => setActiveFileId(file.id)}
                        className={`w-full text-left py-3 px-3 rounded-lg transition-colors flex items-start justify-between gap-3 ${
                          isSelected
                            ? 'bg-slate-900 text-white'
                            : 'hover:bg-slate-50 text-slate-900'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <FileCode
                              className={`w-4 h-4 shrink-0 ${
                                isSelected ? 'text-blue-400' : 'text-slate-500'
                              }`}
                            />
                            <span className="text-xs font-mono font-semibold truncate">
                              {file.filename}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] line-clamp-2 ${
                              isSelected ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {file.description}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] font-mono tabular-nums shrink-0 ${
                            isSelected ? 'text-slate-300' : 'text-slate-400'
                          }`}
                        >
                          {file.lines}L
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDownloadCompleteBundle}
                  className="w-full py-2 px-4 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Self-Extracting Bundle (.py)</span>
                </button>
              </div>
            </div>

            {/* Code Viewer (8 cols) */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {activeDeliverable ? (
                <>
                  <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span>{activeDeliverable.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{activeDeliverable.lines} lines</span>
                        <span aria-hidden="true">·</span>
                        <span>{activeDeliverable.bytes.toLocaleString()} bytes</span>
                      </div>
                      <h3 className="text-base font-mono font-semibold text-slate-900 mt-0.5">
                        /python_bridge/{activeDeliverable.filename}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            activeDeliverable.content,
                            activeDeliverable.id
                          )
                        }
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {copiedId === activeDeliverable.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadSingleFile(
                            activeDeliverable.filename,
                            activeDeliverable.content
                          )
                        }
                        className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download {activeDeliverable.filename}</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-6 overflow-x-auto max-h-[680px]">
                    <pre className="text-xs font-mono text-slate-100 leading-relaxed tabular-nums">
                      {activeDeliverable.content
                        .split('\n')
                        .map((line, idx) => (
                          <div key={idx} className="table-row">
                            <span className="table-cell pr-4 text-right text-slate-600 select-none w-10">
                              {idx + 1}
                            </span>
                            <span className="table-cell whitespace-pre">
                              {line}
                            </span>
                          </div>
                        ))}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-sm text-slate-500">
                  Select a Python module on the left to inspect its implementation.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 3: RESILIENT DOM SELECTOR & STATE CASCADE MATRIX */}
        {activeSection === 'selectors' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Google AI Studio DOM Selector Cascade & State Monitoring Matrix
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Multi-tiered ARIA, placeholder, and structural CSS selectors
                  implemented in{' '}
                  <code className="font-mono text-slate-800">
                    ai_studio_agent.py
                  </code>
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={selectorSearch}
                  onChange={(e) => setSelectorSearch(e.target.value)}
                  placeholder="Filter stage or CSS selector..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {filteredSelectors.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm text-slate-600">
                  No selector rules match &quot;{selectorSearch}&quot;.
                </p>
                <button
                  type="button"
                  onClick={() => setSelectorSearch('')}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:underline"
                >
                  Show all 6 lifecycle stages
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 pr-4">Stage</th>
                      <th className="py-3 px-4">Primary Selector</th>
                      <th className="py-3 px-4">Fallback Cascade</th>
                      <th className="py-3 px-4">Dynamic Wait Condition</th>
                      <th className="py-3 px-4 text-right">Timeout</th>
                      <th className="py-3 pl-4">Failure & Recovery Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSelectors.map((rule) => (
                      <tr
                        key={rule.id}
                        className="hover:bg-slate-50/80 transition-colors align-top"
                      >
                        <td className="py-3.5 pr-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {rule.stageOrder}. {rule.stageName}
                          </div>
                          <div className="text-[11px] text-slate-500 max-w-xs whitespace-normal mt-0.5">
                            {rule.purpose}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-blue-700">
                          {rule.primarySelector}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 space-y-1">
                          {rule.fallbackSelectors.map((fb, idx) => (
                            <div key={idx}>{fb}</div>
                          ))}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {rule.waitCondition}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {(rule.timeoutMs / 1000).toFixed(0)}s
                        </td>
                        <td className="py-3.5 pl-4 text-slate-600 max-w-xs">
                          {rule.recoveryAction}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: EXECUTION LOG */}
        {activeSection === 'logs' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Task Execution Telemetry & Structured Output Log
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Historical and live runs with tabular timing and model
                  calibration parameters
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsComparing(!isComparing)}
                  disabled={compareIds.length !== 2 && !isComparing}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    isComparing
                      ? 'bg-slate-900 text-white'
                      : compareIds.length === 2
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isComparing ? 'Exit Comparison' : `Compare Selected (${compareIds.length}/2)`}
                </button>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      ['all', 'All Runs'],
                      ['success', 'Success'],
                      ['error', 'Error'],
                    ] as const
                  ).map(([st, label]) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setLogStatusFilter(st)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        logStatusFilter === st
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Search prompt or ID..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            {isComparing && compareIds.length === 2 ? (
              <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                {compareIds.map((id, index) => {
                  const rec = executionRecords.find(r => r.id === id);
                  if (!rec) return null;
                  return (
                    <div key={id} className="space-y-4">
                      <div className="text-xs font-semibold text-slate-900 border-b border-slate-200 pb-2">
                        {index === 0 ? 'Baseline' : 'Comparison'} ({rec.id})
                      </div>
                      <div className="text-sm text-slate-800 p-3 bg-white rounded border border-slate-200 h-64 overflow-y-auto whitespace-pre-wrap">
                        {rec.outputText}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        Time: {rec.executionTimeSeconds.toFixed(2)}s | Model: {rec.modelName}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm text-slate-600">
                  No task execution records match your current filter criteria.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setLogSearchQuery('');
                      setLogStatusFilter('all');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                  >
                    Reset Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('workbench')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    Log New Evaluation
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-2">Select</th>
                      <th className="py-3 pr-4">Run ID</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">State</th>
                      <th className="py-3 px-4">Model Profile</th>
                      <th className="py-3 px-4 text-right">Temp</th>
                      <th className="py-3 px-4">Prompt Summary</th>
                      <th className="py-3 px-4 text-right">Duration</th>
                      <th className="py-3 pl-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredLogs.map((rec) => (
                      <tr
                        key={rec.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3 px-2">
                          <input
                            type="checkbox"
                            checked={compareIds.includes(rec.id)}
                            onChange={() => {
                              if (compareIds.includes(rec.id)) {
                                setCompareIds(compareIds.filter(id => id !== rec.id));
                              } else if (compareIds.length < 2) {
                                setCompareIds([...compareIds, rec.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-3 pr-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                          {rec.id}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {rec.timestamp}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                            {rec.status === 'success' ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Success</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                <span>Error</span>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-800 whitespace-nowrap">
                          {rec.modelName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {rec.temperature.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-md truncate">
                          {rec.prompt}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {rec.executionTimeSeconds.toFixed(2)}s
                        </td>
                        <td className="py-3 pl-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRecordId(rec.id);
                              setActiveSection('workbench');
                            }}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            Inspect Output
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SECTION 5: CLI SETUP & SSO LOGIN GUIDE */}
        {activeSection === 'guide' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  CLI Setup, Initial Google SSO Login & FastAPI Execution Guide
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Step-by-step instructions to authenticate your persistent
                  Chromium profile and run headless evaluations
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    01. Install Dependencies & Playwright Chromium Binary
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Download the Python suite using the button in the top bar or
                    copy the files from the{' '}
                    <code className="font-mono">/python_bridge</code> directory,
                    then initialize your virtual environment:
                  </p>
                  <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
{`python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    02. Complete Initial Manual Google Login (Non-Headless SSO)
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Run{' '}
                    <code className="font-mono text-slate-800">
                      browser_manager.py --login
                    </code>{' '}
                    to launch a visible Chromium window backed by{' '}
                    <code className="font-mono text-slate-800">
                      launch_persistent_context(&quot;{userDataDir}&quot;)
                    </code>
                    . Once you complete Google Sign-In and 2FA and the AI Studio
                    prompt input loads, the tool writes{' '}
                    <code className="font-mono text-slate-800">
                      storage_state.json
                    </code>{' '}
                    automatically:
                  </p>
                  <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
{`python browser_manager.py --login --user-data-dir ${userDataDir} --timeout 300`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    03. Start the FastAPI Automation Server & Submit Tasks
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Once <code className="font-mono">storage_state.json</code> is
                    saved, subsequent runs operate in headless mode with your
                    recommended repository analysis settings:
                  </p>
                  <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
{`# Start FastAPI bridge server on port 8000
uvicorn app:app --host 0.0.0.0 --port 8000

# Send a repository analysis prompt configured with ${selectedModel} and Temperature ${temperature.toFixed(2)}
curl -X POST http://localhost:8000/api/v1/task \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Audit this repository for concurrency bottlenecks and connection leaks.",
    "model_name": "${MODEL_API_SLUG_MAP[selectedModel]}",
    "temperature": ${temperature.toFixed(2)},
    "safety_settings": "${safetySettings}",
    "headless": true
  }'`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Right Column: Recommended Configuration Rationale Card */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <h3 className="text-base font-semibold text-slate-900">
                Why This Configuration Matters for Large Repositories
              </h3>

              <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
                <div className="pb-4 border-b border-slate-100">
                  <div className="font-semibold text-slate-900 mb-1">
                    Model: Gemini 2.5 Pro or Gemini 2.5 Flash
                  </div>
                  <p>
                    Publicly available GA models providing 1M to 2M token context
                    window capacity, enabling full cross-file dependency
                    resolution and call-graph tracing without chunking losses.
                  </p>
                </div>

                <div className="pb-4 border-b border-slate-100">
                  <div className="font-semibold text-slate-900 mb-1">
                    Temperature: 0.20 – 0.30
                  </div>
                  <p>
                    Suppresses sampling variance so architectural evaluations,
                    security audits, and static analysis reports remain
                    deterministic, grounded, and objective.
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-slate-900 mb-1">
                    Safety Settings: Default or Moderate
                  </div>
                  <p>
                    Prevents false-positive blocks when analyzing penetration
                    testing payloads, cryptographic routines, or firewall rules
                    inside source repositories.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveSection('deliverables')}
                className="w-full py-2 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Inspect Full Python Codebase</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Editorial Footer (No fake telemetry tickers) */}
      <footer className="mt-12 border-t border-slate-200 bg-white py-5 px-6">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            AI Studio Automation Bridge · Playwright Async API &amp; FastAPI
            Deliverable Suite
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSection('deliverables')}
              className="hover:text-slate-900 transition-colors"
            >
              View Python Source
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={handleDownloadCompleteBundle}
              className="hover:text-slate-900 transition-colors"
            >
              Download Bundle
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
