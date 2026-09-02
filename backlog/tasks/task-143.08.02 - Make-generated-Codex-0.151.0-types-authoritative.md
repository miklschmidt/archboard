---
id: TASK-143.08.02
title: Make generated Codex 0.151.0 types authoritative
status: To Do
assignee: []
created_date: '2026-09-02 01:36'
updated_date: '2026-09-02 02:13'
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
