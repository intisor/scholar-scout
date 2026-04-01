---
name: free-ai-api-integration
description: "Integrate free no-billing AI APIs into an existing app using OpenAI-compatible clients. Use when adding LLM features without credit cards, selecting providers, wiring env vars, adding multi-provider failover, and validating rate-limit-safe behavior. Prioritize C# and JS/TS integration patterns."
argument-hint: "Provide runtime (csharp/js-ts), current AI client, and preferred provider(s)."
---

# Free AI API Integration

## What This Skill Produces
- A provider-aware integration plan that keeps billing disabled.
- Application code wired to one or more free AI endpoints.
- Environment-variable based secrets and endpoint configuration.
- Multi-provider fallback routing.
- Verification checks for reliability, limits, and privacy.

## When to Use
- You need LLM features but cannot enable billing.
- You want OpenAI-compatible integration with minimal code changes.
- You need a backup provider when a free endpoint is down or rate-limited.
- You want to keep secrets out of source code and support local/dev/prod config.

## Inputs To Collect First
1. Runtime and SDK in use (C#, JavaScript/TypeScript, Python, etc).
2. Existing call style (OpenAI SDK, direct fetch, framework wrapper).
3. Core workload: chat, coding help, extraction, summarization, image generation.
4. Throughput target: requests per minute/day and expected token volume.
5. Data sensitivity and privacy constraints.
6. Region constraints (for example, Gemini free-tier availability).

## Provider Selection Workflow
1. Start with first-party providers when possible for better stability.
2. If speed is critical, evaluate Groq or Cerebras first.
3. If high free-token volume is critical, evaluate Mistral first.
4. If model flexibility is needed, evaluate OpenRouter free models ending with `:free`.
5. If zero-key setup is required, evaluate Unclose AI or Pollinations with caution.
6. If the app already uses OpenAI SDK, prefer OpenAI-compatible providers to minimize refactor.

See [provider matrix](./references/providers.md).

## Integration Procedure
1. Add provider configuration keys in app settings:
   - `AI_PROVIDER`
   - `AI_BASE_URL`
   - `AI_MODEL`
   - `AI_API_KEY` (empty for no-key providers)
  - `AI_FALLBACKS` (comma-separated list)
2. Load config from environment variables (never hardcode keys).
3. Build a provider factory that returns a configured client from `AI_PROVIDER`.
4. Implement a single app-facing function (for example `generateText`) that hides provider differences.
5. Add retry and fallback behavior for `429`, timeouts, and transient `5xx` errors.
6. Implement a default multi-provider fallback chain from `AI_FALLBACKS`.
7. Enforce rate-limit guardrails in-app (token/request budget and backoff).
8. Add structured logs with provider, model, latency, retry count, and status code.
9. Add a health-check command or route that runs a minimal completion test.
10. Validate no-billing compliance by verifying selected provider is in free tier and key was created without payment setup.

## Branching Logic
- If provider is key-based and user has no key yet:
  1. Stop coding changes.
  2. Guide user to key creation portal.
  3. Resume after env var is present.
- If provider is no-key:
  1. Set `AI_API_KEY` empty.
  2. Increase timeout/fallback tolerance due to possible instability.
- If rate-limit errors exceed threshold:
  1. Lower request concurrency.
  2. Switch to fallback provider.
  3. Add cache for repeated prompts where safe.
- If region restrictions block setup:
  1. Skip blocked provider.
  2. Re-rank alternatives from matrix.

## Completion Checks
- Configuration:
  - Secrets are read from env/config, not committed to git.
  - Provider and model can be changed without code edits.
- Functional:
  - One successful completion from primary provider.
  - One simulated failure triggers fallback successfully.
- Operational:
  - Basic latency and error metrics are emitted.
  - Backoff triggers on `429`.
- Safety:
  - Privacy note documented for selected provider.
  - Free-tier rate limits documented in project docs.

## Coding Patterns
- Keep API abstraction narrow (`generateText`, `generateJson`, `generateImage`).
- Keep provider-specific mapping isolated to adapter/factory modules.
- Use OpenAI-compatible clients where possible to reduce branching.
- Fail fast on missing required config (`AI_BASE_URL`, `AI_MODEL`, key when required).
- For C#, start with direct REST via `HttpClientFactory` and typed options; move to OpenAI .NET SDK only when it clearly improves maintainability, feature coverage, or reliability for your use case.
- For JS/TS, prefer a single client factory module and runtime-selected adapter.

## Common Mistakes To Avoid
- Hardcoding provider keys or URLs.
- Assuming all free tiers allow production traffic.
- Omitting fallback for community endpoints.
- Ignoring provider-specific model names and limits.
- Not validating region availability before integration.

## Deliverables This Skill Should Produce In A Task
1. Config changes and env var documentation.
2. Provider adapter/factory implementation.
3. Example call path wired into existing feature.
4. Health-check and fallback verification.
5. Short README section for setup and limits.
