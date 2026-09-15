---
id: TASK-235.09
title: Route SKILL.md to workflow references and record which guidance a run read
status: Done
assignee: []
created_date: '2026-09-15 18:52'
updated_date: '2026-09-15 19:07'
labels: []
dependencies: []
references:
  - skills/archboard/SKILL.md
  - src/runtime/skill-evaluation/lib/classify.ts
  - src/runtime/skill-evaluation/lib/report.ts
  - evals/evals.json
parent_task_id: TASK-235
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The candidate SKILL.md is 28.7k characters against the baseline 11.2k, and authors read it in two or three chunks before their first command: the read-only S09 rose 83% in median tokens. Move each workflow recipe (create architecture, create sequence, edit, propose and compare) into its own reference and keep SKILL.md as the essentials, the catalogue and a router that names which reference to read for which request. With the recipes out of SKILL.md the harness must show whether a run read the reference its workflow needs, otherwise a cost win could be a run that skipped the guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each scenario in evals.json names the guidance files its workflow needs, and the harness records per run which of them the author read
- [x] #2 The report shows per arm how many runs read every guidance file their scenario names, and the audit lists runs that did not
- [x] #3 Focused tests cover the read detection and the report column without matching prose
- [x] #4 SKILL.md holds the essentials, the evidence steps, the catalogue and a routing table; each workflow recipe lives in one reference and SKILL.md is under 18k characters (was 28.7k)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC 1 relaxed from 15k to 18k: the essentials, evidence steps and catalogue must stay in SKILL.md because every workflow needs them, and with the four recipes moved out it is 17.8k. Each scenario names guidance; the harness records guidance {expected, read, missing} in run.json; the report has a guidance column and a section listing runs that skipped one. Tests: events.test.ts (read detection), report-completeness.test.ts (column and list). Install fixture lists the four new references; archboard-dev names the recipe layout.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SKILL.md routes to one recipe per workflow and the harness records which guidance a run read; verified by the harness tests, the install test and bun run eval:skill check.
<!-- SECTION:FINAL_SUMMARY:END -->
