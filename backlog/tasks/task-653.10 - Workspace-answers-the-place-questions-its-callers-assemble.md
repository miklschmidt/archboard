---
id: TASK-653.10
title: Workspace answers the place questions its callers assemble
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T22:11:00Z'
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
- [x] #1 workspace exports repoRootOf, repoIdentityAt, inspectCheckout (absorbs checkoutHead), listRegistry, declareDirectory, forgetDirectory, checkoutOf, chooseCheckout, checkoutsReadFrom, findVault (absorbs findAndRegisterVault), vaultIn, placeOfVault (absorbs both repositoryOfVault names), listRepositories, checkoutOfVault, vaultDirectory, readServers, setServer, passServers, languageServerSetup and workspaceShape, plus the machine foundation's names, at most 29 in all; its interface-width ceiling falls to 29
- [x] #2 workspaceShape is the package's one keyed getter, with exactly the keys repositoryListing, checkoutChoice, languageServers, vaultOrigin and configurableLanguage; isVaultLayout, registryPath, RepoRegistryError, chosenCheckouts, chooseKnownCheckout and gitCheckoutOfVault are private, and the new outcome types are not exported
- [x] #3 None of the five registry-filtering sites filters the registry any more; listRegistry() never throws and returns the registry path and the sorted, distinct, existing holder strings, and the server reads the path once
- [x] #4 vaultIn(directory) takes no interpretation parameter; the direct-vault check is vaultIn(checkoutOfVault(real)) === real, workbench keeps its relative refusal and label fallback sentences, and checkoutNamedBy keeps its isDirectory(held) branch
- [x] #5 checkoutsReadFrom computes eagerly and returns own; flow rendering is timed before and after, and if the registry's stats cost measurably, checkouts become lazy behind own
- [x] #6 Every CLI sentence, the 404 CHECKOUT_UNKNOWN and 422 CHECKOUT_UNUSABLE refusals and the ADR 0049 rule (the chosen checkout of each identity, with the vault's own checkout in its place) are unchanged, with tests at workspace's operations replacing the callers' filtering tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Branch deepen/653-10-workspace from deepen/module-depth 6da242f9ef (still its head).

Interface (29 = 20 + machine 7 + types BoundVault, RepositoryEntry). ./checkouts: repoRootOf, repoIdentityAt, inspectCheckout (reads the head as checkoutHead did: symbolic-ref, rev-parse --verify), listRegistry ({ path, checkouts, vaults, unchosen, holders }, never throws), declareDirectory (Declared & { registry } | { kind: refused, message }), forgetDirectory, checkoutOf (chosen | unchosen roots | unknown chosenRepositories), chooseCheckout(repository, root) (chosen changed/replaced | unknown | gone | no-vault, checked and written under the registry lock), checkoutsReadFrom(vault | null) ({ checkouts, own? { identity, root } }, eager), readServers, setServer(scope, language, server, { root?, cwd }) (written | outside-checkout absolute), passServers. ./vault: findVault(search, { register? }) ({ ok, found, registered?, unregistered? }; findAndRegisterVault stays its private half, so the Vault address binding holds), vaultIn(directory), placeOfVault (adds chosen), checkoutOfVault, vaultDirectory. ./repository-listing: listRepositories. ./shapes (replaces ./repositories and ./languages): workspaceShape(repositoryListing | checkoutChoice | languageServers | vaultOrigin | configurableLanguage). ./language-server-setup unchanged. Private: isVaultLayout, registryPath, chosenCheckouts and chooseKnownCheckout (gone), gitCheckoutOfVault, the registry's repositoryOfVault; RepoRegistryError deleted; new outcome types unexported. New private file runtime/services/checkout-questions.ts holds checkoutOf, chooseCheckout, checkoutsReadFrom.

Sites. CLI language-server.ts (checkoutOf; stored-path rule now in setServer, sentence kept in the CLI), repo.ts (checkoutOf for the receipt line; registry path from the declare outcome and listRegistry().path), server repository-routes.ts (chooseCheckout; 400/404/422 bodies unchanged), code-binding vault-checkout.ts deleted (snapshot uses workspace's checkoutsReadFrom and inspectCheckout), CLI bound-vaults.ts (listRegistry().holders + vaultIn), sixth site touched.ts/canonical.ts/source-refs.ts (own), flow-routes.ts and checkout-files.ts (own.identity), workbench archboard-checkouts.ts (vaultIn, keeps the isDirectory(held) branch), server-requests vault.ts (vaultIn(checkoutOfVault(real)) === real, relative refusal unchanged), wiring.ts label (placeOfVault(vault).repository ?? basename), pane-show-route.ts (placeOfVault + chooseCheckout), registry-follow.ts reads the registry path once per watch (reset on unwatch).

Tests. New workspace tests/runtime/services/checkout-questions.test.ts: the ADR 0049 cases moved from code-binding vault-checkout.test.ts (deleted) plus git-sync.test.ts (deleted; Git killed at rev-parse or remote reads the chosen checkouts alone), own, a registered own entry's fields, checkoutOf's three answers, chooseCheckout's four. repo-registry.test.ts: path and holders, refusals as outcomes. language-servers.test.ts: the path rule (moved from the CLI's usage cases, which stay as CLI words). code-binding chosen-checkout and batch-resolution use checkoutOf / checkoutsReadFrom.

Flow rendering (754-entry machine registry, artifacts/653-10/flow-measurement.md): vaultIdentity 2.94 ms vs checkoutsReadFrom(vault).own 5.99 ms (listRegistry 1.06 ms of it); GET /api/architecture/render median 509/521 ms before, 492/495 ms after. Not measurable against the render, so checkouts stay eager.

Ceilings: workspace 40 -> 29, code-binding 18 -> 16. Code check: workspace 38 -> 27 names, logic 1039 -> 1107, only INTERFACE_WIDE (clears at TASK-653.15); code-binding 11 -> 9 functions.

Outside the slice: code-opener named-path.ts, code-intel languages.ts and code-check.ts (workspaceShape), CLI embed-vaults.ts, embeds-check.ts, prerequisites.ts (placeOfVault), schemas.ts (vaultOrigin), addressed-vault.ts and pane.ts (findVault), workbench pane-socket.ts and panes-report.ts (import path), web and tests/system type imports (./shapes), code-intel fixture, skills none. Vault unchanged: Vault checkouts (klNuMiwC) binds the deleted vault-checkout.ts; anchors name removed symbols (chooseKnownCheckout, chosenCheckouts, isVaultLayout, refuseUnknownCheckout, statedChoice, repositoryOfVault, vaultIdentity, findVault in vault-address.ts); these are code check warnings for the architecture slice.

Footprint gate: exit 1, 18 modules changed outside the draft (Model catalogue, Repository queries, Shell, Code opener, Vault finder, Addressed vault, Code files route, Vault address, Repositories, Vault checkouts, Language server files, workspace, code-binding, code-intel, Prerequisites, Embeds check, Model reading, Contract definition); unbound: three tests/system browser files and interface-width-ceilings.json.

Verified: build, types, lint:all, format:check, test:modules 5357 pass, test:repository 182, test:system 228, test:solo 15, browser lane 50 owners: 49 pass, opener-settings timed out once under load and passed twice alone with --focus.

Merged into deepen/module-depth. Footprint gate: exit 1 with recorded exceptions (proposal commit 9fb2c417fb), listed in the merge commit. Unbound: this ticket, shell-layout.test.ts, missing-server.ts, navigator-support.ts, interface-width-ceilings.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Workspace answers the registry and vault questions its callers used to assemble: checkoutOf, chooseCheckout, checkoutsReadFrom (the ADR 0049 rule, moved from code-binding, with the vault's own checkout as own), listRegistry with path and holders, vaultIn, placeOfVault with chosen, findVault with register, inspectCheckout reading the head, setServer with the stored-path rule, and workspaceShape as its one keyed getter. No caller filters the registry any more. Width 40 -> 29 (ceiling 29), code-binding 18 -> 16; code check names 38 -> 27, INTERFACE_WIDE stays until TASK-653.15. CLI sentences, HTTP bodies and statuses, and the ADR 0049 order are unchanged. Flow rendering: ~3 ms more per render on a 754-entry registry, not measurable against a ~500 ms render, so checkouts stay eager. Verified: build, types, lint:all, format:check, test:modules, test:repository, test:system, test:solo, browser lane. Follow-up for the orchestrator: the footprint gate exits 1 (18 modules outside the draft) and the vault still binds the deleted vault-checkout.ts and names removed symbols in anchors.
<!-- SECTION:FINAL_SUMMARY:END -->
