---
id: TASK-436.16
title: Remove registration by observation
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:37'
updated_date: '2026-10-07 01:36'
labels:
  - cli
dependencies: []
parent_task_id: TASK-436
ordinal: 710000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`rememberRepo` in `src/runtime/engine/repo-registry.ts` has no caller, so nothing registers a checkout by observation. But `repo list` says that archboard learns checkouts as it goes, and the schema of `repo list` still has the source `observed`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Nothing in the code, the help or the documents says that archboard registers a checkout by itself, and `rememberRepo` is gone
- [x] #2 A `repos.json` that holds an observed registration still reads
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No board is affected: Command interface already describes explicit repository registration, as confirmed by the parent board owner.
2. Remove rememberRepo and rewrite registry comments and empty-list advice around repo add. Keep legacy observed entries readable and visible through repo list.
3. Make repo add produce a declared-only contract and amend the observation portion of ADR 0011, with a correction to ADR 0046 historical rationale.
4. Extend the existing legacy-registration owner only if needed, run focused repo and artifact tests, sweep claims, simplify and commit. Parent owns final acceptance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed rememberRepo and the claim that binding resolution registers checkouts. Registry comments and repo list empty-state advice now direct registration through repo add. repo add result source is declared-only, with a matching return type; repo list retains observed solely for persisted legacy entries. ADR 0011 keeps the registry decision accepted and amends its observation portion; ADR 0046 marks that premise historical. Existing legacy-registration test now also proves repo list returns the stored observed source without rewriting repos.json, and the explicit-add workflow asserts declared. Focused validation: bun test --isolate src/cli/commands/tests/repo-language-server.test.ts tests/system/cli/command-contract-artifacts.test.ts — 14 pass, 0 fail. Touched-source type-aware lint, test lint and formatting checks pass. generate:skill-artifacts succeeds; all output stays ignored. Consumer recipes and eval inputs already require repo add and contain no observation claim, so no authored skill or evaluation change is needed. Simplification pause: direct deletion with unchanged legacy read normalization avoids a migration or second registration path. Parent owns final acceptance and complete gate.

Final gate: bun run check exits 0 in 436 seconds. Modules: 4,353 passed. System: 196 passed. Repository policy: 24 passed. Serial browser: 24 passed across all nineteen lane commands. Lint, formatting, root and frontend types, and builds pass. Final runtime refresh succeeds, and dogfood check --code exits 0 with zero diagnostics and zero warnings. Simplification and focused regression evidence remain in the task notes. Complete log: /tmp/archboard-task436-final-check-2.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed automatic registration and its dead helper. Repository reads still accept legacy observed registrations. Focused repository tests and the complete gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->
