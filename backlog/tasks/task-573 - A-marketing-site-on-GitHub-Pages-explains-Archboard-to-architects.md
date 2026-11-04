---
id: TASK-573
title: A marketing site on GitHub Pages explains Archboard to architects
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-04T15:39:00Z'
updated_date: '2026-11-04T17:39:00Z'
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
<!-- SECTION:NOTES:END -->
