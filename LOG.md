# Agent Change Log

> Maintained by the coding agent. Newest entries at the top.

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
