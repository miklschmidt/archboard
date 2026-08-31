---
id: TASK-143.01.17
title: Freeze authored Codex instructions and dynamic-tool manifests
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-31 00:44'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - docs/design/codex-workbench-authored-contracts.md
  - tests/system/repository-policy/codex-authored-contracts.test.ts
  - tests/system/repository-policy/codex-additional-context-contract.test.ts
  - tests/system/repository-policy/support/codex-additional-context-policy.ts
  - tests/system/repository-policy/support/codex-additional-context-mutations.ts
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
1. Replace the duplicated exactRows key-set checks with validateOrderedValues(label, actualKeys, expectedKeys), keeping the per-row exactObject loop unchanged.
2. Prove diagnostic and mutation behavior is byte-for-byte stable with focused contract owners and the requested repository, type, lint, format, and diff gates.
3. Record the one-file remediation through Backlog CLI, commit it conventionally, preserve every contract, digest, and runtime byte, and send the required parent re-review callback.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD ac86591: exact scoped ready leaves are TASK-143.01.13 and TASK-143.01.17. They are path-disjoint. Worker slots 3 and 4 are intentionally unused because no additional TASK-143/TASK-144 leaf is ready; the other ready scoped entries are parent containers and every remaining leaf is dependency-blocked. TASK-141 and TASK-142 are unrelated CI-restoration bugs outside this implementation scope.

Implementation commit 81ee8f3cba1e192cd41baee1c6db3de0eff2ef6f freezes the authored contract without changing product runtime. The document now makes all 23 JSON fences independently strict and keeps compact wire envelopes formatter-stable. The new repository-policy owner rejects nested duplicate keys, proves all 11 tools in three namespaces remain eager, closed, and ordered, and pins the complete prose plus workhorse, coordinator, classifier, and namespace SHA-256 bytes for TASK-143.01.07, TASK-143.05.03, and TASK-143.07.07. Acceptance audit found all five criteria represented: 20 AC1 anchors, 15 AC2 anchors, 7 AC3 anchors, 9 AC4 anchors, 12 timing constants, and 34 session methods. Validation passed: focused owner 3 tests/10 expectations; inventory 39/69; boundaries plus module scope 17/87; complete repository policy 121/373; bun run lint; bun run fmt:check; bun run type-check; git diff --check. Scope is exactly the authored document, policy owner, and this task record; no runtime, package, lock, CI, lifecycle field, acceptance checkbox, assignment, dependency, or final summary changed.

Review remediation commit 9458e7536035a6bf01f7b2675e0309a76799006f corrects only the separator-boundary prose and policy proof. The approved literal remains LF + --- ARCHBOARD COORDINATOR ROLE --- + LF. The workhorse terminal LF plus separator leading LF now explicitly create exactly one blank line before the marker, with no other whitespace. Only the complete-document digest changed, from f3ddea1bf74854c9d7fac02ed363b7ca487f11c3ea07470e4fb01b1b2e94edec to fc68d907adc9f0ab1403a25b28da3e51064e7978f66ec71bb4e4a4009cf42b8b. Stable byte proofs: workhorse 257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6; separator e64743b591f47a59eea6118686fc5b9f0bcca3e2d4e6af2dd8acfe55fe97653a; coordinator extension c187f85f75515bf07091904f96fee503080f23ce84afb606674e040c80e2d87b; composition de6b52ca41c65ea73cdf24e2ecaf9fa0c1c2ea68178119c252f266f8ac90b61c. The focused owner passes 4 tests/18 expectations and attacks removal or addition of the workhorse terminal LF, separator leading LF, and separator trailing LF. Inventory passes 39/69; boundaries plus module scope pass 17/87; lint, format, and both TypeScript projects pass. The first complete repository run immediately after a separate inventory run had one cleanup-observation failure because a named fake agent-browser process outlived five seconds; the process was gone at inspection, no source or test changed, and the settled complete rerun passed 122 tests/381 expectations. Scope remains the authored document, policy owner, and this task record. Status, acceptance criteria, assignment, dependencies, and final summary remain unchanged.

Parent integration validation at 7860d04: independent fixed-range rereview returned REVIEW_CLEAN after regenerating the exact Codex 0.151.0 protocol (820 files), reconciling every authored literal and all 23 strict JSON blocks, independently verifying all fixed digests, and exercising nine original mutation copies plus six hardcoded separator-newline attacks. Integrated checks passed: focused contract owner 4 tests/18 expectations; inventory, boundaries, and module-scope owners 56/156; complete repository lane 122/381; both TypeScript projects; Oxlint; Oxfmt on 516 files; git diff --check; clean status.

Contract remediation started from exact checkout HEAD 5a1ab9588a5f860cc8812ec68a7193ce3f55f921; prior reviewed contract head 9458e7536035a6bf01f7b2675e0309a76799006f is an ancestor, and the intervening commits change only this task record. The authored decision is backed by local Codex source commit 94cbbddafc1776d5e377bca1b05932c697e82238: app-server-protocol/src/protocol/v2/turn.rs lines 32-37, 152-176, and 273-301 define terminal statuses, turn/start additionalContext, turn/steer additionalContext, the expected-turn precondition, and the existing-turn response; thread_data.rs lines 202-258 define thread status, source, and nullable direct-input capability; thread.rs lines 1475-1488, 1520-1529, and 1610-1627 define source families and the independent paginated persisted/loaded result sets. Parent review also reconciled the exact generated @openai/codex 0.151 schemas and installed desktop 26.825.51511 with bundled codex-cli 0.151.0-alpha.7.2. These paths and versions are review evidence, not product dependencies.

The contract now freezes the 15 ordered thread-link reasons, seven product operation kinds, turn/start and turn/steer RPC domain, tuple nullability and monotonic delivery transitions, exact producer mapping, exclusions, and separation from protocol/TUI/callback state. The repository-policy owner checks domains and order and independently mutates precedence, enum closure, nullability, all-or-none correlation, rpc field order/domain, and lifecycle transitions. Focused owner passes 5 tests and 26 expectations; targeted Oxfmt check and git diff --check pass.

Remediation commit 8e5ebecb16faffa14742f62bef81ca24419306bf closes the placeholder contract without runtime changes. Canonical complete-document SHA-256 is 47aab2b91a53e74f6afac4d80eec022c2097650ab752cd16fc96d7f3f50726a0; the operation-lifecycle section is independently pinned at a7215e1b2cd25eea22788f42c4324e25d575ef9b2684f9bab520b41cb8256dc1. Workhorse, separator, coordinator extension/composition, classifier, and all three manifest digests remain unchanged.

Final implementation validation: focused authored-contract owner 5 tests/26 expectations; inventory, boundaries, and module-scope owners 56/156; settled complete repository lane 123/389; both TypeScript projects; Oxlint; Oxfmt over 516 files; git diff --check. The first complete repository attempt after the line-limit refactor observed fake agent-browser PID 2855895 beyond the five-second cleanup window and failed 122/1; inspection found the process and namespace gone without intervention or source changes, and the one settled rerun passed 123/389. The 541-line first draft correctly failed Oxlint max-lines; the policy was compacted to 491 lines without changing or waiving the rule. Scope audit before commit showed exactly the authored document, repository-policy owner, and this task record. No runtime, package, lock, sibling task, CI, generated protocol, acceptance checkbox, final summary, push, merge, or rebase changed. The protected src-DlBR1tzg.js path was absent in this worktree. TASK-143.01.17 remains In Progress for parent-owned independent review and finalization.

Structural re-review remediation replaced the duplicated thread-link, producer, tuple, transition, terminal, and exclusion prose with one strict JSON policy manifest. A fixed typed validator now compares exact structured rows and reports missing, extra, duplicate, reordered, and changed values. The mutation owner independently deletes every reason, producer, transition, and lifecycle evidence row; contradicts every producer RPC, operation-id source, and omission; mutates every tuple outcome; exercises transition and evidence reorder/duplication; rejects unknown reasons/producers and illegal downgrades; rejects premature or incomplete clear, repeated terminal emission, retry and both recency-inference paths; rejects classification failures promoted into stable reasons; and preserves promptless-fork, queued-delegate, nested initial-turn ID, nullability, systemError, and exclusion contracts.

The owner was split without waivers: general authored-contract owner 362 lines, additional-context owner 244 lines, typed support 401 lines. Focused owners pass 11 tests/120 expectations. Targeted inventory/boundary/code-target/module-scope owners pass 58/166. Both TypeScript projects, Oxlint, Oxfmt over 518 files, and git diff --check pass. The first complete repository lane passed all contract owners but hit the known five-second fake agent-browser cleanup boundary with PID 3052921 (128 pass, 1 fail); immediate inspection found the PID and namespace already gone without intervention, and the settled rerun passed 129/129 with 483 expectations. Reviewed SHA-256 values are f6623b8539d6d92a056ec375618c7667ba50f490f39f17662ab471ce985bbacf for the complete contract and 18f7facf1ced6da33fdd7338635ffb052a6929e4bcc7509534aace9e114099be for the strict additional-context manifest.

Structural remediation commit c6b7ced19de1b61a56b02c030bcda6e389d390c6 is based on fixed review base 5a1ab9588a5f860cc8812ec68a7193ce3f55f921. It changes only this task record, the authored contract, the general authored-contract owner, and the new additional-context owner/support. No runtime, package, lock, CI, generated protocol, sibling task, acceptance checkbox, final summary, push, merge, or rebase changed; protected src-DlBR1tzg.js remains absent. TASK-143.01.17 stays In Progress for parent-owned independent re-review and finalization.

Second structural remediation reconciled Codex source 94cbbddafc1776d5e377bca1b05932c697e82238. app-server-protocol/src/protocol/v2/turn.rs lines 300-302 prove TurnSteerResponse returns the existing turnId; lines 505-508 prove TurnCompletedNotification carries threadId plus the terminal Turn and no originating RPC. The manifest now gives turn/started only turn/start, the steer response only turn/steer, and every completed/interrupted/failed terminal row the ordered RPC set turn/start then turn/steer. Terminal evidence exposes either retained tuple once, preserves delivered through interruption or failure, then clears id, kind, rpc, and outcome.

Canonical enforcement now pins schema 1, all root fields in order, exact threadLink and operation fields, the operation id placeholder, every union, and every state/reason pairing. The state domain is derived in order from reasonNullStates plus reasonRequiredStates. Fixed row validation names exact missing, extra, duplicate, reordered, field, set-member, and value drift. A separate typed mutation harness keeps owners below the 500-line gate without waivers: general owner 362 lines, additional-context owner 424, fixed policy support 480, mutation support 143.

Exhaustive focused validation passes 11 tests and 780 expectations. It attacks every closed object field list, row collection, row field list, tuple id/kind/rpc/outcome member, union, ordered set, producer mapping, terminal RPC set, lifecycle outcome, clear field, retry path, recency path, classification-failure promotion, promptless fork, queued delegate, and nested initial-turn operation id. Each terminal row independently rejects removal of turn/steer, unknown RPCs, reorder, and duplication; turn/started independently rejects turn/steer. Targeted inventory/boundary/code-target/module-scope passes 58/166. Complete repository passes 129/1143. Both TypeScript projects, Oxlint, Oxfmt over 519 files, and git diff --check pass.

Reviewed SHA-256 values are 2fd0a5a9ea1b526bd05c514eb69cca6bf744edfe88c2792d6180dbb8a05b7036 for the complete contract and 4a74b68c5be278a53fe8bc6de40833b12d91cbb3c124dde0949116ce0eaa2119 for the additional-context manifest. Unrelated reviewed bytes remain identical: workhorse 257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6; separator e64743b591f47a59eea6118686fc5b9f0bcca3e2d4e6af2dd8acfe55fe97653a; coordinator extension c187f85f75515bf07091904f96fee503080f23ce84afb606674e040c80e2d87b; composition de6b52ca41c65ea73cdf24e2ecaf9fa0c1c2ea68178119c252f266f8ac90b61c; classifier 215bd565500a9188f5e8f0d920a078113937f36296535054c56d7f12d74d1c6f; archboard_app df0fc2b1b33d985a7b84e54431162d6c00a3da0f8cecd98a18730e55bc7b272e; archboard_workhorse fe8dd9bfaf91b37cbae31136ccdfc4eb1106728b40d2bc3ea01036606d6f748f; archboard_voice 792d6ec96edc2fbffc8400ce0d1304a56662bee5436e95914505cb848356c393.

Second structural remediation commit e8347d546e3459ffb553c6386a18f43e9f5a5374 is based on fixed review base 5a1ab9588a5f860cc8812ec68a7193ce3f55f921. Its scope is this task record, the authored contract, the two contract owners, fixed policy support, and the typed mutation harness. No runtime, package, lock, CI, generated protocol, sibling task, acceptance checkbox, final summary, push, merge, or rebase changed. Protected src-DlBR1tzg.js remains absent. TASK-143.01.17 stays In Progress for parent-owned independent re-review and finalization.

Final maintainability remediation replaces the duplicate, missing, extra, and reorder loops inside exactRows with validateOrderedValues(label, actualKeys, expectedKeys). The ordered exactObject loop remains unchanged. No authored contract, manifest, fixed row, digest, mutation owner, or production byte changed. The fixed policy support drops from 480 to 468 lines without a waiver. Validation passes: focused contract owners 11 tests and 780 expectations with the same exact diagnostics; targeted inventory, boundaries, code-target, and module-scope owners 58/166; both TypeScript graphs; Oxlint; Oxfmt over 519 files; git diff --check. Protected src-DlBR1tzg.js remains absent.

Parent amendment integration at 902f298: replacement independent reviewer returned REVIEW_CLEAN for the complete source-backed contract range. The integrated contract pins turn/start versus turn/steer terminal evidence, schema 1, exact ordered root/threadLink/operation fields, closed unions, state/reason nullability, producer and evidence RPC sets, retry/recency/clear behavior, and the exhaustive mutation matrix. Parent validation passed: focused authored-contract owners 11 tests/780 expectations; complete repository lane 137 tests/1177 expectations; modules 1042/7632; both TypeScript graphs; Oxlint; Oxfmt on 528 files; frontend build; git diff/status clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Froze the complete human-reviewed Codex workbench authored contract, including source-backed turn/start and turn/steer terminal evidence, exact additional-context schema and lifecycle rules, instructions, timing, tool manifests, RPC bodies, and spoken approval identity. Fail-closed repository owners enforce exact bytes, ordered closed structures, duplicates, nullability, producer/evidence mappings, clearing, retry, recency, and exhaustive mutations. The amended fixed range is independently review-clean and passed 780 focused expectations, 137 repository-policy tests, 1042 module tests, type-check, lint, formatting, and frontend build.
<!-- SECTION:FINAL_SUMMARY:END -->
