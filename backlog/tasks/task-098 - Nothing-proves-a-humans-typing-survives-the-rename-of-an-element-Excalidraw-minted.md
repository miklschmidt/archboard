---
id: TASK-098
title: >-
  Nothing proves a human's typing survives the rename of an element Excalidraw
  minted
status: To Do
assignee: []
created_date: '2026-08-22 20:00'
updated_date: '2026-08-22 20:01'
labels: []
dependencies:
  - TASK-069
  - TASK-078
references:
  - scripts/check-live-session.mjs
  - src/core/board-io.ts
  - src/core/obsidian-md.ts
priority: high
type: task
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while checking whether TASK-065's fifth acceptance criterion was met. It is not, and the gap is specific.

TASK-069's measured hazard: with a text editor open on a bound label in a real browser, applying a document in which that element had been renamed discarded five typed characters — no error, no warning, nothing visible. That is the failure the whole id-minting stage exists to remove.

TASK-069 removed it for the ids **archboard mints**: every one is eight characters from Obsidian's block alphabet, so the note writer has nothing to rename. But Excalidraw mints 21-character ids in the browser for anything a person draws, and `obsidian-md.ts` still renames those through `derivedId`, because a block reference cannot hold one. TASK-078 then moved that rename from save time to **the write boundary**, which is the hot path — so it now fires on the first write after a person draws a text element, rather than occasionally on an explicit save.

TASK-078 recorded the risk honestly and offered 42 cycles of live browser editing with no lost keystroke as evidence. **That evidence does not cover this case.** `check-live-session`'s `retype` targets the bound text of an agent-created container, which already carries a server-minted eight-character id, so no rename fires during those 42 cycles. The check never creates a text element in the browser at all. It proves typing survives a write; it does not prove typing survives a rename, because no rename occurs in it.

So the property TASK-065 AC 5 states — an echo cannot rename an element out from under a cursor — holds for the ids archboard mints and is untested for the ids Excalidraw mints.

Two ways out, and which is right is the decision this task carries.

**Prove it safe.** Drive a real browser, draw a text element by hand so Excalidraw mints the id, start typing, let the write and its rename land, and assert every character survived.

**Or remove the case.** Give a browser-minted text element a block-shaped id before anybody can type into it, so nothing needs renaming later. That is the shape TASK-069 chose everywhere else, and it makes the hazard structurally impossible rather than tested for.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A real browser draws a text element, a person types into it, the write and its rename land, and no character is lost — or the rename no longer happens
- [ ] #2 The check fails if the guarantee is removed, proved by reverting it
- [ ] #3 TASK-065's fifth criterion can then be checked on evidence rather than on argument
<!-- AC:END -->
