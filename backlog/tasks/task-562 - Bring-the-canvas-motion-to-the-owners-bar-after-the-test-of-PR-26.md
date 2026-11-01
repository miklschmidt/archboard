---
id: TASK-562
title: Bring the canvas motion to the owner's bar after the test of PR 26
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-01T12:52:00Z'
updated_date: '2026-11-01T15:21:00Z'
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
- [x] #1 A first load in an empty browser profile shows the entrance of the picture, with no black canvas and no instant appearance
- [x] #2 The first wheel after a load draws no gap that a reader can see, in an empty browser profile on the largest board
- [x] #3 Traffic keeps running through a pan, a pinch and a wheel, and the code that holds traffic is gone
- [x] #4 The near and far views change in real time during a zoom or a flight, and no cut follows the end of a zoom
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## The bar, and what went wrong first

The first pass of TASK-560 ran at 1920x1080 under emulation and judged moments against the old page. It reported nothing left to improve, and that claim was false. The real canvas holds 13.3 million pixels. The method now films each moment at that size and judges it against what the GPU painter can do.

## The five findings

1. First load: fixed. A see-through layer took a canvas-sized layer, one GPU now starts as the page boots, and each shadow comes in with what casts it.
2. First scroll: reproduced and fixed. An earlier note said that it did not reproduce, because that check read only frame gaps. Two fixed Vello buffers filled at one wheel notch, so the canvas kept its last frame. `crates/vendor/vello_encoding` raises `tiles` and `ptcl`, for 48 MB more GPU memory.
3. The traffic hold is deleted.
4. The near and far swap starts as the camera crosses the line.
5. Hyprland crash: not reproduced. A device that stops now starts a new GPU painter, and a forced failure proved that path. A failure that repeats while the window is hidden leaves the board on the CPU painter until a reload. The owner must retest this.

## What the last pass covered

A first load, a door flight, a picture that arrives during a flight, a dive, the way back, the takeover at the end of each, a pointer's rest, a pick with its sweep, the recede, the fit key, the arrow keys, a drag, a wheel in and out, a pinch, opening a sequence, the departure, a change of flow, a walkthrough step on the small fixture model, and a door and a dive with reduced motion.

The pass did not film the light theme or any moment at 120 Hz. Both labs show 60 Hz at most.

## What stays

docs/design/vello-painter.md lists what stays. The largest is a draw on the main thread, about 90 ms just before a flight on a large board. A move of that draw to a worker is a decision for the owner, so no task exists for it.

## Lab facts

The private sway compositor stopped at its time limit. The later films and the parity run used headless Chrome on the same NVIDIA adapter. Those runs read each frame from the WebGPU swap texture, through a lab copy of the parity script. In that browser, the first adapter request can answer null, so the lab copy retries.
<!-- SECTION:NOTES:END -->
