---
id: TASK-205
title: Place connection labels on suitable horizontal or vertical runs
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 15:27'
updated_date: '2026-09-13 16:33'
labels: []
dependencies: []
references:
  - src/runtime/semantic-renderer
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
type: enhancement
ordinal: 364000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During live review of Semantic renderer Readable layout, labels restricted to vertical runs create unnecessary detours despite available horizontal departure and arrival runs. User wants the renderer to use either orientation automatically. Preserve measured text, ample clearance, deterministic predecessor behavior and one authoritative layout result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Labels can occupy horizontal or vertical arrow runs according to available measured space, with text remaining upright.
- [x] #2 Cards, unrelated labels and arrowheads retain clearance; selection between eligible runs is deterministic.
- [x] #3 Live proposal and current drawings are visually verified and focused regression checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Keep card placement and routing in the existing compound layout owner. Prototype selecting a measured label box on a clear horizontal or vertical run in the same complete drawing, before painting or atlas construction; preserve cards and routes exactly. Use deterministic candidate selection and existing clearance values, retain the feasible engine placement where no better run fits. Review the actual proposal and nested/short-run cases, then integrate only if the prototype improves readability without a second geometry owner.

Rank eligible runs by physical clear-span length, center the badge within the chosen span, use stable edge-id/segment ordering, and keep24px at each end plus existing card/label/route clearances. Produce exactly one authoritative drawing before paint/atlas; keep solved card and route geometry untouched and retain engine label placement when no eligible run exists.

Reproduce/minimize measurement detours with an exact bend-count and new-card-offset signal; compare label reservations, new-node seeding and actual port alignment one variable at a time. Fix the responsible layout stage, replacing redundant label-only machinery if the simpler result warrants it. Verify two-bend measurement routes, straight measurement-to-Pretext where unobstructed, preserved inherited columns and real-browser comparison.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ELK CENTER supports inline labels but restricts them to main-axis layer runs. End-label inline prototype reserved horizontal cells, but failed sibling-route clearance (4.25px vs12px) or movedcards64px when reserving distant cells. A bounded final run-selection prototype inside the layout owner found8 safe horizontal candidates while retaining allcards/routes. This changes the literal ELK-owns-every-label-coordinate contract to one authoritative layout result with a final label-placement phase; prepare a visual review before seeking approval for that material design change. No repository implementation yet.

Latest user clarification explicitly frees labels and routes from historical positions while prioritizing cards. A label-run choice within the existing layout owner can satisfy this scope without changing board data, schema, or UI controls. Retaining unused ELK label reservations may leave extra whitespace; avoid moving cards or repairing routes to recover it.

Visual prototype approved for integration within already authorized label-placement scope:24px end air on both ends; physical longest-span rule avoids orientation bias from dividing by label width/height. Fresh actual proposal moves3 labels horizontal and5 to clear vertical spans with cards/routes/atlas nodes byte-identical and1740x1413 extent unchanged.

Implemented the run selector in the existing compound layout owner. Public-renderer regressions cover flat and nested horizontal placement, vertical fallback,24px node/label clearance,12px unrelated-route clearance and deterministic output. Independent review found no actionable issues; direct probes verify physical-length ranking, ties, short-run fallback and unchanged card/route/extent identity. Live Everything and Renderer integration proposal/current comparison inspected; full combined gate is running.

Read-only full vault comparison passed:35 drawings and3 expected empty sequence cases; every node/frame coordinate, route path/coordinate, extent and subject identity is unchanged from TASK-204. Only label positions changed:131 moves across28 drawings. Live comparison left open with proposal in Pane A and current in Pane B; reported Layout graph to Compound layout path stays perfectly vertical. Final combined isolated check gate pending; partial unrelated configuration edits are excluded.

Final combined TASK-204/TASK-205 isolated bun run check passed: lint, formatting, both TypeScript projects, frontend builds,2831 module tests,155 system tests,8 repository-policy tests and12 serial browser owners. All scoped source/test/doc/patch files and installed ELK worker match root byte-for-byte. Gate log:/tmp/archboard-routing-validation-combined-check-2.log. Simplification review complete; one authoritative layout result and no painter/atlas repair.

User rejects label-only completion: the two green measurement connections still reserve extra bends and push the newly added Card measurement card far right; Card measurement to Pretext also jogs unnecessarily. Reopening to address horizontal label accommodation during placement/routing. Preserve inherited cards, but allow new cards and all labels/routes to move. Prior35-drawing unchanged-geometry check proved only the cosmetic pass, not this requested outcome.

Additional user screenshot identifies the same defect on complete placed drawing: a needless sideways jog around its badge interrupts a clear long vertical run. Include this connection in the regression and remove its label-induced detour through the general layout fix.

Integrated free-run layout now removes all four reported detours; two targeted labels still select endpoint vertical runs because the SVG return corridor cuts their horizontal spans. Final acceptance must check both horizontal orientation and bend count, plus closer new-card placement. Adding measured new-branch badge clearance rather than fixed offsets. Independent review found and fixed empty-label spacing inflation and a new-leaf anchor fallback; no unrelated renderer/configuration work.

Final design replaces blanket vertical label reservations with measured ordinary route spacing, clear horizontal/vertical label assignment and monotonically added reservations only for labels that cannot fit. Actual proposal takes2solves and renders18labels; target bendcounts2/2/0/2. Added dependency-local new-card components and coherent same-flank guide clearance; no new worker patch required. All132 renderer tests passed before final horizontal-badge room adjustment. Full check and final live QA wait for that measured constraint.

Final live QA confirms first two green badges horizontal with2bends each, measurement-to-Pretext straight, and reported complete-drawing flank continuous with2bends. Scoped/current views inspected. Independent review findings fixed: retain default spacing for unlabeled graphs, place unanchored new leaf from new neighbor, and ignore predecessor corridors absent/retargeted in current drawing. Closed-interval exact-fit bug fixed without reducing clearance.134 renderer tests and both TypeScript projects pass in isolated preflight; full gate running.

Final35-view vault sweep passed:35 successful drawings,3 expected empty sequence views,576 preserved atlas subjects,finite boxes/extents and1911 route points. Actual complete proposal has18labels with [H2,H2,V0,V2] target geometry and converges in2solves; whole matrix completes about0.64s. Final sources loaded on rootserver; fullisolatedgate running.

Final reopened-task combined isolated bun run check PASS: lint,formatting,both TypeScript projects,frontend build,2836 module tests,155 system tests,8 repository-policy tests and12 serial browser owners. All scoped renderer/doc/patch/worker files byte-match root. Log:/tmp/archboard-routing-validation-final-reopened-check.log. LatestrootserverPID3136016 includesfinalfixes; livecomparison restored. Simplification pass removed prototypefixedoffsets and avoided additional worker patches; measured clearance shares the existing interval packing mechanism.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected routing and new-card placement rather than only moving labels. Both measurement connections now use horizontal badges with2bends; Pretext is straight and the reported complete-drawing flank has no badge jog. Dependency-local placement keeps inherited columns recognizable and reserves measured badge clearance only against currently drawn routes. Verified live Everything/scoped/current views,35-view subject/geometry sweep, exact4-route behavior, regression red proofs, independent review and complete isolated check gate.
<!-- SECTION:FINAL_SUMMARY:END -->
