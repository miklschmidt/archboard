---
id: TASK-333
title: 'Relationships share a lane only when their kind, emphasis and traffic match'
status: To Do
assignee: []
created_date: '2026-09-24 13:59'
updated_date: '2026-10-11 14:18'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 574000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User decision 2026-09-24: relationships of one kind may share a lane on purpose (it reads cleaner than parallel lines, e.g. Archboard's 'register a checkout' and 'resolve code targets' into Repository checkout), but a difference in emphasis or traffic must give separate lanes too, not only a difference in kind. Seen on Codex workhorse: one lane comes down between Thread link and Codex session and forks into two arrowheads pointing opposite ways, with half a bridge at the fork.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two relationships that differ in kind, emphasis or traffic never share a lane
- [ ] #2 Relationships that match in all three still share a lane where they do today
- [ ] #3 One test owner fails without the fix
- [ ] #4 Every view of every dogfood board still draws, and each picture that changed was looked at and is no worse
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline: render the dogfood-vault gallery on both engines before the change (bun scripts/engine-gallery.ts, outputs in the scratchpad).
2. Pass emphasis and traffic (on/off) to layout as archboard.relationship.emphasis / .traffic in compound-graph.ts.
3. Add both to trunkKind (track/route.ts) and kindOf (blocks/joins.ts); tree.kindOf and joinOf inherit it.
4. Test: same-kind, same-direction lines that differ only in emphasis (or only in traffic) never share a run (matched-kind-channels.test.ts); matching lines still share.
5. Render the gallery again, compare SVGs byte for byte, look at each changed picture, record judgement in the notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Stopped, not committed (AC4 fails). Trial on branch task-333-trial (ae25c50bd, local only): emphasis (value) and traffic (on/off) passed to layout as archboard.relationship.emphasis/.traffic in lib/layout/compound-graph.ts; both added to trunkKind (lib/track/route.ts); lib/blocks/joins.ts kindOf deleted (it duplicated trunkKind) and tree.ts uses trunkKind; test matched-kind-channels.test.ts gains 'different emphasis/traffic uses distinct same-kind channels' on both engines (fails on HEAD with a 40 to 209 px overdrawn run, passes with the change) and its fixture is made alike in emphasis so 'may share' stays green.
Gallery of the dogfood vault (58 drawings x track and blocks = 116 SVGs, HEAD vault copy, byte compared; two runs of HEAD are byte-identical): 66 changed (29 track, 37 blocks), 50 unchanged. Every changed picture was looked at (8 opus reviewers at full resolution, plus my own look at Codex workhorse One turn, Command dispatch and Renderer integration; scorecard numbers from drawn-scorecard.ts). Track: 0 worse; 25 better (merged trunks into one arrowhead now separate, e.g. Codex workhorse One turn draws its three lines into Codex session apart), 4 about the same. Blocks: 17 of 37 read worse, 16 better, 4 same. Total crossings Track 1036 to 1010, Blocks 2261 to 2654; Blocks crossings rise in 20 of 58 drawings. Worse Blocks pictures: Agent workbench One tab session and whole, Archboard server whole, Browser application Working with an agent, Codex workhorse Starting a workhorse, Command dispatch whole (fit 0.84 to 0.64, contract + signal loops round the whole page top), Command interface One command's path and whole, Live panes Board news, Pane connections and whole, Semantic renderer Architecture drawing, Renderer integration (teal line loops round the page, 470 px to 1450 px) and whole, Skill evaluation Grading and whole, Voice coordinator whole.
Five renderer tests fail with the change and pass on HEAD: lone-regions 'Command interface: the track engine turns no line more than without its regions round one card' (a bridge hop appears in the grouped drawing only), block-packing 'a row of blocks reads in the order their lines run' (Voice coordinator, order flips), standing 'keeps this simple fixture's cards stable...' (fixture edges differ in emphasis, so standing no longer decides the trunk), turn-back 'Command interface: the blocks engine runs a labelled line out and not back', routing-rules 'Blocks straightens a lane even where it crosses more' (b3s3lWZn 0 to 8 turns). The first and third are fixture premises the change moves; the other three pin Blocks heuristics that now fail on reduced dogfood fixtures.
Cause: Blocks reads kindOf for ports, trunks, joins and exit sides, so a split key re-lays whole boards (packing and order) and a separated trunk of N lines crosses what it crossed N times. Variant B (only trunkKind and the layout options, Blocks block keys unchanged) changes Blocks far less (crossings up in 4 of 58 drawings, 2261 to 2388) but Blocks then still shares lanes between blocks, so AC1 fails there and the new test fails on blocks. Decision for the user: accept the Blocks cost, ship Track plus Blocks-in-card only, or rework Blocks' lane splitting. docs/design/container-rules.md line 33 (kind, comparison standing and local direction share ports) needs emphasis and traffic if the change lands.
<!-- SECTION:NOTES:END -->
