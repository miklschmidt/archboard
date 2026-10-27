---
id: TASK-548.10
title: >-
  A shared trunk never joins lines from different sources that go to different
  targets
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T17:03:00Z'
updated_date: '2026-10-27T12:51:00Z'
labels:
  - renderer
  - layout
dependencies: []
parent_task_id: TASK-548
type: bug
ordinal: 963000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the grading council's first run (TASK-548.09, 2026-10-26) all three graders, each with its own criteria, reported the same defect in four of six Blocks boards: lines from different sources merge onto one trunk and split again toward different targets, so a reader cannot tell which source reaches which target. Examples on feat/faster-first-render 44174b7ba: Board rasterizer, view Walkthrough video (Record command and Replay command merge below Record command, then split to Recording entry and Frame renderer); Codex workhorse, Workhorse operations responsibilities (Operation lifecycle and Operation validation merge and split to Thread link and Epoch ledger); Command dispatch, Command routing; Command interface, Contract parts. The graders also saw these trunks cross group header cards, and in Command dispatch and Command interface an arrowhead end on a group frame rather than a card. Pictures: /tmp/grading-calib/pairs/{016,035,038,039}.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A trunk carries only lines that share their source or share their target
- [ ] #2 No line crosses a group's header card, and every arrowhead ends on a card
- [ ] #3 The grading council judges the changed drawings to read as well or better
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture the four council cases as native render requests and add a red check for trunks that carry unrelated endpoint pairs. 2. Trace Live panes edge 0L2qr5ja through planning, connection-point movement, and final simplification. Fix group-wall and header clearance at the stage that loses it. 3. Preserve endpoint identity when lines share ports and trunks. Every shared trunk must share a source or a target, and arrowheads must meet their intended card. 4. Run drawing integrity, the standard and whole-board corpora, and provide both SVG sides for parent grading. Keep the council acceptance pending.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-548.08 now reaches routing while repairing the unconditional Groups candidate. The parent-frame and group-context repairs pass their Rust regressions, but Live panes (Track) edge 0L2qr5ja still runs ten units beside the panes region wall. A native replay is red in /tmp/548-08/post-553/wallhug. Greedy reduction retains 28 nodes and 60 edges because the spacing depends on the global layout. The original council trunk cases remain the required endpoint-identity regressions. The owner explicitly brought TASK-548.10 into scope when this work reaches routing.

Correction: the retained Live panes segment runs two units beside the panes region wall, not ten. It lies at x=2985.14 beside the wall at x=2987.14 for 1340 units. Removing bridges leaves the same segment.

The native probes remove all ambiguous trunks from the four council cases. The broader check exposes the same defect on large Blocks drawings. Three causes are fixed in the candidate: port keys lose card identity, gap sizing counts coincident routes as one position, and score-based settling can prefer an overlapping route. Another probe finds compressed face ports on large blocks. The caption checker catches painted backgrounds crossing routes even when the caption words are clear. The new endpoint checker finds an Archboard arrow 20 units beyond a fitted frame. Retaining terminal points during frame fitting repairs that replay. None of these probes constitutes a council verdict.

The broader routing probe now fixes a second cause: the X pass sees vertical runs that only touch, then the Y pass moves their turn and creates a 48-unit overlap at 0.6-unit separation. A reduced two-route regression reproduces this. Reserve their lanes at the touch when unrelated routes approach within one lane at their current or desired positions. Both complete Blocks drawings of Board viewer and Archboard server routes now contain no ambiguous trunk in /tmp/548-08/post-553/touch-wanted-wide. All 17 router tests pass. Extra passes are rejected: they disturb Viewer and a convergence probe costs 75.6 s in the unoptimized replay. The full-face port probe is also rejected because it increases Viewer from 12 ambiguous pairs to 15 and adds a wall overlap. Retain reachable port spans and the face capacity bound. The wider diagnostic still reports compressed Blocks lanes. Council acceptance and the complete corpus remain pending.

Milestone de398584a removes the unrelated shared trunks but does not yet satisfy the full header criterion. Manual inspection of /tmp/548-08/post-553/after-6-council-fixtures/2.png finds argv crossing the blank face of Command routing. A new checker reads the complete painted header rectangle, and a stricter target checker rejects an arrow on a parent frame away from that header card. All four council fixtures are red in /tmp/548-08/post-553/header-faces-red.log. The next probe gives descendant traffic side entries below a frame header and gives parent targets the visible header top. It also keeps full inline header faces clear during routing and simplification. Council acceptance remains pending.

The full header-face probe now clears all 23 native whole Track boards and all 23 Blocks boards for the strict integrity criteria. Blocks reports two 15.1-unit near-lane diagnostics on persistence under the stricter Track-only spacing rule. Direct parent arrows meet the header card; descendant traffic enters below the header through side ports. Graph-derived ancestor and left-face space replaces illegal fallback lanes. The two-container Rust endpoint contract exposed an upward side-route endpoint bug; selecting its wall end by route direction restores that contract. Full validation and corpus rendering are in progress.

Round 3 of TASK-548.08 reaches routing through the compact headers of TASK-548.11. The layout now keeps different boundary point ports distinct and preserves exact child block dimensions. Original source and target card identities still control shared trunks. The native scan of all 23 current architecture boards in both engines finds no ambiguous trunk and no header, card, endpoint, label, or parent-frame defect. The four council acceptance cases also pass those checks. Header checks remain hard assertions. The matching-core renderer suite passes 653 tests with one platform skip. The Blocks scan retains one optional Track-only lane-spacing count at 11.5 units in Board rasterizer fan-in to Video encoder. Track has no lane or wall count. The final corpus and quiet timing evidence will follow in docs/design/compact-parent-headers-and-local-composition.md. Council acceptance remains pending.

Round 3 delivery 9a6d1c147 keeps different boundary point ports distinct and preserves exact child block dimensions. The matching-core renderer suite passes 653 tests with one platform skip. The complete repository gate passes, including 19 browser files. Correction to earlier shorthand: the native scan covers 17 current vault boards plus six fixtures in each engine, rather than 23 vault boards. Those pictures and the four exact council cases contain no hard geometry defect or ambiguous trunk. One optional Blocks lane count remains under a Track-only rule. The complete before/after SVGs are /tmp/548-08/round-3/base and /tmp/548-08/round-3/after-1. The changed-svg-pairs.json and acceptance-svg/manifest.json files under that directory name both sides. docs/design/compact-parent-headers-and-local-composition.md records route lengths, all probes, whole-board tradeoffs, and fresh performance. The parent council must judge the four failed pairs and a fresh sample. Council acceptance remains pending.

Round 4 checkpoint: the Voice defect shares Tab sessions as source but mixes event NfthRpE6 and call etaTfLee. The checker exempted every common endpoint, and packed routing keyed sharing by card without trunk_kind. The reduced real-renderer case has nine cards and two edges and fails before the fix. Packed subjects now include card plus kind/standing/emphasis/traffic. The checker requires a matching kind for the common-end exemption. Native scans of 17 current vault boards and six fixtures per engine have no hard geometry finding. Blocks records three optional Track-only lane-spacing counts. Affected Rust tests pass, and the full renderer run passes 657 tests with one platform skip. The arrow approach regression now recognizes crossing hops on a straight entry while retaining full arrowhead and actual rounded-bend requirements.

The canonical scripts/layout-compactness.ts measures every saved SVG for area, aspect, member occupancy in frames, member envelope, every route length, and the longest route. The initial scan covers 2452 drawings and all 76 whole boards. The complete checkpoint corpus is /tmp/548-08/round-4/after-1. Complete comparisons against the earlier council reference and round 3 are in after-1-vs-council-reference and after-1-vs-round-3. The per-board reports cover all 19 boards and both engines. The design note is docs/design/corpus-compactness-and-typed-trunks.md. Composition remains open, with label ownership as the next graph-based probe. Both main tasks stay In Progress.

TASK-548.08 checkpoint 2 retains the mixed-kind trunk repair from a771b0529. The stronger checker and real nine-card regression pass, and the 17 current boards plus six fixtures per engine contain no hard trunk finding. Source fan-out grouping at parent boundaries is the next probe. It must keep labels after their fork, distinct relationship treatments, visible header entries, and physical point ports. No council acceptance is claimed.
<!-- SECTION:NOTES:END -->
