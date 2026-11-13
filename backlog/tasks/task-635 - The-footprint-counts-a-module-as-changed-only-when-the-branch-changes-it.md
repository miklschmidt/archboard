---
id: TASK-635
title: The footprint counts a module as changed only when the branch changes it
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13T10:05:00Z'
updated_date: '2026-11-13T10:46:00Z'
labels: []
dependencies: []
ordinal: 1078000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The footprint judged each commit of the range, not the change of the whole range. In a pull-request stack that merges instead of rebasing, the same change can land in two layers: commit 2006383766 in #662 removed a section from src/Platform.DeviceTrust/README.md, which commit 62577ffd5 in #660 had already removed. The diff of #662 changed no file of that module, yet the footprint listed it as changed, the pull-request Action warned, and `model footprint --fail-outside` (the gate of the archboard-plan skill) would fail. A branch that changes a file and later reverts it has the same fault.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A module counts as changed only when its bound paths or declarations differ between the merge base and the head
- [x] #2 A changed module keeps the commits that changed it as evidence
- [x] #3 A module whose commits cancel out, through a merged identical change or a revert, is not changed, and --fail-outside passes for it
- [x] #4 Unbound files and the files a directory module holds count only files that differ between the merge base and the head
- [x] #5 ADR 0045 states the rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. commits.ts reads the net change of a range (git diff merge-base head) as one commit.
2. attribution.ts reads that commit with the merge base as its parent, by the same path and declaration policy.
3. footprint.ts lists a part as changed only when the net reading changes it, keeps its per-commit attribution as evidence, and limits held-part files and unbound files to net files.
4. Amend ADR 0045, the CLI help, CONTEXT.md, the design-lens reference and the pull-requests docs page.
5. Regression test: two stack layers that merge the same change, and a change undone in the branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Architecture: the change stays inside the history lens footprint reading; no module, relationship or flow changes, so no proposal is needed.

Validation: history-lens tests (69) pass, and the new footprint test fails on the old code. An end-to-end CLI repro of the #660/#662 shape (a README change made in two merged stack layers, plus an inner change the draft names) made `--fail-outside` exit 1 for Workspace on the old code and exit 0 with the fix. lint:all, format:check and types pass. The model-footprint and pull-request-report system tests pass. Sol round 1 (gpt-6.1-sol, xhigh) found no functional faults and fixed two lint nits.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The footprint now counts a module as changed only when its bound paths or declarations differ between the merge base and the head. It reads the net diff as one commit, with the merge base as its parent, through the same path and declaration attribution policy. Each changed module keeps its per-commit attribution as evidence. Directory-held files and unbound files count only files in the net diff. ADR 0045, the CLI help, CONTEXT.md, the design-lens reference and the pull-requests docs page state the rule. Locality and behind stay per commit.
<!-- SECTION:FINAL_SUMMARY:END -->
