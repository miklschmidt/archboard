---
id: TASK-094
title: >-
  BOARD_HELD and CLAIM_REVOKED exit 1, so a script cannot tell them from a real
  error
status: To Do
assignee: []
created_date: '2026-08-22 15:40'
labels: []
dependencies:
  - TASK-080
references:
  - src/cli/run.ts
  - skills/excalidraw-skill/SKILL.md
priority: medium
type: enhancement
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by TASK-081 while writing the Error Recovery entries for the claim.

The CLI's documented exit codes stop at 5. `BOARD_HELD` (somebody else is writing this board) and `CLAIM_REVOKED` (the person took the board back) both come out as the generic exit 1, so a script cannot tell 'held, retry shortly' from a genuine failure without parsing the JSON `code` field.

Both are ordinary, expected outcomes on a shared wall rather than errors, and they want different responses: a hold clears on its own and is worth one more attempt in a moment, a revocation is final and means stop. Collapsing them into the same status as a malformed request loses that.

TASK-081's Error Recovery bullets deliberately key on the `code` string rather than an exit status for this reason, which is a workaround written into a skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board held by somebody else and a revoked claim each have their own exit code, distinct from a generic failure
- [ ] #2 The codes are documented where the existing ones are
- [ ] #3 The skill's Error Recovery entries can key on the exit status rather than parsing JSON
<!-- AC:END -->
