---
id: TASK-389
title: >-
  The Talk key turns into the voice circle, and the circle is lit by what the
  model says
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 20:52'
updated_date: '2026-10-03 21:38'
labels: []
dependencies: []
priority: medium
type: enhancement
ordinal: 678000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The agent dock drew two separate layouts. Pressing Talk removed the key and put a new circle at the head of the dock, so voice started with a cut: the dock jumped in height, the parts jumped to new places, and keyboard focus was lost with the key. The circle itself was a row of bars driven by one number, so a speaking voice looked no more alive than a level meter. This work makes the start and the end of voice one continuous motion, and gives the live voice a picture that answers the model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Talk key and the voice circle are one button: starting voice does not replace it, and keyboard focus stays on it
- [x] #2 The dock grows or shrinks and every part glides to its place over VOICE_MORPH_MS when voice starts or ends, with the key becoming a circle and back; a person who asked for reduced motion gets a cut
- [x] #3 The circle follows the model output level only: ruled lines heave while the model speaks, breathe while it listens, go flat and dim when muted, and the ring draws itself while voice connects
- [x] #4 The orb runs no animation frame once voice has ended and its light is gone
- [x] #5 The dock wash blooms from the circle and brightens and fades with the voice
- [x] #6 `?voiceDemo=cycle` walks the voice through every stage, so the motion can be watched without Codex
- [x] #7 Types, lint and the module tests pass on the touched code, and no board the vault draws is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One persistent grid for both dock layouts (calm, live) with named parts, replacing CalmDock and LiveDock, so the voice button, the status, the plan and the conversation key are the same elements in both.
2. A FLIP hook (use-dock-motion) that remembers where each part stood and plays it from there on a layout change, animates the dock height, and morphs the voice plate between the key and the circle; reduced motion cuts.
3. A voice-orb module: pure dynamics (critically damped springs, level follower, ridge history, spark, rings), a canvas painter (gold ring, eleven ruled lines, dish and bloom), colours read from the theme, and a frame loop that stops when the orb is dark.
4. Durations in src/shared/timing, with what each pulls against; the dock wash bloom and lit follow the voice through --lit.
5. A cycling demonstration under ?voiceDemo=cycle, tests for the dynamics and for the one-button contract, and DESIGN.md updated.
No board is affected: the Browser application board draws the voice session and the workbench client, not the dock or its picture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Orb look chosen after a standalone contact sheet of every state in both themes: a gold ring round a lens of eleven ruled lines (a drafting sheet), because a ridge that rolls back through its lines shows the sentence and not only the level, and it keeps the dock a drawing table rather than a meter. The dock is one grid, so one persistent button; the FLIP hook measures parts from the dock top left so a resized window does not move them.

Verification: the browser tab is hidden, so real-time animation cannot be watched. Instead time was frozen at the layout flip, the dock animations were paused and set to chosen times, and the orb frames were stepped by hand, in dark and light themes, both directions. Frames show the key narrowing to a circle while rising, the ring drawing, the lines rising, listening, speaking, muted and the reverse. The first flip after a page load in a hidden tab starts its colour transition from the light theme colour; that is an artifact of no frames having been drawn, not of the product.

Tests: src/ui/voice-orb/tests/orb-dynamics.test.ts (lights and goes dark and still, rings one at a time, mute hushes, a stalled tab does not jump, rest for no motion) and src/ui/workbench/tests/agent-dock.test.tsx (one button that keeps focus; glides, and cuts for reduced motion). Module lane: 3824 pass, 5 fail. The 5 (pane-news, navigator-tree, the pane trail) fail the same on a clean checkout of HEAD, so they are not from this work. Lint is clean on the touched scope; TalkControl.tsx, untouched, still has its ui-concern-placement finding for useAudible.

Finish review (impeccable-finish-reviewer, fresh agent, from stepped frames): disposition fix with eight material fixes. Applied in one batch: the orb moved inside the plate and is clipped to it while it glides; new parts fade in after the plate has passed (linear iteration easing, keyframe offset); the plate edge turns gold so gold runs from the key to the ring; the plate passes under every other part (z-order) instead of reordering the incumbent calm layout; the sheen is capped at about 5 s a lap; a muted voice word is muted ink; an interrupted glide reverses from where the eye sees the parts (rest place plus the running animation shift, read from computed style); the sheet now reads a 2 s trace of the measured level instead of an invented profile.

Verdict pass: 7 resolved, fix 6 (truth of the face) partial because the 1 - u squared window reduced the trace to one central peak. Replaced with a flat-topped window that tapers only the outer fifth; checked in dark and light frames afterwards, not re-scored by the reviewer. Not done, and the user decides: a real output spectrum (AnalyserNode on the playback stream) would make each line a spectral record of the speech. It needs changes in voice-output-level, voice-session, codex-realtime, the workbench contract and the application hook, and real-audio testing. Real-time feel and the per-frame layout cost of animating the dock height were not observable in a hidden tab.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Talk key and the voice circle are one button in one grid, and the dock turns between its calm and live layouts with a half-second glide: the plate narrows to a circle and rises to the head, the dock grows or shrinks, parts that were not there fade in, and a person who asked for reduced motion gets a cut. The circle is drawn by a new voice-orb module: a gold ring that draws itself and whose sheen turns faster the louder the voice, round eleven ruled lines that lie flat and breathe while listening and heave while the model speaks, each line showing what the one in front showed a moment ago, with a ring of light on a hard onset and on connecting. The dock wash blooms from the circle and follows the light. Durations are in src/shared/timing, DESIGN.md is updated, and ?voiceDemo=cycle walks every stage. Verified with unit tests of the motion and of the one-button and reduced-motion contracts, type-check and lint on the touched scope, and stepped browser frames in both themes and both directions.

A finish review followed: seven of its eight fixes were verified resolved by the reviewer, and the eighth (the face reading the real level history across the whole sheet) was fixed afterwards and checked in frames. A spectrum is left to the user.
<!-- SECTION:FINAL_SUMMARY:END -->
