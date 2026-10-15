---
id: TASK-481
title: >-
  archboard-pr splits a branch into a stack by the parts of the architecture it
  plans
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 20:34'
updated_date: '2026-10-15 20:55'
labels: []
dependencies: []
priority: medium
ordinal: 846000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The archboard-pr skill explains each pull request of a stack: each proposal is drawn against the one below it, and a design that several pull requests build stays a draft. It does not say when or how to split a branch into a stack. An agent then opens one pull request for a branch that builds several parts of the planned architecture together with refactors and fixes that no board draws, and the reviewer reads all of them in one diff. The user asked that the split come from the boards that the branch changes: one pull request for the changes that no board draws, and one for each coherent part of the planned architecture. The gh-stack skill (github/gh-stack) owns the commands that build a stack and its rules for layer order, so this skill only decides the layers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill says when a branch that has no pull request yet is split into a stack: when it builds more than one coherent part of the planned architecture, or such a part together with changes that no board draws
- [x] #2 The layers come from the boards: one layer for each coherent part of the design that `semantic compare` reports, with each commit assigned through `semantic footprint --variant`, and one layer for the changes that no board draws
- [x] #3 The layers are ordered by what the code needs, and the guidance says how to make sure that each layer passes its checks on the layers below and that the top of the stack holds the tree of the original branch
- [x] #4 An open pull request is not split: the final report names the layers it would split into
- [x] #5 The guidance points to the gh-stack skill for the commands and does not repeat its procedure, and the existing stack rules of the skill apply to each layer unchanged
- [x] #6 A trial in a scratch repository, by an agent that reads only the skill, splits a branch with a refactor and two planned parts into the expected layers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: no board is affected. No vault board binds anything under skills/, and the task changes only the archboard-pr skill.
2. Add skills/archboard-pr/references/split.md: when to split, the design to split by, the layers (coherent parts from `semantic compare`, commits from `semantic footprint --variant`, the changes that no board draws), the order, the build through the gh-stack skill, and the checks (each layer passes on the layers below, the top tree equals the original branch). An open pull request is not split.
3. SKILL.md: a step in section 1 that sends a branch with no pull request to split.md when the condition holds, and one clause in the description.
4. Make sure that every command and option the guidance names exists (`--help`).
5. Trial: a scratch repository with its own vault and registry, a board, and a branch with a refactor that no board draws and two planned parts. A fresh agent that reads only the skill computes the layers. Correct the guidance by what it finds.
6. Gate: the install-target test and `bun run check`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
What changed. The new reference skills/archboard-pr/references/split.md says how to split a branch with no pull request into a stack. The design on each board gives the layers: one for each design part that `semantic compare` reports, and one groundwork layer for what no board draws. `semantic footprint --variant` and the diff put each change in a layer. The code gives the order. Git builds the branches, and `gh stack init` adopts them. Section 6 opens the pull requests with `gh stack submit --auto` and explains them from the bottom. SKILL.md section 1 step 5 points to it, and the description names the split. The no-board row of the picture table now covers a refactor that changes nothing a board draws. The stack line allows a design with no pull request. reconcile.md says that the split sends a design of the whole branch there. An open pull request is not split.

No board is affected: no vault board binds anything under skills/.

Trial 1. A scratch repository with its own registry had a Shop board (Orders, Payments) and a receipts branch. The branch held a refactor to integer cents, a design draft, one commit that built Mailer and Receipts and connected Orders, and a README change. A fresh agent that read only the skills made groundwork, then mailer, then receipts. Each branch passed `bun test` with only the branches below it, and the top branch had the tree of the original branch. The agent found these gaps:
- The `<head branch>/<layer>` names were impossible beside the head branch.
- With `--variant`, footprint answers `namedAndChanged` and `changedNotNamed`, not `changed`.
- The join rule had two readings.
- Nothing said how to build layers from existing commits.
- Nobody can check the hunk rule's Done line.
- The board-file sentence named the wrong step.
- The groundwork wording contradicted the order.

Trial 2 ran on the corrected text and made the same three layers, now named receipts-groundwork, receipts-mailer and receipts-receipts. It found these gaps:
- A reconcile edit had no branch to go on, so the top-tree check failed on the board file only.
- `gh stack submit` must open the pull requests before a body can name its neighbours.
- A layer's board commit needs a rebase of the branches above it.
- The stack line assumed a design pull request.
- The no-board row did not cover a refactor across parts.

All of these are corrected. Two findings did not lead to a change. A design draft warns in `check --code --variant` on a lower layer, which is expected for planned parts. And how to find a pull request or the repository's checks is general agent knowledge. Section 6 (submit, update, rebase and push) was not tried, because the scratch repository has no GitHub remote.

Gate: `bun run check` exited 0 with no failing test in any lane, the serial browser lane included. `bun run fmt:check` exited 0 after the last edit. The install-target test passed (10 tests). Commit ad3f9ee18.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The archboard-pr skill now splits a branch with no pull request into a stack when it builds more than one part of the planned architecture, or one part and groundwork that no board draws. The new references/split.md takes the layers from the design on each board (semantic compare), puts each change in a layer (semantic footprint --variant and the diff), orders the layers by what the code needs, builds them with git and adopts them with gh stack init. It opens the pull requests with gh stack submit before it writes each body from the bottom. An open pull request is not split. Two trials in a scratch repository, by fresh agents that read only the skills, made the expected groundwork, mailer and receipts layers. Each passed its tests on the layers below, and the top branch had the original tree. The text was corrected by what both trials found. bun run check passed. Commit ad3f9ee18.
<!-- SECTION:FINAL_SUMMARY:END -->
