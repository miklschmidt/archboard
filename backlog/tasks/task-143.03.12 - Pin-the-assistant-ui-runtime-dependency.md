---
id: TASK-143.03.12
title: Pin the assistant-ui runtime dependency
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 04:10'
labels: []
dependencies:
  - TASK-144.01
  - TASK-144.18
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - package.json
  - bun.lock
  - .oxlintrc.jsonc
  - tools/oxlint-plugin-archboard.js
  - tests/system/repository-policy/assistant-ui-imports.test.ts
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 226000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the final serialized root package/lockfile edit for @assistant-ui/react 0.15.17 and audit its transitive graph. The runtime is headless support, not Archboard state or transport.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json and bun.lock pin @assistant-ui/react exactly 0.15.17 after Codex/Tailwind/Base UI root edits; frozen install, license audit, and transitive allowlist pass without duplicate React or direct Radix dependency.
- [ ] #2 Repository policy allows only named root imports: TASK-143.03.02 owns useExternalStoreRuntime, AssistantRuntimeProvider, ReadonlyThreadProvider, MessageNotSentError; .03.04 owns ThreadPrimitive, MessagePrimitive, MessagePartPrimitive; .03.05 owns ComposerPrimitive.
- [ ] #3 The policy rejects namespace/default/subpath imports, all other members, copied Elements, AssistantTransport, thread-list, queue, tool, voice APIs, and assistant-ui imports from every other module with actionable diagnostics.
- [ ] #4 tests/system/repository-policy/assistant-ui-imports.test.ts proves every allowed owner/member and rejects each forbidden shape; bundle inspection fails on unexpected transitive growth or app/direct Radix use.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed assistant-ui 0.15.17 contract with the completed root dependency and canonical alias owners. 2. Pin the exact root dependency and lock graph, audit licenses/transitives for duplicate React and direct Radix use, and keep assistant-ui headless. 3. Extend existing Oxlint ownership rules and add repository fixtures for the exact named members/owners and all forbidden import shapes, APIs, modules, copied Elements, and transport/state misuse. 4. Run focused frozen-install, dependency, policy, lint, type, format, inventory, and diff checks; leave broad modules/system/repository/browser lanes to root caps.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.18 finalized at integration HEAD 4cbceec. This ready leaf owns the serialized package/lock edit and assistant-ui import policy; no active worker owns those paths.

2026-08-31 @codex implementation evidence (code commit c6e168e): pinned @assistant-ui/react exactly 0.15.17 and added the canonical archboard/assistant-ui-imports Oxlint rule. Ownership is exact: workbench-runtime owns useExternalStoreRuntime, AssistantRuntimeProvider, ReadonlyThreadProvider, and MessageNotSentError; workbench-timeline owns ThreadPrimitive, MessagePrimitive, and MessagePartPrimitive; workbench-composer owns ComposerPrimitive.

Real-Oxlint policy tests: bun test tests/system/repository-policy/assistant-ui-imports.test.ts — 10 passed, 229 assertions. Fixtures cover every allowed owner/member, wrong/unrelated owners, default/namespace/side-effect/type-only/export-from/export-star/dynamic/require/non-literal/query/hash/trailing-slash/subpath/alternate/auxiliary package forms, explicit transport/thread-list/queue/tool/voice/state/cloud/MCP/devtool/copy signatures, local aliases and nested primitive internals, and direct Radix imports. Owned plugin/test lint and Oxfmt checks pass.

Dependency evidence: disposable bun install --frozen-lockfile --ignore-scripts exited 0 with lockUnchanged=true. The lock review is 107 added keys, 20 obsolete nested keys removed, and 24 shared records re-resolved; the test freezes the 91 reachable assistant-ui name@version identities, MIT/BSD-3-Clause/0BSD license set, one React and one React DOM lock entry, and the bounded headless Vite bundle (294955-byte/275-module ceiling, no assistant-cloud/safe-content-frame/Radix).

Broad modules/system/repository/check/browser lanes remain root-owned and were not run. Task remains In Progress and all acceptance criteria remain unchecked. Preserved /home/msc/Projects/archboard/src-DlBR1tzg.js.

2026-08-31 @codex remediation evidence (code commit f1586b6): closed the review gaps without changing the package or lockfile commits. The Oxlint visitor now rejects assignment aliases of approved imports and propagates the alias to the nested-member check. The repository-policy fixture audits bare radix-ui and @radix-ui/* declarations across dependencies, devDependencies, peerDependencies, and optionalDependencies, counts resolved React identities from lock values even under nested lock keys, and exercises hostile cases for each gap.

The headless Vite fixture now observably retains all eight approved values. In production mode it measures 280341 bytes and 280 modules against ceilings of 280379 bytes and 280 modules, asserts the exact reviewed package-root set, and rejects assistant-cloud and safe-content-frame. Direct Radix remains forbidden at the app import boundary while the bundle assertion permits only the reviewed transitive Radix roots.

Focused checks: bun test tests/system/repository-policy/assistant-ui-imports.test.ts — 12 passed, 240 assertions; focused Oxlint on the owned plugin/test — 0 errors; Oxfmt check passed; the policy test is 499 lines against the 500-line repository limit. Disposable bun install --frozen-lockfile --ignore-scripts remains clean with lockUnchanged=true. Broad modules/system/repository/check/browser lanes remain root-owned and were not run. Task remains In Progress and all acceptance criteria remain unchecked. Preserved /home/msc/Projects/archboard/src-DlBR1tzg.js.

2026-08-31 @codex second remediation evidence (code commit 8ceabd5): strengthened the React singleton audit to return every matching lock record as a key-and-identity object without Set deduplication. The real lock now asserts exactly { key: "react", identity: "react@19.2.8" } and { key: "react-dom", identity: "react-dom@19.2.8" }. Hostile fixtures include nested same-version duplicate records and nested different-version records for both React packages.

The assignment visitor now rejects any non-Identifier left target when the right side is a tracked assistant-ui value, covering destructuring assignment aliases. Focused hostile fixtures exercise queue, voice, and tool names through ComposerPrimitive assignment patterns. The copied Elements limitation remains the documented three-name signature inventory and does not claim arbitrary equivalent source detection.

Focused checks: bun test tests/system/repository-policy/assistant-ui-imports.test.ts - 12 passed, 249 assertions; focused Oxlint on the owned plugin/test - 0 errors; Oxfmt check passed; the policy test remains 500 lines against the 500-line repository limit. Package and lockfile were unchanged in this remediation. Broad modules/system/repository/check/browser lanes remain root-owned and were not run. Task remains In Progress and all acceptance criteria remain unchecked. Preserved /home/msc/Projects/archboard/src-DlBR1tzg.js.

2026-08-31 @codex wrapper-remediation evidence (code commit 6b0d4bd): normalized only transparent expression wrappers before existing assistant-ui binding lookup. The helper covers TSAsExpression, TSTypeAssertion, TSNonNullExpression, ChainExpression, and ParenthesizedExpression, with no arbitrary dataflow or container tracking. Variable aliases and assignment aliases now reach the existing nested-member and alias diagnostics through those wrappers.

Focused hostile fixtures cover a const alias through an as assertion, a simple assignment through a non-null assertion, and a destructuring assignment through a type assertion. The copied Elements limitation remains the documented three-name signature inventory and does not claim arbitrary equivalent-source detection.

Focused checks: bun test tests/system/repository-policy/assistant-ui-imports.test.ts - 12 passed, 258 assertions; focused Oxlint on the owned plugin/test - 0 errors; Oxfmt check passed; the policy test remains 500 lines against the 500-line repository limit. Package and lockfile were unchanged in this remediation. Broad modules/system/repository/check/browser lanes remain root-owned and were not run. Task remains In Progress and all acceptance criteria remain unchecked. Preserved /home/msc/Projects/archboard/src-DlBR1tzg.js.
<!-- SECTION:NOTES:END -->
