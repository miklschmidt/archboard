---
id: TASK-554
title: >-
  Boards pack tighter, raising the council's compactness score without
  lengthening lines
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-28T00:47:00Z'
updated_date: '2026-10-29T19:20:00Z'
labels:
  - renderer
  - layout
dependencies:
  - TASK-548.08
ordinal: 967000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The final council of TASK-548.08 (2026-10-28, 40 blind pairs against c147b73c8, evidence in /tmp/548-08/council-r5) judged 20 pairs better, 19 the same and 1 worse, but the 20 better verdicts came from lines through headers in the before pictures. On scores alone the after pictures averaged lower: weighted 6.55 to 6.38, with the largest drop in K, compact frames and space (4.89 to 4.50), then R, short direct relationships (6.10 to 5.96). Routing lines around compact headers costs space. The owner wants these numbers raised in order of the council's weights (K 30, R 25, T 18, L 10, O 10, W 7), on a branch of its own after the TASK-548 pull request, starting with packing, which should raise most criteria at once. The criteria and procedure are docs/design/grading-council.md and docs/design/grading-council/criteria.md; The council's measuring tools, kept outside the repository with its pairing and tally tools, measure area, aspect, frame occupancy and route lengths of two saved corpora.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a fresh blind sample judged against the base branch, the council's mean K score of the after pictures is higher than of the before pictures, and its mean R score is not lower
- [ ] #2 The council judges no pair worse, and no after picture has a defect its before picture lacks
- [ ] #3 Every hard check of expectDrawingIntact passes on the complete corpus and every whole board, in both engines
- [ ] #4 First and growing-edit renders of Board viewer, Board persistence and Archboard server routes stay under 500 ms on a quiet machine
- [ ] #5 Every Track drawing of the corpus is byte-identical to the base branch
- [ ] #6 Compactness measurements of the complete corpus before and after are recorded in docs/design
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Design: one gpt-6-astra writes docs/design/blocks-planned-layout.md and a proposed ADR, proven by a spike on the six reference drawings (area, bends, hard checks, time).
2. Build the planning stage on feat/blocks-layout in steps, each held to the complete Blocks corpus measures, expectDrawingIntact on every drawing, Track byte-identical, and the three Blocks timings.
3. When the corpus measures and pictures show a meaningful gain, convene the council (Opus, Sol, Astra, Muse Wonder) on a fresh blind Blocks sample against the base branch.
4. Iterate until the council finds K, R and T higher, no pair worse and no new defect, and the timings are under 500 ms on a quiet machine.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-28, the owner: leave the Track engine as it is and work on Blocks exclusively. The council samples Blocks drawings only, and Track drawings stay byte-identical.

2026-10-28, the owner: the goal is clean, fast, well packed and clearly routed diagrams on the Blocks renderer. No layout rule about ordering or packing is set in stone. Ports may stand on the left and right walls as well as the top and bottom. A label may become an element with ports that no arrow points at, in place of a property of its line, and labels may stand on horizontal lines. Existing constraints and compositions are negotiable. Parallel gpt-6-astra explorations try different ideas first; the owner approves a direction before it is implemented.

2026-10-28: the first-render timings of TASK-548 were Track's: the timing harness draws with the default engine. Measured warmed on feat/blocks-layout, each engine asks one solve, but Blocks takes 1410/974/1124 ms for Board viewer, Board persistence and Archboard server routes, against 238/319/147 ms in Track. A fifth exploration, explore/blocks-speed, profiles the Blocks solve and aims at Track's times with every drawing unchanged. Explorations packing and layered are rejected: packing lowered mean area 5.6% but lengthened routes and added 21 ambiguous-trunk drawings; layered shortened routes 9.2% but raised drawings with geometric defects from 23 to 754 and drew long strips.

2026-10-28, the explorations ended. sideports (explore/blocks-sideports 2f71e981): placement fixed, four-wall ports and a bend-penalty router cut bends per route 2.35 to 2.13, routes with four or more bends 31.1% to 27.0%, route length 3.6%, no new hard finding, but two shared-trunk tests fail (lines into one parent no longer share an entry, a fan crosses itself) and Blocks gets slower. labels (explore/blocks-labels c1049b84): 30% of labels on horizontal runs, area -0.5%, bends 2.35 to 2.31, no new finding, labels 49% farther from their endpoints. speed (explore/blocks-speed 76c63e12): trunk path search held 47% of the Blocks solve; a bucket queue, reused search arrays and range-marked obstacles cut first renders 30 to 38% (Board viewer 1535 to 1048 ms, Board persistence 988 to 613 ms, Archboard server routes 1136 to 791 ms) with every Blocks and Track drawing byte-identical; applied as 5a1d3d866 and the corpus re-checked identical. Common finding of all five: the empty frames and long trunks come from the composition, so placement, port walls, label slots and shared trunks must be planned together before routing, and routing along planned corridors would also remove most of the path search that makes Blocks slow.

2026-10-28, the owner approved the direction 'plan, then route' for Blocks: one planning stage chooses card order inside blocks, line walls on all four sides, label slots and shared trunks together; packing places blocks by measured size and planned ports; routing assigns lanes along planned corridors with search only as a fallback. Work continues until readability has meaningfully improved and the three Blocks first renders and growing edits are under 500 ms. First a design document and ADR proven by a spike, then implementation in steps.

2026-10-28: design committed as 5b82ce00d (docs/design/blocks-planned-layout.md, ADR 0063 proposed). Its spike (explore/blocks-planned-spike 9b91136d) proved the planned solve takes 6 ms instead of 888 ms on Board viewer, but its conservative portals doubled area and quadrupled route length, and crossing marks made painting 3.6 s. Build steps 1 to 6 run on feat/blocks-planned, with a checkpoint report at /tmp/blocks-explore/build/report-1.md.

2026-10-28: build checkpoint after step 6 (feat/blocks-planned 1d7b865e): gate green, Track identical, no new hard finding, but the planner was selected for only 283 drawings and every large board and all six references fell back to the legacy path, so means moved slightly worse (area +0.04%, bends 2.355 to 2.363) and timings stayed ~1.08/0.66/0.82 s. Steps 7 and 8 continue with selection by 'no hard defect' instead of 'noncrossing plan', targets: planner draws every Blocks architecture drawing, area -15%, bends per route <= 2.0, routes with four or more bends <= 22%, timings under 500 ms.

2026-10-28: steps 7 and 8 (feat/blocks-planned a6826516): the planner draws every Blocks architecture drawing, geometric findings 23 to 0, Track identical, timings 300/257/212 ms first (was 1073/614/822). Readability worse: area +22%, route length x2.1, bends per route 2.35 to 3.40, four-or-more-bend routes 31% to 40%. Faults seen in the pictures: labels in cells beside their source force sideways departures and loops; dependency order inside scopes lost; lines between frames circle them through fixed-side exports and bottom arrivals. Iteration 3 fixes these three, keeping a change only when the six references improve against the baseline.

2026-10-29: iteration 3 kept nothing: both trials failed the six-reference gate (best: area +18%, route length x2). All 488 graphs above 24 relationships used the planner's conservative construction. Course change: legacy Blocks placement composes better, the planner routes better and faster. Iteration 4 (feat/blocks-hybrid) keeps legacy placement and replaces only Blocks routing with the planner's lanes, fans, label runs and guard. In parallel, explore/blocks-placespeed speeds up the remaining legacy solve (Graphviz and placement steps) with byte-identical drawings.

2026-10-29: explore/blocks-placespeed applied as c88285604 (slide spans reused, crossing-decoration bounds cached, Graphviz polygon work trimmed); corpus re-checked byte-identical in both engines. First renders 1094/658/821 to 1027/605/769 ms. Native budget outside the trunk router: 385/147/371 ms full render; Graphviz 176/27/208 ms of it. explore/blocks-gvspeed now cuts Graphviz time with identical drawings.

2026-10-29: explore/blocks-gvspeed applied as a0f65d38a (Graphviz returns only the geometry layout reads; native Graphviz -19 to -21%); corpus re-checked byte-identical in both engines. First renders gain only 2 to 4%. Cause found: one Blocks solve makes 88/24/77 Graphviz calls, mostly wrap candidates each routed and scored, plus repeated hierarchy passes for side-wall exits and port order. The hybrid builder may cut those passes, a drawing change under its per-reference gates.

2026-10-29: hybrid merged as 1f60b6e06 (tree equal to feat/blocks-hybrid 0df95aa1a outside backlog). Corpus vs baseline: bends per route 2.35 to 1.32, routes with four or more bends 31% to 5%, detour -37%, route length -11%, area -7.6%, geometric findings 23 to 0, Track identical. Timings 500.11/483/245 ms first. One third of labels use the nearest-to-source fallback. Next, in parallel: feat/blocks-speed2 for a 400 ms margin with identical drawings, and a council on 40 sampled pairs of the 98 differing current Blocks drawings (before 8cdedb1c3, seed 554). The council runs with three graders, Opus, gpt-6-astra and Muse Wonder, because the owner asked to use gpt-6-astra instead of gpt-6.1-sol for this task.

2026-10-29, correction: the council keeps its four graders, Opus, gpt-6.1-sol, gpt-6-astra and Muse Wonder. The owner's 'gpt-6-astra instead of gpt-6.1-sol' applies to the build work, not to the council. A gpt-6.1-sol grader was added to the same 40 pairs.

Council of the hybrid (1f60b6e06) against 8cdedb1c3, four graders (Opus, gpt-6.1-sol, gpt-6-astra, Muse Wonder), 40 Blocks pairs: 7 better, 30 same, 3 worse (019, 027, 038), 0 both fail. The change fails. Rulings on reported defects: only 027 B is real, a stack of 20 labels parked in the top-left corner away from its route (type 4). False: 004 A/B, 005 A, 008 A, 023 B, 026 B, 032 A, 037 B. The graders' notes name one recurring weakness: a route goes around the outside of the drawing instead of straight to its target (019 Browser gateway to Workhorse queue, 027 Commands to Server access, 015 and 020 side detours), and 038 loses on a long cross-board Guardrails line and a knot of junctions under Author run. Next: route without perimeter detours and keep a label stack on its own run, then run the council again.

2026-10-29: the owner removed Muse Wonder from the council, because none of its nine reported defects in council 554 was real. The council is Opus, gpt-6.1-sol and gpt-6-astra, and the median of their three margins decides. Council 554 read with three graders: 9 better, 28 same, 3 worse (019, 027, 038); 010 and 013 move from same to better. The hybrid still fails.

Merged feat/blocks-speed2 (9683c6725) as a16b5c77e: the hybrid's routing reuses obstacle and label indexes and stops candidate searches at the first success, with every drawing unchanged. Verified: the 8,086 corpus SVGs of the builder's oracle and after runs hash the same; the merged core builds to 7f300d8f6fc3747c, the builder's final core. My three timing runs on the merge with two builders running (load about 3): Board viewer 391-433 / 329-337 ms (first render / growing edit), Board persistence 298-305 / 292-299, Archboard server routes 205-213 / 197-201, all drawings intact. Every sample is under the 500 ms threshold. The builder's quiet-machine run kept all 18 samples under 400 ms (worst 396.65).

2026-10-29: trial of DeepSeek V4.1 Flash 1017 through Cursor as a council grader, on the 40 pairs of council 554. Its transcript shows that Cursor's file reader gave it written descriptions of the pictures, not the pictures, so it graded from descriptions and ImageMagick pixel scripts. It reported no defects (it missed the real one in 027 B). Its margins correlate -0.08 with the median of the three graders, against 0.58 to 0.66 for each grader with the other two; its verdict agrees on 21 of 40 pairs; its weighted scores average 7.41 against 6.17 to 6.59. It does not join the council. Muse Wonder ran through the same Cursor harness, which likely explains its false defects. grading-council.md now says that a grader must see the pictures and that its transcript is read before it counts.

Council 557: the merge of feat/blocks-speed2 and feat/blocks-readable (8d1b290ea) against legacy Blocks (8cdedb1c3), the same 40 boards as council 554, three graders (Opus, gpt-6.1-sol, gpt-6-astra). 8 better, 31 same, 1 worse, 0 both fail. 019, 027 and 038 moved from worse to same. Sol and Astra reported no defect. Opus reported one, 012 A (the hybrid side, Codex realtime voice whole board): a dashed line seems to pass through Application policy. Ruled real by criteria line 50 (an ambiguity left after close inspection). The SVG shows two routes that start on the card's left and right walls at the same y (3766), so they read as one line behind the card; the drawing guard sees no route through a card. On scores alone the pair favours the hybrid (+0.00, +0.62, +0.25). The change fails on this one defect. Next: keep routes that leave opposite walls of one card off a shared line, and let the drawing guard catch that ambiguity.

Merged feat/blocks-collinear (b43383e0f) as 75c11de98: a drawing-guard check (drawn-ports.ts, collinearPorts) and port spacing in the planned router. Its 3-unit threshold let a 4-unit nudge pass while the two lines still read as one behind Application policy, so 63bea7a73 raises the router and the guard to one lane (16 units). Two lanes failed the router's three-cards-in-a-row test: one route moves at a time and an 80-unit wall has no room. Corpus at 63bea7a73: Blocks has zero findings (Track keeps 7,803 collinear pairs and is byte-identical); the 61 historical subject failures are unchanged; 1,633 Blocks drawings moved against b43383e0f. Against the 4-unit nudge, bends per route 1.254 to 1.290, routes with four or more bends 4.60% to 4.98%, detour +5.7%, long detours 2,081 to 2,174, detached labels 0. Timing (load about 2.4): Board viewer 384-390 / 391-395 ms, Board persistence 265-268 / 292-294, server routes 202-206 / 199-201. bun run check passes 20/20. Council 558 on the same 40 boards is running.

Council 558: 63bea7a73 (one-lane rule) against legacy Blocks (8cdedb1c3), the same 40 boards, three graders. 10 better, 29 same, 1 worse (023), 0 both fail, no new defect. Opus reported one defect, 010 A, a shared bus stretch (type 6). Ruled false: Picture cache and Local pictures share x 1154-1316 only on their way to one target (Fetch semantic reads), a fan-in; left of x 1138 only Local pictures' own lines split, a fan-out. This ruling was not blind: looking up the pair's scale in key.json showed that A is the before side. 012 (the former defect) is now better (+0.16, +0.62, +0.50). 023 (Command dispatch, Command routing view) is worse (+0.30, -0.71, -0.90). It was same in council 557 (+0.30, -0.54, +0.12) with the same card placement, so its routes changed only slightly. The real weakness is placement: the hybrid places Help text, Interruptible run and Registry far from runCliWith, where legacy kept them beside it, because the legacy placer still reacts to the planned routes. The change fails on 023.

Correction to the note on 63bea7a73: my corpus run and timing of the one-lane rule ran on a stale core (8588c9714a52f60a), built while the gap was two lanes (32 units). I changed the source to one lane without rebuilding, and the measuring tools load the wasm directly, so nothing refused the stale core. The numbers I recorded (bends per route 1.290, four-bend share 4.98%, detour +5.7%, long detours 2,174, Board viewer 384-390 / 391-395 ms) belong to the two-lane rule. The committed one-lane core is a33457168bd7ded4 (bun run check rebuilt it before council 558, so council 558 judged the right code). Measured on it: bends per route 1.2602, four-bend share 4.64%, long detours 2,086, detached labels 0 (builder, report-8). My own timing at load about 1: Board viewer 446-451 / 354-358 ms (first render / growing edit), Board persistence 252-266 / 260-261, server routes 207-210 / 200-205. All under the 500 ms threshold, but Board viewer's first render is over the 400 ms margin.

Council 559: 179c9017c (placement fix merged) against legacy Blocks, the same 40 boards, three graders. 10 better, 29 same, 1 worse (040), 0 both fail, no defect reported by any grader (Opus checked full-size crops of every header on the large pictures). 023 is same again (+0.18, 0.00, -0.25). 040 (Voice coordinator, Tools and work) is worse (-0.43, -0.43, +0.05). Its two pictures are byte-identical in councils 557, 558 and 559, which judged them same (0.00, -0.68, +0.05), same (-0.25, -0.38, +0.65) and worse: pair verdicts near 0.40 vary between councils on the same pictures. The weakness is consistent in the notes: the hybrid routes Coordinator tools' calls through jogs and along the top of Coordinator turn homes, with crossings near arrowheads, where legacy fans them from one trunk almost straight. Next: fix that routing; a speed pass (feat/blocks-speed3) runs in parallel.
<!-- SECTION:NOTES:END -->
