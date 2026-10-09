---
id: TASK-385
title: The browser spends CPU only on what changed
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 03:23'
updated_date: '2026-10-01 12:40'
labels:
  - frontend
  - performance
dependencies: []
priority: high
type: bug
ordinal: 715000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An open Archboard page used about one CPU core while nobody touched it. Measured on 2026-10-01 in headless Chromium at 1920x1080 against examples/web-shop: the renderer process used 84 to 99 percent of a core on an idle board. React committed 0.4 times per second, so React was not the idle cost. The cost was the SMIL traffic animation in the inline picture. Separately, React re-rendered far more than changed: each pan or zoom frame re-rendered about 150 sidebar components, and an audit found the voice output level, every workbench publish and every pane status subscribed in the application root. The subtasks hold the measurements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pan, a zoom, a voice level frame, a workbench publish and a pane status re-render only the components that show what changed
- [x] #2 An idle page with a board that draws traffic spends at most a third of the main-thread time and at most half of the renderer and GPU process CPU it spent before, measured with the same GPU-composited probe
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All three subtasks are done (385.01, 385.02, 385.03). The second criterion is still open: pane news (a claim, agent activity, a pane status) renders the shell, and the navigator rebuilds every row object from the shell view, so every row renders although one changed. It happens per event, not per frame or per streamed delta. Proposed as follow-up work and not started without approval.

TASK-385.04 (navigator rows) and TASK-385.05 (pane news test at the application entrypoint) close the second criterion. One legitimate render remains: a claim banner that appears or goes resizes the stage, and the camera room is React state in the stage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An open page no longer burns CPU on what does not change. The idle cost was SMIL traffic: the page now runs it as Web Animations on its own layer (385.01), and an idle Web shop board went from 77 % to 32 % of a core (renderer plus GPU process). React work was moved to the leaves. A camera move renders only the surface (385.02). The voice level, workbench publishes and pane status no longer render the root (385.03). Pane news renders only the navigator rows it is about (385.04). Each path is owned by a test at a module entrypoint: camera-renders, talk-control, agent-setup, navigator-tree and pane-news (385.05). Verified by bun run check, the full browser lane and the walkthrough recorder. The README media harness was not found in this repository, so it was not run.
<!-- SECTION:FINAL_SUMMARY:END -->
