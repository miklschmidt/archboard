---
id: TASK-025
title: Name and index the library items so agents can use them
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 21:39'
updated_date: '2026-08-19 22:02'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 25000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every library item has a name; 70 derivable without a model, 41 need rendering
- [x] #2 Names follow one convention and are what someone would say out loud
- [x] #3 A catalogue maps name to elements so an agent can insert an item by name
- [x] #4 Inserting a catalogue item places it at a given position without disturbing the rest of the board
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Revised after coordinator update: TASK-023 landed ADR 0007 (library items live
server-side in src/core/library.ts, seeded from libraries/*.excalidrawlib) and
a `library list` CLI already exists (src/cli/commands/library.ts, registered
in src/cli/run.ts, which is now committed/uncontested). Building a parallel
catalogue file would duplicate that store, so instead:

1. Measure populations (done): 111 items = 11 named (v2 format,
   architecture-diagram-components) + 59 nameable from an embedded text
   element + 41 blind (cloud 16, drwnio 16, software-architecture 7,
   system-design 2). Verified by parsing all 7 .excalidrawlib files.

2. Derive names for the 59 nameable items deterministically: single-text
   items get sentence-cased/whitespace-cleaned text; multi-text items use a
   filter (drop lorem-ipsum filler, pure-numeric strings, single letters
   that spell a word) plus a handful of documented overrides for genuinely
   ambiguous combinations (e.g. "amazon"+"web services" -> "Amazon Web
   Services"), and the 8 decision-flow-control Yes/No diamonds are
   disambiguated by the geometric direction of their Yes/No branches
   (computed from element positions, not guessed).

3. Visually identify the 41 blind items: batch-render ~8-9 per screenshot
   on the port-3400 canvas in a labelled grid, zoom-to-fit, screenshot,
   identify, clear, repeat (5 screenshots total for cloud/drwnio/
   software-architecture/system-design). Flag any uncertain identifications
   with a descriptive (non-brand) name instead of guessing.

4. Implementation, extending the existing store/CLI rather than adding a
   parallel one:
   a. New src/core/library-names.ts: an id -> name overlay for the 100
      items with no `.name` field, keyed by the same deriveId(setName,
      index) the store already uses for v1-format files, plus the
      documented naming convention.
   b. Extend src/cli/commands/library.ts: `list` merges the overlay so
      every seeded item resolves a name; add a `library insert <name-or-id>
      --x <x> --y <y> [--source <file>]` action that reads the live
      getLibrary() store (not libraries/ directly), translates the item's
      elements to the target position, regenerates element/group ids and
      rewrites internal references (groupIds, startBinding/endBinding,
      boundElementIds), normalizes the legacy "draw" element type to
      "arrow", tags customData with source-library attribution, and posts
      through the same prepareElement/batchCreateElementsStrict path `add`
      already uses.
   c. Small update to the `library` usage string in src/cli/run.ts to
      mention `insert`.
   d. Untouched: src/server.ts, src/types.ts, frontend/src/types.ts,
      frontend/src/shell/**, frontend/src/canvas/** (incl. elements.ts),
      src/core/labels.ts, libraries/** (read-only).

5. Verify: rebuild, `library list` shows all 111 with non-null names
   reconciling to the three populations, `library insert` twice at chosen
   positions, screenshot to confirm correct placement/no overlap, confirm
   `describe` sees them as plain elements. Clear the canvas and close the
   browser tab when done.

6. Do not mark Done, do not check acceptance criteria, no commit/push.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Populations verified by parsing all 7 libraries/*.excalidrawlib files directly:
111 total = 11 named (v2 format, architecture-diagram-components) + 59
nameable from an embedded text element (43 single-text, 16 multi-text) + 41
blind (cloud 16, drwnio 16, software-architecture 7, system-design 2) -
matches the task comment's breakdown exactly.

Re-planned mid-task after a coordinator update: TASK-023 landed ADR 0007
(library items live server-side, src/core/library.ts) and library list
already exists in src/cli/commands/library.ts / src/cli/run.ts. Built on that
instead of a parallel catalogue file:

- src/core/library-names.ts (new): id -> name overlay for the 100 items
  without a `.name`, keyed by the same deriveId(setName, index) the store
  uses for v1-format items. Documents the naming convention and how every
  name was derived (single-text cleanup, multi-text filtering + a few
  explicit overrides, decision-flow-control's 8 Yes/No diamonds named from
  computed arrow geometry, and the 41 vision-identified ones from batched
  screenshots).
- src/cli/commands/library.ts: `list` now merges the overlay so all 111
  items resolve a name; added `library insert <name> --x <x> --y <y>
  [--source <file>] [--id <id>]`, which reads the live getLibrary() store,
  translates elements to the target position, regenerates element/group ids,
  rewrites groupIds/boundElementIds/boundElements/startBinding/endBinding/
  containerId/frameId to the new ids, normalizes the legacy "draw" element
  type to "arrow", tags customData.library with source-library attribution,
  and posts through prepareElement + batchCreateElementsStrict (the same
  path `add` uses).
- src/cli/run.ts: one-line usage-string update for the library command
  (now safe to touch per the coordinator - it's committed/uncontested).

Verified: `bunx tsc --noEmit` clean, `bun run build:server` clean. Rebuilt
and ran the canvas on port 3400. `library list` shows 111/111 items with a
non-null name, counts reconciling per source file
(architecture-diagram-components 11, awesome-icons 24, cloud 19,
decision-flow-control 8, drwnio 18, software-architecture 7,
system-design 24). Inserted "PostgreSQL" (drwnio) at (200,200) and "Decision
diamond (yes below, no above)" (decision-flow-control) at (700,200) on the
same board; screenshot confirms both render correctly with correct internal
geometry and no overlap; `describe` reports 18 plain elements ("Nothing on
this canvas carries archboard metadata"), i.e. ordinary elements, not nodes.
Canvas cleared and browser tab closed afterward. Did not touch
frontend/src/canvas/elements.ts, src/core/labels.ts, src/server.ts,
src/types.ts, frontend/src/types.ts, frontend/src/shell/**, or libraries/**.
Did not run the full `bun run test` suite to avoid disturbing the other
agents' running canvas servers on other ports; relied on tsc + build +
manual verification on port 3400 instead.

Orchestrator verification: library list reports 111 items with zero unnamed. Spot-checked the riskiest population — the drwnio brand logos, where a confidently wrong name would be worst — by inserting five and looking: Redis, PostgreSQL, Nginx, Docker and GitHub all rendered as the brand they claim. Ambiguity is handled properly rather than silently: 'Docker' exists in two sets and insert refuses with both candidates and their ids, resolving with --source. Inserted stencils land as ordinary plain elements carrying no archboard metadata, which is right — a stencil has no architectural meaning until promoted.

The agent re-planned mid-task after being told ADR 0007 had landed, and extended the server-side store instead of shipping the parallel catalogue it had started. That was the correct call and saved a duplicate surface.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 21:39
---
Measured before proposing: of 111 items, 11 carry a name field, 59 embed a caption as a text element inside the group, and only 41 are genuinely unidentifiable without looking. The blind ones are cloud(16), drwnio logos(16), software-architecture(7), system-design(2).

The user's framing — 'unnamed makes it useless for agents' — is right but incomplete. Naming is necessary and not sufficient: nothing today lets an agent insert a library item, because library items live in the frontend. A library item is just a list of Excalidraw elements, so a catalogue of name -> elements makes them insertable through the existing add path with no frontend work at all. That is the actual deliverable; naming is its input.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All 111 stencils now resolve a name: 11 from the v2 format, 59 derived from an embedded text element, and 41 identified by rendering them in batches of eight. Names are an overlay keyed by the store's own id, unique within a source rather than globally, since the same concept legitimately recurs across libraries with different artwork. Insertion extends the existing library command, reading the live server store, translating to a target position, regenerating ids and rewriting every internal reference. Five brand names spot-checked visually.
<!-- SECTION:FINAL_SUMMARY:END -->
