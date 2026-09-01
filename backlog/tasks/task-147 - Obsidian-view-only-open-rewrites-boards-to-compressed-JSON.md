---
id: TASK-147
title: Obsidian view-only open rewrites boards to compressed JSON
status: To Do
assignee: []
created_date: '2026-08-31 23:24'
labels:
  - needs-triage
dependencies: []
references:
  - docs/design/vendor/README.md
  - scripts/check-obsidian-md.mjs
  - src/core/obsidian-md.ts
priority: high
type: bug
ordinal: 257000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard-authored `.excalidraw.md` notes use an expanded Drawing payload. Opening one in Obsidian with Excalidraw plugin 2.26.4, without editing the scene, rewrites the Drawing block as `compressed-json`. In the observed production architecture board this produced a semantic-noop Git diff of 371 insertions and 6,618 deletions. The rewrite obscures real changes, makes review impractical, and blocks safe cherry-picking while the note appears dirty.

This is the real-plugin evidence gap documented by TASK-087. That task pinned the plugin contract but explicitly had no plugin-authored 2.26.4 fixture. The fix should establish a stable, reviewable round trip between Archboard and the actual plugin without losing board metadata or human edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fixture or automated reproduction captures bytes written by Obsidian Excalidraw plugin 2.26.4, with provenance documented
- [ ] #2 Viewing an unchanged Archboard-authored board in Obsidian no longer leaves a thousands-line semantic-noop diff after the supported round-trip workflow
- [ ] #3 Archboard reads expanded and compressed Drawing payloads and preserves element IDs, bindings, customData, frontmatter, text elements, embedded-file records, and scene semantics
- [ ] #4 Regression coverage fails on the current view-only rewrite behavior and proves semantic and Git-diff stability in both Archboard-to-Obsidian and Obsidian-to-Archboard directions
- [ ] #5 The canonical persisted format and any normalization step are documented for users and agents
<!-- AC:END -->
