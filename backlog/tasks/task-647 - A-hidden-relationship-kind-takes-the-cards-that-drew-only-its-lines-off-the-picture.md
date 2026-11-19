---
id: TASK-647
title: >-
  A hidden relationship kind takes the cards that drew only its lines off the
  picture
status: Done
assignee: []
created_date: '2026-11-18T23:16:00Z'
updated_date: '2026-11-19T01:18:00Z'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 1086000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a reader hides a relationship kind in the Legend, the lines go and so do the doors that only those lines reached. The parts of the open module that drew only lines of that kind stayed on the picture with no line, so the picture kept cards that no longer said anything about the hidden kind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a scope reading, a part that drew only lines of hidden kinds leaves the picture
- [x] #2 A part that never drew a line, an open frame, and each subject of a focus stay on the picture
- [x] #3 When a filter leaves no card, the Legend stays, so the reader can show the hidden kind again
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Compute the cards that lose every drawn line under the filter in the scope projection and leave them out of its parts. Keep the Legend with empty samples on a filtered reading that draws nothing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: a focus and an exact imported view keep the subjects that the reader named, because the reader chose them explicitly (tests/system/browser/canonical-model-modes.test.ts relies on a focused card staying under a filter). Review (sol-loop, gpt-6.2-sol): declined a keyboard Enter fix (an undrawn selection already shows the hidden-selection notice with Reveal), a narrow-pane panel exception (Show whole scope lifts the filter), and an About change (About already lists undrawn internals).

Follow-up in the same PR: an unfiltered scope reading joins its lines once (about 12% faster per reading on this repository's model, 598 modules and 1158 relationships). The Legend stays on a narrow pane while a filter leaves the picture empty, and the keyboard returns to the picture when the panel hides. The empty reading uses the pane's state layout: it names the hidden kinds and offers to show them, and a live region announces it. Declined: announcing the planning empty state (it was never announced, separate gap).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
projectScope leaves out each part that drew a line before the filter and draws none after it, using strandedCards in model-lines.ts. Parts with no line, open frames, focus subjects and exact-view members stay. A filtered architecture reading that draws nothing keeps its Legend with empty samples, so the reader can show the kind again. Verified by unit tests in model-projection.test.ts, the browser filter test (which now restores the kind from the Legend), a full bun run check, and a browser check on examples/web-shop where hiding Data removes Orders DB and Basket cache only.
<!-- SECTION:FINAL_SUMMARY:END -->
