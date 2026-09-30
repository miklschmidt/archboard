---
id: TASK-178
title: Present variant walkthroughs with scroll-driven diagram focus
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 02:34'
labels:
  - ready-for-agent
dependencies:
  - TASK-173
  - TASK-174
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 329000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Support leadership explanations with an authored narrative alongside polished diagram transitions, adapting the open renderer and atlas without assuming the hosted PR Lens viewer source exists.

## Blocked by

TASK-173, TASK-174

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An optional variant-owned walkthrough has ordered headings/body, target views and stable semantic focus identities with structural reference validation.
- [x] #2 A narrative rail synchronizes scroll/step navigation with the selected view and diagram focus; keyboard navigation and reduced-motion preferences work.
- [x] #3 Walkthrough-only changes do not become architectural node changes; invalidated targets are surfaced by commands with actionable guidance.
- [x] #4 A leadership presentation over both grammars demonstrates readable typography and deliberate focus transitions in the actual viewer.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Slice 1 of TASK-178 — the canonical narrative core (no viewer, no CLI, no renderer).

1. src/shared/semantic-board/lib/walkthrough.ts (new): Zod 4 canonical schemas for a walkthrough (id, name, optional summary, ordered beats) and a beat (id, heading, body, unordered subjects, optional view). Meaning only: no camera, duration, colour or scroll offset.
2. content.ts: VariantContent gains walkthroughs; emptyContent, SubjectKind and subjectsOf gain the walkthrough and beat kinds so the mint taken-set and the shared-identity rule see them; BEAT_SUBJECT_KINDS names the kinds a beat may be about.
3. integrity.ts: walkthroughIssues — two walkthroughs of one name, a walkthrough with no beats, a beat about a subject the variant has not got, a beat reading through a view it has not got.
4. input.ts: WalkthroughInput/BeatInput agent spellings (id may be left out and is minted; a subject or view may be named); VariantEditInput gains walkthroughs and removeWalkthroughs; BoardCreateInput gains walkthroughs.
5. compare.ts: walkthroughs and beats are compared, beats carrying walkthrough and position like PlacedStep, because TASK-175 reconciliation must detect a conflicting walkthrough order. Existing three rules intact; withRemoved leaves narrative alone.
6. src/runtime/semantic-board-store/lib/edit-walkthroughs.ts (new) wired through edit-content.ts: stated batch judged on the final candidate, removals resolve against what stood before, an unknown stated id refused not minted. New codes UNKNOWN_WALKTHROUGH, UNKNOWN_BEAT, UNKNOWN_SUBJECT, SUBJECT_IN_WALKTHROUGH in outcome.ts.
7. Tests: src/shared/semantic-board/tests/walkthroughs.test.ts (contract) and src/runtime/semantic-board-store/tests/walkthroughs.test.ts (write path), each rule mutation-checked.
8. Gate: bunx tsc --noEmit, bun run lint, bunx oxfmt --check, bun test --isolate on both modules.

Slice: the viewer half (src/ui/semantic-board-canvas + pane wiring). 1. camera.ts gains Rect/unionRect/fitRect so a fit can be to a region of the atlas rather than only to the whole drawing; fitCamera is re-expressed through fitRect (no second arithmetic). 2. use-board-camera's fit takes a FitTarget (whole | focus); use-auto-fit follows the same target, so the beat is what the pane keeps itself fitted to and a person's pan still wins within a beat. 3. subjects.ts markSelection becomes markSubjects over a set: the beat's subjects are marked with the halo vocabulary the selection already uses. 4. lib/narrative.ts: pure reading of which beat the rail's scroll is at, the beat's focus target, and which named subjects this view does not draw. 5. Walkthroughs come from the board document read the inspector already uses (the render reply carries views but not walkthroughs) via lib/board-document.ts. 6. hooks/use-walkthrough.ts holds the pane-local choice and current beat, reset when board or variant changes. 7. components/SemanticWalkthroughBar.tsx offers them beside the view bar and renders nothing when a variant states none; components/SemanticNarrative.tsx is the rail, mounted across a render load so a beat that names a view does not lose the reader's place. 8. Rendered owners in tests/semantic-board-narrative.test.tsx, each mutation-checked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: the walkthrough contract (ordered beats with heading, body, semantic subjects and an optional view, ids minted like any other subject and held to the one-namespace rule), its coherence rules, its place in comparison (beats compared with position, because TASK-175 has to detect competing order changes) and the batch write path with four refusal codes. In the viewer: a WALKTHROUGH group in the reading bar, absent when a variant explains itself in no way; a prose rail whose current beat is the last one past a reading line; the camera fitting the beat's subjects from the atlas with no geometry invented; the beat's own view asked of the server while it is being read; keyboard navigation on the beat headings rather than on the scrolling column; reduced motion honoured; and a plain line naming any subject the current reading does not draw.

Verified: 29 contract and store owners (13 mutation checks), 66 viewer owners, and AC#4 in the running app — the demo walkthrough moves from the architecture grammar to the sequence grammar at its last beat, the picture follows, the view bar follows, and the counter reads 6 of 6. Screenshot taken and read.

Review round (four findings, all in the viewer):

1. The rail's tail was a fixed pb-96, which is enough room at one pane height and not at another: with the workbench collapsed the rail was 812 tall with no scroll range at all, so the last beat sat at 322 against a reading line at 268 and could never be read. The tail is now measured — tailAfterLastBeat(height) = everything below the reading line, which is sufficient for any beat layout and nothing shorter is — applied as an inline style from a ResizeObserver on the scrollport. Confirmed in the browser with the workbench collapsed: clientHeight 801, tail 536.67px, scroll range 326 (was 0), last beat reaching the line exactly.

2. A layout-only resize moved the reader (beat 4 became beat 3): the browser clamps the scroll when the column changes height, and the rail was reading those scroll events as the reader moving through the beats. A resize now suppresses scroll-derived updates while it settles and puts the reader back — the beat they were on returns to the reading line — so a resize changes the layout and nothing else.

3. The picture did not mark what was in dispute. The subjects of waiting.issues are now marked on the diagram itself, not only listed beside it. Three states had to stay distinguishable: what the person picked out and what the beat they are reading is about share the renderer's solid selection ring (both mean 'the part under discussion', and the renderer draws that one way); a dispute lights the same ring dashed instead, because it is a fact about the board rather than something the reader is doing and has to be legible with nothing selected and no walkthrough open. Dashes are already this renderer's way of saying the board has something to say about a subject. A subject that is both keeps the solid ring: the reader's attention is the more immediate, and the standing block lists the dispute either way. Written as the halo's own style attribute, the one attribute the viewer ever writes on the picture, because the document's stylesheet puts halos out and an inline style is what beats it.

4. Drilling into a board hid that board's own reading controls. A drilled-into board now offers its own views and its own variants, built from the target's own document, with the reading reset at each level (no view, the variant the link named): the original reason for hiding them — a view id from the board above means nothing below — is answered by resetting rather than by hiding. hooks/use-level-reading.ts owns which reading is in force: the shell's for the pane's own board, the pane's own for a level nobody addressed. Deliberately not built: a deep link into a level, which is an address-contract change and belongs with the routing cutover.

Owners: four more rendered cases in tests/semantic-board-narrative.test.tsx and a new tests/semantic-board-levels.test.tsx (3). Mutation-checked: a constant tail, a resize read as scrolling, disputes unmarked, a dispute that looks like attention, the level below given the level above's reading, and the bars hidden a level down — each failing its own owner. 104 tests over src/ui/semantic-board-canvas and src/ui/application, tsc/lint/oxfmt clean.

UI recheck findings fixed after the fact: the uppercase WALKTHROUGH legend over the explanation bar is gone — the fieldset keeps its accessible name through a screen-reader-only legend, and no bar beside it carries a visible label, so one that did read as a heading for the whole strip.
<!-- SECTION:NOTES:END -->
