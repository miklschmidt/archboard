---
id: TASK-132
title: Keep canonical human corrections off the full-scene path
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 02:52'
labels: []
dependencies: []
references:
  - scripts/check-human-edit-performance.mjs
  - src/ui/canvas/useCanvasSession.ts
  - src/ui/canvas/change-reporting.ts
priority: high
type: bug
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The retained 10,000-element human-performance browser check intermittently observes two full-scene applications during an ordinary compact acknowledgement that carries one canonical element correction. The same exact check alternates between [0,0] and [0,0,2], so bun run check is unreliable and the behavior may reintroduce the report-time canvas work TASK-118 removed. Diagnose the first caller and fix only the proven correction path. Do not weaken the zero-full-scene assertion, relax timing, remove the real browser check, or change agent-write semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A repeatable focused loop identifies the exact response and first caller responsible for the intermittent [0,0,2] full-scene applications
- [ ] #2 An ordinary compact human acknowledgement, including a real one-element canonical correction, applies no full 10,000-element scene and preserves any newer local edit
- [ ] #3 Focused reducer/reporting coverage locks the proven correction path without duplicating the browser implementation
- [ ] #4 The serialized human-performance check is stable across repeated runs and bun run check passes without assertion or timing weakening
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the retained human-performance failure in a short serialized loop and tag only the acknowledgement, server-update, and applySceneUpdate boundaries needed to identify the first full-scene caller. 2. Test the ranked hypotheses one variable at a time and remove all temporary instrumentation. 3. Add the smallest reducer/reporting regression at the real seam, then fix only the proven path. 4. Run focused reporting/type/lint/format checks, repeated human-performance browser runs, the complete sequential check, and independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Discovery evidence: the integrated bun run check failed with full-scene counts [0,0,2]. An immediate isolated rerun passed [0,0]. A three-run serialized loop then passed run 1 and failed run 2 with [0,0,2]. Both failing runs had five compact responses, four empty corrections, and a final one-element correction; no agent write occurred.
<!-- SECTION:NOTES:END -->
