---
id: TASK-560
title: Vello paints the board canvas, and motion lives in the painter
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-01T03:41:00Z'
updated_date: '2026-11-01T04:02:00Z'
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
- [ ] #1 Vello paints the browser canvas by default and the painter in use can be inspected
- [ ] #2 A person with no WebGPU adapter sees a correct board, chosen by a deterministic rule that a real run measured
- [ ] #3 No SVG DOM motion remains in the browser viewer, and SVG stays for exports, PNGs and README assets
- [ ] #4 Search, copy, screen readers, keyboard and picking keep the behavior that the page has now
- [ ] #5 bun run check passes
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
<!-- SECTION:NOTES:END -->
