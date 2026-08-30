---
id: TASK-143.05.03
title: Define the six general thread-coordination tools
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:29'
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
- [ ] #1 The namespace type, description, ordered create_thread/fork_thread/list_threads/read_thread/send_message_to_thread/wait_threads entries, deferLoading false flags, strict input schemas/limits, and additionalProperties false match the canonical literal manifest byte-for-byte.
- [ ] #2 Result parsing accepts only one inputText item containing the canonical ok, refused, approval_required, or outcome_unknown envelope/reason tags for that tool; image/audio output and unknown result fields fail closed.
- [ ] #3 The stable manifest hash is bound to reviewed workhorse instruction bytes and supplied only when starting eligible Archboard-created general threads; attach/reconnect cannot install or replace tools.
- [ ] #4 Fixtures fail on reorder, prose/schema/limit/tag/eagerness drift, unknown namespace/tool/field, caller-selected host/process identity, unsupported override, malformed cursor/timeout, or non-text output.
<!-- AC:END -->
