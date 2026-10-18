---
id: TASK-499
title: >-
  `archboard restart` stops the Archboard server, builds the frontend and starts
  it again
status: Done
assignee:
  - '@claude'
created_date: '2026-10-18 17:43'
updated_date: '2026-10-18 18:03'
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
- [x] #1 In a checkout, `archboard restart` stops the running server through the guarded stop of `archboard stop`, builds the frontend of the checkout whose source the CLI runs, and starts the server again. Its JSON answer names the stop result, the entry script of the new bundle, and the url and pid of the new server
- [x] #2 With no server running, `archboard restart` builds the frontend and starts a server
- [x] #3 A restart that could not start the server again (a non-loopback URL, or a Codex runtime that cannot be verified) refuses before it stops anything. A refused stop (the server of another checkout, a stuck process, a held board) refuses before the build, and nothing is started
- [x] #4 A failed build refuses with `FRONTEND_BUILD_FAILED` (exit 1). The build errors reach stderr, the server stays stopped, and the refusal says so. stdout carries only the JSON answer
- [x] #5 Every remedy that tells a person to stop and start the server, or to rebuild the frontend and restart it, names `archboard restart`: the stale-source warning of `status`, the recorder refusals, AGENTS.md, TESTING.md and the archboard-dev skill
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. `src/runtime/engine/restart.ts` (new): `restartServer()` runs `refuseUnstartableServer`, `stopServer`, a private `buildFrontend` and `ensureServerRunning` with force. `buildFrontend` runs `bun run build:frontend` in the checkout whose source the CLI runs (`SOURCE_CHECKOUT`), keeps its output, and on a nonzero exit throws `FRONTEND_BUILD_FAILED` with that output and the fact that the server is stopped. It returns the entry script of the new bundle (`frontendBuild()` of staleness.ts, which health also reports).
2. `src/runtime/engine/spawn.ts`: export `refuseUnstartableServer`, so a restart refuses before it stops a server that it could not start again.
3. `src/cli/commands/server.ts`: `restartContract` calls `restartServer`. The answer is the start answer with `stop` and `frontendBuild`. Refusals: SERVER_UNREACHABLE (3), FRONTEND_BUILD_FAILED (1). Register `restart` in `src/cli/commands/run.ts`.
4. Remedies name `archboard restart`: the stale-source warning in status.ts, the recorder refusals in walkthrough-recorder drive.ts and render.ts, the renderer config comment, AGENTS.md, TESTING.md, INSTALL.md (the update steps, and the list of commands that take no `-C`) and the archboard-dev skill.
5. Tests: `restart` joins the refusal table of tests/system/cli/source-checkout.test.ts (refuses against the server of another checkout, contacting only /health). staleness-source.test.ts expects the new remedy. No happy-path system test: it would rebuild the shared `dist/frontend` while other system tests serve it, and normal use shows a restart that does not work. The happy path is run by hand in the worktree, on its own port.
6. Board: `Command interface@TASK-499` adds the part Restart (src/runtime/engine/restart.ts) under Server access. Runtime control calls it, it calls Server launcher, and it depends on Source checkout.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Deviation from the plan: the build and the restart live together in `src/runtime/engine/restart.ts` (`restartServer`, with a private `buildFrontend`), not in `frontend-build.ts` with the composition in the CLI handler. A CLI module may not import `@/runtime/engine/lib/thrown-error` (lint rule module-entrypoints), and `spawn.ts` would pass its 600-line limit. The handler in `server.ts` stays as thin as those of start and stop. The proposal part is named Restart and calls Server launcher (stopServer, ensureServerRunning, refuseUnstartableServer).

Footprint of `Command interface@TASK-499`, read against base 36f5216f0 (the commit before the first TASK-499 code commit), against hEXl6vPG (TASK-496, the proposal parent). namedAndChanged: Runtime control, Server launcher, Restart. changedNotNamed:
- Command catalogue (`run.ts`, 2ff456528): one row added to the command table for restart. Runtime control is already drawn and reached, so the board stays true.
- Status (`status.ts`, 2ff456528): the stale-source remedy now names `archboard restart`. A wording change.
- Command contract and Commands: directory containers. Their changed files are Status, Command catalogue and Runtime control, covered above.
namedNotChanged: Source checkout, named only by the new dependency from Restart, which is normal. Skipped: Walkthrough recorder (drill-down). Its `drive.ts` and `render.ts` changed only the remedy text of three refusals, so no proposal there.
`check --code` with and without `--variant TASK-499`: no difference.

Checked by hand in the worktree (port 14080): a restart of a running server stopped pid 1694944, built `/assets/index-CdJBuXgn.js` and started pid 1803147 (about 2.4 s). With no server running, it built and started one, with `stop.stopped: false`. With `ARCHBOARD_URL=http://192.0.2.1:9`, it refused with exit 3 before the build (the index.html mtime did not change). A broken import in `frontend/main.tsx` refused with exit 1, an empty stdout, the vite error on stderr and "The Archboard server is stopped", and status then reported `running: false`.

Gate: `bun run check` passed in the worktree at d5f19efcb: lint, fmt, type-check, 4860 module tests, 253 system tests, 27 repository tests, and the browser lane (exit 0). The first run stopped at lint (module-entrypoints), which led to the restart.ts shape. Adopted `Command interface@TASK-499` at version 109. `archboard check` reports no diagnostics. `check --code` behind: Board rasterizer reads Walkthrough recorder, Page driver and Frame renderer as behind for 2ff456528, which changed only the remedy text of three recorder refusals. That board stays true. `bun run readme:check` lists the same 16 stale assets as before this task, and none of them shows the CLI command list.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added `archboard restart`. It refuses a server that it could not start again (a non-loopback URL, a Codex runtime that cannot be verified) before it stops anything. It then runs the guarded stop of `archboard stop`, builds the frontend of the checkout whose source the CLI runs with `bun run build:frontend`, and starts the server as `archboard start` does. The JSON answer is the start answer plus `stop` and `frontendBuild` (the entry script of the new bundle). A failed build refuses with `FRONTEND_BUILD_FAILED` (exit 1), carries the build output on stderr and says that the server is stopped. The code is in `src/runtime/engine/restart.ts`, and the handler in `src/cli/commands/server.ts` is as thin as those of start and stop. The stale-source warning of `status`, the recorder refusals, AGENTS.md, TESTING.md, INSTALL.md and the archboard-dev skill now name `archboard restart`.

Verification: the full gate passed. By hand in a worktree: a running server restarted with a new pid in about 2.4 s. With no server, restart built and started one. A non-loopback URL refused with exit 3 before the build. A broken frontend import refused with exit 1, an empty stdout and the server stopped. The refusal table of source-checkout.test.ts covers restart against the server of another checkout. Cases not run by hand: an unverifiable Codex runtime, a stuck process and a held board. They take the same `refuseUnstartableServer` and `stopServer` calls that start and stop already use.

Risk: a restart from inside a Codex workbench thread stops the server that runs that thread, as `archboard stop` does.
<!-- SECTION:FINAL_SUMMARY:END -->
