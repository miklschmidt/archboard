---
id: TASK-143.01.02
title: Define the closed Codex browser contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:06'
updated_date: '2026-08-30 20:06'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/codex-browser-model
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the closed browser DTOs plus the exhaustive host-side server-request contract that the final composition routes. Generated protocol types do not cross this shared boundary. Delegation profile: gpt-5.6-luna, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The browser DTO union covers readiness, account/login, thread links, timelines, queue, settings, approvals/forms, text commands, semantic delivery, coordinator, voice, command leases, and delivered/not_delivered/outcome_unknown without generated imports.
- [ ] #2 A closed host request union covers all eleven 0.151.0 variants: seven broker families, item/tool/call, currentTime/read, account/chatgptAuthTokens/refresh, and attestation/generate; no default/unknown branch can silently drop a request.
- [ ] #3 The contract imports the literal InitializeCapabilities object and six-login support/refusal table from the reviewed authored contract, including exact extensions, notification opt-outs, time response, and protocol-error policies.
- [ ] #4 Round-trip/schema fixtures reject unknown identities, methods, result media, status, capability, login variant, browser command, or server request and keep secrets out of browser snapshots.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the public src/shared/codex-browser-model/index.ts entrypoint and private implementation modules with closed, strict Zod schemas and inferred browser DTO types; represent the complete browser snapshot/command/event surface for readiness, account/login, thread links, timelines, queue, settings, approvals/forms, text commands, semantic delivery, coordinator, voice, leases, and delivered/not_delivered/outcome_unknown outcomes.
2. Define the exhaustive host-side server-request union for the exact eleven Codex 0.151.0 reverse-request methods, using only the shared identity root types and local JSON-safe DTOs; provide strict parsers that reject unknown methods, fields, identities, and result media without importing generated protocol bindings.
3. Freeze the reviewed InitializeCapabilities object, six login policies, current-time response, unsupported token-refresh/attestation errors, and browser-safe dynamic-tool/result envelopes as literal readonly contracts; ensure secret-bearing login fields are accepted only at the host boundary and never appear in browser DTOs or snapshots.
4. Add module-owned schema/round-trip and compile-time exhaustiveness fixtures covering accepted discriminators and rejection of unknown identities, methods, media, statuses, capabilities, login variants, browser commands, and server requests; enforce root-only imports and generated-protocol independence.
5. Run focused module/type/lint/format and repository policy checks, audit BASE..HEAD paths and diff whitespace, record validation notes on TASK-143.01.02, and commit only the owned module plus its Backlog record.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed shared Codex browser contract under src/shared/codex-browser-model: strict browser DTOs, exhaustive Codex 0.151.0 reverse-request schemas, reviewed initialize/login/time/error policies, secret-free snapshots, and compile-time/runtime rejection fixtures. No generated protocol imports cross the boundary.

Validation passed: focused module type-check, Oxlint, Oxfmt, and 6 tests (59 expectations); bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (447 tests, 0 failures); bun run test:repository (118 tests, 0 failures).

Remediation applied: identity-bearing schemas now require the authority decoder and current child/epoch validator; publishable BrowserDto excludes transient browser-command ingress; accountLogin is limited to the four supported variants; approval responses are strict seven-arm contracts; server requests/results mirror all nested 0.151.0 unions with typed MCP defaults and permission paths; login policy rows are exact and ordered. Added regression fixtures for unissued/wrong-domain/wrong-child/stale-epoch identities, link relations, approval arms, all MCP form members, invalid defaults, permission paths, and reachable recovery states.

Remediation validation: bun test --isolate src/shared/codex-browser-model (8 pass, 129 expectations); bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (449 pass, 0 failures); bun run test:repository (118 pass, 0 failures); git diff --check (pass).

Second remediation applied: coordinator thread/turn identity is independent from the linked workhorse timeline and semantic thread; coordinator-local state is validated separately. Inspect-only thread links preserve the generated custom, subAgent, and unknown source families while executable links remain limited to the four authored source strings. Dynamic item/tool/call results now require exactly one non-empty inputText tuple. Host-generated server-request strings use NUL-safe wireText without undocumented size caps; authored dynamic-tool output retains its reviewed bounded text policy. Added fixtures for distinct coordinator identities, unissued coordinator IDs, inspect-only source families/unknown members, media/arity rejection, and >16K add/delete/unified-diff patch text round-trips.

Second remediation validation: bun test --isolate src/shared/codex-browser-model (9 tests, 145 expectations); bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (450 tests, 0 failures); bun run test:repository (118 tests, 0 failures); git diff --check (pass). Task remains In Progress for parent review.
<!-- SECTION:NOTES:END -->
