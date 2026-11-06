---
id: TASK-582.03.02
title: 'Layout B: the packages lay out behavior first'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T19:06:00Z'
updated_date: '2026-11-06T20:02:00Z'
labels: []
dependencies:
  - TASK-582.03.01
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1030000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The packages hold 50 of the 83 containment warnings: codex-app-server, walkthrough, workbench, skills, model, renderer and codex-realtime-voice, and the Rust crates. Plan: doc-003, steps B1 to B7, with the owner decisions at its top (voice: cut the model; crates: one root module per crate beside the packages).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check reports no containment warning for any module of those packages or crates
- [ ] #2 Each Rust crate is a root module bound to its crate directory, with no container around the crates
- [ ] #3 Each step is its own commit that leaves bun run check green and archboard check at the warning count the plan names
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
B1 to B4 (this run), one commit each, in doc-003 section 3 order:
1. Manifest: scripts/move-source.ts plan <package> --overrides <the doc-003 section 2 overrides>, reviewed against the verdicts and the import graph. Tests mirror their source.
2. Model corrections that the verdicts name, as their own claimed model edit intent before the move.
3. apply the manifest (git mv, rewrites, restart, one claimed rebind intent). Then one claimed intent binds each container to its behavior folder where the codemod does not.
4. Remove the package's trees from ROLE_FIRST_TREES.
5. Verify: bunx vp run types; archboard check warnings 81/78/73/68 with only CONTAINER_UNBOUND/CONTAINER_PARTS_OUTSIDE; git grep for the old prefixes outside backlog, docs/design, docs/adr and proposals; bun run check (remaining lanes one by one when it stops early); git show -M40% --stat.
B5 to B7 follow in a later run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
B1 codex-app-server (2d131626b). Manifest: doc-003's file overrides (codex-app-server is flat, so the default move changes nothing): 6 session services, 3 response-identity operations, storage-proof and 2 session schemas -> runtime/session/<role>/; runtime/clients (10) and 8 operations -> runtime/transport/<role>/. Tests mirror their source (file-level override keys do not mirror .test.ts names, so 7 test files are named explicitly). Import scan matched the verdict: the 8 transport operations are reached only from clients/transport.ts and each other; the response-identity operations and storage-proof only from services/session.ts. 46 moves, 52 rewritten files, 0 layout problems. No model correction named for this package. Vault: codemod rebind (86 statements) then one claimed intent binds Codex session to runtime/session and Codex transport to runtime/transport. vite.config.ts test:macos named tests/runtime/store, whose files part: added tests/runtime/session/store beside it. crates/archboard-scene/tests/fixtures/codex-session.paint.json (a recorded paint request of this vault's Codex session) named the old binding paths: rewritten through the manifest; cargo test -p archboard-scene -p archboard-paint pass, core rebuilt. Ratchet: no codex-app-server tree was listed (flat trees already conform). Evidence: archboard check 81 warnings (38 CONTAINER_PARTS_OUTSIDE, 43 CONTAINER_UNBOUND, no other warning code); git grep for the old prefixes outside backlog, docs/design, docs/adr and proposals: nothing; bunx vp run types pass; bun run check 21/21 (repository 170/16 files, modules 4909/742, system 234/64, solo 15/2, browser 49/49).
<!-- SECTION:NOTES:END -->
