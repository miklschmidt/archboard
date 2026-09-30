---
id: TASK-143.06.05
title: Remove the legacy injection CLI and public contract
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 16:29'
updated_date: '2026-09-01 17:16'
labels: []
dependencies:
  - TASK-143.06.04
modified_files:
  - docs/design/cli-command-audit.json
  - src/cli/command-contract/tests/schemas.test.ts
  - src/cli/commands/inject.ts
  - src/cli/commands/run.ts
  - src/runtime/engine/canvas-client.ts
  - tests/system/cli/command-contract-artifacts.test.ts
  - tests/system/cli/command-contract-audit.test.ts
  - tests/system/cli/command-workflows.test.ts
  - tests/system/cli/fixtures/fixed-base-compatibility.json
  - tests/system/cli/package-board-commands.test.ts
  - tests/system/cli/package-fixed-base-compatibility.test.ts
  - tests/system/cli/package-help-argv.test.ts
  - tests/system/cli/support/cli-http-double.ts
  - tests/system/cli/support/install-fixture.ts
  - tests/system/cli/support/package-cli.ts
  - tests/system/cli/support/repository-fixture.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 250000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the inject command/help/schemas/client calls and fixed compatibility entries after the server surface is gone. This task owns the public CLI seam only. Delegation profile: gpt-daybreak-blue-latest, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Help/dispatch no longer exposes inject status/test or ARCHBOARD_INJECT guidance, and canvas-client exports no injection DTO/request.
- [x] #2 CLI schemas, docs/design/cli-command-audit.json, and fixed contracts remove exactly the retired inject status/test entries while preserving stable ordering and behavior for every remaining command.
- [x] #3 The old command follows the ordinary unknown-command path with migration text pointing to the linked workbench, not a compatibility transport.
- [x] #4 All named CLI system owners, support fixtures, and tests/system/cli/command-contract-audit.test.ts assertions are atomically updated; live-registry comparison and fixed-base tests pass without an injection fixture, hidden alias, dead schema, or second HTTP route.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the inject command family from the canonical CLI registry and delete its implementation, while keeping a retired-name hint inside the ordinary unknown-command branch that directs users to the linked Codex workbench and performs no request.
2. Remove the legacy injection fields and requests from canvas-client plus injection-only Zod coverage and CLI HTTP/environment fixtures.
3. Remove the three inject paths, help digest, ordered compatibility case, audit entries, and injection-specific contract assertions without changing the order or bytes of remaining command contracts.
4. Add package-level proof that inject status/test both exit through the unknown-command path, name the linked workbench migration, and make no HTTP contact.
5. Run focused module and CLI system owners, live registry/fixed-base checks, type, lint, format, repository inventory, and diff checks sequentially in named transient user scopes capped at 6 GiB memory and 1 GiB swap; audit protected files and commit the task-owned range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation ready for independent review on fixed base da8569c91dd8f910dc038893e8382380e11117c8. Removed the inject registry family, implementation, public schemas, canvas-client DTO and requests, change-feed injection field, CLI HTTP routes, and CLI environment fixtures. The ordinary unknown-command branch now gives inject invocations one migration sentence directing users to the linked Codex workbench; package proof covers status and test tails, exit 2, empty stdout, exact stderr, and zero HTTP contacts.

The canonical audit now records 35 commands, 23 subcommands, and 58 paths. Fixed compatibility removes exactly inject, inject status, inject test, the inject help digest, and the inject ordered case. A structural comparison against the fixed base proved every remaining audit and compatibility byte-equivalent after those removals. Generated artifact hashes and the released registry count were updated from the same 58-route registry.

Green capped evidence, each in a named transient user scope with the exact checkout as working directory, MemoryMax=6G, and MemorySwapMax=1G: module schema owner 3 tests and 22 assertions; focused CLI contract/package owners 31 tests and 1,419 assertions; generated contract artifacts 4 tests; released registry count 1 test; test inventory 39 tests and 69 assertions; boundary scope Result=success; both TypeScript projects; Oxlint; Oxfmt; and git diff --check. Exact audit and fixed-contract comparisons produced no diff. The protected artifact remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.

The complete CLI directory reached 70 passing tests before three failures. Two task-owned stale expectations were then corrected and passed: deterministic artifact hashes and the 58-route count. The remaining failure is outside this leaf: install-source-policy rejects src/runtime/codex-coordinator-callbacks/tests/__snapshots__/encoding.test.ts.snap, which is already tracked at the fixed base. A later combined artifact/workflow rerun also hit two existing 5-second workflow subprocess timeouts after the artifact owner passed; those same workflow tests passed in the complete CLI run, and the changed count passed alone. No test, lint, type, inventory, boundary, browser, or CI rule was weakened. Current documentation, process-contract cleanup, injection timings, and the app-server-control module remain assigned to TASK-143.06.08, TASK-143.06.06, TASK-143.06.07, and TASK-143.06.03.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the public inject command family, help and environment guidance, injection schemas, canvas-client DTO and requests, CLI HTTP fixtures, and fixed compatibility entries. Retired invocations now exit through the ordinary unknown-command path, direct users to the linked Codex workbench, and make no HTTP request. Focused module and CLI owners, generated contract artifacts, the 58-route registry, inventory, boundaries, both TypeScript projects, Oxlint, Oxfmt, fixed-base structural comparisons, and independent fixed-range review passed.
<!-- SECTION:FINAL_SUMMARY:END -->
