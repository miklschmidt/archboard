---
id: TASK-227
title: 'Teach the skill to model everything the code shows, unprompted'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 12:21'
updated_date: '2026-09-15 12:27'
labels:
  - skill
dependencies: []
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/authoring.md
  - evals/rubric.md
  - TASK-211
  - .skill-evals/2026-09-15T03-21-37-188Z/report.md
priority: high
type: enhancement
ordinal: 387000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-15 batch no candidate run authored traffic, groups, notes, emphasis, a view or a walkthrough unless the request named it; S07 authors dropped the repeat the source fixes because the prompt did not spell it out. The archboard skill documents each semantic where it is used, but nowhere lists what a reader of the code should look for and what each observation becomes on a board, so an author whose request says only "describe how a request travels" stops at parts and calls. A person asking for a board expects the author to know the product; the request names the question, the level and the names the harness must find, not the semantics. The skill needs one exhaustive catalogue, in a fixed vocabulary shared with the grading rubric, from observed code facts (a part outside the checkout, a file that implements a responsibility, a runtime hot path against a setup path, a loop over a fixed list, a branch or an environment variable, a configured concern, an exchange in order, a subset worth isolating, a why the reader needs, an existing detail board) to the archboard semantic each becomes (external kind, binding, traffic and emphasis, repeat, note, groups, a flow with a data-flow view, a view, a walkthrough beat, drillDown), and the create and edit workflows must walk it before every write and account for it in the final message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SKILL.md carries one catalogue table from observed code facts to archboard semantics covering external parts, bindings, containment, relationship kinds and labels, traffic and emphasis on runtime paths, repeat, note, groups, flows with data-flow views, views, walkthrough beats, drillDown and descriptions, each row saying what in the source justifies it and when it is left out
- [x] #2 The architecture-create, sequence-create and edit workflows each have a step that walks the catalogue before the write and a final-message obligation to say which rows were used and which judged not to apply
- [x] #3 The catalogue vocabulary (row names) is the one evals/rubric.md uses for unprompted features, so a grader and an author name the same thing the same way
- [x] #4 skills are re-synced (bun scripts/sync-skills.ts) and the skill tests and lint pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an 'Everything the code shows' catalogue section to SKILL.md after 'Evidence before a write': rows external, binding, containment, relationship, traffic, emphasis, repeat, note, groups, flow, view, walkthrough, drillDown, description, each with what in the source justifies it and when it is left out. 2. Add a walk-the-catalogue step to the architecture-create, sequence-create and edit workflows and a final-message obligation to account for the rows. 3. Re-sync skills, run lint and skill tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added the 'Everything the code shows' catalogue (14 rows: external, binding, containment, relationship, traffic, emphasis, repeat, note, groups, flow, view, walkthrough, drillDown, description) to SKILL.md between the evidence steps and the create workflows; the create-architecture, create-sequence and edit workflows walk it before the write and account for the rows in the answer. evals/rubric.md uses the same row names. Verified: bun scripts/sync-skills.ts, bun test src/runtime/skill-evaluation (108 pass), tsc, fmt:check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SKILL.md now carries one catalogue from observed code facts to archboard semantics and every authoring workflow walks it unprompted and reports which rows applied; the rubric shares the vocabulary. Verified with sync, tests, tsc and fmt.
<!-- SECTION:FINAL_SUMMARY:END -->
