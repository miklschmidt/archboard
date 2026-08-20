---
id: TASK-064
title: MCP group membership is invented per client and never persisted
status: Done
assignee: []
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 21:15'
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
- [x] #1 A group made over MCP is visible to another MCP client on the same canvas, and to the CLI
- [x] #2 A group survives the MCP client that made it exiting, because it is recorded in groupIds on the elements and nowhere else
- [x] #3 sceneState.groups is gone from src/core/canvas-state.ts, and ungroup no longer needs a seeded member list
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete sceneState.groups from src/core/canvas-state.ts. Board content in a process is what ADR 0015 forbids, and groupIds on the elements already holds the fact.
2. Drop the knownMemberIds seed from ungroupElements: with group and ungroup routed through the batched write there is nothing left to seed it from, and mcp-dispatch stops writing to and reading from the map.
3. Prove it where it broke: a canvas-backed section in the MCP wire check. Two MCP clients on one canvas, a group made through one and read back through the other and over HTTP; the client that made it exits and the group is still on the elements. Then the case the stale map got wrong — a member joins the group after it was made, through a browser change report, and the client that made the group ungroups it. Seeded from its own map it leaves the newcomer carrying a dead groupId.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WHAT MOVED. `sceneState.groups` is gone from src/core/canvas-state.ts, with a note
saying why it cannot come back. src/core/mcp-dispatch.ts no longer writes to it
on group or reads it on ungroup. `ungroupElements` lost its `knownMemberIds`
parameter: with TASK-068 landed, group and ungroup both go through the batched
write and there is nothing left to seed it from.

WHERE THE PROOF IS. A canvas-backed section in scripts/check-mcp-stdio.mjs, the
one check in that file that is not hermetic, because what it is about is two MCP
clients and a canvas disagreeing. It spawns a canvas, holds two MCP connections
open at once, groups through the first, reads it back through the second and
over HTTP, has a browser-shaped change report put a third element into the
group, ungroups through the first client, and then kills that client and checks
the board still records a group it made.

REVERT-PROOF. Restore canvas-state.ts, mcp-dispatch.ts and element-ops.ts to the
TASK-068 commit and the mcp suite goes to 1 of 6 failed:

    not ok - a group is on the board, not in the client that made it
      ungrouping left c carrying a group that no longer exists

Worth being exact about which half was broken. With the map back, the two
visibility criteria still pass, because `groupElements` always wrote groupIds to
the canvas as well as to the map. The seed is what actually corrupted a board: a
member list remembered when the group was made is wrong about everyone who
joined afterwards, and ungroup left them carrying a dead groupId. The map's
other two costs, a group invisible to another client and a group that dies with
its client, were latent rather than reachable through the tools as they stood.

bun run test green: 16 suites, mcp now 6 checks.
<!-- SECTION:NOTES:END -->

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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The MCP process no longer keeps its own record of which elements are grouped. sceneState.groups is deleted, ungroupElements has no seeded member list, and groupIds on the elements is the only place membership lives — which is why the CLI never had this bug. Proved by a canvas-backed section in the MCP wire check: two MCP clients on one canvas, a group read back through the other one, a third element added to the group by a browser report, and the group still on the board after the client that made it exits. Reverting the three files fails that check on the assertion that ungrouping leaves nobody carrying a dead groupId.
<!-- SECTION:FINAL_SUMMARY:END -->
