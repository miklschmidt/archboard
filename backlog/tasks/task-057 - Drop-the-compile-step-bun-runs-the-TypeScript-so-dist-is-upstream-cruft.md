---
id: TASK-057
title: 'Drop the compile step: bun runs the TypeScript, so dist/ is upstream cruft'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 18:06'
updated_date: '2026-08-20 18:33'
labels: []
dependencies: []
references:
  - bin/canvas
  - package.json
  - TESTING.md
  - INSTALL.md
  - src/cli/commands/install-skill.ts
priority: high
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upstream is a node and npm project, so it compiles TypeScript to dist/ and runs the JavaScript. This fork runs on bun, which executes TypeScript directly, and the build step has been carried along without anyone asking whether it still earns its place. It does not, and it actively causes bugs.

Proven on this machine, bun 1.3.14:

  bun src/bin.ts --help                 -> the CLI, straight from source
  PORT=34901 bun src/server.ts          -> serves /health, boards_open 1

So the server and the CLI need no build at all. Only the frontend does, because a browser cannot be handed TypeScript, and vite already covers that with a dev server and hot reload.

WHY IT MATTERS, not just tidiness. The compile step is the direct cause of TASK-056 and of two wrong diagnoses in one session:

- The running server holds whatever dist/ said when it started. Rebuild, and it keeps answering with the old behaviour while every command still works. After merging a fix, `describe` reported the new behaviour (the CLI computes it in its own process from the fresh dist) and `compare` reported the old one (it is a server route). Two commands, one board, two answers, neither wrong on its own terms.
- Earlier in the same session that same ambiguity led to restarting the user's server on a diagnosis that turned out to be wrong.
- The browser tab has the identical problem one layer out, and only learns by timing out after ten seconds.

None of that exists if the process reads the source it was told to read.

SCOPE

- bin/canvas execs `node dist/bin.js`; it should exec bun against src/bin.ts.
- Every test script is prefixed `bun run build:server &&`, and the thirteen check scripts import from a dist() helper.
- package.json: build:server, build:types, dev:server and the dist half of build all go. build:frontend stays.
- TESTING.md and INSTALL.md tell MCP clients to spawn `node .../dist/bin.js`, and install-skill writes the resolved invocation into a target repo's CLAUDE.md.

TWO THINGS THAT MUST NOT BE LOST

1. Type checking. Today every `test:*` runs tsc as a side effect of building, so a type error fails the suite. Remove the emit and that safety net goes with it silently. `type-check` already exists as tsc --noEmit for both projects and has to become part of `bun run test` rather than a thing to remember.

2. Board state. `bun --watch` restarts the process, and boards live in memory, so unsaved work on the canvas dies with it. Hot reload belongs in an explicit dev script, never in `canvas start`. Losing a human's unsaved rearrangement to a file save is worse than any build step.

Also check whether node is still required anywhere on purpose. scripts/check-local-bind.mjs branches on the runtime name, which suggests someone already thought about this, and scripts/check-mcp-stdio.mjs reports "using node".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bin/canvas runs the CLI from src with no build step
- [x] #2 The canvas server runs from src with no build step
- [x] #3 bun run test needs no compile and still fails on a type error
- [x] #4 The frontend still builds, and a dev mode with hot reload exists that does not restart the canvas server by default
- [x] #5 TESTING.md, INSTALL.md, CLAUDE.md and install-skill no longer tell anyone to run dist/
- [x] #6 dist/ is gone from the repo and from .gitignore expectations, or what remains of it is only the frontend bundle
- [x] #7 Editing a server source file reloads the running canvas without dropping open boards, their unsaved elements, or connected browser tabs
- [x] #8 The change feed survives a reload: cursors and baselines are not reset, so a reload emits no spurious events and loses no real ones
- [x] #9 Pane registrations survive a reload, so panes reports the same panes holding the same boards immediately afterwards
- [x] #10 The default canvas start does not watch files; hot reload is asked for explicitly
- [x] #11 A check proves boards and panes survive a reload, rather than asserting it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. bin/canvas execs bun against src/bin.ts; src/bin.ts gets a bun shebang.
2. package.json: drop build:server, build:types, dev:server and the dist half of build. start/cli/canvas run bun against src. main/bin point at source and the wrapper. build:frontend stays. dev runs the canvas server plus vite HMR; an explicit dev:reload adds bun --watch and says in the docs that it drops unsaved boards.
3. test: prefix bun run test with type-check so a type error still fails the suite, and drop the build prefix from all thirteen test:* scripts. Each check script runs under bun.
4. scripts/*.mjs: the dist() helper becomes src(), imports point at .ts, spawns use process.execPath (bun). check-mcp-stdio and check-local-bind lose the dead node branch, because only bun can run a .ts entry; keep the RUNTIME env overrides only if they still mean something.
5. src/core/spawn.ts spawns ../server.ts; comments and error text that name dist/ in spawn.ts, bin.ts, library.ts, install-skill.ts and cli/run.ts get corrected. resolveInvocation stops offering node dist/bin.js and offers the wrapper or bun src/bin.ts.
6. tsconfig.json goes noEmit so nothing can refill dist/; drop outDir, rootDir and the declaration flags.
7. Docs: TESTING.md, INSTALL.md, CLAUDE.md, README.md, skills/archboard-dev, skills/excalidraw-skill and .github/workflows/ci.yml. MCP client configs spawn bun, so say bun must be on PATH. .gitignore keeps dist/ but says it now holds only the frontend bundle.
8. Prove AC3 by introducing a deliberate type error, showing bun run test fail on it, and removing it. Run the full suite green.
9. Judge the ADR and write 0014 if it clears the bar.

10. Scope correction from the user: hot-reloading the canvas is a capability, not a hazard. bun --hot re-evaluates modules in the running process where bun --watch restarts it, so the long-lived state moves behind a kept() helper on globalThis, the http and WebSocket servers are created once and reused, handlers are replaced rather than added, and scripts/check-hot-reload.mjs proves boards, panes, sockets and the change feed survive an edit to a real source file. canvas start still watches nothing, and the check reads its command line to say so.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification, all against the final tree.

AC1/AC2: bun run test ran green with no dist/ directory in the worktree at all (ls: cannot access 'dist'). bin/canvas execs bun src/bin.ts; ./bin/canvas start on port 39117 auto-spawned '/nix/store/.../bun /.../src/server.ts' (ps output), served the frontend, took an add, described the board and saved a note.

AC3: appended 'export const ac3: number = "not a number"' to src/core/panes.ts; bun run test failed at its first step with src/core/panes.ts(472,14): error TS2322 and ran no suite. Removed, type-check exits 0, git diff empty. The same proof passed earlier against src/core/promote.ts.

AC4: bunx vite build produced dist/frontend and dist/ holds nothing else. bun run dev:canvas is bun --hot; bun run dev adds vite. Hot reload verified below.

AC5: no dist/ invocation remains anywhere. TESTING.md and INSTALL.md now spawn bun against src/bin.ts and say bun must be on the client's PATH; install-skill writes bin/canvas or 'bun <root>/src/bin.ts' and tells the target repo bun is needed; CLAUDE.md, README.md and both skills updated. check-install-doc (33 checks) covers the written block.

AC6: dist/ contains only frontend/. .gitignore keeps it with a comment saying so. tsconfig carries noEmit so a bare tsc cannot refill it.

AC7/AC8/AC9/AC11: scripts/check-hot-reload.mjs, 20 checks, wired in as test:hot. It runs a canvas under bun --hot, opens a pane socket, draws two unsaved elements, then edits src/server.ts and src/core/board-store.ts for real. Same pid, socket never closed, elements and their ids unchanged, pane registration intact holding the same board, feedId and cursor unchanged, zero events emitted by the reload, a post-reload element still broadcast to the pre-reload socket, and one event for the real change. Negative control: removing the board-store scratch guard makes it fail 3 checks. Also confirmed with a real Chrome tab against a canvas on 39131 — the tab, connected before the reload, received an element created after it without reconnecting.

AC10: the check starts a canvas through the CLI and reads its command line with ps: 'bun /.../src/server.ts', no --hot, no --watch.

Suite: 14 suites, 427 ok lines, 0 FAIL, exit 0. The user's canvas on port 3000 was never touched; every test canvas used a random high port and a throwaway vault.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The compile step is gone. bin/canvas execs bun against src/bin.ts, the CLI spawns bun src/server.ts, the check scripts import the .ts files, MCP client configs spawn bun, and only the frontend is built. Type checking was a side effect of compiling before every test, so bun run test now runs type-check first, and tsconfig carries noEmit so a bare tsc cannot refill dist/.

The canvas also reloads in place. bun --hot re-evaluates modules inside the running process where bun --watch restarts it, so the long-lived state moved behind kept() in src/core/hot.ts and the http and WebSocket servers are created once and reused: bun run dev:canvas picks up an edit without dropping a board, a pane, a socket or a change-feed cursor. canvas start still watches nothing.

Verified: bun run test green, 14 suites, 427 checks, with no dist/ present. A deliberate type error in src/core/panes.ts failed the suite at its first step and was removed. scripts/check-hot-reload.mjs (20 checks) edits real source files under a real canvas and fails 3 checks when the board-store guard is removed. A real Chrome tab connected before a reload received an element created after it without reconnecting. ADR 0014 records the decision and the rules that come with it.
<!-- SECTION:FINAL_SUMMARY:END -->
