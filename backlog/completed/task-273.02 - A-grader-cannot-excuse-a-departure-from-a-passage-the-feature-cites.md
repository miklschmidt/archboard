---
id: TASK-273.02
title: A grader cannot excuse a departure from a passage the feature cites
status: Done
assignee:
  - '@claude'
created_date: '2026-09-18 17:49'
updated_date: '2026-09-18 23:44'
labels: []
dependencies: []
parent_task_id: TASK-273
priority: high
ordinal: 482000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The rubric's 'skill' axis says an expectation no passage of the skill teaches; it fails no run. In batch 2026-09-18T14-01-43-895Z, S09 candidate rep 3 (run-b98e641594) never used 'semantic inspect --group', which references/read.md teaches and the feature inspect.group cites in evals.json. The grader filed it on the skill axis with the gap 'the agent never opened read.md', and the run passed. Only a rubric sentence forbids this; nothing in code does. Every expected feature now carries skill citations (<file>#<heading>), so the code can tell when an 'untaught' claim names a passage the scenario already declares teaches it. User approved closing this mechanically.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A skill-axis finding whose passage is one of its feature's declared citations counts as a conformance failure of that run, and fails its semantic compliance
- [x] #2 The report lists each such reclassification with the run, the feature, the passage and the grader's stated gap, so the grader's contradiction is visible
- [x] #3 A skill-axis finding naming a passage the feature does not cite is unchanged
- [x] #4 The rule applies when a saved batch is re-reported, without re-grading
- [x] #5 Behavioural tests own the rule
- [x] #6 rubric.md's skill bullet states that a skill finding naming a passage the feature cites counts as conformance (if a cited passage does not teach the feature, judge conformance against it and raise a `fixture:` concern); lands after the user has re-reported the 2026-09-18T14-01 batch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. citations.ts: citesPassage(citations, passage), comparing citations in the one form CITATION_PATTERN fixes (file path normalised, anchor exact).
2. grader.ts: findingsByAxis files a skill-axis finding whose passage the feature cites under conformance; excusedDepartures(expected, verdict) names each such finding (feature, passage, gap). semanticallyCompliant follows through findingsByAxis.
3. records.ts/report.ts: RunRecord.reclassified; Report.reclassified lists run, arm, scenario, rep, feature, passage, gap (built in report-findings.ts).
4. report-markdown.ts: a section listing them; the findings-column prose says a skill finding on a cited passage is counted as conf.
5. rubric.md untouched: it already forbids the skill axis for a cited passage, so it states nothing false, and the batch's input digest stays valid for re-reporting.
6. Tests in grader-contract.test.ts own the rule; re-report the 14:01 batch into scratch copies to verify run-b98e641594.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in a06612d4. findingsByAxis (grader.ts) counts a skill-axis finding whose passage is one of the feature's declared citations (citesPassage in citations.ts, file path normalised, anchor exact) under conformance, so semanticallyCompliant fails the run; excusedDepartures() names each such finding (feature, passage, gap). RunRecord.excusedDepartures and Report.excusedDepartures (report-findings.ts) carry them; report.md lists them under their own heading, and the findings-column prose says such a finding counts as conf. A skill finding on an uncited passage is unchanged.
rubric.md left untouched: its Findings section already defines skill as what neither the cited passages nor anything else teaches and forbids it for a cited passage, so it states nothing false; editing it would change the input digest and make the 2026-09-18T14-01 batch refuse re-reporting (assertBatchInputs).
Tests: grader-contract.test.ts (rule, uncited case, report listing) and run-manifest.test.ts (a filed verdict re-read through recordOf, no re-grading).
Re-report of 2026-09-18T14-01 into scratch (originals restored, sha256 verified): run-b98e641594 now semanticallyCompliant=false, findings conformance [inspect.group], listed with passage references/read.md#answer-a-question-from-a-saved-board and the grader's gap; candidate totals semantic fail 4->5, ok 38->37, conf 4->5, skill 1->0.
Gates: lint, fmt:check, type-check, test:modules (3334 pass) all exit 0.
Process fault: a06612d4 was committed from the index after the TASK-273.01 worker had staged its files, so it also holds their author.ts, classify.ts, reaudit.ts, reaudit.test.ts, the reaudit hunks of records.ts and the exists hunk of evidence.test.ts. A later commit (e4bd35bc) already sits on top, so it was not split.

Review round (12409732, b9934e77):
- L1: excusedDeparturesOf skips runs answered off the checklist, which fail nothing; grader-contract.test asserts it (the assertion fails with the filter removed).
- L2: the path normalisation is gone (CITATION_PATTERN fixes the form, so a cited passage matches by its text). run-manifest.test now owns only the recordOf wiring: it takes the scenario's first feature and its first citation, which the schema guarantees, so it no longer depends on the other features' citations.
- L3: the disagreement type, its docs, the list heading, its lines and the report prose say 'counted as untaught / counted against the run', by the axis a finding is counted on.
Proposed rubric sentence for AC#6, replacing the skill bullet's 'That is a finding about the skill or the scenario, not a failure of the run, and it does not count against semantic compliance' sentence and extending its last sentence: 'That is a finding about the skill or the scenario, not a failure of the run, and it does not count against semantic compliance, except when its passage is one the feature cites: the scenario declares that passage teaches the feature, so such a finding is counted as conformance and fails the run. If a cited passage does not in fact teach the feature, judge conformance against it all the same and say so in a concern beginning `fixture:`.' Not applied: editing rubric.md changes the input digest and blocks re-reporting the 14:01 batch.
Gates after the fixes: type-check exit 0. lint and fmt:check fail only in tests/reaudit.test.ts, and test:modules only in 273.01's evidence/reaudit tests, all the 273.01 worker's in-progress files; my files lint and format clean, and the skill-evaluation suite passes apart from those.

Gate re-run on HEAD b9934e77 plus the 273.01 worker's uncommitted files: fmt:check, type-check and test:modules (3336 pass, 0 fail) exit 0. lint fails only on complexity in lib/classify.ts (shellWords, wordPart), which is the 273.01 worker's uncommitted work; my files lint clean.

Independent review, two rounds; round 2 clean. Reviewer's refinement for AC#6's rubric sentence, preferred over the one above when it lands: 'A finding naming a passage the feature cites is counted as conformance whatever axis it carries, since the scenario declares that passage teaches the feature. If that passage does not in fact teach it, file the finding all the same and name the feature and the passage in a concern beginning `fixture:` (the scenario's citation).' (Judging conformance against a passage that does not state the rule is not something a grader can do honestly.)

Full gate on a quiet tree: lint, fmt:check, type-check, build:frontend exit 0; test:modules 3338/0, test:system 168/0, test:repository 8/0, test:serial-browser 15 files 0 fail.

AC#6 landed after the user re-reported the 14:01 batch: rubric.md's skill bullet carries the reviewer's refined sentence, and the compliance paragraph above it now excepts only skill findings on uncited passages (it had the same false claim). pins.json rubric revision bumped with a note. eval:skill check suite ok; skill-evaluation tests 205/0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A grader finding on the skill axis whose passage is one of its feature's declared citations now counts as conformance and fails the run, and the report lists each with the grader's gap. Re-report of the 14:01 batch: run-b98e641594 (S09 inspect.group) now fails. Code in a06612d4, 12409732, b9934e77, 2d9f2827. Independent review clean after two rounds. AC#6 (the rubric sentence) is deliberately open: editing rubric.md changes the input digest, so it lands after the user re-reports the 14:01 batch; the wording is in the notes. Full gate on a quiet tree: lint, fmt:check, type-check, build:frontend exit 0; test:modules 3338/0, test:system 168/0, test:repository 8/0, test:serial-browser 15 files 0 fail.
<!-- SECTION:FINAL_SUMMARY:END -->
