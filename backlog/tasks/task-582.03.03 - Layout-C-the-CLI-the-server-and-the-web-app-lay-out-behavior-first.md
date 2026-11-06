---
id: TASK-582.03.03
title: 'Layout C: the CLI, the server and the web app lay out behavior first'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T19:06:00Z'
updated_date: '2026-11-06T22:40:00Z'
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
<!-- SECTION:NOTES:END -->
