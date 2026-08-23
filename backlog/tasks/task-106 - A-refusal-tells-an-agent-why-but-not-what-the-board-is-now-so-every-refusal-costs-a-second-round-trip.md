---
id: TASK-106
title: >-
  A refusal tells an agent why, but not what the board is now, so every refusal
  costs a second round trip
status: To Do
assignee: []
created_date: '2026-08-23 15:01'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/board-lock.ts
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
priority: medium
type: feature
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a person holds the board, an agent's write waits up to the cap and is then refused with `409 BOARD_HELD` carrying `holder` and `waitedMs` (`src/core/board-lock.ts:132`, `src/server.ts:698`). A stale write is refused with `409 BOARD_VERSION_CONFLICT` naming the version the board is at and saying "read the board" (`src/server.ts:1177`). A revoked claim is told once (`CLAIM_REVOKED`). None of these carries the board's current document, so the agent always spends a second round trip reading before it can act — and an agent driven by voice pays that in silence. Mikkel, 2026-08-23: a refusal should carry the reason and the updated board in the same response, so the agent does not go back and forth. The refusal is answered in one place (`boardErrorBody`, the write-boundary middleware), so this is one change plus the skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `BOARD_HELD`, `BOARD_VERSION_CONFLICT` and `CLAIM_REVOKED` refusal bodies carry the board's current elements and version, the same the agent would get by reading it
- [ ] #2 The CLI and MCP surfaces print the refusal with the reason first, and expose the board from the same response without a second call
- [ ] #3 `test:lock` and `test:version` assert the document is present and current in each refusal
- [ ] #4 The excalidraw-skill tells an agent the refusal already holds the board, so it acts on that rather than re-reading
<!-- AC:END -->
