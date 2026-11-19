---
id: TASK-653.10
title: Workspace answers the place questions its callers assemble
status: To Do
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T17:33:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.09
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 15, first ticket (the deepening), of the archboard-deepen run. packages/workspace is wide (38 names), and five callers filter the checkout registry themselves to answer which checkout is chosen, whether a root is known and which vault a directory holds. Workspace answers those questions; the machine foundation splits out in a later ticket. The settled design, every decision and its reason: the "Candidate 15, workspace: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-15-workspace.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Its three numbered points are settled by the orchestrator.

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: workspace (packages/workspace) and the five registry-filtering sites: apps/cli repo language-server.ts and repo.ts, apps/server repository-routes.ts, packages/code-binding vault-checkout.ts, the CLI's vaultsBoundTo filter; workbench's vault refusals.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on workspace other than its INTERFACE_WIDE finding, which clears in the split ticket. workspace's width is at most 29 here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 workspace exports repoRootOf, repoIdentityAt, inspectCheckout (absorbs checkoutHead), listRegistry, declareDirectory, forgetDirectory, checkoutOf, chooseCheckout, checkoutsReadFrom, findVault (absorbs findAndRegisterVault), vaultIn, placeOfVault (absorbs both repositoryOfVault names), listRepositories, checkoutOfVault, vaultDirectory, readServers, setServer, passServers, languageServerSetup and workspaceShape, plus the machine foundation's names, at most 29 in all; its interface-width ceiling falls to 29
- [ ] #2 workspaceShape is the package's one keyed getter, with exactly the keys repositoryListing, checkoutChoice, languageServers, vaultOrigin and configurableLanguage; isVaultLayout, registryPath, RepoRegistryError, chosenCheckouts, chooseKnownCheckout and gitCheckoutOfVault are private, and the new outcome types are not exported
- [ ] #3 None of the five registry-filtering sites filters the registry any more; listRegistry() never throws and returns the registry path and the sorted, distinct, existing holder strings, and the server reads the path once
- [ ] #4 vaultIn(directory) takes no interpretation parameter; the direct-vault check is vaultIn(checkoutOfVault(real)) === real, workbench keeps its relative refusal and label fallback sentences, and checkoutNamedBy keeps its isDirectory(held) branch
- [ ] #5 checkoutsReadFrom computes eagerly and returns own; flow rendering is timed before and after, and if the registry's stats cost measurably, checkouts become lazy behind own
- [ ] #6 Every CLI sentence, the 404 CHECKOUT_UNKNOWN and 422 CHECKOUT_UNUSABLE refusals and the ADR 0049 rule (the chosen checkout of each identity, with the vault's own checkout in its place) are unchanged, with tests at workspace's operations replacing the callers' filtering tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->
