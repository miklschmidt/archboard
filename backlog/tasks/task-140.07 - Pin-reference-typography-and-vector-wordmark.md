---
id: TASK-140.07
title: Pin reference typography and vector wordmark
status: To Do
assignee: []
created_date: '2026-08-30 10:49'
labels: []
dependencies:
  - TASK-140.06
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: high
type: feature
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the approved operator-shell typography and compact lowercase archboard wordmark reproducible rather than dependent on an inferred machine-local font. A measured desktop audit selects redistributable UI and monospaced faces from evidence, pins their licensed frontend assets, defines the shared type contract, and replaces the live text wordmark with one themeable accessible SVG whose outlines have no runtime font dependency. The generated PNG contains no authoritative embedded font metadata, so closest-match geometry and overlay comparison against its tracked crop is the decision boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A cropped overlay and geometry audit compares current Inter, Inter Tight, Geist, and any stronger evidence-backed redistributable candidate plus a monospaced companion, records the PNG metadata limitation, and justifies the selected faces from glyph proportions, weights, tracking, and licensing provenance
- [ ] #2 The selected sans and mono fonts are pinned or bundled as licensed frontend assets with explicit family, supported-weight, tracking, and wordmark tokens, and a browser check proves the intended faces load without machine-local or network fallback
- [ ] #3 One repository-tracked SVG provides the compact lowercase archboard wordmark with no icon tile, derives clean outlines from the selected licensed face and measured optical adjustments, is themeable and accessible in both themes, and contains no font or unsafe runtime SVG dependency
- [ ] #4 The shell uses the canonical vector wordmark and representative header, navigator, inspector, and workbench typography consumes the shared contract without an unrelated component rewrite or renewed phone/narrow scope
- [ ] #5 The operator-shell design document records the reference crop, audit method, font source/version/license, selected sans and mono faces, wordmark construction and optical adjustments, while derived comparison renders remain ephemeral
- [ ] #6 Tightly cropped 1440x900 light and dark evidence verifies the wordmark, header text, navigator labels, inspector secondary text, and workbench text at the supported desktop viewport and Samsung Flip scale
- [ ] #7 Licensing/provenance checks, formatting, lint, both TypeScript projects, production build, repository inventory, affected browser owners, and the complete final validation chain pass without weakening existing gates
<!-- AC:END -->
