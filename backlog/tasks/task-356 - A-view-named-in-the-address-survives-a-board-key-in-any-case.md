---
id: TASK-356
title: A view named in the address survives a board key in any case
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 14:48'
updated_date: '2026-10-11 13:59'
labels:
  - ui
dependencies: []
priority: medium
type: bug
ordinal: 597000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 while filming README footage, confirmed by a review. With the example vault, /?paneA=Web%20shop&viewA=ejQ7ydLw opens 'Everything' and rewrites the address to ?paneA=web+shop, dropping the view; /?paneA=web%20shop&viewA=ejQ7ydLw opens the 'Place an order' view. Board names are case-insensitive (ADR 0010), so a shared link that names a view with the board's own capitalisation loses the view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An address whose board key differs only in case from the pane's key keeps its view
- [x] #2 The rewritten address names the same view
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compare board keys in planFor with sameBoardKey instead of !== (the helper exists, unused).
2. Make the key comparison case-insensitive on the board part only: the variant after the first @ stays exact, because a variant name is not a board name (ADR 0010 covers board names).
3. Add an address.test.ts case: same board in another case keeps the view read and opens nothing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: planFor compared board keys with !==, so a link spelling the board in another case (?paneA=Web+shop&viewA=...) was planned as an open and the view read was dropped. It now uses sameBoardKey, which reads the board name without case (ADR 0010) and leaves a variant after the first @ exact. Evidence: unit case in src/ui/board-routing/tests/address.test.ts fails before and passes after; the browser test semantic-drill-address.test.ts (now opens ?paneA=Engine&viewA=<view>) fails before (exit 1) and passes after, asserting the view stays pressed and the rewritten address still names it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A view named in an address now survives a board key in any case. planFor used a strict !== on board keys, which turned a differently cased link into an open and dropped the view; it now uses the existing sameBoardKey (board name compared without case, variant kept exact). Verified: address.test.ts unit case and the semantic-drill-address browser test, both red without the change and green with it (the browser test checks the view stays selected and the rewritten address keeps naming it).
<!-- SECTION:FINAL_SUMMARY:END -->
