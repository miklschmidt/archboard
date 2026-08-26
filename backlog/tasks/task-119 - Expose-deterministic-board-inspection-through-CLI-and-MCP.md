---
id: TASK-119
title: Expose deterministic board inspection through the CLI
status: To Do
assignee: []
created_date: '2026-08-25 17:17'
updated_date: '2026-08-26 01:26'
labels:
  - ready-for-agent
dependencies:
  - TASK-123.01
references:
  - src/core/geometry.ts
  - src/core/labels.ts
  - src/core/compare.ts
  - src/core/metadata.ts
  - src/core/apply-element-input.ts
  - src/core/board-io.ts
  - scripts/check-geometry.mjs
  - scripts/check-labels.mjs
  - tasks/task-090
  - tasks/task-123.01
  - tasks/task-123.03
priority: high
type: feature
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard can currently prove that a board is structurally renderable and can compare selected semantic layout, but it cannot answer the completion question agents actually need: does this board still contain route-through-node errors, accidental connector crossings, overlaps, stale linear geometry, broken references, label drift, or policy violations? The relevant knowledge is split across geometry, labels, comparison, metadata, and browser-only screenshots. This gap led the device-trust refinement work to rely on one-off parsers and full-board image inspection. A clean semantic compare could coexist with arrows passing through boxes, a local reroute could create a new crossing elsewhere, and a fit-to-board export could make small defects effectively invisible.

Add a pure, shared inspection module as the single product interface for board quality. Expose it through a vault-direct archboard check --board <key> command that works without the canvas server or a browser. Return a schema-validated stable result with a code, severity, coverage state, involved element and node identities, scene coordinates, and a bounding box suitable for focused rendering. Keep inspection read-only: it must not claim, repair, rewrite, save, open, or otherwise mutate the board.

Reuse product geometry and semantic modeling rather than copying formulas into scripts. Semantic node identity remains exclusively keyed by customData.archboard.node; union elements carrying the same node ID and their bound labels when calculating node geometry. When inspection needs to treat an unpromoted grouped or library-stencil instance as one visual obstacle, model that separately and retain its constituent element IDs. groupIds never create or merge architectural nodes and never change semantic compare. Container boundaries are not routing obstacles, and a connector excludes its own endpoint nodes and containing zones from unrelated-node tests.

Normal board reads and every write retain strict render-geometry validation. Inspection gets a narrowly scoped decode path for parseable persisted notes so invalid element geometry can be reported as a finding instead of being rejected before inspection runs; note parse failures remain operational errors. Curves, rotation, ambiguous geometry, or other unsupported cases produce explicit unsupported or indeterminate findings rather than a false clean result. Coordinate any new Excalidraw geometry approximation with TASK-090 and use differential evidence where handwritten behavior could drift from upstream.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pure inspectBoard(elements, policy?)-style module returns a deterministic report without browser, filesystem, canvas, or mutation dependencies.
- [ ] #2 archboard check --board <key> is declared through CommandContract, reads the named persisted board directly, works without a running canvas server or browser, emits its schema-validated result plus an optional concise text mode, and performs no board write, claim, open, save, repair, or rewrite.
- [ ] #3 The command contract declares inspection inputs, stable result schema, prerequisites, read-only effect, text mode, strict refusal and exit semantics, examples, and all metadata required by generated help and the TASK-123.03 result reference.
- [ ] #4 A narrowly scoped inspection decode reports invalid render geometry, stale linear dimensions, broken bindings or references, bound-label corruption, configured font-policy violations, and unsupported geometry without weakening validation on normal reads or any write.
- [ ] #5 Layout findings cover unrelated leaf-node penetration, unmarked connector intersections, node overlap, and label overlap with stable element IDs, node IDs, coordinates, and bounding boxes.
- [ ] #6 Containment-aware modeling aggregates semantic nodes only from elements sharing customData.archboard.node, models grouped unpromoted stencil geometry separately as visual obstacles when needed, preserves groups containing several promoted nodes, excludes endpoint nodes and containing zones, and does not report a connector merely for crossing a container boundary.
- [ ] #7 Reports state whether coverage is complete or indeterminate. Strict mode has documented deterministic exit semantics by severity and never reports clean when a case was skipped, unsupported, or indeterminate.
- [ ] #8 Public-interface regression fixtures include a dense, human-grouped architecture board where semantic compare is clean and a locally improved route creates a second crossing elsewhere; a whole-board recheck catches the regression.
- [ ] #9 Tests cover negative relative points, stale dimensions, endpoint and zone exclusions, promoted multi-element nodes, grouped unpromoted stencil obstacles, groups containing multiple promoted nodes, tolerance boundaries, unsupported curves or rotation, stable report ordering, contract validation, and clean stdout and stderr separation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the inspection contract before adding detectors. Declare stable Zod schemas and inferred types for InspectionPolicy, InspectionReport, InspectionFinding, severity, finding code, coverage state, scene point, and bounding box through the TASK-123.01 CommandContract boundary. Specify deterministic sort order and strict-mode exit semantics. Keep one public pure inspector with small private helpers.
2. Extract the logical-node and containment construction from src/core/compare.ts into a shared architecture model without changing compare output. Aggregate semantic nodes only from elements sharing customData.archboard.node, together with their bound labels. Separately build obstacle aggregates for unpromoted grouped or library-stencil geometry where inspection needs one visual obstacle, retaining every constituent element ID. groupIds never create node identity and never change semantic compare. Characterize current containment thresholds, endpoint resolution, metadata precedence, and compare output before extraction.
3. Extend src/core/geometry.ts with narrowly scoped pure primitives for absolute polyline points, recomputed linear extents, segment and rectangle intersection, overlap, and tolerance handling. Reuse measureLinear, extentOf, remeasureLinear, label, and binding owners rather than creating second formulas or tolerances. Represent curves, rotation, and ambiguous geometry explicitly as unsupported or indeterminate. Coordinate Excalidraw behavior replicas and differential tests with TASK-090.
4. Implement the inspector as a pipeline over the shared model: structural integrity, stale dimensions, references and bindings, label and font policy, node and label overlap, unrelated-node penetration, connector intersection, and unsupported or indeterminate cases. Exclude each edge endpoint and containing zones, retain involved source element, group, and logical-node IDs, and compute a focused-render bounding box for every finding.
5. Add a narrowly scoped inspection-note loader that parses the persisted board without enforcing element render geometry, while leaving normal board reads and every write strict. Declare archboard check through CommandContract so it loads the explicitly named board directly from ARCHBOARD_VAULT without starting the canvas server or requiring a browser, returns the declared inspection result, and maps strict coverage and severity to declared exits. Prove with spies that inspection never claims, opens, saves, repairs, rewrites, or otherwise writes a board.
6. Add public-interface fixtures and focused unit cases for invalid geometry through the inspection loader, negative relative points, stale width and height, tolerance edges, promoted multi-element nodes, grouped unpromoted stencil obstacles, groups containing several promoted nodes, bound text, endpoint and zone exclusions, curves and rotation, deterministic ordering, contract result validation, and a whole-board regression where one local reroute creates a different crossing. Use production modules in test scripts rather than recoding inspection logic.
7. Register the CLI contract in the schema-driven surface. Supply complete metadata for generated help and the TASK-123.03 result reference rather than hand-writing another result table. Add the focused inspection suite to package.json and docs/agents/test-suite.md, then run type-check, the new suite, geometry, labels, compare, one-write, CLI contract coverage, and the complete sequential test chain.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-25 17:21
---
Planning pass completed from current source inspection. Implementation has not started; the task is deliberately returned to To Do and left unassigned.
---

author: @codex
created: 2026-08-25 23:47
---
Plan review incorporated the agreed inspection-only decode, vault-direct CLI, semantic-node versus obstacle distinction, and strict coverage contract. No implementation started.
---

author: @codex
created: 2026-08-25 23:59
---
CLI rewrite decision: this task now depends on TASK-123.01 and must add check through CommandContract, not the legacy raw-argv and printJson path.
---

created: 2026-08-26 01:26
---
TASK-124 reconciliation: inspection remains a CLI-only CommandContract. Acceptance criteria and implementation steps contain no equivalent secondary agent transport.
---
<!-- COMMENTS:END -->
