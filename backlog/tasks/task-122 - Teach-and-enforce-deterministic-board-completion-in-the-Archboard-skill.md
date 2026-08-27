---
id: TASK-122
title: Teach and enforce deterministic board completion in the Archboard skill
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 17:19'
updated_date: '2026-08-27 15:27'
labels:
  - ready-for-agent
dependencies:
  - TASK-119
  - TASK-120
  - TASK-121
  - TASK-123.03
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/architecture-workflow.md
  - skills/archboard/references/cheatsheet.md
  - skills/archboard/evals/evals.json
  - scripts/sync-skills.mjs
  - tasks/task-037
  - tasks/task-041
  - tasks/task-043
  - scripts/check-branch-compare.mjs
  - scripts/check-side-by-side.mjs
priority: high
type: docs
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Teach the released Archboard completion composition contract without adding product behavior. Put one concise completion gate on the SKILL.md main path and one focused architecture-workflow section explaining semantic node identity versus grouped visual obstacles, containment and routing exclusions, supported versus indeterminate inspection, intentional bridges, whole-board rechecks, and the distinct roles of inspection and visual evidence.

Delete stale cached command, result, exit, REST, and MCP documentation from the skill source. CommandContract Zod schemas and inferred types remain the sole authority, archboard help owns syntax, and cli-workflows.md owns tested producer-to-consumer chains. Add one consequence-focused eval that reuses existing production test owners; do not create a new grader framework, command trace, or browser lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SKILL.md has a short ordered completion gate: use an explicit board and preserve human state; claim only for a substantial multi-write campaign; after each routing batch run strict whole-board check; render close-ups only for still-present findings; use released bridge/remove only for deliberate supported crossings; require a final complete clean strict report; release when writes end; capture one confirmed-board full-scene overview; and run compare only for variant work. It includes no ordinary same-board save ritual.
- [ ] #2 Guidance accurately distinguishes deterministic check, conditional render-findings close-ups, a full-scene screenshot, visible pane and camera state, portable scene export, and semantic compare; none is presented as proof of another.
- [ ] #3 architecture-workflow.md concisely teaches promoted multi-part node identity, grouped or library visual-obstacle evidence, non-obstacle container boundaries, endpoint and containing-zone exclusions, exact intentional bridges, unsupported or indeterminate handling, whole-board recheck after local batches, and preservation of human grouping, layout, stencil provenance, and unrelated content.
- [ ] #4 SKILL.md and cheatsheet.md point to archboard help, source CommandContracts and inferred types, and cli-workflows.md. They contain no copied result shapes or fields, syntax tables, exit or ordering contracts, or REST/MCP catalogue. Stale save, screenshot, viewport-crop, and curved or elbowed routing guidance is absent; cli-workflows.md is unchanged.
- [ ] #5 Exactly one composite eval covers the dense reroute regression plus one declared unavoidable crossing. It grades final production consequences: complete clean inspection, exact valid bridge suppression, semantic compare truth, explicit board identity, and byte or field preservation of unrelated grouped and stencil elements. It requires no exact prose, general command trace, or post-clean render manifest.
- [ ] #6 Existing production owners remain authoritative: inspection tests cover dense reroute, bridges, and package behavior; branch and side-by-side tests cover compare and pane consequences; contract tests cover the registry and workflow chains; install tests cover tracked, synchronized, and installed skill identity; and the unchanged fixed-point browser lane owns focused and full-scene pixels. No runtime, CommandContract, registry, generated-artifact, sync, UI/MCP, TASK-090, or TASK-123.03 behavior changes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze scope to the tracked skills/archboard source, eval metadata, and the smallest necessary assertion additions inside existing inspection/eval owners. Do not change runtime product behavior, CommandContracts, the registry, generated artifacts, sync implementation, UI/MCP, or browser-suite topology.

2. Prune SKILL.md and cheatsheet.md cached command, result, exit, ordering, REST, and MCP documentation plus completion contradictions: same-board save rituals, screenshot-after-every-write, viewport-fit-as-screenshot-crop, exact-user-view claims, and curved or elbowed routing advice. Preserve unrelated domain teaching unless it conflicts with released behavior.

3. Add the concise completion gate to SKILL.md and one focused completion/routing section to architecture-workflow.md. Route exact syntax to archboard help, exact result authority to source CommandContract Zod schemas and inferred types, and tested chains to cli-workflows.md. Do not modify cli-workflows.md.

4. Add one composite consequence eval. Reuse check-board-inspection dense and bridge fixtures plus existing branch/side-by-side consequences. Add only the smallest missing end-state preservation assertion and minimal eval-to-existing-grader linkage; do not add a grader framework, transcript matcher, protocol trace, or browser case.

5. Run sync:skills; skill lint; inspection, branch, side-by-side, contracts, install, one-write, doing, lock, and version gates; type-check and generated-ownership checks; two stable fix passes; bun run check; a separate bun run test with browser lanes serial/headless; then independent fixed-range Standards and Spec review.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-25 17:22
---
Planning pass completed from current skill, eval, and source inspection. Implementation has not started; the task is deliberately returned to To Do and left unassigned.
---

author: @codex
created: 2026-08-26 00:04
---
Plan review incorporated the originating task report, production-consequence grading, browser boundaries, corrected save and screenshot semantics, CLI-only delivery after TASK-124, and generated result documentation after TASK-123.03.
---

created: 2026-08-26 01:26
---
TASK-124 reconciliation: the skill rewrite teaches CLI workflows only and removes the deleted transport table, aliases, and fallback instructions.
---

author: @codex
created: 2026-08-27 15:16
---
Parent orchestration started after TASK-119, TASK-120, TASK-121, and TASK-123.03 shipped. Replan against the released type-authoritative CLI workflow guide: source CommandContract Zod schemas/inferred types remain authoritative; TASK-122 must not copy result fields or speculative command syntax.
---

author: @codex
created: 2026-08-27 15:27
---
Parent approved the xhigh deletion-test amendment. Render close-ups are conditional on still-present findings; a clean final check has no findings and therefore no mandatory render-findings evidence. Implementation is limited to one main-path gate, one focused conceptual section, one composite consequence eval, aggressive cached-reference deletion, and existing test owners.
---
<!-- COMMENTS:END -->
