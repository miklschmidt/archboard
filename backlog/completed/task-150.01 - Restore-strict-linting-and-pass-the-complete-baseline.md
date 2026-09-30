---
id: TASK-150.01
title: Enforce the approved UI analysis policy
status: Done
assignee: []
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 14:27'
labels: []
dependencies: []
references:
  - TASK-150
  - TASK-143.08.01
  - 'https://oxc.rs/docs/guide/usage/linter/type-aware'
parent_task_id: TASK-150
priority: high
type: task
ordinal: 291000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The UI rebuild needs predictable checks chosen by its maintainer. Preserve the established quarantine and completed corrections while limiting new lint adoption to src/ui. The user-selected rule policy supersedes the earlier full-catalogue and repository-wide baseline requirements. Remaining adoption outside the UI is tracked in TASK-151. Strict compiler safety and the existing archive, vendor and shadcn contracts remain. No browser execution in this milestone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The ordinary lint gate retains the pre-task non-UI policy and applies the approved stricter rules only to src/ui, with errors for the selected categories and rules.
- [x] #2 Classic complexity is 6, max-lines is 600 physical lines, local UI imports use @/ aliases, and Archboard module boundaries remain enforced.
- [x] #3 JSDoc uses flat/recommended-typescript plus require-description, with concise function-purpose, parameter and return descriptions and no duplicated TypeScript types.
- [x] #4 UI uses the existing repository TypeScript project. All lint/fix entrypoints guard project resolution, compiler safety is retained, and non-UI adoption is deferred to TASK-151.
- [x] #5 The remaining UI baseline passes before fresh construction. Preserve existing corrections and user-deleted tests; no tooling-test or repository-policy expansion. Complete rendered verification remains TASK-150.06.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved lint policy (already written)
Canonical configuration: src/ui/.oxlintrc.jsonc; repository baseline: .oxlintrc.jsonc; all lint/fix entrypoints use scripts/lint.ts.
- Keep Archboard rules. Enable correctness, suspicious and perf at error. Leave style, pedantic, restriction and the overall nursery category off.
- Enable these nursery rules at error: import/named; import/export; eslint/no-restricted-exports with defaultFrom, direct, named, namedFrom and namespaceFrom all true; promise/no-return-in-finally; typescript/no-unnecessary-condition; eslint/no-unreachable-loop; unicorn/no-useless-iterator-to-array; typescript/prefer-optional-chain.
- Classic cyclomatic complexity is 6; max-lines is 600 physical lines including comments and blanks. Local UI imports use @/ aliases and retain module boundaries. UI source is TypeScript only.
- Plugins: eslint, typescript, unicorn, react, react-perf, import, jsdoc, jsx-a11y and promise.
- JSDoc uses flat/recommended-typescript plus require-description at error: concise function-purpose, parameter and return descriptions, without duplicate TypeScript types. Keep native jsdoc names where supported; jsdoc-extra supplies missing upstream rules. Require documentation on named functions, arrows, function expressions and methods.
- Keep noPropertyAccessFromIndexSignature. There is no separate UI TypeScript project. Keep the existing frontend compiler configuration for its browser entrypoints.
- New strict adoption outside src/ui is deferred to TASK-151; preserve previous corrections and the pre-task non-UI lint policy. Existing non-UI JavaScript tooling and generated declarations remain in that deferred adoption scope.

1. Complete the approved UI lint baseline. TASK-150.01.
TASK-150.01.01 has established the local ignored legacy reference and analysis configuration. Preserve that result and the user's deleted tests; do not recreate quarantine or repository-policy test machinery.
TASK-150.01.02 repairs the remaining five retained UI files under the approved rules. Keep all previous non-UI corrections but do not resume repository-wide style or strict-rule adoption. The previous runtime, engine/server and system/script repair leaves are deferred to TASK-151 and do not block UI construction.
Use the existing ordinary lint and compiler commands sequentially. Fix real UI diagnostics at their owning contracts, without broad suppressions, forwarding-only decomposition or changes to required I/O order. Do not repeat whole-repository autofix experiments. Do not add tests that duplicate lint configuration or exercise upstream linter rules.
After the approved UI lint baseline and existing compiler checks pass, proceed to TASK-150.02. Full product/browser verification waits for TASK-150.06; configuration being written is not equivalent to a passing product.

Current execution constraints: preserve all completed corrections and the user's test deletions. Do not restore deleted tests or add repository-policy suites, configuration snapshots, dependency/version mirrors, tests of upstream tooling, or tests of test helpers. Use the existing lint/compiler commands and meaningful existing product checks. New strict lint adoption is limited to src/ui; remaining non-UI adoption is TASK-151. UI uses the existing root TypeScript project; do not create src/ui/tsconfig.json. Run analysis sequentially and keep the repository project guard on all lint/fix paths. No callbacks to previous tasks, fixed agent assignments, or extra interim review loops.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved additional statement-level suppressions only for demonstrated false positives or required behavior with no clearer compliant implementation. Each needs a concrete local explanation and final-review assessment. No broad disables, migration-effort exemptions or file-size exceptions. AC 2 includes this policy.

Phase release 2026-09-05: TASK-150.01.01 reports IMPLEMENTED at e6ee549be6511994682ec5f745dd0f3db6cff0ad with ordinary analysis diagnostics, exact source/archive coverage, 130 repository and 9 retained behavior checks passing, formatting passing, and zero archive bytes committed. This satisfies enforcement/quarantine readiness only. Release TASK-150.01.02 active-source repair; fresh UI and independent review remain blocked. Formal terminal statuses stay pending final review per the accepted execution policy.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
bun run lint runs lint:repository (retained non-UI policy) then lint:ui (approved src/ui policy, type-aware, complexity 6, max-lines 600, @/ imports, JSDoc preset) through scripts/lint.ts's project guard; both exit 0 at a7fef61d with both compilers green. Rendered verification remains TASK-150.06.
<!-- SECTION:FINAL_SUMMARY:END -->
