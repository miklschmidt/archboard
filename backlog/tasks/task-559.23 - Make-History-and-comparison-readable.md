---
id: TASK-559.23
title: Make History and comparison readable
status: In Progress
assignee: []
created_date: '2026-10-31T03:27:00Z'
updated_date: '2026-10-31T04:24:00Z'
labels:
  - frontend
  - board
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 995000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner could not use History or find how to stop a comparison. The comparison control sits in the History tab, offers internal words (After, Default comparison) and lists every saved checkpoint as a separate choice, about 50 rows that differ only by a time and a hash. Rows lead with names such as TASK-319 after TASK-482.07, which mean nothing to a reader, and raw identities show in the header chip. A proposal already has a summary. Reading a draft shows the model id vKEsyHFk where the model name belongs. Eight drafts share task-derived names, and some share a summary too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One comparison control stands beside the picture on every reading that can compare, and it says what the picture is compared with
- [x] #2 It offers No comparison, Current, the draft's base and the other drafts by summary, and the words After and Default comparison are gone from the product
- [x] #3 Checkpoints are not choices in that control, and a checkpoint is compared from its row in History
- [x] #4 History rows lead with the summary, then the name, and a run of checkpoints of one state folds into one row with a count and the latest time
- [x] #5 No raw identity is shown where a person reads, and drafts that share a name differ by what they change
- [x] #6 A draft's reading shows the model's name, in the header and in the right column
- [x] #7 The eight drafts of this repository have names that say what they change, through a model operation, and the former names keep resolving
- [ ] #8 The owner accepts it by eye
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model name: proposalManifest copies the retained baseline's manifest, and the baseline predates the name Archboard. selectedReading names the reading from the live manifest. resolveState and materializeProposal stay untouched, because predecessorRevision hashes the manifest and an overlay there would refuse followers with PREDECESSOR_CHANGED.
2. Comparison control: ModelComparisonSelector moves to the caption and replaces ModelComparisonLine. Choices live in a pure rule: No comparison, Current, Its base, other drafts by summary. An explicit base that is no choice stands as one extra row so that the control can still say it.
3. History: one tree with the sections Proposals, Current, Earlier, Shelved. Rows lead with the summary, then the name. Every state, including a draft and a retained state that the catalogue does not list, folds its own checkpoints with a count and the latest time. Checkpoints no longer fall under Current. A checkpoint row offers Compare.
4. Raw identities leave the chip, rows, dropdown, About history and corrections. Hashes stay in tooltips. Drafts that share a name differ by the modules they touch.
5. Rename the eight drafts with proposal edit: the operation exists and keeps formerNames. Names come from comparing each draft with its base.
6. Consumer skill and archboard-dev: a proposal name says what it changes, and it needs a summary. archboard-dev today says to use the task ID as the name, which caused this.
7. Docs: reader-redesign, frontend, test-suite, canonical-models. Tests: pure rules, one board test for the name, and the browser owners of comparison.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
One comparison control stands in the caption line. It offers No comparison, Current, Its base and the other drafts by summary. A checkpoint is compared from its History row, and it stands in the control only while it is compared with.

History has four sections: Proposals, Current, Earlier and Shelved. Rows lead with the summary, then the name. Every state folds its own checkpoints, so 120 checkpoints no longer read as one pile under Current. Drafts that share a name differ by the modules they touch.

The model id in a draft came from a retained baseline written before the model was named. The outer read now takes the present name from the current manifest, and ancestry hashes stay exact.

Base UI resets a select to its first value when the chosen row leaves the list. The control acts only on a press, and canonical-model-comparison.test.ts owns that path.

Removed words: After, Default comparison, Compare with current, Show After. New words: No comparison, Its base, Compared with, Earlier, N saved. The address keeps againstX=after, and no person reads it.

Hashes on a saved reading moved to tooltips. The Explain answer still shows subject ids and a revision digest in its context line, which is outside History and comparison.

Architecture impact: no module or flow in .archboard/vault describes the comparison control or the History rows, so the model stays accurate and no proposal is needed. The change stays inside the existing reader and the proposal read operation. No evaluation scenario scores proposal names, so evals/ is unchanged.

The eight drafts were renamed through model claim, edit and release with writer slice23-agent. A unique former name resolves. A former name that several drafts shared still refuses with STATE_AMBIGUOUS, as before. archboard check exits 1 on two existing warnings, BINDING_PATH_MISSING on Variant timeline and ANCHOR_SYMBOL_MISSING on servedVault, which the drafts did not cause.

Evidence: nix develop --command bunx vp run --no-cache check:all exited 0 in 145 seconds with 21 of 21 tasks, and the browser lane passed 44 of 44 files. Screenshots at 1920 by 1080 are in /tmp/integrate/slice23/: final-control-open-dark.png, final-draft-no-comparison-dark.png, final-history-folded-dark.png, final-history-earlier-dark.png, final-control-open-light.png.

Merged to integrate/pr19 at 7ae9eeefb, gate 21 of 21 in 148 s, server 17842 restarted. Open: criterion 8, owner by eye. Left: a former name shared by several drafts still refuses with STATE_AMBIGUOUS. Current, Earlier and Shelved states keep task-derived names. The Explain context line still shows identities and a revision digest. selectComparison retries because a press right after a live write failed in 2 of about 14 runs, cause not found.
<!-- SECTION:NOTES:END -->
