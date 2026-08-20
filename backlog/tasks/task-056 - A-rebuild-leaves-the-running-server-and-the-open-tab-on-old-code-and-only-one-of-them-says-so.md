---
id: TASK-056
title: >-
  A rebuild leaves the running server and the open tab on old code, and only one
  of them says so
status: Done
assignee: []
created_date: '2026-08-20 15:04'
updated_date: '2026-08-20 21:51'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/pidfile.ts
  - frontend/src/canvas/useCanvasSession.ts
  - docs/adr/0014-no-build-step-bun-runs-the-source.md
  - src/core/reload-token.ts
  - src/cli/commands/server.ts
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hit three times while working on this repo, twice in one session, and each time it cost a wrong conclusion before the real cause turned up.

Nothing tells you that the canvas server is running code older than the source on disk. The server reads its module graph at start; a later edit changes the files and nothing in the running process. Every command keeps working and answers from the old behaviour.

What that looks like in practice:

- After merging a fix, `describe` reported the new behaviour (the CLI computes it in its own short-lived process, from the fresh source) while `compare` reported the old one (it is a server route, in a process from before the edit). Two commands, one board, two answers, and neither wrong on its own terms. The first read of that was that the fix had not worked.
- Earlier in the same session I searched for a symbol, could not find it, and concluded the server was stale when it was not. The real cause was unrelated. A tool that could have answered "the server started at X, the source changed at Y" would have settled both in one line.

The browser tab has the same problem and already handles it. `pane close` on a tab loaded before the frontend was rebuilt answers: "The browser was asked to close the right pane and it is still there after 10 seconds. The tab may be running an older build of the canvas — reload it and try again." That message is what good looks like. It is also only reachable through one command, by timing out, after ten seconds.

`status` is the natural home for the server half: it already reports pid, url and element count, and comparing the process start time against the source is enough to say "this server predates your edits; reload or restart it to pick them up". The same fact could be surfaced to a browser at connect time so the tab can say it out loud rather than waiting to time out.

WHAT TO COMPARE AGAINST, POST ADR 0014. This task was filed before the build step was removed, and its original wording said to compare against the mtime of `dist/server.js`. That file no longer exists. `bin/canvas` execs `bun src/bin.ts`, the CLI spawns `bun src/server.ts`, and only the frontend is built (`bunx vite build` -> `dist/frontend`). So there are two different comparisons now, one per half:

- The server half compares the process start time against the newest mtime in the server's own module graph under `src/`. `scripts/check-module-scope.mjs` already walks exactly that graph from `src/dev-canvas.ts` and `src/server.ts`, so the traversal exists and does not have to be invented.
- The frontend half compares what the tab loaded against the mtime of `dist/frontend`, which is still a build artefact and still goes stale independently.

`archboard reload` (src/core/reload-token.ts) exists under the dev entry and re-evaluates the module graph in place, so the remedy the message names should be "reload" where a reload token is armed and "restart" where it is not.

ADR 0014 records this mechanism as one of the reasons the build step went, and names this task.

Not a correctness bug. It is the kind of friction that turns a two-minute check into a wrong diagnosis, and it will hit every agent that edits this repo and then tests it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 status says when the running server predates the current build, and what to do
- [x] #2 A tab running a frontend older than the current build learns without waiting for a command to time out
- [x] #3 The check does not fire when the server and the build agree
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New src/core/staleness.ts. The server half asks bun's own module registry (require.cache) which files this process actually loaded, so nothing has to re-derive the import graph, and takes the newest mtime among the ones under src/. The baseline is a module-scope timestamp, which bun --hot resets on a reload, so a reload clears the warning the way a restart does.
2. /health carries that state, plus the entry script the built frontend is on now.
3. status prints it and names the remedy: reload where a reload token is armed, restart where it is not.
4. The frontend half rides the pane pulse. A pane already posts /api/panes on connect, on every change and on every scroll; it now says which bundle it loaded, and the reply says when that is not the bundle on disk. A tab that goes stale while it is open therefore learns on its next interaction rather than on a command timing out ten seconds later.
5. The pane registration keeps the build, so panes and status can name the stale tab too.
6. New scripts/check-staleness.mjs: touch a file the canvas loaded, watch /health and status turn; post a pane with an old bundle and with the current one, watch the reply turn and stay quiet. Wire it into bun run test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WHAT CHANGED

src/core/staleness.ts (new). Two questions, one file. The server half asks bun's own module registry (require.cache, which bun keeps populated for ESM too) which files this process loaded, takes the newest mtime among the ones under src/, and compares it with a module-scope timestamp of the evaluation that is asking. Using the registry rather than a walk of the import graph means the answer is about what this process is running, not about what a reader of the source thinks it would run, and it cannot drift as modules are added. The tab half reads the entry script vite names in dist/frontend/index.html; the name carries a content hash, so a rebuild that changed nothing is not a difference anybody hears about.

src/server.ts:3157-3160 puts both in /health. src/server.ts:1666-1683 adds an optional build to the pane schema and answers a pane report with staleFrontend when the tab is on a bundle the canvas no longer serves. src/core/panes.ts:55-60 carries build on the registration.

src/cli/commands/server.ts:66-124: status prints the stale object and a sentence on stderr, and picks the remedy from health.reloadable, so a canvas that cannot reload is never told to.

frontend/src/canvas/api.ts:70-108 reads the tab's own script tag and types the reply; frontend/src/canvas/useCanvasSession.ts:141-143, 176, 213-222 sends it and warns once per build.

WHAT THE MEASUREMENT COST

require.cache is not a stable list under bun --hot. Re-evaluating the watched entry drops the canvas's own modules out of it, so a naive read collapses to src/dev-canvas.ts and reports the canvas current at the moment it went behind. The set is accumulated across calls instead, emptied by a reload along with the rest of module scope. That is the one waived line in check-module-scope, and it is the only place a reload SHOULD drop state rather than keep it.

REVERT-PROOF, three separate reverts

1. Drop source from /health: test:staleness 4 FAIL (it gives up at the timeout waiting for the canvas to notice, so the 14 assertions after it never run), test:hot 3 FAIL. Seven across two suites.
2. Read the registry fresh on each call instead of accumulating: test:staleness 0 FAIL, test:hot 2 FAIL. That is the dev-mode-only regression above, and it is why the reload assertions live in check-hot-reload rather than being simulated.
3. Drop staleFrontend from the pane reply: test:staleness 2 FAIL.

Suite: 446 ok before, 467 after, exit 0. The two checks contribute exactly 21: 18 in the new scripts/check-staleness.mjs, 3 in check-hot-reload.mjs.

AC 2 IN A REAL BROWSER, since no check in the suite drives one. Headless Chrome through agent-browser, in its own session, on a throwaway canvas and port: open the canvas, let the pane register, change the entry script index.html names (a rebuild, without waiting for one), resize. The tab's console, 2.5 seconds later and with no command run against it:

  [warning] This tab loaded /assets/index-qIiSltzo.js and the canvas is serving /assets/index-rebuilt.js. The frontend has been rebuilt since this tab opened, so it is running older code. Reload the tab.

WHAT IS NOT DONE. The tab says it in the console, not on the glass. A banner in the shell is the better answer for whoever is standing at the board rather than at a terminal, and nothing in bun run test can see one, so it was left out rather than added unproved.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:08
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: stands as a bug, but the description names a file that no longer
exists.

ADR 0014 landed after this was filed. There is no `bunx tsc` step and no
`dist/server.js`: `bin/canvas` execs `bun src/bin.ts`, the CLI spawns
`bun src/server.ts`, and the only thing still built is the frontend bundle in
`dist/frontend`. The mechanism is unchanged, because a long-running process
still executes the source it read at start. What changed is what `status` has
to compare against, which is now the newest mtime under `src/` rather than the
mtime of a compiled server. ADR 0014 says this itself and names this task.

Independent of ADR 0015 and ADR 0016, and independent of TASK-058. Checked
rather than assumed: the two overlap only in the file `src/server.ts` and
touch different lines. TASK-058 is the static mount at src/server.ts:137-138;
this is a CLI command plus what a tab is told at connect time. Either can go
first, and neither is on the critical path in docs/design/the-plan.md.

Description edited to drop the `dist/server.js` reference.
---

created: 2026-08-20 20:09
---
Also corrected the reference: `src/cli/commands/lifecycle.ts` does not exist. `status` lives at `src/cli/commands/server.ts:40`.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
status now compares when the canvas read its source against the files it actually loaded, names the file and both times, and offers the remedy that canvas has: bun run reload where a reload is armed, a restart where it is not, and nothing at all when the two agree. A tab hears the same thing about its own bundle in the reply to the pane report it already sends, so a rebuild underneath an open tab is known at the next scroll instead of ten seconds into a command that times out. Proved by scripts/check-staleness.mjs (18 assertions), three new assertions in check-hot-reload.mjs covering the reload that clears it, and one run in real headless Chrome for the tab's console. Three separate reverts fail 7, 2 and 2 assertions.
<!-- SECTION:FINAL_SUMMARY:END -->
