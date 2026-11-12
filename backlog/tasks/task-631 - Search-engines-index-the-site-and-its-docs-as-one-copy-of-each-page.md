---
id: TASK-631
title: Search engines index the site and its docs as one copy of each page
status: In Progress
assignee: []
created_date: '2026-11-12T21:52:00Z'
updated_date: '2026-11-12T21:57:00Z'
labels:
  - site
dependencies: []
references:
  - docs/adr/0077-each-release-has-its-own-docs.md
ordinal: 1074000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
usearchboard.dev has no sitemap and no robots.txt of its own, and Google Search Console does not know it. Every deploy serves each docs page several times: at /docs/, at /docs/<version>/ for the newest release, at /docs/next/ and at each older release. Each copy names itself as canonical, so search engines split ranking across the copies and can show an old release or main in results. The home page also gives no site name for search results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each versioned docs page names the page of the same path under /docs/ as its canonical URL and og:url, when /docs/ holds that page
- [ ] #2 The deploy serves /sitemap.xml, which lists every page that is its own canonical URL, and /robots.txt names it
- [x] #3 The home page states the site name Archboard as `WebSite` structured data, and every page names the site and the size of its social card in Open Graph
- [ ] #4 The owner verified usearchboard.dev in Google Search Console and submitted the sitemap
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. versions.ts points the canonical link and og:url of each mounted copy at /docs/ when the latest mount holds the same file.
2. A sitemap script reads the assembled dist and writes sitemap.xml from every page whose canonical URL is its own URL. The Site workflow runs it after versions.ts.
3. public/robots.txt allows every crawler and names the sitemap.
4. Base.astro adds og:site_name and the social card size and alt. The home page adds WebSite JSON-LD.
5. The owner verifies the domain in Search Console and submits the sitemap.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12: Built the site from this branch and assembled it with a fake 0.4.1 release made from the same build: versions.ts, then sitemap.ts, then links.ts. docs/0.4.1/gate/ and docs/next/gate/ name https://usearchboard.dev/docs/gate/ as canonical and og:url. sitemap.xml lists 18 of 52 pages (the home page and the 17 pages under /docs/) and no /docs/next/ or /docs/0.4.1/ URL. All 52 pages pass links.ts. The home page holds the WebSite JSON-LD, and every page holds og:site_name and the card's size and alt. astro check: 0 errors. AC #2 waits for a deploy of main. AC #4 waits for the owner.
<!-- SECTION:NOTES:END -->
