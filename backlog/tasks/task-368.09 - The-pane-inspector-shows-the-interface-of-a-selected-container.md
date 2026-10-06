---
id: TASK-368.09
title: The pane inspector shows the interface of a selected container
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 10:24'
labels:
  - interfaces
  - ui
dependencies:
  - TASK-368.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: low
type: feature
ordinal: 645000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The derived interface reaches an agent through the CLI. A user reading a board sees it only if the inspector shows it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting a container shows its entry points, the count of its hidden parts and its callers in the pane sidebar
- [ ] #2 Selecting an entry point from that list selects the part on the canvas
- [ ] #3 Nothing is stored, and the sidebar reads the same derivation as the CLI
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the derivation through the shared index: DetailsPanel calls inspectContainer on the content of the variant that holds the picked part (the variant on screen), so the CLI and the pane read one function and nothing is stored.
2. New composite component ContainerInterface: a sidebar region between where the part stands and what it is wired to, shown only for a node with children. Sections: Entry points with count and one choice row per entry point (a pass-through entry point says so in words, no canvas mark), Hidden parts with count, Callers with count and one choice row per caller saying which entry points it reaches, or the container itself. A container with no caller says in words that no part on the board calls it.
3. Choosing an entry point or caller row picks that part (the pane's onPick), so the canvas selection follows. Pointing at a row lights the part, as relationship rows do.
4. Owners: a rendered stage-harness test (select a container on a draft variant, see its interface with pass-through words and a caller to the container itself, choose an entry point and the picture's selection follows; a container with no caller), and the real-browser inspection owner extended with the container workflow on its existing session.
5. Look at it at 1920x1080 on a temporary vault copy, run the gate lanes one by one and readme:check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions the ADR left open:
- Placement: the interface is its own sidebar region, after where the part stands and before what it is wired to, shown only for a node with children. A part with no children shows nothing about an interface (no filler), since it has none.
- The counts come from interfaceMeasures and the lists from inspectContainer, both from the shared index, on the content of the variant that holds the picked part (the variant on screen; for a removed container in a comparison, the variant it lived on). The derivation reads the whole variant, so a view that hides a caller still lists it.
- Each measure is a heading with its count, as Sends to and Receives from are. Entry points and callers are choice rows that pick the part (the canvas selection follows) and light it while pointed at or focused, as relationship rows do. Hidden parts is a count only (AC #1); the parts themselves are on the picture.
- A pass-through entry point says 'passes one call on' under its name; no canvas mark. A caller's row says which entry points it reaches, and '<container> itself' for a relationship that ends on the container (the ADR's caller that reaches no entry point). A container with no caller says 'No part on this board calls it.' (the ADR's note in words).
- Outgoing relationships are not repeated: Sends to already lists the relationships that leave a container.
- Owners: src/ui/semantic-board-canvas/tests/semantic-board-interface.test.tsx (rendered stage harness: draft variant on screen, pass-through words, a caller to the container itself, choosing an entry point picks it on the picture; a container nothing reaches) and the existing real-browser session in tests/system/browser/semantic-board-inspection.test.ts (pick a container, read its entry point, hidden count and caller, choose the entry point, the picture's selection follows).
- Looked at it at 1920x1080 on a copy of the dogfood vault: Codex session (3 entry points, Gate protocol operations passes one call on, 5 hidden, 3 callers, the same as semantic inspect) in the light theme, and Browser client on Browser application (0 entry points, 19 hidden, no caller) in the dark theme.

Gate (one lane at a time): fmt:check pass; lint exit 0; type-check exit 0; build:frontend exit 0; test:modules 3949 pass 0 fail; test:system 192 pass 0 fail; test:repository 20 pass 0 fail; test:serial-browser 19 owners, 24 pass 0 fail. readme:check lists all 13 assets stale, and they were stale before this change: every asset names src/shared among its sources, and f9f78af78 (TASK-368.02) changed it after the manifest was last made. No clip films a container's selection tab (the ask clip picks Timeout guard, a part with no children), so this change alters no asset's picture; none was refreshed.
<!-- SECTION:NOTES:END -->
