---
id: TASK-663.05
title: The code check flags a dependency the code calls
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:34:00Z'
labels: []
dependencies:
  - TASK-663.01
parent_task_id: TASK-663
ordinal: 1149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A dependency means nothing of the target runs at run time. The code check reports, as information, a dependency whose evidence is a call into a function or value of the target (102 of the 157 anchored dependencies here cite one), so the agent states the call and its effect instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dependency whose anchor or evidence is a call into the target's function or value gets an information finding naming both ends
- [x] #2 A type-only or build dependency gets none
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Code check: a relationship of the effectless kind (dependency) whose anchor's uses in its file include a call, or, with no anchor, whose evidence from its start to its end includes a call, gets one information finding DEPENDENCY_CALLED naming both ends and the call evidence, telling the author to state the call and its effect. It is judged whatever the vault's evidence list says, ahead of ANCHOR_MISMATCH and RELATIONSHIP_UNSUPPORTED, so one fact gives one finding; call stays accepted evidence of a dependency (the relationship is real, its kind is wrong).
2. Type-only (import) and build-dependency evidence gives none.
3. Tests in code-intel relationships.test.ts: an anchored call dependency, an unanchored call dependency, a type-only and a build dependency with none.
4. CLI help of check code and the browser finding chip name the finding.
5. Gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence #1: relationships.test.ts e12 (anchored on the mailer's call to send) and e13 (unanchored, the listener calls the sender) each get one DEPENDENCY_CALLED information whose subject and message name both ends and whose evidence is the call. This repository's own vault: 111 DEPENDENCY_CALLED, all information, no other finding changed (artifacts/t663-05/check-code.txt, ignored).
Evidence #2: e5 (unanchored, type-only import) and e14 (anchored on a type-only use) get no finding; nix-build-check.test.ts (dependencies proven by build-dependency evidence) keeps its exact finding list.
Decisions: a dedicated finding rather than dropping call from the dependency's accepted evidence: ANCHOR_MISMATCH would be a warning on a resolved anchor, and a vault whose configuration still lists call (every vault written so far, this one included) would never see it. call stays accepted (the relationship is real, its kind is wrong), so one fact gives one finding. The rule is judged whatever evidence the vault lets a dependency accept, through isEffectlessKind from @archboard/model/policy, the same predicate the store uses for the effect exemption.
Lanes: types, lint:all, format:check, test:modules, test:repository, test:system pass; test:solo passed on rerun (the rasterizer's same-bytes capture failed once under machine load, renderer code this task does not touch); check:model reports only the old-format warning, two ANCHOR_SYMBOL_MISSING and three MODULE_SHALLOW.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code check reports DEPENDENCY_CALLED, information naming both ends and the call, on a dependency whose anchor or evidence from its start to its end is a call into a function or value of its end, and tells the author to state the call with its kind and effect. Type-only and build dependencies get none. Check help and the protocol notes name it; the browser chip names it from its code. Two part-code type guards moved beside their type to keep relationships.ts under its line limit.
<!-- SECTION:FINAL_SUMMARY:END -->
