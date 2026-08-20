---
id: TASK-069
title: 'Mint every element id at the write boundary, in Obsidian block-id form'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:13'
updated_date: '2026-08-20 21:19'
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
- [x] #1 Every id the server mints, including one for a bound text element expanded from a label seed, is one to eight characters from Obsidian block-id alphabet
- [x] #2 wrapSceneAsObsidianMd finds nothing to rename on a board this server wrote, shown by a check that saves a board with labels, arrows and standalone text and asserts no id changed
- [x] #3 Collision handling lives where ids are minted, not where the note is written
- [x] #4 Boards already in the vault keep the ids they have; opening and saving one changes no id
- [x] #5 bun run test is green, with check-obsidian-md and check-labels specifically exercised
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New src/core/ids.ts: one place ids are minted. mintId(inUse) random 8-char, derivedId(sourceKey, inUse) deterministic 8-char (the old stableId8 algorithm, byte-identical), isBlockId. Collision retry lives here.
2. src/types.ts: generateId (18-19 chars) is deleted; every call site takes mintId, passing the board's element map as the in-use set where it has one.
3. src/core/labels.ts: labelTextIdFor(containerId) — the id a container's label expands into, derived from the container so the server's converter and the browser's agree without passing it. planLabelExpansion now names the identity for a *fresh* label too, not only a rename, so adoptReusedLabelIds renames the converter's 21-char nanoid before Excalidraw ever sees it.
4. src/core/expand-elements.ts: the bound text it mints stops being \`${id}-label\` (14+ chars, renamed by the note writer) and becomes labelTextIdFor.
5. src/core/obsidian-md.ts: stableId8 and its fnv1a go; the fallback rename for foreign ids calls derivedId. Same bytes out for the same input, which is what keeps vault boards unmigrated.
6. Checks. check-obsidian-md: the four renames measured in server-is-the-truth.md as golden values (compatibility, AC 4); a board built the way the server builds one, saved, with no id changed (AC 2). check-labels: a fresh label lands under a block-shaped id and keeps it across cycles. check-boards: end to end through the real save path.
7. Revert-proof: revert each half and count the failures.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED.

src/core/ids.ts is new and is the only place an id is minted: mintId(inUse) for a fresh one, derivedId(sourceKey, inUse) for one derived from something, isBlockId for the test, both retrying past ids already spoken for. Eight characters from the block-id alphabet, and derivedId is byte-for-byte the old stableId8.

Three renaming sites, not two. The task named wrapSceneAsObsidianMd and convertToExcalidrawElements. The plan also said generateId already produced eight-character ids; it did not. It was Date.now().toString(36) + Math.random().toString(36).substring(2), 18 or 19 characters, so every id the server minted needed renaming. And expandElementsForExport named a bound text `${container}-label`, 14 characters at best, which is a third site nobody had listed. Both corrected in docs/design/the-plan.md and docs/design/server-is-the-truth.md.

- src/types.ts:403 generateId deleted; the eight call sites take mintId, passing the board's element map, or a set spanning a batch where the batch does not reach the map until later (server.ts:1061, 2393).
- src/core/labels.ts:64 labelTextIdFor(container) — the name a label's text element answers to, derived from the container so the browser's expansion and the server's reach it without telling each other. planLabelExpansion now names a *fresh* label as well as a renamed one, so adoptReusedLabelIds renames the converter's nanoid before Excalidraw sees it.
- src/core/expand-elements.ts:166 uses the same function, so a board saved without ever being opened and one opened first agree.
- src/core/obsidian-md.ts: stableId8 and its private fnv1a are gone. The rename survives only as a fallback for ids that came from elsewhere, and it asks ids.ts for the name.
- src/core/labels.ts adoptReusedLabelIds skips struck-out text elements. Naming fresh labels made that load-bearing: a cleared label still carries its container's id, and without the guard both it and the new expansion were renamed onto one name.

WHAT THIS DOES NOT COVER. A text element Excalidraw itself minted is a 21-character nanoid and is still renamed at the note boundary. Nothing can rename it safely — the browser has it on screen and may have an editor bound to it — so what the browser gets back for a hand-drawn text element is an open question for stage 8. Recorded in the plan under stage 2.

REVERT-PROOF. Baseline before the change: obsidian 108, labels 128, boards 201. After: obsidian 134, labels 138, boards 213. Every other suite unchanged. Each half was reverted on its own and the suites re-run.

  mintId back to the 18-19 character form   4 obsidian, 3 boards
  the bound text named `${id}-label` again  2 obsidian, 3 boards
  planLabelExpansion not naming a fresh label  4 labels
  adoptReusedLabelIds renaming deleted texts   2 labels
  all four at once                             4 obsidian, 4 labels, 6 boards

The obsidian failure under the first revert is the interesting one: it reports the standalone text element going in as one name and coming out of the note as another, which is the data loss the task is about, on the simplest possible board.

VERIFICATION. bun run test green: type-check, module scope, mcp, bind, obsidian 134, changes, geometry 54, labels 138, library 47, boards 213, branch, side-by-side, install 33, repos, parity, hot. bun run build also run, because labels.ts is imported by the frontend.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ids are minted once, in src/core/ids.ts, eight characters from Obsidian's block-id alphabet, so the note writer has nothing to rename and an echo cannot rename a text element out from under an open editor.

Three sites minted or renamed ids, not the two the task listed. generateId produced 18 or 19 characters, not eight as the plan claimed, so every id the server minted was renamed on the way into a note. expandElementsForExport named a bound text `${container}-label`, which is also too long. Both now go through labelTextIdFor, derived from the container, which is also what the browser's expansion uses — so the two converters reach one name without passing it between them. wrapSceneAsObsidianMd keeps its rename only as a fallback for ids that came from elsewhere, and asks ids.ts for the name rather than implementing the retry itself.

Boards in the vault need no migration, and that is checked rather than assumed: derivedId is byte-for-byte the old stableId8, and the four renames measured in docs/design/server-is-the-truth.md §4 are pinned as golden values, alongside an open-and-save round trip that changes no id.

Verified by reverting. obsidian 108 -> 134 checks, labels 128 -> 138, boards 201 -> 213. Reverting the mint fails 4 obsidian and 3 boards; reverting the label name fails 2 obsidian and 3 boards; reverting the fresh-label naming fails 4 labels; all together, 14. bun run test is green.

Not covered: a text element Excalidraw itself minted is still 21 characters and still renamed at the note boundary. It cannot be renamed safely while a browser holds it, so stage 8 owns that; recorded in the plan.
<!-- SECTION:FINAL_SUMMARY:END -->
