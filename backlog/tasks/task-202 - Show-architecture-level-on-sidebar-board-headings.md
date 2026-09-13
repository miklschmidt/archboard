---
id: TASK-202
title: Show architecture level on sidebar board headings
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 12:02'
updated_date: '2026-09-13 17:20'
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
- [x] #1 A board can persist a validated System, Service or Module level through CLI creation/editing and exposes it in the board listing.
- [x] #2 Sidebar board headings show a compact level badge, once per board, without changing variant hierarchy or pane badges; unclassified boards show no guessed level.
- [x] #3 Existing dogfood boards have appropriate levels, the skill teaches the field, and live browser and relevant automated checks pass.
- [x] #4 Every valid board and new-board input requires a level without a default. With valid vault configuration, newly authored unconfigured levels fail; invalid configuration preserves structural validation and reports warnings under ADR0026.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Persist required board-owned level metadata, validated against vault/.archboard/config.yaml. Valid policy rejects newly authored unknown values; invalid policy permits structurally valid values with explicit warnings under ADR0026. Expose persisted levels in listings and compact board-heading badges. Repair all 11 dogfood boards while preserving diagram identities and variant/view state, update skill/docs/fixtures, and verify persistence, membership, live navigation and the full gate as part of TASK-203.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User identified this as a regression from main, not a new optional product feature. Verified main board identity stores optional level and validates slug-shaped project-specific values; CONTEXT.md still defines the abstraction level. Restore the same field semantics in semantic boards and use standard names for dogfood badges.

All 11 live dogfood boards now have explicit levels; migration asserted every variant, view and current designation stayed byte-equivalent as JSON. Configured this vault with system/service/module. Transitional optional support is only used for this one-time repair and will be replaced by required metadata.

Live badge QA shows System/Service/Module once per board heading with unchanged tree indentation and compact rows; A/B still mark only actual local panes. User additionally raised semantic style configuration and missing visual grammar explanations; a separate read-only design investigation is underway while required level enforcement finishes.

Implementation paused by explicit user request pending TASK-203 grilling and approved design. Live server remains the temporary optional-level build used for the one-time dogfood repair. Working tree now contains partial required-level/config enforcement and untested fixture helpers; no final gate run. Parent targeted UI lint also found no-unsafe-type-assertion in BoardTree levelLabel and it is intentionally left for resumed implementation. Do not restart and declare complete from this intermediate source.

Completed under the explicitly approved TASK-203 implementation. YAML config replaces the interim JSON path. Required-level/membership runtime checks pass, all eleven authored dogfood boards retain their level and identity/variant/view baseline, sidebar badges verified in live desktop browser without changing the tree or local pane markers, and the complete bun run check passes. ADR0026 invalid-policy fallback is reflected in criterion4.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored required consumer-defined board levels, persisted/listed them, and displayed compact per-board sidebar badges. Integrated YAML vocabulary enforcement and warning fallback under TASK-203, updated dogfood/skill/fixtures, and verified with runtime tests, live desktop navigation and bun run check exit0.
<!-- SECTION:FINAL_SUMMARY:END -->
