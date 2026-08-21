---
id: TASK-085
title: >-
  A save deletes the Embedded Files section Obsidian wrote, losing where the
  images went
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 22:31'
updated_date: '2026-08-21 10:10'
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
- [x] #1 A note carrying an Embedded Files section survives an archboard save with the section intact
- [x] #2 An image the plugin migrated to a wikilink is still resolvable by archboard after that save
- [x] #3 check-obsidian-md covers a note in the shape the plugin actually writes, not only the shape archboard writes
- [x] #4 Whether archboard writes the plugin's shape or preserves it is decided and recorded, with the reason
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the plugin's behaviour in its own source before designing against it: syncFiles/syncElements (does it really clear scene.files), generateMDBase (what the section looks like), loadData (how it parses the section back), and whether ## Element Links is derived from the scene or is also a sole record.
2. Decide preserve vs adopt, and record the reasoning where a reader finds it. The asymmetry between Element Links and Embedded Files is the argument: one is derivable from the scene JSON, the other is the only record.
3. obsidian-md.ts: make ## Embedded Files a fourth preserved region, between the generated Text Elements section and the %% that opens the Drawing comment. Element Links stays regenerated-away, deliberately, because preserving a stale one puts back a link somebody deleted.
4. obsidian-md.ts: the note names an image once. Drop from scene.files any fileId the preserved section already covers, so archboard does not write bytes back into a note the plugin migrated them out of.
5. board.ts: resolve the wikilink form. Parse the section's entries, resolve [[path]] against the vault (Obsidian's shortest-form linktext), read the bytes and fold them into the scene's files on readBoardFile, so every existing reader of sceneJson gets the picture with no change to server.ts.
6. check-obsidian-md.mjs: a note in the shape the plugin actually writes — Embedded Files, Element Links, a wikilink, a hyperlink, an equation, empty scene.files — asserted lossless and idempotent, plus the drop rule.
7. check-boards.mjs: end to end in a real temp vault — a real png file, a note naming it by wikilink, opened cold, the image on /api/files, saved, section intact, no base64 written.
8. Revert-proof each half and count the failures. bun run test green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified against the plugin's source before designing anything, and the summary in the description held on every point. syncFiles() walks scene.files and calls saveDataURLtoVault() for every key no Embedded Files line already covers; syncElements() then sets this.scene.files = {} outright, and both are inside the non-compatibility-mode branch, which is the one a .excalidraw.md note takes. generateMDBase() emits '## Embedded Files' when it has files, equations or markdown images, one '<id>: <target>' per entry followed by a blank line, wikilink for a vault file, bare URL for a hyperlink, $$latex$$ for an equation. loadData() finds the section with a plain indexOf and parses the rest of the markdown with three regexes.

One thing the description did not say, and it is what settles the design: the same region holds '## Element Links', and that one is NOT a sole record. findNewElementLinksInScene() rebuilds it from the link field of the scene's own elements on load, updateElementLinksFromScene() prunes it on save, and loadData() writes what it reads there back onto the element (textEl.link = link). So preserving Element Links would resurrect a link somebody deleted here, which is TASK-028 and TASK-029 in a new place. Embedded Files is the asymmetric case: the bytes are gone from the scene, so the section is the only record. Preserve one, keep regenerating the other, and say why.

Decision: preserve, do not adopt (ADR 0017). Writing the plugin's shape would mean archboard guessing at Obsidian's attachment-folder setting and scattering files through somebody's vault, and performing a migration for boards nobody ever opens in Obsidian. Preserving is the promise the frontmatter and the human's prose already have. Added to it: an id the section names is dropped from scene.files on write, so the note records a picture once rather than twice, and the two tools stop moving the same bytes back and forth.

Third option checked, and taken as well: archboard follows the wikilink. A migrated image is resolved against the vault when the note is read, so preserving the record keeps the picture and not just the note of it. Resolution order is Obsidian's: vault-relative, then relative to the note, then by basename. A name two files answer to resolves to nothing rather than to a guess, and so does a link that leaves the vault.

Impostor defence, because the region model already has one for the data heading: the section heading is looked for only below the last block-reference line, and a text element is always written ending in its own block reference, so a label whose words are '## Embedded Files' can never start a section. A heading with no entries under it is preserved as nothing. Without either, a note grows by a copy of the impostor on every save.

Seams: the format half is in obsidian-md.ts (region, writer, entry parsing); the vault half is in board.ts, which is where the vault root and fs already live. Resolved images are folded into the scene JSON readBoardFile already returns, so all three callers of it in server.ts pick them up with no edit to that file.

Boundary with TASK-078: nothing here changes when a note is written, only what a note contains. src/server.ts and src/core/board-store.ts are untouched.

Revert-proof, in FAIL counts:
- stop emitting the preserved section: 14 obsidian-md, 1 boards
- stop dropping an id the section already names: 2 obsidian-md, 1 boards
- preserve the section but never follow the wikilink: 0 obsidian-md, 2 boards
- look for the heading above the last block reference too: 3 obsidian-md, 0 boards

obsidian-md went from 134 checks to 197.

Validation: bun run test green, exit 0, both browser checks headless.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A note records where each of its images is once, and archboard keeps that record whoever wrote it. Obsidian's Excalidraw plugin moves image bytes out of a drawing into real vault files and writes a '## Embedded Files' section saying which file each fileId went to; archboard regenerated everything between '# Excalidraw Data' and the Drawing block, so a save deleted the only mapping and left the pictures in the vault as orphans. That section is now a preserved region like the frontmatter and the human's prose, an id it names is not written back into the Drawing block, and the wikilink is followed against the vault when the note is read, so a board the plugin has migrated still draws rather than merely remembering where its pictures used to be. '## Element Links', its neighbour, keeps being regenerated on purpose: the plugin rebuilds it from the elements' own link fields and applies what it reads back onto them, so a stale copy would put back a link somebody deleted. Recorded as ADR 0017 with the rejected alternative (writing the plugin's shape, which means guessing at somebody's attachment-folder setting) and in CLAUDE.md. Verified in check-obsidian-md (134 checks to 197, including a note in the shape the plugin actually writes, an equation and a hyperlink entry, the legacy heading, and a text element whose words are the section) and in check-boards against a real temp vault holding a real png, opened cold. Reverting the preserved section fails 14 obsidian-md and 1 boards check, the write-once rule 2 and 1, the wikilink resolution 0 and 2, the impostor guard 3 and 0. bun run test green.
<!-- SECTION:FINAL_SUMMARY:END -->
