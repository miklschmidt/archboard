---
id: TASK-058
title: >-
  The canvas serves the whole of dist as static, which used to include the
  server
status: To Do
assignee: []
created_date: '2026-08-20 18:36'
updated_date: '2026-08-20 20:08'
labels: []
dependencies: []
references:
  - src/server.ts
  - docs/adr/0014-no-build-step-bun-runs-the-source.md
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-057 agent while removing the build step, and left unfixed because it was outside that task.

src/server.ts serves ../dist as a static directory. Since ADR 0014 that directory only ever holds the frontend bundle, so today it is merely imprecise. Before ADR 0014 it meant the compiled server, the CLI, the MCP dispatch and every core module were served over loopback to anyone who asked for them by path.

It is not a live vulnerability. The canvas refuses to bind anywhere but loopback unless told otherwise, and the compiled output is this repo's own source, which is on the machine already. But it is a directory whose contents are decided by a build tool rather than by this line, and it was one .gitignore edit away from serving something nobody meant to publish.

The fix is to serve dist/frontend, the thing the route is actually for, so what is reachable over http is stated rather than inherited.

Anyone with a checkout from before ADR 0014 still has compiled server JS sitting in dist/, and it is served today. `rm -rf dist && bunx vite build` clears it, which is worth saying wherever the upgrade is described.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The canvas serves the frontend bundle, not whatever else is in dist
- [ ] #2 A stale compiled server left in dist by an older checkout is not reachable over http
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:08
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: stands as written.

Verified in source. `src/server.ts:137-138` still mounts
`express.static(path.join(__dirname, '../dist'))`, and line 140 separately
mounts `../dist/frontend`. The broad mount is still there and is still the one
that would serve whatever a build tool leaves behind.

Neither ADR touches it, and it is independent of TASK-056: they share the file
`src/server.ts` and nothing else. It sits outside the ordered plan in
docs/design/the-plan.md and can be picked up at any point.
---
<!-- COMMENTS:END -->
