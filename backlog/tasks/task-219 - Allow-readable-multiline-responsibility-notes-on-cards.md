---
id: TASK-219
title: Allow readable multiline responsibility notes on cards
status: Done
assignee:
  - codex
created_date: '2026-09-15 01:50'
updated_date: '2026-09-15 02:00'
labels: []
dependencies: []
ordinal: 379000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users need agents to explain responsibilities clearly instead of compressing them into cryptic one-line notes. Architecture measurement already wraps, but the schema/guidance forbid line breaks and sequence cards truncate. Allow concise multiline notes and preserve their complete text in both grammars.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Responsibility input and persisted boards accept multiline notes within the existing 200-character bound.
- [x] #2 Architecture and data-flow cards render complete wrapped or explicitly multiline notes with measured bounds and no overlap.
- [x] #3 Agent guidance recommends readable notes spanning two or three lines; skill schemas and evaluation coverage reflect the contract.
- [x] #4 Focused schema/rendering tests and relevant checks pass, with unrelated working-tree failures identified.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Relax responsibility validation and update agent guidance/evaluation coverage. 2. Verify architecture wrapping and replace sequence note truncation with measured multiline layout. 3. Sync derived skills, validate both grammars and standalone rendering, simplify, and commit only this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed the single-line responsibility constraint while retaining the 200-character bound; a public input/persisted-node regression failed before and passes after. Architecture already preserves complete measured notes; sequence notes now share Pretext wrapping, grow their cards, and move lifelines below the tallest card. Four public-render regressions cover explicit newlines, wrapping, containment/card bounds, and long unbroken notes. Manual architecture and data-flow PNG samples verified. Agent guidance, evaluation scenarios/fixture/rubric/coverage and derived skill schemas updated; eval input check passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Responsibility notes accept multiline prose within 200 characters. Both grammars render every measured line; sequence cards and lifelines grow to fit. Agent guidance now encourages clear two- or three-line notes, with schemas/evaluation inputs synced. Verified schema tests, 45 renderer tests, 100 skill/install checks and manual PNGs. Full check passes lint/format/types/build and 3050 module tests, stopping at two preexisting palette-remap expectations in unrelated user edits.
<!-- SECTION:FINAL_SUMMARY:END -->
