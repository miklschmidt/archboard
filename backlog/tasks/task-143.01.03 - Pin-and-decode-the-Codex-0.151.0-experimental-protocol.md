---
id: TASK-143.01.03
title: Pin and decode the Codex 0.151.0 experimental protocol
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.01.01
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
Own exact-version protocol generation, schema hashing, and the sole generated-type decoder in `src/runtime/codex-protocol`. Resolve the binary only from reviewed `ARCHBOARD_CODEX_BIN` or PATH and generate into the separately ignored module-local input directory.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module command resolves ARCHBOARD_CODEX_BIN then PATH, requires codex-cli 0.151.0 exactly, runs codex app-server generate-ts --experimental into src/runtime/codex-protocol/generated, and fails when the tracked deterministic schema hash changes.
- [ ] #2 Generated types never import outside this module; the module exposes generate, conformance, and explicit hash-review commands for later root registration and a non-experimental fixture fails for missing realtime/dynamic-tool contracts.
- [ ] #3 Runtime decoders cover every generated server-request variant, unknown method, invalid params, protocol error, and stable policy classification consumed by approval/tool modules.
- [ ] #4 Public-module tests consume only stable decoded types and produce actionable binary/version/schema-review errors without committing derived bindings.
<!-- AC:END -->
