---
id: TASK-143.02.04
title: Govern the private Codex realtime workspace package
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 03:07'
labels: []
dependencies:
  - TASK-143.02.01
  - TASK-143.02.02
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/tests/public-api.test.ts
  - tests/system/repository-policy/codex-realtime-boundary.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enforce the single extraction-ready entrypoint already assembled by TASK-143.02.01-.02. This leaf owns boundary and API-surface checks only; it does not edit the serialized index or root package metadata.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The boundary fixture proves src/ui/codex-realtime/index.ts is the sole public entrypoint and exports only the frozen host contract, state/event types, media-session factory, and supported feature marker.
- [ ] #2 A consumer fixture imports only the index and can construct, negotiate, meter, stop, and dispose a session without React, Archboard, internal-handle, store, test-fake, or generated Codex imports.
- [ ] #3 Repository policy rejects consumer deep imports into lib, extra public entrypoints, accidental exports, and mutable module-global state with actionable failures.
- [ ] #4 The module stays private in this repository; a later publication decision requires its own task, metadata, compatibility policy, and security review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the frozen realtime public index, completed media lifecycle contract, module-boundary rules, and existing repository-policy inventory. 2. Add a public-index consumer fixture proving construct/negotiate/meter/stop/dispose without React, Archboard, internal handles, stores, test fakes, or generated protocol imports. 3. Add structural repository-policy checks for the sole public entrypoint, exact exports, deep-import/extra-entrypoint/accidental-export rejection, and mutable module-global state, with actionable hostile fixtures. 4. Run focused public API, boundary, inventory, type, lint, format, and diff checks; submit the immutable range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-143.02.02 finalized and released this dependency-ready boundary leaf at integration HEAD eb9aeae. It owns only public API and repository-policy tests and is path-disjoint from active production work.

Implementation commit 9a39e7e (test(realtime): govern private public boundary) adds only src/ui/codex-realtime/tests/public-api.test.ts and tests/system/repository-policy/codex-realtime-boundary.test.ts. The public owner executes a temporary consumer importing only the public index through negotiation, metering, stop, and dispose; the boundary owner enforces the sole entrypoint, canonical frozen re-export sources, hostile deep-import/extra-entrypoint/accidental-export diagnostics, and module-scope safety. Focused evidence passed: public API 3 tests/31 expectations; boundary 3 tests/9 expectations; repository inventory 39 tests/69 expectations; module-scope policy 8 tests/11 expectations; both strict TypeScript projects; focused Oxlint; focused Oxfmt check; git diff --check. Broad module, system, repository, check, and browser lanes were intentionally not run. Remaining risk: broad integration and browser lanes remain root-owned. Task remains In Progress with acceptance criteria unchecked.

Review remediation commit 82d376de522d8da3044fe06d1381526385a6d085 on fixed BASE ecd1b317bd3f6ce7fabd65c19baea3e2e8ce0d7e. It keeps root package.json private:true, rejects publication-routing metadata and nested module package.json, walks the realtime production graph across static/type/dynamic/require edges, rejects forbidden framework/runtime/generated/alternate-transport dependencies, and closes deep-import checks for query, alias, dynamic, type, and require forms. Focused evidence passed: public API 3 tests/31 expectations; boundary 5 tests/31 expectations; inventory 39 tests/69 expectations; module-scope policy 8 tests/11 expectations; both strict TypeScript projects; focused Oxlint; focused Oxfmt check; git diff --check. Broad module/system/repository/check/browser lanes remain intentionally unrun and root-owned. Task remains In Progress with ACs unchecked.

Final P2 remediation commit 5bddd51f80a34399113da72f9aaaaf0d8cd12727 on fixed BASE ecd1b317bd3f6ce7fabd65c19baea3e2e8ce0d7e. Both sole-root-entrypoint inventories now use the complete .ts/.tsx/.js/.jsx/.mts/.cts predicate and include hostile non-TS fixtures. Direct-export enforcement uses TypeScript AST modifiers and rejects export declare const, export declare namespace, direct export type, and other direct declarations. Focused evidence passed: public API 3 tests/32 expectations; boundary 5 tests/32 expectations; inventory 39 tests/69 expectations; module-scope policy 8 tests/11 expectations; both strict TypeScript projects; focused Oxlint; focused Oxfmt check; git diff --check; both owners remain at or below 500 lines. Task remains In Progress with ACs unchecked; broad lanes remain root-owned.
<!-- SECTION:NOTES:END -->
