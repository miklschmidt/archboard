---
id: TASK-143.01.03
title: Pin and decode the Codex 0.151.0 experimental protocol
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 20:28'
labels: []
dependencies:
  - TASK-143.01.12
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-protocol
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the ignored output and checked runtime decoders generated from the exact configured Codex 0.151.0 binary with experimental APIs. Every used response, error, notification, and reverse request is decoded here; no consumer imports generated files.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generation runs codex app-server generate-ts --experimental from the exact binary and records binary version plus generated-tree digest without committing derived bindings.
- [ ] #2 The adapter decodes every used initialize/account/config/thread/turn/item/queue/model/realtime/timeline response, JSON-RPC error, client notification, and server request, including optional emittedAtMs where supplied.
- [ ] #3 Raw version-decoded realtime events leave this boundary without phase or transcript interpretation; TASK-143.02.03 is the sole reducer of realtime phase and canonical transcript.
- [ ] #4 Module fixtures cover every accepted direction and fail closed on unknown union members, malformed payloads, version drift, and unsupported capabilities with the method, direction, expected version, and recovery action.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Generate the experimental TypeScript tree with the exact configured /home/msc/.cache/.bun/bin/codex 0.151.0 binary, define a reproducible sorted relative-path plus per-file SHA-256 tree digest, and record the exact version, command, file count, and digest in the tracked protocol manifest while keeping generated bindings ignored.
2. Add the public codex-protocol module boundary with closed response-method, client-notification, server-notification, JSON-RPC error, and server-request registries. Decode the reviewed initialize/account/config/thread/turn/item/queue/model/realtime/timeline payloads and preserve raw realtime wire shapes without phase or transcript reduction.
3. Add strict Zod runtime schemas for the used generated unions and nested records, including emittedAtMs, login/capability variants, thread/turn/item/timeline/realtime discriminators, approval and dynamic-tool reverse requests, and version-aware ProtocolDecodeError diagnostics naming method, direction, expected version, and recovery action.
4. Add module-owned fixtures and tests for every accepted direction and method family, positive payload preservation, unknown methods and union members, malformed payloads, wrong initialize version, unsupported capability variants, optional emittedAtMs, and the invariant that realtime decoding performs no interpretation.
5. Run exact regeneration and digest/version conformance, module tests, strict type/lint/boundary checks, git diff --check, and a complete BASE..HEAD scope audit; leave generated output ignored and do not change protected paths.

6. Replace the notification fallback with explicit schemas for every generated method, including exact closed enums/unions and intentionally open JsonValue fields, and provide positive plus missing/unknown-member fixtures for all methods.

7. Tighten the full reachable response/reverse-request graph, especially login, approval decisions, network/filesystem profiles, policy amendments, and available decisions; document only intentional openness in code comments.

8. Make JSON-RPC result/error envelopes mutually exclusive and add direct ambiguity regressions.

9. Add a module-owned conformance owner that invokes the exact configured generator into a temporary directory, verifies version/file count/tree digest, and fails actionably when prerequisites are absent.

10. Extract portable exact-generator conformance into a module-owned function that requires an explicit executable path, keeps the normal module suite deterministic, and records manual validation against the configured local binary without taking TASK-143.01.13's dependency/CI ownership.
11. Make all public JSON-RPC request, result, and error envelopes strict and mutually exclusive, with direct extra-field regressions for each boundary.
12. Add a generated-derived challenge matrix covering every union-bearing accepted notification and every closed nested union, with compile-time/runtime completeness checks and intentional JsonValue exceptions preserved.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the pinned Codex 0.151.0 experimental protocol boundary under src/runtime/codex-protocol. The exact configured binary (/home/msc/.cache/.bun/bin/codex) generated 820 ignored TypeScript files; the reproducibility manifest records SHA-256 tree digest cdd893570801b36e404a20e7842c71312abc6bc716960ddaa53dde92bfa6f273 using sorted relative POSIX paths plus per-file hashes. Added closed method registries, strict Zod decoders for responses, client/server notifications and reverse requests, JSON-RPC errors, typed timeline/item/realtime payloads, unsupported-capability recovery errors, and fixtures/tests for valid and malformed directions. Raw realtime payloads are preserved without phase/transcript interpretation.

Validation: exact generation/version/digest check passed; bun run type-check passed; bun run test:modules passed (574 tests, 0 failures); protocol suite passed (140 tests, 0 failures); repository-policy suite passed (56 tests, 0 failures); oxlint, oxfmt --check, and git diff --check passed. Generated output remains ignored and no consumer imports it.

Remediation 2026-08-30 (commit 056389e): replaced the fail-open notification fallback with explicit Codex 0.151.0 schemas and fixtures for all 81 server notifications; tightened the response/reverse graph and security-sensitive command, network, filesystem, configuration, and MCP unions; enforced mutually exclusive JSON-RPC result/error envelopes; and added a temporary exact-generator conformance owner with version, file-count, and digest checks. Validation passed: 662 module tests, 118 repository/inventory tests, 228 focused protocol tests, type-check, Oxlint, Oxfmt, diff check, and exact generator digest cdd893570801b36e404a20e7842c71312abc6bc716960ddaa53dde92bfa6f273.

Second remediation complete in commit 55ae4a2. Removed the workstation-local Codex generator path from normal module tests; exported an explicit-path, fail-closed conformance helper that checks codex-cli 0.151.0, generates into a fresh temporary directory, verifies 820 files and digest cdd893570801b36e404a20e7842c71312abc6bc716960ddaa53dde92bfa6f273, and cleans up. Manual helper validation against /home/msc/.cache/.bun/bin/codex passed with the exact version, count, and digest. Strict request/result/error/notification envelopes now reject extras and mutually exclusive result/error siblings. Notification challenge coverage is complete for the accepted method inventory and nested closed unions, including mcpServer/startupStatus/updated and windowsSandbox/setupCompleted; JsonValue extension points remain open by design. Validation: focused protocol 429 pass; bun run test:modules 863 pass; bun run test:repository 118 pass; bun run type-check pass; oxlint, oxfmt --check, and git diff --check pass. TASK-143.01.13 remains the owner of dependency pinning and root-check registration.
<!-- SECTION:NOTES:END -->
