---
id: TASK-368.02
title: >-
  semantic inspect reports a container's entry points, hidden parts and
  crossings
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:26'
labels:
  - interfaces
  - cli
  - semantic-model
dependencies:
  - TASK-368.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: high
type: feature
ordinal: 638000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracer bullet of the interface lens: one derivation, one command, any board. `inspectGroup` (`src/shared/semantic-board/lib/groups.ts`) already derives a group's boundary in the same way, so the derivation lives beside it in the shared model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For a named container on any variant, the answer lists its entry points, hidden parts, the outside parts that call it, the relationships that leave it and the entry points that only pass a call through
- [x] #2 The derivation is a pure function of the variant's content, and nothing is stored
- [x] #3 The machine-readable answer has a schema, and the read recipe of the consumer skill says when to use it
- [x] #4 Tests own the derivation for nesting, relationships to the container itself, and a container with no outside caller
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: no board is affected. No dogfood board draws src/shared/semantic-board (no binding names it), and the Inspect module card of Command interface has no description and keeps its one relationship to Board client. So no proposal is branched (archboard-dev step 1).
2. Derivation: new src/shared/semantic-board/lib/container-interface.ts beside groups.ts, exported from the shared model's index: containerInterface(content, id) -> null | {container, holdsParts:false} | {holdsParts:true, entryPoints (with the relationships that reach each), hiddenParts, callers (with what each reaches), outgoing, onContainer (relationships ending on the container itself), passThrough}, plus interfaceMeasures(). Rules exactly as ADR 0044.
3. CLI: semantic inspect gains --container <id|name> beside --group (exactly one of them); the answer gets a schema (ContainerInspectionResultSchema, union with the group answer) and a human summary on stderr in the ADR's words (callers, outgoing relationships, never crossings).
4. Tests: src/shared/semantic-board/tests for nesting, relationship to the container itself, no outside caller, the pass-through rule, no-children; tests/system/semantic-boards for the CLI; contract schema check.
5. Skill: references/read.md (and authoring.md pointer only if needed, not touched: another agent owns it); evals coverage row + cli-command-audit.json; generate:skill-artifacts.
6. Gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: src/shared/semantic-board/lib/container-interface.ts (inspectContainer, interfaceMeasures; exported from the shared model's index), lib/inspected-subjects.ts and lib/container-inspection.ts under src/cli/commands, `semantic inspect --container`, evals S16 + coverage rows, read.md step 3, CLI audit entry.

Decisions the ADR did not settle:
- No board is affected, so no proposal: no dogfood board binds src/shared/semantic-board, and the Inspect module card of Command interface has no description and keeps its one relationship.
- CLI shape: --container <id|name> beside --group, exactly one of them (usage error otherwise, exit 2). Both are optional with requiredWhen in the contract. The result is a union of the group answer and the container answer; the container answer is discriminated by holdsParts (false: only container; true: measures, entryPoints[].reachedBy, hiddenParts, callers[].relationships/reaches, outgoing, onContainer, passThrough). Edges in it carry fromName/toName because one end is usually outside. `measures` repeats the list lengths so ADR 0044's five counts are named in the answer; interfaceMeasures() is exported for TASK-368.07.
- The derivation takes the container node (not an id), so it has no 'no such node' state. The CLI resolves the node: id first, then a name that fits exactly one node; no match or several is refused (new refusal UNKNOWN_CONTAINER, exit 2, listing containers or ids). A node with no children is not refused: holdsParts false.
- Caller.reaches lists the entry-point ids a caller reaches; it is empty for a caller whose relationships all end on the container itself, which is how the answer shows 'a caller that reaches no entry point' without a flag.
- Pass-through counts the relationships the leaf sends to anywhere (inside, outside, itself) and every relationship it receives; a self-loop falls out of the rule unspecial-cased.
- Ordering: children, callers and neighbours in node document order; relationships in edge document order.
- Works on any variant including historical ones (frozen content), like inspect --group.
- Human answer goes to stderr as diagnostics lines in the ADR's words (callers, outgoing relationships; no 'crossings').
- Evals: S16 reuses S09's Flask board without groups and views; outcomes are version-advanced-by 0 and check-clean (the harness has no inspect-container check and that code is outside this task's write scope), so the grader owns inspect.container. Coverage rows added to part 2 (the part count stays 14).
- Not touched: skills/archboard/references/authoring.md (another agent), SKILL.md (read.md carries the when-to-use; SKILL.md only points at it).
- Verified on the dogfood vault: Browser client on Browser application answers 19 hidden parts, no entry point, no caller (ADR 0044's example).

Independent review (2026-10-06): the derivation is correct against ADR 0044 rule by rule. The reviewer replaced the internal 'crossing' names with one map of holders, and showed the same answers on 1158 vault nodes and 3,000 random nested boards (2dc66c99c). It stated the --group and --container condition in requiredWhen instead of prose, and reworded read.md step 3 so that 'exposes' stays the code's side (a6a317444).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard semantic inspect <board> --container <id|name> reports a container's entry points, hidden parts, callers, outgoing relationships, pass-through entry points and the relationships that end on it, from inspectContainer in the shared model, a pure function of the variant's content. The answer has a schema, and read.md says when to use it. Verified by container-interface.test.ts (nesting, relationship to the container, no outside caller, pass-through, no children) and the system test on the real command, 19 pass with --isolate. The reviewer reported every gate lane passing.
<!-- SECTION:FINAL_SUMMARY:END -->
