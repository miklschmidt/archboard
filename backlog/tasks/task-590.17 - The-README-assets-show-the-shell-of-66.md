---
id: TASK-590.17
title: 'The README assets show the shell of #66'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T02:18:00Z'
updated_date: '2026-11-08T03:53:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: chore
ordinal: 1060000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-08 `bun run readme:check` listed 15 README assets as stale after the shell changes of #66. The owner asked to refresh them and attach the new clips and videos.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `bun run readme:check` lists no stale asset
- [x] #2 Every refreshed clip and video was looked at, attached with gh attach, and README.md points at the new addresses
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The assets were made on top of the stack (#66, #68), so they show the shell of #66 and the renderer of #68. The three narrated videos are replays of the talks kept in /tmp/narr-scratch, which are byte for byte the videos the README showed before, and their walkthroughs did not change since #31. ask spent one Codex answer. The design-smells clip now shows workspace with 9 entries, so its alt text says 9.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
bun run readme:check reports 17 of 17 assets current. Ten clips and three narrated videos were looked at (contact sheets of six frames each, every video with its audio track), attached with gh attach, and README.md points at the new addresses; each uploaded file matches its local size. The banner, social card, architecture, sequence and web-shop SVGs and the index thumbnails are committed.
<!-- SECTION:FINAL_SUMMARY:END -->
