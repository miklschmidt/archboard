---
id: TASK-256.06
title: Keep a loop and a self call reachable beside the participant rule
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:40'
updated_date: '2026-09-17 19:45'
labels: []
dependencies: []
references:
  - skills/archboard/references/create-sequence.md
  - TASK-253
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 456000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-253.02 taught that a function the request names, or one the board already draws, stays its own participant. It worked: no candidate run folded a named participant into a self call, where baseline S05 r2 folded preprocess_request into a self message on its caller. S07 got worse in the same place — the candidate lost the self or async message in 2 of 3 runs (baseline 1 of 3) and the loop marker in 2 of 3 (baseline 0 of 3) — but the obvious causal story does not survive the runs.

Counted from the authored flows: candidate r1 drew 11 participants and got repeat RIGHT (two steps marked). Candidate r2 drew 9 — the same as baseline, no extra participants at all — and lost repeat anyway. Only r3 did both. So the participant rule explains the extra columns (r1 and r3 gave find_best_app and find_app_by_string their own), and explains the lost loop marker in at most one run.

What did change is position. The `self` and `repeat` sentences are byte-identical between the arms; the candidate inserted ten lines of participant rule BETWEEN them, so step 1 went from 7 lines to 16 of unbroken prose and `repeat` moved from immediately after the kind list to nine lines downstream. The same shape appears in create-architecture.md step 4, where a density rule added in the same batch also stopped firing (TASK-256.10). The hypothesis to act on is placement, not a contradiction to fix.

The rule's second clause has its own cost, visible in the grader's concerns: once an author draws find_best_app as a node, "or one the board already draws as its own part" forces it into a column, and both runs that did it produced a picture where two alternative branches read as both being called in one pass, one of them with return messages pointing at a node that never called them.

Two things not to read as evidence for this task: the S07 outcome-fail column is mostly the run_simple name check (TASK-256.01), and the emphasis-on-a-step refusal that one run hit was a BASELINE run, so it cannot explain a candidate regression — it belongs to TASK-256.08. And the example the fix needs already exists: the recipe's own worked example draws a part trying two candidate documents as a self step with repeat 2, so what is missing is the sentence that keeps it reachable, not another example.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A step that runs more than once carries repeat whether it calls itself or another participant, said where an author reads the kinds
- [x] #2 The guidance keeps a legitimate self call reachable — a part retrying or caching its own work — by pointing at the example already in the file rather than adding another
- [x] #3 Step 1 of the recipe is no longer than it is today; a rule that must be reachable is placed, not appended
- [x] #4 The skill text stays about archboard's own source and passes the eval:skill check leak guard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Treat the S07 loss as placement: move the TASK-253 participant rule out from between the kind list and `repeat`, so `repeat` reads immediately after the kinds again.
2. Put the participant/column rule where participants are decided (the first sentence of step 1), and the kinds + `repeat` + `note` after it, in the order an author writes them.
3. Say `repeat` applies to a step on a part's own column as readily as to a call to another, and point at the worked example already in the file (the `find` step, two candidate documents, `repeat: 2`) instead of adding a second example.
4. Pay for it by cutting, not appending: drop the closing restatement '`self` is for a call on a part the board draws whole' and the inline 'two candidate file names is repeat: 2' now that the example carries it. Step 1 must measure no longer than the 31 lines it is today.
5. Carried from TASK-256.05: say in edit.md, beside the continuation rule, that removing a part, adding its replacement and moving the relationships onto it is one write.
6. Verify: measure step 1's line count, run `bun run eval:skill check`, and run the store's one-write owner for the edit.md claim.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
create-sequence.md step 1 restructured; nothing appended.

Moved, not added: the TASK-253 participant rule is out from between the kind list and `repeat` and now opens the step, at the sentence where participants are listed ('List the participants in reading order: the exchange is between the parts the board has, so a part drawn whole stays one column ...'). The kind list follows it, and `repeat` follows the kind list immediately, as it did in the baseline.

`repeat` now reads 'A step that runs more than once carries `repeat` when the source fixes the count (...), on a `self` step as readily as on a call to another column: the example below tries two candidate documents in one `self` step with `repeat: 2`.' The pointer is to the `find` step already in the file (AC#2); no second example was added.

Cut to pay for it: the closing restatement '`self` is for a call on a part the board draws whole' (it repeated the rule's own first clause), the inline 'two candidate file names is `repeat: 2`' (the example now carries it), 'as its own part' and 'in the same module, class or component as its caller' (shortened to 'even when it lives inside its caller'), and the `self` kind's gloss in the list, which the new opening sentence defines.

Measured: step 1 is 31 lines, the same as before the change (AC#3); the file is 122 lines, one shorter than it was. Its worked payload is untouched, so nothing needed re-validating.

Carried from TASK-256.05 (its own notes flagged this as out of that session's file scope): edit.md step 2 now says, on the sentence where the continuation rule already lives ('one change keeps the id'), that removing a part, adding what replaces it and restating the relationships that landed on it with their ids and their new endpoint is one write, and that re-adding them without their ids reads as a deletion and an addition. Checked against the product rather than the task text: src/runtime/semantic-board-store/tests/one-write.test.ts holds exactly that move ('a part goes, its replacement arrives and the relationship moves onto it keeping its id'), and `bun test --isolate --max-concurrency=1` on that file is 6 pass / 0 fail on this tree.

`bun run eval:skill check`: 'suite ok: 15 scenarios, 15 fixtures, 14 coverage parts'. The check reads skills/archboard as the candidate arm (suite.ts:476-482), so the leak guard covered the changed text (AC#4).

Not settled here: the description's observation that the rule's second clause ('or one the board already draws') has its own cost — two alternative branches forced into columns — is untouched, because no acceptance criterion asks for it and removing it would undo what TASK-253.02 measured as working. Whether the move fires can only be answered by the next human-run batch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The participant rule moved out from between the message kinds and repeat, up to where participants are actually decided, so repeat sits beside the kinds again and says it applies to a self step as readily as a call to another column — pointing at the self-with-repeat example already in the file rather than adding one. Paid for by cutting a restatement of the rule's own first clause: step 1 measures 31 lines, exactly what it was. edit.md also gained the sentence saying the replacement move is one write, carried from TASK-256.05. Verified in the wave-2 gate, run lane by lane because the box was too short on memory for bun run check in one process: lint, fmt:check and type-check clean, the frontend build, 3450 module tests, 163 system tests, the repository lane, and the full serial browser lane at exit 0 with no failures. The derived skills were synced with bun scripts/sync-skills.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
