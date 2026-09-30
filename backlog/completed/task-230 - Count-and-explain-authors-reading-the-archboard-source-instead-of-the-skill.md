---
id: TASK-230
title: Count and explain authors reading the archboard source instead of the skill
status: Done
assignee: []
created_date: '2026-09-15 12:31'
updated_date: '2026-09-15 12:35'
labels:
  - skill-evals
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/events.ts
  - src/runtime/skill-evaluation/lib/report.ts
  - evals/rubric.md
  - skills/archboard/SKILL.md
priority: high
type: enhancement
ordinal: 390000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An author that reads the installed skill, its references and the generated schemas is doing what the skill says and should make fewer mistakes; an author that opens the archboard product source (src/, the runtime tests, the CLI implementation) to work out how the product behaves has hit a question the skill or a CLI answer should have settled, which is a skill gap or a tooling gap. The harness cannot see the difference today: reading the skill is discovery, reading Flask is code-investigation, and reading the archboard source outside src/runtime/skill-evaluation counts as nothing (the 2026-09-15 batch has a baseline S07 author grepping src/runtime/semantic-board-store/tests to learn the flow schema, visible only in a grader concern). Contamination stays what it is (evaluation inputs, harness source, another run); this is a separate diagnostic that the report shows per arm and the grader explains per run, so each such read becomes a concrete item for the skill or the CLI. The skill should also make the expected path explicit: an open product question is answered by the references, the generated schemas or --help, and one none of them answers is reported in the final message rather than researched in the source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A command that reads the archboard checkout outside the installed skill and the harness source is classified as its own command class, product-source, distinct from discovery, code-investigation and the contamination exposures; unit tests cover a skill read, a Flask read, a harness-source read and an archboard runtime read
- [x] #2 The report shows per arm how many runs read the product source, in the scenario, workflow and broad tables, without treating it as contamination or failure, and the footnote says what the count means
- [x] #3 The rubric asks the grader to list each product-source read under concerns prefixed tooling:, naming what the author was looking for and whether the skill or a CLI answer should have supplied it
- [x] #4 SKILL.md states where an open product question is answered (references, generated schemas, --help) and that a question none of them answers is reported in the final message
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Command classification moved into lib/classify.ts (events.ts had passed the 600-line cap) with events.ts re-exporting it. New class product-source: an investigation command naming the archboard checkout (context.archboardRoot, set from job.checkout in author.ts) or the product's module layout (src/runtime|cli|server|shared|frontend), ranked after the skill, help, vocabulary and CLI rules and before the ambiguous rule so a path containing 'archboard' is not swallowed. Exposure is untouched: a harness-source read is product-source in class and harness-source in exposure. Report: productSourceReads per arm (runs with at least one), a 'product src' column and footnote; older manifests default the count to 0 at load, so the 2026-09-15 batch shows 0 until a new batch is run. Rubric: concerns prefixed tooling: for each such read. SKILL.md Essentials gained 'Open questions': references, generated schemas, --help, and an unanswered question goes in the final message. Verified: evidence.test (skill=discovery, Flask=code-investigation, runtime test file and CLI source=product-source, harness file=product-source+harness-source exposure), report-completeness (count per arm, not a failure, not contamination), 110 pass, tsc, full lint, fmt:check, skills synced.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Authors reading the archboard product source are now classified, counted per arm in the report and explained by the grader as tooling: concerns, separately from expected skill reads and from contamination; the skill tells authors where an open product question is answered and to report one that is not. Verified with the skill-evaluation tests and the full lint gate.
<!-- SECTION:FINAL_SUMMARY:END -->
