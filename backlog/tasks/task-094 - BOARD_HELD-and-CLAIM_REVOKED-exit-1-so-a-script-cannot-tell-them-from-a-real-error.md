---
id: TASK-094
title: 'Rejected: split board refusal exit codes'
status: Done
assignee: []
created_date: '2026-08-22 15:40'
updated_date: '2026-08-28 00:35'
labels: []
dependencies: []
references:
  - src/cli/run.ts
  - skills/excalidraw-skill/SKILL.md
priority: medium
type: chore
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-123 replaced ad hoc CLI behavior with schema-defined command contracts. The accepted contract intentionally uses exit 5 for every board-write refusal and keeps BOARD_HELD, CLAIM_REVOKED, BOARD_VERSION_CONFLICT, and BOARD_CONFLICT as typed refusal codes with distinct messages and continuations.

Separate operating-system exit codes would optimize bespoke shell branching while fragmenting the stable refusal contract. Agents already receive the reason and next action. Reopen only if a real non-agent automation cannot consume the structured refusal code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every board-write refusal exits 5 while retaining its distinct typed refusal code and message in the command contract.
- [x] #2 The command-contract proof checks BOARD_HELD and CLAIM_REVOKED mapping and the user-facing help documents exit 5 as a refused board write.
- [x] #3 No extra exit statuses are added without evidence from a real automation consumer.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the accepted command-contract design and executable mapping. 2. Run the command-contract proof. 3. Close this rejected alternative.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified on 2026-08-28: src/cli/command-contract/lib/common.ts assigns exit 5 to BOARD_HELD and CLAIM_REVOKED, src/cli/commands/run.ts maps declared refusals through the contract, and bun scripts/check-command-contract.mjs passed 61 proofs over 61 audited paths with 1011 checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the separate-exit-code proposal. The accepted CLI contract uses exit 5 for every refused board write and keeps BOARD_HELD, CLAIM_REVOKED, BOARD_VERSION_CONFLICT, and BOARD_CONFLICT distinct in structured refusal metadata and messages. Verified by the 61-path command-contract proof with 1011 checks; no real automation consumer justifies more process exit statuses.
<!-- SECTION:FINAL_SUMMARY:END -->
