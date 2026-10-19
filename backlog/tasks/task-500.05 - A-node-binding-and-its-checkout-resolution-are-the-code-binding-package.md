---
id: TASK-500.05
title: A node binding and its checkout resolution are the code-binding package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 01:59'
updated_date: '2026-10-19 02:58'
labels: []
dependencies:
  - TASK-500.04
parent_task_id: TASK-500
ordinal: 870000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
code-binding is layer 3 of docs/design/package-map.md: shared/code-target and runtime/code-target. It keeps the binding, anchor and document-reference schemas, because board will import them and the resolver parses with CodeBindingSchema. After this task runtime/engine holds only the board files and the server-lifecycle files that later tasks move.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/code-binding holds shared/code-target and runtime/code-target in role folders with an exports interface, and every importer uses @archboard/code-binding
- [ ] #2 The tests of the moved code live in packages/code-binding/tests
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/code-binding, same shape as the other four. Depends only on timing, diagnostics, process, workspace. No @/ import.
2. shared/code-target (index.ts 353 lines of schemas and rules, binding-files.ts, executable.ts) goes under shared/ with role folders chosen from the file content (schemas for the binding, anchor and document-reference schemas, rules for pure functions, constants for fixed values). runtime/code-target (index.ts, diagnostics.ts, presentation.ts, lib/resolver-core.ts, lib/vault-checkout.ts) goes under runtime/ (operations for the resolver, services for vault-checkout, a role name that fits for presentation and diagnostics).
3. exports: a browser-safe subpath for what the UI imports (70 importers, prove it with /tmp/pm/browser-trace.ts: no node: import reachable from frontend or src/ui), and a Node subpath for the resolver. Minimum, by grep of outside importers. A file with no outside importer stays private.
4. Move the tests of the moved files (shared/code-target/tests/contract.test.ts, runtime/code-target/tests/*) to packages/code-binding/tests with # imports.
5. Run /tmp/pm/move-package.ts, read the diff, hand-fix reported strings and depth-dependent paths. Update docs/agents/boundaries.md. bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: packages/code-binding splits the old shared index into schemas/{code-binding,code-target-open,opener-settings} plus rules/{binding-files,opener-executable,internal-code-target-url}; the runtime index becomes operations/checkout-snapshot, resolver-core operations/binding-resolver, vault-checkout services/vault-checkout, presentation projections/code-target-link. diagnostics.ts was deleted: its one test calls resolveLocalCodeTargetsWith directly. Every file under shared/ has no Node import (browser-trace: 0 node imports reached from frontend/main.tsx and src/ui).
<!-- SECTION:NOTES:END -->
