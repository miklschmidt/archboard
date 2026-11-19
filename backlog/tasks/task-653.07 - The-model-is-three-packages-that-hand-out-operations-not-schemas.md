---
id: TASK-653.07
title: The model is three packages that hand out operations, not schemas
status: Done
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T19:35:00Z'
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
- [x] #1 Three workspace packages replace packages/model in the layer order contract < rules < store, the packages above model move up two layers in package-graph.test.ts, and no package is kept for the legacy board
- [x] #2 The contract exports exactly modelShape, parseModelRequest, readModelReply, parseDocument, describeModelSchema, defaultSemanticPolicy and defaultLayoutEngine (width 7); modelShape is the package's one keyed getter, and the ticket lists each of its keys with the consumer that reads it
- [x] #3 The rules package exports exactly projectModel, modelContent, projectFlow, moduleForest, doorEndpoints, subjectsOf, describeSubject, nodeSubject, edgeSubjects, readFlow, compareVariants, comparedWith, inspectContainer, inspectGroups, resolveVariant, currentVariant, addressedVariant and mintId (width 18)
- [x] #4 The store exports exactly the twenty operations of the settled entry, from readArchitectureModel to forgetModelMemory, with installArchitectureModel(vault, Initialize | Import), listArchitectureCheckpoints(vault, "rows" | "full") and checkArchitectureVault absorbing the /api/vault/check assembly (width 20)
- [x] #5 INTERFACE_WIDE clears on all three packages; the 7 exported values and 58 getters are gone, view helpers sit with their one caller, diagnosticLine and vaultsBoundTo with the CLI, parsePaneKey and paneAddressKey in server-lifecycle, and no old subpath re-exports anything
- [x] #6 The eight `archboard model schema` prints and the CLI spec result and input schemas diff empty before and after, and vault files, the history archive and checkpoints keep their bytes
- [x] #7 The CLI's refusal preservation and the server's vault envelope each have one test at the contract's reply and request operations; tests that parsed with a schema call the contract's operations; tests whose only subject was a getter are deleted
- [x] #8 interface-width-ceilings.json holds one ceiling per new package at its measured count; an ADR records the split into contract, rules and store, that the contract hands out parse operations and derived types, and why the legacy board is no package; CONTEXT.md gains "Model contract" only if the design introduces it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Design amended after the first build stopped: read 'Candidate 11, model: AMENDED' in the run's decision log. Contract 15, rules 16, store 20; the store parses its formats through parseDocument kinds; no ~100-key modelShape.

## Built (branch deepen/653-07-model)

Design followed: the "Candidate 11, model: AMENDED again after the second stop" entry (it supersedes the widths in AC #2-#4): contract 20, rules 18, store 20. Code check (old model node pointed at each package in turn, uncommitted, reverted): no warning or error on any of the three (no INTERFACE_WIDE, MODULE_SHALLOW, EXPOSED_VALUE or EXPOSED_UNUSED); contract 20 functions, logic 2662; rules 18 functions, logic 1088; store 20 functions, logic 8699.

- Layers: model-contract 4 < model-rules 5 < model-store 6; every package above moved up two (apps 10). Ceilings: model-contract 96, model-rules 27, model-store 20 (all names incl. types; the old model was 182).
- Contract: schemas private; parseDocument (45 kinds: 36 one-schema kinds, 6 store records in store-documents.ts, 3 checked kinds legacyBoard, legacyBoardFile, variantContent), parseModelRequest (18 operations, each reads its body the way its route did), readModelReply (26 operations; "failed" delivery reads only a refusal), describeModelSchema, modelShape (44 keys), plus readFlow, nestedSteps, subjectsOf, normalizeGroupIds, resolveVariant (absorbs currentVariant), addressedVariant, findVariant, variantNamed, everythingView() (the frozen Everything view; an exported value would be EXPOSED_VALUE), pane keys, defaults.
- Seam tests: packages/model-contract/tests/shared/protocol/model-protocol.test.ts (refusal preservation at readModelReply, vault envelope at parseModelRequest).
- Byte diffs against model-before/: the eight `archboard model schema` prints and command-contract-proof.{json,md} identical.

## modelShape keys and consumers
modelRead: cli read.ts:186 · model: code-intel canonical-history.ts:40, walkthrough talk.ts:158 · refusal: cli inspect.ts, portable.ts, rasterize.ts, render.ts, record.ts, snapshot.ts, workbench architecture-explanation.ts · revision: cli record.ts:199, code-intel canonical-history.ts:34, code-check.ts:359 · selectedState: code-intel canonical-history.ts:33 · explanation: workbench architecture-explanation.ts:4 · modelSnapshot: cli snapshot.ts:165 · paneReading: cli pane.ts:390,397,528, server pane-show-route.ts · checkpointRequest/checkpointRetain/checkpointList: cli checkpoints.ts · archiveInitialization: cli archive.ts:16 · editResult: cli edit.ts, initialize.ts, portable.ts · claimResult, claimList, recoveryResult: cli edit.ts · initializationRequest: cli initialize.ts:105 · legacyInventory, legacyMappingWrite: cli migration.ts · publication, publicationRequest, publicationDestination: cli publication.ts · renderRequest: cli rasterize.ts, render.ts, renderer recipe schema.ts:95 · renderSuccess: cli render.ts, web picture-cache.ts:60, renderer receipt.ts:61 · drawnPicture: web picture-cache.ts:64-65 · renderedVariant: code-intel locality.ts:115, renderer receipt.ts · offeredView: renderer receipt.ts, recipe schema.ts · subjectStanding: code-intel footprint.ts:33 · pictureReceipt: renderer receipt.ts:52 · diagramTheme: cli record.ts, replay.ts, renderer receipt.ts, skills, walkthrough talk.ts · standaloneTheme: cli render.ts, renderer receipt.ts, recipe schema.ts · layoutEngine: cli record.ts, replay.ts, renderer recipe schema.ts, walkthrough talk.ts, scripts · legendLayout: renderer recipe schema.ts:66 · diagramGrammar, variantLifecycle: skills suite.ts, workbench context.ts, semantic-architecture-input.ts · semanticSubjectKind, reconciliationKind: workbench context.ts, semantic-architecture-input.ts · evidenceKind: code-intel code-check.ts:112 · semanticPolicy: skills fixture.ts:36 · codeCheckRules: code-intel code-check.ts:366 · vaultCheck: cli vault.ts:135,544, walkthrough talk.ts:160 · vaultDiagnostic: code-intel code-check.ts:158, skills vault.ts:157 · diagnosticSubject: code-intel code-check.ts:95, code-check-skips.ts:148 · paletteColor: renderer tests only (door-button.test.ts, palette-contrast.test.ts enumerate the palette; see deviations).

## Parse kinds and consumers
Store vault files: manifest, module, flowCollection, walkthrough, installedMigration (model-read.ts), proposal (candidate.ts, family.ts, settle.ts, lifecycle.ts, install-candidate.ts), vaultConfiguration (configuration.ts; code-intel test support). Store records: checkpointRecord (retain.ts, prepare.ts, candidate.ts, portable.ts, install-candidate.ts, prepare-cutover.ts), archiveRecord (model-archive.ts), journal (model-state.ts, claims.ts, model-install.ts), claimsState (claims.ts), publicationConfiguration (model-publication.ts), flatStep (materialize.ts), portableBundle (portable.ts), portableInputPath (portable-closure.ts), legacyMappingPlan (migration-plan.ts, retained.ts), legacyOriginalInputs (retained.ts), legacyBoardFile (inputs.ts). Projections: stateMetadata, newStateMetadata, selectedState, stateLineage, correction, lifecycle, initializationRequest, migrationRequest. Values: gitObjectId, qualifiedSubjectId, semanticId, stateSelection, flowChange, semanticPolicy (store compose.ts, skills vault.ts), variantContent (reconcile candidate.ts). Outside: legacyBoard (web, cli, walkthrough), model (walkthrough canonical.ts), modelSnapshot (cli snapshot.ts), paneContext (workbench context.ts), paneReading (web socket-messages.ts, model-address.ts), panePresentRequest (web socket-messages.ts), renderReply (web picture-cache.ts), layoutEngine (web layout-engine.ts, SemanticEngineBar.tsx), diagramGrammar (web use-model-explanation.ts, scene.ts), paletteColor (web palette.ts), edgeTraffic (skills outcomes-content.ts, renderer diagram.ts), editChanges (scripts readme-assets hero.ts).

## Outside the slice (each a caller or repository policy)
apps/cli (diagnosticLine and vaultsBoundTo moved in), apps/server (routes read through parseModelRequest), apps/web (drillDirection moved in), packages/{code-intel (draft refs moved in), renderer (findView, nothingBuilt, drawnSubjects moved in), skills, walkthrough, workbench, server-lifecycle, code-opener, timing (one comment)}, tests/system (layers, ceilings, API adopters), scripts, site/scripts, actions, crates comments, vite.config.ts (renderer sources, solo lane paths), .github/workflows/site.yml (path filters), docs/readme/assets.json (source paths; those assets now read stale until regenerated, their pictures unchanged), bun.nix. The vault is unchanged: its packages/model bindings dangle until the proposal slice rebinds them.

## Deviations
1. The vault configuration's icon list loads every RemixIcon; in the contract that would reach the browser bundle. `#installed-icons` resolves to an empty list under the `browser` condition (no browser reads a vault configuration). Web bundle checked: no icons.
2. The dead filesystem half of the pane-key file (vaultPathFor and helpers, no caller) and the dead listedLegacyBoard (test-only caller) are deleted, with their tests.
3. readArchitectureCheckpoint is not deleted: it has store-internal callers; it is private.
4. Fixtures that only the bare legacy-board/content schema accepted were made coherent (renderer, code-intel, rules tests), since tests now read through parseDocument with the integrity rules.
5. paletteColor shape key has test-only consumers (two renderer palette-coverage tests).
6. Store re-checks of a request through parseModelRequest drop a `vault` key instead of refusing it, and a non-object input to an envelope operation fails with the envelope's text; callers' types exclude both.

## ADR
ADR 0086 (renumbered from 0085, which the Painter stage took on deepen/module-depth).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/model became three packages, contract < rules < store (widths 20/18/20 by the code check, no INTERFACE_WIDE or MODULE_SHALLOW), per the decision log's last amended entry. The contract keeps every schema private and hands out parse operations (parseDocument, parseModelRequest, readModelReply), describeModelSchema and one keyed getter (modelShape); the store reads its own records through contract kinds; all callers use the three entries. Verified: schema prints and CLI command contract byte-identical; build, types, lint:all, format:check, test:modules (5346), test:repository (182), test:system (227), test:solo, test:serial-browser all pass. Risks and follow-ups: the vault still binds packages/model (the proposal slice rebinds it); README assets read stale until regenerated; deviations are listed in the notes.
<!-- SECTION:FINAL_SUMMARY:END -->
