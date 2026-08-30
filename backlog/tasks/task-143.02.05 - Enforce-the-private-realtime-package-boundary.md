---
id: TASK-143.02.05
title: Verify the realtime host and process contract
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.02.03
  - TASK-143.02.04
references:
  - docs/agents/boundaries.md
modified_files:
  - tests/system/process-contracts/codex-realtime.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 242000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the real-process contract test for the runtime adapter and public browser module boundary. Browser device behavior remains in the controlled browser owner; this test drives an exact-version/fake stdio child through public ports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner proves exact start parameters, empty response handling, SDP notification answer, started identity gate, item transcript reduction, paginated timeline recovery, and one-attempt append/stop behavior through public interfaces.
- [ ] #2 Wrong child/thread/session/version, stale SDP, flat transcript, repeated cursor, lost append, child exit, and restart settle to the documented phase/outcome without duplicate transcript or retry.
- [ ] #3 The fixture cannot import generated protocol files or media internals and leaves no child, listener, timer, request, or session after every success/failure case.
- [ ] #4 The process-contract inventory registers this owner independently of browser tests and the clean real voice smoke.
<!-- AC:END -->
