---
id: TASK-142
title: Restore fixed-point browser coverage on GitHub Actions
status: To Do
assignee: []
created_date: '2026-08-30 05:15'
labels: []
dependencies:
  - TASK-138
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/33294001881'
priority: high
type: bug
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The fixed-point browser owner passed locally with its complete contract but timed out after 20 assertions at Bun's 30-second case boundary on GitHub Actions run 33294001881. Diagnose the hosted-only slowdown or lifecycle stall, make cancellation and completion deterministic, and remove the exact CI-only exclusion added by TASK-138 without weakening the owner or local gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Retain exact hosted evidence from run 33294001881 and identify why fixed-point-document stops after 20 assertions before the 30-second boundary.
- [ ] #2 Remove fixed-point-document.test.ts from the canonical hosted browser exclusion, workflow environment, policy checks, and documentation once repaired.
- [ ] #3 The exact fixed-point browser owner completes on GitHub Actions with every existing assertion and deterministic cleanup.
- [ ] #4 The complete hosted CI subset is green within the retained 30-minute workflow budget.
- [ ] #5 Local bun run check remains green with all 15 serial browser owners and no weakened assertion or timeout contract.
<!-- AC:END -->
