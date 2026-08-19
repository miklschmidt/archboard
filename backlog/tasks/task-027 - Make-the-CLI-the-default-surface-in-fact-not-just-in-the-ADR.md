---
id: TASK-027
title: 'Make the CLI the default surface in fact, not just in the ADR'
status: To Do
assignee: []
created_date: '2026-08-19 22:08'
updated_date: '2026-08-19 22:08'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 27000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The excalidraw skill tells an agent to use the CLI first, not MCP
- [ ] #2 Something fails when the MCP surface drifts behind the CLI, rather than the drift going unnoticed
- [ ] #3 The image-in-context gap MCP covers is written down where someone deciding between them will read it
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:08
---
From ADR 0008. The user kept MCP for a client that cannot run a shell, and made the CLI the default everywhere else.

The skill is the load-bearing half. Its Step 0 reads 'MCP tools - if the canvas tools are in your tool list, prefer them', which is upstream's framing and now backwards. An agent's sense of which surface to use comes from there, so until it changes the decision is words in a file.

The drift check matters more than it sounds. A secondary surface nobody exercises rots quietly, and MCP would then be broken on the one day it is needed, which is the whole reason for keeping it. A parity assertion between the tool list and the command table is cheap; alternatively decide openly that MCP is best-effort and say so in the ADR. Either is honest. Silence is not.
---
<!-- COMMENTS:END -->
