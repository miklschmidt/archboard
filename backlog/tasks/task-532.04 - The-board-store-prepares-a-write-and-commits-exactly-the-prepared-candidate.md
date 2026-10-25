---
id: TASK-532.04
title: The board store prepares a write and commits exactly the prepared candidate
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T02:41:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/adr/0057-an-interface-is-the-few-operations-its-callers-need.md
parent_task_id: TASK-532
ordinal: 955000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The historical correction route re-runs the first half of the store's write pass outside the lease: it reads the board, checks the version, applies correctHistoricalTransition, runs acceptedBoard with its own policy read, and then fakes a transition (apply returns the candidate) so the write commits the exact candidate that the code evidence was read for. packages/skills laying.ts runs apply plus accept a third time. acceptedBoard and correctHistoricalTransition are public only so callers can do this assembly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The board package offers a prepare operation that applies, accepts and addresses a candidate under the store's own rules, and a commit that writes exactly that candidate under the lease or refuses when the version moved
- [ ] #2 The correction route and laying.ts no longer apply transitions, call acceptedBoard or replace a transition's apply; acceptedBoard and correctHistoricalTransition are private
- [ ] #3 Candidate identity and the concurrent-write refusal are tested through the board operations on a temporary vault; the route keeps its HTTP status codes and error codes unchanged
<!-- AC:END -->
