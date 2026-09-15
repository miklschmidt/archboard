---
id: TASK-235.01
title: Stop requiring a traffic disclaimer in S10 and the skill
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-15 18:51'
updated_date: '2026-09-15 18:52'
labels: []
dependencies: []
references:
  - evals/evals.json
  - skills/archboard/SKILL.md
  - skills/archboard/references/authoring.md
parent_task_id: TASK-235
ordinal: 396000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S10 failed 6/6 in the 2026-09-15 batch on the single feature traffic.illustrative: every edit was right and the answer did not add a sentence saying traffic is illustrative. A diagram is illustrative by nature; the sentence is noise in a report and the skill should not tell authors to put disclaimers in their answers. Keep the grader rule that presenting traffic as measured telemetry is incorrect; drop the demand for a caveat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 S10 in evals/evals.json declares no expected feature that asks the answer to distinguish illustration from telemetry
- [ ] #2 Neither SKILL.md nor the authoring reference tells an author to say traffic is illustrative when reporting it; the rule that traffic is not a measurement stays
- [ ] #3 bun run eval:skill check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove traffic.illustrative from S10 in evals.json. 2. Drop the say-so lines in SKILL.md Keep it true and authoring.md Relationships. 3. Run eval:skill check.
<!-- SECTION:PLAN:END -->
