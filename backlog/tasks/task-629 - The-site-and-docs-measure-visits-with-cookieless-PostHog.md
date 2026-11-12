---
id: TASK-629
title: The site and docs measure visits with cookieless PostHog
status: In Progress
assignee: []
created_date: '2026-11-12T03:44:00Z'
labels: []
dependencies: []
ordinal: 1072000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The site at usearchboard.dev and its docs have no visitor analytics, so nobody can tell which pages people read or where they come from. PostHog in cookieless mode measures visits without a cookie or browser storage, so the site needs no consent banner. The docs of each release are built from their own tag, and /docs/ serves the newest release, so a change to the Astro build alone would reach the docs only at the next release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the site environment holds the variable POSTHOG_PROJECT_KEY, the deploy adds the PostHog snippet once to every page of the site and of every docs version, including releases from before this change
- [ ] #2 PostHog runs with cookieless_mode always, sends its requests to https://e.usearchboard.dev and links its interface to https://eu.posthog.com
- [ ] #3 Without the variable, and in a local or pull request build, the site has no PostHog
- [ ] #4 site/README.md describes the analytics and the variable
<!-- AC:END -->
