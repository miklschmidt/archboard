---
id: TASK-513
title: >-
  A joined overview line says how many relationships it joins, and picking it
  shows them
status: Done
assignee:
  - '@claude'
created_date: '2026-10-24 00:55'
updated_date: '2026-10-24 01:35'
labels:
  - semantic-model
  - renderer
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
priority: medium
type: bug
ordinal: 920000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On Device Trust Library (version 7, variant Initial) the overview drew four lines with no label: C-compatible API to Rust core joins 5 calls, Rust core to Device Identity 3, and two lines join 2 each. ADR 0052 decided that a joined line has no label, so a reader could not tell a line of five relationships from one of one. The joined line also kept the id, description, emphasis, traffic and anchor of its first relationship (packages/board/src/shared/rules/scope.ts, oneLine). Picking it made the inspector name that one relationship and its real ends (for example "Poll and complete owned daemon crypto jobs", C-compatible API to Native crypto queue) as if it were the drawn line, and an agent was told the person had picked that one relationship. The owner chose on 2026-10-24 to label a joined line with its count and amend ADR 0052.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An overview line that joins several relationships carries a label that states how many it joins, in both the blocks and track engines
- [x] #2 A joined line carries no description, emphasis, traffic or anchor of one of its members, and a lone relationship is drawn as stated
- [x] #3 Picking a joined line in the overview shows the drawn ends, its kind and every relationship it joins, never one member as the line
- [x] #4 An agent told about a picked joined line in the overview is told every relationship it joins
- [x] #5 ADR 0052 and CONTEXT.md state the new rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scope.ts: overviewLines(content) returns each overview line with the relationships it joins; a joined line keeps id, order and the commonest kind, carries the label '<n> relationships' and nothing else of one member. Regression tests in packages/board/tests/shared/rules/scope.test.ts.
2. Browser inspector: when the pane shows the overview and the pick is a joined line, show a joined-line subject (drawn ends, kind, every joined relationship with its label and real ends).
3. Agent board context: a picked joined line in the overview resolves to every relationship it joins.
4. Amend ADR 0052 and CONTEXT.md (Overview).
5. Render Device Trust Library collapsed and Everything in blocks and track, inspect PNGs; verify the live pane after archboard restart.
No dogfood board is affected: the task rewires nothing that a board draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: packages/board/src/shared/rules/scope.ts oneLine dropped the label of a joined overview line (ADR 0052 as decided) and kept the first member's id, description, emphasis, traffic and anchor. The inspector (SemanticInspector explain -> subjectOf on the whole variant) and the agent context (board-context resolvedSelection) then read the representative id as that one relationship.
Verification: scope, agent-context and web inspection tests fail without the fix and pass with it. Device Trust Library v7 Initial re-rendered after archboard restart: collapsed blocks and track label the joined lines 5, 3, 2 and 2 relationships; Everything keeps every saved label in both engines. Live pane (port 3000, restarted): picking cAR746dp and JgI5f3OG shows the joined line, its drawn ends and every member.
tests/system/browser/semantic-board-viewer.test.ts traffic test opened a flat board in the overview, where its two relationships are one joined line; it passed only because the joined line kept the first member's traffic. It now opens Everything, which draws the two apart.
One gate run failed two first-layout timing bounds in packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts (3385 and 3077 ms against 3000) at load average 5. That test lays out whole variants, not the overview; both cases passed alone twice and in the next full run. Final bun run check passed to completion.
No dogfood board is affected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A line of the overview that joins several relationships now says how many it joins ('5 relationships') and carries nothing that only one member says. Picking it in the browser shows its drawn ends and every relationship it joins, and an agent is told every one of them. ADR 0052 and CONTEXT.md carry the amended rule. A joined line no longer carries a member's traffic or emphasis; if one moving member should make the joined line move, that is a follow-up decision.
<!-- SECTION:FINAL_SUMMARY:END -->
