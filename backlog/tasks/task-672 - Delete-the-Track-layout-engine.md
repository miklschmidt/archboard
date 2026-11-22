---
id: TASK-672
title: Track is replaced by Lanes
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T18:55:00Z'
updated_date: '2026-11-22T22:59:00Z'
labels:
  - refactor
dependencies: []
ordinal: 1154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-11-22: "I really want to delete the track renderer, i am tired of agents spending time on it, it sucks so much and should never be used." Blocks has been the default since ADR 0064; Track stayed behind --layout track, and agents kept spending time keeping its readings and corpus tests green.

Owner, later the same day, on seeing the placement Blocks falls back to when its planner refuses a reading (orthogonal bus routing, long parallel runs between rows of cards, lines landing in bundles): "i would actually like this as an engine rendering option. Instead of tracks." So Track is deleted and replaced by Lanes: that fallback placement with lane routing, always on. Blocks stays the default.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No Track layout code remains in crates/ or packages/; the engines are Blocks (default) and Lanes
- [x] #2 Lanes always takes the lanes' placement, never the planner or the split across workers; Blocks drawings are unchanged
- [x] #3 --layout on render and rasterize, the settings dialog and recipes offer or record blocks and lanes; a saved track reads as Lanes
- [x] #4 Tests that ran both engines run Blocks and Lanes or Blocks only; Track-only tests are deleted; no Blocks check is weakened
- [x] #5 ADR 0096 records the replacement and amends ADR 0040 and 0064; docs, skills and the site name no Track engine
- [x] #6 types, lint, format, Rust and the renderer, model, CLI and browser tests pass, the site builds, and archboard check reports no new warning
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rust: delete Track's inline nesting and everything only it reached (peers, entry-point rows, sliding ports, inline clusters, the lane scene's frames and regions, paint-time hiding); rename src/track to src/lanes and its state to Router; prove Blocks byte-identical (corpus, native picture, fixtures incl. a fallback drawing).
2. Rust: Engine {Blocks, Lanes}; the request names it, a Lanes graph names lanes; Lanes skips the planner and the split; the memo keys on it; a test that Lanes never plans.
3. TypeScript: the engine schema with blocks and lanes, request fields, read and cache keys, the settings row and stored preference, recipes record the engine, --layout on render and rasterize; saved track maps to lanes; corpus engine axis.
4. Records: ADR 0096 Track is replaced by Lanes; amend ADR 0040 and 0064; docs, skills, site.
5. Verify: full gate, browser screenshots of settings, Packages and root rendered with both engines, site paint/build/walk, archboard check (throwaway clone if the shared history branch blocks it).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence (2026-11-22):
- AC1: git grep finds no Track engine in crates/ or packages/ (only the track->lanes mapping and its tests). Engine {Blocks, Lanes} in crates/archboard-layout/src/architecture/mod.rs; the router lives in src/lanes, its state is Router.
- AC2: blocks/place.rs: a graph naming lanes skips hybrid() and Across::of; tests/planned.rs lanes_takes_the_lanes_placement_where_blocks_plans. Blocks byte-identical to e28f5e3881 (scratch native builds: full picture, 6 planner fixtures and a fallback graph), and 542/542 corpus drawings unchanged across the cleanup commits.
- AC3: --layout blocks|lanes on render/rasterize (and record/replay); settings dialog row Layout engine (screenshots artifacts/remove-track/settings-*.png); recipes record the engine (tests/system model-render-context); saved track -> lanes via SavedLayoutEngineSchema (stored preference, v1 recipe, talk; no address carries an engine).
- AC4: 22 Track-only renderer test files and 40 fixtures deleted (each checked to name only track); doors.rs runs Blocks and Lanes; Lanes skips only the collinear-port integrity check, which it fails by design.
- AC5: ADR 0096 Track is replaced by Lanes; ADR 0040 and 0064 amended; docs/skills/site name no Track engine (historical records excepted: crates/vendor/README.md measurement, retained-checkpoint walkthrough).
- AC6: check:first (types, lint:all, format:check, format:core, bun-nix, test:core incl. Rust/clippy, test:repository) passed; test:modules 5207 pass, test:system 228, test:solo 15, test:serial-browser all pass; site paint+build+links pass and walked in a browser. check:model and archboard check are blocked in this checkout by the shared local archboard-history branch (records from the newer kinds-layer schema), so archboard check ran in a throwaway clone without that branch: 3 warnings, the same 3 the starting commit has (ui-kit EXPOSED_VALUE x2, Runtime control ANCHOR_MISMATCH). The repository model was edited in that clone and the vault diff applied here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Track is deleted and replaced by Lanes, Blocks' fallback placement with lane routing, always on; Blocks stays the default and draws byte-identically. The core names its engine on the render request and a Lanes graph skips the planner and the split across workers. The TypeScript side offers Blocks and Lanes in the settings dialog, --layout and recipes, and reads a saved track as Lanes. Against e28f5e3881: about 20,500 lines removed and 2,300 added across 292 files. Risk: the shared local archboard-history branch holds newer-schema records, so model reads, check:model and site paint fail in this checkout until the kinds-layer schema lands; clones without that branch, as in CI, are unaffected.
<!-- SECTION:FINAL_SUMMARY:END -->
