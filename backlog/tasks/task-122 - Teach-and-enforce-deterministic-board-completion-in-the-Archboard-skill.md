---
id: TASK-122
title: Teach and enforce deterministic board completion in the Archboard skill
status: To Do
assignee: []
created_date: '2026-08-25 17:19'
updated_date: '2026-08-26 01:26'
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
The Archboard skill teaches board naming, claims, variants, promoted library items, screenshots, and semantic compare, but it does not give agents a mechanically verifiable exit gate for visual routing quality. The device-trust branch exposed the consequence: an agent could inspect raw note geometry incorrectly, mistake grouped unpromoted stencil parts for independent obstacles or architectural nodes, trust a clean compare that cannot model edge routing, zoom a pane even though screenshot export renders the full scene, or fix one route locally while creating another crossing elsewhere.

Revise the Archboard skill only after TASK-119 through TASK-121 settle their CLI contracts and TASK-123.03 generates the complete result reference. Put a compact completion sequence on the main path: inspect the explicit board; preserve human groups and stencil choices; claim before substantial multi-write work; make writes against the named board with --doing; after each routing batch run strict whole-board inspection and resolve or report every unsupported result; use bridges only for supported unavoidable crossings; run a final strict check; release as soon as no more writes are needed; then render focused evidence plus one full-board overview and run semantic compare. If visual evidence reveals another defect, reclaim and repeat. Ordinary same-board save is not part of the gate because writes already persist.

The skill must state the boundaries that caused rediscovery. Compare reports semantic layout and cannot prove connector clearance. Full-scene screenshot export is not a camera crop. Promotion stamps every constituent with one node ID; grouping alone never creates a node. Grouped unpromoted geometry may be aggregated only as a visual obstacle. Container boundaries are not routing obstacles. A local fix is incomplete until the whole board is rechecked. Unsupported geometry is not clean. Browser focus, recent activity, or a sole loaded task never substitutes for an explicit board key. Do not teach agents to write temporary geometry parsers, edit note JSON, or hand-assemble bridge masks once product commands exist.

Keep SKILL.md concise and procedural. Detailed syntax, result fields, prerequisites, exits, and jq chains come from the generated CLI reference. Correct conceptual guidance immediately, but never publish speculative command spellings before predecessor contracts ship.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The main SKILL.md contains a short ordered completion gate using released CLI behavior for check, focused finding render, full-board overview, bridge, compare, claim, and release without ordinary same-board save or duplicated command-reference tables.
- [ ] #2 The skill accurately distinguishes semantic compare, deterministic inspection, full-scene export, focused finding renders, and browser viewport inspection; none is presented as proof of another.
- [ ] #3 A focused reference explains promoted multi-element identity, group-only visual closure, obstacle and containment semantics, endpoint and zone exclusions, clear connector separation, marked unavoidable crossings, unsupported geometry, and whole-board recheck after local routing batches.
- [ ] #4 The workflow preserves human grouping, layout, stencil choices, and unrelated edits, and prohibits raw note rewriting, one-off geometry parsers, implicit board selection, hand-built bridge decorations, and speculative commands.
- [ ] #5 One eval presents a dense human-grouped board where semantic compare is clean but a connector crosses a node and a local reroute creates a second crossing; an agent cannot pass by stopping at compare, a local check, or a fit-to-board screenshot.
- [ ] #6 Production-backed graders assert final board state, strict inspection report, bridge provenance, explicit board identity, and focused-render manifest consequences. They do not grade prose or require general shell-command tracing; a narrow protocol trace is used only where persistent state cannot distinguish materially different operations.
- [ ] #7 A second eval covers an unavoidable crossing and requires the released bridge operation plus clean follow-up inspection, while rejecting undocumented masks, foreign metadata, and unsupported geometry.
- [ ] #8 Structural graders run without a browser where pixels are irrelevant; clipping, embedded-image, and z-order evidence extends the existing sequential headless browser suite rather than introducing parallel browser execution.
- [ ] #9 The skill references only implemented CLI surfaces and generated result contracts. The tracked source, synchronized copies, eval fixtures and graders, command reference, and applicable public-surface tests remain consistent and pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Start only after TASK-119, TASK-120, TASK-121, and TASK-123.03 ship. Inventory released CommandContracts, generated result and jq reference, current SKILL.md main path, architecture workflow, cheatsheet, eval format, sync behavior, and existing production-backed graders. Correct only released behavior.
2. Add a compact completion gate where an agent decides work is finished: inspect the explicit board; preserve human groups and stencil choices; claim before substantial multi-write work; make every write against the named board with --doing; after each routing batch run strict whole-board inspection and resolve or explicitly report every unsupported result; use the bridge operation only for supported unavoidable crossings; run a final strict check; release as soon as no more writes are needed; then render focused evidence for affected regions plus one full-board overview and run semantic compare. If visual evidence reveals another defect, reclaim and repeat. Do not include ordinary same-board save.
3. Expand skills/archboard/references/architecture-workflow.md with the routing and visual-QA model: promoted node identity versus grouped visual closure, containers versus obstacles, endpoint exclusions, clear connector lanes, local-fix and whole-board recheck, unsupported or indeterminate results, intentional bridge semantics, and separate evidence roles for check, compare, full export, close-up export, and a visible browser pane. Correct save wording: normal writes already persist; board save names scratch or creates a branch.
4. Link the main skill and workflow guidance to the generated TASK-123.03 reference for exact syntax, result fields, exits, prerequisites, and jq chains. Remove MCP tables and claims, viewport-fit-as-screenshot-crop guidance, screenshot-after-every-add guidance, shows-exactly-what-the-user-sees wording, and speculative command syntax.
5. Add two eval scenarios: a dense grouped board where compare is clean but route quality is not, and an unavoidable crossing requiring the product bridge. Build production-backed fixtures and graders in the style of check-branch-compare.mjs and check-side-by-side.mjs. Assert final board findings, metadata, board identity, manifest completeness, and command consequences; use a narrow protocol trace only when final state cannot distinguish the required act.
6. Make graders fail attractive shortcuts: stopping after compare, relying only on a full-scene screenshot, fixing one route without a whole-board recheck, dissolving human groups, treating grouped stencil strokes as nodes, marking unsupported geometry clean, creating undocumented decoration metadata, using an implicit board, or performing an unnecessary same-board save. Extend the existing sequential browser suite only for pixel fidelity, embedded images, clipping, and z-order.
7. Run bun run sync:skills, generated-reference freshness and jq checks, skill and eval consistency checks, new production graders, CLI contract coverage, install documentation, type-check, the existing sequential browser suite, and the complete test chain. Read the synchronized installed copy and execute both eval prompts against fresh temporary vaults to verify early discoverability and consequence-based grading.
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
<!-- COMMENTS:END -->
