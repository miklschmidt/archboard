---
id: TASK-548.08
title: Deterministic layout replaces the speculative solves of a first render
status: To Do
assignee: []
created_date: '2026-10-26T16:24:00Z'
updated_date: '2026-10-27T16:21:00Z'
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

2026-10-27: the owner sides with the Opus grader's weighting. A compact picture, short direct lines and related cards close together count more than avoiding a header crossing; a header crossing is a flaw weighed against its cost, not a defect. Recorded in docs/design/grading-council.md (The owner's weighting); Codex was told to stop failing expectDrawingIntact on header crossings and to stop paying for header avoidance with detours.

2026-10-27, correction by the owner: a line through a group's or a parent's header is a defect and stays a hard check. Among pictures without defects, tight composition with no dead space reads better. The fix for the failed pairs must come from placement, not from detours and not from crossings. docs/design/grading-council.md updated; Codex told.

Council round 3, 2026-10-27, on 111d531c6 (with TASK-548.11's compact headers), graded under the owner's weighting. 44 blind pairs from Codex's paired SVGs (/tmp/548-08/round-3/changed-svg-pairs.json): the four round-2 failures, 30 views and 10 whole boards (seed 31); verdicts and key in /tmp/548-08/council-r3. The four acceptance pairs: better, unanimous. Overall: better 13, same 23, worse 8 (Command interface What the CLI can be asked, track and blocks; Archboard server Code evidence, blocks; Voice coordinator Tools and work, track; Board rasterizer Rasterizing, track; whole boards of Browser application blocks, Command interface blocks, Archboard track). The graders now agree on most pairs. One new defect, confirmed by the parent at full size: on the Voice coordinator whole board (blocks), a dashed magenta line and a gray line share one horizontal run with junction dots above Tools and work before they part to different targets. A reported blank region on Browser application's full-size picture came from rasterizing a 12,094 px picture, not from the layout. Pattern of the worse pairs: stretched strips (5.6:1 against 2.3:1), frames much larger than their members, clients across an empty span from their callers, and full-height routes to cards that sat beside their source. Quiet-box timing (load 1.0): Board viewer 265 ms first and 201 ms growing edit, Board persistence 302/290, Archboard server routes 142/134, Browser application 165/155, Live panes 106/103. By the procedure the change does not pass yet.

Council round 4, 2026-10-27, on 0737d8715 against round 3 (111d531c6), the first run with four graders (Opus, gpt-6.1-sol, gpt-6-astra, Gemini 4 Argon) and the agreed criteria (docs/design/grading-council/criteria.md). 42 blind pairs: the 10 round-3 problem pairs that changed (the 8 worse, the 043 trunk defect, one acceptance pair; three more were byte-identical to round 3) and a fresh sample of 25 views and 7 whole boards (seed 41). Pairs in /tmp/grading-r4; key, verdicts, rulings and tally in /tmp/548-08/council-r4. Rulings: every after picture was redrawn in the round-4 checkout byte-identical to the graded SVG and passes the renderer's hard checks (lines through cards, through parent and group headers, ambiguous trunks, ends off cards, unframed parents), so all 9 of Argon's reports on after pictures are false; its 13 reports on before pictures were looked at full size and are false. Two before pictures have real defects: 034 A (Board viewer Picture supply, blocks: a gray line crosses a teal line through a junction dot without a hop, reported by Opus) and 009 (Voice coordinator whole board, blocks: round 3's confirmed shared trunk, reported by nobody this round). Tally (scripts/council-tally.ts): better 8, same 34, worse 0, both fail 0, no after picture with a new defect. The change passes. Of the round-3 worse pairs, What the CLI can be asked (track and blocks), Rasterizing (track) and Archboard whole board (track) are now better; Code evidence (blocks), Tools and work (track), Browser application and Command interface whole boards (blocks) are the same. Graders still name large empty bands inside Commands and Workspace packages and long bus routes. Grader reliability: Argon reported 22 defects and none was real, and its margins spread widest; Sol and Astra reported none and missed both real ones. Quiet-box timing on 0737d8715 (load 2.1, two runs): Board viewer 261 ms first and 199 ms growing edit, Board persistence 300/289, Archboard server routes 141/135, Browser application 165/157, Live panes 105/102.
<!-- SECTION:NOTES:END -->
