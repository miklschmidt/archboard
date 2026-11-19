---
id: TASK-653.07
title: The model is three packages that hand out operations, not schemas
status: To Do
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T17:33:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.02
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 11 of the archboard-deepen run, second on the TypeScript track, landed alone after timing. packages/model is wide (140 names: 133 functions, 7 values), and 58 of its functions only return a constant schema, so callers parse requests and replies with zod schemas themselves and the refusal and vault-envelope rules live at every caller. The model splits by job into a contract, a rules and a store package, and each hands out operations. The settled design, every decision and its reason: the "Candidate 11, model: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-11-model.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Owner decision 18 (one keyed getter per package) is in the same log.

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: model (packages/model) and the three packages it becomes, contract < rules < store (names in domain words, tree D11); the callers that change across apps/web, apps/cli, apps/server, packages/code-intel, packages/renderer, packages/workbench, packages/skills, packages/walkthrough, scripts and site; server-lifecycle (packages/server-lifecycle), which receives the pane keys in the interim.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on the contract, rules and store packages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Three workspace packages replace packages/model in the layer order contract < rules < store, the packages above model move up two layers in package-graph.test.ts, and no package is kept for the legacy board
- [ ] #2 The contract exports exactly modelShape, parseModelRequest, readModelReply, parseDocument, describeModelSchema, defaultSemanticPolicy and defaultLayoutEngine (width 7); modelShape is the package's one keyed getter, and the ticket lists each of its keys with the consumer that reads it
- [ ] #3 The rules package exports exactly projectModel, modelContent, projectFlow, moduleForest, doorEndpoints, subjectsOf, describeSubject, nodeSubject, edgeSubjects, readFlow, compareVariants, comparedWith, inspectContainer, inspectGroups, resolveVariant, currentVariant, addressedVariant and mintId (width 18)
- [ ] #4 The store exports exactly the twenty operations of the settled entry, from readArchitectureModel to forgetModelMemory, with installArchitectureModel(vault, Initialize | Import), listArchitectureCheckpoints(vault, "rows" | "full") and checkArchitectureVault absorbing the /api/vault/check assembly (width 20)
- [ ] #5 INTERFACE_WIDE clears on all three packages; the 7 exported values and 58 getters are gone, view helpers sit with their one caller, diagnosticLine and vaultsBoundTo with the CLI, parsePaneKey and paneAddressKey in server-lifecycle, and no old subpath re-exports anything
- [ ] #6 The eight `archboard model schema` prints and the CLI spec result and input schemas diff empty before and after, and vault files, the history archive and checkpoints keep their bytes
- [ ] #7 The CLI's refusal preservation and the server's vault envelope each have one test at the contract's reply and request operations; tests that parsed with a schema call the contract's operations; tests whose only subject was a getter are deleted
- [ ] #8 interface-width-ceilings.json holds one ceiling per new package at its measured count; an ADR records the split into contract, rules and store, that the contract hands out parse operations and derived types, and why the legacy board is no package; CONTEXT.md gains "Model contract" only if the design introduces it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->
