---
id: TASK-360
title: Move Codex to 0.158.0 and regenerate its app-server types
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-28 17:35'
updated_date: '2026-09-28 18:04'
labels:
  - codex
dependencies: []
priority: high
type: chore
ordinal: 601000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard pins @openai/codex 0.155.1 (package.json) and generates its app-server contract and TypeScript types from that exact version; the machine's own Codex CLI is 0.158.0 too, and npm's latest is 0.158.0 (2026-09-28). The user asked to update the dependency and the generated Codex types. Code, comments and docs state behaviour 'read against Codex 0.155.1' in about 57 places; a statement is only true of a new version once it is checked against that version's source, and the local source clone /home/msc/Projects/codex is kept at the pinned tag for exactly that reading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 package.json and bun.lock pin @openai/codex 0.158.0, and bun install regenerates the app-server contract and types from it
- [x] #2 Everything that uses the generated Codex types type-checks against 0.158.0, with any protocol change adapted in code rather than cast away
- [x] #3 Every statement naming the Codex version it was checked against is re-read against the 0.158.0 source and either confirmed with the new version or corrected
- [x] #4 The local Codex source clone is checked out at the 0.158.0 tag
- [ ] #5 bun run check passes, and a signed-in Archboard server starts with its workbench ready
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected: a dependency bump with no architectural change (no part, relationship or binding moves).
1. Check out rust-v0.158.0 in /home/msc/Projects/codex; diff app-server-protocol, realtime and model-list code against rust-v0.155.1.
2. Generate the contract at 0.155.1 in the worktree as a baseline, then pin @openai/codex 0.158.0 in package.json, bun install (regenerates the contract), and diff the generated TypeScript.
3. Bump the generator's expected version and CODEX_PROTOCOL_VERSION; adapt code that uses the generated types to protocol changes (no casts, no weakened rules); keep gpt-6-luna model/list selection working.
4. Re-read every statement naming 0.155.1 against the 0.158.0 source; restate it for 0.158.0 when it holds, correct it when not; update test fixtures to 0.158.0.
5. Run each gate lane under a memory cap; live smoke a signed-in server on port 3420 with a scratch web-shop vault.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Protocol diff 0.155.1 -> 0.158.0 (generated types and Rust source): image inputs name an inline URL or an uploaded file (UserInput image url|fileId; ContentItem and FunctionCallOutputContentItem input_image image_url|file_id); account/read gains workspaceRouting (nullable, always sent) and may now run a ChatGPT workspace discovery and fail with -32603, and a connection may receive an unrequested account/updated after initialize; thread/start|fork responses and ThreadSettings gain disabledPluginIds; Model gains availableAccessPrograms and supportsPersonality is always false; ThreadItemEntry gains startedAtMs/completedAtMs; mcpToolCall items gain mcpAppUi; ConfigRequirements gains modelProvider, modelProviders, allowedLoginMethods, drops windowsSandboxPrivateDesktop and widens allowedWindowsSandboxImplementations to include mxc; AppsConfig gains omit_tools_from; the openai/userVerification elicitation gains _meta; PlanType gains promax; CodexErrorInfo gains flexUnavailable; thread/rollback is removed (unused); new gateway-OAuth methods and rollout/compress (unused); thread/realtime/start gains optional backendReasoningStatus (default off, Archboard never sets it).

Decision: a discriminated union holds one member per type, so an image stays one member with both references optional and a transform (userImageReference, inputImageReference) keeps exactly one; an outer z.union was tried first and broke the closed-union diagnostics the union-challenge tests hold (a malformed image reported two issues). Version text in code (decoder recovery actions, the startup install hint) now derives from CODEX_PROTOCOL_VERSION; comments that only meant 'the generated contract' no longer name a version.

Claims re-read against the 0.158.0 source: all hold except DESIGN.md's 'feature-gated off by default' (the realtime_conversation flag gates only the TUI and is on by default in 0.158.0) and its 'capped at 4 KiB' (per field); DESIGN.md also now says reasoning summaries reach the voice model only with backendReasoningStatus. recency.ts keeps its 0.155.1 measurement and notes the emitting code is unchanged; voice-prompt.ts says read against 0.158.0 and recorded on 0.155.1. The generated-notification list comment in methods.ts was wrong at 0.155.1 too (it never held the model-provider auth-recovery notifications) and now says what it is. No board is affected.

Added 'Moving Codex to a new version' to skills/archboard-dev/SKILL.md (user request, relayed by the coordinator).

Gate (each under a memory cap): lint 0; fmt:check 0; type-check 0; test:modules 3703 pass 0 fail; test:system 180 pass 1 fail; test:repository 8 pass; test:serial-browser all files pass. The one system failure is tests/system/cli/install-targets.test.ts 'a manual whose links resolve': it calls existsSync on INSTALL.md's link TESTING.md#5-a-first-session, a link a6c71c6f added on main; this change touches neither file. AC #5 stays unchecked until that is fixed (TASK-361 tracks CI). Live smoke: a server from this worktree on 127.0.0.1:3420 with a scratch copy of examples/web-shop and the default state directory started, status reported it running, its package-local child was codex-cli 0.158.0, and its epoch manifest committed epoch/start and the coordinator thread/start (reached only after a signed-in account/read and a model/list that offered gpt-6-luna); it was then stopped.
<!-- SECTION:NOTES:END -->
