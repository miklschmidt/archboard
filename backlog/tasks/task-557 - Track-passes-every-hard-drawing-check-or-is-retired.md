---
id: TASK-557
title: Track passes every hard drawing check, or is retired
status: Done
assignee: []
created_date: '2026-10-30T03:32:00Z'
updated_date: '2026-11-24T03:53:00Z'
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
- [x] #1 The owner's decision to keep or retire Track is recorded in an ADR, with the reason
- [ ] #2 If Track is kept, every hard check of expectDrawingIntact, including the opposite-wall check, passes for Track on the complete corpus and every whole board
- [x] #3 If Track is retired, no command, setting, test or document offers it, and existing renders that name Track are handled as the ADR states
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Track is retired. ADR 0096 records the owner's decision of 2026-11-22 and the reason (agents kept spending time on an engine that should never be used). Criterion 2 applies only if Track were kept, so it does not apply. No command, setting or document offers Track: --layout takes blocks or lanes, the settings dialog offers Blocks and Lanes, and a saved track (browser choice, version 1 recipes, recorded talks) reads as Lanes, as ADR 0096 states (apps/web/tests/ui/architecture-drawing/canvas/picture/clients/layout-engine.test.ts). The deletion landed with TASK-672 in feat/kinds-effects-lenses (#154).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Track is retired, not fixed. ADR 0096 records the owner's decision and reason, and TASK-672 deleted the engine in feat/kinds-effects-lenses (#154): no command, setting, test or document offers Track, and a saved track reads as Lanes. Criterion 2 (if kept) does not apply.
<!-- SECTION:FINAL_SUMMARY:END -->
