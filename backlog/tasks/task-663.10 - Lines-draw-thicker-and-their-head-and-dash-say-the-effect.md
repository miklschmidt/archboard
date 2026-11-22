---
id: TASK-663.10
title: Lines draw thicker, and their head and dash say the effect
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T14:12:00Z'
updated_date: '2026-11-22T16:09:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
At opening zoom, gray hairlines with hollow heads and fine dots could not be read (settled.md points 1, 8, 9, 10; owner: lines thicker in general, mixed rails of little value).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each effect's look comes from one table: mutation is solid with a solid wedge and an imprint on its target, query solid with an eye and a ring at its caller, compute solid up to an = and a small point, declared-only broken and thinner with a detached chevron (owner's final decoration, settled.md)
- [x] #2 Every line draws thicker than before, and heads keep a minimum on-screen size
- [x] #3 The mixed-kinds rail line and its legend mark are retired
- [x] #4 The exported legend and the status line above an export use the same marks
- [x] #5 Packages and Painting at opening zoom in both themes are judged by screenshots in the PR
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One table (effect_look in crates/archboard-scene/src/paint/styles.rs) gives each effect its line type, body share, head, caller mark and imprint; the head comes from the effect, not the kind.
2. Marks (crates/archboard-scene/src/paint/heads.rs) are drawn in picture units at their own scale; the body stops short of them; the layout's straight approach comes from the longest mark.
3. The live painter grows marks about their hold to a small far-out floor, trims the body, draws the imprint faded with a glow, and plays an effect once on request (playEffects).
4. Lines draw at 2.4 and 3.6 units; the mixed-kinds rails are retired.
5. An export's lens status line stands above the picture; the export legend and the viewer marks draw each effect's sample from the table.
6. Judge on Packages and Painting at the opening zoom and at 100% in both themes; audit the site.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner redirected the decoration mid-task: decoration and heads became one data table, then the owner chose the final look (settled.md 'Decoration, final'): only declared-only is broken; heads are a wedge, an eye with a ring at the caller, an = with a point, and a detached chevron; the imprint is live-only glow, flat in exports. The wave and repeated-glyph machinery built for the redesign was removed once unused.
Sizes, by eye on Packages and Painting: lines 2.4 / 3.6; marks at 1.15 of their 16-unit square; far-out floor 5 px for a mark's square (no growth at the opening zoom and nearer); layout straight approach 12 -> 16 units so no head sits on a bend (owner's call).
Evidence: artifacts/t663-evidence/v2/final-*.png (opening zoom and 100%, both themes), final-sheet.png, site-*.png.
Checks: cargo test (workspace) green; clippy (native and wasm32, deny warnings) and cargo doc clean; vp format:check clean for my files; native and WebAssembly draw identical bytes (fixtures recaptured from stored requests).
Open: packages/renderer tests: 4 corpus failures. Lane spacing on Packages and Browser (track) also fails with the old line layering, so it comes from the vault's new sync/async lines (TASK-663.08/.12). 'a wide fan stays below its source' and 'Archboard (root) (track): trunks with unrelated pairs' come from the 16-unit approach and need a layout negotiation (renderer skill). tests/system/browser/drawn-glyphs.test.ts:174 fails tsc from commit a853fb8f21 (not this task). archboard check: EMBED_OUTDATED on docs/readme/architecture-*.svg; RELATIONSHIP_UNDRAWN Viewer marks -> Legend and export (effect_sample, by design) for the vault owner. Site: the shell mock's legend in site/src/components/window predates TASK-663.11's legend.
<!-- SECTION:NOTES:END -->
