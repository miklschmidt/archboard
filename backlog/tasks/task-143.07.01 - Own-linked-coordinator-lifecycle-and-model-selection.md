---
id: TASK-143.07.01
title: Own linked coordinator lifecycle and model selection
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one persistent coordinator per valid thread link plus global model/effort/service-tier/intervention settings in `src/runtime/codex-coordinator`. It starts a normal capable Codex thread; workhorse effects live in separate modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A valid pane/workhorse thread link explicitly creates or reuses exactly one same-epoch coordinator that persists across voice stops and invalidates on child exit or rebind.
- [ ] #2 Exhaustive `model/list` validation starts with `gpt-5.6-luna`, medium effort, and requested priority only when advertised; configured/effective values and fallback are observable.
- [ ] #3 Coordinator instructions retain ordinary workbench sandbox and approvals, permit web/shell/repository investigation and one explicit canonical board write, and make sustained mutation or multi-step work default to delegation.
- [ ] #4 The intervention policy defaults to Explicit corrections and also supports Coordinator judgment and Never steer for later decisions only.
<!-- AC:END -->
