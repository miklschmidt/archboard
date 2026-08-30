---
id: TASK-143.01.17
title: Freeze authored Codex instructions and dynamic-tool manifests
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 22:19'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - docs/design/codex-workbench-authored-contracts.md
  - tests/system/repository-policy/codex-authored-contracts.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 247000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the human-reviewed, byte-exact source contract for capabilities, login policy, thread profiles, workhorse/coordinator instructions, additionalContext, realtime handoff, spoken classifier input, and all dynamic-tool catalogues. Luna workers may load/hash/validate/dispatch; they may not author or reinterpret these bytes. Delegation profile: gpt-5.6-sol, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The document freezes literal InitializeCapabilities, all-six login policy plus refused Bedrock setup, top-level source set, workhorse/coordinator ThreadStartParams profiles, exact settings field mapping, session port list, twelve timing values, role instructions, separator, additionalContext, and realtime start choices/default voice.
- [x] #2 Literal eager namespace manifests freeze ordered tools/descriptions/strict schemas/limits/results/refusals/approval mapping, exact target-state table, and create/fork/send/list/read/wait RPC bodies, pages, projections, and partial outcomes.
- [x] #3 The document distinguishes UserInput turn/start and turn/steer bodies from developer-role thread/inject_items, and freezes complete TurnStartParams, TurnSteerParams, and ThreadForkParams included fields and omissions.
- [x] #4 resolve_spoken_approval arms only from one matching final user item after the effect prompt; exact classifier bytes and child/thread/turn/call/manifest/session/item/sequence/effect/expiry validation supply the sole approval identity.
- [x] #5 A repository-policy owner parses every literal JSON block with duplicate-key rejection, checks the reviewed byte digests consumed by TASK-143.01.07, TASK-143.05.03, and TASK-143.07.07, and fails on prose/manifest drift until human re-review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit the authored-contract source against ADR-0019, the delivery map, and the reviewed design research; preserve human authorship rather than deriving policy from implementation.
2. Freeze the literal initialization/login/thread/session/timing/instruction/additional-context/realtime contracts and every eager dynamic-tool manifest, including exact ordered JSON bodies, projections, target-state rules, and partial outcomes.
3. Freeze the distinct turn/start, turn/steer, thread/inject_items, fork, spoken-approval classifier, and complete identity-validation contracts with explicit fields and omissions.
4. Add a repository-policy owner that rejects duplicate JSON keys, parses every literal block, pins reviewed byte digests for downstream consumers, and fails actionably on prose or manifest drift; run focused, repository, type/lint/format, and diff/status gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD ac86591: exact scoped ready leaves are TASK-143.01.13 and TASK-143.01.17. They are path-disjoint. Worker slots 3 and 4 are intentionally unused because no additional TASK-143/TASK-144 leaf is ready; the other ready scoped entries are parent containers and every remaining leaf is dependency-blocked. TASK-141 and TASK-142 are unrelated CI-restoration bugs outside this implementation scope.

Implementation commit 81ee8f3cba1e192cd41baee1c6db3de0eff2ef6f freezes the authored contract without changing product runtime. The document now makes all 23 JSON fences independently strict and keeps compact wire envelopes formatter-stable. The new repository-policy owner rejects nested duplicate keys, proves all 11 tools in three namespaces remain eager, closed, and ordered, and pins the complete prose plus workhorse, coordinator, classifier, and namespace SHA-256 bytes for TASK-143.01.07, TASK-143.05.03, and TASK-143.07.07. Acceptance audit found all five criteria represented: 20 AC1 anchors, 15 AC2 anchors, 7 AC3 anchors, 9 AC4 anchors, 12 timing constants, and 34 session methods. Validation passed: focused owner 3 tests/10 expectations; inventory 39/69; boundaries plus module scope 17/87; complete repository policy 121/373; bun run lint; bun run fmt:check; bun run type-check; git diff --check. Scope is exactly the authored document, policy owner, and this task record; no runtime, package, lock, CI, lifecycle field, acceptance checkbox, assignment, dependency, or final summary changed.

Review remediation commit 9458e7536035a6bf01f7b2675e0309a76799006f corrects only the separator-boundary prose and policy proof. The approved literal remains LF + --- ARCHBOARD COORDINATOR ROLE --- + LF. The workhorse terminal LF plus separator leading LF now explicitly create exactly one blank line before the marker, with no other whitespace. Only the complete-document digest changed, from f3ddea1bf74854c9d7fac02ed363b7ca487f11c3ea07470e4fb01b1b2e94edec to fc68d907adc9f0ab1403a25b28da3e51064e7978f66ec71bb4e4a4009cf42b8b. Stable byte proofs: workhorse 257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6; separator e64743b591f47a59eea6118686fc5b9f0bcca3e2d4e6af2dd8acfe55fe97653a; coordinator extension c187f85f75515bf07091904f96fee503080f23ce84afb606674e040c80e2d87b; composition de6b52ca41c65ea73cdf24e2ecaf9fa0c1c2ea68178119c252f266f8ac90b61c. The focused owner passes 4 tests/18 expectations and attacks removal or addition of the workhorse terminal LF, separator leading LF, and separator trailing LF. Inventory passes 39/69; boundaries plus module scope pass 17/87; lint, format, and both TypeScript projects pass. The first complete repository run immediately after a separate inventory run had one cleanup-observation failure because a named fake agent-browser process outlived five seconds; the process was gone at inspection, no source or test changed, and the settled complete rerun passed 122 tests/381 expectations. Scope remains the authored document, policy owner, and this task record. Status, acceptance criteria, assignment, dependencies, and final summary remain unchanged.

Parent integration validation at 7860d04: independent fixed-range rereview returned REVIEW_CLEAN after regenerating the exact Codex 0.151.0 protocol (820 files), reconciling every authored literal and all 23 strict JSON blocks, independently verifying all fixed digests, and exercising nine original mutation copies plus six hardcoded separator-newline attacks. Integrated checks passed: focused contract owner 4 tests/18 expectations; inventory, boundaries, and module-scope owners 56/156; complete repository lane 122/381; both TypeScript projects; Oxlint; Oxfmt on 516 files; git diff --check; clean status.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Froze the human-reviewed Codex workbench source contract for initialization, login, thread profiles, instructions, timing, context, realtime, tool manifests, RPC bodies, and spoken approvals. Added a fail-closed repository-policy owner for all 23 strict JSON blocks, nested duplicate keys, fixed downstream-consumer digests, manifest/prose drift, and the exact one-blank-line coordinator boundary. Verified by exact Codex 0.151.0 regeneration, independent review-clean audit, 15 mutation families, 122 repository-policy tests, type-check, lint, formatting, and clean diff/status.
<!-- SECTION:FINAL_SUMMARY:END -->
