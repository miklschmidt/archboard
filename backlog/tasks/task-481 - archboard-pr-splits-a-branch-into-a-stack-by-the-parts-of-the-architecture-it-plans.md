---
id: TASK-481
title: >-
  archboard-pr splits a branch into a stack by the parts of the architecture it
  plans
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 20:34'
updated_date: '2026-10-15 20:34'
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
- [ ] #1 The skill says when a branch that has no pull request yet is split into a stack: when it builds more than one coherent part of the planned architecture, or such a part together with changes that no board draws
- [ ] #2 The layers come from the boards: one layer for each coherent part of the design that `semantic compare` reports, with each commit assigned through `semantic footprint --variant`, and one layer for the changes that no board draws
- [ ] #3 The layers are ordered by what the code needs, and the guidance says how to make sure that each layer passes its checks on the layers below and that the top of the stack holds the tree of the original branch
- [ ] #4 An open pull request is not split: the final report names the layers it would split into
- [ ] #5 The guidance points to the gh-stack skill for the commands and does not repeat its procedure, and the existing stack rules of the skill apply to each layer unchanged
- [ ] #6 A trial in a scratch repository, by an agent that reads only the skill, splits a branch with a refactor and two planned parts into the expected layers
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
