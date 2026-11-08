---
id: TASK-610
title: Every scrollbar is slim and quiet in both themes
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T21:24:00Z'
updated_date: '2026-11-08T21:44:00Z'
labels:
  - frontend
  - design
dependencies: []
ordinal: 1064000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner said: "We need to make all scrollbars slim as well. They stand out too much." Only the left column, the right panel and the floating sidebar had a thin bar in the theme's tone. About, the dialogs, the popovers, the conversation and code excerpts kept the system's wide bar with its grey track, and the Find list hid its bar. The marketing site in site/ drew its own bar on a track of the page's ground. Follows TASK-604 (PR #74).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every scroll container of the web app shows a thin scrollbar whose track lets the surface show through, in the light and the dark theme
- [x] #2 The thumb keeps at least 3:1 contrast against each surface it lies on, in both themes
- [x] #3 No component hides its scrollbar or sets a scrollbar style of its own that fights the rule, and nothing changes what scrolls
- [x] #4 The marketing site's scroll areas follow the same rule, and the site audit finds nothing broken
- [x] #5 DESIGN.md records the rule, and docs/agents/frontend.md tells authors not to style a scrollbar locally
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the partial thin-scrollbar rule in app.css (sidebar, left column, right panel only) with one rule in the base layer: scrollbar-width thin on every element, and scrollbar-color on the root per theme, a transparent track and a thumb of muted ink.
2. Choose the thumb mix from measured contrast: 70% on chalk and 50% on graphite keep 3:1 or more on every surface.
3. Remove local styles that duplicate or fight the rule: [scrollbar-width:thin] on the About outline and no-scrollbar on the command list of Find.
4. Apply the same rule to site/src/styles/global.css and drop its ::-webkit-scrollbar rules, which current Chrome, Firefox and Safari 26.2 ignore once the standard properties are set.
5. Record the Quiet Scrollbar Rule in DESIGN.md and .impeccable/design.json, and tell authors in docs/agents/frontend.md.
6. Compare classic-scrollbar screenshots before and after in both themes, audit the site, and run lint:all, type-check and the focused browser owners.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified on a private server (port 3471) with this repository's model and examples/web-shop, in headless Chrome 150 launched without --hide-scrollbars and with overlay scrollbars off, so the screenshots show classic bars. Before: About, Settings, History, Measures and the code evidence drew the system bar (15px, arrow buttons, grey track), the Find list hid its bar, and the side columns' thin thumb measured 2.0:1 on chalk. After: every scroll container computes scrollbar-width thin and the theme's thumb, including the conversation viewport and the composer. Thumb contrast measured from screenshot pixels: light 3.05 to 3.31, dark 3.13 to 3.21, site 3.18 and 3.20. Chrome keeps the thumb's color under the pointer and darkens it a little while dragged, so the rule has no hover state. Site audit on port 4392: walked every section at 1440px and the sideways code blocks at 760px; the window mock matches the web-shop shell, whose short lists show no bar in either. The hero, table, orb and field canvases need WebGL, which this headless Chrome lacks with or without the change. bun run render changed only allocated sample identities in two diagrams, so they were restored. Gates: vp fmt on the touched files, vp run lint:all (8/8), bun run type-check (both projects), and the browser owners shell-layout, reader-column and canonical-model-legend (3 of 3 pass).

The change is presentation only. It moves no module, interface or relationship, so the architecture model needs no proposal.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every scrollbar of the app and the site is now thin, with a transparent track and a thumb of muted ink that keeps 3:1 on every surface: 70% on chalk, 50% on graphite. One rule in the base layer of app.css replaces the old rule that covered only the side columns. The About outline lost its own thin-scrollbar utility, and the Find list no longer hides its bar. The site takes the same rule and drops its ::-webkit-scrollbar rules, which current browsers ignore once the standard properties are set. DESIGN.md and the Impeccable sidecar record the Quiet Scrollbar Rule, and the frontend guide tells authors not to style or hide a scrollbar. Risk: Safari before 26.2 does not read scrollbar-color, so it draws its own thumb.
<!-- SECTION:FINAL_SUMMARY:END -->
