---
id: TASK-143.01.13
title: Register Codex protocol conformance in root checks
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 22:43'
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
  - src/runtime/codex-protocol/index.ts
  - src/runtime/codex-protocol/tests/method-inventory.test.ts
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
- [x] #1 package.json and bun.lock pin @openai/codex exactly 0.151.0 with frozen-install success; ranges, alternate generators, and a globally newer binary do not alter the contract.
- [x] #2 The conformance owner locates the pinned binary, verifies version 0.151.0, generates experimental TypeScript into a fresh temp directory, compares the digest/API inventory to the checked decoder contract, and leaves git status unchanged.
- [x] #3 Root check scripts run the conformance owner through the existing repository suite without committing generated files or creating a second build path.
- [x] #4 Wrong/missing binary, generation failure, changed experimental type/method, decoder gap, or checkout mutation produces an actionable failure naming regeneration and review steps.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the integrated codex-protocol conformance helper and existing repository-policy/root-check ownership without changing its authored decoder contract.
2. Pin @openai/codex exactly 0.151.0 in package.json and bun.lock, prove frozen installation, and resolve the project-local executable rather than PATH or a global binary.
3. Add the repository-policy conformance owner that runs exact experimental generation in a disposable directory, verifies version/file count/digest/API inventory, keeps the checkout unchanged, and emits actionable regeneration/review failures.
4. Register the owner through the existing repository suite and root check path only, then run focused negative/positive owners, frozen install, type/lint/format, repository/module gates, and git diff/status checks.

5. Close the response coverage gap with an explicitly authored 0.151.0 ClientRequest exclusion inventory, exact used-plus-excluded accounting, disjointness/order/drift checks, and independent challenge fixtures.

6. Move all root executable resolution behind the unified actionable boundary, inject stable paths into synthetic cases, and cover resolver throws, escapes, mutation, and primary failure combinations.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD ac86591: exact scoped ready leaves are TASK-143.01.13 and TASK-143.01.17. They are path-disjoint. Worker slots 3 and 4 are intentionally unused because no additional TASK-143/TASK-144 leaf is ready; the other ready scoped entries are parent containers and every remaining leaf is dependency-blocked. TASK-141 and TASK-142 are unrelated CI-restoration bugs outside this implementation scope.

Implemented in commit 5e64171. Added exact @openai/codex 0.151.0 dev dependency and lock entries, plus the repository-policy owner that resolves the project-local executable, runs the disposable generator through runCodexProtocolConformance, verifies the recorded 820-file digest and version, snapshots checkout status, and reports regeneration plus decoder/inventory review recovery.

Validation: bun install --frozen-lockfile passed; focused root owner 3 pass / 14 expect; production conformance 10 pass / 36 expect; repository lane 121 pass / 377 expect; module lane passed; bun run type-check, bun run lint, bun run fmt:check, and git diff --check passed.

Remediation commit 6d582cd: derived response/client-notification/server-request/server-notification method inventories once from the generated temp tree; compared authored decoder coverage with exact sets for the non-superset directions and the known currentTime/read response alias; added fail-first missing-generated and missing-authored decoder regressions for every direction. Hardened the root owner to resolve/run/status through one boundary, always capture post-status in finally, preserve the primary generation failure, and report checkout mutation separately with pinned-binary regeneration plus decoder/generated-inventory review recovery.

Remediation validation: bun test --isolate src/runtime/codex-protocol/tests/conformance.test.ts tests/system/repository-policy/codex-protocol-conformance.test.ts passed 25 tests / 96 expect; bun run test:repository passed 125 tests / 391 expect; bun run test:modules passed 1001 tests / 7007 expect; bun run type-check, bun run lint, bun run fmt:check, git diff --check, and bun install --frozen-lockfile passed. Real project-local Codex 0.151.0 generation matched 820 files and the pinned digest.

Remediation commit 9bbfabe: the pinned Codex 0.151.0 ClientRequest tree has 157 generated methods, partitioned into 32 supported response methods plus the explicit currentTime/read ServerRequest response alias and 125 reviewed exclusions. Production conformance now requires the generated ClientRequest set to equal the 32 supported methods plus the exact fixed exclusion inventory, checks duplicate-free/disjoint/stable metadata, exact exhaustiveness, and verifies currentTime/read separately in ServerRequest. Independent challenge probes delete thread/start or currentTime/read from both response and decoder inventories, add/remove/drift/overlap/duplicate/reorder exclusions, and all fail. Root resolution has no direct package lookup outside the unified boundary; synthetic tests inject stable in-checkout paths and cover resolver throw/escape, post-status, mutation, and combined generation failure evidence.

Final validation: focused conformance/root/inventory owners passed 35 tests / 129 expect; bun run test:repository passed 126 tests / 397 expect; bun run test:modules passed 1010 tests / 7034 expect; bun run type-check, bun run lint, bun run fmt:check, git diff --check, and bun install --frozen-lockfile passed. Real project-local Codex 0.151.0 generation matched 820 files and the pinned digest. Task remains In Progress with acceptance criteria unchecked.

Parent integration validation at c304185: third complete fixed-range rereview returned REVIEW_CLEAN after independently proving the 157-method ClientRequest partition (32 supported, one currentTime/read ServerRequest response alias, 125 explicit exclusions), exact 81/11/1 generated method inventories in the other directions, all resolver/mutation failure states, and project-local PATH isolation. Integrated checks passed: frozen install; focused conformance/root/inventory owners 35 tests/129 expectations; exact local codex-cli 0.151.0 generation with 820 files and digest cdd893570801b36e404a20e7842c71312abc6bc716960ddaa53dde92bfa6f273; full module lane 1010/7034; repository lane 130/415; both TypeScript projects; Oxlint; Oxfmt on 519 files; git diff --check; clean status.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned @openai/codex exactly at 0.151.0 and registered one fail-closed protocol conformance owner through the existing repository/root lane. The disposable generator now verifies version, 820-file digest, union inventories, exact method coverage—including 32 used ClientRequest responses, one reverse-response alias, and 125 reviewed exclusions—and checkout cleanliness with unified actionable recovery for resolution, generation, decoder drift, and mutation failures. Verified by independent review-clean audit, exact local generation, 35 focused tests, 1,010 module tests, 130 repository-policy tests, frozen install, type-check, lint, formatting, and clean diff/status.
<!-- SECTION:FINAL_SUMMARY:END -->
