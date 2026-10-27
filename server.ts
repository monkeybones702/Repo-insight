import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '4mb' }));

  // Serve real Python deliverables from /python_bridge directory
  app.get('/api/deliverables', (_req, res) => {
    try {
      const bridgeDir = path.join(__dirname, 'python_bridge');
      const files = [
        {
          id: 'requirements',
          filename: 'requirements.txt',
          title: 'requirements.txt',
          category: 'Package Manifest',
          language: 'plaintext',
          description: 'Pinned production dependencies for Playwright, FastAPI, Uvicorn, and Pydantic.',
        },
        {
          id: 'setup',
          filename: 'setup.py',
          title: 'setup.py',
          category: 'Install Script',
          language: 'python',
          description: 'Setuptools packaging configuration with console script entry point.',
        },
        {
          id: 'browser_manager',
          filename: 'browser_manager.py',
          title: 'browser_manager.py',
          category: 'Persistent Context & SSO',
          language: 'python',
          description: 'Manages launch_persistent_context, storage_state.json, and interactive 2FA login.',
        },
        {
          id: 'ai_studio_agent',
          filename: 'ai_studio_agent.py',
          title: 'ai_studio_agent.py',
          category: 'Playwright Core Agent',
          language: 'python',
          description: 'Navigates to AI Studio, configures Model & 0.2-0.3 Temperature, injects prompts, monitors DOM state, and extracts outputs.',
        },
        {
          id: 'app',
          filename: 'app.py',
          title: 'app.py',
          category: 'FastAPI Server',
          language: 'python',
          description: 'FastAPI service exposing /api/v1/task and /api/v1/auth/login for external agent hooks.',
        },
        {
          id: 'readme',
          filename: 'README.md',
          title: 'README.md',
          category: 'CLI Usage Guide',
          language: 'markdown',
          description: 'Step-by-step CLI setup, first-time Google login, and large repository analysis guide.',
        },
      ];

      const loaded = files.map((file) => {
        const fullPath = path.join(bridgeDir, file.filename);
        const content = fs.existsSync(fullPath)
          ? fs.readFileSync(fullPath, 'utf-8')
          : '';
        return {
          ...file,
          content,
          lines: content.split('\n').length,
          bytes: Buffer.byteLength(content, 'utf-8'),
        };
      });

      res.json({ status: 'ok', files: loaded });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        error_message: error?.message || 'Failed to read Python deliverables',
      });
    }
  });

  // Live execution endpoint matching `run_ai_studio_task` structured output contract
  app.post('/api/execute-task', async (req, res) => {
    const startTime = performance.now();
    const {
      prompt,
      model_name = 'Gemini 2.5 Pro',
      temperature = 0.25,
      safety_settings = 'moderate',
      repository_context = '',
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({
        status: 'error',
        prompt: prompt || '',
        output_text: '',
        error_message: 'A non-empty prompt string is required.',
        execution_time_seconds: 0,
      });
      return;
    }

    const clampedTemp = Math.max(0.0, Math.min(2.0, Number(temperature) || 0.25));

    const threshold =
      safety_settings === 'strict'
        ? HarmBlockThreshold.BLOCK_LOW_AND_ABOVE
        : HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;

    const fullPrompt = repository_context
      ? `### REPOSITORY CONTEXT SNAPSHOT\n${repository_context}\n\n### ANALYTICAL PROMPT\n${prompt}`
      : prompt;

    const publicModelMap: Record<string, string> = {
      'Gemini 2.5 Pro': 'gemini-2.5-pro',
      'gemini-2.5-pro': 'gemini-2.5-pro',
      'Gemini 2.5 Flash': 'gemini-2.5-flash',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'Gemini 2.5 Flash-Lite': 'gemini-2.5-flash-lite',
      'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
      'Gemini Flash Latest': 'gemini-flash-latest',
      'gemini-flash-latest': 'gemini-flash-latest',
    };

    const resolvedApiModel = publicModelMap[model_name] || 'gemini-flash-latest';

    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model: resolvedApiModel,
          contents: fullPrompt,
          config: {
            temperature: clampedTemp,
            topP: 0.95,
            topK: 40,
            systemInstruction:
              'You are a Principal Systems Architect and Codebase Auditor configured for high-context repository analysis in Google AI Studio. ' +
              `Operate with strict analytical precision (target configuration: Model=${model_name} [${resolvedApiModel}], Temperature=${clampedTemp}, Safety=${safety_settings}). ` +
              'Provide structured, objective, evidence-backed engineering evaluations with concrete file/module references and actionable remediation code blocks.',
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold,
              },
            ],
          },
        });
      } catch {
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: fullPrompt,
          config: {
            temperature: clampedTemp,
            topP: 0.95,
            topK: 40,
            systemInstruction:
              'You are a Principal Systems Architect and Codebase Auditor configured for high-context repository analysis in Google AI Studio. ' +
              `Operate with strict analytical precision (target configuration: Model=${model_name}, Temperature=${clampedTemp}, Safety=${safety_settings}). ` +
              'Provide structured, objective, evidence-backed engineering evaluations with concrete file/module references and actionable remediation code blocks.',
          },
        });
      }

      const outputText = response.text || '';
      const elapsedSeconds = Number(((performance.now() - startTime) / 1000).toFixed(2));

      // Extract fenced code blocks to match AIStudioAgent._extract_latest_response
      const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
      const codeBlocks: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = codeBlockRegex.exec(outputText)) !== null) {
        if (match[1]?.trim()) {
          codeBlocks.push(match[1].trim());
        }
      }

      res.json({
        status: 'success',
        prompt,
        output_text: outputText,
        code_blocks: codeBlocks,
        configuration: {
          target_model: model_name,
          temperature: clampedTemp,
          safety_settings,
        },
        execution_time_seconds: elapsedSeconds,
      });
    } catch (error: any) {
      const elapsedSeconds = Number(((performance.now() - startTime) / 1000).toFixed(2));
      res.status(500).json({
        status: 'error',
        prompt,
        output_text: '',
        error_message: error?.message || 'Gemini evaluation request failed.',
        error_screenshot: 'error_screenshot.png',
        execution_time_seconds: elapsedSeconds,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
