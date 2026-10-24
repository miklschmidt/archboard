---
id: TASK-524
title: Open the full diagram for the README history demonstration
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 14:34'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The required README refresh stops before git-history can select Validate order. The scene opens the overview, which hides the nested Orders parts. The captured frame confirms that only the outer Orders module is visible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The git-history producer completes through real inspector and footprint results.
- [ ] #2 The generated clip and thumbnail show the nested parts and their history.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board changes: this repairs the existing demonstration address. Add the existing viewA=Everything address only to the history scene. Keep the interface scenes on the overview. Regenerate git-history, inspect its frames and thumbnail, and run the complete normal gate with TASK-517.
<!-- SECTION:PLAN:END -->
