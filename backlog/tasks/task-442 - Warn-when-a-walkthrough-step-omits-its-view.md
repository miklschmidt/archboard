---
id: TASK-442
title: Warn when a walkthrough step omits its view
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 14:06'
updated_date: '2026-10-07 14:08'
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
