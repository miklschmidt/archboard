---
id: TASK-548.08
title: Deterministic layout replaces the speculative solves of a first render
status: To Do
assignee: []
created_date: '2026-10-26T16:24:00Z'
updated_date: '2026-10-27T04:10:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 961000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner's goal is real-time scene changes, with complex boards (Board viewer, Board persistence, Archboard server routes on main's vault) laid out in under 500 ms. Today a first render lays a board several ways in parallel solves (the stacking choice, wrap candidates, joins and regions choices) and keeps the best, and each solve calls Graphviz many times through a text port. The owner sees layout as a math problem that deterministic heuristics can decide up front, and allows moving the layout into the vendored Graphviz crates (crates/vendor, no upstream compatibility needed). Byte-identical drawings are no longer required: the grading council of TASK-548.09 judges every changed drawing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 First renders of the slowest vault boards are measured before and after on a quiet box, and recorded in docs/design
- [ ] #2 Every changed drawing passes the grading council of TASK-548.09, and the council's verdicts are recorded
- [ ] #3 The design and the levers tried, kept or dropped are recorded in docs/design, with ADRs for any decision that replaces ADR 0059 or ADR 0060
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Council, 2026-10-26, on f55ca07dc (the only changed drawings: the whole-board Track pictures of Browser application and Command interface). Blind pairs in /tmp/grading-548-08 (overview and full-size Chromium rasters), key and verdicts kept in /tmp/548-08/council. Unanimous: Command interface reads better after (Opus, gpt-6.1-sol, gpt-6-astra: top-to-bottom reading, shorter routes). Browser application reads worse after, and all three name a defect new in the after picture: parent cards (Semantic viewer, Workspace routing, Pane session, Walkthrough replay, Walkthrough recording, Voice session) are drawn with no frame, so their lines end in blank space beside a title. The parent confirmed it on Semantic viewer in the full-size after picture; the before picture frames it. By the procedure (docs/design/grading-council.md), the change fails as it stands and is not merged.

Council round 2, 2026-10-27, on 71b949d87 against feat/faster-first-render (layout of f06fa5317). 162 drawings of the vault differ (light, plain) plus 34 whole boards. Blind sample: 30 views (council-pairs --limit 30 --sample --seed 27) and 10 whole boards (Browser application and Command interface track, eight seeded at random), /tmp/council/r2; verdicts and key kept in /tmp/548-08/council-r2. Majority: better 25, same 11, worse 4. Worse: Archboard server Code evidence (track), Command interface Startup parts (track), Skill evaluation Run checks (blocks), Voice coordinator whole board (track). The council split in a pattern: Opus judged the new layout worse on 20 pairs that gpt-6.1-sol and gpt-6-astra judged better; Sol and Astra weigh the fixed defects, Opus weighs compactness. Defects the graders named: header crossings 92 before, 7 after; merged trunks 44 before, 4 after; no parent without a frame. The cost the worse pairs share: a line sent around the whole picture or a frame's full height to avoid a header, and collaborators split by a large empty span inside a frame. By the procedure the change does not pass yet. Timing on a quiet box (load 1.4, scratch edits script, two runs): Board viewer first 442 ms and growing edit 380 ms (branch 1,562 and 1,476), Board persistence 229/224 (1,586/1,603), Archboard server routes 150/142 (607/603), Browser application 185/173 (565/754), Live panes 118/115 (387/418). Board viewer's picture grows from 8933x6525 to 10306x9117.
<!-- SECTION:NOTES:END -->
