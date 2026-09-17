---
id: TASK-256.09
title: 'Settle a disagreement with the other side''s words, not a retyping of them'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:40'
updated_date: '2026-09-17 19:45'
labels: []
dependencies: []
references:
  - skills/archboard/references/variants.md
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 459000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S11 asks the author to settle a deleted-and-changed disagreement by restoring the node with the current variant's description, "Serializes tagged values in signed session cookies". One run in each arm (baseline r1, candidate r2) wrote "Serializes tagged values FOR signed session cookies" — a blend with the node's adjacent responsibility, "Serializes tagged values for signed sessions" — and then told the user it had restored the current description. Both got the responsibility right and only the description wrong; both composed the payload as an inline shell heredoc, while the run that got it right built it as a file and passed it with --input.

The product half is the sharp edge, and it is the same shape as the missing comparison in TASK-256.07: the operation says a difference exists and makes you go elsewhere for the difference itself. semantic resolve prints one line per standing issue (semantic-input.ts:263-269). For a competing-field issue it prints both values verbatim. For deleted-and-changed — the issue kind whose documented repair is exactly this third answer — reconcile.ts:221-230 hard-codes the two sides as "removed it" and "changed description": it names the field and never the value. So the string the author must reproduce is only recoverable from the full board JSON, one line below a near-identical sibling field. The value is 51 characters and would fit the line's own 72-character budget.

There is a second trap for whoever writes the guidance: valueText (semantic-input.ts:271-291) truncates at 72 characters with an ellipsis, deliberately — "the line is an index into the board and the board is where the whole of it lives". So the resolve line is not a safe thing to tell an author to copy from, even where it does carry the value.

The wording half is real but downstream: variants.md:91 says to state the node again "with its original id and the fields you want", which is the whole instruction about where the values come from. It is unchanged between the arms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A deleted-and-changed issue reports the predecessor's value for the field it says changed, not only the field's name
- [x] #2 The variants recipe says where a settled value is read from and that it is carried across unchanged, without pointing at a line that truncates
- [x] #3 A test owns the issue line carrying the value
- [x] #4 The skill text stays about archboard's own source and passes the eval:skill check leak guard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Contract: ReconciliationIssueSchema (src/shared/semantic-board/lib/reconcile-standing.ts) gains an optional `changed`: the fields the side that changed the subject moved, each as { field, before, after } — the same {field, before, after} shape `semantic compare` already answers with (TASK-256.07's MovedFieldSchema), so a reader meets one idiom for 'a field moved and here is what it moved between'. Optional, because only a deleted-and-changed issue has a side that changed fields; `field` stays absent on that kind, because settle.ts treats a field-bearing issue as a field choice and refuses a structural one (CHOICE_NOT_A_FIELD).
2. reconcile.ts: both deleted-and-changed sites (removedHereIssues, settleOne) build `changed` from the real moved fields before the 'what it holds' pseudo-field is added, with stated() so an unwritten value survives JSON as null.
3. reconcile-told.ts: the same for a step or beat (removedHere, removedUnderMe); asIssues carries `changed` through.
4. The two repair sentences say the values are on the issue and are carried across unchanged, so the third answer is read, not retyped.
5. CLI (semantic-input.ts): the printed issue line stays an index — valueText's 72-character cut is deliberate — but an issue carrying `changed` says on the line that the whole of each value is on the issue, not on the line. No value is added to the line.
6. skills/archboard/references/variants.md: the issue field list gains `changed`; the deleted-and-changed paragraph says the restored node's fields are read from the issue's `changed` and from the predecessor in `semantic show`'s answer, carried across character for character, and that the printed line is an index that cuts a long value.
7. Owner: src/shared/semantic-board/tests/reconciliation.test.ts asserts the issue carries the predecessor's value for the field it says changed (both directions), and reconciliation-told.test.ts the same for a step; never the sentence around it.
8. Targeted tests only, --max-concurrency=1: the two shared owners, semantic-board-store owners over restoration/grouping, the CLI contract owners, bunx tsc --noEmit, oxlint/oxfmt on changed files, bun run eval:skill check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented.

CONTRACT. ReconciliationIssueSchema (src/shared/semantic-board/lib/reconcile-standing.ts) gained an
optional `changed`: an array of { field, before, after } — the fields the side that CHANGED the
subject moved, `before` what the two sides agreed on when the draft branched, `after` what that
side says now. Which side changed it is what `mine`/`theirs` already say. The shape is
`semantic compare`'s MovedFieldSchema (TASK-256.07), so 'a field moved and here is what it moved
between' reads the same in both places. Optional and never on any other kind; `field` stays absent
on deleted-and-changed, because settle.ts treats a field-bearing issue as a field choice and refuses
a structural side with CHOICE_NOT_A_FIELD.

WHERE IT IS BUILT. The two subject-level builders moved out of reconcile.ts into a new
src/shared/semantic-board/lib/reconcile-removed.ts (removedHereIssues, removedThereIssues, plus the
changedFields comparison and the stated/same/fieldOf value helpers they need); reconcile.ts imports
them and re-exports same/fieldOf as before. The move was forced twice over: settleOne went past the
complexity ceiling and reconcile.ts past 600 lines, and the two directions of one disagreement are
one shape said twice. reconcile-told.ts does the same for a step and a beat with its own comparison
(its `same` is JSON equality, not sameSemanticValue — unchanged deliberately), and asIssues carries
`changed` through. The 'what it holds' pseudo-field is still reported in the sentence and is never a
`changed` entry: it is not a field and has no value.

REPAIR. The removed-here repair now ends '...or take the change by stating the <what> again under
this id, with the values this disagreement carries for each field it changed.' It names no JSON key,
because the same sentence is quoted verbatim in the browser pane (SemanticInspectorStanding) and in
the Codex context brief.

CLI. src/cli/commands/lib/semantic-input.ts: issueLine appends '— the issue's `changed` carries each
of those values, uncut' for an issue that has them. No value was added to the line: valueText's
72-character cut is deliberate (the line is an index into the board), so the line says where the
whole value is instead of inviting a copy from a cut one.

RECIPE. skills/archboard/references/variants.md: the issue field list gains `changed`, and a new
paragraph after the restate-the-node instruction says every value in that third answer is read and
never retyped — from the issue's `changed` and from `archboard semantic show` for the rest of the
node — carried across character for character, and that the printed disagreement lines are an index
and not the values, a long one being cut to fit.

Validation (targeted, --max-concurrency=1; no canvas started, nothing staged or committed):
- bun test src/shared/semantic-board/tests: 141 pass (2 new owners + 2 new assertions)
- bun test src/cli: 54 pass; bun test src/runtime/codex-instructions/tests src/ui/voice-context/tests: 73 pass
- bun test --isolate src/runtime/semantic-board-store/tests: 140 pass (the store lane needs --isolate)
- bun test tests/system/cli/command-contract-artifacts.test.ts tests/system/repository-policy: 11 pass
- bun run generate:cli-contract: the proof now shows `changed` inside the reconciliation issue schema
  (generated artifacts are gitignored; docs/design/cli-command-audit.json needed no change, no command moved)
- bunx tsc --noEmit clean over my files; type-aware oxlint over src/shared/semantic-board and src/cli clean; oxfmt applied
- bun run eval:skill check: suite ok, 15 scenarios, 15 fixtures, 14 coverage parts
- End to end through the CLI's own renderer (scratch script, deleted-and-changed on a node):
  line: 'node n3: this says "removed it", the variant it came from says "changed description" — the
  issue's `changed` carries each of those values, uncut'
  issue: [{"field":"description","before":"Keeps one writer at a time","after":"Keeps one writer at a time, and says who and since when"}]

Not done, deliberately: the browser pane still shows only what/field/repair for an open disagreement
(SemanticInspectorStanding.tsx) — it could show the carried values too, but that file is outside this
task's scope and no criterion asks for it. bunx tsc --noEmit currently also reports two errors in
src/runtime/semantic-renderer/tests/drawn-ink.ts, and oxfmt --check flags that same file; both are
another worker's in-flight change, untouched here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A deleted-and-changed disagreement now carries the values, not just the field name: the issue gained changed, an array of {field, before, after} in the same shape semantic compare answers a moved field with, so the browser pane and the Codex brief carry them too. The printed line stays an index and adds no value, since its 72-character cut makes it unsafe to copy from. The variants recipe says a settled value is read and carried across, never retyped. Verified in the wave-2 gate, run lane by lane because the box was too short on memory for bun run check in one process: lint, fmt:check and type-check clean, the frontend build, 3450 module tests, 163 system tests, the repository lane, and the full serial browser lane at exit 0 with no failures. The derived skills were synced with bun scripts/sync-skills.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
