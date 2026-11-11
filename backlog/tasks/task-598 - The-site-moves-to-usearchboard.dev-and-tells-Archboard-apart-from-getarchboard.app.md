---
id: TASK-598
title: >-
  The site moves to usearchboard.dev and tells Archboard apart from
  getarchboard.app
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T12:43:00Z'
updated_date: '2026-11-11 01:01'
labels: []
dependencies: []
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: low
type: task
ordinal: 1043000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner chose usearchboard.dev as the canonical domain of the site and kept the name Archboard. getarchboard.app is an unrelated hosted diagram canvas, so copy must say that Archboard is a local vault with a deterministic check, not a hosted whiteboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 README, the site and the package metadata link to usearchboard.dev
- [ ] #2 The site copy names the local vault and the deterministic check where it compares Archboard with other tools
- [ ] #3 The site and every version of the docs are served at https://usearchboard.dev from a Cloudflare Worker that the Site workflow deploys from main, and GitHub Pages is turned off
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build the site and the docs for the root of https://usearchboard.dev: SITE_ORIGIN and SITE_BASE default to it, and the Site workflow names it for a release tag built before the move.
2. Replace the GitHub Pages deploy with wrangler deploy of site/wrangler.jsonc, an assets-only Worker named archboard-site. The deploy job runs in the site environment, which holds a token scoped to that one Worker.
3. Let the workflow be started by hand with a release tag, so that v0.3.0's docs are built again for the new root.
4. Point README, INSTALL.md, the Actions README, the check Action's findings link and the package homepage at usearchboard.dev.
5. The owner creates the Worker, its custom domain, the token and the site environment, then turns off GitHub Pages.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The owner chose on 2026-11-11 to turn GitHub Pages off rather than redirect from it, so the old AC #1 (the GitHub Pages address leads there) is replaced. AC #3 (copy that tells Archboard apart from getarchboard.app) is not part of this change.
<!-- SECTION:NOTES:END -->
