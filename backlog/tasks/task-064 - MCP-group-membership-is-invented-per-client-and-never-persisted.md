---
id: TASK-064
title: MCP group membership is invented per client and never persisted
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
labels: []
dependencies: []
references:
  - src/core/canvas-state.ts
  - src/core/mcp-dispatch.ts
  - docs/adr/0003-element-metadata-is-the-semantic-channel.md
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
- [ ] #1 A group made over MCP is visible to another client on the same canvas
- [ ] #2 A group survives the client that made it exiting, or the tool says plainly that it will not
<!-- AC:END -->
