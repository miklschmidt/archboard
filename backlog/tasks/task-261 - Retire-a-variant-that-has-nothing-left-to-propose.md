---
id: TASK-261
title: Shelve a variant that has nothing left to propose
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-17 22:29'
updated_date: '2026-09-17 23:03'
labels: []
dependencies: []
references:
  - docs/adr/0015-one-document-per-board.md
  - TASK-257
ordinal: 468000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A draft can outlive its proposal and there is no way to say so. `Canvas server` carries a draft named `Readable layout` that proposes nothing architectural — 14 of 14 nodes shared, 23 of 23 relationships byte-identical, one drill-down retargeted and one beat added — and `Semantic renderer`'s draft of the same name has converged on its parent, differing only by a reminted node id that compares as a deletion beside an addition. Neither can be adopted: adopting freezes the accurate current variant into history and promotes a variant that says the same thing. So both stay drafts forever, and every write to their parents pays for them — `propagate.ts:105` merges every parent edit into every draft, and only drafts, so a spent proposal keeps raising disagreements somebody must settle before anything on that line can be adopted.

THE DECISION, so this task is buildable rather than open-ended.

A variant gains a fourth lifecycle, `shelved`: a proposal nobody intends to carry out, kept under its name so the thinking is not lost. The word is free — `abandoned` is forbidden by CONTEXT.md's Historical entry, `superseded` is what a historical variant is, `spent` belongs to same-write handles, `dropped` is what a merge does to a subject, and `withdrawn` is an optimistic edit rolled back (ADR 0022).

Shelving is NOT deletion, and deletion is rejected: the two drafts are load-bearing for each other. Each names the other board's variant BY NAME in a drill-down, and a named drill-down has no fallback (`content.ts:72-80`) — deleting either would leave the other opening nothing, which the vault checker cannot see because it checks only the board name and level. Keeping the variant under its name leaves every link resolving, and the viewer discloses what it opens.

The shape:
- A fifth transition beside create, branch, edit, settle and adopt, reached by a CLI command that takes the reason the proposal was let go, with the board recording what was shelved, when and why — as adoption already records its own (`aggregate.ts:120-132`).
- A shelved variant stops following its predecessor, which is automatic: `inherits` and `above` (`propagate.ts:93-110`, `:186-192`) already gate on `draft`. Any standing it was holding is cleared as it goes — you do not have to settle a proposal to let it go, and `withoutStanding` (`propagate.ts:300-319`) already exists for that.
- Content edits and adoption are refused for the same reason history refuses them, with the same advice: branch from it if you want to propose it again (`transitions.ts:447-465`, `adopt.ts:59-82`).
- Shelving refuses the current variant, a historical variant, one already shelved, and a draft another draft still stands on — that last naming the descendants, since shelving it would strand them.
- Readers keep listing it under its lifecycle, as they already do for draft and historical (`SemanticVariantBar`, `NavigatorMarkers`, `SemanticDrillDown`'s disclosure).
- The vault checker treats it as it treats history, under TASK-259's rule that a content diagnostic runs where somebody can still act on it. Do that piece last and skip it if TASK-259 has not landed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A draft is shelved through the CLI with the reason it was let go, and the board records what was shelved, when and why
- [x] #2 A shelved variant no longer receives its predecessor's edits, and any standing it held is cleared as it is shelved
- [x] #3 Shelving refuses the current variant, a historical variant, one already shelved, and a draft another draft still stands on, each saying why and what to do instead
- [x] #4 A shelved variant keeps its name and content, a drill-down naming it still opens it, and adoption and content edits are refused pointing at branching from it
- [x] #5 A reader sees which variants are shelved wherever draft and historical are already distinguished
- [x] #6 CONTEXT.md carries the term and a decision record extends the lifecycle ADR 0023 governs
- [x] #7 The two spent drafts in the tracked vault are shelved with their reasons, and ./bin/dogfood check stays clean
- [x] #8 Tests own the transition, each refusal, and that a shelved variant is skipped by propagation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Vocabulary: add `shelved` to VariantLifecycleSchema (src/shared/semantic-board/lib/vocabulary.ts) and say what the word means beside current/draft/historical.
2. Record: add a ShelvingSchema beside AdoptionSchema in aggregate.ts (variant, at, reason) and an optional `shelvings` array on SemanticBoardSchema, exported from the module root.
3. Input: BoardShelveInputSchema in resolution.ts (variant, required reason).
4. Transition: new src/runtime/semantic-board-store/lib/shelve.ts holding the refusals and the record, and shelveVariantTransition in transitions.ts through the one write boundary; clear any standing with withoutStanding.
5. Refusals: new codes VARIANT_CURRENT, VARIANT_SHELVED, VARIANT_HAS_DRAFTS in outcome.ts. Shelving refuses the current variant, a historical one, one already shelved, and one a draft still stands on (naming the drafts). editableVariant refuses content edits on a shelved variant; adoptable refuses adopting one; both point at branching from it.
6. Propagation: verify (not assume) that `inherits` and `above` gating on draft already skips a shelved variant, and that its own descendants are not reached.
7. Wire: store index export, POST /api/semantic-boards/shelve route, client call, `archboard semantic shelve` CLI command with --variant and --reason, run.ts registration, docs/design/cli-command-audit.json entry and surface counts.
8. Readers: LIFECYCLE_WORDS (SemanticDrillDown), VARIANT_LABELS (NavigatorMarkers), semantic-inspect's hardcoded lifecycle union, skill-evaluation suite lifecycle enum.
9. Words: CONTEXT.md Shelved variant entry (and the Historical entry's _Avoid_ line), a new ADR extending ADR 0023.
10. Tests: module owner for the transition, each refusal by code, standing cleared, propagation skipping a shelved variant and not reaching what is under it.
11. Vault last: shelve Canvas server/Readable layout and Semantic renderer/Readable layout through the CLI with their reasons, then check both drill-downs still resolve and ./bin/dogfood check stays clean.
12. Checker criterion (AC7's diagnostics half) last, and only if TASK-259 has landed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built the fourth lifecycle as decided.

Contract (src/shared/semantic-board): `shelved` joins VariantLifecycleSchema (lib/vocabulary.ts); ShelvingSchema beside AdoptionSchema and an optional `shelvings` array on the board (lib/aggregate.ts); BoardShelveInputSchema with a REQUIRED reason (lib/resolution.ts) — required where adoption's is optional, because the board afterwards says which architecture is implemented but nothing says how a proposal ended.

Transition: new src/runtime/semantic-board-store/lib/shelve.ts (refusals, the record, and BRANCH_INSTEAD, the one sentence every shelved-variant refusal ends with); shelveVariantTransition in lib/transitions.ts through the same write boundary as the other four. The standing goes with it via the existing withoutStanding.

Refusal codes added to lib/outcome.ts: VARIANT_CURRENT, VARIANT_SHELVED, VARIANT_HAS_DRAFTS. Shelving refuses the current variant (VARIANT_CURRENT), a historical one (VARIANT_HISTORICAL), one already shelved (VARIANT_SHELVED) and one drafts still stand on (VARIANT_HAS_DRAFTS, naming them). A shelved variant refuses content edits (transitions.ts editableVariant) and adoption (adopt.ts adoptable), both VARIANT_SHELVED, both pointing at branching from it.

Propagation needed no change and was verified rather than assumed: `inherits` and `above` already gate on `draft`, so a shelved variant neither inherits nor is traversed through — the module owner proves an edit above it leaves it and a draft branched off it untouched, with an empty descendants report.

Wiring: POST /api/semantic-boards/shelve (semantic-board-writes.ts, semantic-board-routes.ts, the statedContent field union), shelveSemanticBoardOnCanvas, and `archboard semantic shelve <board> --variant --reason` registered in run.ts with its docs/design/cli-command-audit.json entry (surface now 39 subcommands / 72 paths).

Readers: LIFECYCLE_WORDS (SemanticDrillDown) and VARIANT_LABELS (NavigatorMarkers) are exhaustive Records, so the compiler required both; SemanticVariantBar already prints the lifecycle verbatim. Two hand-restated lifecycle unions now derive from the vocabulary instead (semantic-inspect.ts, skill-evaluation/lib/suite.ts).

Words: CONTEXT.md gains a Shelved variant entry with its _Avoid_ list, and the Variant, Historical variant and Reconciliation entries say where the fourth value sits. docs/adr/0030-a-proposal-nobody-will-carry-out-is-shelved-not-deleted.md extends ADR 0023.

Deliberately not done: the schemaVersion was left at 2.2.0. The change is additive (an optional field, a new enum value) and there is no compatibility layer to serve; a bump would only churn the fixtures that hardcode the string.

Validation.

bun test --isolate --max-concurrency=1 src/runtime/semantic-board-store/tests — 156 pass, 0 fail, including the new src/runtime/semantic-board-store/tests/shelving.test.ts (10 cases: the transition and its record; propagation skipped and stopping there; the standing cleared; each of the four shelving refusals by code with the board unmoved; content edits and adoption refused and a branch off it accepted; nothing else on the board touched; and the vault checker no longer asking a shelved variant to repair its content).
bun test tests/system/semantic-boards/lifecycle.test.ts — 7 pass: the CLI/route/store path end to end, board let go through `archboard semantic shelve` and the record read back.
bun test --isolate src/ui/semantic-board-canvas/tests — 137 pass, including a new case in semantic-board-levels.test.ts: a link into a shelved variant discloses data-variant-lifecycle="shelved" before it opens and the variant bar lists it under its lifecycle after.
bun test --isolate src/server/canvas/tests (129), src/ui/shell + src/ui/application (163), tests/system/cli (16) — all pass.
bunx tsc --noEmit on both projects, bun run lint and oxfmt --check — all clean.

The tracked vault, through the CLI against a restarted canvas:
- Canvas server v7 -> v8, "Readable layout" (nkFJIEAH) shelved, reason recorded.
- Semantic renderer v12 -> v13, "Readable layout" (IV2KX3GX) shelved, reason recorded.
Both keep their ids, names, and all content (14 nodes / 23 edges / 2 walkthroughs and 15 nodes / 22 edges / 1 flow respectively), and neither holds a standing.
Both named drill-downs still open: resolveDrillDown (the viewer's own resolver) answers ready with the shelved variant in each direction, and `semantic render --variant "Readable layout"` draws both against their current parent.
./bin/dogfood check reports 0 diagnostics.
<!-- SECTION:NOTES:END -->
