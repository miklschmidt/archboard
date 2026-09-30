---
id: TASK-283
title: Keep opposing or differently standing relationship channels distinct
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 18:06'
updated_date: '2026-09-23 00:56'
labels:
  - renderer
  - layout
dependencies: []
references:
  - src/transformers/semantic-renderer/lib/layout/avoid-pins.ts
  - src/transformers/semantic-renderer/lib/layout/avoid-routing.ts
  - src/runtime/semantic-renderer/tests/matched-kind-channels.test.ts
priority: high
type: bug
ordinal: 497000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The semantic renderer currently separates shared connector channels by relationship kind, but a comparison can put different standings on otherwise equivalent connections and a board can contain opposite directed relationships between the same subjects. Those connections may then share the same physical run and render on top of each other, as seen in the common-weblib architecture comparison at paneA=common-weblib architecture@GwWurFMu.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Relationships with opposite directions between the same endpoints render on distinct physical channels while same-direction relationships retain their existing sharing behavior.
- [x] #2 Relationships with different comparison standings render on distinct physical channels, including added, changed, removed, and unchanged where those combinations can occur.
- [x] #3 Existing relationship-kind separation, containment, labels, arrowheads, deterministic layout, and the full renderer/check suite remain green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add renderer-owned relationship channel metadata for kind, comparison standing, and local direction; include comparison channels in the remembered-layout key. 2. Thread channel metadata through the compound graph and native pin allocator so only equivalent channels share a port or run. 3. Add focused regressions for opposing directions, same-direction sharing, and all comparison standing pairs while checking route identity and labels. 4. Run focused and full renderer checks, review for simplification, record evidence, and commit the Conventional Commit change.

5. Integrate commit 9edc7b91 with fixed-radius geometry at e01d64e1, preserving endpoint alternatives, mandatory clearance and column wrapping. Verify combined renderer regressions and real comparisons, rebuild the frontend and refresh the live canvas.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the renderer-owned connection channel as relationship kind + comparison standing + local direction at each endpoint. The channel is carried through the compound graph, aligned pin candidates, libavoid routing, and the remembered-layout key; derived flow-step edges receive comparison standings too. Focused validation: bun test --isolate src/runtime/semantic-renderer/tests/matched-kind-channels.test.ts src/runtime/semantic-renderer/tests/standing.test.ts — 23 pass, 256 assertions. Full renderer validation: bun test --isolate src/runtime/semantic-renderer — 210 pass, 6,527 assertions. Lint, formatting, type-check and frontend build pass. Repository-wide bun run check reaches test:modules but remains red only because 10 pre-existing skill-evaluation tests reject the checked-in generated evals candidate skill for forbidden evaluation terms; no evals or skill files are part of this task.

Integrated source from 9edc7b91 onto e01d64e1 without replacing the newer fixed-radius, balanced-pin refinement, label or native-scene publication mechanisms. EndpointOptions now rejects faces per endpoint-specific channel, matching native port allocation. Kept column wrapping logic unchanged. Combined renderer suite: 213 pass, 0 fail, 6442 assertions; focused skill/install coverage: 237 pass. Consumer skill and evaluation coverage now describe channel sharing accurately.

Final integration validation: bun run check passes lint, formatting, types, build and all 3363 module tests; system suite is 168 pass / 1 failure in the already-baselined codex-pane-context.test.ts voice-delivery test. Repository tests: 8 pass. All 22 real variants / 290 relationships render; Common-WebLib GwWurFMu has zero conflicting standing/direction shared runs (four existed before integration). Frontend rebuilt and server 3100 restarted; live Cloud Infrastructure redraw verified. Source simplification retained one channel function used by pin allocation and endpoint retries. Acceptance criterion 3 remains unchecked because the unrelated voice gate is still red.

Gate now green: bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included). The voice-context failure that blocked AC #3 no longer reproduces.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Relationships of opposing direction or different comparison standing no longer share a physical channel; same-kind, same-direction sharing is kept. Integrated with fixed 8px bends and mandatory 12px approaches. Verified by 213 renderer tests, 22 real variants (290 relationships) and the full gate: bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included).
<!-- SECTION:FINAL_SUMMARY:END -->
