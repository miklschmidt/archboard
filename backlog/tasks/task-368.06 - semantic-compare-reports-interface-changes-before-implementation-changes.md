---
id: TASK-368.06
title: semantic compare reports interface changes before implementation changes
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:38'
labels:
  - interfaces
  - cli
  - skill
dependencies:
  - TASK-368.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 642000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An interface change costs every caller, and an implementation change costs one module. Today a comparison lists every changed subject at the same level, so the change a reviewer must weigh first is mixed with the rest.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For each container, the comparison reports entry points added and removed, parts that moved between the interface and the hidden parts, and callers gained and lost
- [x] #2 The interface changes come before the other changes in the human answer, and have their own place in the machine-readable answer
- [x] #3 The propose-and-compare recipe of the consumer skill shows the interface section
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: no board is affected (archboard-dev step 1). The Comparison module card of Command interface binds src/cli/commands/semantic-compare.ts and its responsibility ("what one variant changed about the one it came from") stays true; the change adds no part and no relationship, and no board binds src/shared/semantic-board/lib. Same call as TASK-368.02 made for Inspect. So no proposal is branched.
2. Derivation: new src/shared/semantic-board/lib/compare-interface.ts beside compare.ts: compareInterfaces(before, after) -> { changed: InterfaceChange[], unchanged: SemanticNode[] }, over every node that has children on either variant, by node identity, using inspectContainer from container-interface only. InterfaceChange: container, holdsParts {before, after}, entryPointsAdded/Removed (entry point on one side that is not a child of the container on the other), becameEntryPoints/becameHidden (child on both, entry point on one only), callersGained/Lost (by node id). It never touches compareVariants, so no comparison status can change. Exported from the shared model's index.
3. CLI: semantic compare answer gains interfaceChanges {changed, unchanged} (schema in semantic-compare.ts, first key after against); the human answer prints identification, then interface lines, then the counts and relationship lines.
4. Tests: src/shared/semantic-board/tests/compare-interface.test.ts owns the derivation (added/removed/moved/callers, new and vanished containers, statuses unchanged, nesting); src/cli/commands/tests/comparison-answer.test.ts owns the answer and its order.
5. Skill: references/propose-compare.md step 3 shows the interface section in portable terms, example names only in the worked example; evals coverage row (runtime-owner) and cli-command-audit.json; generate:skill-artifacts.
6. Gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: shared reading src/shared/semantic-board/lib/compare-interface.ts (compareInterfaces; exported from the shared model's index; uses only inspectContainer; never touches compareVariants, so no standing can change). CLI: interfaceChanges section of the semantic compare answer (schema, builder and words in src/cli/commands/lib/compared-interfaces.ts), human answer lists the interface lines before the counts and relationship lines. readAgainst moved to src/cli/commands/lib/read-against.ts (re-exported by semantic-compare.ts) only to keep the command file under the 600-line lint cap. Skill: propose-compare.md step 3. evals/coverage.json row (runtime-owner), cli-command-audit.json entry.

Decisions the ADR did not settle:
- Board: no board affected, no proposal (the Comparison card of Command interface stays true; no part or relationship added; no board binds src/shared/semantic-board/lib). Same call as TASK-368.02.
- Which containers: every node that has children on either variant, by node id. Containers whose interface changed go in interfaceChanges.changed; the rest in interfaceChanges.unchanged (id, name, kind), so "no interface changed" is a claim a reader can check, as the rest of the answer lists unchanged subjects. Order: the compared variant's document order, then containers only the other variant has.
- A node that has children on one variant only (new container, first children, or emptied or removed container): the other side is read as holding no parts, so every entry point and caller is added or removed with it, per the ADR's literal rule (not a child on the other). holdsParts {variant, against} says which side held parts, so a reader can tell a new container from a changed one. When the node is gone from the compared variant the container is named as the reference had it.
- Names: the shared reading says before/after; the answer says variant (compared) and against (read against) like the rest of the answer. Parts that moved: becameEntryPoints (child on both, entry point only on the compared variant) and becameHidden (child on both, entry point only on the reference). A part that left the container is an entry point removed, not becameHidden.
- Callers are compared by node id: gained = calls into the container on the compared variant only, lost = on the reference only. A caller that keeps calling but reaches another entry point is neither. The answer lists callers as parts (id, name, kind), not their relationships: the relationships are in edges.
- Pass-through is not compared: the ADR lists three interface changes and the five measures belong to TASK-368.07.
- No `standing` on interface entries and none changed on any part; a test owns that a new caller leaves its target part, its container and the caller unchanged and only the relationship added.
- Human answer: line 1 identifies the comparison (the counts moved to an "Other changes" line after the interface lines); one line per changed container, or one line saying none changed or neither variant has a container.
- Evals: no scenario added. A scenario needs a fixture with a container plus a grader, and S16 and evals.json are being edited by the TASK-368.02 review and TASK-368.03. Coverage row maps the feature to its runtime owners (scenarios []), as TASK-368.02 did for its empty-container cases.
- The recipe describes the section in portable terms (container = node with children; module, package, class); archboard's names (Lease store) only in the worked example, as a counterfactual because the lease board draws no container.
Gate: type-check 0, lint 0, fmt:check 0, test:modules 3963 pass, test:system 192 pass, test:repository 20 pass, test:serial-browser pass.

Independent review (2026-10-06): a container that appeared, emptied or was removed with no outside caller was reported unchanged. It now always counts as changed, and its line names the variant that holds it (fe97e0cbf). propose-compare.md named the fields wrongly and said a card-drawn module has no interface; it was rewritten, and variants.md points at the section (d12b3c5eb). The README hero clip read the counts from line 1, so it now finds the 'Other changes:' line (ece1d9b6d). Follow-up left: no eval scenario owns the interface section yet, and read.md step 4 does not mention it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic compare now reports, for every container, entry points added and removed, parts that moved between the interface and the hidden parts, and callers gained and lost, from compareInterfaces in the shared model. The interface section comes first in the human answer and has its own place, interfaceChanges, in the machine answer, and it never sets a comparison status. propose-compare.md shows the section. Verified by compare-interface.test.ts and comparison-answer.test.ts (pass with --isolate), and the reviewer reported every gate lane passing.
<!-- SECTION:FINAL_SUMMARY:END -->
