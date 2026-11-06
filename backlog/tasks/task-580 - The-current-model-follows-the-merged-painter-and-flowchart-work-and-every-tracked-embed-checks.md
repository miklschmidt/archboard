---
id: TASK-580
title: >-
  The current model follows the merged painter and flowchart work, and every
  tracked embed checks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T11:01:00Z'
updated_date: '2026-11-06T16:01:00Z'
labels:
  - model
dependencies: []
ordinal: 1022000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check reported 38 warnings on main. The painter (JTZvj2vi, w4XB6eBv, #42) and flowchart (vdbwhuzZ, #34) proposals were merged in code but never adopted, so the current model binds and anchors files and symbols that no longer exist. The site diagrams keep a render recipe that names the disposable example shop, which no check can resolve. The owner authorized adopting the three merged proposals on 2026-11-06. EXPOSED_UNUSED and the information-level RELATIONSHIP_UNDRAWN findings are out of scope: the second kind says a higher relationship stands for the call.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 JTZvj2vi and w4XB6eBv are adopted, vdbwhuzZ's changes are adopted through jRNHx2a1 and vdbwhuzZ is shelved, and archboard check code on current reports no BINDING_PATH_MISSING, ANCHOR_PATH_MISSING or ANCHOR_SYMBOL_MISSING except those that b2zJw510 (PR #46) resolves
- [x] #2 archboard check embeds reports no EMBED_OUTDATED and no EMBED_VAULT_FETCH_FAILED
- [x] #3 The three Eval script relationships carry anchors, so check reports no RELATIONSHIP_UNSUPPORTED
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Adopted JTZvj2vi, then w4XB6eBv. vdbwhuzZ followed the former current oyXXnyCV after that, and a forced adoption would have undone 62 painter changes, so the owner chose to carry it: jRNHx2a1 makes the same 6 changes on current (compare: identical change set) and is adopted; vdbwhuzZ is shelved with that reason.
Eval script: its three process calls moved by edit-relationship.source to CLI driver (archboard.ts) and Per-run server (server.ts), the parts whose code starts the CLI and the server; anchoring them on Eval script gave ANCHOR_MISMATCH.
Painting (m6HOX0lf) was bound to the same paint() symbol as its child Page painter; the container is now unbound. A directory binding drew in more callers and a TEST_IMPORT_UNEXPOSED warning.
Site diagrams: render-diagrams.sh drops the recipe, as the README kit does (scripts/readme-assets/svg.ts).
README architecture SVGs redrawn with check embeds --fix and cut with readme:assets architecture. readme:check lists the same 16 stale assets before and after, none of them architecture.
archboard check: 0 errors, 1 warning: RELATIONSHIP_UNDRAWN Painter core -> Page painter. A false positive: the only uses are test modules (between/interrupted.rs under #[cfg(test)] mod in between/mod.rs:30, and parts/tests.rs); the Rust adapter skips #[cfg(test)] items inside a file but not a file that a #[cfg(test)] mod declares. Fixed separately.
Information findings left by decision: RELATIONSHIP_UNDRAWN (151) says a higher relationship stands for the call; EXPOSED_UNUSED (33) is a code cleanup.

Review of PR 49 (CodeRabbit): criterion 1 now names the real outcome, vdbwhuzZ shelved and its changes adopted through jRNHx2a1. Four flow steps on current were corrected against the code: Draw a view letters the jumps in its own step (mod.rs add_jumps), the light reaches the stage through setLight and not attachStage, a replay waits for a starting painter inside each frame, and a picture brought in part by part enters the stage whether or not one leaves.
<!-- SECTION:NOTES:END -->
