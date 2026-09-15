---
id: TASK-228
title: Grade the semantics a run should have added unprompted
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 12:22'
updated_date: '2026-09-15 12:27'
labels:
  - skill-evals
dependencies:
  - TASK-227
references:
  - evals/rubric.md
  - src/runtime/skill-evaluation/lib/grader.ts
  - src/runtime/skill-evaluation/lib/report.ts
  - TASK-214
priority: high
type: enhancement
ordinal: 388000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The grader judges only the expected-feature checklist each scenario declares, and the checklist mirrors the prompt, so a board that stops at what the prompt spelled out scores as well as one that also models what the code shows. In the 2026-09-15 batch no run added traffic, groups, notes, emphasis, views or walkthroughs unless the request named them, and the report could not see that. The harness needs a second, prompt-independent judgment: for every run that authored a board, the grader walks the catalogue of code facts and archboard semantics the skill teaches (TASK-227 fixes the vocabulary) and says which rows the source justified on this board, which of those the author used and which it missed, with evidence, and scores behavioural completeness (does the board use every semantic the source justifies to explain the behaviour of the code, beyond what the request named). A read-only request has nothing to add and is not scored. The report carries the score and the missed count per arm, treats a drop like the other scores, and old verdicts that lack the field still load.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 evals/rubric.md has a section that names the catalogue rows in the vocabulary SKILL.md uses, tells the grader to judge each row the source justifies as used or missed with evidence regardless of whether the request named it, and defines the behaviouralCompleteness score
- [x] #2 The grader output schema requires per-run unprompted findings ({feature, verdict used|missed, evidence, reason}) and a behaviouralCompleteness integer score, or null for a run that wrote nothing; verdicts filed before the field existed still parse
- [x] #3 The report shows mean behavioural completeness and the number of missed rows per arm in the scenario, workflow and broad tables, and a drop in the mean counts as a quality regression
- [x] #4 Focused tests cover the schema (a verdict without the field, a null score on a read run), the report columns and the regression rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. rubric.md: new section naming the catalogue rows and defining used/missed verdicts and behaviouralCompleteness. 2. grader.ts: schema fields unprompted[] and behaviouralCompleteness (nullable), required from the grader, optional in filed verdicts; prompt line. 3. report.ts: meanBehaviouralCompleteness and missedUnprompted per arm, table columns, regression measure. 4. fake-claude and focused tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
rubric.md gained 'What the skill adds unprompted' (catalogue table, used/missed verdicts, behaviouralCompleteness 0-10 or null for a run that wrote nothing). grader.ts requires unprompted[] and behaviouralCompleteness from the grader (prompt line added) and keeps both optional on filed verdicts so earlier batches load. report.ts adds meanBehaviouralCompleteness and missedUnprompted per arm, two table columns, footnote text, and the completeness mean as a regression measure. Tests: blinding-and-reports (schema: required from the grader, null on a read run, a bad verdict refused, an old verdict still parses), report-completeness (means, missed count, regression), fake-claude carries the fields. 108 pass; tsc clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The grader now judges every run against the catalogue rows the source justifies regardless of the prompt, and the report scores behavioural completeness and counts missed rows per arm with a drop counted as a regression. Verified with the skill-evaluation tests and tsc.
<!-- SECTION:FINAL_SUMMARY:END -->
