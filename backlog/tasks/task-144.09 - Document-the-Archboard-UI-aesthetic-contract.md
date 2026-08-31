---
id: TASK-144.09
title: Document the Archboard UI aesthetic contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 01:29'
labels: []
dependencies:
  - TASK-144.03
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - docs/design/archboard-ui-aesthetics.md
parent_task_id: TASK-144
priority: high
type: task
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own docs/design/archboard-ui-aesthetics.md before any semantic shell integration. Convert the merged TASK-140 reference into durable rules future UI workers can apply without treating framework defaults as visual direction. Delegation profile: gpt-5.6-sol, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The guide names the TASK-140 reference/mockup as authority and documents canvas-first proportions, Swiss grid, typography, flat rules, small radii, cobalt/lime, restrained motion, and themes.
- [ ] #2 It forbids generic bubbles/cards/gradients/glow/decorative shadows/mock data/framework defaults while distinguishing illustrative reference content from product state.
- [ ] #3 It requires named modules, semantic utilities, native formatting/lint, accessibility, rendered inspection, and one behavior/state owner.
- [ ] #4 This guide is a dependency of shell integration and future-agent enforcement; it does not claim that later rendered work already conforms.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the TASK-140 reference/mockup and the two reviewed design records into one durable UI-aesthetic authority. 2. Document canvas-first proportions, Swiss grid, typography, flat rules, radii, cobalt/lime, themes, motion, accessibility, semantic utilities, named modules, native checks, rendered inspection, and single behavior/state ownership. 3. State explicit prohibitions and distinguish illustrative reference content from real product state without claiming later UI already conforms. 4. Validate document links, repository policy, formatting, diff scope, and clean status; record evidence for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-143.01.07 finalized at integration HEAD d890552. This dependency-ready documentation leaf owns only docs/design/archboard-ui-aesthetics.md and is path-disjoint from every active implementation.

Implementation evidence (2026-08-31):
- Added docs/design/archboard-ui-aesthetics.md in implementation commit 7f02633850584a9c500db7ee6413f2eefdc101d9. The guide makes the TASK-140 reference authoritative for canvas-first desktop and Flip composition, Swiss grid, typography, flat rules, small radii, cobalt/lime roles, themes, restrained motion, and accessibility.
- It explicitly rejects generic bubbles and cards, gradients, glow, decorative shadows, mock data, and framework defaults as visual direction; separates illustrative reference content from real product state; and requires named modules, semantic utilities, native Oxfmt/Oxlint gates, rendered inspection, and one behavior/state owner.
- The guide is a prerequisite for shell integration and future agent enforcement and explicitly makes no conformance claim for later rendered work. The canonical reference PNG was inspected directly.
- Validation: all 10 local Markdown links resolve; bun run fmt and bun run fmt:check pass; bun run lint passes; bun run test:repository passes 137 tests and 1,177 assertions; git diff --check passes; scope is the one authored document plus this task record. No rendered product code changed, so browser execution is not applicable to this documentation leaf.
- Fixed base 317d3aca9c82e4f13242def9040a1aa5ffb0f07c was verified before work. The original checkout's untracked src-DlBR1tzg.js remains present and untracked.
<!-- SECTION:NOTES:END -->
