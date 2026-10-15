---
id: TASK-482.04
title: Every crowded dogfood board gets inner structure and its calls move into flows
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 21:05'
updated_date: '2026-10-15 22:25'
labels:
  - skill
dependencies:
  - TASK-482.03
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: medium
type: task
ordinal: 845000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the Live panes pilot of ADR 0052, the other dogfood boards over the overview budget need the same change. On 2026-10-15 they were Board viewer, Archboard server routes, Board persistence, Agent workbench, Command interface, Browser application, Archboard server, Semantic renderer, Board rasterizer, Skill evaluation, Voice coordinator and Codex workhorse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard check` reports no `OVERVIEW_CROWDED` for any dogfood board
- [x] #2 Every new container has a responsibility that the code supports, and binds to a folder where the code has one
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. For each of the 13 crowded boards, a draft <board>@TASK-482.04 gathers the subject parts into a few containers (areas) along the existing views and groups, each with a responsibility the code supports, bound to a folder only where the code has one; each area gets a view. Prefer merging a hub area over splitting it (the Live panes pilot measured a split at 37 lines and a merge at 22).
2. Each draft: the overview within 15 parts and 25 lines; semantic compare shows only added areas, parent changes and new views; the code-check findings equal those without the draft.
3. Seven sub-agents draft two boards each in parallel; they write only through the CLI, adopt nothing and commit nothing.
4. I look at each overview, run the code-check comparison and the footprint, adopt, and commit.
Boards: all 13 named in the description (proposals <board>@TASK-482.04).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
On 2026-10-15 the first `archboard check` with OVERVIEW_CROWDED also flagged Renderer layout (17 parts, 20 lines) and lists Codex workhorse at exactly 15 parts with 34 lines: 13 boards besides Live panes.

Closing: every draft was a parent-only regrouping, except three corrections. Archboard server: the runtime modules (code check, code facts, language servers, history lens) are imported only by the server, so they stay in its Code evidence area. Its four lines from the container to its own parts now start at Live panes, Route handlers and Application lifetime, and the second Server entry -> Application lifetime line (anchor serverStartupFailureMessage, a helper neither part binds) is removed. Board viewer: Variant timeline and Picture departure are added as parts, and three calls that the removed container line hid are drawn (Render stage states -> Camera arithmetic, Render stage states -> Picture departure, Picture transition -> Picture departure). Board rasterizer: Chromium is in Browser hosting, and ffmpeg and Nix are in Video encoding, the unbound areas whose responsibility names them, which brings it to 14 parts. Overviews after: Agent workbench 8/20, Archboard server routes 12/24, Archboard server 10/22, Board persistence 11/23, Board rasterizer 14/13, Board viewer 13/24, Browser application 8/21, Codex workhorse 6/9, Command interface 7/13, Renderer layout 8/9, Semantic renderer 10/18, Skill evaluation 12/22, Voice coordinator 10/20 (parts/lines). I looked at every overview PNG. archboard check --code with and without --variant TASK-482.04 differ by one information finding (EXPOSED_UNUSED on Renderer layout's Block layout folder). The footprint of each board reads current = the draft's parent and 0 commits, because the task changes no code. Each area is unbound unless the code has a folder for it. Adopted all 13. archboard check: no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The 13 crowded dogfood boards now gather their parts into areas, each opened by a view, and every overview is within 15 parts and 25 lines. No relationship joins a container and its own part. Verified with archboard check (no diagnostics), the code check with and without the drafts, the footprint of each board and a look at each overview.
<!-- SECTION:FINAL_SUMMARY:END -->
