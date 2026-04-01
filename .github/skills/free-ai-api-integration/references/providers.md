# Free AI Provider Matrix (No Billing Focus)

## OpenAI-Compatible Endpoints

| Provider | Base URL | Key Required | Free Limits (reported) | Notes |
|---|---|---|---|---|
| Google Gemini | https://generativelanguage.googleapis.com/v1beta/openai/ | Yes | Flash: 15 RPM, 1500 RPD; Pro: 2 RPM, 50 RPD | High quality; region limits may apply |
| Mistral AI | https://api.mistral.ai/v1 | Yes | 1 req/sec, up to 1B tokens/month | Strong free volume |
| Groq | https://api.groq.com/openai/v1 | Yes | 30 RPM, 14400 RPD | Very fast inference |
| Cerebras | https://api.cerebras.ai/v1 | Yes | 30 RPM, 60000 TPM | High-speed inference |
| OpenRouter | https://openrouter.ai/api/v1 | Yes | 20 RPM, 200 RPD | Use models ending in `:free` |
| GitHub Models | Varies by integration surface | Yes | Often 10-15 RPM (varies) | Strong for prototyping workflows |
| Unclose AI (general) | https://hermes.ai.unturf.com/v1 | No | Best effort/unlimited (community) | Reliability may vary |
| Unclose AI (coding) | https://qwen.ai.unturf.com/v1 | No | Best effort/unlimited (community) | Reliability may vary |
| Pollinations (text) | https://text.pollinations.ai/ | No | Best effort/unlimited | Community proxy behavior |

## Selection Heuristics
- Stability first: Gemini, Mistral, Groq, Cerebras.
- Speed first: Groq, Cerebras.
- Volume first: Mistral.
- Model flexibility first: OpenRouter free models.
- No-key requirement: Unclose or Pollinations with fallback mandatory.

## Privacy And Reliability Notes
- Check provider terms before handling sensitive data.
- Community proxies can have downtime and policy changes.
- Always add app-level timeout, retry, and fallback controls.

## Example Environment Variables

```env
AI_PROVIDER=groq
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-specdec
AI_API_KEY=your_key_here
AI_FALLBACKS=mistral,openrouter
```
