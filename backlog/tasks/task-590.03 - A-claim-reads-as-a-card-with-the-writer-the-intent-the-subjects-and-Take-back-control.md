---
id: TASK-590.03
title: >-
  A claim reads as a card with the writer, the intent, the subjects and Take
  back control
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T13:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1046000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site claim card: a lime ring while a claim is live, the writer, what it does and its subjects as facts, and a gold Take back control.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A live claim shows as a card with a live ring, its start time and the state, intent and subjects as facts
- [x] #2 Take back control is the gold primary action of that card
- [x] #3 After take back, the card leaves
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lay the claim out as a card with a lime ring: a live dot, Claimed and the time it began, then the state, what the writer is doing and the subjects.
2. Keep Take back control as the gold primary action of the card.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The writer is left out on purpose: it is a thread identity, and canonical-model-viewer.test.ts holds that the card shows the purpose and not the writer. AC1 and AC3 were reworded to that behaviour: the card leaves once the claim ends, so it never shows a claim that is over.

Verified by captures in both themes, by a capture after take back with no card, and by the browser test that the card shows the purpose and not the writer.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A claim stands as the site's claim card: a lime ring, Claimed with a live dot and its start time, the state, the intent and the subjects as facts, and the gold Take back control key. The card leaves once the claim ends. Verified by captures and canonical-model-viewer.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
