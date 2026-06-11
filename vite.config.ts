import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function readJsonBody(req: import('http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += String(chunk);
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleAiInterpret(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  envApiKey: string | undefined,
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  type InterpretRequestBody = {
    snapshot?: unknown;
    systemPrompt?: unknown;
    userMessage?: unknown;
    history?: unknown;
  };
  let body: InterpretRequestBody | null;
  try {
    const parsed = await readJsonBody(req);
    body = (parsed && typeof parsed === 'object') ? (parsed as InterpretRequestBody) : null;
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const snapshot = body?.snapshot;
  if (!snapshot) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing snapshot' }));
    return;
  }

  const defaultSystem =
    'You are an expert scientific interpreter for a computational social-science panel model UI. ' +
    'You will receive a JSON snapshot containing parameters, coefficients, Z/Φ, Φ components, and term-by-term contributions ' +
    '(main effects, interactions, quadratic), plus FormulaDisplay-like derived metrics. ' +
    'Write in English. ' +
    'Strict rules: (1) No causal claims—only model-implied associations and contribution language. ' +
    '(2) If snapshot.context.modifiersAreStandardized is true (preset active), treat modifiers as z-scores. ' +
    '(3) Use the term breakdown to identify the top drivers (magnitude of contributions). ' +
    '(4) Be concise, technical, and readable. ' +
    '(5) Keep under ~220 words.';

  const systemPromptRaw = body?.systemPrompt;
  const systemPromptUsed =
    typeof systemPromptRaw === 'string' && systemPromptRaw.trim() ? systemPromptRaw.trim() : defaultSystem;

  const userMessageRaw = body?.userMessage;
  const userMessageUsed = typeof userMessageRaw === 'string' ? userMessageRaw.trim() : '';

  type HistoryMessage = { role: 'user' | 'assistant'; content: string };
  const historyRaw = body?.history;
  const history: HistoryMessage[] = [];
  if (Array.isArray(historyRaw)) {
    for (const item of historyRaw) {
      if (!item || typeof item !== 'object') continue;
      const maybe = item as { role?: unknown; content?: unknown };
      const role = maybe.role;
      const content = maybe.content;
      if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
        history.push({ role, content: content.trim() });
      }
      if (history.length >= 12) break;
    }
  }

  const rawHeaderKey = req.headers['x-openai-api-key'];
  const headerKey = Array.isArray(rawHeaderKey) ? rawHeaderKey[0] : rawHeaderKey;
  const effectiveKey = (typeof headerKey === 'string' ? headerKey.trim() : '') || (envApiKey ?? '').trim();

  if (!effectiveKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY is not set (and no key was provided in X-OpenAI-Api-Key)' }));
    return;
  }

  const user =
    'Snapshot JSON (current UI state):\n' +
    JSON.stringify(snapshot, null, 2) +
    '\n\nUser message:\n' +
    (userMessageUsed || 'Interpret the current UI state scientifically.') +
    '\n\nDefault output format (English, scientific tone; adapt only if user explicitly asks otherwise):\n' +
    '1) Brief summary: what Z and Φ imply (1–3 sentences).\n' +
    '2) Top drivers (Top 3): pick from main effects / interactions / quadratics by absolute contribution magnitude; include sign (+/-) and mechanism.\n' +
    '3) Sensitivity / what-if: 2–3 most effective parameter directions to increase/decrease Z, respecting z-score context if preset active.\n' +
    '4) Limits: no causality; note extrapolation/standardization caveats (1–2 sentences).';

  const payload = {
    model: 'gpt-5.2',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPromptUsed },
      ...history,
      { role: 'user', content: user },
    ],
  };

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${effectiveKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  type OpenAIChatCompletionResponse = {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  const upstreamParsed: unknown = await upstream.json().catch(() => null);
  const upstreamJson: OpenAIChatCompletionResponse | null =
    upstreamParsed && typeof upstreamParsed === 'object'
      ? (upstreamParsed as OpenAIChatCompletionResponse)
      : null;
  if (!upstream.ok) {
    const msg = upstreamJson?.error?.message || `Upstream error (${upstream.status})`;
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: msg }));
    return;
  }

  const text = upstreamJson?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Empty model response' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ text }));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.OPENAI_API_KEY;

  return {
    base: '/belief_emergence/',
    plugins: [
      react(),
      {
        name: 'ai-interpreter-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/ai/interpret', async (req, res) => {
            try {
              await handleAiInterpret(req, res, apiKey);
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
            }
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use('/api/ai/interpret', async (req, res) => {
            try {
              await handleAiInterpret(req, res, apiKey);
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
            }
          });
        },
      },
    ],
  };
});
