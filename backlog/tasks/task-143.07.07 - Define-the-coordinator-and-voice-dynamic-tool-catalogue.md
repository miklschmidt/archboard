---
id: TASK-143.07.07
title: Define the coordinator and voice dynamic-tool catalogue
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.03
  - TASK-143.01.07
  - TASK-143.01.17
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator-tool-contract
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load and validate the exact reviewed eager archboard_workhorse and archboard_voice namespace manifests and result schemas. It authors no text and dispatches no effect. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The namespace types/descriptions and ordered inspect_workhorse, delegate_to_workhorse, manage_workhorse_queue, steer_workhorse, and resolve_spoken_approval tools match canonical descriptions, deferLoading false, strict schemas/limits, additionalProperties false, and result/refusal tags byte-for-byte.
- [ ] #2 resolve_spoken_approval's entire input schema is exactly required verdict enum accept|decline; no approval, child, pane, coordinator, workhorse, thread, turn, call, realtime-session, effect, or expiry identity is caller-selectable.
- [ ] #3 All results are one inputText item using canonical ok/refused/approval_required/outcome_unknown envelopes; no wait tool or image/audio result exists.
- [ ] #4 Stable manifest hashes bind to reviewed coordinator instruction bytes and are installed only at coordinator thread/start; fixtures fail on order/prose/schema/limit/tag/eagerness/hash/media drift.
<!-- AC:END -->
