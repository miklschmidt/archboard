---
id: TASK-625
title: >-
  The README banner and the social card show the site's hero table on
  Archboard's ground
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T20:23:00Z'
updated_date: '2026-11-10T23:38:00Z'
labels:
  - docs
  - tooling
dependencies: []
references:
  - scripts/readme-assets/banner.ts
  - scripts/readme-assets/stage/banner.html
  - docs/agents/readme-assets.md
priority: medium
ordinal: 1070000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked for new banner art and social cards based on the 3D header of the marketing site, on Archboard's background colours in place of GitHub's page colours. TASK-399 had set the banner on GitHub's grounds (#0d1117 and #ffffff) so that it showed no edge on the README; the owner found those colours ugly. The site's hero table is dark only: its WebGL shader lights a dark drafting table and fades into the site's ground, so the banner is one dark picture for both colour modes. The owner also asked for twitter:image on the site, with the same social card.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The banner shows the site's hero table, drawn by the hero's own code from site/src/scripts/hero, beside the lockup, with every card of site/model in view
- [x] #2 The social card shows the same table under the lockup, at 1280x640
- [x] #3 The ground of both written files is the site's ground, oklch(0.135 0.005 75), within three levels in each channel
- [x] #4 `bun run readme:assets banner` makes both files, and `bun run readme:check` reports the banner current
- [x] #5 The site's pages carry twitter:image with the social card's address, beside og:image
- [x] #6 The README, the asset guide, PRODUCT.md and site/DESIGN.md describe the new banner and card
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-11-10. `bun run readme:assets banner` (inside nix develop) exit 0; `bun run readme:check` lists the banner as current (the 15 other stale assets were stale before this change, measured with the old browser.ts). Ground samples: banner.webp srgb(9,8,6), the site ground; social JPEG srgb(8,9,3). The banner shows all 12 cards of site/model. Lossy WebP at quality 90 and 98 left a chroma ring and blocks in the dark ground when brightened, so the banner is lossless (488 KB). tsc, the policy lint over scripts/readme-assets, the format check and the two README policy tests pass. The site builds after its prebuild generators, and dist/index.html carries twitter:image with the same address as og:image. Vite serves the checkout with watch: null and no dependency discovery, because a watcher walked .skill-evals during the prototype.

Follow-up: the social card carries a line in its lower right corner, "Catch the calls your architecture doesn’t allow.", in the site's display face at 44px. The lockup keeps its first size (96px) above the table. The line names what the check catches, because the page's og:title already says what Archboard is for. The 10 Nov launch research says to lead with what the check catches. The line stands apart from the words that the table fits under, so the table keeps its full room. The text is in the SOCIAL layout in scripts/readme-assets/banner.ts.

Second follow-up: the card's corner now holds a headline over a lead, right-aligned, as the site sets its words. The headline is "Stay in charge." in the display face at 60px. The lead is "Plan each change before your agent writes it." and "Catch the calls your architecture doesn’t allow." in the body face at 24px. At X's preview width of about 506px, the lead is small but legible, and a larger lead would run into the Painter card. The take now fails when Archboard Onest does not load, as it already did for Archboard Display.

Third follow-up: the card's headline is "Stay in charge" with no final period, because a title or heading takes no final period. The two lead sentences keep theirs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The banner producer now draws the marketing site's hero table, not a tilted SVG of a web-shop proposal. A kit page (scripts/readme-assets/stage/banner.html) runs the hero's own modules under Vite, with reduced motion so the table draws its finished entry in one frame, in Chromium with SwiftShader WebGL2 (a new opt-in of the kit's Browser, with a reducedMotion window option). The banner (docs/readme/banner.webp, lossless) sets the lockup beside the table; the social card sets it above, as the hero sets its words. Both lie on the site's ground. The banner is one dark file for both colour modes, because the hero has no light theme; banner-dark.webp and banner-light.webp are gone. The site adds twitter:image. Risk: the layouts place the canvas by the hero's fitting rules, so a change to those rules needs a look at the banner, which the asset guide says.
<!-- SECTION:FINAL_SUMMARY:END -->
