---
id: TASK-161
title: Create cinematic hologram marketing banners
status: Done
assignee:
  - '@codex'
created_date: '2026-09-08 00:01'
updated_date: '2026-09-08 00:32'
labels: []
dependencies: []
ordinal: 313000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The project needs a marketing banner that makes human agency in enterprise architecture design visible: a standing person gently moves one holographic service group while its connections respond and a faint outline records its previous position. Use the selected cinematic dark artwork for both README color schemes, with a prominent archboard wordmark and Excalidraw colors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dark banner visibly shows human interaction, the moved component, connected system, prior-position outline, and readable archboard wordmark.
- [x] #2 The revised composition visibly places a standing person in a cinematic architectural space with a floor, depth, and room-scale hologram.
- [x] #3 The hologram depicts a structured enterprise deployment with multiple regions, network boundaries, compute clusters, traffic routing, event streaming and distinct data services distributed through 3D space.
- [x] #4 Generation prompts are kept outside the repository.
- [x] #5 The README uses the selected cinematic dark banner in both light and dark mode.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Create and visually inspect cinematic enterprise artwork, select the dark banner, save the artwork in docs/assets, and use that image for both README color schemes. Keep generation prompts outside the repository.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The README uses docs/assets/archboard-banner-enterprise-dark.png for both light and dark mode. The selected artwork is a canonical, nondeterministic image. Visual inspection verified the standing person, architectural setting, volumetric cloud deployment and previous-position ghost. PNG metadata verified 2172 by 724 pixels. All three untracked banner prompt files were moved outside the repository at user request; git history contained none of those files.

Pre-push validation: bun run check passed, including the full local serial browser lane.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created and selected the cinematic enterprise dark banner, displayed in both README color schemes. Verified the visual result, asset metadata and whitespace checks. Generation prompts are outside the repository and were never committed.
<!-- SECTION:FINAL_SUMMARY:END -->
