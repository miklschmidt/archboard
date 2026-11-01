---
id: TASK-562
title: Bring the canvas motion to the owner's bar after the test of PR 26
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-01T12:52:00Z'
updated_date: '2026-11-01T13:01:00Z'
labels:
  - renderer
  - motion
dependencies: []
priority: high
ordinal: 1011000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner tested PR 26 on the largest repository board and found the motion below the bar of the TASK-560 brief: improve the motion inside the canvas until it is visually perfect, and do not stop because the numbers are good. The owner did not want a 1:1 port of the old page's motion. TASK-560 climbed with the old page as its reference, and it kept old page rules without asking why they exist. Findings of the owner: a first load shows a black canvas and then the content at once, with no entrance. The first scroll freezes the board for a long time. Traffic stops during a pan or a zoom, an old performance hack. The near and far views cut after a zoom ends. On Hyprland the renderer crashed after a workspace switch, with `Error creating wgpu::Texture` from the GPU process on every frame.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A first load in an empty browser profile shows the entrance of the picture, with no black canvas and no instant appearance
- [ ] #2 The first wheel after a load draws no gap that a reader can see, in an empty browser profile on the largest board
- [ ] #3 Traffic keeps running through a pan, a pinch and a wheel, and the code that holds traffic is gone
- [ ] #4 The near and far views change in real time during a zoom or a flight, and no cut follows the end of a zoom
- [ ] #5 A workspace switch on Hyprland leaves a correct board, and a painter whose device or surface fails recovers without a reload
- [ ] #6 A full pass over every moment judges captured frames against the best that the GPU painter can do, not against the old page, and the task notes name what the pass covered
- [ ] #7 docs/design/vello-painter.md and ADR 0071 state the new behavior and carry no claim that the last pass disproved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete the traffic hold on pan and zoom, in the page and in the painter.
2. Cold load: start one shared GPU device early, compile its pipelines by drawing once, and wait for the GPU before the first picture. Give the stage a motion clock that drops stalls, so that a slow frame never eats a flight.
3. Recovery: observe uncaptured errors and device loss, and start a GPU painter again without a reload.
4. Far view: drive the swap from the camera as it is drawn, not from where it comes to rest.
5. First scroll: reproduce at the real window size, 7680x2160 at scale 1.25, in an empty profile. The owner retests on Hyprland.
6. Hill climb every moment with captured frames, at the real window size, judged against what the GPU painter can do, not against the old page.
7. Correct docs/design/vello-painter.md and ADR 0071.
<!-- SECTION:PLAN:END -->
