---
id: TASK-397
title: >-
  The README banner shows the new logo, and the Codex-made assets show the
  redesigned product
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-05 16:35'
updated_date: '2026-10-05 16:35'
labels:
  - docs
  - tooling
dependencies: []
references:
  - scripts/readme-assets/banner.ts
  - docs/agents/readme-assets.md
priority: medium
type: enhancement
ordinal: 686000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The README banner is a blue and violet hologram with a person in it and the old lowercase wordmark laid over it. The product now has a warm graphite and gold identity, a mark (a gold peak with a swoosh) and a name set in the display face in tracked capitals. The banner is the first thing a reader sees, so it should carry the real logo and look like this product. The ask clip, the three narrated videos and their thumbnails also still show the shell before the redesign. They need a Codex sign-in, so TASK-396 left them for the owner, who has now asked for them to be made again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The banner shows the new logo, the mark and the name in the display face in tracked capitals, over new art, in light and dark. It uses the same mark geometry as the shell, and nothing in the repository still draws or generates the old lowercase wordmark.
- [ ] #2 The banner producer says what it needs, and the art direction stays where the owner keeps it (the prompts stay outside the repository, as TASK-161 decided). The documents say how to make the banner again.
- [ ] #3 The ask clip, the explainer, pr-walkthrough and newcomer assets and their thumbnails are made from the redesigned shell with a real Codex agent and voice, and `bun run readme:check` lists no stale asset.
- [ ] #4 The README text around the banner and the Codex assets says what they show now.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draw a new banner in the product identity (graphite, gold, the real logo). Make two routes and keep the better: the real renderer drawing composed with the logo, and Codex art that takes that drawing as its reference. 2. Lay the logo over the art as vector (the mark geometry of the shell and the display-face name), never as generated text. Keep the prompts outside the repository and say what the producer needs. 3. Remove the old wordmark and its generator once nothing uses them. 4. Make the ask clip and the explainer, pr-walkthrough and newcomer assets with a real Codex agent and voice, after the source changes, so their hashes are final. 5. Correct the README text around them. No board is affected: this is tooling and assets.
<!-- SECTION:PLAN:END -->
