---
id: TASK-009
title: Transparent shapes are only selectable by their stroke
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 15:22'
updated_date: '2026-08-19 18:20'
labels:
  - needs-triage
dependencies: []
ordinal: 9000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tapping the interior of an archboard node selects it
- [x] #2 Decision recorded: give nodes a background fill, or widen hit-testing, or accept stroke-only
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Measured baseline first (browser, this build): Excalidraw's shouldTestInside() is `!isTransparent(backgroundColor) || hasBoundTextElement(el) || ...`. So a transparent shape WITH a bound label already hit-tests inside; a transparent shape WITHOUT one does not. Verified both by clicking: unlabelled transparent rect -> 'Nothing is selected'; labelled transparent rect -> selected. The failing case is every unlabelled shape — which is exactly a hand-drawn box, and any node whose text is a free-standing element rather than a bound label.

Decision: give shapes a background fill, in three layers, rather than widening hit-testing (Excalidraw exposes no knob; only a fork would) or accepting stroke-only.

1. New src/core/appearance.ts — single source for the default fill and the kind->fill map, both drawn from the documented palette in src/core/design-guide.ts, no invented colours.
2. normalize.prepareElement(): rectangle/ellipse/diamond created without an explicit backgroundColor get the default fill (white #ffffff, palette's neutral, pairs with the default #1e1e1e stroke) + fillStyle solid. An explicit "transparent" is still honoured, so an agent can opt out.
3. promote.planPromotion(): a promoted shape whose background is still transparent gets its kind's pastel from the palette (service purple, queue orange, datastore cyan, gateway blue, external gray). Only when transparent — a colour a human chose is never overwritten. Demotion leaves appearance alone (reverting would re-break hit-testing).
4. frontend CanvasPane initialData.appState: currentItemBackgroundColor/currentItemFillStyle, so a box a human hand-draws is filled the moment it is drawn — this is what closes the chicken-and-egg, since you must tap a shape to select it before you can promote it.
5. describe: stop printing 'bg:' when it equals the default — the default is not information, and without this every plain element grows a colour on the agent's primary read path.
6. Docs: correct the 'things that will mislead you' bullet in skills/archboard-dev (it is right about transparency but omits the bound-label exception), note the default fill in skills/excalidraw-skill, sync skills.

Verify in the browser: agent-created node interior click, hand-drawn box interior click then promote, plus describe / promote / export round-trip and bun run test + type-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What the bug actually is

Read Excalidraw's collision code before choosing a fix. `shouldTestInside(element)` is:

    !isTransparent(element.backgroundColor) || hasBoundTextElement(element) || isIframeLikeElement(element) || isTextElement(element)

So the rule is narrower than 'transparent shapes are stroke-only': a transparent shape **with a bound label** already hit-tests inside; a transparent shape **without one** does not. Confirmed in the browser on the pre-change build — interior click on an unlabelled transparent rect: 'Nothing is selected on the board'; same click on a labelled one: selected.

That matters twice. It is why a probe built from a labelled box passes whether or not the fix works (worth knowing before the next false negative), and it says the failing population is every unlabelled shape — which is exactly a box a human hand-draws, and any node whose text is a free-standing element instead of a bound label.

## Decision: fill the shapes (AC #2)

Rejected **widen hit-testing**: Excalidraw exposes no knob for it. `shouldTestInside` is internal and the only lever is the element's own backgroundColor, so 'widening' means forking or patching the renderer — a permanent maintenance tax for a one-line-of-data problem.

Rejected **accept stroke-only**: the interaction archboard exists for starts with a tap landing on a box (TASK-004/005). A 2px border on a 75-inch touchscreen is not a target. Documenting the workaround would push the cost onto every future session.

Chose **give shapes a background**, in three layers, because one layer alone leaves a hole:

1. `src/core/appearance.ts` — one home for the defaults and the kind->fill map, both taken from the palette already in `src/core/design-guide.ts`. No invented colours.
2. `normalize.prepareElement()` — a rectangle/ellipse/diamond created without a stated `backgroundColor` gets `#ffffff` + `fillStyle: solid`. White is the palette's neutral and pairs with the default #1e1e1e stroke; on a light canvas it reads as 'just a box', and Excalidraw's dark theme inverts it to near-black, so the board looks the way it did and is only now tappable. Passing `"transparent"` explicitly still means transparent, so a see-through zone is one word away.
3. `frontend/CanvasPane` — `initialData.appState.currentItemBackgroundColor/currentItemFillStyle`. This is the layer that closes the chicken-and-egg: you have to tap a shape to select it before you can promote it, so fixing hand-drawn boxes only at promotion time would fix nothing. The colour is imported from `src/core/appearance.ts` rather than copied, because a hand-drawn box and an agent-drawn box have to match.
4. `promote.planPromotion()` — a promoted shape is repainted in its kind's pastel (service purple, queue orange, datastore cyan, gateway blue, external gray), which is the design guide's own stroke semantics read across to its fills. This does the hit-test repair for anything still transparent AND gives the board the signal that a node is not a scratch box. Applied only when nobody expressed a preference: transparent, or still wearing the neutral default. A colour a human chose is never overwritten. Demotion deliberately does **not** revert it — reverting to transparent would take the interior hit-test away again.
5. `describe` — stops printing `bg:` when the colour is the default. Without this every plain element grows a colour on the agent's primary read path; a colour someone chose still prints.

## What happens to shapes that already exist

- **Hand-drawn boxes: fully covered**, and verified. The appState default applies at the moment of drawing, so a box drawn in the browser arrives at the server already `#ffffff` / solid. No follow-up needed.
- **Agent-created shapes: covered** from the next `add` / `batch_create`.
- **Shapes that already exist on a board (drawn before this, or imported from a .excalidraw file): not retroactively repainted**, and that is on purpose — rewriting the appearance of everything on a note the moment it is opened is not a change the board's author asked for. They stay stroke-only until they are promoted, at which point promotion fills them. Until then they are reachable by tapping the border or by rubber-band selection. Given promotion is the gesture that makes an old shape matter, this is thought to be adequate rather than a known hole; if it turns out to bite, the fix is a deliberate repair command, not an on-open rewrite.
- **Shapes with a colour someone chose: untouched** by both layers.

## Side effects worth knowing

A filled shape hides what is under it, where a transparent one did not — so background zones must be drawn before the shapes inside them. Documented in the skill. A solid fill also disables Excalidraw's arrow-binding fallthrough (`isBindingFallthroughEnabled` = `fillStyle !== 'solid' || isTransparent(bg)`), i.e. an arrow now binds to the shape it lands on rather than one behind it — which is the behaviour you want on an architecture board.

## Docs

CLAUDE.md (new 'shapes are filled by default' section under verified behaviour; removed the gap entry), `skills/archboard-dev` (the misleading-things bullet now states the bound-label exception, which is what cost the three false-negative verification attempts), `skills/excalidraw-skill` + cheatsheet (default fill, the opt-out, zone ordering, kind colours on promote), `design-guide.ts` (the guide the MCP `read_diagram_guide` tool serves). Skills synced.

## Verification (browser attached, final build, ARCHBOARD_VAULT set)

Baseline, before the change — the two probes that define the bug:

    interior click, unlabelled transparent rect -> 'Nothing is selected on the board.'
    interior click, labelled transparent rect   -> '1 element selected ... "Labelled transparent"'

After, on a fresh server and a fresh page:

    # agent-created node, unlabelled, interior click (was the failing case)
    $ ./bin/canvas selection --text
    1 element selected: 1 node (datastore(1)) — "Sessions".
      <sessions> "Sessions" | element mt0ev1aj8yd3hgtj8f7 | unbound | at (100, 300) | size 300x120 | rectangle

    # agent-created node, labelled, interior click away from the label
    1 element selected: 1 node (service(1)) — "AuthService".
      <authservice> "AuthService" | element ... | bound github.com/miklschmidt/archboard:src/core/appearance.ts@main

    # box hand-drawn in the browser: arrives already filled
    smeQEnxVBR5fRq5BQEaSJ | bg #ffffff | fillStyle solid | source frontend_sync
    # interior click on it -> selected, then promoted from that selection
    1 element selected: 1 plain element (rectangle(1)).
      [smeQEnxVBR5fRq5BQEaSJ] rectangle | at (635, 373) | size 276x127 | from board
    $ ./bin/canvas promote --kind gateway --name "Edge proxy" --text
    Promoted 1 element to the gateway "Edge proxy" (node edge-proxy), unbound.
    # and it turned gateway blue: bg #a5d8ff

Fill policy, three shapes promoted in one board:

    AuthService        | bg #eebefa | fill solid | service    (was the neutral default -> repainted)
    Legacy transparent | bg #99e9f2 | fill solid | datastore  (was transparent -> repainted, hit-test repaired)
    Chosen colour      | bg #ffd8a8 | fill unset | queue      (colour was chosen -> untouched)

Existing flows unbroken:

- `describe`: reads as 3 nodes with kinds, bindings and 'from board'; says nothing about the default fill, still prints `bg: #b2f2bb` for a plain element someone coloured.
- `promote` / `demote`: both still work; after demote the element keeps `bg #99e9f2` and `customData` is `{}` — metadata stripped, tappability kept.
- Export round-trip: `export -> import --replace -> export` is byte-identical, 19 elements in one run and 5 in another; every backgroundColor/fillStyle survives.
- `bun run test`: 5 MCP stdio wire checks, local-bind check, 108 obsidian-md checks — all pass.
- `bun run type-check`: clean (server and frontend).

Canvas cleared and the browser tab closed afterwards.

One thing seen and left alone: a labelled shape that has been through the browser exports two bound text elements (the frontend-synced one plus the `<id>-label` that expand-elements synthesises from the still-present `label` field). Pre-existing, unrelated to fills, not touched here.

Orchestrator verification, and the agent's narrower diagnosis is correct — mine was wrong. Measured all three cases by interior click in Chrome: labelled + transparent SELECTS (Excalidraw's hasBoundTextElement already makes it hit-test inside), unlabelled + transparent does NOT, and a hand-drawn box now arrives #ffffff/solid and selects from an interior click, reported as a plain element from the board. So the failing population was only unlabelled shapes, not all hollow ones as I had stated twice. My earlier false negatives were a mis-estimated click coordinate, not the behaviour I attributed them to. Docs now carry the accurate rule. bun run test (5 stdio + bind + 108 obsidian-md) and type-check green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shapes get a #ffffff solid fill by default in four layers: normalization for agent-created shapes, the frontend's current-item defaults so hand-drawn boxes are tappable before anyone can promote them, promotion repainting a node in its kind's pastel unless a colour was chosen, and describe staying quiet about the default. Explicit transparent is still honoured and existing boards are not retroactively repainted. Verified by interior click across labelled-transparent, unlabelled-transparent and hand-drawn cases.
<!-- SECTION:FINAL_SUMMARY:END -->
