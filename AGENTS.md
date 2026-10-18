# God's Eye View — Oracle Edition (multi-provider AI fork)

An **official fork of [`bilawalsidhu/gods-eye-view`](https://github.com/bilawalsidhu/gods-eye-view)**
that layers a multi-provider AI text chat on top of the upstream spatial-intelligence
console. Everything from upstream is kept current; this fork adds exactly one
thing on top of it: the GEV AI chat panel with DeepSeek and Xiaomi MiMo.

> **Status (2026-10-18):** Fork synced onto upstream `main` past v0.2.1
> (`93ea088f`). Fork additions: GEV AI chat (text tool-calling + HUD summary
> fallback) through DeepSeek and/or Xiaomi MiMo, opt-in via keys.

---

## 1. What this fork adds

### GEV AI chat (the one change from upstream)
- **`server/providers/ai-chat.js`** — server-side proxy for OpenAI-compatible
  chat/completions providers, driven by the `AI_CHAT_PROVIDERS` table
  (`deepseek`, `mimo`). Keys stay server-side; `/api/ai/chat` is
  `sameSiteGated` and rate-limited like upstream's other cost endpoints.
  Endpoints: `GET /api/ai/status`, `POST /api/ai/chat` (`{ provider, messages }`).
- **`src/ai/aiChat.js` + `src/ai/aiChatController.js`** — the glass-morphism
  chat panel (provider picker when >1 key is set) and the tool-calling loop over
  the same GEV action runner voice uses.
- **`src/ui/styles/ai-chat.css`** — panel styles (classes keep the `ds-` prefix).
- **Wiring** — `server/providers/local.js`, `src/app/tools.js`,
  `src/overlays/worldOverlay.js`, `src/ui/panelLayoutController.js`, the HUD
  summary fallback in `server/providers/openai/hud-summary.js`, Provider
  Settings (`src/keySetupCore.mjs`), setup doctor, Pinokio env plumbing.
- **Tests** — `server/providers/ai-chat.test.mjs`.

### Configuration (`pinokio/ENVIRONMENT` or `.env`)
| Var | Meaning |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek key (`DEEPSEEK_COMMAND_MODEL` / `DEEPSEEK_HUD_SUMMARY_MODEL`, default `deepseek-flash`) |
| `MIMO_API_KEY` | Xiaomi MiMo key: `sk-` pay-as-you-go, `tp-`/`ttp-` Token Plan |
| `MIMO_API_BASE` | Required for Token Plan, e.g. `https://token-plan-sgp.xiaomimimo.com/v1` |
| `MIMO_COMMAND_MODEL` / `MIMO_HUD_SUMMARY_MODEL` | default `mimo-v2.6-flash` (`mimo-v2.6-pro` for harder asks) |
| `AI_CHAT_PROVIDER` | default chat provider + HUD summary provider (`deepseek` / `mimo`) |
| `GEV_RATELIMIT_AI_CHAT_PER_MIN` | per-IP cap, default 60, `0` disables |

Provider gotchas learned the hard way:
- Thinking is disabled on both (`thinking: {type: 'disabled'}`); with it on,
  the 100-token HUD summary is spent on reasoning and returns empty content.
- MiMo has no OAuth — API keys only. `mimo-v2.5*` ids are retired 2026-10-21.
- `reasoning_content` is stripped from replayed history so switching provider
  mid-conversation is safe.

## 2. Roadmap (prioritized — DYOR before wiring anything)

1. **Use upstream's tool catalog (`src/tools/`)** for chat, not just the voice
   action tools: situation brief, analyst queries, region scopes.
2. **OpenRouter / Gemini / Ollama / Groq** — each is one entry in
   `AI_CHAT_PROVIDERS` if OpenAI-compatible.
3. **Watch mode** — periodic AI briefing from the situation brief + `pterm push`.
4. **Natural-language alerts** ("7700 squawk within 200 km of Warsaw").
5. **MiMo TTS / ASR** (`mimo-v2.5-tts`, `mimo-v2.5-asr`) as a cheaper voice path.
6. Keep upstream in sync (§3).

## 3. Sync workflow (how this fork stays current)

Linear history: **upstream `main` + the fork commits** (DeepSeek, multi-provider
AI chat, docs).

```sh
git fetch origin                       # origin = bilawalsidhu/gods-eye-view
git rebase origin/main                 # replay the fork commits on top
# usual conflicts: .env.example, scripts/dev-fresh.sh, package-boundaries.json,
# server/providers/local.js, src/app/tools.js, style.css (keep both sides;
# cyber.css must stay the last @import), then:
npm ci && npm test
git push oracle main --force-with-lease
```

Known on this Windows box: 5 upstream tests in `src/tooling/localServices`,
`src/tooling/previewServing` and `src/tools/localRoute` fail with 403 on
pristine upstream too; `streetLevel/meshSampler` is timing-flaky.

## 4. Guardrails (inherited from upstream + this fork)

1. **Keyless by default, opt-in keys.** The app runs with zero keys; providers
   are enabled via `pinokio/ENVIRONMENT`.
2. **Server-side key isolation.** Keys never reach client JavaScript.
3. **Cost endpoints** are `sameSiteGated` and rate-limited by default.
4. **UI text goes through `t()`/`msg()`** with ru/es translations (`npm run i18n`).
5. **Every source documented & attributed.** New data sources add a row to
   `DATA_SOURCES.md` **and** a credit in `src/data/dataCredits.js`.

---

See `LOG.md` for the change history and upstream's docs (`docs/`, `CHANGELOG.md`)
for the full feature set.
