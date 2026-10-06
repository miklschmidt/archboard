---
id: TASK-369.07
title: The pane inspector shows a part's recent changes and the parts it changes with
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:19'
updated_date: '2026-10-06 13:22'
labels:
  - history
  - ui
dependencies:
  - TASK-369.03
  - TASK-369.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: low
type: feature
ordinal: 655000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The history lens reaches an agent through the CLI. A user reading a board sees it only if the inspector shows it. The picture has no free visual channel (ADR 0025), and traffic must not show churn (ADR 0027), so the sidebar is the place.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selecting a part shows its recent commits and the parts it changes together with, each with a count
- [ ] #2 Selecting a coupled part from that list selects it on the canvas
- [ ] #3 Nothing is stored, and the canvas picture does not change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected board: Board viewer. It names each read the pane makes (Semantic queries -> Render stage states and -> Board reads list the render answer, the code findings; Board reads and Fetch semantic reads say what they read). The inspector's new read of the locality route changes those labels and responsibilities. Proposal Board viewer@TASK-369.07 restates them, with anchored relationships. No other board draws the inspector.
2. Client read: fetchLocality(board, variant) in api/semantic-boards.ts parses LocalityReplySchema; BoardReads gains locality (talkReads refuses it: a recording reads no history); localityQuery in lib/queries.ts keyed on board, variant id and version on screen, no refetchInterval, no focus or reconnect refetch, staleTime 0 so each selection (the selection panel is keyed by the pick and remounts) asks the server once, which answers from its memory unless a HEAD moved (ADR 0045).
3. lib/part-locality.ts: a pure reading of one part out of the board-wide answer: skipped with reason, read with its commits (newest first), the period of its repository and its coupled pairs (other part, shared commits, degree, unjoined); plus the board-wide count of large commits left out.
4. components/PartHistory.tsx: a sidebar region after What is it wired to?, only for a part. Recent commits with count (newest few, the rest behind a disclosure), Changes with: one choice row per coupled part with its shared count, its degree and whether nothing on the board joins them; choosing a row picks the part, pointing lights it. Words for: reading, failed (with retry), skipped (each reason), no commits in the period, no coupled part, large commits left out. On a historical or shelved variant it says the lens reads only the current variant and drafts and asks nothing; on a draft it asks for that draft.
5. Owners: rendered stage-harness test semantic-board-history.test.tsx (the region, the click-through, the skipped and no-commit words) and a focused test that the query runs on selection only: none before a pick, one per pick, none across vault-check polls, focus or time.
6. docs/design/operator-canvas-shell.md: the new region. Look at it at 1920x1080 light and dark on an own server with a copy of the dogfood vault, readme:check, gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What was built

- `src/ui/semantic-board-canvas/components/PartHistory.tsx`: a fifth region of the selection tab, How has it changed in code?, after What is it wired to?, only for a part. Recent commits (count, the day the period starts, the newest five with subject, short hash and day, Show all N for the rest), Changes with (count, one choice row per coupled part: shared commits and degree, and "Nothing on the board joins them" in the ink for an unjoined pair; choosing picks the part, pointing lights it), then the board's large commits left out. Words for reading, failed (with Read it again), skipped (each reason, with the repo, refs or checkout detail it rests on), no commit in the period, no coupled part, a part read before it was on the board, and a historical or shelved variant.
- `lib/part-locality.ts`: one part's share of the board-wide answer (skipped, read, or absent).
- `lib/queries.ts` `localityQuery` (exported from the module root), `lib/board-reads.ts` `locality`, `api/semantic-boards.ts` `fetchLocality` (parses `LocalityReplySchema`); `walkthrough-replay/lib/talk-reads.ts` refuses it.
- `DetailsPanel` takes the held variant and the reading on screen instead of the variant's content, and mounts the region; `SemanticInspector` passes them.
- `docs/design/operator-canvas-shell.md`: region 5 of the selection tab.

## Decisions the ADR did not settle

1. Placement: its own region after What is it wired to?, the last question a reader asks; the GoDeeper foot stays pinned under it. Only for a part (a node); a relationship, exchange or message has no binding of its own to read.
2. When it asks: each pick asks the server once. The selection panel is keyed by the pick and remounts, and the query is stale at once (staleTime 0), so every pick subscribes anew; the server answers from its memory unless a HEAD moved, which is how a commit since the last pick is seen (ADR: "the next selection reads the HEADs anyway"). No refetchInterval, no refetch on window focus or reconnect, no automatic retry. A failed read offers Read it again, which is a request the person makes.
3. Cache key: board, variant id and board version on screen, under a root of its own (`locality`), so no sweep of pictures or documents asks Git again; a new board version is a new key, so the next read is of the board as it stands (unjoined depends on the relationships).
4. Which variant: the variant that holds the picked part (the one on screen, or for a part removed in a comparison the variant it lived on). Current and draft are asked by id; historical and shelved ask nothing and say the history is read only for the current variant and drafts.
5. Recent commits: the part's commits in the period, newest first; the first five show, the rest behind Show all N (local presentation state). The period's start sits at the end of the heading's line.
6. Changes with: each pair is shown from the picked part's side with the other part, its shared commits and its degree in words ("11 commits together, 44% of their changes"); the unjoined line is in the ink, because that is the question the reading asks. The section shows only when the part has commits; with none it says no other part changes in enough of the same commits.
7. Large commits: the answer counts them for the whole board, not per part, so the region says "N large commits of over 30 files are left out of every count on this board", only when N > 0 and only for a part the lens read. A per-part count would need the route to change.
8. Skips: one sentence per reason; the facts it rests on (repository, named and checked-out refs, the checkout's detail) in mono under it, none for unbound and drill-down.
9. A recording reads no history: talkReads refuses locality, so a replay never reaches Git (the sidebar is stepped aside in a presentation anyway).
10. The canvas: nothing in the picture changes; the region is in the sidebar only and the picture is not asked for again.

## Evidence

- AC1: `src/ui/semantic-board-canvas/tests/semantic-board-history.test.tsx` "a picked part shows its commits and the parts it changes with, each with a count" (board and variant asked, commit order and Show all, both pairs from either side with shared counts and unjoined, large commits), "a part the lens did not read says why, and a part no commit changed says that instead", "a history that could not be read says so, and asks again only when the person says".
- AC2: same file, "a part chosen from the parts it changes with is picked on the picture, and that pick asks once more".
- AC3: the route is a GET and the region writes nothing; the first test asserts the picture is not asked for again; "on a historical variant the region says the lens does not read it, and asks nothing". On selection only: `tests/locality-on-selection.test.tsx` (DOM registered before the query library loads, so intervals run; hand-driven clock): none before a pick across three vault-check polls, one per pick, none across three polls (which did run), focus or reconnect; mutations adding refetchInterval, refetchOnWindowFocus, refetchOnReconnect or an infinite staleTime each fail it.
- Browser, own server on 127.0.0.1:3469 with a copy of the dogfood vault, this repository registered, 1920x1080: Semantic queries on Board viewer (light): 10 commits since 6 Oct 2025, Changes with Fetch semantic reads (5, 58%) and Local pictures (5, 55%), 21 large commits left out; Architecture painter on Semantic renderer (dark): 29 commits, Sequence painter 11 commits 44% unjoined and SVG document 7 commits 30%, as `semantic locality` answers; choosing Sequence painter picked it on the picture; Browser client says it opens a board of its own; Follow drill-downs says no commit changed it. Server stopped.

## Dogfood

Board viewer@TASK-369.07 (Semantic queries, Board reads and Fetch semantic reads say they read a board's locality; Semantic queries -> Render stage states and -> Board reads carry it, the latter anchored at localityQuery) adopted at version 59 with the board's scope as summary. Footprint against base 4fd680879: named and changed Fetch semantic reads, Semantic queries, Board reads; changed but not named Semantic viewer (index.ts gained the localityQuery export, a binding detail the board does not draw); named but not changed Render stage states (named only by a relationship). ./bin/dogfood check: no diagnostics. check --code: 860b5e16a puts no other board behind.

README assets: readme:check lists all 13 stale, as before this change. The ask clip picks a part of the web-shop example, whose parts carry no binding, so its selection tab now ends with the line that the part is bound to no code; it needs a Codex sign-in to refresh. No other clip films a part's selection tab.

Gate (2026-10-06, one lane at a time): type-check exit 0; build:frontend 0; test:modules 4095 pass 0 fail; test:system 197 pass 0 fail; test:repository 20 pass 0 fail; test:serial-browser exit 0 (19 owners, 24 pass). lint and fmt:check fail only on other agents' uncommitted work: src/runtime/code-check/** and src/runtime/code-facts/** (TASK-367.06/367.07: complexity, jsdoc, no-compatibility-identifiers, formatting of part-code.ts and resolution-and-cache.test.ts) and src/ui/semantic-board-canvas/lib/code-marks.ts (wordsAnchor complexity 9, the TASK-367.24 review's work in progress). Every file of this task passes lint:policy and oxfmt --check.
<!-- SECTION:NOTES:END -->
