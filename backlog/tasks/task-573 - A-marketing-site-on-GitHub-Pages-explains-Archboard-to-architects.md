---
id: TASK-573
title: A marketing site on GitHub Pages explains Archboard to architects
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-04T15:39:00Z'
updated_date: '2026-11-05T02:11:00Z'
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
- site/ is a standalone Astro 7.4.5 project with its own package.json and bun.lock, outside the root workspaces. Root lint (packages, apps, scripts, tools) and the CSS boundary lint do not read it. The root format check does, and its cache now fingerprints site/** (c936a2d4e).
- The site imports the renderer fonts, the README SVGs and the social card through Vite ?raw and ?url imports. The workflow path filters list those folders.
- Six drawings the README does not keep live in site/src/diagrams, drawn by site/scripts/render-diagrams.sh from examples/web-shop through a private server. They are committed, like docs/readme, because rendering needs the full Archboard build. The reviewer regenerated all six byte for byte.
- The workflow builds on pull requests and deploys from main with actions/deploy-pages. It does not use configure-pages: astro.config.mjs sets the base path /archboard, and SITE_ORIGIN and SITE_BASE override it.
- Astro compressHTML is off, because it dropped the space between a line of text and an element on the next line.
- The branch was rebased onto origin/main after PR #37 was squash-merged. The tree of the old branch tip matched the squash commit.

Design review:
- The Impeccable finish reviewer first asked for a recapture: reveal transitions left blank bands in chunked captures. After a slow reveal pass it returned "fix" with eight material fixes, all applied in 02f5815b2. The detector reports zero findings. site/DESIGN.md and site/design.json record the shipped system (e138f6f4e, 868d77d1d). The documenter's drift notes were fixed in bf101dae3.

Code review (gpt-6.1-sol at xhigh through T3 Code, three scopes and two boundaries):
- Build, deploy and docs: render-script shutdown, README and config comments, lockfile pin (f50df30a2, f52c3d44d, 10cc0fdd3). It found the stale format cache, fixed in c936a2d4e.
- Components and styles: keyboard focus, hidden views, keyboard-reachable panels and code blocks, readable text variants, the language belt without motion, example captions, reduced-motion transition delays, the footprint example's --state (353528889 to 0426ee112).
- Scripts and lib: shader context loss and leaks, serialized hero playback that pauses when hidden, tab arrow keys, Measures data read at a33217fc4 (renderer 564 commits, 2320 in total; the six coupled pairs are unchanged) (83ef03958 to 699326f77). 19cc8466f reads the motion preference at each autoplay turn and aligns the commit total.
- Scripts and components boundary: SVG traffic clocks pause with page motion, carets pause, the phone dock keeps playing, narration settles when reduced motion turns on (7a7f73cfd to 55e04be7a). Its evidence note is 34435ad2b.
- Site inputs and deploy boundary: pass, no findings.

Evidence (2026-11-04, final branch at 34435ad2b on origin/main 15ffafb4a):
- bun run check inside nix develop: 21/21 tasks successful, exit 0, no failing test.
- cd site && bun run build: astro check 0 errors, 0 warnings, 0 hints; build complete.
- No element overflows the viewport at 390, 768, 1024, 1440, 1920 and 2560 wide (measured before the review fixes; the reviewers rechecked 390 to 2560).
- Motion over 2 s at 1440x900: the hero field draws and the hero SVG clock advances 1.97 s at the top; mid page, no shader draws and the clock is frozen; at the bottom only the closing field draws. With prefers-reduced-motion: no draws, the clock is frozen, 8/8 hero cards show, no reveal below full opacity, no pending dock line, and the language list is wrapped. CSS loops in [data-loop] report paused off screen and running on screen.
- actionlint reports nothing for .github/workflows/site.yml.
- AC6 is open: the workflow exists and passes actionlint, but its first pull request run and the first deploy from main are still to come, and GitHub Pages must first be set to Source: GitHub Actions.

Owner review: the Flowchart tab of the grammar demo ran 348px past its frame, over its command and the next feature. Fixed in the commit after 930cb9fb0: the frame's grid now has explicit tracks. A browser sweep of every interactive state at 1440, 1024 and 390 wide finds no drawing past its frame, and it reports the overflow when the fix is undone.

Owner review, second round (2026-11-04):
- Hero and nav share one left edge, and the hero window straightens as it scrolls fully into view (38d6b1733). The quick start names the Node.js versions the build tools need (ac0d90bfe).
- The walkthrough's voice orb is the product's own runner, dynamics and painter, fed by the subtitle words (e356ba101).
- Copy pass from the market research: the headline is 'Understand the code your agents write', the sections follow the reader's next question, the comparison is job by job, and the platform, local scope and license come before the install (36b036fe0).
- Planning first and bold claims, at the owner's request: the hero lead and the comparison lead with planning, the plan section shows model footprint holding a branch to its proposal, and tracked embeds never go stale (1d0f933c6).
- Reveals rise visibly from transparent and 32px low once a part's top clears the bottom 15% of the view. The FAQ items reveal through a wrapper because their own transition replaced the reveal's (2c86e1c53).
- The grid's lamp casts the pointer's ray onto the table, so its light sits under the cursor in the hero and the closing (722124cc3, 8582dc9b0).
- The Grammars demo draws Place an order with its stock and payment decisions and its receipt loop. render-diagrams.sh rewrites the flow on its disposable copy after the other drawings (e83cbc00a).
- Still open: the slow Archboard draws itself demo waits on the WebGL fallback research for the painter.

Hero table and live model (2026-11-04, owner direction: merge the renderer into the hero, no grid, raised cards):
- The hero's drafting table carries the whole of .archboard/vault, painted live by the product's painter (startPainter from packages/renderer). site/scripts/paint.ts paints it at build time into the ignored site/src/paintings/, because a painting belongs to the painter of the same core build. Three painters draw it: the whole picture, and two finer bands that follow the table nearest the eye, so near cards stay sharp (owner saw pixelation with one texture). The shader marches each card as a rounded tile with a lit bevel, a body in the card's tone and a cast shadow, and lifts the card the pointer rests on while the painter lights its lines. The hero drops the static grid and keeps the travelling light; the closing keeps its grid (6f8a43048).
- The core takes relief: "flat" (2eb0167e9, cherry-picked from an implementer worktree), so the hero's painting has no front edge or drop shadow under the 3D tiles. The default drawing is unchanged (a0bc9d549).
- Archboard draws itself now paints the same vault live in a native scroll viewport instead of the README's animated SVG as an image, which re-rasterised every frame (6f79a2100). The README SVG stands in when no painter starts.
- The site workflow installs the repository, builds the core and paints the hero inside nix develop, with path filters for the core, the model and the vault; actionlint passes. DESIGN.md records the table (e9bf37a0e).
Evidence: bun run check inside nix develop, 21/21 successful, exit 0, on a0bc9d549. GPU (RTX 4090, Chrome WebGPU, headed): hero at 120 fps with three painters; CPU painter headless: one still level, raised tiles, no traffic; the model viewport redraws a scroll step in about 32 ms on the CPU painter.
Open: TASK-576 (NaN in most flowchart start markers) also breaks site/src/diagrams/place-order-flowchart.svg (24 NaN paths); owner to decide whether it belongs on this branch.

Hero rework (2026-11-04, owner direction: a jaw-dropping, smooth entry, less yellow, a different scope, a model made for the site):
- site/model is a small canonical model made for the hero, "How Archboard works": Claude Code and Codex state meaning through the archboard CLI; Your repository holds Source code, Canonical model, Proposals and History; the Archboard server holds Server, Code check and Renderer core; the Browser holds Panes and Painter. It was authored through the CLI on a private server and passes archboard check. The format check ignores site/model, like .archboard/vault (f66c5f8c5). Its policy is block YAML (41477ca8f).
- The hero paints the picture once with the product's painter on the CPU (startCpuPainter, 66ecaae73) into still images. Starting WebGPU for the hero held the page on a cold profile; the CPU paint takes about 70 ms and now yields to the page between its steps.
- One WebGL shader does everything that moves (site/src/scripts/hero/): a camera that settles on a critically damped spring onto a diagonal, light that runs from the agents along the real routes and draws each line, cards that rise as tiles when the light reaches them, trays that sink as it enters them, traffic with a steady glow on every traffic line, and the card under the pointer lifting and lighting its lines. Line light is neutral or the line's own colour; no yellow lamp.
- The camera fits the cards and trays to the room below the words and to the canvas width. A stage holds the words and a room of at least 280 to 400 px, so short laptop screens keep the table below the words and run it on below the fold; portrait screens show a close part of the system.
- The shader host compiles with KHR_parallel_shader_compile where offered (56c4e2c57). The closing field lost its unused drawing path and table-drawing.ts (933ae5aee).
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
- de1bb1893: each line is a light-blue laser above its route, with its label on a floating plate. The painting keeps no lines. The route grid lists every run within reach of a cell, and each ray walks the cells it crosses, so no glow stops at a cell edge. The black notches the owner saw came from the old cap of 4 runs of one line in a cell. The light shed on the table is weaker, so trays show no band. The table draws at up to 2 device px per CSS px, pixels near an outline take 5 rays, each image is as fine as the screen needs, and a resize that needs more paints again. The shader host draws fewer pixels while a quarter of the frames take over 20 ms, and stops after two failed trials in a row.
- The canvasui Laser is MIT plus Commons Clause, which forbids redistributing a ported version, so the shader takes its look and none of its code.
Evidence:
- GPU time at 4K on the RTX 4090, timer queries under a 4x load that holds the clocks: the scene without beams costs 1.6 ms a ray and the beams 0.5 ms. At light load a frame reads about 3.7 ms, because the GPU clocks down.
- Pacing at 4K with a 16x load: 3 of 4 runs settle at 2038 to 2093 px wide with no missed frames. One fails a trial during the entry, recovers, and settles at 2346 px wide with about one frame in ten missed. With an 8x load: one step to 3047 px, no missed frames. With no load: 3840x2160 throughout.
- Cold compile about 165 ms. astro check: 0 errors, 0 warnings, 0 hints. Format check on the changed files: clean.
Open: the delegated code review and the full gate still run before a pull request.

Hero smoke and tiles (2026-11-05, owner direction: smoke that varies along straight lines and is strongest in the middle, weaker and softer; cards that start lower; no glow through cards; no gray splotches; brighter wells):
- 5768fabd3: the smoke gathers at the middle of each straight stretch of a line and is gone at its bends and ends. Each run carries the extent of its stretch in a third texel. The smoke thins softly from the axis and ends in ragged wisps. A packet's head is sharp in the core and swells into the smoke ahead of it, where it used to cut across it. A tile waits below its floor and rises through it. The floor drops the print of a card or a tray out to the blur of its edge, so no outline shows before it appears; that outline was what showed through the ground. The top of a tile hides a beam that runs below it. The hero's painting keeps no shadows, tray walls take the tone of their floor, and the wells are brighter. The grid walk starts half a reach below the beams.
Evidence:
- 4K stills with and without the shorter walk are identical pixel for pixel.
- GPU time under a 3x load at 2880x1620 on the RTX 4090: 7.3 ms a frame, 4.6 ms without beams. The smoke costs about 0.1 ms of it.
- Frames of the entry on a clock slowed ten times show no outline of a card or a tray before it appears.
- astro check: 0 errors, 0 warnings, 0 hints. Format check on the changed files: clean.
Open: the own-model section, then the delegated code review and the full gate before a pull request.
<!-- SECTION:NOTES:END -->
