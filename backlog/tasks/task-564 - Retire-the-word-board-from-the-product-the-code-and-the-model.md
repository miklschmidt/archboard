---
id: TASK-564
title: Retire the word board from the product, the code and the model
status: Done
assignee:
  - '@claude'
created_date: '2026-11-02T19:39:00Z'
updated_date: '2026-11-02T23:31:00Z'
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
- [x] #1 No package, directory, file or exported name says board for a model, a module or the canvas
- [x] #2 No command help, message, page copy or skill text says board where CONTEXT.md names another term
- [x] #3 The current model's modules, relationships, flows and walkthroughs use the glossary, and every continuing subject keeps its identity
- [x] #4 Retained originals, legacy decoding and persisted formats keep reading exactly as before, and each kept use of the word is named in the ADR below
- [x] #5 A new ADR records the rename, the name of the former board package, and what keeps the old word and why
- [x] #6 CONTEXT.md, docs/agents/boundaries.md, CLAUDE.md and the skills describe the new names
- [x] #7 bun run check passes, and readme:check names no source that is missing
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

9. After the rename, carry out TASK-565 on this branch in its own commits, then finalize the kept-word list in the ADR, so that the one complete gate and the one review cover both.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions recorded in ADR 0072. Package name: @archboard/model. An unmerged record is not history, so ADR 0071 and docs/design/vello-painter.md were rewritten here and ADR 0071 took a new filename. No proposal was opened for the rename, because the architecture stays accurate, AC 3 names the current model and only the owner can authorize adoption, so the edit targets the current state directly. Proposal JTZvj2vi was settled on the renamed state, renamed, and given the new ADR path. It was not adopted. Three older drafts each lost one sentence that said the word. check code reports 18 warnings: each comes from PR 26's removed files and symbols, which proposal JTZvj2vi owns. README: only the architecture SVGs and the design smells poster show the word.

Review correction: Flow collections vKEsyHFk#SMjRfwN3 and vKEsyHFk#UOXNWLhR now retain their former names. The shared writer repaired current and draft JTZvj2vi without adoption. The architecture stays accurate, so this correction needs no new proposal. Focused edit, proposal, legacy inventory, and decoder tests pass.

Final validation at e99e1eec0: bun run check exited 0 with 21 of 21 tasks successful, and every browser test passed. readme:check exits 1 only because 15 of 17 assets are stale, and it names no missing source. archboard check semantics and check embeds exit 0. archboard check code exits 1 with 18 warnings, and all 18 are drift of PR 26 that proposal JTZvj2vi owns.

Two collections list their current name in formerNames as well as the old one, because the repair renamed them away and back. Module WaIHZ8sZ already had this shape. It changes no lookup, so it stays.

The clip that README.md attaches still shows the old module names. Only the owner can upload it, because an upload is public.

Correction: the note above is wrong. The agent can upload the clip, and docs/agents/readme-assets.md says to attach every file that the kit names. The clip is now attached and README.md names its address.

The Entries beat of the clip moved from server-lifecycle to workspace. Removing the refusal formatter left server-lifecycle with 8 entries and 1 hidden part, so it no longer shows a module with nothing behind its interface. workspace has 7 entries and 0 hidden parts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Renamed @archboard/board to @archboard/model and moved live paths, exported names, copy, skills, guides and the current model to the glossary. ADR 0072 records the rename, the rule for a kept use and each kept use. Decided that an unmerged record is not history, so ADR 0071 and the Vello painter record were rewritten. The architecture pictures and the design smells poster and clip are filmed again, and README.md names the new clip.

Every continuing subject kept its identity through the shared writer, proposal JTZvj2vi stays a draft, and retained originals, legacy decoding and talk replay read as before. bun run check exits 0.
<!-- SECTION:FINAL_SUMMARY:END -->
