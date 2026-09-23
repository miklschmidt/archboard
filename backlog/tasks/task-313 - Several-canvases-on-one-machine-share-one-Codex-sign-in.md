---
id: TASK-313
title: Several canvases on one machine share one Codex sign-in
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 15:05'
updated_date: '2026-09-23 15:27'
labels:
  - codex
  - runtime
dependencies: []
ordinal: 545000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A second canvas on the same machine is refused: 'Dedicated Codex roots are locked or colliding' (the user, 2026-09-23, starting the dogfood canvas while a work canvas ran on port 3100). The lock is archboard's, not Codex's: Codex supports several processes on one CODEX_HOME (it reloads auth from disk before refreshing), but archboard keeps its own epoch ledger next to the Codex home and read-modify-writes it assuming one server process, so prepareCodexStorage locks the whole root. The user agreed to keep one Codex home and sign-in per machine and give each canvas its own archboard-owned state, keyed by its port, so the machine-wide lock can go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two canvases on different ports with one state directory both start their Codex child and run at the same time, sharing one sign-in
- [x] #2 Each canvas keeps its own archboard-owned Codex state (the epoch ledger and anything else found to assume one process), so neither overwrites nor takes over the other's threads
- [x] #3 Nothing refuses a second canvas for sharing the Codex home any more, and a canvas started again on the same port finds its own state
- [x] #4 Verified with the real Codex binary: two canvases on one private state directory start and stay up together
- [x] #5 The one-canvas rule is gone from INSTALL.md, TESTING.md and DESIGN.md, and the decision is recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit (subagent) of every single-process assumption under the state directory: only the epoch ledger breaks when shared; the lock must move, not go, since it also serialises two starts on one port.
2. CodexStorageInput.ownerDirectory; prepareCodexStorage locks it (the Codex home when none is named); refusal reworded and the CLI matcher with it.
3. createWorkbenchStorage: owner directory codex-workbench/canvases/<PORT> (0700) holding the lock and epoch/; codex-home and sqlite-home shared.
4. Owners: storage.test.ts (two owner directories share one home, one directory refuses a second owner, refusals asserted by code); production-initialization test (storage layout keyed by port, 0700); owned-canvas harness fixture moved to the new layout.
5. ADR 0019 amended; INSTALL.md, TESTING.md, DESIGN.md, AGENTS.md; skill artifacts regenerated.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real binary: two canvases (3294, 3295) on one private XDG_STATE_HOME both started, each with its own codex app-server child whose CODEX_HOME and CODEX_SQLITE_HOME are the shared ones, both healthy after 20 s; stop released each lock and left canvases/<port>/epoch. Before the change the second start was refused with the old message.
Left as documented consequences (ADR 0019 amendment): another canvas's threads appear as foreign, inspect-only rows in the thread-link picker and list_threads; account/logout in one canvas signs out all and the others show stale account state until their child restarts; the old codex-workbench/epoch ledger, the old codex-home lock and its .stale-* copies are no longer read and can be deleted by hand. An old-build canvas still locks codex-home, which a new-build canvas ignores.
bun run check: gate exit 0 (modules 3378, system 178, repository, browser).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Canvases on one machine now share one Codex home and sign-in, and each keeps its own owner lock and epoch ledger under codex-workbench/canvases/<port>, so a second canvas is no longer refused and two starts on one port still resolve to one owner. Verified with the real Codex binary and the full gate; ADR 0019 and the install, testing and design docs say so.
<!-- SECTION:FINAL_SUMMARY:END -->
