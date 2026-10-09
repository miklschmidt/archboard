---
id: TASK-436.12
title: 'Remove cliSurface, commandHelp and cliSurfaceOf'
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:37'
labels:
  - cli
dependencies: []
parent_task_id: TASK-436
ordinal: 760000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`cliSurface` and `commandHelp` in `src/cli/commands/run.ts`, and `cliSurfaceOf` in `src/cli/command-routing/lib/registry.ts`, have no caller outside each other. The tests read the command table through `cliContractRegistry`, but `docs/agents/test-suite.md` still names `cliSurface()`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The three functions are gone, and `docs/agents/test-suite.md` names what the system tests use
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use the Command dispatch@TASK-436.12 proposal prepared by the parent board owner (b1ee9682e): the existing registry part becomes Registry and exposes registryOf.
2. Delete cliSurface, commandHelp and cliSurfaceOf, their unused imports and exports; retain the command table and cliContractRegistry.
3. Correct docs/agents/test-suite.md to name cliContractRegistry.
4. Run the focused help and deterministic command-contract artifact owners, then simplify and commit this scope. Parent handles board adoption and finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed the three unused helper functions and their imports/exports. docs/agents/test-suite.md now points to cliContractRegistry. Focused validation: bun test --isolate src/cli/command-routing/tests/help.test.ts tests/system/cli/command-contract-artifacts.test.ts — 11 pass, 0 fail. Removal sweep has no remaining code/current-doc mentions outside historical board variants and Backlog. Simplification pause: the direct deletion leaves one registry projection and existing help path; no replacement abstraction is needed. Parent owns board adoption and final acceptance.

Closing footprint: base 9749e92c60aac3caf4e3a94dbfe13180b939f2dc. The proposal parent is TASK-367.27, 55d86UGv. Registry matches commit 127a57368. The containing Command routing directory is covered by Registry. Help text is named only by the removed relationship. Removing its caller does not change help.ts. The final binding correction preserves these paths and passes the code pass.

Final gate: bun run check exits 0 in 436 seconds with 4,597 passing tests, including the complete serial browser lane. Lint, formatting, root and frontend types, and builds pass. The refreshed server runs sixteen boards. The delivery code pass exits 0 with zero diagnostics and zero warnings. Complete gate log: /tmp/archboard-task436-final-check-2.log. Delivery evidence: /tmp/archboard-task436-delivery-code.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed cliSurface, commandHelp and cliSurfaceOf. Test documentation names cliContractRegistry. Focused command contract tests and the full gate pass. The Command dispatch proposal is adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
