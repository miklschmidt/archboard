---
id: TASK-500.04
title: 'Vault, checkout and state-directory lookup are the workspace package'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 01:59'
updated_date: '2026-10-19 02:53'
labels: []
dependencies:
  - TASK-500.03
parent_task_id: TASK-500
ordinal: 869000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
workspace is layer 2 of docs/design/package-map.md: shared/repositories, shared/language-servers, and from runtime/engine the vault-finder, repo-registry, git and its lib files, state-dir, source-checkout, atomic-write and module-paths, plus server/archboard/lib/repositories. atomic-write stays public because the repository registry and the code opener also use it. shared/language-servers imports node:path and the canvas reaches it through shared/code-check, so the package needs a browser subpath with no Node import.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/workspace holds the listed sources in role folders with an exports interface that includes atomic-write, and every importer uses @archboard/workspace
- [x] #2 A browser subpath of workspace holds no node: import, and the canvas imports only that subpath
- [x] #3 The tests of the moved code live in packages/workspace/tests
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Codemod first (outside the repo, /tmp/pm/move-package.ts): rewrite only import-like positions (import/export from, import(), mock.module, vi.mock, vi.doMock, import.meta.resolve) and REPORT every other string literal that resolves to a moved file, plus every new URL(..., import.meta.url). Advice from the process review.
2. packages/workspace, same shape as timing, diagnostics, process. Depends only on timing, diagnostics, process. Sources: shared/repositories, shared/language-servers, engine/vault-finder, repo-registry, lib/registry-file, git, lib/git-command, git-failure, git-output, state-dir, source-checkout, atomic-write, server/archboard/lib/repositories. Roles: shared/schemas (repositories, language-servers), runtime/store (atomic-write, registry-file, repo-registry), runtime/clients (git and its lib files), runtime/services (vault-finder, state-dir, source-checkout), server/projections (the repositories listing).
3. module-paths.ts stays in server/archboard: it derives the checkout root from its own depth, which is a server host fact. Remove it from the workspace row of docs/design/package-map.md.
4. source-checkout.ts finds the checkout root from its own depth (new URL("../../..")). After the move the depth is different, so give it an explicit, tested derivation of the real checkout root (the repository that holds packages/, not the package).
5. Browser safety: shared/code-check imports shared/language-servers, which imports node:path. Give the package a browser subpath with no node: import for what the canvas uses (find with a grep and a bundle check), and keep the Node-dependent command validation on another subpath. Prove with a check that no browser-reachable file reaches a node: import through workspace.
6. exports: the minimum used outside, including ./atomic-write. Move the tests of the moved files into packages/workspace/tests. If a moved file imports a file that stays in src/, stop and report it instead of working around it.
7. Rewrite importers, read the diff, hand-fix the reported strings and the census fixture string in tests/system/process-contracts/codex-workbench-crash-replacement.test.ts. Update docs/agents/boundaries.md. bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved 13 sources and 4 tests into packages/workspace (bcf744b6d). shared/language-servers split: shared/schemas/configurable-languages.ts (browser safe, export ./configurable-languages) and runtime/store/language-servers.ts (node:path command validation, ./language-servers). SOURCE_CHECKOUT walks up to the nearest archboard checkout instead of counting depth; a test pins it. Browser safety traced with a throwaway import-graph script (0 node imports reachable from frontend/main.tsx and src/ui) and bun run build:frontend. Vault bindings in .archboard/vault still name the old paths.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/workspace holds the vault, registry, checkout, state-dir, atomic-write and git code behind ten exports, in shared/schemas, runtime/store, runtime/clients, runtime/services and server/projections. shared/language-servers is split: configurable-languages is browser-safe and language-servers is Node-only. SOURCE_CHECKOUT now walks up to the nearest archboard checkout instead of counting directory depth, and a test pins it. module-paths stays in server/archboard (a server host fact). Browser safety was traced twice, by me and independently by Codex: 801 and 802 reachable files, no node: import. bun run check passes. Codex review of bcf744b6d found no defects. Left for a later task: the .archboard/vault boards still bind the old paths.
<!-- SECTION:FINAL_SUMMARY:END -->
