---
id: TASK-532.05
title: The CLI reads a stated variant change once for edit and resolve
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T02:41:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0008-cli-is-the-default-surface.md
parent_task_id: TASK-532
ordinal: 956000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
semantic edit (board.ts) and semantic resolve (lifecycle.ts) repeat about 20 lines: version admission, JSON reading, object refusal, variant override and immediate diagnostics. The order matters (override diagnostics appear even when the write later fails), but only the pure targeting helper is tested, through a re-export.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One readVariantChange in the CLI semantic-input module owns version admission, JSON reading, object refusal, targeting and immediate diagnostics; edit and resolve call it
- [ ] #2 Command-level tests prove that a missing version prevents reading the input and that override diagnostics come before a schema or write refusal; the helper-only test through a re-export is gone
<!-- AC:END -->
