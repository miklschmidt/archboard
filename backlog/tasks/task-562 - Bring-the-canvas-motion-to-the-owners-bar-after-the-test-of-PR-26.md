---
id: TASK-562
title: Bring the canvas motion to the owner's bar after the test of PR 26
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-01T12:52:00Z'
updated_date: '2026-11-02T01:16:00Z'
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

8. Design the motion for the GPU: a lens at the blit stage, a bloom from the middle, shared subjects that fly across boards, and a door that carries its parts. Judge it against the owner's words, not against the old page.

Review e25501ab2..42923cc56 against the motion contract. Repair verified interruption, reveal, and GPU faults with focused tests and signed commits. Finish with bun run check on the final commit.
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

The review covers commits a268c576f through c37efb119. The fixes isolate GPU lifetimes and retain stop notifications until the stage subscribes. They also preserve masks, card transforms, shadows, and traffic when a new picture interrupts an entrance or flight. Visible entrances blend the near and far views. Reduced motion ends the pending fade at once. Each fix has a signed commit and a focused regression test.

These repairs stay within the existing browser, renderer, and painter owners. They change no architecture module, relationship, flow, or consumer contract. The existing architecture stays accurate, so no proposal is needed.

This review does not retest Hyprland workspace switches or establish visual acceptance.

Review validation: The explicit core build passed. All 106 archboard-paint tests and the three GPU lifecycle tests passed. The focused page and painter tests passed. The final `bun run check` passed on commit 29ff33d69 with all 21 tasks and 49 browser owners. The review leaves no verified finding open. The task stays In Progress because this review does not establish its remaining visual and Hyprland acceptance criteria.

## The owner's second test

The owner said of the climb above: "These are just the same as it were before." They also said: "I expected some polished magic here." The climb fixed real faults and kept the old choreography. This pass designs the motion for the GPU. The design note holds the table of moments.

One material carries it: focus. A lens runs between Vello and the surface while a picture moves, and a frame at rest never meets it. A flight keeps the card sharp over a blurred board, a move to another board racks through a dissolve, and an entrance comes into focus from the middle. A picture blooms out of its middle, shared subjects fly across a change of board, a door carries its parts inside it, and lines are drawn on with light at their heads.

A true before and after of a flight shows no new long frames, and a build with the lens switched off gives the same numbers as one with it. The design rule against blur over the picture now names shell layers, because the lens is part of the picture. That is a change to a stated rule, so the owner can reverse it.

AC 6 stays open until the owner judges this pass.

## The owner's third message

The owner asked for motion that reflects the depth of the recursive decomposition: sideways at the same depth, a zoom into a deeper module, and a zoom out to a shallower one. The module tree now decides every move between boards. See ADR 0071, "A move follows the module tree", and DESIGN.md, "The Depth Rule". The moves were filmed and looked at. AC 6 stays open until the owner judges this pass.

The final commit of this pass is 7ce152d81. `bun run check` passed on it, and parity is 0.157 percent of ink apart on average, worst case 0.78 percent. The commits after a268c576f are not pushed and did not receive the delegated review. The owner authorizes a push, and the review runs before it.

Line reveal: the owner found the lines too fast and asked for lines along traced connections, or a reveal from the top left. A spark now draws each line in the order of the connections, a card it lands on takes the spark round its edge, and a line that changes its shape leaves and is drawn again. A first load finishes its lines at about 2.1 s and a door at about 1.9 s. The diagonal reveal was filmed for comparison and removed, because its order says nothing about the board. The commit is d28988f4d. bun run check passed on it, 21 of 21. Nothing after a268c576f is pushed or reviewed. Video: /tmp/vello/line-reveal.mp4. AC 5 stays open until the owner retests Hyprland, and AC 6 and AC 7 stay open until the owner judges the motion.

The review covers the painter and browser scene decisions within their existing owners. It changes no architecture module, relationship, flow, or consumer contract, so the canonical model needs no proposal.

Review of e25501ab2..42923cc56: eight behavior findings and two standards findings are fixed. Off-board sources now feed the reveal order (4fc10b4a9). Small surfaces use valid lens levels and shader coordinates (121e22584). Lens uniforms use stack storage (91583dc8d). Landing waits for rims, labels, and pulse fades (721f33022). Interrupted entrances retain the visible scene, card transforms, and opacity. Edits retain passage planes, and departures also apply while sparks run (e499ba09c). The passage shutter duration lives in @archboard/timing (3f87b48d2). Dashed strokes fade and hold their arrowheads back (7e04ba0db). Edits retain every spark layer and the remaining rims (7888f771c). Focused CPU raster regressions cover early motion, progress past 1, passage edits, shared cards, and departure during sparks. Both requested Clippy commands pass. The core build and all 16 scene-rule tests pass. A headless WebGPU run drew and resized the lens at seven sizes from 1x1 to 1920x1080 with no validation errors. The complete gate runs on the final review checkpoint. No further agents ran, no commits were pushed, and no repository selection changed. Hyprland recovery and visual acceptance remain with the owner, so the open acceptance criteria and task status stay as they are.

The complete gate passed all 21 tasks and 49 browser owners at 8255d50fd. A further CPU regression exposed a rim disappearing on the second edit during its fade. The repair retains both direct rim shapes and their fading wrappers. The same regression now covers consecutive edits. The core build and complete gate run again on the final checkpoint.

Pass before the push. A gpt-6.1-sol review of e25501ab2..42923cc56 found two standards faults and eight behavior faults, and it fixed each of them in the commits from 4fc10b4a9 to b6c81446c. The gate gave exit 0 with 21 of 21 tasks on b6c81446c, in the review and again in a separate run. Parity gave 2112 comparisons, a mean of 0.157 percent and a worst case of 0.783 percent. In three runs of each move on the large board at 60 Hz, a door drew 104 frames, with 8 frames over 25 ms and a longest gap of 83 ms, and a dive drew 97 frames, with 6 frames over 25 ms and a longest gap of 67 ms. A first load, a door, a flight and a first load with reduced motion were filmed on this build and looked at. The depth moves in, out and sideways were filmed on this build for the pull request.

Junction marks now recede with their lines. The painter read the light from groups only, and a junction mark names its lines on the shape, so its dots and bars stayed at full strength while the lines receded. A mark now shows as much as the brightest of its lines, and this matches the rule in markVeil. On the real page with the pointer on a card, unlit dots measured a fade of 1.0 before the fix and 0.38 after it on the CPU painter. They measured 0.39 after it on the GPU painter, which had no before run. Lines measured 0.25 and 0.24, and lit dots stayed at 1.0. A dimmed dot reads a little stronger than its line because it sits over that line, as it does in the SVG.

Containers now open on entry. One square front leaves the middle of the picture and passes the last container in 456 ms, each container shows where the front passed, and a thin edge runs with the front and cools as the container lands. The cards start up to 46 ms later and the sparks 45 ms later, so that the front stays ahead of them. The owner reported that containers just popped in. Filmed on the held clock on the largest board and on one with three open doors, on both grounds, with prefers-reduced-motion, and with a door pressed during the opening. A door pressed during an opening showed dark patches beside some cards, and the same patches showed with the old fade, so they are not from this change and stay unexplained.
<!-- SECTION:NOTES:END -->
