---
id: TASK-573
title: A marketing site on GitHub Pages explains Archboard to architects
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-04T15:39:00Z'
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
