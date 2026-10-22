---
id: TASK-506
title: Renderer keeps routes and labels clear around nested implementation parts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-22 03:28'
labels: []
dependencies: []
references:
  - TASK-501
  - packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts
priority: high
type: bug
ordinal: 913000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-501 normal gate exposed two renderer failures when current boards gained responsibility-based bound children. Agent workbench with Track leaves label 2wlebJ2T off its own route. Browser application with Blocks routes four relationships through the five new cards inside Semantic viewer. The unchanged wide-board owner fails both clearance contracts. Fix the renderer rather than changing board meaning or weakening assertions. Full gate log: /tmp/archboard-task501-check.log. Isolated reproduction: bun test --isolate packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts --test-name-pattern with Agent workbench track and Browser application blocks. Remaining normal lanes run under the TASK-501 monitor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Track keeps the Agent workbench publication label on its own route after the nested owner is drawn
- [ ] #2 Blocks routes Browser application relationships clear of the cards inside a container endpoint
- [ ] #3 Focused renderer owners and the complete normal gate pass without weakening clearance, timing, or coverage contracts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Diagnose and minimize the two observed clearance failures, then repair their existing routing seams. Keep public behavior and board meaning unchanged. No architecture board is affected by the internal rendering correction. Run the focused repro after each relevant fix, then the complete normal gate after the repairs.
<!-- SECTION:PLAN:END -->
