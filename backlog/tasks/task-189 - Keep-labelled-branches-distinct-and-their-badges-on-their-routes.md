---
id: TASK-189
title: Keep labelled branches distinct and their badges on their routes
status: Done
assignee:
  - '@codex'
created_date: '2026-09-12 23:02'
updated_date: '2026-09-12 23:31'
labels: []
dependencies: []
type: bug
ordinal: 348000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The living renderer proposal Renderer integration view draws compound graph and subjects to measure from one departure point on Layout graph, while the subjects badge floats 61.3 units off its arrow. A three-node graph-to-measure-to-layout chain plus graph-to-layout shortcut reproduces it. TASK-185 explicitly left labelled shared stems unresolved; its earlier fixes are present.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The reported labelled fork has visibly distinct departures and every label remains on its own route without covering another route, card, label or arrowhead.
- [x] #2 A minimal rendered regression covers the fork and its edge ordering; existing route/label fixtures still pass in both themes.
- [x] #3 Verify the original living renderer proposal and the full check; retain renderer ownership without authored geometry.
- [x] #4 For vertical routing within a region, forward adjacent connections remain direct, forward skips prefer LEFT and returns prefer RIGHT, with blocked faces and containment respected; behavior is verified on adjacent and skipping returns.
- [x] #5 Badges keep a generous consistent minimum gap from cards, with that room reserved by layout so badge whitespace does not detach labels from their arrows.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the live label detachment and minimize to a three-node fork. 2. Route labelled connections independently and allocate measured space for their labels; use other straight segments before detaching a label. 3. Apply final approved vertical flow rules: direct forward connections between cards, forward skips on LEFT, return routes on RIGHT; obstacles and containment override preferred side. 4. Verify minimal forks, returns and edge ordering in both themes, plus original view and all living architecture views. 5. Run full check, restart the server on final source, and show the corrected proposal.

6. Reserve generous badge-to-card whitespace in label placement and channel sizing; verify actual rendered distances and the live proposal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Targeted history audit: relevant Claude commits 6314f5b9, 34482fd1 and 56780c24 are already in HEAD and loaded by the live server; sibling migration worktrees hold older renderer snapshots. Minimal fork and original full-view scripts both measured the subjects pill 61.3 units from its own route. Excluding labelled edges from shared stems brings that distance to zero. Wider baseline captures 44 architecture renders and380 pills; first fix removes10 detached-pill instances without adding any, but full integration view exposes a return-lane crossing which remains under investigation.

User explicitly approved all four deterministic routing rules: direct forward connections between cards; forward bypass on the right; return to an earlier row on the left; obstacles and containment override preferred side. The rules are derived from existing layout stage order, not node names or authored geometry.

Approved direction policy is live in Renderer integration: forward bypass on right, SVG return on left, direct middle chain, all8 badges on their own routes. Browser fit verified visually. Existing label/trunk issues addressed by individual labelled routing, measured along-track clearance, and trying other existing straight runs before off-route fallback. Vault audit:44 architecture renderings (both themes),380 pills,0 detached versus32 baseline; route-label occlusions36 versus164 baseline. Wider crowded boards are a measured cost: browser service width1011→1670; workbench1339→1893. Full gate pending lint simplification; no source suppression.

User corrected the preferred directions: forward skip routes must use LEFT; backward/return routes must use RIGHT. This supersedes the earlier side preference. Direct forward routing and obstacle/containment overrides remain unchanged.

Final direction and whitespace implementation: forward skips LEFT, returns RIGHT. Card/title badge margin is a hard12 diagram units; arrowhead/wire clearance remains2. Layout budgets that margin at channel edges; shortest constrained routes settle labels first, and compressed-air fallback removed.108 renderer tests plus focused lint/format pass. Audits across44 renders/380 labels:0 detached and36 label-route coverings (baseline32 detached/164 coverings); all22 dark architecture views have >=12 badge-card gap. Reported integration637x804 versus617x804 before whitespace. Restarted dogfood server on final source and verified original Renderer integration in browser, left bypass/right return and clear side labels. Full gate pending.

Final complete bun run check passed exit0: lint, formatting, types, build, module, system, repository and serial browser gates. Earlier run received external SIGTERM during system tests around server restart; clean rerun with stable server passed. Final simplification removed compressed badge-air fallback modes; no lint/type suppression or authored geometry added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed independent labelled branches and on-route badge placement; deterministic forward skips use LEFT and return connections RIGHT. Badge-to-card/title clearance is at least12 diagram units, reserved in layout, with constrained labels settled first. Verified108 renderer tests,44 architecture renderings with0 detached badges (32 before),all22 dark-view card spacing audits >=12,live Renderer integration view,and complete bun run check exit0. Crowded wider diagrams retain some existing label-route crossings; reported view has none.
<!-- SECTION:FINAL_SUMMARY:END -->
