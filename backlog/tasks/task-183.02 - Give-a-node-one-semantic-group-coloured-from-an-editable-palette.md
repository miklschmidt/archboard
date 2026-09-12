---
id: TASK-183.02
title: 'Give a node one semantic group, coloured from an editable palette'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 13:55'
updated_date: '2026-09-12 15:06'
labels: []
dependencies: []
parent_task_id: TASK-183
ordinal: 336000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The parent's second half: the schema gains one optional named group per node, and the renderer colours an icon by it. The group is meaning, so it diffs and reconciles like any other field; the colour is presentation, so it is derived and never stored.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One optional named group per node in the content and input schemas, independent of parent and kind, no inheritance, no second membership.
- [x] #2 Kind decides the icon's shape; the group decides the icon's colour, its container's thin border and its faded background, falling back to a colour derived from the kind; cards, card borders and lines take no group colour.
- [x] #3 The same label draws the same colour on every board, variant and theme, and the inspector names the group.
- [x] #4 The field is authored, read and cleared through the CLI and persists; it compares, reconciles, propagates and adopts as meaning, and editing the palette changes no comparison.
- [x] #5 One small named palette module holds every pair, the label mapping is separate from it, and no colour literal for a group exists anywhere else.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Schema: `group: GroupLabelSchema.optional()` on `SemanticNodeSchema` and `SemanticNodeInputSchema` — one label, no parent inheritance, no second membership, and nothing about colour. `saidOfNode` carries it across by construction, and a stated node being the whole node means restating one without a group is how a group is cleared.
2. Meaning: `group` joins `COMPARED.node` in `compare.ts` and `MERGED.node` in `reconcile.ts`, so a group change is a changed node, reconciles field by field, propagates and adopts like a name or a responsibility.
3. Presentation: one new `lib/group-palette.ts` holding the curated pairs as an editable list of `{ light, dark }` and nothing else, plus a separate deterministic mapping from a normalized label to one pair. Collisions are accepted and documented.
4. Drawing: the kind still decides the glyph's shape; the resolved colour decides the glyph's ink, the chip's thin border and its faded background. A node with no group resolves its colour from its kind through the same mapping, so every icon is coloured one way or the other and no card, card border or line takes a group colour.
5. The inspector says which group a node is in, beside its kind.
6. Owners: a runtime owner for the same label drawing the same pair in both themes and across boards; a store owner for author, read, clear and persist; a compare owner for the field being meaning and for the palette not entering a comparison.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What changed

**One optional label on a node.** `group` joins `SemanticNodeSchema` and `SemanticNodeInputSchema` through a new `GroupLabelSchema` (trimmed, one line, 60 characters). One per node, never inherited from a parent, and nothing about colour. It needed no machinery: `saidOfNode` carries every field of a stated node across by construction, and a stated node is the whole node, so restating one without a group is how a group is cleared — no registry, no group ids, no sentinel.

**It is meaning, so it behaves like meaning.** `group` is in `COMPARED.node` and `MERGED.node`, so moving a part between efforts is a changed node with `group` named among the fields that moved, it merges field by field when a predecessor moves, and it propagates and adopts like a name.

**The colour is derived and stored nowhere.** Two files, deliberately separate: `lib/group-palette.ts` holds ten light/dark pairs and nothing else — the one file to edit to retune them — and `lib/group-colour.ts` maps a normalized label onto one of them with a four-line FNV-1a hash. No registry is needed because the label is the whole input: the same label is the same colour on every board, in every variant, in both grounds and in every process. Collisions are accepted and the reasoning is written down: a scheme that avoided them would have to know every label on the board, and then a part would change colour when something unrelated to it was renamed. Ten pairs rather than eight because eight collided on four ordinary labels.

**What the colour touches.** The kind still decides the glyph's silhouette; the resolved colour decides the glyph's ink, the hairline around its tile and that tile's 14% wash. A node with no group resolves its colour from its kind through the same mapping, so every icon is coloured one way or the other and a board that groups nothing is not a page of grey chips. Cards, card borders and lines take none of it — a card border already says how the node stands, and a line already says what sort of relationship it is.

**Words as well as colour.** The inspector says "Part of <group>" under the id, because a colour is not a name: a reader can see that two cards are one family and still not know what the family is called, and two families can land on one hue.

## Verification

- `src/runtime/semantic-renderer/tests/grouping.test.ts` (new owner, 8 tests): two parts of one group share an ink and a third does not; the two keep their own silhouettes; a part with no group is coloured by its kind and the same kind is the same colour on another board; stating a group overrides the kind; spelling, padding, case and neighbours do not change a label's colour; both grounds get their own; no card, card border or line ever carries a group ink; grouping moves nothing on the page.
- `src/runtime/semantic-board-store/tests/grouping.test.ts` (new owner, 4 tests): written and read back off disk; a group crossing containment with no inheritance; cleared by restating the node; and moving a part between groups reported as a changed node with `group` among the moved fields. Nothing in these mentions a colour, which is what makes the palette safe to edit.
- CLI round trip against an isolated temp vault on port 3212: `semantic new` with `group` on two nodes → applied; `semantic show` prints both groups; restating one node without its group → `semantic show` has one group left. Vault and state directory removed afterwards.
- Agent-facing docs: the group is described in `skills/archboard/references/semantic-boards.md` and `references/cheatsheet.md`, and `bun scripts/sync-skills.ts` re-derived both skill trees.
- Regenerated `docs/design/generated/command-contract-proof.{json,md}` (`bun scripts/generate-cli-contract.ts`) and updated the two hash pins in `tests/system/cli/command-contract-artifacts.test.ts`: the CLI contract embeds the node input schema, so a new field on it is a real change to the published contract.
- `src/shared/semantic-board/lib/reconcile.ts` outgrew the 600-line limit once `group` joined its field list, so the reconciliation's document contract moved to `lib/reconcile-standing.ts` — what a reconciliation IS, apart from how one is worked out.

## Review round one

**The schema version now says what the document is.** `SEMANTIC_BOARD_SCHEMA_VERSION` is `1.1.0`: one optional field added, so the change is additive and every `1.0.0` board on disk is still read exactly as it was — the reader has always been major-only and nothing migrates a file nobody is writing to. What was missing is that an accepted write now stamps the current version, in the one place a write advances the board, so a document that carries a group no longer claims a contract that had no word for one.

Owned by a store test that writes a real `1.0.0` file into its own temp vault: reading it leaves the bytes and the version alone, and a write to it comes back stamped `1.1.0` with the group on the node.

**The domain language has the term.** `CONTEXT.md` gains **Group** beside Containment and Presentation intent: one optional short label, independent of containment and kind, never inherited, at most one per node, with the colour owned by the renderer and stored nowhere. _Avoid_: tag, category, layer, swimlane, colour.

**The store owners now cover the merge, not only the write.** Four more, all against the real store on an isolated vault:
- a group change on the architecture propagating into a draft that never mentioned that part (it follows, and holds no disagreement);
- both sides moving one part to different groups — held as a `group` issue naming both answers, with the draft keeping its own while the argument stands;
- settling that issue for the predecessor's answer, then clearing the group afterwards by restating the node without it;
- adopting a proposal and finding its grouping is now what the architecture says.

That is the `MERGED.node` regression the reviewer asked for, and it is what makes the claimed criterion evidenced rather than asserted.

## Reviews and visual QA closed

Schema and domain review closed after the version bump, the CONTEXT.md term and the four merge owners. Visible QA confirmed the group colours on both grounds, including the Writer card showing its group ink beside its change border and its warning badge without any of the three being mistaken for another.

## Where the palette is configured

`src/runtime/semantic-renderer/lib/group-palette.ts` — ten `{ light, dark }` pairs in one list, each commented with the family it is. Editing, reordering, adding or removing a pair changes what pictures look like and nothing about what any board says: no board stores a colour, no comparison can see one, and `src/runtime/semantic-renderer/lib/group-colour.ts` beside it — deliberately a second file — is the only thing that decides which pair a label lands on.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A node may say what it is part of: one optional `group` label, independent of containment and of kind, with no inheritance and no second membership. It is meaning — it persists, compares, merges, propagates and adopts like any other field, and is cleared by restating the node without it — while the colour it is drawn in is derived and stored nowhere. Ten editable light/dark pairs live in one named palette module and a separate four-line hash maps a normalized label onto one of them, so the same label is the same colour on every board and in both themes, collisions accepted. The kind decides the icon's shape and the group decides its ink, its tile's hairline and that tile's wash; cards, borders and lines take no group colour, and the inspector names the group in words. Verified by a renderer owner, a store owner, a CLI round trip on an isolated vault, and the regenerated CLI contract proof.

Reviewed once and closed. The review added three things: `SEMANTIC_BOARD_SCHEMA_VERSION` advanced to 1.1.0 with every accepted write stamping it and reading left untouched, so a 1.0.0 board is still read as it stands; **Group** as a canonical term in CONTEXT.md; and four store owners over the real merge — clean propagation into an untouched draft, competing groups held with both answers, settling for the predecessor then clearing the field, and adoption carrying the grouping into the architecture.
<!-- SECTION:FINAL_SUMMARY:END -->
