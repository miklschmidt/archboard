---
id: TASK-143.01.07
title: Own Archboard Codex developer instructions
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.17
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-instructions
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load, byte-freeze, hash, and compose the canonical authored contracts from the reviewed design record. Callers select a reviewed role and typed context; Luna implementers may not change prose or manifest semantics.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tracked workhorse and coordinator documents match the canonical UTF-8 bytes exactly; coordinator composition is workhorse bytes, the documented LF separator, then coordinator bytes with stable hashes.
- [ ] #2 additionalContext uses exactly key archboard and value {kind: application, value: canonical-json-string}; canonical JSON has the documented ordered fields and rejects caller-authored prose or unknown keys.
- [ ] #3 Ordinary turn/start and turn/steer text is exactly one UserInput {type: text, text, text_elements: []}; developer-role input_text is emitted only by the semantic thread/inject_items body. Attach/reconnect/rejoin never rewrites persisted instructions or tools, while forks use the literal reviewed fork profile.
- [ ] #4 Byte/body fixtures fail on BOM, newline, whitespace, separator, field order, prose, schema, omitted-field, role, or hash drift from the reviewed contract.
<!-- AC:END -->
