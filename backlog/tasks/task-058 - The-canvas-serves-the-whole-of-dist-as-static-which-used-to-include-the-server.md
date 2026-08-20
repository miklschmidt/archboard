---
id: TASK-058
title: >-
  The canvas serves the whole of dist as static, which used to include the
  server
status: Done
assignee: []
created_date: '2026-08-20 18:36'
updated_date: '2026-08-20 21:27'
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
- [x] #1 The canvas serves the frontend bundle, not whatever else is in dist
- [x] #2 A stale compiled server left in dist by an older checkout is not reachable over http
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Drop the broad express.static(../dist) mount in src/server.ts and keep the dist/frontend one, so what is reachable over http is stated rather than inherited.
2. Extend scripts/check-local-bind.mjs, which already spawns a canvas and asks what answers over loopback: plant a decoy file in dist/ and another in dist/frontend/, assert the frontend one is served and the dist-root one is 404. The served control is what stops the assertion passing for the wrong reason.
3. Say in ADR 0014's consequences how to clear a pre-ADR-0014 dist: rm -rf dist && bun run build.
4. Prove it by restoring the mount and counting the failures.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/server.ts:134-143 now mounts dist/frontend and nothing else. The broad express.static(../dist) mount is gone; the /assets/fonts mount and the / route, which already named dist/frontend/index.html, are untouched.

scripts/check-local-bind.mjs grew a static-exposure section (lines 62-100 for the helpers, 172-192 for the assertions). With the canvas up it plants one file in dist/ and one in dist/frontend/, then asks for both. The frontend one must answer 200 and the dist one 404. The 200 is a control: without it the 404 would also pass on a canvas serving no static files at all. Both probes are deleted afterwards, along with any directory the planting had to create, on the failure path as well as the success path, and the check refuses to write over a file that is already there.

Revert-proof: putting express.static(../dist) back, with everything else unchanged, fails test:bind on the first probe: 'A file in dist/ but outside dist/frontend answered 200, not 404.' One assertion, exit 1, and the chain stops there so the eleven suites after it do not run.

Full suite: bun run test green, 441 ok lines, exit 0.

ADR 0014's consequences now names the command that clears a pre-ADR-0014 dist (rm -rf dist && bun run build) and says the mount has been narrowed, so the paragraph no longer tells a reader the directory is served.
<!-- SECTION:NOTES:END -->

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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The canvas serves dist/frontend and nothing else. The mount that served the whole of dist, and with it any compiled server a pre-ADR-0014 checkout still has lying there, is gone. bun run test:bind now plants a file in dist/ and a file in dist/frontend/ against a live canvas and requires 404 and 200; restoring the old mount fails it. ADR 0014 says how to clear an old dist.
<!-- SECTION:FINAL_SUMMARY:END -->
