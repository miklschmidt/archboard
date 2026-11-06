---
id: TASK-582.03.03
title: 'Layout C: the CLI, the server and the web app lay out behavior first'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T19:06:00Z'
updated_date: '2026-11-06T22:50:00Z'
labels: []
dependencies:
  - TASK-582.03.02
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1031000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/cli, apps/server and apps/web hold the remaining 33 containment warnings. Plan: doc-003, steps C1 to C3, including the merge of the duplicate code-evidence modules in the server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check on this repository reports no containment warning
- [ ] #2 The duplicate modules that describe the same server code are merged as the code shows, with their flow steps retargeted
- [ ] #3 Each step is its own commit that leaves bun run check green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
C1 cli, C2 server, C3 web, one commit each, in doc-003 section 3 order:
1. Model corrections the code proves, as their own claimed intent before the move (merges of modules that describe the same code, reparents where a part's code lives in another job's folder).
2. Manifest: scripts/move-source.ts plan <app> --overrides <doc-003 section 2 overrides, adjusted to the code>; bindings in the manifest bind each container to its behavior folder.
3. apply (git mv, rewrites, restart, claimed rebind intent); fix what the codemod reports (relative imports inside a workspace, docs, comments, globs).
4. Remove the app's trees from ROLE_FIRST_TREES.
5. Verify: bunx vp run types; archboard check warnings 28 (C1) / ~19 (C2) / 0 (C3), only containment codes; git grep for the old prefixes outside backlog, docs/design, docs/adr and proposals; no binding key shared by two modules; bun run check per commit (remaining lanes one by one when it stops early). After C1, generate:cli-contract.
6. Vendored crates under crates/vendor: model each from its Cargo manifest and dependents, bound to its crate directory, with relationships from the callers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
C1 cli (3c08fc4d3). Model corrections first (one claimed intent), from the code: Entry point peyArgPx (apps/cli/src/bin.ts, a fixed entry path) joins the Agent CLI root; Command catalogue iIVu1bGE (run.ts, the command table that calls runCliWith and registryOf) joins Command routing; Bootstrap vAQwlVuz joins Command routing, departing from doc-003 (which put bootstrap in cli/contract), because its only importers are bin.ts and routing's session.ts (isHelpInvocation) and no contract code imports it; Status 2KmUovkl joins Commands (its only importer is the command table run.ts); Command startup OM6pX371 is removed, empty after these moves (only the retained-checkpoint walkthrough 'Original Command interface' names it). Manifest: 93 moves (default move plus overrides): invocation, bootstrap, package-version -> cli/routing; execution, commander, artifacts and clients/server/prerequisites.ts -> cli/contract; model, semantic/draw, vault, check, pane, staged-tokens, repo, install-skill, contract-artifacts -> cli/commands/<family>; operations/server -> commands/server-control; clients/server -> cli/server-access; clients/git -> commands/vault/embeds (its only importers are the embeds operations). Manifest bindings: Command routing -> cli/routing, Command contract -> cli/contract, Commands -> cli/commands, Server access -> cli/server-access, Embeds check -> commands/vault/embeds, Contract reference -> commands/contract-artifacts. 87 files rewritten, 197 vault statements. One claimed intent corrected the descriptions of Command routing (it named a command-routing/index.ts and lib/ that do not exist), Command contract and Commands. Hand edits: boundaries.md CLI section and route-client line, run.ts comment. Ratchet drops apps/cli/src/cli and apps/cli/tests/cli. generate:cli-contract: its outputs are ignored (docs/design/generated) and the tracked docs/design/cli-command-audit.json did not change. Evidence: archboard check 28 warnings, all CONTAINER_UNBOUND/CONTAINER_PARTS_OUTSIDE, none under apps/cli (doc-003 expected 29; Command startup is removed instead of bound); no binding key shared; git grep for the old cli prefixes outside the exclusions: nothing; types pass; bun run check exit 0, 21/21 (repository 170, modules 4908, system 234, solo 15, browser green).

C2 server (0c818d357). Model corrections first (two claimed intents), from the code. (1) Code evidence ScjxtP0G (doc-003 Q3) merged: Code findings memory SmrySjjM (code-findings-memory.ts#createCodeFindingsMemory) repeated yYQ3AHkf, which binds the same file under Code checks on request; its relationship gjUcUvHu repeated T6lWsdFm (same anchor, label) and is removed, and the 'A code check pass' step owZJ0jFY now ends on yYQ3AHkf. Code facts aqjsNyJ9 (unbound) repeated code-intel's modules: step o12fHQp9 (check.ts#createCodeFacts, defined in services/code-facts/reader.ts) now ends on Cached fact reader mR7wPSei; steps HYNarsgt and 3MWVQDbA (symbolLine, defined in operations/code-facts/symbol-line.ts) on Fact analysis 3CaBjhIM. Code check route -> Code check D9dCZCLo repeated 9g0Uli0a (same anchor createCodeCheck) and is removed. In 'A code check pass' the steps that code-check-route.ts sends now start or end on Code check route 3bPZg9a5 instead of its container Route handlers. SmrySjjM, aqjsNyJ9 and Code evidence are removed. (2) Live panes tbH9ZyCA, an unbound leaf with 19 relationships, described the code of Pane connections' parts: 14 of its relationships repeated a part's relationship with the same anchor (dHru8Ng6=PoXHqEaa, 7kWTFGGA=4Uvqzrek, pBu0Et3y and e5ud8ccd=YawQAO0P, DcOrPKY2=CJ5JwtNl, hjFA6kH4=52NUP6Ut, fpTfPg1T=AfSjx649, VkGzebtq=wH0rE1x7, ENymHNDK=yG8Hyadm, fISQ9jAX=UxINwpn6, GQKfoYtu=4fPIYyd3, k3GPy1bo=dHRkaEZq, 9yGuDXdP=2ssPZnZc, mDvMUlZO=kUKOPjAB) and are removed; Service routes -> 'how many sockets' (wzL4gP8d, clients) ends on Pane registry, which defines clients; the three calls anchored in pane-show-route.ts (57KDyakx placeOfVault, ALYb99sn chooseKnownCheckout, epRLrdt6 followRegistry) and VO9ngl7m (sendToPane, now anchored in pane-show-route.ts, ending on Pane registry) start at a new part Pane show route RZTsoQN5, bound to pane-show-route.ts, which no module bound; Pane routes -> Pane show route (showPaneRoute) and Pane show route -> Pane vaults (movePaneVault) are added. Five flows' steps move to Pane socket, Pane vaults, Pane registry and Service routes by the file each anchor names. Live panes is removed. Walkthroughs naming removed subjects read the retained checkpoint 6bc124a8, so none changed. (3) Server entry m4GMTKLW joins the Archboard server root (fixed entry path). Mutation work c5u3ETJ8 joins HTTP serving, departing from doc-003 (Architecture writes): asyncEndpoint is imported by the write routes, the read routes and the pane routes, and the application mounts its admission; its relationship W2BXIpq7 to Mutation admission (anchor mutation-work.ts#admit) now starts at Mutation work, and HTTP application -> Mutation work (mountMutationAdmission) is added. Step 66RPSzJc cites mutationAdmission.accepting like its relationship CiOgt2S3 (ANCHOR_MISMATCH otherwise). Manifest: 43 moves: lifecycle/* and services/checkout-work -> server/start-stop; wiring/{application,http} -> http/{application,listener}/wiring; middleware/mutation-work -> http/middleware; store/frontend -> http/frontend/store; routes/architecture -> http/handlers/reads/routes except model-edit-routes and portable-routes (architecture-writes/routes) and model-response.ts (http/handlers/routes, used by reads, writes and the pane show route); routes/service -> reads/routes; routes/code-check and state/code-findings -> http/handlers/code-checks; routes/repositories -> http/handlers/repositories; routes/panes, sockets/panes, sockets/architecture, sockets/frame-text.ts, state/pane-vaults -> panes/connections; state/agent-activity -> panes/announcements. Departures from doc-003: checkout-work goes to start-stop (doc-003: code-checks), because server-owners.ts, the history routes, the application and the stop all use it, and its job is letting a stop wait for machine-local work; server-owners.ts stays at server/wiring (doc-003: http/owners), because start-stop, the routes, the socket and the middleware share its owners. 33 files rewritten, 197 vault statements; the renderer fixture top-port-header-clearance.json rewritten through the manifest (18 paths). One claimed intent binds HTTP serving, Route handlers, Architecture writes, Reads and server health, Code checks on request, Start and stop, Panes and the workbench and Pane connections to their folders, and corrects two responsibilities (Architecture writes no longer tracks writes; Panes and the workbench owns no Codex child). boundaries.md server section. Ratchet drops apps/server trees. README architecture embeds redrawn (check embeds --fix, readme:assets architecture). Evidence: archboard check 19 warnings, all CONTAINER_UNBOUND/CONTAINER_PARTS_OUTSIDE under apps/web; no binding key shared; git grep for the old server prefixes: nothing outside the exclusions except 6 fixture paths of retired semantic-board routes (left as found in B); types pass; bun run check exit 0, 21/21 (repository 170, modules 4908, system 234, solo 15, browser green).
<!-- SECTION:NOTES:END -->
