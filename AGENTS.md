# God's Eye View — Oracle Edition (DeepSeek fork)

An **official fork of [`bilawalsidhu/gods-eye-view`](https://github.com/bilawalsidhu/gods-eye-view)**
that layers a multi-provider AI stack on top of the upstream spatial-intelligence
console. Everything from upstream is kept current; this fork adds exactly one
thing on top of it: the DeepSeek integration.

> **Status (2026-09):** Fork rebased onto the latest upstream `main`. The only
> addition over upstream is the DeepSeek-V4.1-Flash integration (text
> tool-calling + HUD summary), which works out of the box and is opt-in via a key.

---

## 1. What this fork adds

### DeepSeek integration (the one change from upstream)
- **`server/providers/deepseek.js`** — server-side proxy for DeepSeek's
  OpenAI-compatible chat/completions API. Keeps the key server-side (never sent
  to the browser) and applies per-provider rate limiting.
- **`src/ai/deepseekChat.js` + `src/ai/deepseekController.js`** — a glass-morphism
  chat panel that talks to the proxy (native Chat UI, no OpenAI key needed).
- **`src/ui/styles/deepseek-chat.css`** — the chat panel styles.
- **Wiring** — registered in `server/providers/local.js`, `src/app/tools.js`,
  `src/overlays/worldOverlay.js`, `src/ui/panelLayoutController.js`, and the HUD
  summary fallback in `server/providers/openai/hud-summary.js`.
- **Key setup** — `.env.example` + `pinokio/_ENVIRONMENT` expose `DEEPSEEK_API_KEY`
  (opt-in; the app still runs keyless without it).

### Multi-provider AI strategy
- **Default: DeepSeek-V4.1-Flash** for text tool-calling and the 5-word HUD
  summary (context caching makes tool-calling ~$0.001/100 commands).
- **OpenAI Realtime** (voice) remains from upstream — expensive, opt-in.
- Rate limits are configurable: `GEV_RATELIMIT_DEEPSEEK_PER_MIN`, etc.

## 2. Roadmap (prioritized — DYOR before wiring anything)

1. **OpenRouter** — one key routes to many models (DeepSeek, Gemini, Llama,
   Qwen…). Likely the next provider; confirms a clean "add a provider" path.
2. **Gemini Studio / Google AI** — free tier + generous limits; good voice/vision.
3. **Free/local options** — Ollama (local), Groq (free tier), Mistral.
4. Keep upstream in sync: this fork tracks `bilawalsidhu/gods-eye-view` and
   should be rebased periodically (see §3).

## 3. Sync workflow (how this fork stays current)

The fork is a clean linear history: **upstream `main` + one DeepSeek commit**.

```sh
git fetch origin                       # origin = bilawalsidhu/gods-eye-view
git rebase origin/main                 # replay the DeepSeek commit on top
# resolve any conflicts (DeepSeek files vs upstream changes), then:
git push oracle main --force-with-lease
```

## 4. Guardrails (inherited from upstream + this fork)

1. **Keyless by default, opt-in keys.** The app runs with zero keys; providers
   are enabled via `pinokio/ENVIRONMENT`.
2. **Server-side key isolation.** Keys never reach client JavaScript.
3. **Rate limiting.** Per-provider `GEV_RATELIMIT_*_PER_MIN` ceilings.
4. **Every source documented & attributed.** New data sources add a row to
   `DATA_SOURCES.md` **and** a credit in `src/data/dataCredits.js`.

---

See `LOG.md` for the change history and upstream's docs (`docs/`, `CHANGELOG.md`)
for the full feature set.
