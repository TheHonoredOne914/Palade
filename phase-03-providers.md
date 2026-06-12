# PALADE — PHASE 3: Provider Adapters

**Depends on:** Phase 1 (config system working)
**Next phase:** Phase 4 — Agent Architecture

---

## What You Are Building

Three LLM provider adapters (Groq, Cerebras, NVIDIA NIM) behind a shared interface, plus a router that assigns providers to roles at startup.

After this phase: you can call any provider with a system + user prompt and get a completion back. The router selects providers automatically based on config and availability.

---

## Files to Create

```
src/providers/
├── base.ts
├── groq.ts
├── cerebras.ts
├── nvidia.ts
└── router.ts
```

---

## Core Types (in `src/providers/base.ts`)

```ts
export interface CompletionRequest {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number        // default: 4096
  temperature?: number      // default: 0.1
}

export interface CompletionResponse {
  content: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  provider: string
  model: string
}

export interface IProvider {
  name: string
  model: string
  complete(req: CompletionRequest): Promise<CompletionResponse>
  isAvailable(): Promise<boolean>
}
```

---

## Tasks

### 1. `src/providers/groq.ts`

```ts
export class GroqProvider implements IProvider {
  name = 'groq'
  model: string
  private apiKey: string
  private limiter: pLimit.LimitFunction

  constructor(apiKey: string, model = 'llama-3.3-70b-versatile', maxConcurrency = 8)

  async complete(req: CompletionRequest): Promise<CompletionResponse>
  async isAvailable(): Promise<boolean>
}
```

`complete()` implementation:
- POST to `https://api.groq.com/openai/v1/chat/completions`
- Headers: `Authorization: Bearer ${apiKey}`, `Content-Type: application/json`
- Body: OpenAI-compatible messages format:
  ```json
  {
    "model": "<model>",
    "messages": [
      { "role": "system", "content": "<systemPrompt>" },
      { "role": "user", "content": "<userPrompt>" }
    ],
    "max_tokens": 4096,
    "temperature": 0.1
  }
  ```
- Extract `choices[0].message.content`
- Extract `usage.prompt_tokens` and `usage.completion_tokens`
- Measure duration with `Date.now()`
- **Retry logic**: on HTTP 429, wait `500ms * 2^attempt` (capped at 8s), retry up to 3 times
- On non-retryable error (4xx except 429, 5xx): throw with message `Groq error ${status}: ${body}`
- All calls go through `p-limit` limiter (respects `maxConcurrency`)
- **Never log `apiKey` in any error message**

`isAvailable()` implementation:
- Make a minimal completion call with `max_tokens: 1` and a trivial prompt
- Return `true` if response is 200
- Return `false` on any error (don't throw)
- Cache result for 60 seconds (don't re-check on every agent call)

### 2. `src/providers/cerebras.ts`

Same structure as Groq. Differences:
- Endpoint: `https://api.cerebras.ai/v1/chat/completions`
- Default model: `llama-3.3-70b`
- No concurrency limiter (single synthesis call pattern)
- Same retry logic
- Same `isAvailable()` pattern

### 3. `src/providers/nvidia.ts`

Same structure. Differences:
- Endpoint: configurable `baseUrl`, default `https://integrate.api.nvidia.com/v1`
- Full endpoint: `${baseUrl}/chat/completions`
- Default model: from config (no hardcoded default)
- Same retry + availability logic

### 4. `src/providers/router.ts`

```ts
export type ProviderRole = 'primary' | 'synthesis'

export interface ProviderAssignment {
  primary: IProvider
  synthesis: IProvider
}

export async function initRouter(config: PaladeConfig): Promise<ProviderAssignment>
export function getProvider(role: ProviderRole): IProvider
```

`initRouter()` implementation:

1. Instantiate all configured providers (those with an apiKey set)
2. Check availability of each in parallel: `Promise.all(providers.map(p => p.isAvailable()))`
3. Print availability status to terminal:
   ```
   Providers:
     ✓ Groq          available  (llama-3.3-70b-versatile)
     ✓ Cerebras      available  (llama-3.3-70b)
     ✗ NVIDIA NIM    unavailable — check NVIDIA_API_KEY
   ```
   Use chalk: green ✓, red ✗
4. Assign `primary` provider:
   - Use `config.swarm.primary` if that provider is available
   - Else fallback order: groq → cerebras → nvidia
   - If none available: throw `"No providers available. Set at least one API key."`
5. Assign `synthesis` provider:
   - Use `config.swarm.synthesis` if available
   - Else fallback to `primary`
6. Print assignment:
   ```
   Swarm:     Groq → 6 agents (llama-3.3-70b-versatile)
   Synthesis: Cerebras (llama-3.3-70b)
   ```
7. Store assignment in module-level singleton
8. Export `getProvider(role)` to retrieve assigned provider anywhere

---

## Acceptance Criteria

- `GroqProvider.complete()` returns a `CompletionResponse` with real content when given a valid key
- `GroqProvider.complete()` retries on 429 and does not throw until 3rd failure
- `GroqProvider.isAvailable()` returns `false` with an invalid key, not a thrown error
- `initRouter()` prints provider status table to terminal
- If only `GROQ_API_KEY` is set: router assigns Groq as both primary and synthesis
- API key never appears in terminal output, even in error messages

---

## Test It

After building, manually test with:

```ts
// quick test script: test-provider.ts
import { GroqProvider } from './src/providers/groq.js'

const p = new GroqProvider(process.env.GROQ_API_KEY!)
const res = await p.complete({
  systemPrompt: 'You are a code reviewer.',
  userPrompt: 'Say OK in exactly one word.'
})
console.log(res.content, res.durationMs + 'ms')
```

Run: `tsx test-provider.ts`

---

## Rules for This Phase

- All HTTP calls use native `fetch` (Node 18+) — no axios, no node-fetch
- Retry logic is a shared utility function — don't duplicate it in each provider
- `isAvailable()` must never throw — always return a boolean
- Provider instances are singletons — create once in `initRouter`, never re-instantiate
