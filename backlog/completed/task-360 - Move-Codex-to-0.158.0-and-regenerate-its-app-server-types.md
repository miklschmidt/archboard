---
id: TASK-360
title: Move Codex to 0.158.0 and regenerate its app-server types
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 17:35'
updated_date: '2026-09-28 18:36'
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
- [x] #5 bun run check passes, and a signed-in Archboard server starts with its workbench ready
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected: a dependency bump with no architectural change (no part, relationship or binding moves).
1. Check out rust-v0.158.0 in /home/msc/Projects/codex; diff app-server-protocol, realtime and model-list code against rust-v0.155.1.
2. Generate the contract at 0.155.1 in the worktree as a baseline, then pin @openai/codex 0.158.0 in package.json, bun install (regenerates the contract), and diff the generated TypeScript.
3. Bump the generator's expected version and CODEX_PROTOCOL_VERSION; adapt code that uses the generated types to protocol changes (no casts, no weakened rules); keep gpt-6-luna model/list selection working.
4. Re-read every statement naming 0.155.1 against the 0.158.0 source; restate it for 0.158.0 when it holds, correct it when not; update test fixtures to 0.158.0.
5. Run each gate lane under a memory cap; live smoke a signed-in server on port 3420 with a scratch web-shop vault.

6. Review follow-up: a failed account/read no longer stops startup; name the undecoded notifications; record omitted params; derive fixture versions from the protocol constants.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Protocol diff 0.155.1 -> 0.158.0 (generated types and Rust source): image inputs name an inline URL or an uploaded file (UserInput image url|fileId; ContentItem and FunctionCallOutputContentItem input_image image_url|file_id); account/read gains workspaceRouting (nullable, always sent) and may now run a ChatGPT workspace discovery and fail with -32603, and a connection may receive an unrequested account/updated after initialize; thread/start|fork responses and ThreadSettings gain disabledPluginIds; Model gains availableAccessPrograms and supportsPersonality is always false; ThreadItemEntry gains startedAtMs/completedAtMs; mcpToolCall items gain mcpAppUi; ConfigRequirements gains modelProvider, modelProviders, allowedLoginMethods, drops windowsSandboxPrivateDesktop and widens allowedWindowsSandboxImplementations to include mxc; AppsConfig gains omit_tools_from; the openai/userVerification elicitation gains _meta; PlanType gains promax; CodexErrorInfo gains flexUnavailable; thread/rollback is removed (unused); new gateway-OAuth methods and rollout/compress (unused); thread/realtime/start gains optional backendReasoningStatus (default off, Archboard never sets it).

Decision: a discriminated union holds one member per type, so an image stays one member with both references optional and a transform (userImageReference, inputImageReference) keeps exactly one; an outer z.union was tried first and broke the closed-union diagnostics the union-challenge tests hold (a malformed image reported two issues). Version text in code (decoder recovery actions, the startup install hint) now derives from CODEX_PROTOCOL_VERSION; comments that only meant 'the generated contract' no longer name a version.

Claims re-read against the 0.158.0 source: all hold except DESIGN.md's 'feature-gated off by default' (the realtime_conversation flag gates only the TUI and is on by default in 0.158.0) and its 'capped at 4 KiB' (per field); DESIGN.md also now says reasoning summaries reach the voice model only with backendReasoningStatus. recency.ts keeps its 0.155.1 measurement and notes the emitting code is unchanged; voice-prompt.ts says read against 0.158.0 and recorded on 0.155.1. The generated-notification list comment in methods.ts was wrong at 0.155.1 too (it never held the model-provider auth-recovery notifications) and now says what it is. No board is affected.

Added 'Moving Codex to a new version' to skills/archboard-dev/SKILL.md (user request, relayed by the coordinator).

Gate (each under a memory cap): lint 0; fmt:check 0; type-check 0; test:modules 3703 pass 0 fail; test:system 180 pass 1 fail; test:repository 8 pass; test:serial-browser all files pass. The one system failure is tests/system/cli/install-targets.test.ts 'a manual whose links resolve': it calls existsSync on INSTALL.md's link TESTING.md#5-a-first-session, a link a6c71c6f added on main; this change touches neither file. AC #5 stays unchecked until that is fixed (TASK-361 tracks CI). Live smoke: a server from this worktree on 127.0.0.1:3420 with a scratch copy of examples/web-shop and the default state directory started, status reported it running, its package-local child was codex-cli 0.158.0, and its epoch manifest committed epoch/start and the coordinator thread/start (reached only after a signed-in account/read and a model/list that offered gpt-6-luna); it was then stopped.

Review follow-up: at 0.158.0 account/read for a ChatGPT sign-in runs a workspace-routing check and any failure is a -32603 answer, which initializeSession threw into abandonStartup, stopping the server. initializeSession now treats a JSON-RPC error answer (CodexTransportRemoteError) as an account it could not read: the session is marked ready with the account not ready, the pane gets the existing 'could not be read, refresh' state, and a refresh reads it; a read Codex never answers still fails startup. Proved by tests/system/server-state/codex-account-read-failure.test.ts (red with the catch disabled: owned server died, exit 1). DESIGN.md's bound app-server section records that account/read now needs the network and can fail. A model list without gpt-6-luna still stops startup (hooks' ensureCoordinator throws when the coordinator is not ready); not small, filed as TASK-363. methods.ts names the four undecoded notifications; the authored contracts doc lists daybreakEnabled and disabledPluginIds as omitted; TypeScript fixtures take the version from CODEX_PROTOCOL_VERSION / CODEX_PROTOCOL_BINARY_VERSION.

Final gate after merging origin/main (a9269293), each lane capped and alone: lint 0, fmt:check 0, type-check 0, build:frontend 0, test:modules 3703 pass 0 fail, test:system 182 pass 0 fail (after moving the fake's account error ahead of the switch, which a process-contract fixture patches by text), test:repository 8 pass, test:serial-browser 15 files, 0 failures. Smoke: server on 127.0.0.1:3420 with a scratch web-shop vault and the default state directory started, status reported it running, its child ran the package-local 0.158.0, and the epoch manifest committed epoch/start and the coordinator thread/start as delivered; stopped.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned @openai/codex 0.158.0 (package.json, bun.lock, the generator and CODEX_PROTOCOL_VERSION) and adapted the handwritten protocol schemas to the regenerated contract without casts: image references by URL or uploaded file, account/read workspaceRouting, disabledPluginIds, availableAccessPrograms, item timestamps, mcpAppUi, the new config requirements, _meta on user verification, promax and flexUnavailable. Because account/read now calls the backend and can fail, a failed read leaves the server running with the account marked for refresh instead of stopping startup (the model-list case is TASK-363). Every statement that named 0.155.1 was re-read against the 0.158.0 source and restated or corrected (DESIGN.md's feature-gate and 4 KiB cap claims were wrong), version text in code and TypeScript fixtures derives from the protocol constants, and the archboard-dev skill now has the upgrade procedure. Verified by the full gate lane by lane (all green) and a signed-in smoke server whose coordinator started.
<!-- SECTION:FINAL_SUMMARY:END -->
