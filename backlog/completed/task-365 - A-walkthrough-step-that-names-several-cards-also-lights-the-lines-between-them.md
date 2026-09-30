---
id: TASK-365
title: A walkthrough step that names several cards also lights the lines between them
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 00:18'
updated_date: '2026-09-29 00:36'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 606000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Board viewer walkthrough names only cards, five to eight per beat, and never a relationship, so every line between the lit cards stays under the presentation veil and each step reads as a scatter of boxes (reported 2026-09-29). Walkthroughs written this way exist in every vault, and a beat about several cards is about how they connect. The user chose a viewer rule over rewriting the beats (2026-09-29), the mirror of TASK-364 where a named relationship brings its two ends: the rule improves every such walkthrough at once, and no camera or view field goes into board data (ADR 0023 stands).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A presented beat that names two or more cards lights, marks and frames every relationship the picture draws whose two ends are both cards the beat names
- [x] #2 Cards that only come with a named relationship as its ends do not count, and a beat naming one card lights no relationship it does not name
- [x] #3 The consumer skill says a beat about several cards also lights the lines between them, so a relationship is named only when the beat is about that line
- [x] #4 The narrative stage test owns the rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Board viewer@TASK-365 relabels the call Drive walkthrough focus -> Resolve board meaning to "ends of named lines and steps, lines between named cards"; nothing else changes.
1. lib/narrative.ts beatFocus: after the named subjects and the ends of each named relationship or step, add every relationship of the variant whose two ends are cards the beat itself names and the picture draws. They are lit, marked and framed like the rest. Ends that only come with a named relationship do not count, so a beat about one line lights no other line between its ends.
2. tests/semantic-board-narrative.test.tsx: a beat naming two cards lights and frames both lines between them exactly as a beat naming them too; a beat naming one of those lines lights neither the other line nor anything else.
3. Consumer skill (after the simple-english workflow finishes with that file): sequences-views-walkthroughs.md says a beat about several cards also lights the lines between them, so a relationship is named only when the beat is about that line.
4. Verify: viewer tests, lint, type-check, the gate, and the Board viewer walkthrough presented in headless Chromium on a scratch server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: narrative stage test (two named cards light and frame both lines between them exactly as a beat naming everything; a beat naming one of those lines lights neither the other line nor anything else; a single-card beat still lights only its card, owned by the existing "a step lights what it is about" test); viewer module 167 pass; lint and type-check clean; bun run check exit 0 (3904 tests, 0 fail). Browser: the Board viewer walkthrough presented in headless Chromium on a scratch server over a copy of .archboard/vault lit 9, 4, 1 and 1 relationships on its four steps (0 before); step 1 reads as the connected path from Browser client to Draw here. Board viewer@TASK-365 adopted as version 19; ./bin/dogfood check 0 diagnostics. Loops are excluded, so a beat naming one card lights nothing it does not name. Step 3 of that walkthrough still names cards joined only through cards it does not name; the rule draws no line that the board does not hold, so that beat needs its relationships named.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A presented walkthrough step that names two or more cards now also lights, marks and frames every relationship that joins two of those cards (narrative.ts linesBetween), the mirror of TASK-364. Ends that only come with a named relationship do not count. The consumer skill says a beat about several parts also highlights the relationships between them, so a relationship is named only for a beat about it. Verified with the narrative stage test, the full gate, and the Board viewer walkthrough in headless Chromium.
<!-- SECTION:FINAL_SUMMARY:END -->
