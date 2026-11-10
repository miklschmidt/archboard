---
id: TASK-621
title: The footprint lists changed files that no module is bound to
status: Done
assignee:
  - '@claude'
created_date: '2026-11-09T21:54:00Z'
updated_date: '2026-11-09T22:55:00Z'
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
- [x] #1 A footprint answer lists each changed file in a read repository that no module binding holds, with the commits that changed it, newest first
- [x] #2 A file renamed into a bound path counts as bound under its former name, and the files of the vault itself are never listed
- [x] #3 The list changes no exit status: model footprint with --fail-outside exits 0 when only unbound files changed outside the draft
- [x] #4 model footprint names the unbound files on standard error, and the pull-request Action comment lists them under the footprint
- [x] #5 The archboard-plan skill and the docs tell the reader to account for each listed file, and give a pass and a fail example of the container rule
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

Evidence: footprint.test.ts lists the 30 gen/ files with the large commit, and on the renames branch only notes/todo.md (mutation: without the rename rule it fails). model-footprint.test.ts commits docs/notes.md with the vault files; --fail-outside exits 0, unboundFiles holds only docs/notes.md, stderr names it (mutation: without the vault scope it fails). pull-request-action.test.ts renders the bucket, a path with backticks as one code span, and the repository when files span several. The site builds with the container table. Sol (gpt-6.1-sol, xhigh) approved 98cb544bf with no findings. CodeRabbit: path escaping and repository identity in the Action comment, fixed in e1108bd6f. CI: the scenario ran past the 15 s default on a hosted runner and now sets 30 s like its neighbours (2df65eca9); all 7 checks pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
model footprint now lists, in unboundFiles, each changed file that no module binding holds, with the commits that changed it. The vault files are not listed, and a rename into a bound path binds the former name. The list never changes an exit status. The CLI names the first five on standard error, and the pull-request Action comment lists them under the footprint, escaped and with the repository when there are several. The archboard-plan and archboard-pr skills, the design lens and the pull-request docs tell the reader to account for each file, and the docs and skill give pass and fail examples of the container rule. Proposal wJDQv2En records the change and is adopted. Risk: the footprint schema is strict, so an outside client that parses the answer with an older schema rejects the new field.
<!-- SECTION:FINAL_SUMMARY:END -->
