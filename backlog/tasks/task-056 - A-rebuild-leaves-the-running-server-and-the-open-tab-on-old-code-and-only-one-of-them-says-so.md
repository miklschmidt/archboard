---
id: TASK-056
title: >-
  A rebuild leaves the running server and the open tab on old code, and only one
  of them says so
status: To Do
assignee: []
created_date: '2026-08-20 15:04'
labels: []
dependencies: []
references:
  - src/cli/commands/lifecycle.ts
  - src/server.ts
  - src/core/pidfile.ts
  - frontend/src/canvas/useCanvasSession.ts
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hit three times while working on this repo, twice in one session, and each time it cost a wrong conclusion before the real cause turned up.

Nothing tells you that the canvas server is running code older than dist/. The server loads its modules at start; a later `bunx tsc` changes the files on disk and nothing in the running process. Every command keeps working and answers from the old behaviour.

What that looks like in practice:

- After merging a fix and rebuilding, `describe` reported the new behaviour (the CLI computes it in its own process, from the fresh dist) while `compare` reported the old one (it is a server route). Two commands, one board, two answers, and neither wrong on its own terms. The first read of that was that the fix had not worked.
- Earlier in the same session I searched for a symbol, could not find it, and concluded the server was stale when it was not. The real cause was unrelated. A tool that could have answered "the server started at X, dist was built at Y" would have settled both in one line.

The browser tab has the same problem and already handles it. `pane close` on a tab loaded before the frontend was rebuilt answers: "The browser was asked to close the right pane and it is still there after 10 seconds. The tab may be running an older build of the canvas — reload it and try again." That message is what good looks like. It is also only reachable through one command, by timing out, after ten seconds.

`status` is the natural home for the server half: it already reports pid, url and element count, and comparing the process start time against the mtime of dist/server.js is enough to say "this server predates the current build; restart it to pick it up". The same fact could be surfaced to a browser at connect time so the tab can say it out loud rather than waiting to time out.

Not a correctness bug. It is the kind of friction that turns a two-minute check into a wrong diagnosis, and it will hit every agent that builds this repo and then tests it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 status says when the running server predates the current build, and what to do
- [ ] #2 A tab running a frontend older than the current build learns without waiting for a command to time out
- [ ] #3 The check does not fire when the server and the build agree
<!-- AC:END -->
