---
id: TASK-500.14.04
title: The other packages expose a few curated interfaces
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 09:18'
updated_date: '2026-10-19 11:09'
labels: []
dependencies:
  - TASK-500.14.03
parent_task_id: TASK-500.14
ordinal: 883000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
codex-app-server 17, workspace 10, code-binding 9, process 6, diagnostics 4, timing 2 subpaths. Apply the same rule as board: a public file curates only the names outside code imports, merges subpaths that are one capability, and keeps the rest private. Ask Codex to propose the grouping for each package from its importers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bun run check passes
- [x] #2 codex-app-server (17 subpaths), workspace (10), code-binding (9) and process (6) each expose a few curated api files (about 7, 8, 3 and 4), with the grouping and names from the Codex advice in /tmp/archboard-da2a77cb0-review-advice.md, and docs/agents/boundaries.md lists each package interface; timing and diagnostics keep their current small interfaces and need no api folder
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Per package, one commit each, in this order: codex-app-server, workspace, code-binding, process. Use the exact grouping, names and value/type split in /tmp/archboard-da2a77cb0-review-advice.md (Codex advice, checked against the importers at da2a77cb0). Same method as board: src/<area>/api/<name>.ts curated re-export files, package.json exports point only into api (process keeps git-owner as a direct executable export and documents the exception), a name no outside file imports stays private, outside importers rewritten by (old subpath, name) with a definition/alias/type check, tests may only use public names.
2. workspace: give the registry repositoryOfVault an explicit public alias, because the server projection defines a different function with the same name; update every importer accordingly.
3. Extend tests/system/repository-policy/package-api.test.ts: ADOPTERS covers each adopted package and area, with an explicit exemption list (process git-owner).
4. For each package: fresh-process load of every export, import orders, no value cycle, browser trace (shared files only), docs/agents/boundaries.md paragraph updated. bun run check at the end of each package.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
codex-app-server (17 to 7), workspace (10 to 8), code-binding (9 to 3) and process (6 to 4) expose curated api files (names per file from the Codex advice, matched by the scan). 435 importer files were rewritten by script with a per-binding definition, alias and type check (1,357 bindings audited independently by Codex). timing and diagnostics keep their small interfaces. workspace exports the registry repositoryOfVault as registeredRepositoryOfVault and the duplicate VAULT_DIRECTORY has one definition. process keeps git-owner as a direct executable export with a named exemption. Codex found that six system fixtures mocked the private executable.ts by path; they now use the public package path through one helper, and a new guard test refuses a private package path in tests, scripts and src. bun run check passed twice plus the fixture follow-up (system, repository and browser lanes), and the opt-in topology test passes.
<!-- SECTION:FINAL_SUMMARY:END -->
