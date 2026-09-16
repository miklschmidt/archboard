---
id: TASK-243.01
title: Promote the candidate skill to the frozen baseline
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-16 02:27'
labels: []
dependencies: []
parent_task_id: TASK-243
ordinal: 415000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 2026-09-16 batch measured the TASK-211 candidate against the pre-rewrite baseline and the user accepted it. The next comparison must measure against what ships now, so the frozen package under docs/design/skill-evals/baseline/archboard is replaced by a copy of skills/archboard (SKILL.md and the authored references; the generated schemas and INSTALL.md are prepared at install time, as before). The pin note, the evaluation manual and the archboard-dev skill say the baseline is frozen before the TASK-211 rewrite; they must say what it is now. Freezing from the tree before any of the sibling subtasks lands keeps the baseline equal to what the batch measured.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/design/skill-evals/baseline/archboard holds SKILL.md and references/*.md byte-equal to skills/archboard at the commit before the sibling subtasks, with no generated files
- [x] #2 evals/pins.json names what the baseline was frozen from and when, and evals/README.md and skills/archboard-dev/SKILL.md no longer say it predates the TASK-211 rewrite
- [x] #3 bun run eval:skill check passes and the suite test that keeps evals out of the frozen baseline still passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the old frozen SKILL.md and references/*.md; copy skills/archboard/SKILL.md and references/*.md (not generated/) into docs/design/skill-evals/baseline/archboard. 2. Update pins.json baselineSkill.frozenAt/note, evals/README.md 'Reproducing a baseline', install.ts header comment. 3. bun run eval:skill check; run the suite and provenance tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Frozen from commit ded9ac43 (diff -r against skills/archboard shows only the untracked generated/ dir). pins.json frozenAt/note, evals/README.md, install.ts header and preservation-assessment.md reworded. bun run eval:skill check: suite ok; suite.test.ts and provenance.test.ts: 10 pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the frozen baseline with the accepted TASK-211 skill, repinned what it was frozen from, and reworded every passage that called it the pre-overhaul package; verified by diff -r, eval:skill check and the suite/provenance tests.
<!-- SECTION:FINAL_SUMMARY:END -->
