---
id: TASK-663.02
title: A line's color says its kind and its line type says its effect
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T05:35:00Z'
labels: []
dependencies:
  - TASK-663.01
parent_task_id: TASK-663
ordinal: 1146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The drawing side of TASK-663. Every kind but call keeps its theme-paired ink; mutation draws solid, query dashed, compute dotted; a dependency without an effect has its own pattern; one filled arrowhead on every line, for direction only; a colored line's label carries the kind's name; several relationships drawn as one line wear the strongest effect (mutation over query over compute); a comparison keeps its standing colors and the dash still says the effect; a reading from before the upgrade keeps its recorded look. The legend has the kind switches and a read-only effect key. Respect DESIGN.md and both themes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each effect draws its line type in both renderers (native and WebAssembly paint the same) and in both themes
- [x] #2 A joined line wears the strongest effect of its relationships
- [x] #3 A comparison keeps standing colors and effect dashes
- [x] #4 The legend shows the kinds drawn and an effect key
- [ ] #5 Screenshots of a wide scope in both themes are inspected and attached to the pull request
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model: a joined line carries the strongest effect of its relationships (mutation > query > compute > none); the render request edge carries effect.
2. Core request: a kind's dash is optional; a policy whose kinds record a dash is an old reading and keeps its recorded dash and arrowhead. Otherwise the effect sets the dash (solid, dashed, dotted), a dependency without an effect draws its own dash-dot pattern, and every head is filled.
3. Line appearance: the double rail of mixed kinds leaves the dash enum, so a mixed line wears the strongest effect's dash on its rails; the appearance names the effect for the legend.
4. Layout: lines share a trunk only when kind and effect agree (effect joins the trunk key and held treatment).
5. Labels: a colored line's label starts with its kind's name (current format only).
6. Legend: kind rows sample each kind solid in its ink (old readings keep their recorded sample); a read-only effect key lists the effects the reading holds, in the export legend and the browser legend.
7. Comparison keeps standing inks over the line; the dash still says the effect (test).
8. Tests across the module interfaces; screenshots of a wide scope in both themes from a scratch new-format copy of this vault; DESIGN.md line and legend paragraphs.

9. Inks (added): every built-in kind but call gets its own ink (event violet, queue amber, dependency indigo, other lime), per settled-effect point 2.
10. Crossings: two rails never rise over a single solid line, which keeps old readings byte-exact in their routes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1: packages/renderer/tests/runtime/architecture/operations/effects.test.ts draws solid/dashed/dotted/declared with filled heads on light and dark grounds. crates/archboard-render/tests/native.rs holds a new current-format fixture (fixtures/effects.json, captured from the WebAssembly core by capture-native-fixture.ts effects) to the native build's bytes, beside the old-format one.
- AC2: packages/model/tests/shared/rules/scope.test.ts 'a joined line wears the strongest effect'; native.rs 'a line of several kinds draws both rails in its strongest effect's dash' (the SVG writer now writes a rail's dash).
- AC3: effects.test.ts 'a compared line wears its standing's ink, and its dash still says its effect'.
- AC4: effects.test.ts legend test (kinds solid, then Mutation, Query, Compute, Declared only); browser legend in canonical-model-legend.test.ts and screenshots.
- AC5: artifacts/t663-02/overview-{light,dark}.png (export with legend, root of a scratch current-format copy of this vault with guessed effects), browser-{light,dark}.png, legend-dark.png, lines-light.png. Inspected; to attach when the PR opens.
Decisions: a dependency stating no effect draws a dash and a dot (Astra's 'Declared only'), so settled point 6's 'own pattern' differs from compute. The kind name and a middle dot start a coloured line's label ('HTTP · save'); a coloured line with no label of its own gets a plate with its kind's name. Old readings (a policy that records dashes) keep recorded dash, head and labels; only the mixed line's SVG attribute spelling changed, so the readme embeds were redrawn (attributes and recipe digests only).
Open for the owner: arrowhead stays required in the kind policy (settled point 2 says only dash leaves it) but a current-format reading draws every head filled, so the field is read only by old readings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A line's colour says its kind and its dash says its effect. The core draws mutation solid, query dashed, compute dotted and a dependency without an effect as a dash and a dot, every head filled; a joined line wears its strongest effect, a line of several kinds draws two rails in that dash, lines share a trunk only when kind and effect agree, a coloured line's label names its kind, and a comparison keeps its standing inks with the effect's dash. Old readings keep their recorded look. The export legend and the browser legend key each kind solid and add a read-only effect key generated from the core; a line's tip names its effect. Every built-in kind but call has its own ink. DESIGN.md describes it. All gates pass; check:model reports only the expected old-format, anchor and shallow warnings. Risk: the arrowhead field in the kind policy is now read only by old readings.
<!-- SECTION:FINAL_SUMMARY:END -->
