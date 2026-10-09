---
id: TASK-452
title: Blocks keeps incompatible connection lines separate
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-09 10:33'
updated_date: '2026-10-09 10:33'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 803000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers see Blocks join lines with different relationship kinds or traffic directions. Preserve each connection meaning when routes share a corridor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Different relationship kinds remain distinct along rendered Blocks routes.
- [ ] #2 Connections with incompatible traffic directions do not join along rendered Blocks routes.
- [ ] #3 Compatible connections can still share a line, and focused regression tests exercise the reported failure.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduce incompatible joins through rendered SVG output. Add the smallest failing renderer test. Trace route grouping, port assignment, and trunk routing, then fix the owner that loses connection identity. Keep compatible sharing intact. Run focused renderer tests and bun run check. No board is affected if the fix stays inside existing routing responsibilities and interfaces.
<!-- SECTION:PLAN:END -->
