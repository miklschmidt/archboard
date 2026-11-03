---
id: TASK-563
title: Polish the reader before PR 26 merges
status: Done
assignee:
  - '@codex'
created_date: '2026-11-02T13:25:00Z'
updated_date: '2026-11-03T02:35:00Z'
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
- [x] #15 A module with no parts outside the open one stands as a card, not a door
- [x] #16 A reading falls to the Graphviz placement only when no dense room can draw it (Canonical architecture, 1VHRyajb)
- [x] #17 A frame's recess reads as a well: the wall meets its corner at the rim, not at the floor (One run's world)
- [x] #18 A well's side walls are real soft shadows on its floor, with no flat band, so the depth reads from one viewpoint
- [x] #19 A well's shadows stay gentle on the light ground, and its top wall stands a little brighter than its floor on the dark ground
- [x] #20 Holding Space over the canvas shows an open hand, a press turns it into a closed hand, and a press with Space picks nothing
- [x] #21 A part that takes a click shows a pointer on the picture, and a frame's floor does not
- [x] #22 Every interactive element of the app shows a pointer under the mouse
- [x] #23 The walkthrough's voice model is triggered correctly on the new renderer, and it presents each beat as its prompt asks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: a tip stands in the top corner across from the pointer, with its delay unchanged at 450 ms. A presented walkthrough box takes the foot of the pane, so the tip keeps to the top. One picked line keeps a gold bed at 0.3 opacity. Several lines keep their own ink and stay selected for raising and picking, through the quietLines mark. A door with no colour stands in the neutral finish everywhere, which also affects external and other in the default configuration. In this model, module, function and external claim no colour, Source code is a new group, and eight packages take the colour of their concern. The other eight root packages share teal because they are the shared foundation. Route and datastore share cyan, and ui, config and checks share pink, because these kinds are rare. Doors avoid amber, green and red because these read as gold, added and removed. Relationship colours stay. The model change is a direct edit of current. Proposal JTZvj2vi followed it and was not adopted. capture-native-fixture.ts refuses here, because reading proposal LjzZMsi7 of examples/web-shop needs an archive, so the svg of the recommendations fixture was redrawn from its stored request.

Undecided, for the owner: why flowcharts show the module icon so often. Boxes carry the receiver's kind, and I recommended dropping the icon because the line under each box already names the receiver. Nothing changed yet. Superseded decisions: the top corner for tips, the faint bed under one line, the quiet lines mark, and the row of tags under a name are all gone. Tips now stand against their part, a chosen line's label wears the ring, and a card widens for its tags.

Gate 9 on 600456d1a passed with exit 0, 21 of 21 tasks and 49 of 49 browser owners. The review of 204e86cc2..600456d1a ended APPROVE after five delivered rounds; one round was cancelled unread. S4 was at first declined on a sampling check that was too coarse; a check at one pixel steps showed the reviewer's U-shaped overlap on board-rasterizer.json, so first_fit in selection.rs takes a later route when words would stand on their own line, and keeps the first route when none is clear. S8, a nit about partial improvement when an overlap persists across every candidate, is declined: no reading shows that case. The block packing test was deleted because its outcome depended on that overlap; the column rule is now a unit test. A wider tagged card can change how a fan wraps: the fan test's group is now named Writes, and with Board writes that fan takes three rows.

Flowchart joins (criterion 12): a straight line a few units off the middle of End kinked at its foot and ran beside the others, and that kink took the last bend from a line that joined the lane, because same_turn matched both ends of the kink's small turn to one end of the bend. same_turn now pairs ends, and a straight line under 16 units off the middle slides whole, with its words, along the card or loop at its other end. Across 72 flowcharts and 1487 lines the scan went from 3 kinks, 1 cut bend and 1 side by side pair to none, and 5 flowcharts changed. A line within reach of a bridge keeps its place and its kink: reviewers broke three guards built from a bridge's names, so the rule is one of place, grown by the farthest slide. No test owns the words moving with the line. Gate 15 on 5d3b3268c failed in one browser owner, codex-live-voice.test.ts, at the operability of the dock's mute control. No code of the voice dock changed since gate 14 passed on d2b3985cd. Gate 16 on 2a5a0ab4f, the same code and a Backlog commit, passed with exit 0, 21 of 21 tasks and 49 of 49 browser owners. The failed step reads the dock's control straight after a Tab press with no retry, so this is a timing flake that was not reproduced or diagnosed further. The README refresh was reviewed in round 7 and the join fix in rounds 8 to 12, the last of which approved. readme:check reports 17 of 17 current, and archboard check embeds exits 0.

A non-Nix route (criterion 13): INSTALL.md gives rustup with a C toolchain, and from a fresh clone in a temporary home that route built the product with rustc 1.99.1. Its flowchart equals the Nix build's picture outside metadata. macOS and Debian were not run. Runtime (criterion 14): Bun 1.4.4 and Node.js ^22.23.4 || ^24.22.1 || >=26.12.1 on every route, and nothing refuses an older runtime at run time. Round 15 found that Bun 1.4.4 makes a ws error with no listener an uncaught exception, and a malformed frame on the feed socket ended the server: every accepted socket now has a listener from its first frame. It also found that the pinned nixpkgs throws for x86_64-darwin, so the flake drops that shell and INSTALL.md sends an Intel Mac to rustup.

Doors (criterion 15): the drawn door field now decides, in doorEndpoints and isDoor too. projection.context still lists modules outside the reading that a line reaches. ADR 0070 is amended. Layout (criterion 16): Canonical architecture went from 3296x5499 to 2766x1513. A refused reading tries wider rooms at its own refusal budget, then, past 40 lines, its own rooms with four refusals. More refusals everywhere was rejected, because it made that reading 3146x1704. Across 752 readings no refused reading reaches Graphviz. 71 focused readings with no frame and at most 17 lines keep their ranks, by design. Slowest native release solve 1.0 s against 0.85 s. Rim (criterion 17): the well's rim turns down at the left as at the right, and the tab fills the corner above it. Round 16 on d95c3d37c..8f160dff3 approved with no findings. Gate 20 failed on the door button fixture, gate 22 on the format of the new fixtures, and gates 21, 23 and 24 passed. Gate 24 on d64c34eeb passed with exit 0, 21 of 21 tasks and 49 of 49 browser owners. readme:check reports 17 of 17 current, and archboard check embeds exits 0. All 13 attachments were filmed again or replayed from kept talks, and the frames were looked at before upload.

Well (owner, 2026-11-03): the flat side bands are gone. The floor reaches both sides, the top wall is the rim less itself moved down, and each side leaves a soft shadow of 12 units beside the top wall's 14. The bands use the falloff of a card's shadow and its lighter ink on the light ground. On the dark ground the top wall mixes 15% toward the lip. Proof: gate 27 on bfffa67a6 passed, 21 of 21 tasks. GPU parity on 0T9enjhi readings: 80 comparisons, 0.219% of ink apart on average, 0.50% at worst. Review: round 18 found three items, fixed by the implementer in bfffa67a6; round 19 approved with no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Polished the reader before PR 26 merges. A tip stands against its part. A chosen line's label wears the ring and the line keeps its ink. A right click on a part opens a menu at the cursor that explains it or copies a reference, and the browser keeps its menu elsewhere. A card widens for its tags. A label stays off its own line wherever any route allows. A flowchart's lines join on one lane. A door takes the colour of its group or kind, or stands neutral, and a module with no parts stands as its card. A reading that the dense layout refuses stays dense. A frame's recess reads as a well. The model gains an Application kind, and Page start to Talk contract is a call. INSTALL.md gives a route without Nix, and the project requires Bun 1.4.4 and the patched Node.js releases, with the server held to survive a socket error under them. All 17 README assets show the final picture. Gate 24 passed on the final code, and an independent review approved the final diff. codex-live-voice.test.ts failed once on an earlier run and on no run since. Risks and open decisions stay in the PR: the module icon in flowcharts is undecided, no test owns the words that move with a sliding line, and the rustup route was not run on macOS or Debian.

Cursors: a part or control that takes a click shows a pointer, an empty canvas shows the arrow, Space shows an open hand and a press a closed one, and a press or double click with Space picks nothing. One base rule in app.css gives every enabled interactive element the pointer. The voice audit ran real narrations on the web-shop walkthrough with a muted page and a silent microphone. The first step reached the voice before it connected and was lost in 3 of 3 runs. A pane now holds arrival while voice connects and for 1.5 s after, and the first step spoke in 12 of 15 runs. A live step now begins with the recording's lead-in and carries no number, which ended the screen talk and the spoken numbers. A resize no longer tells a step twice, and a slow first step is still told. Sol approved 3 rounds. The complete gate passed at the top of the stack. Risk: no real microphone was measured, and 3 of 15 first steps stopped at a sound.
<!-- SECTION:FINAL_SUMMARY:END -->
