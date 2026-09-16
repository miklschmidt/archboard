---
id: TASK-244
title: Tolerate three-run noise in the quality-regressed verdict
status: To Do
assignee: []
created_date: '2026-09-16 02:26'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/report.ts
  - .skill-evals/2026-09-16T00-32-53-542Z/report.md
ordinal: 422000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The skill evaluation report prints REGRESSED whenever any of four three-run mean scores drops by any amount. In the 2026-09-16 batch S04 read REGRESSED with 3/3 ok, 13% cheaper and better completeness because one run scored 9 instead of 10; S06, S09 and S13 were the same. Fifteen of the twenty rows printed REGRESSED and three reflected a real loss (S05, S00, S14 readability). The verdict needs a tolerance or a per-run comparison so a reader can trust the column.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A mean drop smaller than one grader point spread over the arm (one point on one run of three) does not by itself print REGRESSED; a lost success or a new visual failure still does
- [ ] #2 The report legend says what REGRESSED means and a fast test holds the rule
<!-- AC:END -->
