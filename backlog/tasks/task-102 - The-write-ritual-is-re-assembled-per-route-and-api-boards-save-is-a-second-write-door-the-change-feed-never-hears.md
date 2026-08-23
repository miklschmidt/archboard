---
id: TASK-102
title: >-
  The write ritual is re-assembled per route, and /api/boards/save is a second
  write door the change feed never hears
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-23 15:01'
updated_date: '2026-08-23 16:41'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/board-io.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: enhancement
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `src/server.ts` (4,714 lines) only the ends of a board write are behind interfaces: `boardFromRequest` (:643) and `persistBoard` (:555). The middle — mutate, settle, broadcast, shape the answer — is re-assembled per route. Evidence at commit 2a4d9cc: 17 inline `boardFromRequest()` sites; 8 `persistBoard()` sites plus one direct `writeBoardContent()` at :4135 inside `POST /api/boards/save`, which then hand-rolls `savedAt` (:4144), the hold release (:4153) and a `BoardContent` (:4156) and never calls `noteChange` — so a save is the one board write the change feed is not told about. The broadcast fan-out is written four different ways (`element_created`/`element_updated` loops at :1489, :1581, :2153; one `elements_changed` at :2641), and "what this write touched" is built three ways (:1480, :1603, :2144). `agentWriteAnswer` (:2358), the one piece that was extracted, has six consistent callers — the shape works when it happens.

Architecture review 2026-08-23, candidate 2 (runner-up). Deepened shape: one module owns "a write happened to this board" — a route hands it the mutation, it reads the note, runs the converter (TASK-104), persists, tells every pane, answers. `save` becomes a write to a named destination rather than a parallel door. ADR 0015 constraint: `board-io` stays synchronous between read and write; the door must not put an `await` there. Absorbs TASK-084 (a batched write half-applies); borders TASK-092 and TASK-096 (pane status news dropped).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One module owns read -> mutate -> persist -> broadcast -> answer for a board write, and every board-writing route in `src/server.ts` goes through it
- [ ] #2 `POST /api/boards/save` goes through the same door: `noteChange` fires for a save, and the change feed reports it
- [ ] #3 Panes are told about a write in one message shape regardless of which route made it
- [ ] #4 No `await` sits between the read and the write of one board (ADR 0015); `test:one-write` still counts one write per intent
- [ ] #5 TASK-084 is closed through this module or explicitly re-scoped against it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a synchronous src/core/board-write.ts entry that reads one board, applies an isolated mutation, invokes applyElementInput for element input, persists through board-io, records the change feed, broadcasts one elements_changed write message, and shapes the response.\n2. Move the eight ordinary board-writing routes in src/server.ts onto that entry, including clear and file mutations, while preserving their response fields and file delivery messages.\n3. Move POST /api/boards/save onto the same entry with an explicit named destination, shrink board-io WriteOptions to destination-independent options, and prove save reaches the change feed.\n4. Add the TASK-084 regression to check-one-write, close TASK-084 with evidence that a failed complete mutation writes and broadcasts nothing, then run all focused gates and the full browser-backed suite.\n5. Finalize TASK-102 with acceptance evidence, a concise summary, and Done status.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research against current main: TASK-101, TASK-103 and TASK-104 are present. There are nine note-writing routes: five single or batch element routes, the change-report route, two file routes, and board save. The write-boundary middleware already owns the lease and version check, so the new module stays synchronous inside next() and does not acquire locks.

Slice 1 complete. Added the synchronous board-write entry with isolated content, TASK-104 conversion as an internal stage, board-io persistence, change-feed recording, one elements_changed write notification, file payload delivery, and response shaping. Validation: type-check; one-write 58; changes all; boards all; doing 42; lock 115; version 61; module-scope 49 modules plus self-test, all green.

Slice 2 complete. Moved eight ordinary board-writing routes onto writeBoard: create, update, clear, delete, batch create, change report, file add, and file delete. All element routes now broadcast one elements_changed shape; file data keeps its existing payload messages. Validation: type-check; one-write 58; changes all; boards all; doing 42; lock 115; version 61; module-scope 50 modules plus self-test, all green.

Slice 3 complete. POST /api/boards/save now supplies source and named destination to writeBoard; the route has no readBoardContent or writeBoardContent call. Save records the destination in the change feed and broadcasts elements_changed. check-boards proves a save-as event for ledger@option-a and an in-place save message. board-io WriteOptions shrank from file/identity/elements/force/saveCommand to force/saveCommand. Validation: type-check; one-write 58; changes all; boards all including both save checks; doing 42; lock 115; version 61; module-scope 50 modules plus self-test, all green.
<!-- SECTION:NOTES:END -->
