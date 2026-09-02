---
id: TASK-143.01.02
title: Define the closed Codex browser contract
status: To Do
assignee: []
created_date: '2026-08-30 15:06'
updated_date: '2026-09-02 01:39'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.08.05
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
Define the browser-facing DTOs and exhaustive host request contract at the public shared boundary. Every wire-backed field derives from the authoritative generated Codex 0.151.0 module supplied by TASK-143.08.02; browser-only and domain-only additions cross one named adapter. Vendor-private paths do not cross this boundary, but generated vendor types remain the source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The browser DTO union covers the reachable readiness, account/login, thread-link, timeline, queue, settings, approval/form, text-command, semantic-delivery, coordinator, voice, command-lease, and delivery-outcome states; every wire-backed member is derived from the generated shared module or converted at one named seam.
- [ ] #2 The exhaustive host request union and its results derive from the exact generated 0.151.0 reverse-request variants, so an added or changed vendor member fails ordinary type-checking at the owning switch or adapter rather than a fingerprint or handwritten method inventory.
- [ ] #3 Runtime schemas validate only untrusted app-server and browser ingress, infer their local TypeScript types, and carry compile-time input and output conformance to the generated type; no parallel literal table, mirror schema, digest, or generated-import-free lookalike acts as authority.
- [ ] #4 Focused contract tests cover reachable accepted and refused behavior, secret exclusion, the object-shaped BrowserUseOriginPolicy, and the shared i64 normalization seam without duplicating tool, formatter, linter, alias, fixture-cleanup, or prose checks.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Paused by TASK-143.08. Do not continue or review the generated-import-free implementation. Reopen only after TASK-143.08.05 is Done, then replace this pause with a fresh plan based on the generated shared module and the retained-owner matrix. Port only observable behavior from the detached work; do not merge its contract or test scaffolding.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed shared Codex browser contract under src/shared/codex-browser-model: strict browser DTOs, exhaustive Codex 0.151.0 reverse-request schemas, reviewed initialize/login/time/error policies, secret-free snapshots, and compile-time/runtime rejection fixtures. No generated protocol imports cross the boundary.

Validation passed: focused module type-check, Oxlint, Oxfmt, and 6 tests (59 expectations); bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (447 tests, 0 failures); bun run test:repository (118 tests, 0 failures).

Remediation applied: identity-bearing schemas now require the authority decoder and current child/epoch validator; publishable BrowserDto excludes transient browser-command ingress; accountLogin is limited to the four supported variants; approval responses are strict seven-arm contracts; server requests/results mirror all nested 0.151.0 unions with typed MCP defaults and permission paths; login policy rows are exact and ordered. Added regression fixtures for unissued/wrong-domain/wrong-child/stale-epoch identities, link relations, approval arms, all MCP form members, invalid defaults, permission paths, and reachable recovery states.

Remediation validation: bun test --isolate src/shared/codex-browser-model (8 pass, 129 expectations); bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (449 pass, 0 failures); bun run test:repository (118 pass, 0 failures); git diff --check (pass).

Second remediation applied: coordinator thread/turn identity is independent from the linked workhorse timeline and semantic thread; coordinator-local state is validated separately. Inspect-only thread links preserve the generated custom, subAgent, and unknown source families while executable links remain limited to the four authored source strings. Dynamic item/tool/call results now require exactly one non-empty inputText tuple. Host-generated server-request strings use NUL-safe wireText without undocumented size caps; authored dynamic-tool output retains its reviewed bounded text policy. Added fixtures for distinct coordinator identities, unissued coordinator IDs, inspect-only source families/unknown members, media/arity rejection, and >16K add/delete/unified-diff patch text round-trips.

Second remediation validation: bun test --isolate src/shared/codex-browser-model (9 tests, 145 expectations); bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (450 tests, 0 failures); bun run test:repository (118 tests, 0 failures); git diff --check (pass). Task remains In Progress for parent review.

Third remediation applied: reverse-wire server request schemas now use ordinary z.string() fields without NUL rejection, including reason, cwd, command, MCP labels/defaults, and FileChange content. The reviewed browser-authored bounded projections and dynamic-tool envelope retain their existing safety checks. Added a JSON serialize/parse regression containing an actual U+0000 via String.fromCodePoint(0) in patch reason and FileChange content, and verified it round-trips.

Third remediation validation: bun test --isolate src/shared/codex-browser-model (9 tests, 147 expectations); bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (450 tests, 0 failures); bun run test:repository (118 tests, 0 failures); git diff --check (pass). Task remains In Progress for parent review.

Parent integration validation at 99870de: focused browser-model suite 9 tests / 147 expectations; both TypeScript projects, Oxlint, Oxfmt, 468 module tests, 118 repository-policy tests, diff check, and clean-worktree audit passed. Independent fixed-base reviewer returned REVIEW_CLEAN at worker HEAD 60621075719cb1655108151d1aa862f11c46a8f4 after rerunning identity, request/result, secret, approval, state/source, large-patch, literal-policy, and actual U+0000 probes.

Reopened with user approval after downstream TASK-143.03.07 showed that the finalized browser model cannot represent authoritative approval lifecycle, exact permission profiles, full elicitation constraints, binding, and spoken eligibility.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: the generated-import-free contract is rejected because it contradicts repository boundaries and already drifted from Codex 0.151.0. Preserve maximal head b0938164 and ancestor 54643b59 only as behavior evidence; rebuild this leaf after TASK-143.08.05 and do not merge that chain.
---
<!-- COMMENTS:END -->
