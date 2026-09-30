---
id: TASK-266
title: Report what moved instead of stamping REGRESSED
status: Done
assignee:
  - '@claude'
created_date: '2026-09-18 11:02'
updated_date: '2026-09-18 12:23'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/report.ts
  - src/runtime/skill-evaluation/lib/report-markdown.ts
  - src/runtime/skill-evaluation/lib/grader.ts
  - src/runtime/skill-evaluation/lib/records.ts
  - .skill-evals/2026-09-18T01-50-12-580Z/report.md
priority: medium
type: enhancement
ordinal: 473000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The change rows of a batch report carry one word — REGRESSED, held or unassessed — produced by qualityRegressed() in src/runtime/skill-evaluation/lib/report.ts:323, a boolean OR over four 0-10 grader means plus two counts, where the mean test is a bare `<` (dropped(), line 293). At three runs per scenario the smallest possible move on a mean is 0.33, one grader point on one run, so the flag fires on the least evidence a batch can produce.

In the 2026-09-18 batch it fired on six of fifteen scenarios: S10 on truth -0.33, S12 on completeness -0.33, S07 on completeness -0.67, S09 on correctness and truth -1.00, and S03 on ok 3->2, which was a grader defect rather than the author. Measured against that, the spread within a single arm on a single scenario and axis — the same skill, three runs — has a median of 0 but a p75 of 1, a p90 of 2 and a maximum of 4. Four of the five mean-triggered flags sit below the noise the harness already measures in itself.

The word also destroys what a reader needs: nothing in the report says which axis moved or by how much, so acting on a flag means opening report.json. And there is no IMPROVED, so a batch where the candidate went 0/3 to 2/3 on S00 shows six regressions and no wins.

A related defect feeds it. Five of ninety runs failed semantic compliance because the grader answered feature names it invented rather than the scenario's checklist, and semanticallyCompliant() (grader.ts:315) fails a run for any unmentioned expected feature: run-906a03e494, run-9589d57705, run-944a5159c9, run-8fb1ff4283, run-96279e89a2. Those verdicts say nothing about the author and should be set aside the way contamination is, not counted as failures — S03's REGRESSED was entirely this artefact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A change row names the axis and the size of what moved rather than a single word
- [x] #2 A fall in the success or visual-failure counts is reported separately from a fall in a grader mean, since only the first is a pass/fail count
- [x] #3 A grader mean must fall by more than the harness's own within-arm spread before it is called a regression, and the bar is derived from the batch rather than written in
- [x] #4 Per-scenario rows at three runs report deltas only; the regression verdict is drawn at the workflow and arm rows, where the run counts support it
- [x] #5 An improvement is reported as readily as a regression
- [x] #6 A row that cannot be assessed says which precondition failed: the arms are not comparable, or a picture was never opened
- [x] #7 A run whose verdict does not answer its scenario's checklist is set aside as ungradable and excluded from both comparisons, listed like a contaminated run, and is not counted as a semantic failure
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Separate ungradable from failed first, since it changes every count below it. Give RunRecord a verdict standing that distinguishes a run the grader answered off-checklist from one it failed; checklistGaps() already computes the unmentioned features, so records.ts can set it without new grading. Exclude those runs from both comparisons and list them beside the contaminated ones in the markdown.
2. Replace the single qualityRegressed boolean with a small result naming what moved: the counts that fell (succeeded, visualFailed) and, per axis, the mean before, after and delta. Keep the existing preconditions for whether a comparison may be drawn at all.
3. Derive the noise bar from the batch rather than hard-coding it: compute the within-arm spread per scenario and axis across both arms, and require a mean's fall to exceed it before the row calls it a regression. Record the bar in the report so a reader can see what it was held to.
4. Draw the verdict only where the run counts support it — workflow rows and arm totals. Scenario rows carry deltas and the pass counts.
5. Make the direction symmetric, so an improvement prints the same way a regression does.
6. Split the null case: say whether the arms were not comparable or a picture was never opened.
7. Update report-markdown.ts for the new columns; keep them narrow enough to read. Follow the repo's test policy — own the arithmetic (noise bar, standing, direction) in focused unit tests and do not assert the rendered wording.
8. Regenerate the 2026-09-18 report from its saved runs and check it by hand: S03 should no longer show a regression, S00 and S14 should show as improvements, and S09 should be the one mean-driven regression that survives the bar. bun run check.

9. Deviations settled while implementing: the change model and its arithmetic live in a new src/runtime/skill-evaluation/lib/report-change.ts (report.ts would otherwise pass the 600-line limit); the noise bar is per row and per axis, taken as the larger of the two arms' spread-over-runs, which is the movement one run can give a mean; the two withheld reasons are arms-not-comparable and pictures-not-judged; an arm-total row over every primary run is added so the verdict has a row whose run counts support it; a run is ungradable when the grader left an expected feature unmentioned AND answered names the checklist does not hold.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented across three commits on feat/semantic-boards.

What a change row now carries. ComparisonRow.qualityRegressed is gone; ComparisonRow.change is either {assessed:false, reason} or {assessed:true, counts, axes, standing}. counts holds succeeded and visualFailed with before, after, delta and direction, kept apart from the means because a count is a tally of runs and any move in it is real. axes holds one entry per axis both arms scored, with before, after, delta, the noise bar and the direction. standing is the row's one word (improved, regressed, held or mixed) and is null on a row covering a single scenario.

The noise bar. An arm's noise on an axis is its spread (highest minus lowest score) divided by the runs it averages, because moving one run by the whole spread moves the mean by exactly that; a row's bar is the larger of its two arms' noise. Nothing is written in: three identical scores an arm give a bar of zero, so a consistent one-point fall is a regression, while arms that already spread by one call the same third noise. The bar is carried in the row and printed beside each delta.

The verdict. Drawn only where more than one scenario's runs stand behind a row, which is exactly the workflow rows and the new arm-total row; a per-scenario row at three runs prints deltas only. A withheld row says which precondition failed: arms-not-comparable (unpaired, unaudited, contaminated, directly written or holding a set-aside run) or pictures-not-judged (a run ungraded or a capture never opened).

Ungradable runs. checklistGaps now also returns the names the grader answered that the checklist does not hold. A verdict that left an expected feature unmentioned and answered names of its own is set aside: semanticallyCompliant is null rather than false, the run enters neither comparison, it withholds its row the way a contaminated run does, it is listed in its own report section with the names it skipped and the names it invented, and it is not counted as a semantic failure. On the 2026-09-18 batch this selects exactly the five named runs and nothing else (run-906a03e494 S02, run-9589d57705 S07, run-944a5159c9 S11, run-8fb1ff4283 S03, run-96279e89a2 S05); every other run of the ninety answered its checklist exactly.

Files: lib/report-change.ts (new), lib/report.ts, lib/report-markdown.ts, lib/records.ts, lib/grader.ts, lib/run-manifest.ts, lib/grading-run.ts, index.ts; tests/report-change.test.ts (new), tests/report-completeness.test.ts, tests/blinding-and-reports.test.ts, tests/run-manifest.test.ts, and the record fixtures in tests/evidence.test.ts and tests/grader-agreement.test.ts.

A distinct defect fixed here, not one of this task's criteria: readManifests (records.ts) and bundledRuns (grading-run.ts) reached their files with a recursive readdirSync over the batch's runs directory. A run preserves its whole world, its author's transcript and its codex home beside its manifest, so that tree is about 15 GB for the 2026-09-18 batch; the walk built a path string for every file in it before filtering and drove this machine into swap. One lister, runDirectories in run-manifest.ts, now reads runs/<arm>/<scenario>/<repetition> by name, and neither reader descends into a preserved world. tests/run-manifest.test.ts pins that it finds exactly the manifests and ignores a run.json below a preserved world.

History note: the second commit's content landed early inside another worker's commit ceea8546, whose message is about TASK-263; four workers were committing to this branch at once and their bare git commit took the shared index. Nothing was altered. The other two commits are abc9b975 and e508be25.

Step 8, regenerated by hand from the saved run records of .skill-evals/2026-09-18T01-50-12-580Z. No grading and no model call: buildBatchReport over the saved manifests and filed verdicts, rendered to a scratchpad directory, with the saved batch left untouched. The scenario rows read:

S00 succeeded +2, correctness +1.33 against a bar of 0.67, completeness +1.00 against 0.33 — the improvement the old report showed as 'held'.
S03 unassessed, arms not comparable: its candidate arm holds run-8fb1ff4283, now set aside. Its REGRESSED is gone, and its candidate semantic-failure count falls from 1 to 0.
S09 correctness -1.00 and truth -1.00, both against a bar of 0.00 — the only scenario in the batch whose mean falls past its own noise, as expected.
S10 (truth -0.33), S12 (completeness -0.33) and S08 (correctness -0.33) no longer report anything: each sits inside the bar its own arms set.
S02, S05, S07 and S11 are unassessed because each holds one of the five set-aside runs; S07's completeness -0.67 goes with it.

One expectation of step 8 does not hold, and did not hold before this task either: S14 cannot show as an improvement because its candidate arm holds a contaminated run, so the row was already unassessed in the saved report and still is. S08 is unassessed for the same reason. That is the existing contamination rule, untouched here. Its axes did move (readability +2.00, completeness +1.33, correctness +1.00), and they would be reported as improvements if the arm were clean.

No verdict word appears anywhere in this batch: the only comparable workflow is 'read', which holds S09 alone and therefore prints deltas only, and every other workflow and the arm total hold a set-aside or contaminated run. The verdict path is owned by tests/report-change.test.ts instead.

Verification run (each under timeout 300 and a 6G memory-capped scope): bun run type-check clean; bun scripts/lint.ts type-aware over src/runtime/skill-evaluation clean; the baseline lint lane over its tests clean; oxfmt --check clean; bun test over tests/report-change.test.ts, report-completeness.test.ts, blinding-and-reports.test.ts, evidence.test.ts, grader-agreement.test.ts, run-manifest.test.ts and claude-grading.test.ts — 63 + 31 pass, 0 fail. The full gate was not run: four workers share this tree.

Review round 1 addressed.

The noise bar is recalibrated and re-based. It took one arm's raw spread over the runs it averaged; that falls as the count while the uncertainty of a mean falls as its square root, so the agreement at three runs was a coincidence and the bar was two to three times too small at the arm-total row — the clean 2026-09-17 batch would have been stamped regressed on a truth mean that moved 0.10 against a bar of 0.07. Pooling raw scores across scenarios also measured the wrong quantity: one scenario scoring higher than another is not noise and cancels in the delta. The two arms are now paired by the identity they already share (scenario and repetition), and the bar is the spread of those paired differences over the square root of how many were averaged. Replayed: the 2026-09-17 arm total holds, the 2026-09-16 arm total is mixed only on its pass counts (tallies, no bar), and the 2026-09-18 calls are unchanged but for S00's completeness +1.00, which now sits inside its bar while S00's correctness +1.33 against 1.15 still carries the improvement. The property the reviewer asked to keep survives at every size and is now owned by a test: one grader point on one run can never be called a move, because the pair holding it puts that point into the spread. This also subsumes the optional finding about taking the max of two arms' noise: a paired difference already carries both arms' variation.

The off-checklist rule is now checklistStanding() in grader.ts, exported and unit-tested over its four cases (kept to, only skipped, only added to, replaced). It was a conjunction inside a private function of records.ts reachable only through buildBatchReport, which nothing tests; changing its && to || left all 63 tests green. The record now carries the standing the rule decided rather than re-deriving it, so there is one site.

A run set aside is listed among the runs that did not succeed again. Three of the five never had a picture opened, which is the run's own defect; dropping them from failures hid that and left their arm's pass count short with nothing explaining it. The ungradable section stays as an additional listing, the way contamination is, and a set-aside run's failure line says so.

Decided and not changed. The per-axis mark on a single-scenario row is kept: AC#4 withholds the row's one word at three runs, which it does, but a reader of that row still needs to see which deltas cleared their own bar, and the bar is printed beside each. One set-aside run still withholds its whole row rather than being dropped with its opposite-arm partner: it is the treatment contamination already has, it is what 'excluded from both comparisons' most conservatively means, and the cost measured today is S03, S07 and the edit workflow, whose old REGRESSED was the S03 artefact this task removes. index.ts publishes the change vocabulary because the import rule routes every consumer through it; two of those symbols cross back into report.ts.

Correction to an earlier note: S08 does not sit inside its bar. It is unassessed, blocked by a contaminated run, exactly as S14 is; only S10 and S12 fall inside their bars.

Re-verified: type-check clean, both lint lanes clean over src/runtime/skill-evaluation, oxfmt --check clean, 73 pass 0 fail over the seven affected test files. Commits: abc9b975, the slice inside ceea8546, e508be25, a604ef5c.

Review round 2 addressed, and four things recorded for whoever reads a report next.

The bar's guarantee is bounded, and the boundary is now guarded. One grader point on one run can never be called a move AT TWO PAIRS OR MORE: the pair holding that point puts it into the spread, leaving a bar of 1/root(m) against a delta of 1/m, and 1/m is below 1/root(m) only above one pair. A SINGLE PAIR CANNOT SET A BAR AT ALL — the spread of one difference is zero, so pairedNoise([-1]) is 0 and one pair a grader point apart was being called a regression. It is reachable without touching a setting: a run that wrote nothing has no completeness to score and its pair drops out, which left S06's completeness in the 2026-09-15 batch on one surviving pair, and a batch run at one repetition would put every scenario row there on every axis. An axis fewer than two pairs both scored is now left out the way an axis neither arm scored already was, so it prints n/a and a reader sees that one pair says nothing. S06's completeness cell in that batch is now n/a; every other replayed row is unchanged.

The bar is deliberately conservative, and increasingly so as a row grows. The paired standard error is sd/root(m); using the range in place of the standard deviation inflates it by about 1.7 times at three pairs, 2.5 at six, 3.3 at twelve and 4.2 at forty-two. So the bar sits near 1.7 standard errors on a scenario row and about 4 on the arm total. That is the opposite error from the one this task removed and much the safer of the two, and the range needs no assumption about how the scores are distributed — but the consequence is real: AGGREGATE ROWS WILL HARDLY EVER FIRE ON A MEAN.

Which means the aggregate word is in practice set by the pass/fail counts. On the 2026-09-17T16-31 batch the arm total reads regressed off visualFailed +2 out of 42 runs while every mean is flat, -0.02 to +0.05 against bars of 0.31 to 1.23. That follows from the criterion that keeps counts apart from means — a count is a tally of runs and any move in it is real — and the row prints what drove it, so it is not hidden. It is still the one place a whole-batch word turns on two runs, and a reader should know it.

AxisChange.before and after are means over the COMMON SUPPORT, not the arm means of the same names. A pair is dropped where either run has no score on that axis, so on the 2026-09-17 arm total completeness pairs at 39 while each arm holds 42 runs, and those means differ from meanBehaviouralCompleteness on the arm lines. The markdown prints only the delta and the bar, so no reader of the report sees the difference, but a consumer of report.json would; the field now says so where it is defined.

Commits this round: e22a57ef. Signed commits were unavailable while the system rebuilt, so this one is unsigned with --no-gpg-sign at the user's explicit direction; no git config was changed.

Final validation. 160 pass, 0 fail over all 22 test files of src/runtime/skill-evaluation (timeout 300 inside a 6G memory-capped scope). Type-aware lint over src/runtime/skill-evaluation clean; baseline lint over its tests clean; oxfmt --check clean. bun run type-check reports two errors, both in src/transformers/semantic-renderer/lib/layout/shared-runs.ts from another worker's in-flight edit; nothing in skill-evaluation. The full gate was not run: four workers share this tree.

Evidence per criterion, all from src/runtime/skill-evaluation/tests/report-change.test.ts unless named otherwise, and from the report regenerated from the saved runs of .skill-evals/2026-09-18T01-50-12-580Z.

#1 'the bar a row is held to comes from its own runs' asserts the whole AxisChange: axis, before, after, delta, noise and direction. In the regenerated markdown S09's change line reads -1.00/0.00! under the correctness column and again under truth, naming which axis moved and by how much where the old report said only REGRESSED.
#2 'a count that fell is reported apart from the means' asserts succeeded 3 to 2 and visualFailed 0 to 1 as their own entries with their own directions, and that the correctness mean held through the same row.
#3 'the bar is the spread of the paired differences over the root of how many were averaged', 'one grader point on one run is never a move once two pairs can spread against it' and 'what a scenario scores in both arms cancels' own the arithmetic; nothing is written in, every number comes from the row's own runs. Replayed: the clean 2026-09-17 arm total holds where the first bar would have called it regressed on a tenth of a point, and in the 2026-09-18 batch S10's -0.33 and S12's -0.33 sit inside their bars while S09's -1.00 against a bar of 0.00 does not.
#4 'the verdict is drawn where scenarios are aggregated' asserts the scenario row's standing is null while the workflow row and the arm total read regressed off the same runs. Every per-scenario change line of the regenerated report ends 'deltas only (one scenario)'.
#5 'a rise past the bar is reported as readily as a fall' asserts an improvement through the same path, and 'a row's word says mixed' asserts a rise is not buried under a fall. S00 in the regenerated report reads succeeded +2 and correctness +1.33/1.15! where the old report said held.
#6 'a row that cannot be compared says which precondition failed' asserts arms-not-comparable for unpaired arms and pictures-not-judged for a capture never opened. The regenerated S03 line ends 'unassessed: the arms are not comparable'.
#7 'what counts as answering off the checklist is one rule, and it needs both halves' owns the rule over its four cases; 'a verdict answered off the checklist sets its run aside without calling its board wrong' asserts it is listed in ungradable, that its arm's semanticFailures stays 0, that the row's change and tokenChangePercent are both withheld, and that the run keeps its place among the failures with its own unopened picture. The regenerated report lists all five named runs under 'Runs set aside as ungradable' with the features each grader skipped and the names it answered instead, and S03's candidate semantic-failure count falls from 1 to 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The change rows of a batch report stamped one word — REGRESSED, held or unassessed — over a boolean OR of four grader means and two counts where the mean test was a bare less-than. At three runs a mean moves by a third for one grader point, so the word fired on the least evidence a batch can produce, never said which axis moved or by how much, and had no opposite: the 2026-09-18 batch showed six regressions and no wins, one of them a grader defect rather than the author.

A row now reports what moved. The pass/fail counts are compared on their own, since a tally of runs is real however small its change. Each grader axis carries the two means, the delta and the bar it was held to, and the bar comes from the row's own runs: the two arms are paired by the scenario and repetition they share, so whatever a scenario scores in both arms cancels inside its pair, and the spread of what is left over the square root of the pairs is how far the mean of them can sit from the truth. A move counts only past that bar, and reads the same in either direction, so an improvement is reported as readily as a regression. The row's one word is drawn only where more than one scenario's runs stand behind it — the workflow rows and a new arm-total row — while a per-scenario row at three runs carries deltas only. A row that cannot be compared says which precondition failed. A verdict that skipped the scenario's declared features to grade names of its own is set aside as ungradable: it enters neither comparison, withholds its row the way a contaminated run does, is listed with the features it skipped and the names it answered instead, and is no longer counted as a semantic failure — though it keeps its place among the runs that did not succeed, since what its grader did says nothing about the picture it never opened.

Verified over 160 tests, 0 failures, across all 22 test files of src/runtime/skill-evaluation, with the arithmetic — the noise bar, the direction, the standing, the off-checklist rule over its four cases — owned by focused unit tests rather than by matching report wording; both lint lanes and the formatter are clean. The 2026-09-18 report was regenerated from its saved run records without grading or a model call: S03 no longer regresses and its candidate semantic-failure count falls to 0, S00 shows succeeded +2 and correctness +1.33 against a bar of 1.15 where the old report said held, S09 is the one surviving mean-driven regression at -1.00 on two axes against a bar of 0.00, and the five named runs are listed as ungradable — exactly the five, with every other run of the ninety answering its checklist. Replaying the other saved batches confirmed the bar behaves as the row grows: the clean 2026-09-17 arm total holds, where the first calibration would have called a whole batch regressed over a tenth of a point. S14 could not be shown as an improvement, before this task or after: its candidate arm holds a contaminated run, so the row was already withheld.

One distinct defect rode along at the user's direction rather than as a task of its own: readManifests and bundledRuns reached their files with a recursive readdirSync over the batch's runs directory, which preserves a whole world, transcript and codex home per run and runs to about 15 GB, and the walk drove this machine into swap. One lister now reads runs/<arm>/<scenario>/<repetition> by name and neither reader descends into a preserved world.
<!-- SECTION:FINAL_SUMMARY:END -->
