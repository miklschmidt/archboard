---
id: TASK-559.27
title: Give agents the design lens back
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T04:16:00Z'
updated_date: '2026-10-31T04:51:00Z'
labels:
  - cli
  - skills
dependencies: []
parent_task_id: TASK-559
priority: high
ordinal: 999000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The audit of TASK-549 (docs/design/task-549-reader-audit.md, ranks 5, 6 and 8 for the CLI) found that PR 19 removed semantic inspect, interface changes in a comparison, and the measures of competing proposals, with no decision, and that the consumer skill no longer names the lenses. An agent cannot read a module's interface today. Purpose: easy identification of codebase smells through A Philosophy of Software Design.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 archboard model inspect states one module's interface: entry points with what reaches them, hidden parts by name, callers, outgoing relationships, pass-through entry points, and relationships that end on the module itself
- [x] #2 archboard model inspect reads the boundary of a group
- [x] #3 archboard model compare states interface changes first, from compareInterfaces
- [x] #4 archboard model compare states the measures of each compared proposal side by side, as counts with no combined score
- [x] #5 The consumer skill teaches model inspect, model locality and model footprint, and archboard-dev names them
- [x] #6 One derivation serves the reader and the CLI
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The comparison read owns the data: add required interfaceChanges and interfaceMeasures to ComparisonSchema (private schemas, no new board export), built by compareInterfaces and a new measureInterfaces in shared/rules/compare/interfaces.ts over the one contentOf adapter. Forced adoption compares the same complete object.
2. Competing proposals: model compare gains a repeatable --beside. ADR 0044:244 says two or more states. A selector reaches the read through StateSelectionSchema, and a --beside with no comparison refuses with COMPARISON_REQUIRED.
3. model inspect: CLI answer over the existing /api/architecture/model read with modelContent, inspectContainer, interfaceMeasures and inspectGroup. Module or --group, with --state or --checkpoint. No new route.
4. model compare says interface changes first on stderr, then the measures, ahead of the JSON. In the JSON the interface sections precede subjects. Counts only, no score or verdict.
5. Skill: teach model inspect, model locality and model footprint as facts. Name them in archboard-dev. Update CONTEXT.md and ADR 0044 references.
6. One owner per behavior, then the full gate.

7. model compare asks for its comparison explicitly: the parser answers false for an absent --compare flag, so model compare --state X gave no comparison without --against.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate: nix develop --command bash -c 'bunx vp run --no-cache check:all' exited 0 at 8a34838cf: 21/21 tasks, 4886 module tests, browser lane 45/45.

Evidence. AC1, AC2: tests/system/semantic-boards/model-inspect.test.ts through the real CLI and server, and model inspect on this repository. AC3, AC4: the same owner, with the interface sections ahead of subjects in the JSON and interface changes ahead of the measures on stderr. AC5: skills/archboard/SKILL.md, skills/archboard/references/design-lens.md and skills/archboard-dev/SKILL.md, with the skill-links owner in the gate. AC6: inspectContainer and interfaceMeasures serve the reader (ContainerInterface.tsx, model-projection.ts), the CLI (rules/model/inspection.ts) and the comparison (rules/compare/interfaces.ts), and the system owner holds a compare column equal to the inspect measures.

Decisions.
- Bug found and fixed: model compare --state X without --against gave no comparison, because the CLI sent compare=false for an absent flag. TESTING.md and the skill show that form. model read keeps its behavior: --compare stays its opt-in.
- --beside is restored, repeatable, on model compare only. ADR 0044:244 says two or more states, and the audit faults the removal for having no decision.
- interfaceChanges and interfaceMeasures are required on ComparisonSchema, so forced adoption compares them. A comparison read with --beside refuses there with COMPARISON_REQUIRED. canonical-models.md says so.
- The render recipe fingerprint keeps its three comparison fields, so an interface section never marks an embed stale.
- No new @archboard/board export: the interface width stays at its ceiling. compareInterfaces now returns schema-shaped parts, and it had no other product caller.
- apps/web: only two typed test fixtures changed, because the required fields force them. No source file there changed.
- The words on stderr list containers whose counts differ and count the rest. The JSON keeps every row.
- Shared state names carry their id in the words, because this vault holds three proposals named TASK-446 after TASK-482.07.

For TASK-559.30: read model.comparison.interfaceChanges. No second derivation is needed.
<!-- SECTION:NOTES:END -->
