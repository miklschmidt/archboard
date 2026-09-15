---
id: TASK-235.09
title: Route SKILL.md to workflow references and record which guidance a run read
status: To Do
assignee: []
created_date: '2026-09-15 18:52'
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
- [ ] #1 SKILL.md holds the essentials, the evidence steps, the catalogue and a routing table; each workflow recipe lives in one reference and SKILL.md is under 15k characters
- [ ] #2 Each scenario in evals.json names the guidance files its workflow needs, and the harness records per run which of them the author read
- [ ] #3 The report shows per arm how many runs read every guidance file their scenario names, and the audit lists runs that did not
- [ ] #4 Focused tests cover the read detection and the report column without matching prose
<!-- AC:END -->
