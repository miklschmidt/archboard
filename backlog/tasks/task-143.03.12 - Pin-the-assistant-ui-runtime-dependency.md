---
id: TASK-143.03.12
title: Pin the assistant-ui runtime dependency
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 03:15'
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
<!-- SECTION:NOTES:END -->
