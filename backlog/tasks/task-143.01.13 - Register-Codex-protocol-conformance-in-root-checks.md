---
id: TASK-143.01.13
title: Register Codex protocol conformance in root checks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 22:18'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - package.json
  - bun.lock
  - tests/system/repository-policy/codex-protocol-conformance.test.ts
  - src/runtime/codex-protocol/conformance.ts
  - src/runtime/codex-protocol/generated-method-inventory.ts
  - src/runtime/codex-protocol/tests/conformance.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 240000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the serialized root dependency/check seam for @openai/codex 0.151.0 and protocol conformance. Generation always occurs in a disposable directory and compares without modifying the checkout.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json and bun.lock pin @openai/codex exactly 0.151.0 with frozen-install success; ranges, alternate generators, and a globally newer binary do not alter the contract.
- [ ] #2 The conformance owner locates the pinned binary, verifies version 0.151.0, generates experimental TypeScript into a fresh temp directory, compares the digest/API inventory to the checked decoder contract, and leaves git status unchanged.
- [ ] #3 Root check scripts run the conformance owner through the existing repository suite without committing generated files or creating a second build path.
- [ ] #4 Wrong/missing binary, generation failure, changed experimental type/method, decoder gap, or checkout mutation produces an actionable failure naming regeneration and review steps.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the integrated codex-protocol conformance helper and existing repository-policy/root-check ownership without changing its authored decoder contract.
2. Pin @openai/codex exactly 0.151.0 in package.json and bun.lock, prove frozen installation, and resolve the project-local executable rather than PATH or a global binary.
3. Add the repository-policy conformance owner that runs exact experimental generation in a disposable directory, verifies version/file count/digest/API inventory, keeps the checkout unchanged, and emits actionable regeneration/review failures.
4. Register the owner through the existing repository suite and root check path only, then run focused negative/positive owners, frozen install, type/lint/format, repository/module gates, and git diff/status checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD ac86591: exact scoped ready leaves are TASK-143.01.13 and TASK-143.01.17. They are path-disjoint. Worker slots 3 and 4 are intentionally unused because no additional TASK-143/TASK-144 leaf is ready; the other ready scoped entries are parent containers and every remaining leaf is dependency-blocked. TASK-141 and TASK-142 are unrelated CI-restoration bugs outside this implementation scope.

Implemented in commit 5e64171. Added exact @openai/codex 0.151.0 dev dependency and lock entries, plus the repository-policy owner that resolves the project-local executable, runs the disposable generator through runCodexProtocolConformance, verifies the recorded 820-file digest and version, snapshots checkout status, and reports regeneration plus decoder/inventory review recovery.

Validation: bun install --frozen-lockfile passed; focused root owner 3 pass / 14 expect; production conformance 10 pass / 36 expect; repository lane 121 pass / 377 expect; module lane passed; bun run type-check, bun run lint, bun run fmt:check, and git diff --check passed.

Remediation commit 6d582cd: derived response/client-notification/server-request/server-notification method inventories once from the generated temp tree; compared authored decoder coverage with exact sets for the non-superset directions and the known currentTime/read response alias; added fail-first missing-generated and missing-authored decoder regressions for every direction. Hardened the root owner to resolve/run/status through one boundary, always capture post-status in finally, preserve the primary generation failure, and report checkout mutation separately with pinned-binary regeneration plus decoder/generated-inventory review recovery.

Remediation validation: bun test --isolate src/runtime/codex-protocol/tests/conformance.test.ts tests/system/repository-policy/codex-protocol-conformance.test.ts passed 25 tests / 96 expect; bun run test:repository passed 125 tests / 391 expect; bun run test:modules passed 1001 tests / 7007 expect; bun run type-check, bun run lint, bun run fmt:check, git diff --check, and bun install --frozen-lockfile passed. Real project-local Codex 0.151.0 generation matched 820 files and the pinned digest.
<!-- SECTION:NOTES:END -->
