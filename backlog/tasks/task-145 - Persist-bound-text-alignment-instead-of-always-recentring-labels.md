---
id: TASK-145
title: Persist bound-text alignment instead of always recentring labels
status: To Do
assignee: []
created_date: '2026-08-31 18:26'
labels: []
dependencies: []
references:
  - src/runtime/engine/labels.ts
  - src/runtime/engine/apply-element-input.ts
priority: medium
type: bug
ordinal: 255000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agent updates can persist textAlign and verticalAlign while applyElementInput settles the bound text to the container centre. The canvas renders the label incorrectly until a person double-clicks it, at which point Excalidraw recomputes and syncs the correct coordinates. The minimal repro calls boundTextPlacement with identical text geometry and middle versus top alignment; both return the same position because labels.ts models only containerId and text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Top- and left-aligned bound text is persisted at the same coordinates Excalidraw renders without a browser edit
- [ ] #2 Middle- and center-aligned bound text retains its current placement
- [ ] #3 A regression test covers alignment changes through the agent write boundary
- [ ] #4 The real-browser round trip reports no corrective geometry after an aligned-label write
<!-- AC:END -->
