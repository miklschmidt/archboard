---
id: TASK-278
title: Let external cards share rows with connected containers
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-19 11:53'
updated_date: '2026-09-19 15:34'
labels:
  - renderer
  - layout
dependencies: []
priority: high
type: enhancement
ordinal: 492000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Phone API view places incoming cards above an entire Common-WebLib container and outgoing dependencies below it, leaving large empty regions beside the frame. User approved a staged feasibility experiment followed by the smallest working layout change in an isolated worktree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Public API demonstrates outside cards alongside container rows; Phone retains the user-selected one-column reading with improved fit and shorter routes than the original experiment baseline
- [ ] #2 Top-to-bottom layouts preserve containment, endpoint identity, label clearance, clean arrow approaches and stable horizontal sibling ordering between variants
- [ ] #3 Existing layout corpus and full check pass with measured evidence and inspected live pictures
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Integrate Graphviz placement and libavoid routing behind the shared renderer, with natural-run labels and measured headers.
2. Replace Bun and browser engine loading and worker transport; remove obsolete engine paths.
3. Verify Phone/Public API and existing layout corpus, address regressions, and inspect live boards.
4. Update renderer documentation, run full check, simplify and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Isolated worktree /home/msc/.codex/worktrees/container-shared-rows/archboard, branch codex/container-shared-rows. Baseline d1307893 snapshots existing source changes without modifying source checkout. Phone baseline953x1192 fit0.754 route1630 crossings0. All-DOWN ELK options tested still reserve an entire outer container layer. Mixed RIGHT root with DOWN separate child columns improves fit to1 but routes2173 and crossing1; rejected as a net regression. Dagre native compound ranking experiment (existing transitive package) produces1064x944 fit0.952 route968 crossings0, but requires custom orthogonal conversion and frame endpoint work. Requested approval to test Graphviz WASM native global cluster ranking rather than write a new layout algorithm. No product change accepted.

User approved @viz-js/viz installation. Installed 3.30.0 in independent worktree node_modules (removed source-checkout symlink first). Basic global-rank prototype improves Phone to857x920 fit0.977 route607 crossings0, but exposes header traversal and one off-run reserved label; not accepted. User also suggested recently open-sourced TALA; evaluating its runtime/library contract alongside Graphviz.

User approved libavoid-js experiment; installed 0.5.0-beta.5. Graphviz placement plus libavoid fixed-pin routing gives first Phone candidate 923x944 fit0.952 route1333 crossings0, no card collisions or off-run labels. Wider contracts remain under test. TALA in D2 0.9.0 was tested separately: Phone-like case retained opaque compound ranking; not chosen. No product renderer integration yet.

Added requested version13 common-weblib@public-api-independent fixture (21 nodes,25 edges,2frames), preserving architecture/visible text. Baseline2243x3194 fit.282 routes22481 crossings21; iterative Graphviz/libavoid2695x1645 fit.472 routes16096 crossings5,1910ms/185solves. All-labels3042x1687 fit.418 routes16948 crossings0,160ms/5solves. Both pass drawn endpoints,containment,headers,foreign-frame checks. User likes improvement but requests fewer label-induced bends. Corpus all-labels passes rendering/invariants24 cases but worsens bends all22 comparable,fit17; not accepted as global replacement. Testing natural-route label placement while retaining measured label space.

Responded to label-bend feedback with natural-route prototype: preserve all-labels card placement3042x1687, let labels use clear natural runs, force only missing labels as waypoints. Public API bends88->56,route16948->16428,crossings0; drawn endpoints/containment/headers/foreignframe checks pass,37rawsolves valid. First timing549ms. Phone all-placement-label spacing still regresses fit to.661; keep investigation open rather than shipping universal all-label reservation.

User requested production adoption of the Graphviz plus libavoid natural-run prototype in task 01a0b94f-1974-7703-a752-7ef4a234526a. Continuing on feat/semantic-boards; imported canonical investigation and fixtures only, not its stale source snapshot. Approved dependencies installed at pinned prototype versions.

Integrated Graphviz and libavoid WASM hosts for Bun and browser workers; real Chromium rendering and worker failure/recovery tests pass. Captured the prior 24-case corpus at /tmp/graphviz-adoption-before.json. New canonical Phone/Public API shared-row tests pass first integration. Initial broad renderer run exposed 56 failures, separating retired ELK-specific conventions from routing gaps; fixing actual endpoints, loops, parallel paths, clearance and compact frame geometry before acceptance. Removed obsolete test asserting an ELK vendor crash.

User clarified that faithful prototype behavior is the acceptance target: shared card ports, natural label runs, and deletion of constraints absent from the prototype. Removing integration-added port ordering/spreading, endpoint checkpoints and minimum-jog policies; restoring prototype placement/router defaults. Placement space for a label is separated from forcing its route through that space. Legacy tests that require private ports or particular detour styles will be replaced by semantic identity, containment, obstacle and natural-route contracts.

Final gate passed, then user identified two additional visible defects: a U-turn around the upward testing-to-WSGI exercise-app label in flask-map-2, and 72px gaps between IIS VM cards versus 24px frame insets. Investigating the inherited fixed label traversal direction and reducing global sibling spacing to the existing 24px spacing, with focused regressions and fresh corpus evidence before completion.

User additionally requires endpoint approach space for both the actual arrowhead and a rounded bend. This is now an explicit visible drawing contract; preserve shared ports and avoid reinstating arbitrary port-ordering or flank policies. Reproducing the short final approach at an external container target and deriving its clearance from marker/bend geometry.

User supplied current-cloud-infrastructure@Nc8vWLvX showing an arrival tangent to the frame border and a false junction where purple/green rounded corners meet. Added focused diagnosis for frame perpendicular entry and distinct-edge corner crossings. User also requested stable horizontal ordering of unchanged sibling identities across variants, while retaining fresh positions, rows and compact frames.

Final targeted fixes: shared native incoming-frame corridor supplies head+bend clearance and perpendicular entry without widening global spacing; upward reserved labels traverse south-to-north; sibling gap is 24px; native title-anchor edge ordering stabilizes horizontal sibling identity order. Rounded-corner contacts reuse crossing masks, and obsolete pre-rounding crossing reservation was deleted after common-weblib showed a 1.99px kink; the same corner now rounds to 14px. Focused regressions pass. Final full gate and refreshed 24-case corpus are running.

After final live inspection, user rejected automatic left-to-right architecture readings. Removing that selection policy: architecture boards now stay top-to-bottom, with fresh positions and compact containers. Revalidating corpus and live proposal before final commit.

User rejected automatic sideways readings. Removed direction selection and transposition. Down-only validation exposed a cluster title ordering omission: title must precede every direct child even when it has incoming sibling relationships. User requests images before visual alternatives are adopted or discarded; earlier candidate preserved on codex/graphviz-direction-comparison.

Fresh actual-board verification disproved the earlier stable-order claim: Nc8vWLvX still swaps VM2 and VM1. Investigating native ordering interaction and actual arrow approaches on ordinary cards. User also identified excessive global vertical gaps in that proposal; trace rank/label reservation amplification and show tighter candidate before adopting it.

User chose tighter spacing but found 24px candidate slightly too tight. Preserve modest consistent rounded bends; tiny or square corners are defects. Add a little breathing room to the compact candidate and inspect actual bends before final acceptance.

User chose outward bridge arcs (option B) for crossings occurring inside rounded corners, rather than gap-only masks or subtle smooth bulges. Preserve rounding and collision checks.

User requests one editable renderer configuration file for clearances. Added src/transformers/semantic-renderer/config.ts and replacing distributed spacing literals without changing values. New explicit routing contract: different semantic relationship types must not share ports or overlapping runs; same-type sharing remains allowed. User rejects the outward corner-arc result on platform-cluster@MBkKDE49 despite preferring its isolated crop; compare the exact full-board result with simpler treatment before revising.

User rejects BOTH corner-arc and gap-only cluster comparisons. Neither is accepted. Resolve underlying route overlaps and crowded bend contacts first, then show a new exact cluster-board rendering; do not treat reverting arcs alone as success.

Removed leftover broad label-distance ratio gate after inspecting near-threshold compact cases; the metric remains reported and the specific readable-label regression remains. Actual large detours were fixed by limiting stable-order cohorts to same-role peers. Label whitespace assertion allows 0.05px native/SVG coordinate quantization (observed 23.98px for 24px), without relaxing visible clearance.

Latest user steering: Phone view prefers a single column over marginal fit gains; automatic wrapping now requires 5% relative improvement per added column. User forwarded fixed-face-position diagnosis: compare geometrically aligned native pin candidates with unchanged label pipeline before adoption. Current typed ports eliminate measured mixed-kind collinear runs in platform-cluster, but ordinary-card arrow approaches still need a robust native clearance mechanism. Outside-shape negative pins and detached corridors were rejected after actual corpus failures; isolated alternatives remain under test.

Acceptance updated to the user-selected Phone A one-column reading. The previous universal Phone outside-card-alongside assertion conflicted with that explicit visual choice; Public API continues to exercise shared container rows. The full-page rasterizer fixture is now an indivisible framed chain so automatic wrapping does not remove the oversized-page condition it is meant to verify.

User selected B: geometrically aligned native pin choices after direct A/B gateway comparison. Preserve B while addressing remaining short arrow approaches and label detours; fixed-port alternative remains captured. B maintains zero measured mixed-kind collinear overlap across six actual readings and turns both gateway-to-Portal entries into straight lines.

User asks to improve accepted B by balancing the offset between exit and entry. Compare a balanced aligned attachment across both card faces rather than placing nearly all offset at one endpoint; preserve straightness and relationship-type clearance. Baseline full bun run check and24casecorpus have passed; floating B and balanced candidate remain separate pending final verification.

User selected C: balanced offsets. US-to-Portal now distributes offset equally (about81.5px per card) rather than5px/158px in B, while remaining straight. Candidate prefers the mean of endpoint centers within the clear overlap; B candidates remain fallback. No pin-cost ABI addition or new tuning weight was needed. Allfive reported variants retain clear cards/labels and zero measured mixed-kind collinear overlaps.

Balanced aligned ports exposed expensive unhelpful fold candidates on Flask map 2. Candidate eligibility now checks the actual balanced card/frame footprint of the settled baseline before native routing and label settlement, preserving hierarchy and allowing feasible count gaps. This is a proposal eligibility rule on current geometry, not a claim that future label-driven placement is monotonic. Production Flask2 retained 2137x1553 while falling to 140 native solves and about 0.91s; proposed 2/3/4-column footprints have fit .440/.328/.237 against required .608. Phone1, full branching mTLS2, long24three and reading tests pass.

New live screenshots after C integration: common-weblib gray Uses ambient helpers routes make label-induced S-bends, purple generated-model departures are square; current-cloud-infrastructure Observed VM-to-DB entries have tiny/square side turns even where source and target spans overlap. Investigate forced label positions overriding aligned ports on these exact edges before adding more approach geometry. Screenshots /tmp/codex-clipboard-7dbde3e7-6cca-421b-8285-9a7ab05300c6.png and /tmp/codex-clipboard-65175574-5b82-4f65-bb10-7c2e71241d1d.png.
<!-- SECTION:NOTES:END -->
