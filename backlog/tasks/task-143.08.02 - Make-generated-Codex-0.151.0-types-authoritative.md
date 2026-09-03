---
id: TASK-143.08.02
title: Make generated Codex 0.151.0 types authoritative
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:36'
updated_date: '2026-09-03 01:27'
labels: []
dependencies:
  - TASK-143.08.01
references:
  - docs/agents/boundaries.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - src/runtime/codex-protocol
  - src/shared/codex-browser-model
  - package.json
parent_task_id: TASK-143.08
priority: high
type: task
ordinal: 260000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the rejected handwritten protocol ownership model with one dependency-neutral shared module generated from the exact package-local Codex 0.151.0 app-server contract. Generated files remain reproducible and ignored, but ordinary product type-checking imports them through the module root. Local wire views derive from vendor types. Runtime schemas remain at untrusted ingress and prove compile-time input and output conformance. Local browser or domain additions use a named adapter rather than a copied vendor shape.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 @openai/codex 0.151.0 is an exact runtime dependency, and a clean frozen bun install materializes the experimental generated tree deterministically before ordinary type-checking.
- [ ] #2 The ignored generated tree lives inside one src/shared module with a tracked root entrypoint; runtime and UI consumers import only that entrypoint, and generated source is excluded from authored formatting and lint while remaining inside both required type graphs.
- [ ] #3 Every used request, response, server request, notification, item, config, thread, turn, queue, session, and realtime view derives from generated exports with Extract, Pick, Omit, Partial, intersections, or a named conversion at one seam; no lookalike vendor base type remains.
- [ ] #4 Each handwritten Zod ingress parser has compile-time input and output conformance to the generated type it accepts, inferred local TypeScript comes from the schema, and a Codex dependency change names every incompatible assumption during ordinary type-checking.
- [ ] #5 The real seven-field BrowserUseOriginPolicy object decodes and round-trips, and all ts-rs i64 or bigint differences pass through one named normalization adapter with focused boundary coverage.
- [ ] #6 Version, generation, missing-tree, and compiler diagnostics are actionable without a digest, method-name inventory, fingerprint corpus, or mirror detector acting as the contract authority.
- [ ] #7 This recovery task is the sole owner of vendor-derived wire views, reverse-request variants, app-server ingress conformance, BrowserUseOriginPolicy handling, and i64 normalization. TASK-143.01.02 may consume its normalized exports only for browser-only state and user-intent projection.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move exact @openai/codex 0.151.0 into runtime dependencies. Add one tracked Bun generator that runs the local Codex launcher into a fresh sibling directory, swaps the generated subtree atomically, and runs from postinstall plus an explicit package script. Ignore only that subtree and exclude it from authored Oxlint/Oxfmt input.
2. Add src/shared/codex-app-server-contract/index.ts as the sole product import path. Export vendor-derived request, response, reverse-request, notification, item, config, thread, turn, queue, session, and realtime wire views, plus one recursive CodexJsonWire<T> adapter that maps bigint leaves to safe JSON numbers and rejects bigint at runtime.
3. Replace handwritten vendor lookalike types in codex-protocol and the reachable browser/realtime seam with generated-derived views. Keep local browser state and identities local. Make each handwritten Zod ingress schema prove both z.input and z.output conformance to its normalized vendor wire type without casts, any, ts-ignore, or a separate compiler path.
4. Correct BrowserUseOriginPolicy to its seven generated fields and add focused module coverage for decode/round-trip plus a reachable i64 safe-number case and bigint rejection at the JSON seam. Update existing boundary fixtures only where the module path changed.
5. Run focused formatting, lint, type checks, and affected module owners. Then prove a clean frozen install, generated output, and both TypeScript graphs in a disposable checkout or temp root. Record exact evidence and implementation notes without checking acceptance criteria or finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation worker started from finalized recovery base 503bae209c970b72240489213e704de771565b77 in an isolated worktree. Scope is TASK-143.08.02 only; finalization remains parent-owned.

Implemented in 225d179e527f0e895822d595afe05c6d7e0bdcc0. @openai/codex 0.151.0 is now an exact runtime dependency. Postinstall and generate:codex-contract run one Bun generator into a fresh sibling directory and atomically replace the ignored generated subtree. src/shared/codex-app-server-contract/index.ts is the sole product import path and supplies generated-derived method maps, normalized wire views, compile-time Zod conformance, and the one pre-ingress JSON/i64 normalizer. Protocol request/response/reverse-request/notification schemas and the reachable browser-model seam now prove generated compatibility during ordinary compilation. BrowserUseOriginPolicy uses all seven generated fields; focused owners cover its shape plus safe-number and bigint behavior.

Validation: clean frozen install plus postinstall generation passed in 0.240 s in a disposable archive checkout; frontend TypeScript graph passed in 0.457 s; focused protocol/browser contract owners passed 544 tests in 0.401 s; repository boundaries passed 7 tests in 2.29 s; affected realtime/authored repository owners passed 7 tests in 0.061 s; focused Oxlint and Oxfmt passed; direct generation passed in 0.113 s. The root TypeScript graph still reports 13 unrelated engine/board-inspection errors, byte-for-byte identical to exact base 503bae209c970b72240489213e704de771565b77 after a clean frozen install. No task acceptance criteria were checked and status remains In Progress for parent review/finalization.
<!-- SECTION:NOTES:END -->
