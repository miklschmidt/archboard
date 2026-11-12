---
id: TASK-629
title: The site and docs measure visits with cookieless PostHog
status: In Progress
assignee: []
created_date: '2026-11-12T03:44:00Z'
updated_date: '2026-11-12T10:44:00Z'
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
- [x] #2 PostHog runs with cookieless_mode always, sends its requests to https://e.usearchboard.dev and links its interface to https://eu.posthog.com
- [x] #3 Without the variable, and in a local or pull request build, the site has no PostHog
- [x] #4 site/README.md describes the analytics and the variable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. site/scripts/analytics.ts adds the PostHog snippet to every HTML page of the assembled site.
2. The assemble job runs it after the versions are put together, only when the site environment holds POSTHOG_PROJECT_KEY.
3. site/README.md describes it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12: the script ran on the real v0.3.0 release docs: 16 pages, one snippet each after two runs, and an empty key fails. In a browser, a copy of those docs loaded PostHog in cookieless mode through a local forwarder, sent a page view that PostHog accepted with 200, and held no cookie and no local or session storage. AC #1 waits for the variable POSTHOG_PROJECT_KEY in the site environment and the next deploy.

2026-11-12: the Site run 43151343699 for 716e731 deployed with the step "Add PostHog to every page" skipped, because the site environment has no POSTHOG_PROJECT_KEY yet. https://usearchboard.dev/ and https://usearchboard.dev/docs/ hold no PostHog snippet.
<!-- SECTION:NOTES:END -->
