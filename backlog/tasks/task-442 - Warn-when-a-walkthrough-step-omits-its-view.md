---
id: TASK-442
title: Warn when a walkthrough step omits its view
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 14:06'
updated_date: '2026-10-07 14:12'
labels: []
dependencies: []
ordinal: 725000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Walkthrough authors often omit views, so readers see a diagram that does not focus on the problem. Each step needs an explicit choice, even when consecutive steps use the same view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CLI writes warn for each authored walkthrough step without a view, including a step after one with a view, and still save successfully.
- [ ] #2 Steps with explicit views, including repeated views, produce no missing-view warning.
- [ ] #3 Schema descriptions say that view will become required soon while the field remains optional today.
- [ ] #4 Author guidance and focused behavior tests cover the warning and its repair.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use the existing write-notice path to warn for each authored walkthrough beat without a view. Preserve notices on board creation and edits, and keep writes successful.
2. Annotate the input and persisted view schemas with the upcoming requirement. Update the walkthrough reference and its evaluation coverage.
3. Add focused store behavior coverage for missing, repeated, and repaired views. Generate skill artifacts and run the required gates.
No architecture board is affected: the existing content editor, lifecycle transitions, and write receipts retain their roles and connections. This adds author feedback inside that path, without new modules or dependencies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented WALKTHROUGH_VIEW_MISSING through the existing write notices. The warning names each authored beat without a view. Creation now preserves notices, as edits already do. The final resolved walkthrough supplies warning paths, and untouched walkthroughs do not warn.
The input and persisted schemas share the upcoming-requirement description. Generated schemas retain an optional view field. The walkthrough reference and evaluation coverage explain explicit views.
Focused store tests pass (12 tests), evaluation input validation passes, and skill evaluation/install tests pass (242 tests). Fixed a test lint finding without changing lint rules.
Simplification pass: reused the existing notices and warning transport. No new validator, module, dependency, CLI flag, or presentation state is needed.
<!-- SECTION:NOTES:END -->
