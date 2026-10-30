---
id: TASK-557
title: Track passes every hard drawing check, or is retired
status: To Do
assignee: []
created_date: '2026-10-30T03:32:00Z'
labels:
  - renderer
  - layout
dependencies:
  - TASK-554
ordinal: 970000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-554 made Blocks pass every hard check of expectDrawingIntact on the complete corpus and made Blocks the default engine (ADR 0064). Track was left unchanged on purpose, so its drawings stay byte-identical, and it still fails the opposite-wall check that TASK-554 added (packages/renderer/tests/runtime/support/drawn-ports.ts, collinearPorts): about 7,803 pairs of lines at opposite walls of one card stand closer than one lane (16 units) and read as one line behind the card. The owner first decides whether Track still has a reason to exist next to Blocks. This was criterion 3 of TASK-554.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner's decision to keep or retire Track is recorded in an ADR, with the reason
- [ ] #2 If Track is kept, every hard check of expectDrawingIntact, including the opposite-wall check, passes for Track on the complete corpus and every whole board
- [ ] #3 If Track is retired, no command, setting, test or document offers it, and existing renders that name Track are handled as the ADR states
<!-- AC:END -->
