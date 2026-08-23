---
id: TASK-106
title: >-
  A refusal tells an agent why, but not what the board is now, so every refusal
  costs a second round trip
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-23 15:01'
updated_date: '2026-08-23 17:02'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one synchronous refusal-document helper at the server write boundary that reads current content through board-io and appends document and version after the existing BOARD_HELD, BOARD_VERSION_CONFLICT, or CLAIM_REVOKED reason fields, without another lock or an await.
2. Preserve the complete refusal response in canvas-client errors, then make the CLI and MCP error paths print the existing reason first followed by the document and version from that same response. Extend the parity check to pin the shared formatting contract.
3. Extend test:lock for current BOARD_HELD and CLAIM_REVOKED documents, and test:version for the current BOARD_VERSION_CONFLICT document and version. Keep the person-never-refused and told-once behavior covered.
4. Update the excalidraw skill to act on the attached document instead of re-reading while retaining stale-write and revoked-claim told-once guidance, then sync derived skill copies.
5. Run type-check and the requested focused gates after each slice, then the complete bun run test suite, record evidence, commit explicit paths in TASK-106-prefixed commits, and finalize every acceptance criterion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slices 1-4 implemented. The write boundary now appends synchronous board-io document and version reads to BOARD_HELD, BOARD_VERSION_CONFLICT, and CLAIM_REVOKED after each existing reason shape. canvas-client preserves that full response, updates remembered version from the attached current version, and one formatter prints the reason before structured reason fields plus document/version on CLI and MCP; refusal exit code is 5. test:lock compares BOARD_HELD and CLAIM_REVOKED attachments with live reads and board info; test:version does the same for BOARD_VERSION_CONFLICT and proves CLI order/client preservation; test:parity pins both surface paths to the shared formatter. The authored skill now tells agents to use the attachment rather than re-read, and bun scripts/sync-skills.mjs updated derived copies. Focused validation: type-check passed; lock 119; version 65; parity 41 MCP tools/50 CLI entries; doing 42; MCP stdio 6, all green.
<!-- SECTION:NOTES:END -->
