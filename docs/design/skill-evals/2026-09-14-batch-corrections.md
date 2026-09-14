# Corrections to the 2026-09-14 skill evaluation batch

Source batch: `.skill-evals/2026-09-14T13-50-10-617Z` (ignored output; its
`report.md`, `report.json`, run directories, grader session and rollout are
untouched). This document is the corrected reading of that batch under the
evidence rules repaired by TASK-212, computed from the retained files with no
author or grader run. Nothing below re-grades a board; it corrects what the
harness reported about the runs, and says what the batch can and cannot
still establish.

## 1. Grader usage was counted fifteen times over

The grading session was one Codex thread resumed across 15 calls. Codex's
`turn.completed` usage is the thread's `total_token_usage`, which is
cumulative: the retained rollout under `grader/codex-home/sessions/` shows
`total_token_usage` climbing through every step, and the first call's
`turn.completed` (input 512 571) equals the rollout's `total_token_usage` at
the end of that call. `grader/session.json` recorded each call's cumulative
reading, and `grader/usage.json` summed them.

| Reading                                     | input       | cached     | output  | total       |
| ------------------------------------------- | ----------- | ---------- | ------- | ----------- |
| as reported (sum of 15 cumulative readings) | 101 653 146 | 95 895 808 | 664 274 | 102 317 420 |
| corrected (the thread's last reading)       | 11 523 234  | 10 890 240 | 77 827  | 11 601 061  |

The corrected grader cost is 11.3% of the reported figure. Author usage was
unaffected: every author run is one call in one thread. `pins.json` now pins
the semantics and `src/runtime/skill-evaluation/tests/evidence.test.ts` holds
`callUsageFrom` and `sessionUsage` to them.

## 2. Five S11 authors patched the vault directly, and the harness saw two

Codex's editing tool records a `file_change` item and no command. The batch's
guardrail read only commands, so a board patched in place was invisible; the
two S11 runs it did flag were caught by a redirect pattern that also fired on
reads. Re-read with file changes kept:

| run            | arm       | scenario | rep | board files patched | doing-on-writes as reported → corrected |
| -------------- | --------- | -------- | --: | ------------------: | --------------------------------------- |
| run-287bdb2e99 | baseline  | S11      |   2 |                   2 | failed → failed                         |
| run-53ce727f79 | baseline  | S11      |   3 |                   2 | passed → failed                         |
| run-b9d0f23d3b | candidate | S11      |   1 |                   2 | passed → failed                         |
| run-de278db4db | candidate | S11      |   2 |                   2 | passed → failed                         |
| run-5747bdcd92 | candidate | S11      |   3 |                   3 | failed → failed                         |

The grader's concerns on these runs ("the final original id and cleared
reconciliation require investigation; do not infer a valid repair solely from
final-state checks") were right: the restoration edit the scenario asks for
was refused by the product (see §6), and the authors wrote the board file
themselves. Their `reconciliation-settled` and `node-id-retained` outcome
checks passed on a board the CLI never wrote. Every S11 run of both arms is
therefore an audit failure, not a measurement of either skill.

## 3. Thirty runs were charged with write attempts they did not make

The batch counted `semantic edit --help`, `semantic branch --help` and text
searches containing the words "semantic edit" as write attempts lacking
`--doing`. Under the repaired rule (a write attempt is an invocation of
`archboard semantic new|edit|branch|resolve|adopt` that is not a help call)
the count is zero in every run that had one; no run's pass/fail changed on
this count alone, but the detail line the grader was shown was wrong in
thirty bundles. Affected: S00 b3; S02 b1, b2; S03 b1, b2, b3; S04 b1, b2,
b3, c1, c3; S05 b2; S06 b1, b3; S07 b2; S08 b1; S10 b2, b3; S11 b3, c1, c2,
c3; S12 b1, b2, b3; S13 b1, b2, c2, c3.

## 4. Eight runs read evaluation material

The evaluation inputs were shipped inside the installed skill
(`skills/archboard/evals/`), and the CLI wrapper points at this checkout, so
`evals.json`, the fixtures, the rubric and the harness source were within
reach. Commands classified as exposure under the repaired rules:

| run            | arm       | scenario | rep | read                                    |
| -------------- | --------- | -------- | --: | --------------------------------------- |
| run-6089f991b1 | candidate | S05      |   1 | evaluation-inputs ×1                    |
| run-32955db695 | candidate | S05      |   3 | evaluation-inputs ×2                    |
| run-de0663cd86 | candidate | S08      |   2 | other-run ×1                            |
| run-bf82f4c437 | baseline  | S11      |   1 | harness-source ×1                       |
| run-287bdb2e99 | baseline  | S11      |   2 | evaluation-inputs ×4, harness-source ×1 |
| run-53ce727f79 | baseline  | S11      |   3 | evaluation-inputs ×2, harness-source ×1 |
| run-b9d0f23d3b | candidate | S11      |   1 | evaluation-inputs ×2                    |
| run-5747bdcd92 | candidate | S11      |   3 | evaluation-inputs ×1, harness-source ×2 |

The inputs now live at the repository root (`evals/`), outside every skill
package, and the harness records exposure per command. A future author can
still reach them through the checkout; the record is what makes that visible.

## 5. Scenario defects that produced false failures or unfair features

These invalidate the batch's per-scenario conclusions where noted; the
repaired inputs apply to the next batch, whose digest will differ.

- **S02, S12 — outcome checks counted relationships as removed parts.**
  `comparison-standing` counted every subject; replacing two stack nodes also
  replaces their two relationships (4 removed, 3 added) and removing the
  session interface takes its two calls (3 removed). All six S02 runs and all
  six S12 runs failed the check on a correct board. The check now counts
  nodes on their own (`removedNodes`, `addedNodesAtLeast`).
- **S02 — a rewired call kept its id and was marked incorrect.** One changed
  authored property keeps a relationship's identity by the documented rule;
  the rubric now states it, so `identity.replacement` on run-ab772ff557 was
  a grader error against the contract.
- **S00 — the prompt's arrows read as calls.** "full_dispatch_request ->
  preprocess_request -> dispatch_request" was drawn as a chain of calls by
  every author, and the grader correctly failed `edge.actual-receiver` on
  all six runs. The request was ambiguous; the prompt now states which
  function calls which, and that the WSGI server and the view function stay
  unbound (two runs failed `binding.repo-path` for binding them).
- **S08 — `refusal.recovery` required an author to fail first.** Every
  author configured the vocabulary before writing, which is the better
  behaviour, and all six runs failed the feature for never being refused.
  The feature is now `config.before-board` (configure first, or repair a
  refusal by configuring; never bend the meaning), and the refusal itself has
  a runtime owner in the store's policy tests.
- **S09 — a hidden wording requirement.** `inspect.hidden-members` asked the
  answer to "say the Overview view collapses CLI"; every author named Run
  command as the undrawn member and all six failed on phrasing. The feature
  now asks that Run command be named as undrawn, phrasing free. The fixture
  also asserted that Dispatch belongs to a `sansio-core` group and that Run
  command calls Dispatch; neither is true of Flask 3.0.0 (the dispatch
  functions live in `src/flask/app.py`; `run_command` starts werkzeug's
  `run_simple`). S03 and S09 now use a `wsgi-layer` group and one truthful
  serving relationship.
- **S10 — the fixture had `make_response` calling `process_response`.**
  `finalize_request` calls both. Authors were told to keep the relationship
  and graders marked the inherited inaccuracy as a concern on every run; the
  fixture now has `finalize_request`, and the rubric tells the grader to
  report inherited fixture defects as `fixture:` concerns rather than score
  the author for them.
- **S11 — the fixture reversed the tagging dependency** (`TaggedJSONSerializer`
  calls the JSON helpers, not the reverse), and so did S01. Both fixed.
- **S12 — the selection intent was not observable.** With only one
  relationship between the two selected parts, selecting nodes and selecting
  the relationship draw the same picture, so `view.edge-isolation` and
  `view.node-region` graded an authoring style. The fixture now has
  `process_response` saving the session, `Session path` must hide that call,
  and the prompt says which selection each view needs.
- **S14 — externals were expected but never asked for**, and the readability
  feature said 8–16 nodes while the check allowed 8–20. All six runs failed
  `node.kind` for lacking werkzeug, jinja and click. The prompt now asks for
  the three externals and both bounds are 8–20.
- **S05, S07 — the harness's render is the architecture view**, so the
  grader had no picture of the sequence; the rubric now tells the grader to
  say when no usable render was supplied rather than score a picture it did
  not see. Unchanged otherwise.

## 6. The S11 restoration was refused by the product

S11 asks for "a third answer for the removed node by restoring it under its
original id", which `skills/archboard/references/variants.md` promised. The
store refused a stated id absent from the draft (`UNKNOWN_NODE`, exit 1 in
every S11 transcript), which is why five authors wrote the file. TASK-213
makes the restoration an ordinary edit that settles the disagreement in the
same write; the S11 fixture is otherwise unchanged and the scenario stands.

## What the batch can still establish

- Author token medians for the scenarios whose runs are clean and whose
  inputs did not change: S01, S04, S06, S13 (both arms succeeded on all
  three repetitions; no exposure; no direct write). Their reported changes
  (S01 −32.7%, S04 +22.7%, S06 −46.8%, S13 −35.4%) stand as measured.
- S03's medians stand for the runs (no exposure), but its fixture and prompt
  changed (`wsgi-layer`), so the next batch is not comparable to it.
- S10 is unaffected by the evidence corrections, and S05 only in its
  baseline arm: two candidate S05 runs are contaminated, so its change is
  not a measurement. Both scenarios' fixtures or prompts changed for the
  next batch.
- Nothing about S00, S02, S08, S09, S11, S12 or S14 is a measurement of
  either skill: the checks, features or fixtures were wrong for both arms.
- The grader's scores remain what one blinded session said about the boards,
  under a rubric that has since been clarified; they are not re-scored here.
- The next batch runs on changed inputs and a changed product (TASK-213), so
  it starts a new baseline: both arms re-run on the same CLI, and no
  percentage from this batch carries over.
