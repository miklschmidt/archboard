---
id: TASK-342
title: 'A performance pass: every dogfood board lays out in seconds'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 16:09'
updated_date: '2026-09-25 00:15'
labels:
  - renderer
  - performance
dependencies: []
priority: high
type: task
ordinal: 583000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured 2026-09-24 in-process, cold, on the dogfood vault: Archboard server takes 107 to 149 s to lay out and Board viewer 12 to 16 s, which makes opening them slow and the wide-boards test owners time out. Before and after today's renderer merges measured the same, so the cost lives in layout itself (label settlement retries, column fold choice, routing passes are candidates), not in today's changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A profile of the slowest boards names where layout time goes
- [ ] #2 The wide-boards owners pass within their time budget
- [ ] #3 Every dogfood board lays out in under 1 s (its first layout, measured per board through the worker pool), and the user judges the pictures no worse
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board proposal: performance work changes no drawn architecture; no board is affected (layout internals only, no new part or relationship).
1. Profile in-process and through the worker pool: solves per board, Graphviz placement vs libavoid routing vs the rest, reservation and release rounds, column readings.
2. Safe (byte-identical) speed-ups only: (a) a release whose placement gives back no height or area is refused before it is routed (routing never changes page size); (b) placement is solved once per label-reservation set and reused by every forced-label attempt (engine gains a place/route stage option); (c) column-count readings are settled side by side, compared in the same order.
3. Prove byte identity: render every board, every non-current variant and every view as SVG through a scratch server on a vault copy before and after, compare bytes.
4. Measure and report, not commit, anything that changes pictures (Graphviz splines=ortho removal, fewer retries, cheaper routing).

Second pass (2026-09-25, solve budget): 5. Choose the column count from placements: place the unfolded reading and every candidate count with no label reserved, side by side; compare placement fits in increasing column order (a count replaces the kept one when its fit is greater and at least WRAP_MIN_FIT_GAIN more; fewer columns win ties); settle only the winner and keep it when it fits materially better than the settled baseline, a refused winner keeping the baseline. The abandoned/unwanted plumbing goes. 6. One release round: releaseUnused tries releasesOf(unused) once through firstRelease and returns. 7. Render all 49 dogfood drawings (boards whole and views) through a server on a vault copy from main and from the branch; list changed pictures with page sizes and before/after PNG pairs. 8. Time every board's first layout with timing.ts on main and branch; every board but Archboard server under 1 s. 9. Update header comments, layout-rules.md section 34 and the owners; run each gate lane.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Profile (2026-09-24, in-process, one cold render of each current variant, before any change): Archboard server 507 s in-process, 1310 solves (397 unfolded plus 913 for the six column-count readings 2-7), Graphviz placement 36 s, libavoid routing 451 s, the rest 20 s. Board viewer 10 s, 241 solves, placement 4 s, routing 6 s. Every board: routing is 55-90% and placement is the rest; measurement, label placement, crossings and painting stay under 4%. Each routed solve runs ~4.5 libavoid transactions (the endpoint-face rejection loop, then one pin refinement pass); the slowest (Archboard server, 6 columns) take 1 s each. Half of a transaction was JS stack traces for libavoid's C++ exceptions: one slow solve throws 762,356 Avoid::UnsatisfiableException (the orthogonal nudging solver) and the Emscripten glue captured a stack and decoded the message for each. Of a release round's solves, most routed a placement whose page was already no smaller (Board viewer: 22 of 26, then 16 of 26), so they could never be kept. Folded readings: Archboard server refuses all six (routes that cannot clear obstacles, or fixed bends reversing), yet they set its wall time. No libavoid or Graphviz memory growth across four renders of Board viewer in one process (both WASM memories stayed at 16 MiB), for TASK-343.

Kept (every one leaves all 54 pictures byte-identical: every board whole, every non-current variant, every view, through a server on a vault copy before and after): (1) libavoid-js patch: C++ exceptions thrown without a JS stack trace, message decoded lazily; (2) a release is placed before it is routed and refused when its page is not smaller (routing never changes page size); (3) placement solved once per reservation set, engine gains a place/route stage option (SOLVE_STAGE); (4) column-count readings settle side by side, compared in the same order, abandoned once chosen or refused (lib/layout/column-readings.ts). Paired pool timings, base vs after: Archboard server 110.5 to 43.4 s, Voice coordinator 6.0 to 2.4, Browser application 4.2 to 2.0, Semantic renderer 4.1 to 1.5, Board viewer 3.2 to 1.4 s. Not kept (change pictures or unproven): skip fold counts whose unreserved placement misses the fit (Archboard server 38 to 14 s, 0 of 54 pictures changed, but not a bound); Graphviz splines=false (1 of 54 pictures 18 px narrower); a shared worker queue (no faster). Gate: type-check, lint, fmt:check, test:system 181/0, test:repository 8/0, test:serial-browser pass; test:modules 3399/1, the one failure is wide-boards Archboard server over its 20 s budget (about 40 s standalone, was 116 s). AC2 and AC3 remain open for Archboard server.

User budget 2026-09-25: anything over 1 s is unacceptable (elk-rs laid these boards out in 45-371 ms; see memory render-budget-one-second).
Timing history with today's content, first layout in ms (Codex session / Command interface / Voice coordinator / Board viewer / Browser application): elk-rs 777870b8: 45/71/73/165/210. Graphviz switch 260ffd3f: 160/1469/1469/971/933. 60bbb648 stable order: 359/1483/637/2602/858. 6ffa1637 refine from occupied ports: 299/1933/5254/2021/3543. main 6f5f08c7 after this task's first pass: 221/1084/2192/992/1612; Archboard server about 36 s.
Solve profile on main: Command interface 202 solves, Browser application 294, Voice coordinator 702 (five column counts), Board viewer 125; each placement or route about 40-80 ms, so one picture costs about 13 s of CPU spread over 23 workers. The count of solves is the cost: release rounds (firstRelease) take about a third, forced-label attempts most of the rest, and every column count is settled whole.

Second pass, fixed solve budget (2026-09-25, commit 203f3bc7): (1) column-readings.ts chooses the column count on placements. The unfolded reading is settled; every count its bands allow is placed once with no label reserved, side by side; in increasing order, starting from the SETTLED unfolded page, a count replaces the page kept when its placement fits materially better (WRAP_MIN_FIT_GAIN), fewer columns winning ties; only the chosen count is settled and kept when better() holds on the settled drawings; a refused count keeps the baseline. The abandoned/unwanted plumbing is gone. Departure from the brief: the brief started the comparison from the unfolded PLACEMENT. That placement reserves no label and fits far better than the settled page (Archboard server 0.51 vs 0.34), and it lost the fold of Archboard server view FawxUEKE (main 1317x958 folded, placement start 834x1372 unfolded). Starting from the settled page changes no picture's fold across the 49 drawings; its cost is one refused settled fold on Archboard server (6.5 s instead of 3.2 s first layout). One line to switch if the parent prefers speed. (2) label-reservations.ts releases in one round through firstRelease. Pictures: 4 of 49 change, all from the single round: Browser application 2558x1697 -> 2870x1697, its view D87Mmg83 1752x1092 -> 1752x1180, Skill evaluation 4124x1594 -> 4420x1594, Board rasterizer view vAJmBRF7 1549x861 -> 1728x1008; pairs in $CLAUDE_JOB_DIR/tmp/342b/pairs. First layout (timing.ts, ms, main vs branch, two runs): Archboard server 35752/32967 -> 6475/6524; Voice coordinator 1835/1779 -> 394/411; Browser application 1589/1601 -> 608/672; Skill evaluation 1007/998 -> 628/630; Board viewer 977/952 -> 542/567; Semantic renderer 924/938 -> 313/313; Command interface 789/751 -> 451/496; every other board and fixture under 700 ms. timing.ts now gives unordered fixtures an order (it refused every fixture on main). Owners: column-readings.test.ts (only the chosen count is settled, chosen against the settled page; a refused or no-better count keeps the unfolded reading); label-reservations.test.ts gains the one-round owner.

Gate on 203f3bc7, one lane at a time: type-check pass; lint pass; fmt:check pass; test:modules 3405 pass / 0 fail (the wide-boards Archboard server owner now passes, 7.3 s alone); test:system 181/0; test:repository 8/0; test:serial-browser 15 owners, 0 failures.

Third pass (2026-09-25). Early refusal: Archboard server's 2-column fold is refused by the final clearance check in settleReading (compound.ts): BiJamQt9 'Route run 6 reverses through a fixed bend'. No safe early refusal exists: route clearance problems appear and vanish between attempts of one settlement (first routed attempt fails on xjqxaA6G, later attempts clear it; BiJamQt9 first fails in the fifth reservation round), and a settled drawing that fails could still be replaced by a release, which is kept only when every route clears. Across every fixture and vault variant this was the only settlement whose settled drawing failed. The fold spends 94 routed attempts (15 s routing CPU): 19 sequential attempts over five reservation rounds (2.1 s wall) and one release round of 41 releases (1.4 s). The unfolded reading alone is 109 routed attempts, about 3.9 s, so even refusing the fold outright leaves Archboard server near 4 s. Release rounds: the user rejected Browser application at one round. Rounds now continue while a round keeps a release, capped at RELEASE_ROUNDS = 3. Main's round counts (rounds that keep, then one that keeps nothing): Browser application 3, view D87Mmg83 3, Board rasterizer view vAJmBRF7 3, Skill evaluation 2; Voice coordinator and Board viewer 1. Cap 2 draws Browser application 2764 wide; cap 3 gives main's 2558. All 49 pictures are byte-identical to main at cap 3. Timing (ms, two runs): Archboard server 7852/7682, Browser application 1343/1380, Skill evaluation 1047/1058, Board viewer 974/985, every other board under 800. Browser application and Skill evaluation are over the 1 s budget and Board viewer at it: the release rounds are what they spend (Browser application 610+380+350 ms; Skill evaluation's empty third round 255 ms; Board viewer's empty second round 415 ms). An ordered early return with cancellation of later releases saved nothing measurable (1346 to 1319 ms) and was not kept. Picture fidelity and the 1 s budget conflict here; the parent decides.
<!-- SECTION:NOTES:END -->
