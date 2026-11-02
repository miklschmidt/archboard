---
id: TASK-564
title: Retire the word board from the product, the code and the model
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-02T19:39:00Z'
updated_date: '2026-11-02T19:51:00Z'
labels:
  - naming
  - refactor
dependencies: []
priority: medium
ordinal: 1013000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0068 retired boards for one canonical model with recursive modules, and CONTEXT.md lists board as a word to avoid for a model, a module and the canvas. The decision removed the concept and not the name, so a reader and an agent still meet a word that the glossary forbids, in the package @archboard/board, in semantic-board-canvas, in code, in copy and in the model itself. On 2026-11-02 the word appeared about 21,500 times and in 590 tracked paths, outside backlog/, docs/design/, docs/readme/ and evals/. PR 26 alone added 373 lines that use it, including the title of ADR 0071. The product name archboard stays. A word in a retained original or a legacy format stays, because exact bytes must stay readable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No package, directory, file or exported name says board for a model, a module or the canvas
- [ ] #2 No command help, message, page copy or skill text says board where CONTEXT.md names another term
- [ ] #3 The current model's modules, relationships, flows and walkthroughs use the glossary, and every continuing subject keeps its identity
- [ ] #4 Retained originals, legacy decoding and persisted formats keep reading exactly as before, and each kept use of the word is named in the ADR below
- [ ] #5 A new ADR records the rename, the name of the former board package, and what keeps the old word and why
- [ ] #6 CONTEXT.md, docs/agents/boundaries.md, CLAUDE.md and the skills describe the new names
- [ ] #7 bun run check passes, and readme:check names no source that is missing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the word, separate legacy, persisted, wire and live uses, and take a gate baseline on the unchanged branch.
2. Delete source files that nothing imports and that exist only for retired commands, in their own commit.
3. Move paths in pure commits: packages/board becomes packages/model (@archboard/model), semantic-board-canvas becomes canvas, board-routing becomes reading-routing, board-catalog becomes model-catalog, tests/system/semantic-boards becomes tests/system/models, plus single files. Run build:core after the crate file moves.
4. Rename exported names, wire messages and refusal codes through one reviewed map. A name that means a retained legacy document says LegacyBoard, because that is the glossary term. Persisted keys keep their spelling.
5. Rename local names and rewrite comments and copy, package by package, by what each value holds: model, module, picture, canvas, reading or legacy address.
6. Write the ADR, retitle ADR 0071, and update CONTEXT.md, CLAUDE.md, docs/agents, and the skills.
7. Edit the current state of the model through model edit with a claim. Keep every identity. Reconcile the drafts. Do not adopt JTZvj2vi. No new proposal: a rename leaves the architecture accurate, and AC 3 names the current model, and only the owner can authorize an adoption.
8. Run the complete gate, rebase onto feat/vello-renderer, delegate the review, run the gate again, open the stacked pull request and leave it for the owner.
<!-- SECTION:PLAN:END -->
