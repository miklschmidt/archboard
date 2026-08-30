---
id: TASK-143.01.18
title: Enforce generated Codex protocol ownership
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.12
  - TASK-143.01.13
references:
  - docs/agents/boundaries.md
modified_files:
  - tests/system/repository-policy/codex-protocol-boundary.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one repository-policy rule that makes generated Codex 0.151.0 bindings reachable only through the codex-protocol entrypoint. It prevents consumers from coupling to generated layout or bypassing runtime decoders. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generated files may exist only in the ignored codex-protocol generated directory and may be imported only by the codex-protocol adapter.
- [ ] #2 Runtime, server, UI, scripts, and tests outside the conformance owner fail with an actionable path when they deep-import or commit a generated binding.
- [ ] #3 The policy permits the temp-directory generator/compare owner and fixtures without permitting a second generated tree or a handwritten mirror.
- [ ] #4 The test is registered in the existing repository inventory and fails on the pre-policy forbidden fixture.
<!-- AC:END -->
