---
id: TASK-085
title: >-
  A save deletes the Embedded Files section Obsidian wrote, losing where the
  images went
status: To Do
assignee: []
created_date: '2026-08-20 22:31'
labels: []
dependencies:
  - TASK-060
references:
  - src/core/obsidian-md.ts
  - src/server.ts
  - scripts/check-obsidian-md.mjs
priority: high
type: bug
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while fixing TASK-060, by reading the Obsidian Excalidraw plugin's source rather than its documentation.

The plugin does not keep image bytes in the drawing. On sync it walks `scene.files`, writes every base64 entry out as a real image file in the vault, records each one in a `## Embedded Files` section as `<fileId>: [[vault/path.png]]`, and then sets `scene.files = {}`. Base64 inside the Drawing block is an input format it accepts and migrates away from; its own notes do not carry one.

So a board that has been opened in Obsidian comes back to archboard with no `scene.files` and a `## Embedded Files` section instead. archboard's `preservedRegions` regenerates everything between `# Excalidraw Data` and the end of the Drawing block, so a save wipes that section — and it is the only record of which vault file each `fileId` resolves to. The images stay on disk as orphans and the board can no longer find them.

This is pre-existing and TASK-060 did not change it. What changes is how often it fires. Today it costs a section on the handful of explicit saves a day `stateless-server.md` measured. Under ADR 0015 every write is a save, so the first write after somebody opens the board in Obsidian destroys the mapping.

There is a decision inside this, and it should be made rather than defaulted into: **does archboard write the plugin's shape, or keep its own and preserve the plugin's?** Writing base64 into a note the plugin will migrate anyway means the two tools fight over the same bytes on every round trip. Preserving a section archboard does not otherwise understand is the cheaper fix and leaves the formats independent. CLAUDE.md already promises that everything else in a note is carried across a save verbatim, and this section is the case where that promise is not kept.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A note carrying an Embedded Files section survives an archboard save with the section intact
- [ ] #2 An image the plugin migrated to a wikilink is still resolvable by archboard after that save
- [ ] #3 check-obsidian-md covers a note in the shape the plugin actually writes, not only the shape archboard writes
- [ ] #4 Whether archboard writes the plugin's shape or preserves it is decided and recorded, with the reason
<!-- AC:END -->
