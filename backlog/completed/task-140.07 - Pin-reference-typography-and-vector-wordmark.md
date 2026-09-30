---
id: TASK-140.07
title: Pin reference typography and vector wordmark
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 10:49'
updated_date: '2026-08-30 14:27'
labels: []
dependencies:
  - TASK-140.06
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - bun.lock
  - docs/design/operator-canvas-shell.md
  - package.json
  - scripts/generate-wordmark.ts
  - src/ui/shell/BoardBar.tsx
  - src/ui/shell/assets/archboard-wordmark.svg
  - src/ui/shell/assets/fonts/DMMono-Medium-v1.000.ttf
  - src/ui/shell/assets/fonts/DMMono-Regular-v1.000.ttf
  - src/ui/shell/assets/fonts/OFL-DMMono-1.1.txt
  - src/ui/shell/assets/fonts/OFL-Onest-1.1.txt
  - src/ui/shell/assets/fonts/Onest-Medium-v1.000.ttf
  - src/ui/shell/assets/fonts/Onest-wght-v1.000.ttf
  - src/ui/shell/assets/fonts/README.md
  - src/ui/shell/shell.css
  - tests/system/browser/board-navigator.test.ts
  - tests/system/browser/claim-interaction.test.ts
  - tests/system/browser/fullscreen-presentation.test.ts
  - tests/system/browser/selection-inspector.test.ts
  - tests/system/browser/shell-layout.test.ts
  - tests/system/browser/support/shell-contract-types.ts
  - tests/system/browser/support/workbench-metrics.ts
  - tests/system/cli/install-source-policy.test.ts
  - tests/system/repository-policy/brand-typography.test.ts
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
- [x] #1 A cropped overlay and geometry audit compares current Inter, Inter Tight, Geist, and any stronger evidence-backed redistributable candidate plus a monospaced companion, records the PNG metadata limitation, and justifies the selected faces from glyph proportions, weights, tracking, and licensing provenance
- [x] #2 The selected sans and mono fonts are pinned or bundled as licensed frontend assets with explicit family, supported-weight, tracking, and wordmark tokens, and a browser check proves the intended faces load without machine-local or network fallback
- [x] #3 One repository-tracked SVG provides the compact lowercase archboard wordmark with no icon tile, derives clean outlines from the selected licensed face and measured optical adjustments, is themeable and accessible in both themes, and contains no font or unsafe runtime SVG dependency
- [x] #4 The shell uses the canonical vector wordmark and representative header, navigator, inspector, and workbench typography consumes the shared contract without an unrelated component rewrite or renewed phone/narrow scope
- [x] #5 The operator-shell design document records the reference crop, audit method, font source/version/license, selected sans and mono faces, wordmark construction and optical adjustments, while derived comparison renders remain ephemeral
- [x] #6 Tightly cropped 1440x900 light and dark evidence verifies the wordmark, header text, navigator labels, inspector secondary text, and workbench text at the supported desktop viewport and Samsung Flip scale
- [x] #7 Licensing/provenance checks, formatting, lint, both TypeScript projects, production build, repository inventory, affected browser owners, and the complete final validation chain pass without weakening existing gates
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use the completed 1440x900 cropped overlay audit as the decision record: pin Onest v1.000 static 400/500/600/700 for human UI copy and DM Mono v1.000 400/500 for technical identifiers, with OFL-1.1 provenance and the explicit limitation that the generated PNG contains no authoritative font metadata.
2. Bundle the exact licensed font files in the frontend, define one shared family/weight/tracking contract, and add browser assertions that the real faces load rather than falling through to machine-local or network fonts.
3. Generate one deterministic repository-tracked lowercase archboard SVG from the pinned Onest Medium outlines with measured optical tracking. Keep the generator and source hashes reproducible, make the asset themeable through currentColor without runtime SVG injection, and retain an accessible archboard name.
4. Replace only the shell wordmark and shared typography tokens; make header, navigator, inspector, and workbench consume the pinned roles without reworking their completed layout or reintroducing phone/narrow behavior.
5. Record font/version/license, overlay method, wordmark construction, optical adjustment, and asset provenance in the operator-shell design document. Keep derived comparison renders and crops ephemeral.
6. Verify licensing/provenance and deterministic generation, then run focused asset/module/browser owners, tightly cropped 1440x900 light/dark inspection, formatting, lint, both TypeScript projects, build, repository policy, the full sequential check chain, protected-base audit, and independent Standards plus Spec review with remediation to REVIEW_CLEAN.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed evidence:
- Dedicated visible UI audit thread 01a0524b-3bab-7c43-bf51-e7a476676ebb compared tightly cropped 1440x900 reference and app regions. The reference PNG has no authoritative embedded font metadata; reproducible glyph geometry selected Onest v1.000 for human UI and DM Mono v1.000 for technical text over Inter, Inter Tight, Geist, and Manrope.
- Bundled OFL-1.1 font assets and exact SHA-256 provenance. Browser owners prove both intended faces load from local frontend assets without network or machine-local fallback.
- scripts/generate-wordmark.ts deterministically produces src/ui/shell/assets/archboard-wordmark.svg from pinned Onest Medium outlines with measured optical tracking. The themeable currentColor asset has no font/runtime injection dependency and retains the accessible archboard name.
- Cropped light/dark evidence: /tmp/archboard-task14007-evidence.OlB3zI/.
- Final uninterrupted gate at f648a6088fc27d70a6ed80e2e3bc1b4505ae1a88: build; lint; formatting; both TypeScript projects; modules 434 tests/3235 assertions; system 284/4197; repository 118/363; all 19 canonical browser owners 20 tests/1067 assertions; wordmark generation check; range and worktree diff checks.
- Independent Standards and Spec review thread 01a05286-a361-7683-bf0d-de8e93228936 reported REVIEW_CLEAN for a8275ac230dbba315aa5768335f80fc5dcdf91ca..f648a6088fc27d70a6ed80e2e3bc1b4505ae1a88, including licensing, accessibility, desktop-only scope, and the causal telemetry-test remediation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned licensed Onest and DM Mono frontend assets, established the shared human/technical typography roles, and generated the canonical accessible lowercase SVG wordmark from deterministic Onest outlines. The operator-shell design record now captures the reference limitation, measured selection, provenance, optical construction, and ephemeral cropped comparison evidence. Verified in both themes at 1440x900, through local font-loading and asset-policy assertions, all 19 browser owners, the complete exclusion-free local check, deterministic generation, and a clean independent Standards plus Spec review.
<!-- SECTION:FINAL_SUMMARY:END -->
