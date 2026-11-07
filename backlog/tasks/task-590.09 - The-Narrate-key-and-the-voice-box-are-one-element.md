---
id: TASK-590.09
title: The Narrate key and the voice box are one element
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-07T15:06:00Z'
labels: []
dependencies: []
references:
  - packages/workbench/src/ui/workbench-client/orb/state/orb-stage.ts
  - >-
    apps/web/src/ui/architecture-drawing/canvas/presentation/components/PresentationFoot.tsx
parent_task_id: TASK-590
ordinal: 1052000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-07 the owner asked for a shared element transition between the Narrate key at the foot of a presented walkthrough's column and the voice box that floats low over the picture. Both are pills with a gold circle at their start, and today both show at once while voice is on, so the page shows two versions of the same thing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Starting a narration from the Narrate key morphs the key into the voice box over the picture, and the gold circle becomes the orb
- [ ] #2 When the voice ends while a walkthrough is presented, the voice box morphs back into the Narrate key
- [ ] #3 The key and the box never show at the same time
- [ ] #4 With reduced motion the key and the box change places at once
<!-- AC:END -->
