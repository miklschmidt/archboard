---
id: TASK-624
title: >-
  A Blocks reading with every door open draws instead of failing for a planned
  channel
status: To Do
assignee: []
created_date: '2026-11-10T15:20:00Z'
labels:
  - bug
  - renderer
dependencies: []
ordinal: 1069000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening every door of the 'Reads and server health' scope (vKEsyHFk/HBlhIeSD#ETrslazw) with no kinds hidden fails to draw. The renderer throws 'No clear planned channel for vKEsyHFk#aJzBoBHj', so the reader sees no picture. Main at 36865dc622 fails the same way, and so does the head of PR 73 before its stacks change. Found while building a corpus of readings with several frames open for TASK-559.09. After PR 73 that reading draws, because its stacks give it another placement, but the fallback that throws is still there for any other reading that reaches it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Blocks reading whose dense placements and fallbacks find no clear planned channel for a line still returns a drawing
- [ ] #2 A focused test reproduces the failure with a graph that reaches that fallback
<!-- AC:END -->
