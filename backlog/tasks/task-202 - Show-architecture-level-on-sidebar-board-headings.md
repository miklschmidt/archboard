---
id: TASK-202
title: Show architecture level on sidebar board headings
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-13 12:02'
updated_date: '2026-09-13 12:14'
labels: []
dependencies:
  - TASK-203
ordinal: 361000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers cannot distinguish system, service and module boards in the navigation. Existing dogfood levels are prose in summaries rather than board metadata.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board can persist a validated System, Service or Module level through CLI creation/editing and exposes it in the board listing.
- [ ] #2 Sidebar board headings show a compact level badge, once per board, without changing variant hierarchy or pane badges; unclassified boards show no guessed level.
- [ ] #3 Existing dogfood boards have appropriate levels, the skill teaches the field, and live browser and relevant automated checks pass.
- [ ] #4 Every valid board and new-board input requires a level; omitted or unconfigured values fail without defaults, and the consumer defines the allowed values per vault.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Restore level as required board-owned metadata, validated against the consumer-defined enum in vault/.archboard/config.json. Expose vocabulary through the existing semantic listing. Add compact board-heading badges using the persisted field. Repair all 11 dogfood boards with explicit values and preserve diagram content. Update setup, docs, skill, and runtime test fixtures; verify requiredness, membership, persistence, live navigation and the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User identified this as a regression from main, not a new optional product feature. Verified main board identity stores optional level and validates slug-shaped project-specific values; CONTEXT.md still defines the abstraction level. Restore the same field semantics in semantic boards and use standard names for dogfood badges.

All 11 live dogfood boards now have explicit levels; migration asserted every variant, view and current designation stayed byte-equivalent as JSON. Configured this vault with system/service/module. Transitional optional support is only used for this one-time repair and will be replaced by required metadata.

Live badge QA shows System/Service/Module once per board heading with unchanged tree indentation and compact rows; A/B still mark only actual local panes. User additionally raised semantic style configuration and missing visual grammar explanations; a separate read-only design investigation is underway while required level enforcement finishes.

Implementation paused by explicit user request pending TASK-203 grilling and approved design. Live server remains the temporary optional-level build used for the one-time dogfood repair. Working tree now contains partial required-level/config enforcement and untested fixture helpers; no final gate run. Parent targeted UI lint also found no-unsafe-type-assertion in BoardTree levelLabel and it is intentionally left for resumed implementation. Do not restart and declare complete from this intermediate source.
<!-- SECTION:NOTES:END -->
