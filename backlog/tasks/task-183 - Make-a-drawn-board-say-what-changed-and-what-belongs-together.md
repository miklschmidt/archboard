---
id: TASK-183
title: Make a drawn board say what changed and what belongs together
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 13:55'
updated_date: '2026-09-12 15:07'
labels: []
dependencies: []
ordinal: 334000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A person reading a proposal on screen reported three things the picture gets wrong, with a screenshot (kept at node_modules/.cache/archboard-review/status-layering.png).

First, status is drawn in two voices. A changed or added relationship gets a wide faded band in green, amber or red behind a line, arrowhead and travelling dot that stay grey, so the coloured band reads as a glow behind an unrelated line rather than as the line's own standing. The band and its texture are wanted exactly as they are — the reader said so explicitly — and the line's own dash and weight already mean what sort of relationship it is and how much attention it asked for, so neither may be spent.

Second, rings are confused. A card can wear a solid cobalt ring for selection, an amber dashed border for a change, and a second dashed cobalt ring for an unsettled reconciliation, all at once, and nothing tells a reader which of the three they are looking at. The dispute ring is drawn by the viewer writing an inline style onto the picture, and the viewer's mark map is one union of attended and disputed, so a subject that is both loses its dispute entirely.

Third, a travelling dot is painted over the opaque label pill it should pass under, so the words on a relationship read as 'under(dot)lease' and 'one pic(dot)ure'.

Separately, the reader asked for something the schema cannot say: which parts of an architecture belong together, independently of what contains them and of what kind they are. A palette has to be trivially editable in code, and colour must never become a second way of saying a thing changed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A relationship's line, its arrowhead and its travelling dots are drawn in the same derived status colour as the faded band behind it, in both grammars, with the band and its texture unchanged and the line's own dash and weight preserved.
- [x] #2 A removed relationship still sends no dots, and a drawn picture is layered line, then dots, then the opaque label pill and its words on top, in both grammars.
- [x] #3 A node's own border is the one thing that says how it stands against its source, and exactly one clean outer ring says a person or a walkthrough is attending to it.
- [x] #4 An unsettled reconciliation is said with a distinct warning badge that overlaps neither a standing pin nor any text, on nodes, containers, relationships and steps alike, and is explained in words through the inspector or the standing disclosure.
- [x] #5 A subject that is both attended and unsettled shows both, because the two are independent states rather than one union.
- [x] #6 A node may state one optional named semantic group, independent of containment and of kind, with no implicit inheritance from a parent and no second membership.
- [x] #7 A node's kind decides its icon's shape and its group decides its icon's colour, its container's thin border and its faded background; a node with no group falls back to a colour derived from its kind; card backgrounds, card borders and lines carry no group colour.
- [x] #8 One group label draws the same colour on every board and variant and in both themes, collisions accepted, and the inspector says which group a node is in.
- [x] #9 Group membership is authored, read and cleared through the CLI, persists, and diffs, reconciles, propagates and adopts as the meaning it is; changing the palette changes no board's comparison.
- [x] #10 Every group colour lives in one small named palette module as an editable light/dark pair, with the label-to-colour mapping separate from it, no colour literal scattered elsewhere, no runtime configuration surface and no new dependency.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Two halves, delivered as two subtasks and two commits.

1. TASK-183.01 — presentation only, no schema change: one ink through a relationship's line, arrowhead and dots; the words painted over the dots; one ring for attention and a distinct warning badge, drawn by the renderer from the reconciliation the pane already reads, so attention and dispute stop sharing one mark.
2. TASK-183.02 — one optional `group` per node in the schema, compared and merged as meaning, with its colour derived from the label by a small named palette module and a separate mapping, and the icon's shape still decided by the kind.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Evidence

Both halves are done and recorded on their own subtasks. The full gate over the settled result:

`bun run check` → **exit 0**, run with `ARCHBOARD_VAULT` unset and a fresh `XDG_STATE_HOME` so no owner could resolve the user's vault. Zero `(fail)` lines; **2917 passing** — 2739 module tests across 271 files, 155 system across 36, 8 repository, 15 browser across 12 files. Log: `/tmp/claude-1001/gate-183b.log`.

New owners: `status-legibility.test.ts` (12) and `grouping.test.ts` (8) in the renderer, `grouping.test.ts` (4) in the store, and `semantic-status-legibility.test.ts` in the browser lane; the viewer's dispute owner was rewritten for the new contract.

## Interpretations worth a reviewer's eye

- **Every icon is now coloured**, not only a grouped one: with no group the colour is derived from the kind through the same mapping. The requirement said a missing group falls back to a type-based colour, and this is the reading that leaves no page of grey chips — but it changes how every existing board looks.
- **The icon's container takes the colour in both cases** — thin hairline plus a 14% wash — rather than staying neutral when the colour came from the kind. One rule instead of two.
- **The warning badge sits in the right-hand padding** every box already leaves, so nothing was re-measured and no geometry moved. It is the shell's own warning amber, told apart from the changed-amber pin by its silhouette (a triangle, not a disc) and by being in the opposite corner.
- **Ten group colours**, not eight: eight collided on four ordinary labels. Collisions are still accepted.

## Closed

Three independent reviews — renderer, schema and domain, and the UI boundary — and the visible-Chrome QA are all closed. Both halves are recorded on their own subtasks with what each review changed.

Where the palette is edited, since that was a requirement in its own right:
**`src/runtime/semantic-renderer/lib/group-palette.ts`** — ten light/dark pairs in one commented list and nothing else in the file. The label-to-pair mapping is separate, in `src/runtime/semantic-renderer/lib/group-colour.ts`, so retuning the colours cannot change which label lands where and neither can change what a board says.

Evidence, stated as it stands: the full gate at `/tmp/claude-1001/gate-183c.log` (exit 0, 2924 passing) is the last complete run and covers the settled tree; reviews and QA closed against it with no source change afterwards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A drawn board now says three things it could not: what a change did to a relationship, what a part belongs to, and which parts nobody has decided yet.

**Status is the line's own.** A relationship's line, its arrowhead and its travelling dots take the same derived ink as the faded band behind it — the band, its texture, the line's dash and the line's weight all unchanged — in both grammars. A removed relationship keeps its ink and sends no dots.

**The words are on top of everything.** Routes and words are two layers in both grammars, so a relationship's label is painted after every route on the page rather than after its own: a crossing no longer decides whose label a reader gets by which edge was drawn second. Identity is carried on both of a subject's groups, as a container's frame and title always have.

**One ring, and a badge that is not a ring.** The subject's own border says how it stands, one clean halo says a person or a walkthrough is attending, and a reconciliation nobody has decided wears a warning triangle in the opposite corner — drawn by the renderer from the same reconciliation the pane's sentences come from, so attention and dispute are independent by construction and a selected disputed subject shows both. The viewer no longer writes anything onto the picture.

**A part can say what it belongs to.** One optional `group` label per node, independent of containment and kind, never inherited, one per node, cleared by restating the node without it. It is meaning: it persists, compares, merges, propagates and adopts, and the schema version says so (1.1.0, stamped on write, with 1.0.0 boards still read as they stand). The colour is derived and stored nowhere: ten editable light/dark pairs in `lib/group-palette.ts` and a separate label mapping in `lib/group-colour.ts`. The kind decides an icon's shape, the group decides its ink, its tile's hairline and that tile's wash; cards, borders and lines take no group colour, and the inspector names the group in words.

Verified by four new runtime owners (renderer status, renderer grouping, store grouping, and the extended inspector case), a rewritten viewer owner, a new browser owner over both grammars and both grounds, the reviewers' own reproductions turned into owners, a CLI round trip on an isolated vault, and `bun run check` at exit 0 with 2924 tests passing. Closed after three independent reviews and a visible-Chrome QA pass.
<!-- SECTION:FINAL_SUMMARY:END -->
