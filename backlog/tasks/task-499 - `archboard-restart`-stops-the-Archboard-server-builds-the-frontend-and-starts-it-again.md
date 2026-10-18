---
id: TASK-499
title: >-
  `archboard restart` stops the Archboard server, builds the frontend and starts
  it again
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-18 17:43'
updated_date: '2026-10-18 17:46'
labels:
  - cli
dependencies: []
priority: medium
type: enhancement
ordinal: 864000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A server reads its source once, at start, and serves the frontend bundle that was built last. After an edit, a person runs `archboard stop && archboard start`, and after a frontend change also `bun run build:frontend`. Forgetting the build leaves the new server serving an old bundle, and the recorder refusals already tell people to do both steps by hand. The owner asked for one command that does all three in order (2026-10-18). ADR 0021 keeps one guarded restart path, and this command composes it: it adds no reload.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a checkout, `archboard restart` stops the running server through the guarded stop of `archboard stop`, builds the frontend of the checkout whose source the CLI runs, and starts the server again. Its JSON answer names the stop result, the entry script of the new bundle, and the url and pid of the new server
- [ ] #2 With no server running, `archboard restart` builds the frontend and starts a server
- [ ] #3 A restart that could not start the server again (a non-loopback URL, or a Codex runtime that cannot be verified) refuses before it stops anything. A refused stop (the server of another checkout, a stuck process, a held board) refuses before the build, and nothing is started
- [ ] #4 A failed build refuses with `FRONTEND_BUILD_FAILED` (exit 1). The build errors reach stderr, the server stays stopped, and the refusal says so. stdout carries only the JSON answer
- [ ] #5 Every remedy that tells a person to stop and start the server, or to rebuild the frontend and restart it, names `archboard restart`: the stale-source warning of `status`, the recorder refusals, AGENTS.md, TESTING.md and the archboard-dev skill
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `src/runtime/engine/frontend-build.ts` (new): `buildFrontend()` runs `bun run build:frontend` in the checkout whose source the CLI runs (`SOURCE_CHECKOUT`), keeps its output, throws `FRONTEND_BUILD_FAILED` with that output on a nonzero exit, and returns the entry script of the new bundle (`frontendBuild()` of staleness.ts, which health also reports).
2. `src/runtime/engine/spawn.ts`: export `refuseUnstartableServer`, so a restart refuses before it stops a server that it could not start again.
3. `src/cli/commands/server.ts`: `restartContract` runs refuseUnstartableServer, stopServer, buildFrontend, then ensureServerRunning with force. A failed build says that the server is stopped. The answer is the start answer with `stop` and `frontendBuild`. Refusals: SERVER_UNREACHABLE (3), FRONTEND_BUILD_FAILED (1). Register `restart` in `src/cli/commands/run.ts`.
4. Remedies name `archboard restart`: the stale-source warning in status.ts, the recorder refusals in walkthrough-recorder drive.ts and render.ts, AGENTS.md, TESTING.md and the archboard-dev skill. Sweep `git grep` for `archboard stop && archboard start` and `build:frontend` advice.
5. Tests: `restart` joins the refusal table of tests/system/cli/source-checkout.test.ts (refuses against the server of another checkout, contacting only /health). staleness-source.test.ts expects the new remedy. No happy-path system test: it would rebuild the shared `dist/frontend` while other system tests serve it, and normal use shows a restart that does not work. The happy path is run by hand in the worktree, on its own port.
6. Board: `Command interface@TASK-499` adds the part Frontend build (src/runtime/engine/frontend-build.ts), Runtime control calls it, and it depends on Source checkout. Runtime control now also restarts.
<!-- SECTION:PLAN:END -->
