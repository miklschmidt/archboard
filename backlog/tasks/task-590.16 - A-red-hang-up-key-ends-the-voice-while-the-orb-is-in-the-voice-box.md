---
id: TASK-590.16
title: A red hang-up key ends the voice while the orb is in the voice box
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-08T02:18:00Z'
updated_date: '2026-11-08T02:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1059000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-08 the owner asked for a red hang-up key in the Narrate key's place at the foot of a presented walkthrough while the orb rests in the floating voice box (TASK-590.09). Today the key there only says 'Voice is on. End it to narrate.' and offers no way to end it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While the orb is away in the voice box, the Narrate key's place holds a red key that ends the voice, with an accessible name
- [ ] #2 The key animates in as the orb leaves for the voice box, and animates out during the shared transition in which the orb flies back to the Narrate key when the voice ends
- [ ] #3 With reduced motion the key appears and goes without animation, and a test proves that pressing it ends the voice
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. orb-stage.ts: wanted() says where the orb is wanted, and a change of wish notifies the listeners; use-orb-stage.ts gains useOrbWanted, exported from api/voice.
2. circle-state.ts: voiceEnd, the end action while voice can be ended, which voicePress uses; exported for the foot.
3. PresentationFoot: while the orb is wanted in the box, the Narrate key is the hang-up key: a red disc with the handset in the seat the orb left, and the words Hang up. A press ends the voice. As voice ends the dock wishes the orb back into the seat, so the red disc and the words go while the orb flies home.
4. app.css: the disc and the words cross-fade, in after the orb leaves and out before it lands; none with reduced motion.
5. Unit test: the key ends the voice while the orb is wanted in the box; browser check of the motion in both themes.
<!-- SECTION:PLAN:END -->
