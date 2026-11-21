---
id: TASK-653.23
title: >-
  Second-look fixes: the store refuses a stray vault, two shape keys go, and the
  handover test reads the drawn frames
status: To Do
assignee: []
created_date: '2026-11-21T02:14:00Z'
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
- [ ] #1 A direct store call refuses an intent that names a vault, as base f58e0462e0 did: requireRequest (packages/model-store/src/runtime/store/documents.ts) throws a ZodError with the strict schema unrecognized-key issue when parseModelRequest returns a vault; HTTP routes still accept the envelope; a test shows the same initialization fields with vault pass route parsing and fail a direct store call before any write; save-plan keeps MAPPING_INVALID
- [ ] #2 modelShape no longer has the keys paletteColor and pictureReceipt; PictureReceiptShape and parseDocument("paletteColor") stay; the palette-contrast and door-button tests read the colours through one test helper that reads the enum from describeModelSchema("vault-config"), types each through parseDocument("paletteColor") and throws on an empty list; model-contract ceiling does not rise
- [ ] #3 The handover opacity test in crates/archboard-paint compares the outer group opacity of departing at the handover moment with the card of entrance.at(0.0), and no longer calls visible_at
- [ ] #4 ADR 0086 says that model-store width 20 rests on two keyed folds (claims and publication) whose honest width is 24, pending the owner
- [ ] #5 All lanes pass, cargo test and clippy pass, archboard check exits 0 and the render corpus is byte-identical
<!-- AC:END -->
