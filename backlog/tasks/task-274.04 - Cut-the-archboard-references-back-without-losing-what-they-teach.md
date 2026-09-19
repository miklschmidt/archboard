---
id: TASK-274.04
title: Cut the archboard references back without losing what they teach
status: To Do
assignee: []
created_date: '2026-09-19 00:40'
updated_date: '2026-09-19 00:41'
labels: []
dependencies:
  - TASK-274.03
parent_task_id: TASK-274
priority: high
ordinal: 488000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
SKILL.md was trimmed under TASK-273.03 (32.4 -> 21.9 KB), yet median author tokens in batch 2026-09-18T23-44-56-390Z were still +20% over the baseline. The references grew from 69 KB to 90 KB: authoring.md 15.3 -> 21.1 KB, create-sequence.md 5.8 -> 9.1, variants.md 6.5 -> 8.9, propose-compare.md 3.3 -> 4.8, create-architecture.md 5.2 -> 6.2. Candidate authors read more of them (one S06 run read references/*.md whole). Same method as TASK-273.03: padding, duplication (between references, and between a reference and SKILL.md), and a rule ledger an independent reviewer checks rule by rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The references total materially less than 90 KB; per-file before/after recorded in the task
- [ ] #2 Every rule the references taught is still taught somewhere a run that needs it will read; a reviewer diff-checks the ledger rule by rule
- [ ] #3 No evals/evals.json or rubric.md edit and no heading moved, so every skill citation still resolves (bun run eval:skill check)
- [ ] #4 Derived copies resynced and bun run check passes
<!-- AC:END -->
