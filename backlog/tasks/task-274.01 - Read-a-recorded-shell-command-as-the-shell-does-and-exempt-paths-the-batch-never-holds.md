---
id: TASK-274.01
title: >-
  Read a recorded shell command as the shell does, and exempt paths the batch
  never holds
status: Done
assignee:
  - '@claude'
created_date: '2026-09-19 00:40'
updated_date: '2026-09-19 01:13'
labels:
  - bug
dependencies: []
parent_task_id: TASK-274
priority: high
ordinal: 485000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two false contaminations in batch 2026-09-18T23-44-56-390Z. (1) baseline S08 rep 2: unwrapped() in src/runtime/skill-evaluation/lib/classify.ts strips the outer bash -lc "..." quotes literally without shell-unquoting the argument; with \" escapes and "'...'" splicing the word splitter in lib/other-run.ts then misreads '<world> status --short' as one path outside the world. The command only touched its own world. (2) candidate S02 rep 3 and S12 rep 3: 'ARCHBOARD_VAULT=<batch>/world/vault archboard ...', Codex 0.155.0's skill-root alias mis-expanded again; the CLI goes through the server so nothing was read, no ENOENT was printed, and the script's assignment word makes nothing exemptable. The batch root holds only harness-written top-level entries (runs/, skill/, graders/, batch.json, blinding.json, report.*); <batch>/world is none of them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The -c argument of a recorded bash/sh/zsh -c or -lc command is classified as the shell passes it (outer quoting and escapes undone), for every rule that reads the script, not only exposure
- [x] #2 A batch path whose first segment under the batch root names no entry the batch holds reaches nothing and is not other-run exposure; the batch root itself, a glob or expansion at that segment, and every existing entry still count
- [x] #3 Re-reporting .skill-evals/2026-09-18T23-44-56-390Z sets none of the three runs aside, and every other run's exposure is unchanged; any change in command classes (discovery, operation, investigation...) from the unwrap fix is listed and explained in the notes
- [x] #4 Behavioural tests own both rules, and the TASK-273.01 bypass probes still count
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. other-run.ts: export the shell-word splitter; unwrapped() in classify.ts finds the shell (bash/sh/zsh by basename), skips its flags to the one holding c (-c, -lc, -l -c), and returns the next word's value as the splitter passes it; commands that are not a shell -c keep today's reading. Backslash-newline is dropped as bash drops it.
2. other-run.ts: a batch path whose first segment under the batch root (after lexical resolution) is a literal name with no expansion character and names no entry on disk reaches nothing. Guarded so a name cannot be carried somewhere real: the exemption holds only in a script with no $ or backtick, and when no other word holds '..'. Batch root itself, globs/expansions at that segment and existing entries still count.
3. Tests in tests/reaudit.test.ts (and events.test.ts unwrap cases): escaped double-quoted -lc script and quote-splice; missing top-level entry via env assignment; guards (expansion, '..', glob, root, existing entry).
4. Verify: reviewer probes 2-4 before/after; per-command classes of all runs of the 23:44 batch before/after; re-report into scratchpad via assertBatchInputs + buildBatchReport with sha256 of saved report before/after.
5. Gate: lint, fmt:check, type-check, test:modules.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in 570d1288.
- classify.ts unwrapped(): the recorded command is split with other-run.ts's shellWords (now exported); for bash/sh/zsh (by basename) it skips flags to the one matching -[A-Za-z]*c[A-Za-z]* (-c, -lc, -l -c) and returns the next word's value, i.e. what bash passes. Any other command keeps today's reading (outer quotes stripped). unquoted() now drops backslash-newline, quoted or not, as bash does. Every rule (classes, write, exposure, guidance files, guardrails' mutatesBoardFile, codex-grader's namedPaths) reads this script.
- other-run.ts namesNoEntry(): a batch path (after lexical resolution, so <B>/world/../runs counts as runs) whose first segment is a literal name with no expansion character and does not exist under the batch root reaches nothing, whatever was printed. Guards so the name cannot be carried somewhere real: the script contains no $ or backtick (an assignment alone is fine, S02/S12 pass the path as ARCHBOARD_VAULT), and no other word holds '..'. Batch root itself, an existing entry (runs/nope counts), a glob or expansion at the segment, V=<B>/world/vault; cat $V/../../runs/..., X=<B>/r; cat ${X}uns/..., echo <B>/world/ | xargs -I{} cat {}../runs/... all still count.
- Accepted residual gap: a program that rewrites the text of a name the batch does not hold into one it does, without $, backtick or '..' in the script (e.g. echo <B>/foo | xargs dirname | xargs -I{} cat {}/runs/...; an interpreter reading an env var and taking its dirname). A word-level classifier cannot follow text through another program.
- Tests: events.test.ts (unwrap of escaped, spliced, -l -c and backslash-newline scripts; bash -l -c write counted); reaudit.test.ts (S08-shaped spliced script is clean; top-level rule exempt and still-count cases). The fake exists in reaudit.test.ts now treats a present path's ancestors as present, as a disk does; the 'gone since the run' cases moved under runs/ (a top-level <B>/world can never have been read). The three new tests fail on the previous code.
- Reviewer probes 2-4 (review27301): every line reading real material still other-run. Four lines flip to null, each naming a top-level entry the 14:01 batch does not hold: sed <B>/world/.../SKILL.md with empty output (the alias case itself), cat <B>/nope 2>/dev/null, cat <B>/nope\ x, cat <B>/no<newline>pe. None can read anything.
- Batch 2026-09-18T23-44-56-390Z: 1286 stored commands; 263 unwrap to different text (257 double-quoted -lc, 6 single-quoted). Per-command class, rule, write, direct board writes and per-run guidance files read: identical before and after, so no class shift. Exposure: exactly baseline S08/2 cmd 6, candidate S02/3 cmd 9, candidate S12/3 cmd 18 go other-run -> null. Re-report into scratchpad 274.01 (assertBatchInputs + buildBatchReport): contaminated none (was the three); other 87 runs' exposure identical; S02/S08/architecture-create rows now carry deltas (architecture-create regressed); propose-compare, S12 and all primary now read 'unassessed: a picture was never judged' (TASK-274.02's grader issue). Saved report.md/json sha256 unchanged.
- Gate: lint (policy, my files clean; lint:baseline and lint:policy currently fail only on other workers' in-progress grader-retry.test.ts, grading-run.ts, grader.ts, grading-session.ts), fmt:check 0, type-check 0 and test:modules 3351 pass 0 fail on a consistent tree; a later type-check fails only in grading-run.ts/grading-session.ts (other worker mid-edit).

Review round 1 fixed in b0077e05.
- namesNoEntry exempts only when the word's batch slice is one path: no whitespace, quote, parenthesis or comma in it, and every '..' in the word is a whole segment of that path (helper staysPut). python3 -c os.path.join('<B>/nope','..',...) and node -e join('<B>/world','..',...) count again; cat <B>/nope\ x counts again. ARCHBOARD_VAULT=<B>/world/vault (S02, S12) and the 14:01 sed alias lines stay exempt.
- shellScript takes the -c script only when it is the last word; otherwise the recorded text is read whole, so bash -c true && archboard semantic new x --doing y is a write and sh -c 'cat "$1"' _ <B>/runs/x counts.
- Tests: both interpreter probes and the sh -c argument case in reaudit.test.ts; the && write case in events.test.ts. The interpreter and && cases fail on 570d1288.
- rev27401/sound.ts: every case counts except the accepted text-rewrite gap (sed/tr rewrite), cases naming nothing that exists in the probe fixture (find -o, realpath, case RUNS, and ln -s runs <B>/world, which only stays clean because the probe never ran the ln; a real run would leave <B>/world on disk and count), and the nested bash -c 'cd <B>/world; cat ../..' case, which was already clean before 570d1288 (a relative path inside a nested script's single word is not resolved). 273.01 probes: same as round 1 except cat <B>/nope\ x counts again.
- 23:44 batch: per-command class/rule/write/direct-writes/guidance identical to before; only S08/2 #6, S02/3 #9, S12/3 #18 go other-run -> null. Re-report identical to round 1: contaminated none, 3 exposure diffs of 90; saved report sha256 unchanged.
- Gate: lint (my files clean; lint:policy red only in grading-retry.ts and grading-run.ts, 274.02 in progress), fmt:check red only in tests/fake-codex.ts and tests/fake-grader-answer.ts (274.02), type-check 0, test:modules 3361 pass 0 fail.

Independent review, two rounds; round 2 clean (b0077e05). Accepted gap widened on the reviewer's evidence: a program that rewrites a name the batch does not hold into one it does, whether through a pipeline (xargs, sed) or inside one interpreter word (e.g. perl s|nope|runs|r), escapes; it takes deliberate obfuscation. Older gap, not this task's: a relative climb inside a nested bash -c script word is never resolved (clean before 570d1288 too); filed as a follow-up.

Full gate on a quiet tree: lint, fmt:check, type-check, build:frontend exit 0; test:modules 3361/0, test:system 168/0, test:repository 8/0, test:serial-browser 0 failing files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded bash -c/-lc commands are now classified as the shell receives them (shared shell-word splitter; script taken only when it is the last word), and a batch path whose first segment names no entry the batch holds is not exposure when it is a single plain path in a script that builds no path. Re-report of the 23:44 batch clears its three false contaminations (S08 baseline unwrap; S02/S12 candidate ARCHBOARD_VAULT alias) with no class shift across 1,286 commands. Commits 570d1288, b0077e05. Two review rounds. Accepted gap: a program rewriting a missing name into a real one. Nested-shell relative climbs filed as TASK-275. Full gate on a quiet tree: lint, fmt:check, type-check, build:frontend exit 0; test:modules 3361/0, test:system 168/0, test:repository 8/0, test:serial-browser 0 failing files.
<!-- SECTION:FINAL_SUMMARY:END -->
