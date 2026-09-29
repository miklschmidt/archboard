---
id: TASK-367.04
title: 'Relationships and flow steps carry an anchor, and a binding can name a symbol'
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
  - semantic-model
  - skill
dependencies:
  - TASK-367.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: feature
ordinal: 612000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Evidence rule 3 of the consumer skill makes an agent record a file and a symbol for every relationship and flow step. The record is discarded, because the relationship schema has no field for it (`src/shared/semantic-board/lib/content.ts`, `views.ts`). A binding names a file but not the symbol or resource address inside it, so nothing can tell whether the file still holds what the part claims. The ADR of the decision task names the fields. The same symbol field holds a resource address for infrastructure, such as `module.checkout.aws_lambda_function.api` or `Deployment/checkout`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A relationship and a flow step accept an optional anchor, and a binding accepts an optional symbol, in the persisted schema and the agent input
- [ ] #2 Comparison treats an anchor as bookkeeping and ignores it (ADR 0023). A changed binding symbol is a changed binding
- [ ] #3 Reconciliation carries an anchor like other authored fields, and restating a relationship without its anchor does not lose it silently
- [ ] #4 Every reader of a binding honours the symbol or says that it ignores it. The inspector shows the symbol
- [ ] #5 The consumer skill writes the evidence record into the payload, one recipe's worked example shows an anchor, the generated schemas are regenerated, and the eval inputs and `coverage.json` row are updated
<!-- AC:END -->
