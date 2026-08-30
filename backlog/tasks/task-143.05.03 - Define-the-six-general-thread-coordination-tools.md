---
id: TASK-143.05.03
title: Define the six general thread-coordination tools
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.07
  - TASK-143.01.17
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-thread-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load and validate the exact reviewed eager archboard_app namespace manifest and strict schemas. This catalogue describes tools only; it does not dispatch effects or author tool text. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The namespace description, ordered six tools, deferLoading false, strict schemas/limits, and additionalProperties false match the canonical literal manifest byte-for-byte, including wait_threads cursor input.
- [ ] #2 Result parsing accepts only canonical per-tool envelopes, including confirmed create/fork identity with initialTurn delivery/not-delivered/uncertain state; media and unknown fields fail closed.
- [ ] #3 The stable manifest hash is bound to reviewed workhorse bytes and supplied only on eligible Archboard-created starts; attach/reconnect cannot install or replace tools.
- [ ] #4 Fixtures fail on order/prose/schema/limit/tag drift, unknown tools/fields, caller-selected identity, unsupported override, malformed bound cursor/timeout, missing partial-result fields, or non-text output.
<!-- AC:END -->
