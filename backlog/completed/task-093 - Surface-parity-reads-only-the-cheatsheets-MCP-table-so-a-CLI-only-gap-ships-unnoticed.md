---
id: TASK-093
title: Superseded by the CLI-only command contracts
status: Done
assignee: []
created_date: '2026-08-22 15:40'
updated_date: '2026-08-28 00:35'
labels: []
dependencies: []
references:
  - scripts/check-surface-parity.mjs
  - skills/excalidraw-skill/references/cheatsheet.md
priority: medium
type: chore
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This task guarded parity between MCP and CLI documentation. TASK-124 removed MCP, check-surface-parity no longer exists, and the generated CommandContract registry plus CLI contract checks now own the one remaining command interface. There is no second command interface to compare.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The MCP command interface and check-surface-parity are absent after TASK-124.
- [x] #2 The generated CLI command contracts and their checks own every released command path.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the MCP interface and old parity check are absent. 2. Run the command-contract proof. 3. Close the superseded task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified on 2026-08-28: scripts/check-surface-parity.mjs is absent, package scripts contain no MCP parity gate, and bun scripts/check-command-contract.mjs passed 61 proofs over 61 audited paths with 1011 checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed as superseded by TASK-124 and TASK-123. Archboard is CLI-only, the MCP parity check is gone, and the schema-defined CommandContract registry now owns all 61 released command paths. Verified with 61 contract proofs and 1011 checks.
<!-- SECTION:FINAL_SUMMARY:END -->
