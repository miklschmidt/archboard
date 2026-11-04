---
id: TASK-573
title: A marketing site on GitHub Pages explains Archboard to architects
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-04T15:39:00Z'
updated_date: '2026-11-04T17:00:00Z'
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
- [ ] #1 An Astro project in site/ builds a static site with its own lockfile, outside the product workspaces, and bun run check still passes
- [ ] #2 The site covers the README's selling points: understanding a system, design smells, code evidence, module interfaces, Git history, proposals, history, narrated walkthroughs, sequence diagrams, drill-down, agents in plain sight, pictures for docs, the comparison with other tools, and the quick start
- [ ] #3 Every diagram on the site is real Archboard renderer output, and a script in site/ makes the renders that the site keeps
- [ ] #4 The site is dark only, uses the Archboard display, body and mono faces from the renderer package, and works from 390px to wide desktop
- [ ] #5 Shader and motion effects honor prefers-reduced-motion and stop when off screen
- [ ] #6 A GitHub workflow builds the site on pull requests that touch it and deploys it to GitHub Pages from main when the site or its inputs change
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- site/ is a standalone Astro 7.4.5 project with its own package.json and bun.lock, outside the root workspaces. Root lint (packages, apps, scripts, tools) and the CSS boundary lint do not read it. The root format check does, and it passes.
- The site imports the renderer fonts, the README SVGs and the social card from the repository through Vite ?raw and ?url imports. The workflow path filters list those folders.
- Six drawings the README does not keep live in site/src/diagrams, drawn by site/scripts/render-diagrams.sh from examples/web-shop through a private server. They are committed, like docs/readme, because rendering needs the full Archboard build.
- The workflow builds on pull requests and deploys from main with actions/deploy-pages. It does not use configure-pages, because the base path /archboard is set in astro.config.mjs (SITE_ORIGIN and SITE_BASE override it).
- Astro compressHTML is off, because it dropped the space between a line of text and an element on the next line.

Design review:
- The Impeccable finish reviewer first asked for a recapture: reveal transitions left blank bands in chunked captures. After a slow reveal pass it returned "fix" with eight material fixes. All are applied in f2808cda2. The detector reports zero findings.

Evidence (2026-11-04):
- bun run check: 21/21 tasks successful, exit 0 (before the review batch; rerun before handoff).
- cd site && bun run build: astro check 0 errors, 0 warnings, 0 hints; build complete.
- No element overflows the viewport at 390, 768, 1024, 1440, 1920 and 2560 wide.
- WebGL draw counts over 2 s: hero field 44 at the top and 0 mid page; closing field 82 at the bottom. With prefers-reduced-motion: 0 draws at the top and the bottom, 8/8 hero cards shown, 0 reveals below full opacity, 0 pending dock lines.
- actionlint reports nothing for .github/workflows/site.yml.
<!-- SECTION:NOTES:END -->
