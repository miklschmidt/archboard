---
id: TASK-276
title: Lay out every variant fresh instead of freezing predecessor geometry
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 10:59'
updated_date: '2026-09-19 12:04'
labels:
  - renderer
  - layout
dependencies: []
priority: high
type: bug
ordinal: 490000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User reports widespread unreadable whitespace, skipped rows, reserved columns and convoluted routes in eight board families migrated in Docs-Architecture-Design (migration commit cf03606), especially nine proposals. Measure the real boards and fix the shared renderer behavior while preserving authored architecture and comparison meaning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Actual migrated proposal renders have measured improvements in reference-pane fit and no needless row or column reservations from the reproduced bug
- [x] #2 A focused regression covers the minimized real failure and existing renderer contracts pass
- [x] #3 Complete check passes and actual rendered boards are visually verified
- [x] #4 Independent sibling containers avoid a single excessively wide row; side and bottom spacing is consistent and compact while preserving header space and route clearance
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce and measure the migrated variants (complete).
2. User decision: lay out every variant fresh; preserve Standing, stable identities and transitions. Remove ancestor-layout recursion and all inherited geometry constraints, with a board-boundary regression.
3. Keep collision/label/standing behavioral coverage; retire tests whose sole contract was frozen placement. Update ADR 0028, renderer decision record and consumer guidance/evaluation ownership.
4. Measure full boards and named views, inspect actual renders and variant transitions, run the complete gate, simplify, and commit.

5. User-added scope: pack independent sibling cards into readable rows and remove excessive side/bottom container whitespace, retaining the existing top/header spacing. Measure padding separately from engine stretching and verify actual cloud containers.

6. User-added visual issue: database targets of contained VM nodes are placed far left of their callers. Reproduce latest cloud board and improve relationship-based placement beneath the caller frame without authored coordinates.

7. User explicitly requests deletion of the ordinary outgoing-edge flank rule and an inventory of all current container rules, distinguishing semantic constraints from routing/layout workarounds.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Baseline cloud platform-strangler: 5685x8110, fit .111, 6 bends per route; identical comparison content fresh: 4692x1756, fit .271, .625 bends. Cloud mtls-strangler: 5588x9045, fit .099, 6.444 bends vs fresh 4755x2143 fit .268, .889 bends. Cluster azure proposal: 3717x5993, fit .150 vs fresh3475x4188 fit .215. Live browser confirms empty nested containers.

Minimized cluster repro: 7 nodes, one cross-boundary relationship, an existing Azure/Cluster frame with two children plus a new nested workload and root key service. Proposal1598x1281 versus fresh1236x1089; single route has12 bends. Deterministic public-renderer harness bun --tsconfig-override tsconfig.json /tmp/archboard-probe.ts --assert fails in ~0.2s on >40% extra page. Full minimized cloud and cluster payloads retained temporarily under /tmp pending focused regression.

User explicitly favored compact readable fresh layouts with comparison colors and identities on 2026-09-19. Board-boundary fresh-proposal.test.ts failed before fix (atlas differs on every nested box and route). Existing transitions pair data-semantic-id and interpolate arbitrary old/new boxes/routes; no freezing dependency.

Fresh corpus: all17 variants across8 families render; all9 drafts use less area,8 improve fit. Cloud mtls height9045→2143, fit.099→.268; cloud platform8110→1756, fit.111→.271. Runtime draft fit.409→.395 while area4.838→3.619Mpx and bends1.5→1.1. Named views90 total,84 nonempty,6 empty; no routes through cards, one off-run label under investigation. eval:skill check passes.

Fresh-only implementation and rounded-label clearance pass bun run check. Live server3100 restarted; Common-WebLib current↔draft transitions verified, cloud proposal visually inspected and PNG exports generated. All17whole variants have0routes through cards; two off-run whole Common-WebLib labels exposed shared-run fanning moving reserved corridors. Fixing that with collision checks before final acceptance. No authored board files changed.

Shared-run fanning now carries reserved labels with their lanes and accounts for label footprints when choosing clear lanes. Actual whole Common-WebLib has zero off-run labels, label/card overlaps and covered unrelated routes. 205 renderer tests and strict renderer lint pass. User added independent-sibling packing and compact equal side/bottom container spacing; top/header spacing stays unchanged.

Final renderer corpus:17whole variants and90named views (84nonempty) all have zero routes through cards, off-run labels, label/card overlaps or labels covering unrelated routes. Cloud mtls original5588x9045 fit.099 ->3141x2423 fit.371; platform5685x8110 fit.111 ->3284x2382 fit.377. Independent10-card pool4144x340 ->752x680 with24px left/right/bottom and preserved header. Built-in rectangle packing handles leaf-only disconnected collections; connected children retain compound routing.

Final scoped spacing uses20px normal route tracks only in leaf collections without inter-child relationships; a global override regressed the workbench fixture and was rejected. Actual connected frame blank margin103->45px. Final corpus geometry: cloud mtls3054x2587 fit.348, platform2892x2397 fit.375;17whole and90view pairs remain clear. 210 focused renderer tests pass. Full gate caught3new-test TypeScript assertions/accesses, corrected without product changes; rerunning gate.

User explicitly requested deletion of outgoing forced-flank rule and a full container-rule inventory. Deleted both the flank redirection and its coupled shared-boundary-port workaround; bottom-up engine hierarchy ordering supports distinct ports. Native unsplit routing probe failed even the3-node fixture. Existing label-strand<=1 contract now guides candidate selection. Two historical quality baselines re-recorded transparently in layout-rules section30; all hard legibility limits retained. Final version12 cloud root2162x2095: DBcenters1381/1944 inside pool x514..2138, both64px beneath it.210renderer tests and17whole+90view corpus pass. Inventory: docs/design/container-rules.md. Final full gate running after this last policy deletion.

Final bun run check exits0 after outgoing-rule deletion and scorecard changes. Live3100 server restarted and current cloud root visually verified in browser; version12 root2162x2095 and platform2273x2477 exported and inspected. DBs are below pool, application portfolio packs2columns, header retained, comparison Standing visible. Final simplification deletes ancestor geometry, forced outgoing flank and shared boundary corridors; keeps one fresh pipeline and supported engine ordering. Complete current container-rule inventory recorded.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed predecessor geometry freezing, forced outgoing side exits and shared boundary corridors. Independent leaf containers pack compactly with24px side/bottom padding and unchanged headers; label-aware lane allocation preserves clearance. Existing label-reach contract guides candidate selection.210 renderer tests,17 whole variants,90 named-view pairs and full bun run check pass; live cloud root/proposal verified. Two historical fixture scorecards re-recorded transparently for the explicit policy deletion, with legibility limits unchanged. Container rules audited in docs/design/container-rules.md.
<!-- SECTION:FINAL_SUMMARY:END -->
