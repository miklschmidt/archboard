---
id: TASK-407
title: >-
  The traffic glow mixes white into the line color in the light and the dark
  theme
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 09:53'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0027-explicit-traffic-controls-distance-based-animation.md
ordinal: 694000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The glow of a traffic pulse takes its color from the text color. In the light theme that makes a pulse look like a short dark dash on a colored line, and the still pictures of the README show it. The owner wants the glow to mix white into the color of its line, in both themes, so that a pulse reads as light travelling along the line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pulse glow is the color of its line with white mixed in, in the light and the dark theme, and it no longer uses the text color
- [x] #2 Pulse glow remains visible on neutral and colored lines, on the page and on tray floors, in both themes. The notes record the contrast method.
- [x] #3 The README pictures and clips that show a pulse and that the change made stale are made again or are listed for a person
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find where a pulse takes the text color (lib/svg/pulse.ts, beam-light.ts, traffic.ts, palette roles). 2. Mix white into the color of the line for the glow in both themes, by a share that you judge by looking at neutral and colored lines on the page and on a plinth. 3. Update the tests that hold the glow color. 4. Render the pictures in both themes, run bun run check, and make the README pictures that show a pulse again or list them.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A pulse is now its line colour with white mixed in from --diagram-glow (commit 18aa59baa): body 65 percent white and hot front 90 percent on the light ground, 50 and 80 percent on the dark. The light-dark cut of the halo mask is gone: the halo is white on both grounds. The legend's traffic sample takes the same colour through the new pulseInk export (commit 875fdf5dc). Judged by frames of a fixture with neutral, coloured and muted traffic on the page and on a container, captured in headless Chromium from an HTML page that holds the SVG inline and calls pauseAnimations and setCurrentTime (t = 0 and 0.4 s), and by the review set. WCAG contrast of the pulse against its line: light neutral body 2.63 and hot 3.55, light sky body 1.91 and hot 2.48, dark neutral body 2.16 and hot 3.16, dark sky body 2.35 and hot 2.97. On the light page a pulse reads as a light streak in its line, and its glow shows only on a face darker than the page. README pictures and clips that show a pulse were not made again.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 2: A pulse stays visible on a neutral line and on a colored line, on the page and on a plinth, in both themes, and the notes say how the contrast was judged

README completion: architecture, sequence, Web shop and banner assets were regenerated and inspected. Stale assets listed for a person: hero, plan, history, drill-down, take-back, ask, explainer, pr-walkthrough and newcomer. The last four need Codex access. No assets were uploaded.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Traffic glow mixes white into the relationship color in both themes. Pulse owners pass. Static README pictures are refreshed, and the notes list the remaining clips. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
