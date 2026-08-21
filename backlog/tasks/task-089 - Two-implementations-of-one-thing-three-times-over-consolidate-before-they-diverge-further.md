---
id: TASK-089
title: >-
  Two implementations of one thing, three times over: consolidate before they
  diverge further
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-21 12:53'
updated_date: '2026-08-21 13:30'
labels: []
dependencies: []
references:
  - src/core/board-io.ts
  - src/core/board.ts
  - src/core/expand-elements.ts
  - src/server.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: task
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Not a suspicion. Three instances, each found by evidence rather than by reading for smells, and one of them has already cost a bug.

**1. One arrow, two gaps.** `expand-elements` builds a binding recording `gap: 4`. `resolveArrowBindings` routes that same arrow with a local `const GAP = 8`. Two numbers for one distance, and neither knows about the other. TASK-088 covers the arrow-routing half of this; the duplication is the reason it was possible.

**2. Two ways to read a note.** `readBoardFile` in `src/core/board.ts`, and `readNote` / `readBoardContent` in `src/core/board-io.ts`. Stage 8 made the second one the path every request takes and left the first as the open path. TASK-085 had put its wikilink resolution in the first. The two merged cleanly, git reported no conflict, and a board the Obsidian plugin had migrated rendered holes on every read — caught only because check-boards happened to cover it, and repaired by hand afterwards. **This is what the duplication costs: a correct change to one path silently not applying to the other.**

**3. Two ways to expand elements.** `expandElementsForExport` and `expandForBoard`, both exported from `src/core/expand-elements.ts`. They may be legitimately different jobs. They may also be the thing ADR 0015 names outright: 'There is one implementation of that conversion, shared by everything that needs it, rather than one per side that are meant to agree.' That needs establishing rather than assuming, either way.

## What the survey did NOT find

Worth recording so this stays scoped. Every named numeric constant in `src/` appears exactly once — no duplicate definitions — and the timing family is already gathered into `src/core/timing.ts` by TASK-066. Repeated bare literals in the element and geometry paths turned out to be ADR numbers and HTTP statuses in comments. So this is not a codebase littered with magic numbers; it is a small number of parallel implementations, which is a different and more dangerous problem because a check passing on one path says nothing about the other.

## Why now is not the moment

Recorded deliberately. This wants doing between features, not during one — the mutex work (TASK-067, TASK-080) is still to land and touches the write path that instance 2 lives in. Consolidating underneath it would mean resolving the same merges twice.

The precedent for how to do it is already here: TASK-061 deleted `repo-registry`'s hand-rolled temp-file-and-rename rather than leaving a second idiom to go stale, and the one that survived gained an fsync the other never had.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One arrow's gap is defined once and both the binding and the routing read it
- [x] #2 There is one path that reads a note, and the open path and the per-request path are the same code
- [x] #3 Whether the two expansion functions are one job or two is established and written down, and if one, they are one function
- [x] #4 Each consolidation is proved by reverting it and counting which checks fail, not by the suite staying green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Instance 2 (two ways to read a note), agent A:
1. Separate the three layers. readNoteFile(file) in board-io.ts does the one act: read bytes, decode, refuse a non-note, hash the bytes, reassemble the scene with any image the plugin moved out. It returns { file, raw, hash, sceneJson } or null on ENOENT.
2. Move readBoardFile and LoadedBoard from board.ts into board-io.ts on top of it, so resolving an identity to a path and reporting a frontmatter-versus-path disagreement is what it adds, not how it reads. Update the two importers (src/server.ts, scripts/check-boards.mjs). No compatibility re-export: a second import path is the thing being deleted.
3. readNote keeps its job: readNoteFile plus ingestScene into BoardContent. readBoardContent is unchanged, and still records no baseline.
4. Guard against a re-split with two checks. An agreement check in check-boards asserts that on one migrated note the open path and the per-request path both carry the image, the hash and the refusal. A structural check asserts sceneJsonWithEmbeddedImages has exactly one call site in src/.
5. Prove it by reverting: (a) restore the two readers, count the failures; (b) drop the embedded-image call from the consolidated reader, count the failures on both surfaces.
Out of scope, named deliberately: extractSceneElements in board.ts, used only by repo-boards to scan every note in the vault for bindings. Elements only, no hash, no images, never writes. Folding it in would make a vault scan base64 every migrated image in the vault for nothing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Instance 2 (two ways to read a note) is done. Commits d234645 and d624be1.

**What each path genuinely did.** `readBoardFile` in board.ts turned an identity into a vault path, read the note, and said who the note claims to be: the level from the frontmatter (no path carries one), the casing a human chose, and a `declaredKey` when the frontmatter names a different board than the path does. `readNote` in board-io.ts took a path a BoardState already knew and turned the note into the element and file maps a route works against. Two different jobs.

Underneath both sat the same five steps, written out twice: read the bytes, decode, refuse a file that is not an `.excalidraw.md` note, hash the bytes for ADR 0006's baseline, and reassemble the scene with any picture the Obsidian plugin had moved into a vault file. That last step is the one TASK-085 added to one copy and not the other.

**The single read path.** `readNoteFile(file, root)` in board-io.ts, returning `{ file, raw, hash, sceneJson }` or null for a note that is not there. `readBoardFile` moved into board-io.ts on top of it, keeping only the path resolution and the identity interpretation; `readNote` keeps only `ingestScene`. Neither reads anything itself. `LoadedBoard` moved with it and is now `NoteFile` plus identity, which is exactly what it always was. No compatibility re-export from board.ts: a second import path is the thing being deleted.

Cost is unchanged. The same calls in the same order, one object allocation, and the embedded-image pass still short-circuits on a note with no `## Embedded Files` section.

The baseline is unchanged too. `readNoteFile` computes a hash; only `board open` and `writeBoardContent` record one. `writeBoardContent` still reads its destination with a bare `readFileSync` and deliberately does not go through `readNoteFile` — it has to hash bytes that are not a note at all, because a foreign file at a board's path is the conflict it reports rather than an error it throws. Said so in the comment.

**Scoped out, deliberately.** `extractSceneElements` in board.ts is a third reader of note text, used only by repo-boards for the vault scan behind `board list --repo`. It wants elements and nothing else: no hash, no images, never writes. Reading every note in the vault the way a request reads one would base64 every migrated picture in the vault for a `files` map it discards. Left where it is, with the reason in the comment.

**Revert-proof, three states, all `bun run test:boards`.**

| State | Failures | Which |
|---|---|---|
| consolidated (shipped) | 0 | — |
| src reverted to two readers, both correct | 1 | the structural check, naming both call sites |
| two readers, 256369d's fix removed from the per-request one — the state git actually merged | 4 | the two API checks, the agreement check (`open true, per-request false`), the structural check |
| consolidated, embedded-image call dropped from the one reader | 4 | the two API checks, the agreement check (`open false, per-request false`), the structural check |

Row 2 is the one that matters for AC #4: a straight revert restores two paths that are both correct today, so every behavioural check passes and only the structural check fires. Row 3 is the historical bug reproduced, and the agreement check names which side lost the fix.

**What stops it happening again.** Both, because they fail on different things. The agreement check reads one migrated note through `readBoardFile` and `readNote` and asserts they agree on the bytes, the hash, the picture and the refusal — it catches a second reader that is wrong. The structural check asserts exactly one line in src/ calls `sceneJsonWithEmbeddedImages` — it catches a second reader that is right today, which is the state the old one was in for as long as it took somebody to fix the other. The open path also gained its own image assertion, which the migrated-note block never had: it only checked that the open returned 200, and the picture was asserted through `GET /api/files`, the per-request path.

Full suite green: `bun run test`, 22 steps including both headless browser checks.

Instances 1 and 3 landed with TASK-088. Instance 2, the two ways to read a note, is untouched and is the one that has already cost a bug.

Instance 1, one arrow two gaps: gone. BOUND_ARROW_GAP lives in src/core/arrow-binding.ts and is read by the conversion that builds a binding from an agent's ref and by the routing that places the endpoint. There is no GAP = 8. Proved by hardcoding 8 back into the router: 4 of 82 geometry checks fail.

Instance 3, the two expansion functions: established as one job with two entry points, not two implementations.

The evidence. expandForBoard's whole body is a map over boundElements followed by a call to the other function; it converts nothing itself, so no input can get two answers. The same elements do pass through both, in sequence rather than in competition: an agent write goes expandForBoard -> store, and every note write goes scene-io buildScene -> the same converter over the whole document. Direct callers of the converter are scene-io.ts (notes and export --out) and share-url.ts (a shareable URL); callers of the wrapper are the four write paths in server.ts and relabelBoundTexts. The frontend has no expansion of its own left, only mermaid's own skeleton conversion, which is reported like a human's drawing.

The second job, written where the next person looks: a write names a few elements and the board holds the rest, so a reference to a text element must be squared against the board before anything can ask whether a container already has a label. A whole document answers that by being whole.

What was wrong was the name. expandElementsForExport is on the store path too, so it is expandElements now, renamed across 5 files. Both doc comments say which is which and why the pair is not the ADR 0015 problem, and check-labels asserts it: given a board that adds nothing the wrapper's answer is the converter's, field for field. Making the wrapper convert anything of its own fails that check, 1 of 175.
<!-- SECTION:NOTES:END -->
