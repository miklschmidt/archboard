---
id: TASK-559.24
title: Stop drawing a line between a module and its own part
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T03:36:00Z'
updated_date: '2026-10-31T03:59:00Z'
labels:
  - board
  - renderer
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-559
priority: high
ordinal: 996000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner saw a line leave the corner of the Agent CLI tab, cross the frame and end on Clipboard owner, and could not tell what it meant. It is an authored relationship from a module to a part that it holds. ADR 0052 says such a line means nothing, because the nesting already shows it, that archboard check warns with CONTAINER_LINE_TO_OWN_PART, and that a call inside a container starts at the part that makes it. Pull request 19 lost that check. This repository has 30 such relationships of 1,098, and every one of them draws.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No reading draws a line between an open module and a part that it holds, near or far, in any comparison
- [x] #2 The relationship stays listed in the panel and About, so nothing disappears from the model
- [x] #3 archboard check warns with CONTAINER_LINE_TO_OWN_PART on each such relationship, and a write can still store one
- [ ] #4 Each of the 30 relationships in this repository starts at the part that makes the call, or is removed if the source shows that no such call exists, through model operations with the code as evidence
- [ ] #5 archboard check reports none of them afterwards
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Stop drawing: filter connections (never allConnections) for a line between a module and a part that it holds, in scope, focus and exact-view readings.
2. Restore CONTAINER_LINE_TO_OWN_PART in the semantics check, with help text and the ADR 0052 amendment.
3. Teach the consumer skill.
4. Repair the 30 relationships through model claim, edit and release, each from source evidence.
5. Run the gate, record evidence, commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Line rule: drawnLines in model-lines.ts filters connections only. allConnections keeps the relationship, because the panel, About and selectedSubject read it; putting the rule in drawsConnection would have emptied allConnections and broken a panel row. The rule applies to the open module only. A door that holds the open module keeps its line: canonical-model-focus.test.ts picks that door, and the decision names the open module.
Repair: Agent CLI -> Clipboard owner now starts at Image clipboard (copy-image.ts:86). Browser -> Pane session starts at Pane composition (ApplicationPane.tsx:165). walkthrough -> Recorded talks starts at the recorder SMjRfwN3#ZAj4RMzN, which holds the write (record-walkthrough.ts:437) and the read (render-talk.ts:423); starting it at Recording entry raised RELATIONSHIP_UNDRAWN on Frame renderer. workspace -> Checkout registry is removed, because Repository listing -> Checkout registry already states the same call (repository-listing.ts:76).
Open: 26 relationships stay. In each, the container's own file makes or answers the call, and no part stands for that file. Authoring parts for those files is a product question for the owner. AC 4 and AC 5 stay unchecked until then.

Gate on the final tree: bunx vp run --no-cache check:all exit 0 in 141 s, 21 of 21 tasks, 44 of 44 browser owners, 5334 tests passed, 0 failed. archboard check code matches its baseline, 53 findings, none new. AC 1: own-part.ts counts 0 lines across every scope; a render with the rule off draws 9 connections and with it on 8. AC 2: Codex session still lists its 5 outgoing and 1 incoming own-part relationships, and a panel row still opens as a connection. AC 3: a scratch write stored one and check warned with exit 1.
<!-- SECTION:NOTES:END -->
