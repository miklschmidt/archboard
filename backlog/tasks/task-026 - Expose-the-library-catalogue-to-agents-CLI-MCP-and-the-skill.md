---
id: TASK-026
title: 'Expose the library catalogue to agents: CLI, MCP, and the skill'
status: To Do
assignee: []
created_date: '2026-08-19 21:43'
updated_date: '2026-08-19 21:43'
labels:
  - needs-triage
dependencies:
  - TASK-025
ordinal: 26000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A registered CLI command lists the catalogue and inserts an item by name
- [ ] #2 An equivalent MCP tool exists, registered alongside the others
- [ ] #3 The excalidraw skill documents it, so an agent discovers it without being told
- [ ] #4 Listing carries enough to choose between items without rendering them
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 21:43
---
Split out because TASK-025 was deliberately barred from touching src/cli/run.ts while TASK-023 and TASK-024 are live in the same tree — registering a command there would have collided.

So TASK-025 delivers the catalogue and the insertion logic; this delivers the surface. Three layers are needed for an agent to actually use library items and only the first is covered:

1. catalogue data + insertion  (TASK-025)
2. registered CLI command and MCP tool  (here)
3. a section in skills/excalidraw-skill/SKILL.md  (here)

Layer 3 is the one that is easy to forget and decides whether this is ever used: an agent's sense of what archboard can do comes from the skill, so a registered tool absent from it is a tool nobody calls. The skill already has a Workflow section per capability — promotion, panes, comparing variants — and this should follow that shape.

Listing needs to be choosable-from without rendering: name, source library, rough size, and probably a short description, since 'Server' and 'Device' are not distinguishable from a name alone.
---
<!-- COMMENTS:END -->
