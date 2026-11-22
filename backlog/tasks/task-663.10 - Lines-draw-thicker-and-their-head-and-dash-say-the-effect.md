---
id: TASK-663.10
title: Lines draw thicker, and their head and dash say the effect
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T14:12:00Z'
updated_date: '2026-11-22T20:54:00Z'
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

Owner round 2 (after final-sheet.png): heads larger but not ballooned. Marks at 1.5 units per square unit (wedge 15x15 on a 2.4 line); '=' bars 8.4 apart, 13 across, reach 21; imprint 9 reach, 2.6 thick; ring 4.2; far-out floor 8 px square so the '=' stays open at Painting's opening zoom (~0.28); straight approach 30 (owner: 'a bit longer' than 23); a line with no bend needs 23; compaction keeps columns while parting gains less than APPROACH+LANE. Evidence: artifacts/t663-evidence/v2/final2-*.png, final2-sheet.png. Owner: a relationship ending on a container is not allowed (RELATIONSHIP_ON_CONTAINER), so the renderer test for its header arrival goes. Vault: part 'Legend symbols' with Viewer marks and Export legend drawing from it (RELATIONSHIP_UNDRAWN warning gone).

Round 2 results. Layout: a line with no bend needs only 23 (STRAIGHT_RUN); compaction keeps columns while parting gains less than APPROACH+LANE; Blocks labels keep 24 apart; a lone end may land under its turn; a door widens until its heads stand a lane apart; channel tracks pack a lane apart; when Blocks takes the retained placement it draws no line words (owner). Track-only fixes reverted: Track is being deleted lower in the stack (TASK-672), and its fallback router stays as an engine option; the Track 'Archboard (root)' wide-pictures case still fails and goes with Track. Removed the renderer test of a line ending on a container (owner: RELATIONSHIP_ON_CONTAINER is not allowed). Legend sample box 30 -> 36 units so a query's ring and eye keep a line. Vault: parts 'Legend symbols' and 'Archive record format' (the latter fixes ANCHOR_SYMBOL_MISSING left by TASK-670). Redrawn: README architecture/sequence/shop SVGs, banner, social card, site diagrams; site mock legend now matches the shell (no left-out rows: the shop's default lens leaves nothing out). Checks: archboard check only the 3 known MODULE_SHALLOW; types, lint:all, format:check pass; cargo test, clippy -D warnings pass; renderer 848 pass, 1 Track fail; model 615 pass; browser legend, filters, surface, modes pass. README clips and narrated videos are stale and need attaching (not done).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Lines draw 2.4 and 3.6 units thick, and their ends say the effect from one table: a wedge with an imprint for a mutation, an eye with a caller's ring for a query, an '=' with a point for a compute, and a broken body with a detached chevron for a declared-only dependency. After owner review the marks draw 1.5 units per square unit (wedge 15x15), a mark keeps an 8 px square far out so the '=' reads at a large picture's opening zoom, and a line runs straight 30 units before its head. The layout negotiates the new room (a straight line needs only its marks, columns hold, doors widen for their heads, lanes pack), and Blocks' retained placement draws no line words. Evidence: artifacts/t663-evidence/v2/final2-*.png, final2-sheet.png; artifacts/t663-10-layout and t663-10-fallback. Risk: the Track wide-pictures 'Archboard (root)' case fails until Track is deleted (TASK-672); README clips and narrated videos are stale.
<!-- SECTION:FINAL_SUMMARY:END -->
