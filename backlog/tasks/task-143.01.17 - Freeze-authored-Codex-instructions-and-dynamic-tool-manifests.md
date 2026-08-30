---
id: TASK-143.01.17
title: Freeze authored Codex instructions and dynamic-tool manifests
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - docs/design/codex-workbench-authored-contracts.md
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 247000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the human-reviewed, byte-exact source contract for workhorse/coordinator instructions, additionalContext encoding, and both dynamic-tool catalogues before implementation begins. Luna workers may load, hash, validate, or dispatch these bytes; they may not author or reinterpret them. Delegation profile: gpt-5.6-sol, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The document contains literal UTF-8 workhorse and coordinator instruction bytes, their exact composition separator, one deterministic additionalContext key/value encoding, and explicit realtime startup/instruction/handoff choices.
- [ ] #2 Literal eager namespace manifests freeze ordered tool names, descriptions, strict schemas, required and optional fields, limits, additionalProperties false, result/refusal tags, approval mapping, and text-only output for archboard_app, archboard_workhorse, and archboard_voice.
- [ ] #3 resolve_spoken_approval accepts exactly one argument, verdict with accept or decline; the host supplies the sole pending approval identity only after child/thread/turn/call/manifest/session/expiry validation.
- [ ] #4 A later ordinary coordinator turn, never realtime classification alone, invokes spoken resolution; hash fixtures in the implementation tasks must fail on any byte or manifest drift.
<!-- AC:END -->
