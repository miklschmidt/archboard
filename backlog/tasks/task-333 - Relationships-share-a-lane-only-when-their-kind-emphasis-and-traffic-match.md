---
id: TASK-333
title: 'Relationships share a lane only when their kind, emphasis and traffic match'
status: Done
assignee:
  - '@implementer'
created_date: '2026-09-24 13:59'
updated_date: '2026-10-11 14:36'
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
- [x] #1 On Track (the default engine), two relationships that differ in kind, emphasis or traffic never share a lane
- [x] #2 On Track, relationships that match in all three still share a lane where they do today
- [x] #3 One test owner fails without the fix (Track engine)
- [x] #4 Every view of every dogfood board still draws on both engines, each Track picture that changed was looked at and is no worse, and every Blocks picture is byte-identical
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Track only (parent decision 2026-10-11, after the trial on task-333-trial): pass emphasis and traffic to layout only for Track (compoundGraph byLook), add both to trunkKind, which the block tree and joins now read instead of their own copy, so Blocks draws byte-identical SVGs. Test: matched-kind-channels 'different emphasis/traffic uses distinct same-kind channels' on Track. Fixtures whose premise moved (lone-regions Command interface, standing, matched-kind-channels) are made alike in emphasis. Docs: container-rules.md, layout-rules.md section 47.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Stopped, not committed (AC4 fails). Trial on branch task-333-trial (ae25c50bd, local only): emphasis (value) and traffic (on/off) passed to layout as archboard.relationship.emphasis/.traffic in lib/layout/compound-graph.ts; both added to trunkKind (lib/track/route.ts); lib/blocks/joins.ts kindOf deleted (it duplicated trunkKind) and tree.ts uses trunkKind; test matched-kind-channels.test.ts gains 'different emphasis/traffic uses distinct same-kind channels' on both engines (fails on HEAD with a 40 to 209 px overdrawn run, passes with the change) and its fixture is made alike in emphasis so 'may share' stays green.
Gallery of the dogfood vault (58 drawings x track and blocks = 116 SVGs, HEAD vault copy, byte compared; two runs of HEAD are byte-identical): 66 changed (29 track, 37 blocks), 50 unchanged. Every changed picture was looked at (8 opus reviewers at full resolution, plus my own look at Codex workhorse One turn, Command dispatch and Renderer integration; scorecard numbers from drawn-scorecard.ts). Track: 0 worse; 25 better (merged trunks into one arrowhead now separate, e.g. Codex workhorse One turn draws its three lines into Codex session apart), 4 about the same. Blocks: 17 of 37 read worse, 16 better, 4 same. Total crossings Track 1036 to 1010, Blocks 2261 to 2654; Blocks crossings rise in 20 of 58 drawings. Worse Blocks pictures: Agent workbench One tab session and whole, Archboard server whole, Browser application Working with an agent, Codex workhorse Starting a workhorse, Command dispatch whole (fit 0.84 to 0.64, contract + signal loops round the whole page top), Command interface One command's path and whole, Live panes Board news, Pane connections and whole, Semantic renderer Architecture drawing, Renderer integration (teal line loops round the page, 470 px to 1450 px) and whole, Skill evaluation Grading and whole, Voice coordinator whole.
Five renderer tests fail with the change and pass on HEAD: lone-regions 'Command interface: the track engine turns no line more than without its regions round one card' (a bridge hop appears in the grouped drawing only), block-packing 'a row of blocks reads in the order their lines run' (Voice coordinator, order flips), standing 'keeps this simple fixture's cards stable...' (fixture edges differ in emphasis, so standing no longer decides the trunk), turn-back 'Command interface: the blocks engine runs a labelled line out and not back', routing-rules 'Blocks straightens a lane even where it crosses more' (b3s3lWZn 0 to 8 turns). The first and third are fixture premises the change moves; the other three pin Blocks heuristics that now fail on reduced dogfood fixtures.
Cause: Blocks reads kindOf for ports, trunks, joins and exit sides, so a split key re-lays whole boards (packing and order) and a separated trunk of N lines crosses what it crossed N times. Variant B (only trunkKind and the layout options, Blocks block keys unchanged) changes Blocks far less (crossings up in 4 of 58 drawings, 2261 to 2388) but Blocks then still shares lanes between blocks, so AC1 fails there and the new test fails on blocks. Decision for the user: accept the Blocks cost, ship Track plus Blocks-in-card only, or rework Blocks' lane splitting. docs/design/container-rules.md line 33 (kind, comparison standing and local direction share ports) needs emphasis and traffic if the change lands.

Shipped for Track only (parent decision 2026-10-11 after the trial on task-333-trial, which stopped because Blocks got worse). compoundGraph(..., byLook) passes archboard.relationship.emphasis and .traffic (on/off) to layout only from layoutTracks; trunkKind (track/route.ts) holds both. Departure from the instruction: Blocks' own kindOf in blocks/joins.ts is deleted and joins.ts, tree.ts and card-layout.ts all read trunkKind, because Track runs through the same block tree and joins (inline nesting), so Track needed their key to change too (with trunkKind alone 5 whole-board Track drawings differed from the trial's reviewed ones). Blocks edges never carry the new options, so trunkKind answers 'normal|off' for all of them and every key Blocks builds differs from HEAD's by a constant suffix only.

Evidence: dogfood-vault gallery (bun scripts/engine-gallery.ts, 61 drawings per engine) rendered from a HEAD tree (git archive in the scratchpad) and from the changed tree on the same vault: 0 of 61 Blocks SVGs differ byte for byte; Track 34 differ, the 29 the trial reviewed (byte-equal to the trial's after2 outputs except Archboard server whole, whose board changed since) plus 5 Archboard server drawings whose board changed since the trial (Board request path, One write lands, routes Board writes, Reads and checks, routes whole). Track crossings 857 to 836. Looked at with the Read tool: Command dispatch whole (better, fewer shared stretches, 1 to 2 crossings), Codex workhorse One turn (better, three lines end in three arrowheads), Voice coordinator Workhorse news (same or better), Archboard server Board request path, One write lands (same), routes Reads and checks, routes whole (better), routes Board writes (about the same: crossings 8 to 16 for lines that no longer share a trunk). Renderer integration is byte-identical on Track (it only changed on Blocks in the trial). Renderer suite: bun test --isolate src/runtime/semantic-renderer src/transformers 601 pass 0 fail.

Known gap, Blocks: Blocks still shares a lane across lines that differ in emphasis or traffic. With the same change Blocks re-laid 37 of 58 drawings and 17 read worse (crossings 2261 to 2654) because it reads the lane key for ports, trunks, joins and exit sides; keying only the router left it sharing lanes between blocks (crossings 2261 to 2388, 4 drawings worse). Recorded in docs/design/layout-rules.md section 47; no follow-up task created.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Relationships on Track (the default engine) now share a lane only when kind, comparison standing, emphasis and traffic match; Blocks draws byte-identical SVGs (known gap recorded). Verified by matched-kind-channels.test.ts ('different emphasis uses distinct same-kind channels' and 'different traffic ...' fail without the change; 'routes leaving one gateway in one direction may share a run' stays green), the renderer suite (601 pass, 0 fail), and a before/after gallery of the dogfood vault: 0 of 61 Blocks SVGs differ, 34 Track SVGs changed and were looked at, none worse.
<!-- SECTION:FINAL_SUMMARY:END -->
