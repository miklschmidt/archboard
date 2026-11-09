---
id: TASK-621
title: The footprint lists changed files that no module is bound to
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-09T21:54:00Z'
updated_date: '2026-11-09T22:02:00Z'
labels:
  - cli
  - footprint
dependencies: []
ordinal: 1067000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The footprint maps commits onto modules through their code bindings, so a change in a file that no binding holds appears nowhere in its answer. The archboard-plan gate (TASK-620) and the pull-request Action therefore pass such a change silently, and the skill could only tell the agent to read the diff by hand. The user asked that these changes be flagged, never failed: a reader must see them, and the exit status must not change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A footprint answer lists each changed file in a read repository that no module binding holds, with the commits that changed it, newest first
- [ ] #2 A file renamed into a bound path counts as bound under its former name, and the files of the vault itself are never listed
- [ ] #3 The list changes no exit status: model footprint with --fail-outside exits 0 when only unbound files changed outside the draft
- [ ] #4 model footprint names the unbound files on standard error, and the pull-request Action comment lists them under the footprint
- [ ] #5 The archboard-plan skill and the docs tell the reader to account for each listed file, and give a pass and a fail example of the container rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add unboundFiles to the footprint protocol: repo, path, commits.
2. In the history lens, list each changed file of a range read up to the head that no binding scope holds: every binding of that repository (skipped parts too), and the vault directory. Follow renames into a bound path as commitsByBoundPath does.
3. model footprint names the first five on standard error. The pull-request Action adds a bucket under the footprint. Neither changes an exit status.
4. Update archboard-plan, archboard-pr, the design lens, the CLI description and pull-requests.mdx, with a pass and fail table for the container rule.
5. Proposal wJDQv2En (predecessor WxPQKLMm, model vKEsyHFk) edits History lens, Model footprint and Pull-request Action; adopt it on the branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate on this change (base HEAD~1, state wJDQv2En): History lens and Pull-request Action planned and changed. Commands and Architecture inputs fail the gate, with reasons recorded through empty claimed edits: history-lines.ts and the WORDS text sit outside the modelFootprintContract symbol, and the commit carries the proposal. Model footprint is planned but unchanged for the same symbol reason. unboundFiles named the Backlog task, docs, skills and system tests, which belong to no module.
Backlog 1.55.3 overflowed its stack on create and search with check_active_branches on (686 branches). TASK-620 was the highest ID on every branch, so TASK-621 was created with the branch scan off for that one command; backlog/config.yml is unchanged.
<!-- SECTION:NOTES:END -->
