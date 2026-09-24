---
id: TASK-339
title: 'Traffic reads as flow: marks that show their direction, even at rest'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 14:01'
updated_date: '2026-09-24 15:47'
labels:
  - renderer
dependencies: []
priority: medium
type: feature
ordinal: 580000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User request 2026-09-24: the traffic visualization is plain round dots riding the line, and the user asked for something better ('let me see you flex your skills and do something cool'). The same dots also make a junction mark (TASK-337) hard to tell apart. A round dot says nothing about direction, which matters most in a still picture, where the marks are drawn at rest. ADR 0027 keeps its contract: speed in diagram units per second, volume in marks per second, marks already spread along the route at load, none for removed relationships or reduced-motion readers, animation kept in exported SVG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A traffic mark shows which way its relationship flows, in a still picture as well as in motion
- [x] #2 ADR 0027's rates hold: equal speed on short and long routes, marks entering at the volume, spread along the route at load
- [x] #3 Removed relationships and reduced-motion readers show no traffic marks
- [x] #4 A sequence's timed marks share the same visual language
- [x] #5 Before and after pictures of every view of every dogfood board are shown to the user
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board affected: traffic marks are painting, not architecture.
1. Architecture traffic becomes comets: a capsule head and a tail of stacked dash layers that taper and fade behind it, in the line's ink mixed toward the page's text colour, with a glow on dark pages. Every layer is one dash pattern with the old spacing and interval (ADR 0027 rates unchanged).
2. Sequence timed marks become comets with a gradient teardrop tail that turns with the line (animateMotion rotate=auto).
3. Update the motion test to hold every layer to the spacing and interval; amend ADR 0027.
4. Check motion with frames captured at set times in headless Chromium, and show before and after of every board and view.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decisions 2026-09-24: comets over dots; coloured lines drawn at 75% of their colour (mixed, not translucent) with comets at full strength, and only the neutral grey's comets shaded toward the text colour; a faint glow on light pages as well; default traffic raised to 80 units and one mark a second, keeping the 80-unit spacing. The one-ink owners became one-colour owners (same hue, comets and band at full strength). Legend samples use the same line strength. ADR 0025 and 0027 amended. A dash rounding drift (80.001) was caught by the rate owner and fixed.

User refinement 2026-09-24: a coloured comet's head mixes 30% of the page's text colour into the relationship's full colour (the neutral grey's head 60%), and each tail layer blends from the head's colour back into the line's drawn colour by how far back it reaches; the sequence comet's gradient runs from the line's colour to the head's. The colour owners now hold every comet layer to the line's hue and the head farther from the page than the line.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Traffic is drawn as comets that show their direction at rest and in motion: a capsule head ringed by the page's colour, a soft glow and a tapering tail. Coloured lines are drawn at three quarters of their colour and their comets at full strength; the neutral line's comets lean toward the page's text. Sequence marks are comets that turn with their line. Defaults are now 80 units and one mark a second. Verified by the motion, legibility, crossing and grouping owners, frames captured at set times in headless Chromium, the before and after gallery the user reviewed, and the gate lanes.
<!-- SECTION:FINAL_SUMMARY:END -->
