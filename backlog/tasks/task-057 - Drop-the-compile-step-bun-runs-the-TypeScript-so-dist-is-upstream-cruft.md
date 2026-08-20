---
id: TASK-057
title: 'Drop the compile step: bun runs the TypeScript, so dist/ is upstream cruft'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 18:06'
updated_date: '2026-08-20 18:19'
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
- [ ] #1 bin/canvas runs the CLI from src with no build step
- [ ] #2 The canvas server runs from src with no build step
- [ ] #3 bun run test needs no compile and still fails on a type error
- [ ] #4 The frontend still builds, and a dev mode with hot reload exists that does not restart the canvas server by default
- [ ] #5 TESTING.md, INSTALL.md, CLAUDE.md and install-skill no longer tell anyone to run dist/
- [ ] #6 dist/ is gone from the repo and from .gitignore expectations, or what remains of it is only the frontend bundle
- [ ] #7 Editing a server source file reloads the running canvas without dropping open boards, their unsaved elements, or connected browser tabs
- [ ] #8 The change feed survives a reload: cursors and baselines are not reset, so a reload emits no spurious events and loses no real ones
- [ ] #9 Pane registrations survive a reload, so panes reports the same panes holding the same boards immediately afterwards
- [ ] #10 The default canvas start does not watch files; hot reload is asked for explicitly
- [ ] #11 A check proves boards and panes survive a reload, rather than asserting it
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
<!-- SECTION:PLAN:END -->
