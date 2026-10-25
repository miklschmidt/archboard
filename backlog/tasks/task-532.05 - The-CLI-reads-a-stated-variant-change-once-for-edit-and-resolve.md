---
id: TASK-532.05
title: The CLI reads a stated variant change once for edit and resolve
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T04:19:00Z'
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
- [x] #1 One readVariantChange in the CLI semantic-input module owns version admission, JSON reading, object refusal, targeting and immediate diagnostics; edit and resolve call it
- [x] #2 Command-level tests prove that a missing version prevents reading the input and that override diagnostics come before a schema or write refusal; the helper-only test through a re-export is gone
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add readVariantChange to semantic-input.ts (version admission, JSON read, object refusal, targeting, immediate diagnostics). Edit and resolve call it after context.require and keep their own schema parsing. targetedVariant and failStated become private. Replace targeted-variant.test.ts with command-level variant-change.test.ts through runCli with a stand-in server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
readVariantChange(input, context, {command, needs}) in semantic-input.ts; edit and resolve call it after context.require. targetedVariant and failStated now private. Write-answer helpers (writeResult, describedWrite, SemanticBoardResultSchema) moved to input/write-answer.ts because semantic-input.ts hit the 600-line lint cap. Tests: apps/cli/tests/cli/operations/semantic/board/variant-change.test.ts (runCli with stand-in server), helper-only test deleted.

Review (review/variant-change, 797ba3849): behaviour, order, exit codes and JSON unchanged; restored three cases of the deleted targeted-variant.test.ts that had no other owner (spacing-only difference stays silent, flag with no stated variant stays silent, a non-name stated variant is overridden with one warning); the targeted mutations now fail four tests.
<!-- SECTION:NOTES:END -->
