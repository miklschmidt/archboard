---
id: TASK-560
title: Vello paints the board canvas, and motion lives in the painter
status: Done
assignee:
  - '@claude'
created_date: '2026-11-01T03:41:00Z'
updated_date: '2026-11-01T11:09:00Z'
labels: []
dependencies: []
documentation:
  - >-
    docs/adr/0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
  - docs/design/typed-scene.md
ordinal: 1009000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants smoother animations and transitions in the canvas. A browser pane shows a server-drawn SVG, and every moment of motion is DOM work over it. The typed scene (TASK-520.10) lets a frontend paint without SVG or CSS, and ADR 0059 names Vello for a native frontend. This task makes Vello the default painter of the browser canvas, moves motion into the painter as pure functions of typed scenes, and keeps SVG for exports. It changes the clause of ADR 0059 that the browser viewer keeps its classes and Web Animations over the SVG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Vello paints the browser canvas by default and the painter in use can be inspected
- [x] #2 A person with no WebGPU adapter sees a correct board, chosen by a deterministic rule that a real run measured
- [x] #3 No SVG DOM motion remains in the browser viewer, and SVG stays for exports, PNGs and README assets
- [x] #4 Search, copy, screen readers, keyboard and picking keep the behavior that the page has now
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record the design: docs/design/vello-painter.md and ADR 0071, which amends the clause of ADR 0059 on classes and Web Animations over the SVG.
2. Add crates/archboard-paint: colour, Canvas, the draw walk under a Presentation, pick, traffic and Between, with vello_cpu natively so that parity and motion tests need no GPU and no DOM.
3. Add crates/archboard-painter-wasm, a lazily loaded build with vello on WebGPU and vello_cpu otherwise. Extend build-core and its source hash.
4. Carry the scene in a browser drawing. The drawn SVG stays in the page as a layer with no ink for search, copy, screen readers and the viewer's marks.
5. Add one stage client that owns the canvas, the WASM and the frames. Move light, far view, traffic, sweep, entrance, departure, dive and picture changes to it, and move picking to the painter.
6. Delete the SVG DOM motion and its CSS. Migrate the tests.
7. Gate on parity: draw the corpus with both painters in both themes, compare rasters, look at the worst at 1920x1080, fix, record numbers. bun run check green.
8. Hill climb each moment with the TASK-405 method and captured frames. Record the last full pass.
9. Simplify, review on gpt-6.1-sol at xhigh through delegate_task, check until green, update the boards.
10. Deliver only if PR #19 merged.

Review against 11b0f32db: restore complete SVG ink after painter failure, correct stage lifecycle and canvas ownership, fix retained drawing cache collisions, and make reduced motion cut delayed lighting. Inspect timed changes and picking against the stated contracts. Run the required focused gates and commit each review scope.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-11-01. Machine: NixOS, Linux 6.18, RTX 4090, Chrome 155.0.8059.79, 1920x1080, main thread. Board: scope-vKEsyHFk (3646 by 2117 units, 6292 painted paths), naive walker, no traffic or light, 540 frames. Slow frame = over 25 ms.
Rebuilt google-chrome, headed: adapter nvidia/lovelace, isFallbackAdapter false. vello: encode 4.2 ms median, render 1.0 ms, gap 8.3 ms (120 Hz), 1 of 540 slow. First pipeline compile about 713 ms.
vello_hybrid on WebGL2: encode 9-17 ms, render 2-10 ms, gap 12-23 ms, 77 of 540 slow.
vello_cpu: encode 9-16 ms, raster and putImageData 11-17 ms, gap 21-34 ms, about 365 of 540 slow, the same headless.
Software GPUs: SwiftShader WebGPU took over 8 s a frame and did not finish. SwiftShader WebGL2 took 480-790 ms a frame.
No WebGPU adapter: headless Chrome (also with --disable-gpu-sandbox), the system chromium 155, Playwright chromium-1181 (139). Firefox 158 on Linux has no navigator.gpu. Safari, Windows and macOS were not measured.
Cause on this machine before the rebuild, as the owner found: the GPU sandbox hid the NVIDIA Vulkan driver under /run/opengl-driver.
Decision: vello when WebGPU gives a non-fallback adapter and a device, otherwise vello_cpu. No vello_hybrid: it is a third backend, panics on mask layers, and pins another wgpu and vello_common, for little gain in the worst case.

Update 2026-11-01. After the owner rebuilt the wrapper, headless google-chrome 155 gets nvidia/lovelace with isFallbackAdapter false. The wrapper adds --enable-features=Vulkan --use-angle=vulkan --disable-vulkan-surface to a headless run and sets VK_ICD_FILENAMES. Probe results with --headless=new: wrapper default, adapter found. Own --enable-features that includes Vulkan, adapter found. Own --enable-features without Vulkan, no adapter. /run/current-system/sw/bin/chromium 155, no adapter. Playwright chromium-1181, no adapter. This replaces the earlier line that headless Chrome has no adapter. This covers this machine and the Nix-built browser only. The repository's headless launcher tries chromium first (packages/renderer/src/runtime/processes/headless-chromium/process.ts), so on this machine it still starts a browser with no adapter unless the system chromium is rebuilt.

Open, owned by another agent at the owner's request: the WebGPU probe finds nvidia/lovelace in headless google-chrome, but a Vello spike run in the same headless browser gave a transparent canvas. Pixels read in the task that drew them: 1 colour, [0,0,0,0]. Headed, the same read gave 244 colours. In that headless run the page's own requestAdapter returned null, and wgpu startup still reported no error with frame gaps of 16.7 ms. Decision for the painter: a start with no error proves nothing, so the stage reads back its first GPU frame and uses vello_cpu when that frame is blank. Parity and frame measurements of the GPU painter run headed until this is fixed.

Correction 2026-11-01, replaces the decision in the previous note. The owner advised against a blank-frame fallback, so the stage does not read back its first GPU frame. The rule: vello when requestAdapter gives a non-fallback adapter and a device, otherwise vello_cpu, with the reason logged and data-painter inspectable.
Flags: RASTER_FLAGS (session.ts:60) and render-talk.ts:130 carry --disable-gpu, which gives a null adapter. That does not touch this work's painter choice for PNG export, because export still goes through the SVG, so both stay. record-walkthrough.ts has no --disable-gpu. Add it there, so that a recording takes vello_cpu by the normal rule and the page needs no override.
Still open for the agent that owns headless GPU: the blank spike run did not use those flags. It ran google-chrome with --headless=new and window flags only. The same requestAdapter call found an adapter in the probe and returned null in the spike page, and wgpu's own request_adapter then succeeded.

Phase 1 parity gate, the method: `scripts/render-corpus.ts` draws 528 readings of the corpus, near and far, in both themes. `scripts/paint-parity.ts` draws each reading with the server SVG, Vello on the GPU and Vello on the CPU in a browser with a window, and compares rasters. A pixel counts as different when no pixel of its 3x3 neighbourhood is within a tolerance of 0.1. The share counts against the pixels that hold ink.

Phase 1 parity gate, the numbers: the first 332 readings hit a time limit and left no report, so the script now journals each comparison. Three of those 332 readings reached 1% of ink, all far and light on both painters, and the worst show small text antialiasing at half scale. The other 196 readings gave 784 comparisons with batch averages of 0.305%, 0.332% and 0.300%. The worst is 1.34%, `examples_web-shop_Shop_Synchronous_checkout_whole_model_blocks_light_plain`, far, on the GPU, and it looks the same by eye. Traffic on the largest board differs by 0.10%, 0.11%, 0.26% and 0.28%.

Phase 1 parity gate, the look: screenshots at 1920x1080 from both servers match at a line crossing with rails, in the slab look, for a picked line with its halo, and for a tip and the recede at the fit zoom. A far dashed line looks a little dimmer, because emulation resamples the canvas. Sequence and flowchart parity rests on the corpus numbers, because the screenshot driver did not open a flow.

Phase 1 parity gate, the pointer: a grid of 64 real pointer rests gives the same part on both servers at 64 of 64 points at zoom 14, 64 of 64 at zoom 28, and 61 of 64 at the fit zoom. The other 3 points lie 3.2 to 3.86 picture units from a line, under 1 px at scale 0.29, at the edge of the 3.2 halo reach.

The grid found a real fault: a hidden shape with its own `pointer-events` took the pointer, so lines did not light. The CSS now turns the pointer off for every shape of a painted surface.

Stage life: `attachSurface` ran again on one element, which disposed the stage and left a new stage with nothing held while `data-painter` still hid the ink. The stage now lives as long as the surface in a layout effect, and `dispose` removes the attribute.

Phase 1 gate passed: `bun run check` exited 0 with 21 of 21 tasks and 49 of 49 browser owners on the commit after the About helper fix. Before that fix, the browser lane failed in about one run of three. The failures were intermittent, each in one owner. Logged runs caught `canonical-model-references`: a followed reference lands after the test sees the old reading's About, and the test then waited on a page that was gone. After the fix, four lane runs in a row and the full check passed. One failure stays unexplained: `canonical-model-attention` failed once with no lit line under the pointer, passed 8 of 8 alone and 5 of 5 on three cores, and did not come back in 11 later lane runs. One failure of `canonical-model-surface` at its 15 s limit came while an orphan Chrome used 90% of a core, and it did not come back.

Phase 2, hill climb. Method: TASK-405. Real Chrome 155 over CDP with real input, rAF recorder, long tasks, medians of 3. Largest board, 120 Hz, RTX 4090. Slow means over 25 ms. Both pages ran on one copy of the vault with a load under 5.

Mean gap / longest / slow, old page then painter:
wheel 8.54/66.7/1, 8.37/16.8/0. pinch 8.65/58.3/2, 8.33/9.5/0. keys 8.47/16.7/0, 8.33/8.5/0. drag 9.63/66.7/2, 8.33/9.7/0. idle 8.57/16.8/0, 8.37/16.7/0. open 9.70/141.6/7, 8.45/33.3/1. toggle 31.63/750/68, 9.13/150/10. dive 14.42/350/58, 8.92/100/11.
Long tasks: toggle 4431 ms to 514 ms, dive 2563 ms to 304 ms.

Rounds kept: SVG thinned on a painted surface. A flight's clock starts at its first drawn frame. GPU canvas keeps still items and word runs. Camera glides reach the stage. Flights know definitions inside a scene body. Dashed paths are straightened before kurbo dashes them. A first picture's ink waits up to 400 ms for its painter. A frame never takes a time older than the last change. CPU traffic rests as long as its last frame took. A leaving picture keeps its last look, and an entering one stands in its light at once. Traffic on an unlit line recedes twice.

Faults found by looking at frames: glides cut in one frame on the painter, pills and arrowheads popped at landing, a stale stamp made the board jump for one frame, a first load had no entrance. In the second to last pass a walkthrough step lifted its veil and ring for 200 ms, and pulses showed on veiled lines. All are fixed.

Last pass, on the final build, painter above old page: toggle on a middle board and on the largest board, dive, back, open a leaf, first load, breadcrumb, opening a sequence, pointer rest with light, recede and tip, fit key, zoom through the far view, walkthrough step. Nothing left to improve at the level of the painter. The pass before covered a flowchart entrance, traffic motion and a far rest. They match. Reduced motion: two screenshots 700 ms apart are identical, no ink wait, a toggle gives 4 frames. Not judged: sweep width in the far view at close range. The walkthrough step ran on the example model's tour, because a vault copy outside Git has no retained walkthrough.

Stays by choice: a 100 to 150 ms pause before a toggle on the largest board, about a third of it hidden SVG layout (TASK-561). A pill grows as a large box into a container, as on the old page. A first load starts about 150 ms later than on the old page, and has its entrance. A receded line keeps its arrowhead.

Full parity after the climb: 528 readings, 2112 comparisons. GPU near mean 0.23% worst 0.65%, far mean 0.41% worst 1.34%. CPU near mean 0.22% worst 0.62%, far mean 0.42% worst 1.30%. Ten comparisons reached 1%, all far and light. None reached 2%. Traffic on the largest board after the last fixes: 0.09% to 0.26%.

CPU painter, largest board: idle 11.2 ms, wheel 21.5 ms, toggle 23.4 ms, dive 12.4 ms. On a small board it takes 21% of the main thread, against 8% on the old page. Ideas not done: vello_common Recording, two kept layers around traffic.

Environment: PR 19 merged during this work. The chosen checkout of github.com/miklschmidt/archboard moved to the main checkout at 09:58:59 local, which holds a legacy vault at 38a8da877, so that address shows migration required on this machine. No command of this task's transcript moved it. Measurements after that ran on an untracked copy of the vault named copy.

Review fixes preserve the painter and stage ownership described by proposal JTZvj2vi. They repair its existing failure, timing, and drawing contracts. No new architecture proposal or adoption is needed.

Review against 11b0f32db fixed retained part collisions, GPU cache accounting, GPU device cleanup, delayed reduced-motion lighting, stale frame clocks, interrupted entrance ghosts, and the default stroke hit area. Signed Rust commits: 7265addbe and 40110bb1f. Browser fixes restore SVG glyphs and definitions after failure, release failed painters, handle replacement and resize errors, preserve startup traffic holds, cancel obsolete entrances, and hide stale canvas ink. React owns a stable host while the stage owns replaceable canvases. One startup path serves initial and replacement painters. Rust tests: 96 passed, 0 failed. Core lint and build passed. The full repository gate remains for the owner.

Final review validation passed: frontend TypeScript exited 0 with no diagnostics. Full lint exited 0 with 8/8 successful and no lint warnings or errors. The web UI suite passed 592 tests across 101 files. The focused stage owner covers 14 startup, failure, cleanup, and recovery cases. The only shell warning names the expected dirty Git tree before the commits. No full gate or new browser GPU measurements ran during this review.

Phase 3 and 4. The delegated review on gpt-6.1-sol at xhigh found 14 faults, and three commits fixed them. After the rebase onto origin/main, bun run check exited 0 with 21 of 21 tasks and 49 of 49 browser owners. The last frame run on the rebased build: toggle mean gap 9.15 ms, longest 150.1 ms, 11 slow, long tasks 559 ms. Dive mean gap 8.75 ms, longest 83.4 ms, 9 slow, long tasks 195 ms. Wheel, pinch, keys and drag have no slow frames. Full parity on the rebased build: 528 readings, 2112 comparisons. GPU near mean 0.23% worst 0.65%, far mean 0.41% worst 1.14%. CPU near 0.22% and 0.62%, far 0.41% and 1.16%. Eight comparisons reached 1%, all far and light, and none reached 2%. Traffic on the largest board differed by 0.09% to 0.27%. A first parity run stalled after 1102 comparisons when another Chrome window opened, so a second run covered the remaining readings on the same build. A recording page finds its vault by model id, so a registered copy of a vault outside Git refused narration with ARCHIVE_NOT_INITIALIZED, and the chosen checkout held no canonical model. A temporary clone with its own identity made the video.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Vello now paints the board canvas by default, on WebGPU or on the CPU, and all picture motion lives in Rust in archboard-paint. The SVG stays in the page as the hidden semantic layer, and it stays the product of an export. On the largest board at 120 Hz, the mean frame gap of a toggle fell from 31.63 ms to 9.15 ms, and its slow frames from 68 to 11. Full parity on the final build reached a worst 1.16% of ink. Safari, Windows and macOS were not measured. ADR 0071 and docs/design/vello-painter.md hold the decision and the numbers.
<!-- SECTION:FINAL_SUMMARY:END -->
