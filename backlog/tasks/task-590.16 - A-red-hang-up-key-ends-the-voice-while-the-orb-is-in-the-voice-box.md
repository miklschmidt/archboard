---
id: TASK-590.16
title: A red hang-up key ends the voice while the orb is in the voice box
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T02:18:00Z'
updated_date: '2026-11-08T03:35:00Z'
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
- [x] #1 While the orb is away in the voice box, the Narrate key's place holds a red key that ends the voice, with an accessible name
- [x] #2 The key animates in as the orb leaves for the voice box, and animates out during the shared transition in which the orb flies back to the Narrate key when the voice ends
- [x] #3 With reduced motion the key appears and goes without animation, and a test proves that pressing it ends the voice
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. orb-stage.ts: wanted() says where the orb is wanted, and a change of wish notifies the listeners; use-orb-stage.ts gains useOrbWanted, exported from api/voice.
2. circle-state.ts: voiceEnd, the end action while voice can be ended, which voicePress uses; exported for the foot.
3. PresentationFoot: while the orb is wanted in the box, the Narrate key is the hang-up key: a red disc with the handset in the seat the orb left, and the words Hang up. A press ends the voice. As voice ends the dock wishes the orb back into the seat, so the red disc and the words go while the orb flies home.
4. app.css: the disc and the words cross-fade, in after the orb leaves and out before it lands; none with reduced motion.
5. Unit test: the key ends the voice while the orb is wanted in the box; browser check of the motion in both themes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
To keep the workbench under its interface-width ceiling of 109 (ADR 0058), useOrbLaunch, useOrbWanted and voiceEnd became one export, useNarrateKey, which returns launch, hangingUp and end (d191e4e43). With prefers-reduced-motion the hang-up disc has a transition of 1e-06s in the browser, so it appears without animation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
While the lit orb is wanted in the voice box, the Narrate key of a presented walkthrough is a red Hang up key that ends the voice. The red disc and its words fade in after the orb leaves and out while it flies home, with no animation under reduced motion. Proof: presentation-hang-up.test.tsx, orb-stage.test.tsx, voice-box-presented.test.ts in the browser lane, and screenshots in both themes.
<!-- SECTION:FINAL_SUMMARY:END -->
