---
id: TASK-165
title: Clean up frontend concern placement and React ownership
status: To Do
assignee: []
created_date: '2026-09-09 12:50'
labels: []
dependencies:
  - TASK-164
references:
  - docs/agents/frontend.md
  - docs/agents/boundaries.md
  - TASK-149
type: enhancement
ordinal: 316000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The agreed frontend rules preserve Archboard module boundaries but existing UI mixes components and hooks in lib, uses inconsistent component names, and concentrates workflow ownership in application composition. This dedicated cleanup makes workflows easier for maintainers and agents to locate and change. Scope is all authored src/ui implementation; host files stay thin. Preserve documented generated/vendor exceptions and the current UI behavior. Coordinate with active shell work TASK-149; its remaining visual/voice acceptance is not owned here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Authored frontend modules follow docs/agents/frontend.md naming and concern placement, with intentional public entrypoints and existing test owners preserved.
- [ ] #2 Application and shell compose domain owners; local state and subscriptions stay with consumers, with unnecessary mirrored state and relay-only controllers removed.
- [ ] #3 Lint enforces agreed mechanically checkable conventions without relaxing existing lint/type rules or introducing file-content or tooling-policy tests.
- [ ] #4 Existing desktop, split-pane, canvas edit, library, workbench and voice behavior is preserved; relevant runtime owners and bun run check pass.
<!-- AC:END -->
