# Agent Change Log

> Maintained by the coding agent. Newest entries at the top.

---

## 2026-10-18 — Sync to upstream v0.2.1+ and multi-provider AI chat (MiMo)

**Trigger:** fork was 1,056 commits behind upstream (v0.1.1 → v0.2.1 + unreleased).

**What changed:**
- Replayed the DeepSeek commit onto upstream `93ea088f`; resolved 7 conflicts
  (both-sides additions). Ported to upstream's renamed rate-limit helpers —
  the old imports would have stopped the server from starting.
- DeepSeek proxy generalized into `server/providers/ai-chat.js` with an
  OpenAI-compatible provider table; added **Xiaomi MiMo** (Token Plan via
  `MIMO_API_BASE`). Panel renamed GEV AI, with a provider picker.
- `/api/ai/chat` now refuses cross-site browser requests (upstream
  `sameSiteGated`) and is rate-limited by default (60/min).
- Fixed: the DeepSeek HUD summary was always blank (`deepseek-flash` spent
  the 100-token budget thinking). Thinking is now disabled for both providers.
- Chat panel copy translated (ru/es) to pass upstream's i18n gate; cyber.css
  kept as the last stylesheet import.

**Verified:** `npm test` 7722 pass; remaining failures reproduce on pristine
upstream (Windows 403s) or are flaky. Live: both providers call
`fly_to_location`; HUD summary returns text; headless Edge drove the panel
(MiMo, "Fly to Tokyo") with no page errors.

---

## 2026-09-18 — Fork reset: latest upstream + DeepSeek only

**Trigger:** abandon the experimental layers (GDELT news heatmap, NASA EONET)
and start fresh from the official upstream, keeping only the working DeepSeek
integration.

**What changed:**
- Rebased the `deepseek-integration` commit (`e1c0cbf`) onto the latest
  `bilawalsidhu/gods-eye-view` `main` (`0d41b6b`).
- Result: a clean linear history — upstream + one DeepSeek commit (`27ad3af`).
- Archived the previous Oracle Edition (EONET + news + fixes) under the tag
  `archive/oracle-edition-pre-reset`.
- Added `.github_agent_auth.json` to `.gitignore`.
- Rewrote `AGENTS.md` + `LOG.md` fresh.

**Kept (the only fork-specific change):** the DeepSeek integration
(`server/providers/deepseek.js`, `src/ai/*`, `src/ui/styles/deepseek-chat.css`,
and its wiring) — this works and is the foundation for the multi-provider stack.

**Next (planned):** OpenRouter, then Gemini Studio / Google AI, then free/local
providers — with a DOYR (do-your-own-research) pass on each API's terms/limits
before wiring.
