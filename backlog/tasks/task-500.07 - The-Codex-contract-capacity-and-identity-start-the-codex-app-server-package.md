---
id: TASK-500.07
title: 'The Codex contract, capacity and identity start the codex-app-server package'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 03:14'
updated_date: '2026-10-19 03:14'
labels: []
dependencies:
  - TASK-500.05
parent_task_id: TASK-500
ordinal: 872000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
codex-app-server is layer 5 of docs/design/package-map.md: one private app-server session over stdio. Its shared files come first because the browser uses them: shared/codex-app-server-contract (the authored wrapper plus the generated tree, ignored by git), shared/codex-app-server-capacity, shared/codex-workbench-identity (253 importers). The generated contract has a path that scripts/generate-codex-app-server-contract.ts, .gitignore, both oxlint configurations, the formatter exclusions, the postinstall hook and package.json scripts all name. A fresh clone must still generate it before lint and type checking, and the generator assumes its root exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/codex-app-server holds the contract wrapper, the capacity constants and the workbench identity in shared/ role folders with an exports interface, and every importer uses @archboard/codex-app-server
- [ ] #2 The generated contract is written under the package. scripts/generate-codex-app-server-contract.ts, .gitignore, the oxlint and formatter exclusions, postinstall, ensure:codex-contract and the lint and type-check chain name the new path, and a fresh clone with no generated output runs bun install and bun run check
- [ ] #3 The browser reaches only subpaths that hold no node: import, and the opt-in capacity test paths in package.json point at the new location
- [ ] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/codex-app-server, same shape as the other five. Depends only on lower packages (timing, diagnostics, process, workspace, code-binding). No @/ import.
2. Shared files: shared/codex-app-server-contract/index.ts (authored wrapper) -> shared/protocol/, shared/codex-app-server-capacity -> shared/constants/, shared/codex-workbench-identity (index.ts + lib) -> shared/schemas/ and shared/rules/ by content. Browser-used subpaths hold no node: import (trace with /tmp/pm/browser-trace.ts).
3. The generated tree moves with the generator: scripts/generate-codex-app-server-contract.ts writes under packages/codex-app-server/src/shared/protocol/generated (create its parent directories), .gitignore, .oxlintrc.jsonc, .oxlintrc.tests.jsonc, the fmt and fmt:check exclusions in package.json, skills/archboard-dev/SKILL.md and docs name the new path. The generated types stay private to the wrapper and type-only. Keep the versioned directories, the atomic current switch and --ensure.
4. package.json scripts: test:modules and test:opt-in:capacity name the new capacity test path. postinstall order stays: contract first, then skill artifacts.
5. Prove a fresh clone: in a new empty directory under /tmp, git clone this worktree, run bun install, bun run ensure:codex-contract and bun run type-check there; report. Never reuse the old generated path.
6. Move tests of moved files into packages/codex-app-server/tests. Update docs/agents/boundaries.md. bun run check.
<!-- SECTION:PLAN:END -->
