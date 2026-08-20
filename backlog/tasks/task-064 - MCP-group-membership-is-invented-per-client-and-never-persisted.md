---
id: TASK-064
title: MCP group membership is invented per client and never persisted
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 20:17'
labels: []
dependencies:
  - TASK-068
references:
  - src/core/canvas-state.ts
  - src/core/mcp-dispatch.ts
  - docs/adr/0003-element-metadata-is-the-semantic-channel.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - src/core/element-ops.ts
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server.

sceneState.groups in src/core/canvas-state.ts around 22 lives in the MCP process rather than the canvas server, and is not behind kept(). So it is not board content, not shared, and not saved.

Two consequences. Two MCP clients on one canvas disagree about which elements are grouped, because each holds its own map. And a group made over MCP is gone when the client exits, while the elements it grouped are still on the board.

Grouping over the CLI goes through the canvas server and does not have this problem, which is why it has not been noticed: the CLI is the default surface (ADR 0008) and MCP is the lagging one.

Either groups belong on the board, alongside the other element metadata that survives a round trip (ADR 0003), or the MCP grouping tool should say it is per-session. The first is almost certainly right, since a group is a statement about the diagram.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A group made over MCP is visible to another MCP client on the same canvas, and to the CLI
- [ ] #2 A group survives the MCP client that made it exiting, because it is recorded in groupIds on the elements and nowhere else
- [ ] #3 sceneState.groups is gone from src/core/canvas-state.ts, and ungroup no longer needs a seeded member list
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:10
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: still real, and ADR 0015 decides the open question the description
left open. Sequencing changed: it should follow the batching work, which
removes the map's last consumer for free.

Verified in source. `sceneState.groups` is still a `Map<string, string[]>` at
`src/core/canvas-state.ts:22`, still declared in the MCP process, still outside
`kept()`. Its only uses are `src/core/mcp-dispatch.ts:334` (set on group) and
`:353-355` (read then delete on ungroup).

ADR 0015 decides it. The description said "Either groups belong on the board
... or the MCP grouping tool should say it is per-session. The first is almost
certainly right." Under ADR 0015 the second option is not available: a group is
board content, and board content in a process is exactly what the ADR forbids.
So the acceptance criterion that offers the tool a way out by documenting the
limitation should be dropped, not left as an alternative somebody might take.

The board already carries the answer. `groupIds` is a native Excalidraw field
on every element, it round-trips through the note, and `groupElements` in
`src/core/element-ops.ts:174-194` already writes it through the canvas server.
The MCP map is a second, worse copy of a fact the elements already hold, which
is why the CLI does not have this bug.

Sequencing. The map's one hard consumer is the `knownMemberIds` seed that
`ungroupElements` accepts for "legacy" MCP groups
(`src/core/element-ops.ts:200-213`). Once `group` and `ungroup` route through
the batched write, that seed has nothing left to seed from and the map can be
deleted rather than migrated. So do this immediately after the batching task
rather than before it. It is stage 1 of docs/design/the-plan.md.

Acceptance criteria edited.
---
<!-- COMMENTS:END -->
