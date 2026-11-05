---
id: TASK-573
title: A marketing site on GitHub Pages explains Archboard to architects
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-04T15:39:00Z'
updated_date: '2026-11-05T10:57:00Z'
labels: []
dependencies: []
ordinal: 1019000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard has only its README to explain itself. The owner asked on 2026-11-04 for a dark marketing site, built with Astro and published to GitHub Pages by a workflow whenever the site changes. It must make the same case as the README, keep the diagram look and fonts of Archboard, set its own type for a marketing page, explain features with mocked interface pieces, and show expressive diagram demonstrations with effects and shaders. Linear's site sets the bar for craft. The owner wants to look at the site before a pull request is opened.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An Astro project in site/ builds a static site with its own lockfile, outside the product workspaces, and bun run check still passes
- [x] #2 The site covers the README's selling points: understanding a system, design smells, code evidence, module interfaces, Git history, proposals, history, narrated walkthroughs, sequence diagrams, drill-down, agents in plain sight, pictures for docs, the comparison with other tools, and the quick start
- [x] #3 Every diagram on the site is real Archboard renderer output, and a script in site/ makes the renders that the site keeps
- [x] #4 The site is dark only, uses the Archboard display, body and mono faces from the renderer package, and works from 390px to wide desktop
- [x] #5 Shader and motion effects honor prefers-reduced-motion and stop when off screen
- [ ] #6 A GitHub workflow builds the site on pull requests that touch it and deploys it to GitHub Pages from main when the site or its inputs change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build site/ as a standalone Astro project with its own lockfile, outside the root workspaces. It imports the renderer fonts, the README drawings and the social card from the repository.
2. Draw the extra example-shop readings with site/scripts/render-diagrams.sh, through a private server, and commit the SVGs.
3. Lay out one dark page that makes the README's case: the hero window that builds a real drawing while the agent's commands type, the pipeline, Measures and the tabbed code checks, proposals and history, the walkthrough player, grammars, drill-down, claims, pictures for docs, Archboard's own drawing, the comparison and the quick start.
4. Add two WebGL fields and a voice orb on one shader host. Every loop pauses off screen and in a hidden tab and stops under reduced motion.
5. Add .github/workflows/site.yml: build on pull requests that touch the site or its inputs, deploy to GitHub Pages from main.
6. Run the Impeccable finish review and record site/DESIGN.md. Run the delegated code reviews by scope and boundary, then the complete gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- site/ is a standalone Astro 7.4.5 project with its own package.json and bun.lock, outside the root workspaces. Root lint (packages, apps, scripts, tools) and the CSS boundary lint do not read it. The root format check does, and its cache now fingerprints site/** (8212b2655).
- The site imports the renderer fonts, the README SVGs and the social card through Vite ?raw and ?url imports. The workflow path filters list those folders.
- Six drawings the README does not keep live in site/src/diagrams, drawn by site/scripts/render-diagrams.sh from examples/web-shop through a private server. They are committed, like docs/readme, because rendering needs the full Archboard build. The reviewer regenerated all six byte for byte.
- The workflow builds on pull requests and deploys from main with actions/deploy-pages. It does not use configure-pages: astro.config.mjs sets the base path /archboard, and SITE_ORIGIN and SITE_BASE override it.
- Astro compressHTML is off, because it dropped the space between a line of text and an element on the next line.
- The branch was rebased onto origin/main after PR #37 was squash-merged. The tree of the old branch tip matched the squash commit.

Design review:
- The Impeccable finish reviewer first asked for a recapture: reveal transitions left blank bands in chunked captures. After a slow reveal pass it returned "fix" with eight material fixes, all applied in 4a6026a51. The detector reports zero findings. site/DESIGN.md and site/design.json record the shipped system (55e3a2e72, 13ce13ca8). The documenter's drift notes were fixed in f421b1fcf.

Code review (gpt-6.1-sol at xhigh through T3 Code, three scopes and two boundaries):
- Build, deploy and docs: render-script shutdown, README and config comments, lockfile pin (7e770b0ca, f59fb4e03, aef9b6bd6). It found the stale format cache, fixed in 8212b2655.
- Components and styles: keyboard focus, hidden views, keyboard-reachable panels and code blocks, readable text variants, the language belt without motion, example captions, reduced-motion transition delays, the footprint example's --state (da59d9454 to 67064b41e).
- Scripts and lib: shader context loss and leaks, serialized hero playback that pauses when hidden, tab arrow keys, Measures data read at 2f4314f89 (renderer 564 commits, 2320 in total; the six coupled pairs are unchanged) (1f44d6267 to 1858b0ea9). dfe6a9d30 reads the motion preference at each autoplay turn and aligns the commit total.
- Scripts and components boundary: SVG traffic clocks pause with page motion, carets pause, the phone dock keeps playing, narration settles when reduced motion turns on (e1022e186 to 03f6ad165). Its evidence note is bbbc54b11.
- Site inputs and deploy boundary: pass, no findings.

Evidence (2026-11-04, final branch at bbbc54b11 on origin/main 15ffafb4a):
- bun run check inside nix develop: 21/21 tasks successful, exit 0, no failing test.
- cd site && bun run build: astro check 0 errors, 0 warnings, 0 hints; build complete.
- No element overflows the viewport at 390, 768, 1024, 1440, 1920 and 2560 wide (measured before the review fixes; the reviewers rechecked 390 to 2560).
- Motion over 2 s at 1440x900: the hero field draws and the hero SVG clock advances 1.97 s at the top; mid page, no shader draws and the clock is frozen; at the bottom only the closing field draws. With prefers-reduced-motion: no draws, the clock is frozen, 8/8 hero cards show, no reveal below full opacity, no pending dock line, and the language list is wrapped. CSS loops in [data-loop] report paused off screen and running on screen.
- actionlint reports nothing for .github/workflows/site.yml.
- AC6 is open: the workflow exists and passes actionlint, but its first pull request run and the first deploy from main are still to come, and GitHub Pages must first be set to Source: GitHub Actions.

Owner review: the Flowchart tab of the grammar demo ran 348px past its frame, over its command and the next feature. Fixed in the commit after 56dcedba7: the frame's grid now has explicit tracks. A browser sweep of every interactive state at 1440, 1024 and 390 wide finds no drawing past its frame, and it reports the overflow when the fix is undone.

Owner review, second round (2026-11-04):
- Hero and nav share one left edge, and the hero window straightens as it scrolls fully into view (cc3223b23). The quick start names the Node.js versions the build tools need (aa7626f94).
- The walkthrough's voice orb is the product's own runner, dynamics and painter, fed by the subtitle words (f71d8456a).
- Copy pass from the market research: the headline is 'Understand the code your agents write', the sections follow the reader's next question, the comparison is job by job, and the platform, local scope and license come before the install (04066cf65).
- Planning first and bold claims, at the owner's request: the hero lead and the comparison lead with planning, the plan section shows model footprint holding a branch to its proposal, and tracked embeds never go stale (ad287bfab).
- Reveals rise visibly from transparent and 32px low once a part's top clears the bottom 15% of the view. The FAQ items reveal through a wrapper because their own transition replaced the reveal's (d6015f969).
- The grid's lamp casts the pointer's ray onto the table, so its light sits under the cursor in the hero and the closing (e8a5cfe06, 8cdc94f3b).
- The Grammars demo draws Place an order with its stock and payment decisions and its receipt loop. render-diagrams.sh rewrites the flow on its disposable copy after the other drawings (cf3d167c6).
- Still open: the slow Archboard draws itself demo waits on the WebGL fallback research for the painter.

Hero table and live model (2026-11-04, owner direction: merge the renderer into the hero, no grid, raised cards):
- The hero's drafting table carries the whole of .archboard/vault, painted live by the product's painter (startPainter from packages/renderer). site/scripts/paint.ts paints it at build time into the ignored site/src/paintings/, because a painting belongs to the painter of the same core build. Three painters draw it: the whole picture, and two finer bands that follow the table nearest the eye, so near cards stay sharp (owner saw pixelation with one texture). The shader marches each card as a rounded tile with a lit bevel, a body in the card's tone and a cast shadow, and lifts the card the pointer rests on while the painter lights its lines. The hero drops the static grid and keeps the travelling light; the closing keeps its grid (6c7adef2d).
- The core takes relief: "flat" (9e561cc37, cherry-picked from an implementer worktree), so the hero's painting has no front edge or drop shadow under the 3D tiles. The default drawing is unchanged (7d744fa60).
- Archboard draws itself now paints the same vault live in a native scroll viewport instead of the README's animated SVG as an image, which re-rasterised every frame (2a8617055). The README SVG stands in when no painter starts.
- The site workflow installs the repository, builds the core and paints the hero inside nix develop, with path filters for the core, the model and the vault; actionlint passes. DESIGN.md records the table (eb32a39c2).
Evidence: bun run check inside nix develop, 21/21 successful, exit 0, on 7d744fa60. GPU (RTX 4090, Chrome WebGPU, headed): hero at 120 fps with three painters; CPU painter headless: one still level, raised tiles, no traffic; the model viewport redraws a scroll step in about 32 ms on the CPU painter.
Open: TASK-576 (NaN in most flowchart start markers) also breaks site/src/diagrams/place-order-flowchart.svg (24 NaN paths); owner to decide whether it belongs on this branch.

Hero rework (2026-11-04, owner direction: a jaw-dropping, smooth entry, less yellow, a different scope, a model made for the site):
- site/model is a small canonical model made for the hero, "How Archboard works": Claude Code and Codex state meaning through the archboard CLI; Your repository holds Source code, Canonical model, Proposals and History; the Archboard server holds Server, Code check and Renderer core; the Browser holds Panes and Painter. It was authored through the CLI on a private server and passes archboard check. The format check ignores site/model, like .archboard/vault (b55f36e39). Its policy is block YAML (97289715b).
- The hero paints the picture once with the product's painter on the CPU (startCpuPainter, 11bcf84ca) into still images. Starting WebGPU for the hero held the page on a cold profile; the CPU paint takes about 70 ms and now yields to the page between its steps.
- One WebGL shader does everything that moves (site/src/scripts/hero/): a camera that settles on a critically damped spring onto a diagonal, light that runs from the agents along the real routes and draws each line, cards that rise as tiles when the light reaches them, trays that sink as it enters them, traffic with a steady glow on every traffic line, and the card under the pointer lifting and lighting its lines. Line light is neutral or the line's own colour; no yellow lamp.
- The camera fits the cards and trays to the room below the words and to the canvas width. A stage holds the words and a room of at least 280 to 400 px, so short laptop screens keep the table below the words and run it on below the fold; portrait screens show a close part of the system.
- The shader host compiles with KHR_parallel_shader_compile where offered (bd79e3823). The closing field lost its unused drawing path and table-drawing.ts (ea91d0cb0).
Evidence:
- Production build, headed Chrome on the RTX 4090, fresh profile, NVIDIA shader cache off: 120 fps from 1.15 s after load to the end of the entry, p99 8.5 ms, no slow frame after load. In the first second, frames up to 366 ms come from the page's first style and layout pass (about 90 ms) and script start; the table is still empty then.
- Headless and headed cold compile of the hero shader: about 135 ms at its first draw, during load.
- astro check: 0 errors, 0 warnings, 0 hints. Policy lint on painter.ts and vite.config.ts: exit 0. Format check on the changed files: clean. paint.ts output is byte for byte the same after the policy rewrite.
- Reviewed still frames at 1920x1080, 1536x864, 1440x900, 1366x768, 1280x720, 1280x650, 2560x1080, 2560x1440 and 390x844, with and without reduced motion, and the pointer lift on the real GPU.
Open:
- On a cold GPU cache, scrolling into Archboard draws itself starts the WebGPU painter and stalls frames for about 1.6 s, with gaps up to 408 ms. It is outside the hero. Starting that painter on the CPU, or before the reader nears it, would remove it.
- One headed recording showed no WebGL at all and a 3 s gap in another run; neither repeated in seven later runs.
- The delegated code review and the full gate for this round are still to run before a pull request.

Hero lasers and 4K (2026-11-05, owner direction: pristine at 4K, then lines as floating beams, then light-blue lasers like the canvasui Laser):
- 6d6156504: each line is a light-blue laser above its route, with its label on a floating plate. The painting keeps no lines. The route grid lists every run within reach of a cell, and each ray walks the cells it crosses, so no glow stops at a cell edge. The black notches the owner saw came from the old cap of 4 runs of one line in a cell. The light shed on the table is weaker, so trays show no band. The table draws at up to 2 device px per CSS px, pixels near an outline take 5 rays, each image is as fine as the screen needs, and a resize that needs more paints again. The shader host draws fewer pixels while a quarter of the frames take over 20 ms, and stops after two failed trials in a row.
- The canvasui Laser is MIT plus Commons Clause, which forbids redistributing a ported version, so the shader takes its look and none of its code.
Evidence:
- GPU time at 4K on the RTX 4090, timer queries under a 4x load that holds the clocks: the scene without beams costs 1.6 ms a ray and the beams 0.5 ms. At light load a frame reads about 3.7 ms, because the GPU clocks down.
- Pacing at 4K with a 16x load: 3 of 4 runs settle at 2038 to 2093 px wide with no missed frames. One fails a trial during the entry, recovers, and settles at 2346 px wide with about one frame in ten missed. With an 8x load: one step to 3047 px, no missed frames. With no load: 3840x2160 throughout.
- Cold compile about 165 ms. astro check: 0 errors, 0 warnings, 0 hints. Format check on the changed files: clean.
Open: the delegated code review and the full gate still run before a pull request.

Hero smoke and tiles (2026-11-05, owner direction: smoke that varies along straight lines and is strongest in the middle, weaker and softer; cards that start lower; no glow through cards; no gray splotches; brighter wells):
- 4d9788e6f: the smoke gathers at the middle of each straight stretch of a line and is gone at its bends and ends. Each run carries the extent of its stretch in a third texel. The smoke thins softly from the axis and ends in ragged wisps. A packet's head is sharp in the core and swells into the smoke ahead of it, where it used to cut across it. A tile waits below its floor and rises through it. The floor drops the print of a card or a tray out to the blur of its edge, so no outline shows before it appears; that outline was what showed through the ground. The top of a tile hides a beam that runs below it. The hero's painting keeps no shadows, tray walls take the tone of their floor, and the wells are brighter. The grid walk starts half a reach below the beams.
Evidence:
- 4K stills with and without the shorter walk are identical pixel for pixel.
- GPU time under a 3x load at 2880x1620 on the RTX 4090: 7.3 ms a frame, 4.6 ms without beams. The smoke costs about 0.1 ms of it.
- Frames of the entry on a clock slowed ten times show no outline of a card or a tray before it appears.
- astro check: 0 errors, 0 warnings, 0 hints. Format check on the changed files: clean.
Open: the own-model section, then the delegated code review and the full gate before a pull request.

Own model and the WebGL2 painter (2026-11-05, owner direction: hide the dependency lines of Archboard's own drawing, show all of it without a scroll box, and bring it in with the painter's entrance once it is in view. Then use the WebGPU and WebGL2 support that landed on main):
- The branch is rebased onto origin/main e61f8cfcb, which brings the WebGL2 painter of ADR 0074 and the flowchart fix of TASK-576. These notes now name each commit by its rebased hash. Evidence and Measures data recorded before 2026-11-05 came from the same changes on the older base, origin/main 15ffafb4a.
- 95f1b8174: Archboard draws itself paints this repository's vault with a filter that hides its dependency relationships, as a reading can in the app. site/scripts/paint.ts passes the hidden kinds to projectModel. The figure fits the whole picture to the page's width and to the screen's height, so nothing scrolls inside it. Once the figure's foot is in view, the painter brings the picture in with the app's entrance. Without script, and wherever no painter draws, the renderer's SVG of the same reading (own.svg) stands.
- be478de18: the figure starts its painter in the order of ADR 0074: WebGPU, then WebGL2, then the CPU. The picture enters on WebGPU and on WebGL2. On the CPU, a frame of the entrance takes 21 to 31 ms, so the picture stands whole at once. Traffic runs only on WebGPU, because traffic keeps a frame running while the figure is in view. When a GPU stops at work, the figure shows the SVG again.
- 53d321824: the Place an order flowchart, drawn again with the fix from main, holds no NaN values. The committed drawing held 960.
- Decision: the hero window keeps the CPU painter, which costs 5 to 6 ms a frame for the shop at DPR 2. A GPU painter would start during the hero's entry, where a first visit pays the driver's shader compile (see Evidence). ADR 0074 gives every page that paints the same order, so this is a departure that the owner can reverse.
Evidence:
- Headed Chrome on the RTX 4090, production build, fresh profile, scrolling from three screens above the figure at 40 px a frame. The painter takes a WebGPU context on a real NVIDIA adapter, and the entrance runs at 120 fps (p95 8.4 ms).
- With the driver shader cache off, two runs freeze the page for 308 and 401 ms, and for 317 and 392 ms, as the painter starts. A second visit with the same profile repeats the freezes (325 and 400 ms), so Chrome's own cache does not remove them.
- With the driver shader cache on, two fresh profiles show no freeze: the painter's start costs gaps of 25 to 58 ms. So the freezes come from the driver compiling the painter's shaders, and the driver's cache keeps them for later visits.
- With WebGPU hidden from the page, the painter takes WebGL2. Its start costs no gap over 100 ms, and the entrance runs at 60 fps on the 120 Hz screen. Every run also shows a gap of about 92 ms at the first jump of the scroll, before the painter starts.
- Headless Chrome with ANGLE on Vulkan (WebGL2): the entrance takes p50 15.8 ms a frame at 1436x922 and 19.3 ms at 2872x1844. The CPU painter takes 21.2 and 30.6 ms. The CPU path ran once through a temporary forced edit, since reverted.
- astro check and the production build: 0 errors, 0 warnings, 0 hints. Format check on the changed files: clean.
Open:
- The painter's carry dims three cards of the shop (Storefront, Checkout API and Inventory service) from luminance 48 to 25 at about 96 to 192 ms. They recover by 384 ms. It happens even when the painter carries into an identical picture. Measured on the CPU painter in the hero window, which now uses one enter instead. Not filed yet.
- The delegated code review and the full gate still run before a pull request.

Smoke falloff (2026-11-05, owner direction: tune the smoke down a bit, because its falloff is still harsh):
- 3f2b7fa77: the smoke's cross-section is a bell, exp(-4x^2)(1-x^2)^2, in place of exp(-1.2x)(1-x^2)^2. A screen shows faint light brighter than its share, so the old profile looked almost whole out to the beam's reach and then ended at a contour. The wisp threshold is wider, the smoke gathers more slowly from a bend (power 1.8 for 1.2), and the veil is 0.5 for 0.6.
Evidence: reduced-motion 4K stills of the same frame before and after. The outer wisps above the long Panes to paintings beam fade into the table with no contour, and the smoke is lighter. Format check on the changed files: clean.

Code review before the pull request (2026-11-05, owner direction: full send):
- sol-loop on gpt-6.1-sol at xhigh through T3 Code, on the changes since the last review (56dcedba7). Round 1 ran one reviewer for each scope and boundary: the hero table, the painting pipeline and renderer, the page and live figures, and the boundaries between them. Round 2 checked the fixes and approved them with no new findings.
- Taken: B1 (104dfe5c9) site/README.md no longer asks for model archive-init in a Git holder, which refuses it. C1 (49c07b428) a painter frame error hands the own figure back to its SVG. C2 (6db1639bd) a painting that does not load (an HTTP error, as after a redeploy) keeps the SVG of the own figure and of the hero window. A1 (fb1d23b89) the hero's edge fades use defined smoothstep ranges. A2 (0b003dd6d) the table's entrance runs on visible time, and reduced motion settles it for good. A3 (33867cc3f) the closing field's lamp stays on the canvas when motion returns. A4 (c36f5dbb7) a resize that keeps the aspect, as a change of pixel ratio, refits the camera and paints finer. A5 (85ff9dcf6) a restored WebGL context enables parallel shader compile again. A6 (f521ad09e) the pointer leaving clears a still table's highlight. AC2 (b495b3779, rewritten) words that reflow refit the table. AC4 (2e0912f7c) a stage resize can start the hero window.
- Discarded as duplicates: BC1 (of C1), AB1 and AC1 (of A2), AC3 (covered by A2 and A3).
Evidence (production build of 2e0912f7c, headless Chrome with ANGLE on Vulkan):
- With the painting files answering 404, the own figure and the hero window end on their SVGs, shown and loaded, with no page error. With the painting files, both paint, and the hero window plays all its lines and paints the shop.
- A forced draw failure on the own figure's canvas after its painter started returns the figure to its SVG, with no page error.
- The hero hidden for 5 s during its entrance comes back mid-entrance and completes after. Reduced motion turned on and off keeps the table complete and the closing field's lamp in place.
- A lost and restored WebGL context draws the table again. No browser on this machine offers KHR_parallel_shader_compile, so the A5 line itself rests on the WebGL specification.
- At 390x844 the table, the hero window and the own figure work, with no horizontal overflow.
- astro check: 0 errors, 0 warnings, 0 hints. Format check on the changed files: clean.

Live site, beams, Go and the voice (2026-11-05). Owner direction: find why the live beams are white, and add Go to the languages. Show that the Codex voice is realtime and a full agent:
- Deploy: PR #43 merged as 454088b41. The Site run on main built the site and deployed it to GitHub Pages. The live page and every asset that it names answer 200 at https://miklschmidt.github.io/archboard/.
- 320803564: the beams burned white on the live site. The production minifier writes --sky as oklch(75.35% .139 232.66), and the table's parser read only plain numbers, so it fell back to a grey. The table now reads the token's computed colour, which the browser writes as oklch(0.7535 0.139 232.66).
- 8c9e29ba6: the language belt lists Go after Rust, as the README does.
- bdceb58ee: a section, Talk to your architecture, sits between Understand and Plan, and the nav links to it. Its relay plays a conversation about the example shop. The voice hands the question to the coordinator, and the coordinator reads the architecture and hands the work to the workhorse. The workhorse reads the code, drafts Queued fulfilment and compares it. The relay runs on visible time, pauses and resumes with Talk, and stands whole with reduced motion.
- a963d7a4f: DESIGN.md records the relay, and its sentences over 25 words are split.
Evidence (production build, headless Chrome with ANGLE on Vulkan):
- Before: the live hero draws every beam white. After: the hero of the same build draws the beams sky blue. The page reads the computed token oklch(0.7535 0.139 232.66) beside the minified oklch(75.35% .139 232.66).
- The relay waits hidden until it is on screen and shows all 20 lines by 38 s. No thread panel stays raised while the voice speaks. With reduced motion, all 20 lines stand at once and the button is hidden. On an iPhone 14 viewport, it plays to the end with no horizontal overflow. No page errors or warnings.
- astro check: 0 errors, 0 warnings, 0 hints. bun run fmt changed nothing outside these files.
- bun run check inside nix develop: 21 of 21 tasks, exit 0, on a963d7a4f.
<!-- SECTION:NOTES:END -->
