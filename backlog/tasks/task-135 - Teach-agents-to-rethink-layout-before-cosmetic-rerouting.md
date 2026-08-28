---
id: TASK-135
title: >-
  Teach agents to compose readable boards instead of optimizing checkers or
  screenshots
status: Done
assignee:
  - '@codex'
created_date: '2026-08-28 14:44'
updated_date: '2026-08-28 15:01'
labels: []
dependencies: []
modified_files:
  - skills/archboard/SKILL.md
  - skills/archboard/references/architecture-workflow.md
  - skills/archboard/evals/evals.json
type: docs
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents using the distributable Archboard skill should compose readable spatial boards rather than optimize for a clean inspection report, a single pane, or rectangle-only output. Boards may require panning, labels remain terse, visual form communicates meaning, real coupling stays visible, and human layout decisions remain authoritative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The main Archboard skill gives agents a meaning, scope, placement, then routing decision order and rejects bends added solely to clear inspection.
- [x] #2 The skill treats the pane as a camera over a spatial board, permits panning at readable zoom, and defines a fitted overview as an index rather than a board-size constraint.
- [x] #3 The architecture workflow teaches a consistent meaning-driven visual grammar using stencils, zones, text, short bullets, lines, other shapes, and boxes without requiring arbitrary variety or verbose labels.
- [x] #4 The workflow treats inspection as evidence rather than a verdict about code quality, preserves real coupling, and requires approval before reframing human-arranged or routing-only work.
- [x] #5 Completion evidence for a pannable board includes one fitted overview plus enough working-zoom views to verify important paths and labels.
- [x] #6 Focused human-graded evals reject cosmetic rerouting, one-pane compression, rectangle monoculture, verbose annotations, and unauthorized changes to human layout.
- [x] #7 The canonical skill validates, synced mirrors are refreshed, and relevant repository checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add compact spatial-canvas, visual-grammar, and layout-before-routing rules to the main skill.
2. Add detailed composition, annotation, viewport, diagnosis, and human-authority guidance to the architecture workflow reference.
3. Add separate human-graded evals for cosmetic rerouting and pannable meaning-driven composition.
4. Validate JSON and skill packaging, sync derived mirrors, and run relevant repository checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented spatial-canvas guidance, a meaning-driven visual grammar, layout-before-routing diagnosis, pannable-board evidence rules, and focused evals for routing and composition. Verified with bun run lint:skills, bun run test:install, bun run fmt:check, bun run test:suites, bun scripts/check-board-inspection.mjs (838 checks), jq, git diff --check, and bun run sync:skills.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated the distributable Archboard skill to treat boards as pannable spatial canvases, choose visual form by meaning, keep annotations terse, and revisit composition before cosmetic rerouting. Added separate human evals for route repair and large-board composition. Verified skill packaging, installation contents, formatting, test inventory, JSON, sync, and the 838-check board-inspection fixture.
<!-- SECTION:FINAL_SUMMARY:END -->
