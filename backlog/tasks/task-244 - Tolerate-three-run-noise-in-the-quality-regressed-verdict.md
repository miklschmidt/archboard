---
id: TASK-244
title: Tolerate three-run noise in the quality-regressed verdict
status: Done
assignee: []
created_date: '2026-09-16 02:26'
updated_date: '2026-10-11 13:50'
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
- [x] #1 A mean drop smaller than one grader point spread over the arm (one point on one run of three) does not by itself print REGRESSED; a lost success or a new visual failure still does
- [x] #2 The report legend says what REGRESSED means and a fast test holds the rule
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 audit: delivered by abc9b9752 (report what moved instead of stamping REGRESSED), a604ef5ca and e22a57ef1. Verified: bun test --isolate src/runtime/skill-evaluation/tests/report-change.test.ts passes (12 tests in that file; 26 pass with storage.test.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done before this audit by abc9b9752: a per-scenario row draws no REGRESSED word, means are held to a paired noise bar, and a lost success or a new visual failure still regresses. The report legend says what the verdict means (report-markdown.ts). Verified 2026-10-11 with report-change.test.ts, which holds the rule (e.g. 'one grader point on one run is never a move'). Note: a consistent one-point fall across every run still regresses, by design.
<!-- SECTION:FINAL_SUMMARY:END -->
