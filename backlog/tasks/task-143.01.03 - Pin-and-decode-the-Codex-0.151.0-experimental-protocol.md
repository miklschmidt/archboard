---
id: TASK-143.01.03
title: Pin and decode the Codex 0.151.0 experimental protocol
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.01.12
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
Own the ignored output and checked runtime decoders generated from the exact configured Codex 0.151.0 binary with experimental APIs. Every used response, error, notification, and reverse request is decoded here; no consumer imports generated files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generation runs codex app-server generate-ts --experimental from the exact binary and records binary version plus generated-tree digest without committing derived bindings.
- [ ] #2 The adapter decodes every used initialize/account/config/thread/turn/item/queue/model/realtime/timeline response, JSON-RPC error, client notification, and server request, including optional emittedAtMs where supplied.
- [ ] #3 Raw version-decoded realtime events leave this boundary without phase or transcript interpretation; TASK-143.02.03 is the sole reducer of realtime phase and canonical transcript.
- [ ] #4 Unknown union members, malformed payloads, version drift, and unsupported capabilities fail closed with the method, direction, expected version, and recovery action.
<!-- AC:END -->
