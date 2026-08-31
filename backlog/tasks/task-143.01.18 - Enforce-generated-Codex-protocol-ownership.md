---
id: TASK-143.01.18
title: Enforce generated Codex protocol ownership
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-31 02:23'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.12
  - TASK-143.01.13
references:
  - docs/agents/boundaries.md
modified_files:
  - package.json
  - docs/design/codex-protocol-fingerprint-corpus.md
  - scripts/codex-protocol-fingerprints.ts
  - scripts/check-codex-protocol-fingerprint-corpus.ts
  - scripts/typescript-analysis.ts
  - tests/system/repository-policy/codex-protocol-boundary.test.ts
  - tests/system/repository-policy/codex-protocol-aliases.test.ts
  - tests/system/repository-policy/codex-protocol-fingerprint-corpus.test.ts
  - tests/system/repository-policy/support/codex-protocol-aliases.ts
  - >-
    tests/system/repository-policy/support/codex-protocol-fingerprint-corpus.json
  - tests/system/repository-policy/support/codex-protocol-imports.ts
  - tests/system/repository-policy/support/codex-protocol-mirrors.ts
  - tests/system/repository-policy/support/codex-protocol-paths.ts
  - tests/system/repository-policy/support/codex-protocol-sources.ts
  - tests/system/repository-policy/support/codex-protocol-fixtures.ts
  - tests/system/repository-policy/support/module-scope-analysis.ts
  - tests/system/repository-policy/fixtures/codex-protocol/v2/Thread.ts.txt
  - tests/system/repository-policy/fixtures/codex-protocol/ThreadId.ts.txt
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one repository-policy rule that makes generated Codex 0.151.0 bindings reachable only through the codex-protocol entrypoint. It prevents consumers from coupling to generated layout or bypassing runtime decoders. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generated files may exist only in the ignored codex-protocol generated directory and may be imported only by the codex-protocol adapter.
- [ ] #2 Runtime, server, UI, scripts, and tests outside the conformance owner fail with an actionable path when they deep-import or commit a generated binding.
- [ ] #3 The policy permits the temp-directory generator/compare owner and fixtures without permitting a second generated tree or a handwritten mirror.
- [ ] #4 The test is registered in the existing repository inventory and fails on the pre-policy forbidden fixture.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the generated protocol ignore rules, codex-protocol public boundary, exact conformance owner, repository inventory, and existing boundary policies without changing production decoders or generation behavior.
2. Add one repository-policy owner that permits generated bindings only beneath the ignored codex-protocol/generated directory and permits access only from the adapter/conformance owners with explicit reasons.
3. Add deterministic forbidden fixtures for committed generated output, generated trees elsewhere, external deep imports, handwritten mirrors, and test/script/UI/server bypasses while retaining the one disposable generator/compare path.
4. Register through the existing repository lane and run focused positive/negative probes, repository/module gates, both TypeScript projects, lint, format, diff, and clean-status checks.

5. Extend semantic fingerprinting with imported and transparent local type aliases, then mine the pinned 820-file corpus for indistinguishable small-shape collisions and add unrelated controls.
6. Add one deterministic pinned-generator path that regenerates every fingerprint and compares the complete corpus content, documenting why the reviewed corpus remains tracked.
7. Run focused owners, the full repository/module/type/lint/format/diff gates, the exact generator comparison, and audit the fixed BASE-to-HEAD scope before rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD 7023de7: exact newly ready scoped leaves are TASK-143.01.18 and TASK-144.01. They are path-disjoint: one repository-policy owner versus the serialized package/lock seam. TASK-143.01.16 remains an active timing remediation and TASK-143.01.07 is in read-only review, so three leaf-worker slots are occupied after dispatch. Slot 4 is intentionally unused because no other TASK-143/TASK-144 leaf is ready; other scoped entries are parent containers or dependency-blocked, and TASK-141/TASK-142 are unrelated CI-restoration bugs.

Implemented in commit 90949925b5801c02efc30cf5446c3929db220fce. Added the single owned policy owner at tests/system/repository-policy/codex-protocol-boundary.test.ts. It recognizes the exact ts-rs Codex binding header, requires the canonical ignored src/runtime/codex-protocol/generated/ directory, allows only the public codex-protocol adapter and generated peer imports, and checks tracked output plus static import forms.

Validation: focused owner passed 6 tests / 32 expectations; relevant boundary, inventory, and conformance owners passed 56 tests / 179 expectations; bun run test:repository passed 136 tests / 452 expectations; codex-protocol and codex-realtime module owners passed 549 tests / 3512 expectations; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed.

Mutation evidence: the pre-policy src/server/codex-session.ts deep-import fixture fails with a pathful deep-import finding and adapter recovery; the negative matrix produced 9 findings covering committed generated output, an alternate generated tree, two handwritten mirrors, and runtime/server/UI/scripts/tests bypasses. The positive adapter and temporary conformance fixtures produced zero findings.

Scope audit: f7a5d0224f414f96c618ea5c23ce8cb64a996794..90949925b5801c02efc30cf5446c3929db220fce contains exactly one added file, with no diff-check errors. Final code status was clean before this Backlog note update.

Remediation in commit aa08e42 after reviewer findings: replaced the handwritten import tokenizer with the repository TypeScript AST parser (static/export/import-type/require/import-equals/dynamic import, including no-substitution templates), added relative/root/absolute/file-URL mutation coverage, pinned the exact Codex 0.151.0 generated path inventory at 820 entries with SHA-256 1b25740f89a30fd39632e584b6bfa0d0c9171f6795d33151e5cf3381532d38fb, recognized generated peer Thread and indirect aliases while retaining an unrelated ClientRequest negative control, and scanned git-tracked source entries with lstat rejection for file and directory symlinks. The owner is 482 lines.

Remediation validation: focused owner passed 8 tests / 22 expectations; bun run test:repository passed 138 tests / 437 expectations; codex-protocol and codex-realtime module owners passed 549 tests / 3512 expectations; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed. The working tree contains only the owned policy path before this Backlog note update; no pre-existing untracked artifact was present.

Second remediation in commit 7a00d8f after the reviewer’s computed-import, alias, inventory, and mirror findings: module specifier extraction now preserves binary-plus and template-expression patterns; configured aliases are loaded from package imports, both tsconfig path maps, and the authoritative Vite config when present, with no hardcoded alias table. Added independent binary, template, and semantic #codex-generated/* mutations. The exact 820-entry Codex 0.151.0 inventory remains pinned with SHA-256 1b25740f89a30fd39632e584b6bfa0d0c9171f6795d33151e5cf3381532d38fb; a canonical FutureCodexType.ts header fixture now fails with actionable regeneration/version guidance. Mirror detection covers alternate protocol-mirror/v2/Thread.ts direct and indirect aliases while retaining the unrelated same-name ClientRequest negative control.

Second-remediation validation: focused owner passed 10 tests / 24 expectations; bun run test:repository passed 140 tests / 439 expectations; codex-protocol and codex-realtime module owners passed 549 tests / 3512 expectations; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed. Policy owner is 494 physical lines; support helpers are 465 and 70 lines.

Second-remediation scope: policy owner plus existing repository-policy module support and the new named repository-policy alias support module; no production paths changed.

Third remediation in commit 675efe0 after the reviewer’s authority, wrapper, fingerprint, and line-cap findings: Codex-specific module-specifier, alias, path, and mirror logic now lives in named codex-protocol-boundary support modules; module-scope-analysis.ts retains only shared AST/module analysis. Transparent-expression unwrapping covers parenthesized, as, type-assertion, satisfies, non-null, and partially-emitted wrappers while leaving unknown ordinary import(token) unresolved.

Alias support preserves separate package, root-tsconfig, frontend-tsconfig, and Vite authorities. TypeScript aliases come from the TypeScript API so JSONC comments, trailing commas, extends, baseUrl, every fallback target, and root-vs-frontend context are retained. Package conditional arrays/objects are conservatively expanded; matching uses exact/longest-prefix semantics. Vite object and ordered array aliases, string prefix matching, RegExp find entries, replacements, and ordering are covered. Ambiguous/configuration-load failures produce actionable fail-closed findings.

Mirror support derives normalized AST-kind fingerprints from canonical generated files carrying the exact pinned header and inventory path, ignoring names/comments/formatting; exact and near renamed structural mirrors fail across arbitrary paths while partial, same-name, and ordinary controls remain allowed. The exact 820-entry inventory and SHA-256 1b25740f89a30fd39632e584b6bfa0d0c9171f6795d33151e5cf3381532d38fb proof, unknown generated path failure, symlink coverage, literal/import forms, and prior mutations remain intact.

Third-remediation validation: focused owner plus alias probes passed 11 tests / 37 expectations; bun run test:repository passed 141 tests / 452 expectations; codex-protocol and codex-realtime module owners passed 549 tests / 3512 expectations; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed. Policy owner is 477 physical lines; every changed TypeScript support/test file is below 500 lines.

Third-remediation scope: repository-policy owner/support/tests only; no production changes. The prior support/codex-aliases.ts was replaced by cohesive codex-protocol support modules.

Fourth remediation in commit 092adc5 after reviewer findings: the ownership owner now consumes a checked-in authoritative semantic fingerprint corpus for the exact Codex 0.151.0 generated inventory (820 entries, inventory SHA-256 1b25740f89a30fd39632e584b6bfa0d0c9171f6795d33151e5cf3381532d38fb). The corpus is independent of ignored generated output, so a clean checkout still rejects a real renamed v2/Thread.ts mirror. Fingerprints preserve semantic identifiers, property names, non-module literals, numeric literals, and structure while ignoring only cosmetic declaration and module names; a real ThreadId.ts control proves an unrelated primitive alias is not a false positive.

Fourth-remediation validation: focused boundary plus alias probes passed 12 tests / 41 expectations; bun run test:repository passed 142 tests / 456 expectations; bun run test:modules passed 1010 tests / 7034 expectations; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed. The policy owner is exactly 500 physical lines and every changed TypeScript file remains within the repository cap.

Fourth-remediation scope: repository-policy owner/support plus the intentional authoritative fingerprint corpus and two real generated-shape fixtures; no production changes. Remaining maintenance risk is explicit: a future Codex protocol version requires regenerating and reviewing the corpus and exact inventory together.

Further remediation in commit 05c9c44 after the same reviewer findings: semantic fingerprinting now canonicalizes type-only imported aliases (including imported-as-local names) and transparent local type aliases before matching, with both real v2/Thread.ts clean-checkout mutations covered. The 820-file corpus was mined for 39 exact collision groups; only the 706 corpus-unique fingerprints are ownership evidence, so common indistinguishable shapes are not rejected. Added simple Failure and compound FailureDetails unrelated controls while preserving distinctive real Thread rejection.

The tracked corpus is now machine-reproducible through the single canonical scripts/codex-protocol-fingerprints.ts implementation. `bun run generate:codex-protocol-fingerprint-corpus` invokes the pinned project-local @openai/codex 0.151.0 binary, runs app-server generate-ts --experimental into a temporary directory, checks the 820-file tree digest, computes all fingerprints, and writes the exact formatted corpus. `bun run check:codex-protocol-fingerprint-corpus` performs the same generation and compares complete JSON bytes. A repository-policy test corrupts an otherwise unused token and proves the checker fails. The tracked corpus remains justified because ignored generated output is absent in a clean checkout and policy scans need a fast local reference; the gate prevents silent drift.

Further-remediation validation: focused boundary, alias, and corpus owners passed 16 tests / 48 expectations; bun run test:repository passed 146 tests / 463 expectations; bun run test:modules passed 1010 tests / 7034 expectations; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed; bun run check:codex-protocol-fingerprint-corpus passed for all 820 generated fingerprints. Policy owner is exactly 500 lines and every changed TypeScript file remains below 500 lines. No production files changed.

Further-remediation scope: package script and design note for the reproducible corpus command; scripts/codex-protocol-fingerprints.ts and scripts/check-codex-protocol-fingerprint-corpus.ts; repository-policy boundary/corpus tests; named source/mirror support; and the existing generated-shape fixtures/corpus. The task remains In Progress for same-reviewer rereview.

Further remediation in commit dfc9f94 after the same reviewer findings: one canonical alias representation now handles named type aliases, namespace imports with qualified references, inline ImportTypeNode aliases, and parenthesized type references. Real v2/Thread.ts probes cover one imported alias and all nine generated imports under namespace and ImportTypeNode spellings; each remains rejected as a mirror after the Thread declaration is renamed.

The checked-in distinctive corpus is now the sole mirror reference. Locally present ignored generated files are still checked for canonical path, header, inventory, and tracking rules, but their fingerprints are never merged into matcher references. A generated-tree-present common-shape control proves a local generated Failure shape cannot broaden mirror detection. The neutral scripts/typescript-analysis.ts helper owns parseModuleSources and is imported by both generic module-scope analysis and Codex corpus generation; module-scope analysis no longer depends on Codex-specific generation code.

Further-remediation validation: focused boundary/alias/corpus owners passed 17 tests / 49 expectations; bun run test:repository passed 147 tests / 466 expectations; bun run test:modules passed 1010 tests / 7034 expectations; bun run type-check passed both TypeScript projects; bun run lint, bun run fmt:check, and git diff --check passed; bun run check:codex-protocol-fingerprint-corpus regenerated and verified all 820 fingerprints. The boundary owner is 497 lines and every changed TypeScript file remains below 500 lines. No production files changed.

Further-remediation scope: scripts/typescript-analysis.ts, canonical fingerprint and checker updates, repository-policy alias/fixture/source support, corpus regeneration, and boundary controls. The task remains In Progress for same-reviewer rereview.

Narrow P2 remediation in commit 8785021 after reviewer finding: namespaceImportMirror now emits import type * as declarations and replaces identifiers only after removing imports through a trivia-aware pass that preserves module specifiers, comments, and strings; importTypeMirror uses the same safe pass. Added a direct TypeScript API oracle with a relative ../AbsolutePathBuf import, asserting the original specifier is retained and syntactic/semantic diagnostics are empty. Focused boundary/alias/corpus suite passed 18 tests / 54 expectations; bun run check:codex-protocol-fingerprint-corpus passed all 820 fingerprints; bun run type-check, bun run lint, bun run fmt:check, and git diff --check passed. Per durable OOM rule, repository-wide, module, system, check, and browser lanes were not rerun; root owns those broad gates. Task remains In Progress for rereview.

Final reviewer P2 remediation in commit 04f4033: replaced raw named-import regex discovery with the TypeScript scanner, records actual token spans, and replaces only those declaration spans. Added controls for import-shaped comments, single-quoted strings, and template strings covering both namespaceImportMirror and importTypeMirror; duplicate importType aliases are asserted absent and both transformed fixtures compile with zero diagnostics. Focused boundary/alias/corpus suite passed 18 tests / 62 expectations; bun run check:codex-protocol-fingerprint-corpus verified all 820 fingerprints; bun run type-check, bun run lint, bun run fmt:check, and git diff --check passed. Per durable OOM rule, broad repository/module/system/check/browser lanes were not rerun; root owns them. Task remains In Progress with ACs unchecked.
<!-- SECTION:NOTES:END -->
