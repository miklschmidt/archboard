---
id: TASK-663
title: >-
  A relationship says how it travels and what it does, and a picture is read
  through a lens
status: Done
assignee: []
created_date: '2026-11-22T03:38:00Z'
updated_date: '2026-11-23T02:12:00Z'
labels: []
dependencies: []
ordinal: 1144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pictures of many modules are unreadable: this model's 1328 relationships are 78% plain calls and 12% dependencies, and a reader asks one question at a time (how does traffic flow, where does state change, what depends on what). The owner decided (2026-11-22) that every relationship states its kind (how it travels, drawn as its color) and its effect (mutation, query or compute, drawn as its line type), that no relationship stays unclassified, and that a picture is read through a lens, a named question that chooses which lines draw and says how many it left out. The settled design, with every decision and its reason: artifacts/depth-gate/settled-effect.md and settled-lens.md (ignored; summarised in the subtasks), owner-decisions.md items 20 to 28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is Done
- [x] #2 This repository's model states a kind and an effect on every relationship, and its pictures read through the default lens are compared with the old ones in the pull request
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner chose 2026-11-22: a reading that names no lens reads through all where the default lens would draw no line, and the legend says the default draws none there. A named lens never gives way. ADR 0095 records it.

Owner decided 2026-11-22: a lens follows the TASK-647 rule (PR 134): a part whose every line the lens leaves out leaves the picture. ADR 0095, CONTEXT.md and the archboard skill updated. A named lens that leaves no part shows the empty state with Show every relationship.

Owner decided 2026-11-22: the built-in relationship kind other is retired. A relationship that fits no built-in kind takes a kind the vault adds; the upgrade tool refuses other with both ways out. ADR 0094, authoring and upgrade references updated. The part kind other stays.

All twelve subtasks are Done. PR #154 compares Packages and Painting before and after through the default lens, with the kind and effect histogram.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every relationship states how it travels (kind) and what it does (effect). call is replaced by sync and async, other is retired; kind is the line's color and effect its mark at the card (wedge and imprint, eye and caller ring, '=', broken line with a detached chevron); lenses with one-click presets, kind and effect switches, and the status line above the picture; the upgrade seeds sync and async from code facts, and the code check flags a contradicting kind. Verified by the full gate and four Sol reviews (PR #154). Follow-ups: TASK-666 to 669.
<!-- SECTION:FINAL_SUMMARY:END -->
