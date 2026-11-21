---
id: TASK-653.23
title: >-
  Second-look fixes: the store refuses a stray vault, two shape keys go, and the
  handover test reads the drawn frames
status: Done
assignee: []
created_date: '2026-11-21T02:14:00Z'
updated_date: '2026-11-21T02:48:00Z'
labels: []
dependencies: []
parent_task_id: TASK-653
ordinal: 1139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
At high effort, both advisors re-judged the decisions made at lower effort (artifacts/archboard-deepen/20261119T144122Z/second-look-*.md, decisions.md "Second look round 2"). Three fixes are settled; the store fold width question goes to the owner and is only documented here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A direct store call refuses an intent that names a vault, as base f58e0462e0 did: requireRequest (packages/model-store/src/runtime/store/documents.ts) throws a ZodError with the strict schema unrecognized-key issue when parseModelRequest returns a vault; HTTP routes still accept the envelope; a test shows the same initialization fields with vault pass route parsing and fail a direct store call before any write; save-plan keeps MAPPING_INVALID
- [x] #2 modelShape no longer has the keys paletteColor and pictureReceipt; PictureReceiptShape and parseDocument("paletteColor") stay; the palette-contrast and door-button tests read the colours through one test helper that reads the enum from describeModelSchema("vault-config"), types each through parseDocument("paletteColor") and throws on an empty list; model-contract ceiling does not rise
- [x] #3 The handover opacity test in crates/archboard-paint compares the outer group opacity of departing at the handover moment with the card of entrance.at(0.0), and no longer calls visible_at
- [x] #4 ADR 0086 says that model-store width 20 rests on two keyed folds (claims and publication) whose honest width is 24, pending the owner
- [x] #5 All lanes pass, cargo test and clippy pass, archboard check exits 0 and the render corpus is byte-identical
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A: requireRequest throws the strict schema's unrecognized-key ZodError when parseModelRequest returns a vault; tests for initialize and claim. 2. B: delete modelShape keys paletteColor and pictureReceipt; one renderer test helper (paletteColours) reads the enum from describeModelSchema("vault-config") through parseDocument("paletteColor"). 3. C: the handover opacity test compares entrance.at(0.0) with the opacity of the group departing draws. 4. E: one paragraph in ADR 0086. 5. Run every lane, cargo test, clippy, archboard check and the render corpus.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A: packages/model-store/src/runtime/store/documents.ts. initialize.test.ts shows the same fields with a vault pass parseModelRequest("initialize") (route parsing) and make installArchitectureModel reject with the exact issues modelShape("initializationRequest") (the base's strict schema) gives, the vault left empty; structure.test.ts shows a direct claim with a vault rejected with no claim written. Both tests fail with the fix reverted. save-plan.ts still calls parseModelRequest itself and keeps MAPPING_INVALID; routes pass parsed.data without the vault, unchanged.

B: shapes.ts loses both keys and their imports; PictureReceiptShape (raster-receipt.ts) and parseDocument("paletteColor") stay. paletteColours() in packages/renderer/tests/runtime/support/model-documents.ts reads 17 colours and throws on none; palette-contrast and door-button use it. Interface-width ceilings unchanged (model-contract 95).

C: crates/archboard-paint/src/between/entrance_order.rs compares solid(flying) with the outer group opacity of departing(last.body, size, gone); visible_at is no longer imported there. E: ADR 0086 paragraph after the widths line.

Also: cargo fmt of pre-existing format:core failures from the base (edge_tab.rs, typed_scene.rs, painting lib.rs, layout lone.rs), whitespace only. Lanes: frontend, types, lint:all, format:check, format:core, test:modules, test:repository, test:system, test:solo, test:serial-browser all exit 0; cargo test --workspace 516 passed; cargo clippy (host and the wasm32 lint:core form) clean; bin/archboard check exit 0 with information findings only; render-corpus compare base vs head: 0 of 1116 drawings differ.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A direct store call now refuses an intent that names a vault with the strict schema's unrecognized-key ZodError, as the base did, while routes still read the envelope. The modelShape keys paletteColor and pictureReceipt are gone; two renderer tests read every colour through one helper over the vault-config schema. The handover test compares the drawn departing frame with the entrance's first frame. ADR 0086 records that model-store width 20 rests on two keyed folds (honest 24), pending the owner. All lanes, cargo test, clippy and archboard check pass; the render corpus is byte-identical. Not done by design: the folds stay folded and the history-query test is untouched (point D).
<!-- SECTION:FINAL_SUMMARY:END -->
