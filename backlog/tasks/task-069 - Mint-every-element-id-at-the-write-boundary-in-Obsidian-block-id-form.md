---
id: TASK-069
title: 'Mint every element id at the write boundary, in Obsidian block-id form'
status: To Do
assignee: []
created_date: '2026-08-20 20:13'
labels: []
dependencies: []
references:
  - src/core/obsidian-md.ts
  - src/core/labels.ts
  - src/server.ts
  - docs/design/server-is-the-truth.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: bug
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 2 of docs/design/the-plan.md. Independently valuable and shippable ahead of the converter work, because it removes silent data loss from the code as it stands today.

THE DATA LOSS, MEASURED. With a text editor open on a bound label in a real browser, a document was applied in which that text element had been renamed. The textarea stayed on screen, stayed focused, and kept its value. The scene no longer held the id the editor was bound to. Five characters were typed and Escape was pressed.

The five characters were discarded. Nothing errored, nothing warned, and the label kept its old text.

No amount of timing fixes this. Holding an echo until a gesture ends does not help, because the human's next keystroke still goes to an element that is gone. The only defence is that ids do not change.

TWO PLACES MINT OR RENAME IDS THE SERVER DID NOT CHOOSE.

1. `wrapSceneAsObsidianMd` in `src/core/obsidian-md.ts:396` renames any text element whose id is not one to eight characters from Obsidian's block-id alphabet, via `stableId8` at line 48, and rewires every reference to it. An Obsidian block reference cannot hold anything longer. Measured on a five-text-element board, four of the five were renamed:

     text-plain               -> Koh9JpWT
     0fiCOql98KV5AVNsb7yti    -> QO4jtmur
     M0uzDDmr3XAuPV1LLV0qO    -> vbJqUUt6
     GOThTByyWuX7VIo4b-EbG    -> ct9GeNvu
     AbCd1234                 -> AbCd1234   (already eight characters)

   Today that rename lands in the note and the store keeps its own ids, so it is harmless. Under ADR 0015 the note is the store, so the rename is what the browser gets back.

2. `convertToExcalidrawElements` mints a fresh 21-character nanoid for the text element it expands from a `label` seed, even with `regenerateIds: false`. That is the mechanism behind TASK-024, and `adoptReusedLabelIds` in `src/core/labels.ts:261` exists entirely to rename it back afterwards.

THE FIX. Every element id the server creates, including a bound text element expanded from a `label` seed, is one to eight characters from Obsidian's block-id alphabet, minted once, at the write boundary. Then the note writer has nothing to rename and an echo can never rename an element out from under a cursor. `generateId` already produces eight-character ids, so most of this is making sure nothing else reaches the store. `stableId8`'s collision handling moves from the writing site to the minting site, which is where it belongs: a collision is a property of the id space, not of the file format.

COMPATIBILITY. The existing rename is deterministic, so boards already in the vault keep the ids they have. Nothing needs migrating.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every id the server mints, including one for a bound text element expanded from a label seed, is one to eight characters from Obsidian block-id alphabet
- [ ] #2 wrapSceneAsObsidianMd finds nothing to rename on a board this server wrote, shown by a check that saves a board with labels, arrows and standalone text and asserts no id changed
- [ ] #3 Collision handling lives where ids are minted, not where the note is written
- [ ] #4 Boards already in the vault keep the ids they have; opening and saving one changes no id
- [ ] #5 bun run test is green, with check-obsidian-md and check-labels specifically exercised
<!-- AC:END -->
