---
id: TASK-159
title: Ground spatial voice references in pane selection and board geometry
status: Done
assignee:
  - '@codex'
created_date: '2026-09-07 03:01'
updated_date: '2026-09-07 03:20'
labels: []
dependencies: []
type: bug
ordinal: 311000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Voice receives semantic context but its instructions do not explain how to resolve questions such as What does this do or the one on the left. Users need answers about the intended element without invented pointer or gaze evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Voice and coordinator instructions specify selection, board-qualified handoff, geometry lookup, and stale or ambiguous reference handling.
- [x] #2 Existing runtime instruction and realtime checks pass without adding static-content tests.
- [x] #3 Selection, focus, and board switches in the bound pane publish current context to live voice through the production routes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Match the instructions to supplied semantic context and available pane inspection. 2. Add concise reference-resolution rules to both prompts and refresh authored instruction integrity digests. 3. Run existing validation and record the spoken verification limit.

User reproduction now shows stale startup selection despite a coordinator handoff. Trace production pane signals and add a focused runtime regression for selection and board changes. Make every deictic question defer to coordinator live pane/selection inspection; voice must not assert no selection from its cache.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added explicit reference resolution to both voice and coordinator prompts: fresh utterance selection, exact pane/board/variant/element handoff, stable referent across later focus changes, geometry-based spatial lookup, refresh and ambiguity handling, and no invented pointer/gaze evidence. Refreshed the two existing authored-instruction digests. Existing instruction/realtime runtime checks pass: 67 tests, 376 assertions, 128ms. No static-content tests added. Full gate running.

Latest coordinator rollout reproduced empty-selection replies without browser inspection. Production pane routes never published the supported semantic signals. A new real-server regression failed waiting for selected IDs, then exposed stale_link because production callback targets omitted durable provenance. Connected pane selection/focus and board switches to the existing publisher and supplied the current committed ownership record. The regression now passes for selected IDs, board/variant replacement with cleared selection, and focus updates. Voice now always defers deictic and current-view questions to coordinator live pane and selection reads. 86 focused tests pass in 1.64s; no source-content tests added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Spatial and current-view questions now always defer to coordinator live pane and selection inspection; cached empty selection is not sufficient to answer. Production selection, focus and board-switch routes publish semantic updates, and callback targets include the current committed ownership record required by authority validation. A real-server regression first failed on missing selection delivery and then passes for selected IDs, switched board/variant with cleared selection, and focus changes. Shared existing production fixture helpers instead of duplicating them. All 86 focused tests and the complete bun run check pass, including the controlled browser voice workflow. No static-content tests added. Real spoken reference resolution still needs a fresh session after server restart.
<!-- SECTION:FINAL_SUMMARY:END -->
