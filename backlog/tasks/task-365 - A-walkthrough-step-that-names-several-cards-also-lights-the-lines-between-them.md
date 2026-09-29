---
id: TASK-365
title: A walkthrough step that names several cards also lights the lines between them
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 00:18'
updated_date: '2026-09-29 00:19'
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
- [ ] #1 A presented beat that names two or more cards lights, marks and frames every relationship the picture draws whose two ends are both cards the beat names
- [ ] #2 Cards that only come with a named relationship as its ends do not count, and a beat naming one card lights no relationship it does not name
- [ ] #3 The consumer skill says a beat about several cards also lights the lines between them, so a relationship is named only when the beat is about that line
- [ ] #4 The narrative stage test owns the rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Board viewer@TASK-365 relabels the call Drive walkthrough focus -> Resolve board meaning to "ends of named lines and steps, lines between named cards"; nothing else changes.
1. lib/narrative.ts beatFocus: after the named subjects and the ends of each named relationship or step, add every relationship of the variant whose two ends are cards the beat itself names and the picture draws. They are lit, marked and framed like the rest. Ends that only come with a named relationship do not count, so a beat about one line lights no other line between its ends.
2. tests/semantic-board-narrative.test.tsx: a beat naming two cards lights and frames both lines between them exactly as a beat naming them too; a beat naming one of those lines lights neither the other line nor anything else.
3. Consumer skill (after the simple-english workflow finishes with that file): sequences-views-walkthroughs.md says a beat about several cards also lights the lines between them, so a relationship is named only when the beat is about that line.
4. Verify: viewer tests, lint, type-check, the gate, and the Board viewer walkthrough presented in headless Chromium on a scratch server.
<!-- SECTION:PLAN:END -->
