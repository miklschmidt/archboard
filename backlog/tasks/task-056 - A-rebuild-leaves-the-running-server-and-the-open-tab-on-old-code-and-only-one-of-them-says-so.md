---
id: TASK-056
title: >-
  A rebuild leaves the running server and the open tab on old code, and only one
  of them says so
status: To Do
assignee: []
created_date: '2026-08-20 15:04'
updated_date: '2026-08-20 20:09'
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
- [ ] #1 status says when the running server predates the current build, and what to do
- [ ] #2 A tab running a frontend older than the current build learns without waiting for a command to time out
- [ ] #3 The check does not fire when the server and the build agree
<!-- AC:END -->

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
