---
id: TASK-563
title: Polish the reader before PR 26 merges
status: In Progress
assignee:
  - '@codex'
created_date: '2026-11-02T13:25:00Z'
updated_date: '2026-11-02T19:39:00Z'
labels:
  - reader
  - design
dependencies: []
priority: high
ordinal: 1012000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner's running list of reader problems found while testing PR 26. Each new problem joins this task as an acceptance criterion, so that nothing lives only in a conversation. The PR stays open until every criterion is checked, and the README refresh comes last because it films the final picture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A tip stands against its part, in architecture, sequence and walkthrough readings, and hides nothing lit where any nearby spot leaves it in view
- [x] #2 A chosen relationship rings its label, and its line keeps its own ink
- [x] #3 A door takes the colour of its placing group or kind, a door with neither stands neutral, and the model's packages no longer read as one concern
- [x] #4 A right click on a part selects it and opens a menu at the cursor, and anywhere else the browser keeps its own menu
- [x] #5 The menu copies a reference to a subject: its identity, ends, kind, words and the reading's address
- [x] #6 A card widens for its group tags, so its name keeps the top of the card and no card opens on an empty band
- [x] #7 This model names applications as Application, and keeps Service for what serves
- [x] #8 Page start to Talk contract is a call
- [x] #9 A label never stands over a stretch of its own line (Vault address to Vault finder)
- [x] #10 The full gate passes and an independent review of the final diff approves
- [x] #11 The README assets show the final picture
- [x] #12 A flowchart's lines that reach one step join into one trunk: no two run side by side and none stops short of the join (dTfYgmVn, End)
- [x] #13 A consumer without Nix can follow INSTALL.md to the toolchain that builds the product
- [x] #14 The project requires Bun 1.4.4 and a patched Node.js on every route
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: a tip stands in the top corner across from the pointer, with its delay unchanged at 450 ms. A presented walkthrough box takes the foot of the pane, so the tip keeps to the top. One picked line keeps a gold bed at 0.3 opacity. Several lines keep their own ink and stay selected for raising and picking, through the quietLines mark. A door with no colour stands in the neutral finish everywhere, which also affects external and other in the default configuration. In this model, module, function and external claim no colour, Source code is a new group, and eight packages take the colour of their concern. The other eight root packages share teal because they are the shared foundation. Route and datastore share cyan, and ui, config and checks share pink, because these kinds are rare. Doors avoid amber, green and red because these read as gold, added and removed. Relationship colours stay. The model change is a direct edit of current. Proposal JTZvj2vi followed it and was not adopted. capture-native-fixture.ts refuses here, because reading proposal LjzZMsi7 of examples/web-shop needs an archive, so the svg of the recommendations fixture was redrawn from its stored request.

Undecided, for the owner: why flowcharts show the module icon so often. Boxes carry the receiver's kind, and I recommended dropping the icon because the line under each box already names the receiver. Nothing changed yet. Superseded decisions: the top corner for tips, the faint bed under one line, the quiet lines mark, and the row of tags under a name are all gone. Tips now stand against their part, a chosen line's label wears the ring, and a card widens for its tags.

Gate 9 on 600456d1a passed with exit 0, 21 of 21 tasks and 49 of 49 browser owners. The review of 204e86cc2..600456d1a ended APPROVE after five delivered rounds; one round was cancelled unread. S4 was at first declined on a sampling check that was too coarse; a check at one pixel steps showed the reviewer's U-shaped overlap on board-rasterizer.json, so first_fit in selection.rs takes a later route when words would stand on their own line, and keeps the first route when none is clear. S8, a nit about partial improvement when an overlap persists across every candidate, is declined: no reading shows that case. The block packing test was deleted because its outcome depended on that overlap; the column rule is now a unit test. A wider tagged card can change how a fan wraps: the fan test's group is now named Writes, and with Board writes that fan takes three rows.

Flowchart joins (criterion 12): a straight line a few units off the middle of End kinked at its foot and ran beside the others, and that kink took the last bend from a line that joined the lane, because same_turn matched both ends of the kink's small turn to one end of the bend. same_turn now pairs ends, and a straight line under 16 units off the middle slides whole, with its words, along the card or loop at its other end. Across 72 flowcharts and 1487 lines the scan went from 3 kinks, 1 cut bend and 1 side by side pair to none, and 5 flowcharts changed. A line within reach of a bridge keeps its place and its kink: reviewers broke three guards built from a bridge's names, so the rule is one of place, grown by the farthest slide. No test owns the words moving with the line. Gate 15 on 5d3b3268c failed in one browser owner, codex-live-voice.test.ts, at the operability of the dock's mute control. No code of the voice dock changed since gate 14 passed on d2b3985cd. Gate 16 on 2a5a0ab4f, the same code and a Backlog commit, passed with exit 0, 21 of 21 tasks and 49 of 49 browser owners. The failed step reads the dock's control straight after a Tab press with no retry, so this is a timing flake that was not reproduced or diagnosed further. The README refresh was reviewed in round 7 and the join fix in rounds 8 to 12, the last of which approved. readme:check reports 17 of 17 current, and archboard check embeds exits 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Polished the reader before PR 26 merges. A tip stands against its part. A chosen line's label wears the ring and the line keeps its ink. A right click on a part opens a menu at the cursor that explains it or copies a reference, and the browser keeps its menu elsewhere. A card widens for its tags. A label stays off its own line wherever any route allows. A flowchart's lines join on one lane. A door takes the colour of its group or kind, or stands neutral. The model gains an Application kind, and Page start to Talk contract is a call. All 17 README assets show the final picture. Gate 16 passed on the final code after one timing failure in the voice dock's browser owner on the run before, and an independent review approved the final diff. Risks and open decisions stay in the PR: the module icon in flowcharts is undecided, and no test owns the words that move with a sliding line.
<!-- SECTION:FINAL_SUMMARY:END -->
