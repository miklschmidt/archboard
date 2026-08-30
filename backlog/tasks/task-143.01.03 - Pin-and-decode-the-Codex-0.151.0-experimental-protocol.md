---
id: TASK-143.01.03
title: Pin and decode the Codex 0.151.0 experimental protocol
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-protocol
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own exact-version protocol conformance and the sole generated-type decoder in `src/runtime/codex-protocol`. Other runtime modules consume this module's stable interface rather than generated files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean-checkout command resolves the configured binary, requires codex-cli 0.151.0 exactly, runs `codex app-server generate-ts --experimental`, and rejects a changed schema hash with an actionable review message.
- [ ] #2 Generated types and runtime decoders stay private to the module; a non-experimental fixture fails because required realtime and dynamic-tool contracts are absent.
- [ ] #3 Contract tests cover every generated server-request variant, unknown methods, invalid params, protocol errors, and the policy classification consumed by later approval/tool modules.
<!-- AC:END -->
