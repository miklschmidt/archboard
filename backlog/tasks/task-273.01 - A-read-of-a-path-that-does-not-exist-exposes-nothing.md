---
id: TASK-273.01
title: A read of a path that does not exist exposes nothing
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 17:49'
updated_date: '2026-09-18 18:14'
labels:
  - bug
dependencies: []
parent_task_id: TASK-273
priority: high
ordinal: 481000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Codex 0.155.0 lists an installed skill as r0/archboard/SKILL.md with a table mapping r0 to its root. In all 11 runs set aside as contaminated in batch 2026-09-18T14-01-43-895Z, the author's first command mis-expanded the alias to <batch>/world/home/.agents/skills/archboard/SKILL.md (dropping runs/<arm>/<S>/<rep>/), sed exited 2 'No such file or directory', and the author then read the correct path. reachesBatchOutsideWorld in src/runtime/skill-evaluation/lib/classify.ts matches text only, so a read of nothing counted as reading another run. Exposure is decided once at run time (author.ts) and stored in run.json, so a fix to the classifier alone cannot recover the saved batch, whose 90 runs are all graded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A command naming a literal batch path that exists nowhere on disk is not counted as other-run exposure; a path that exists, a glob, or a listing of the batch root still is
- [x] #2 The report re-audits exposure from each run's stored commands.json with the current classifier rather than trusting the count recorded at run time, so a classifier fix reaches saved batches
- [x] #3 Re-running report on .skill-evals/2026-09-18T14-01-43-895Z sets none of those 11 runs aside, without re-grading and without the batch being refused by its input digest
- [x] #4 Behavioural tests own both rules
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. classify.ts: ExposureRoots gains an injected exists predicate; a batch path outside the run's world is other-run exposure only when it holds a glob or expansion character or names something that exists (the batch root itself always does). Same rule for relative path words.
2. author.ts passes fs.existsSync.
3. report-audit.ts: reauditedExposure rebuilds the classification context from batch.json (archboard checkout, baseline pin) and the run's recorded install.skillRoot (recorded batch root, so a moved batch still resolves), re-classifies the stored commands.json and counts exposure; existence is checked against the batch as it sits now. A manifest without exposure stays null (unaudited); a run without commands.json keeps its recorded count.
4. records.ts auditOf uses it.
5. Behavioural tests: classifier (missing literal path, existing path, glob, batch-root listing, relative) and report (a saved run whose stored count says other-run but whose commands name a missing path is not contaminated; an existing one still is).
6. Verify provenance: inputDigest excludes harness source; run report on the 2026-09-18T14-01 batch with report.md/json backed up.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. classify.ts: ExposureRoots carries an injected exists predicate; a batch path outside the run's world (absolute, or a ./ ../ word resolved against the run's cwd) is other-run exposure only when it holds a shell expansion character (* ? [ ] { } $ ` ~) or names a path that exists. The path word is read as the shell passes it (inside its quotes, backslash escapes removed). author.ts passes fs.existsSync.
New lib/reaudit.ts: reauditedExposure re-classifies a run's stored commands.json with the current classifier. Context comes from batch.json (archboard checkout, baseline pin; the suite's when absent) and the run's recorded install.skillRoot, which gives the batch root as it sat at run time, so a moved batch still resolves; existence is asked of the batch where it sits now. A manifest without exposure stays null (unaudited); a run without commands.json keeps its recorded count. records.ts auditOf uses it, so recordOf and the whole report re-audit.
Provenance: assertBatchInputs (the only check report runs) compares inputDigest, which hashes the loaded suite (evals, fixtures, rubric, pins) and not harness source; the implementation digest is checked only on resume. The saved batch was accepted.
Batch 2026-09-18T14-01-43-895Z, reported into the scratchpad (batch report.md/json untouched, sha256 verified): contaminated before = 11 runs (2 baseline, 9 candidate, all other-run x1, all the alias misread exiting 2); after = none. Verdicts: architecture-create held, edit regressed, propose-compare improved, sequence-create improved, all primary improved (were: all unassessed except sequence-create improved); per-scenario rows now say deltas only.
Tests: src/runtime/skill-evaluation/tests/reaudit.test.ts owns both rules (classifier: missing literal path and relative path not exposure; existing path, quoted path, batch root with and without slash, glob, $VAR still are; report: stored alias misread clears a run.json other-run count, an existing path stays contaminated, also for a moved batch, and a pre-exposure manifest stays unaudited).
Gate: lint:policy, fmt:check, type-check, test:modules (3334 pass) green; lint:baseline fails only on run-manifest.test.ts onTheSkill (TASK-273.02's test). test:system does not cover skill-evaluation.
Commit note: these changes landed in a06612d4 (titled for TASK-273.02) because the other worker committed the shared index while these hunks were staged; no separate TASK-273.01 commit exists.

Review round 1 fixed in c14a171e (first round's code is in a06612d4, committed together with TASK-273.02's by the shared index; history left as is).
- A missing batch path is exempt only when all three hold: its shell word is plain (no quote, escape or expansion character), the resolved path does not exist, and the command's recorded output reports '<path>: No such file or directory' (or ls's quoted form). Existence alone no longer exempts anything, so a file deleted since the run cannot make a real read look harmless.
- Words are tokenised as the shell joins them (base"line", base''line, '<B>/runs/base'line, "<B>/runs/base"*, ..'/../'..), and every path is resolved before the world test, so <W>/../author.jsonl counts. A variable built from a missing prefix (X=<B>/runs/base; cat ${X}line) counts, since the output does not report the prefix missing.
- reaudit.ts: exposureAudit(batchRoot, loaded) reads batch.json once per grader report; a malformed or non-command commands.json keeps the recorded count instead of failing the report.
- Tests (tests/reaudit.test.ts): the five review probes, <W>/../ and quote-split relative escapes as other-run; missing path with ENOENT output clean; missing path whose output shows a read counts, in the classifier and through the report; malformed commands.json keeps the recorded count.
- Batch 2026-09-18T14-01 re-reported into the scratchpad: contaminated none; per-run exposure identical to round 1 for all 90 runs; exactly the 11 runs differ from the saved report; comparison rows unchanged (architecture-create held, edit regressed, propose-compare improved, sequence-create improved, all primary improved). Saved report.md/json untouched.
- Gate: lint, fmt:check, type-check green; test:modules 3336 pass 0 fail.

Review round 2 fixed in 28f6d3bf: a script holding an assignment word, a $ or a backtick exempts no path (X=<B>/runs/base; ls $X; cat ${X}line/... now counts even with ls reporting the prefix missing); relative words resolve from the last absolute cd before them, falling back to the checkout (cd <W>/flask/src/flask && cat ../../README.md is clean; cd <W>/vault && cat ../../author.jsonl counts). Reviewer probe2 all as expected; the 11 real commands hold neither and stay exempt. Batch re-report: contaminated none, per-run exposure identical to round 1 for all 90 runs, report.md identical to the previous round, saved report untouched. Gate: lint, fmt:check, type-check green; test:modules 3337 pass 0 fail.
<!-- SECTION:NOTES:END -->
