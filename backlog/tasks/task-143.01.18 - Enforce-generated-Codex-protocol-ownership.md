---
id: TASK-143.01.18
title: Enforce generated Codex protocol ownership
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 23:51'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.12
  - TASK-143.01.13
references:
  - docs/agents/boundaries.md
modified_files:
  - tests/system/repository-policy/codex-protocol-boundary.test.ts
  - tests/system/repository-policy/support/module-scope-analysis.ts
  - tests/system/repository-policy/support/codex-aliases.ts
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
<!-- SECTION:NOTES:END -->
