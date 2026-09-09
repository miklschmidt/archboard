---
id: TASK-164
title: Adapt frontend code structure guidance to Archboard
status: Done
assignee:
  - '@codex'
created_date: '2026-09-09 12:49'
updated_date: '2026-09-09 12:51'
labels: []
dependencies: []
type: docs
ordinal: 315000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents currently lack frontend-specific placement and React ownership rules. The user approved adapting Platform.Frontend guidance to existing Archboard UI modules, retaining the local stack except planned TanStack Router and Query adoption, and scoping a dedicated cleanup separately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Frontend rules describe the agreed placement, naming, component and state ownership conventions without contradicting module boundaries or test ownership.
- [x] #2 Rules distinguish current implementation from the agreed Router and Query migration targets.
- [x] #3 Dedicated structure, routing and Query cleanup scopes are tracked with concrete outcomes and unresolved product decisions identified.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write one frontend guidance document and discovery pointers. 2. Track separate future cleanup tasks from the agreed scope. 3. Check documentation consistency and formatting, then simplify the authored guidance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Manually compared the authored guidance with the agreed interview decisions, module-entrypoint/privacy and test-owner contracts, and local stack. Kept one frontend document with discovery pointers; retained focused public entrypoints instead of importing Platform root layout or barrel prohibition. Router/Query implementation details that remain undecided are explicit prerequisites in their future tasks. Formatting check passed for all three authored Markdown files; git diff --check passed. No runtime source, dependency, test or lint configuration changed, so runtime suites were not run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added docs/agents/frontend.md and pointers in AGENTS.md and boundaries.md. Adopted adapted concern placement, naming, component and leaf state ownership, and approved Router/Query boundaries. Scoped TASK-165 structure cleanup, TASK-166 workspace routing, and TASK-167 Query migration as separate To Do tasks. Verified by manual contract/decision comparison, targeted oxfmt check, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
