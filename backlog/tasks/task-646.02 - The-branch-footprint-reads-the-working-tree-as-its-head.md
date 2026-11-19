---
id: TASK-646.02
title: The branch footprint reads the working tree as its head
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T00:21:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646
type: feature
ordinal: 1088000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

An agent runs the shallow-module gate before it commits. The gate judges only the modules that the branch touched, so the branch footprint must see uncommitted changes. Otherwise the gate passes on every uncommitted change.

## Blocked by

None (can start immediately).

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: History lens `vKEsyHFk/HBlhIeSD#radK8osF` (changed: the footprint can read the working tree as its head).
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk/HBlhIeSD%23radK8osF (a worktree server serves the same address on its own port)
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

TASK-646 adds rules to `archboard check`, and this repository does not obey them yet. The CI task `check:model` fails on any warning. From the first ticket that reads more modules or adds a rule, the stack layers can fail `check:model` until TASK-646.14 clears the old findings. The stack merges as one unit, after its top layer passes.

1. Before you hand back, run `archboard check`. After TASK-646.04 is in your branch, also run `archboard check code --fail-shallow-modules --base <the branch below yours>`.
2. To find what your ticket surfaced, compare the findings with `archboard check` on the branch below yours.
3. If a finding is on a module that your ticket adds or changes, fix it in this ticket. Use the seam that the archboard skill gives for that finding. The code that this ticket writes adds no findings.
4. If a finding is on a module that your ticket does not change, leave it. TASK-646.14 clears it.
5. Never silence a finding. Add no waiver or exemption, weaken no rule or policy, and do not change `scripts/check-model.ts` or the `check:model` task to pass.
6. In your final summary, list the findings that your ticket surfaced on modules that it does not change: each code, with its count of modules. TASK-646.14 and the pull-request body account for them.
7. A ticket that adds a rule tests it on fixtures, never on this repository's code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A branch footprint with the working tree as its head names the modules that uncommitted changes touch
- [x] #2 A branch footprint with a committed head gives the same answer as before
- [x] #3 A History lens test covers the working-tree head
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The footprint request's head can be the working tree: a caller passes { workingTree: true } in place of a ref. A part pinned to a ref its checkout lacks keeps its ref, as it does at HEAD.
2. History lens snapshots each checkout's working tree (tracked changes and untracked, unignored files) as a commit on top of HEAD, with a copy of the index and a temporary object directory that borrows the checkout's objects. Every read of that range runs with it, and the directory is removed after. The checkout gains no object and no index change, and a clean tree reads HEAD itself.
3. The answer says workingTree: true; the rest of the range machinery is unchanged, so a committed head answers as before.
4. ADR 0045 and the Git client's notes name the exception: a footprint asked for the working tree reads uncommitted files.
5. Test first at the History lens seam (readVariantFootprint): uncommitted, staged and untracked changes name their parts, ignored files do not, the checkout is left as it was.

6. Range resolution, the working-tree head included, lives in footprint-range.ts, so footprint.ts reads a range and its Git options without knowing where the head came from.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: packages/code-intel/tests/runtime/history-lens/operations/footprint-working-tree.test.ts (2 pass): a clean tree reads exactly as HEAD plus workingTree: true; unstaged, staged, deleted, untracked-in-bound-directory and one changed declaration of two name their parts, an ignored bound directory does not, the untracked unbound file is listed, and the checkout's objects, index and status are unchanged. All 81 history-lens tests and all 401 code-intel tests pass, so committed heads answer as before. lint:tests, lint:policy, format:check and types pass. archboard check exits 0 with information only, none on History lens code. Gate: model footprint --fail-outside exits 1 because the module code-intel changed outside the slice: the test lives in packages/code-intel/tests and the answer's workingTree field in src/shared/protocol/footprint.ts, outside History lens's binding (src/runtime/history-lens).

Merge gate (orchestrator): footprint exits 1 on code-intel only, because code-intel alone binds the History lens test under packages/code-intel/tests and the shared footprint protocol that gains the workingTree field. Neither has architectural meaning beyond the planned History lens change, so the exception is recorded in the proposal history (operation task-646-02-code-intel-exception). Unbound files: this task file and ADR 0045, which no module binds.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A branch footprint can now end at each checkout's working tree: a caller passes head { workingTree: true } to the History lens footprint read. The lens commits the uncommitted changes (staged or not, deletions, untracked unignored files) on top of HEAD, using a copy of the index and a temporary object directory that borrows the checkout's objects, reads the range with the same walk as any commit, then removes the temporary objects. The checkout gains no object and its index is untouched; a clean tree reads HEAD itself. The answer says workingTree: true. Parts pinned to a ref their checkout lacks keep their ref, as at HEAD. ADR 0045 now names this one exception to reading only committed files. Not yet exposed on the CLI or route: TASK-646.04's code check calls it in process. Risk: git add runs the checkout's clean filters (such as Git LFS), as git status does.
<!-- SECTION:FINAL_SUMMARY:END -->
