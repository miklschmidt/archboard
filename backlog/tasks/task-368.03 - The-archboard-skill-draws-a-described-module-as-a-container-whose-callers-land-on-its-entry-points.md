---
id: TASK-368.03
title: >-
  The archboard skill draws a described module as a container whose callers land
  on its entry points
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:22'
labels:
  - interfaces
  - skill
dependencies:
  - TASK-368.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: high
type: enhancement
ordinal: 639000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The consumer skill binds a part to the file whose body runs, and lands a call on that body (evidence rule 3). So a board of a deep module draws its implementation as flat parts, and callers appear to reach into private files. The rule must change in portable terms: a caller outside a module lands on the entry point it names, and the calls behind that entry point are drawn inside the container.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Evidence rule 3 and the containment row of the catalogue say, in portable terms, that a board describing a module draws it as a container and that an outside caller lands on the entry point it names
- [x] #2 One recipe's worked example about archboard's own source shows a container with entry points and hidden parts
- [x] #3 The eval scenario and `coverage.json` row for the rule are updated, and shared guidance names no archboard subject
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. SKILL.md evidence rule 3 (my sentences only): replace 'to is the part whose body runs' for calls into a module with the container rule from ADR 0044 in portable terms: a board that describes a module draws it as a container with its callers outside it; an outside caller lands on the entry point it names (the function, method, component or route the module exposes and the caller calls); the calls behind that entry point are drawn inside the container; a relationship that ends on the container itself makes no entry point and is only for a whole-module dependency.
2. SKILL.md catalogue containment row: say that a module the board describes is a container, its callers outside it, its exposed entry points and the hidden parts behind them inside it.
3. create-architecture.md worked example: the semantic board store drawn as a container bound to its directory, with editVariantTransition and writeSemanticBoard as entry points (what editRoute imports from index.ts) and underBoardLease, applyUnderLease and persisted as hidden parts; correct the stale evidence (withBoardLock is called from underBoardLease, not writeSemanticBoard); point at semantic inspect --container to read the interface back.
4. evals: S00 edge.actual-receiver/containment features and the coverage.json rows for 'edge.from/to on real receivers' and 'whole-module endpoints' restated as entry points and hidden parts; no archboard names in shared guidance.
5. bun run generate:skill-artifacts; bun run eval:skill check; bun test --isolate src/runtime/skill-evaluation tests/system/cli/install-targets.test.ts; gate lanes one at a time.
Dogfood vault: a skill-only change affects no board, so no proposal is branched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions the ADR left open:
- Rule 3 keeps 'to is the part whose body runs' for calls inside a module and adds the module-edge rule: an outside call lands on the entry point the caller names (exported function, public method, rendered component, handled route), even when a helper behind it does the work. Reason: inside a container the old rule is still right; only the edge needed the interface.
- The worked example binds the Board store container to its directory (src/runtime/semantic-board-store), not to index.ts or lib/write.ts. Reason: the container's responsibility spans the module; a directory binding is accepted by check; index.ts declares the interface but implements nothing.
- The example now has two entry points (editVariantTransition, writeSemanticBoard: what editRoute imports from index.ts) and three hidden parts (underBoardLease, applyUnderLease, persisted). It also corrects stale evidence: withBoardLock is called from underBoardLease, not writeSemanticBoard. applyUnderLease -> editVariantTransition (transition.apply) lands on the factory because the apply closure is defined inside it.
- The example runs 'semantic inspect --container' after the write, so the reader sees the derived interface (verified in a scratch vault: 2 entry points, 3 hidden parts, 1 caller, 1 outgoing, 0 pass-through; check clean; picture inspected).
- S00 grades the WSGI server landing on __call__, or on wsgi_app when the board folds in the one-line __call__ that hands the call on. Reason: __call__ is a pass-through the ADR says is a question, not a fault; failing a run on it would grade a judgement call.
- evals/rubric.md 'Containment and receivers' summary restated, since the grader reads it and it restated the old rule.
- Dogfood vault: skill-only change, no board affected.

Independent review (2026-10-06, commit 1ab2ceb30): authoring.md 'Containment and receivers' still taught the old receiver rule with archboard names. It now points at rule 3 with generic names. The containment row and the rubric now allow a container bound to its directory or file. The example's evidence was made precise (editRoute calls two exported functions, applyUnderLease runs the apply closure editVariantTransition defines). A broken relative link was fixed. Left for a later sweep: the authoring.md Emphasis paragraph names archboard subjects, and read.md, edit.md and create-sequence.md carry the same broken references/authoring.md link.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Evidence rule 3 and the catalogue's containment row now say, in portable terms, that a board describing a module draws it as a container bound to its directory or file, with outside callers landing on the entry point they name and the calls behind it inside. create-architecture.md's worked example draws the board store as a container with two entry points and three hidden parts. S00, coverage.json and the rubric grade the rule. Verified by running the example payload in a scratch vault (semantic inspect --container reported 2 entry points, 3 hidden parts, 1 caller; check clean) and by eval:skill check (17 scenarios, 14 coverage parts).
<!-- SECTION:FINAL_SUMMARY:END -->
