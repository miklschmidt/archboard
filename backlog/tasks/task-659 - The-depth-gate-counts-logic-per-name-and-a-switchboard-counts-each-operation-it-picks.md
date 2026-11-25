---
id: TASK-659
title: >-
  The depth gate counts logic per name, and a switchboard counts each operation
  it picks
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T01:58:00Z'
updated_date: '2026-11-22T02:39:00Z'
labels:
  - code-check
  - module-depth
dependencies: []
references:
  - docs/adr/0082-the-code-check-judges-module-depth-from-the-code.md
  - docs/adr/0058-an-interface-is-the-few-operations-its-callers-need.md
priority: high
type: enhancement
ordinal: 1113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The flat cap of TASK-651 (`INTERFACE_WIDE` above 20 names) rewards cutting a module into pieces: two halves of 15 pass where the whole of 30 fails, though callers that need both still learn 30. The 8-name floor of `MODULE_SHALLOW` lets 14 shallow names pass as two groups of 7. And folding names behind one key (a switchboard such as `changeArchitectureClaims(vault, intent, input)`) hides width the caller still learns. The owner decided (2026-11-22, redo of #142, decisions 1, 2 and 14) that the gate measures logic hidden per name, with no flat cap and no small-module exemption, and that a switchboard key counts as names. The advisors settled the rule in two rounds; the decision is in artifacts/depth-gate/settled.md of the main checkout, with the reasoning in r1-*.md and r2-*.md there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `MODULE_SHALLOW` holds on the measured ground when a module offers W > 0 names and hides L < 4W pieces of logic; equality passes, and no width exempts a module
- [x] #2 The all-exports roll-up ground of `MODULE_SHALLOW` stays, and both grounds go in one finding
- [x] #3 `INTERFACE_WIDE` is produced nowhere, and is gone from the CLI help, the check Action reference, CONTEXT.md, the archboard skill and the tests
- [x] #4 A vault policy naming `codeCheck.rules.INTERFACE_WIDE` is refused with an error that names that entry
- [x] #5 A callable whose caller-selected closed key (literal overloads, a literal or boolean union, a discriminated request property, a Rust enum parameter with or without payloads) picks its operation counts one name per arm that runs a different operation, in TypeScript and Rust, resolved through aliases, imports and closed handler tables, with no call-site test
- [x] #6 A shared default arm does not hide the bespoke arms; an arm that only selects data, or runs the shared path plus checks, adds no name; a shape test (`in`, `instanceof`) is no key
- [x] #7 The logic of a switchboard discounts only its selector comparisons and bare forwarding calls
- [x] #8 Where a key type cannot be resolved and counting its arms would flip the verdict, the measured verdict is withheld and the answer names the gap
- [x] #9 Each module record carries its judged width and the switchboards that widen it (callable, keys, locations), and Measures shows them, also on passing modules
- [x] #10 tests/system/repository-policy/interface-width-ceilings.json and interface-width.test.ts are deleted; the package entry and import tests stay
- [x] #11 Analyzer tests cover the same 30 operations as one module, as two modules and behind a selector, with logic just below and at 4 per name
- [x] #12 ADR 0082 is amended in place with dated reasons, ADR 0058 marks its ceiling ratchet superseded by 0082 and keeps its caller-job principle, and 0085 and 0086 width claims are annotated where present
- [x] #13 CONTEXT.md, the Module depth model description, CLI help, Measures, the check Action reference and the archboard skill describe the gate as logic per name with switchboards counted
- [x] #14 The archboard-deepen skill teaches renegotiation before design
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The TypeScript and Rust adapters state a switchboard on a callable (Definition.picks: key, closing type, operations, pick logic) and the keys a type alias or enum closes (Definition.closes).
2. Module depth counts each judged function or method that picks as one name per operation, closes keys through imported types, discounts the pick logic, and withholds a verdict an unclosed key would flip (skip key-unclosed).
3. MODULE_SHALLOW holds at W > 0 and L < 4W; INTERFACE_WIDE and the 8-name floor go from the measure, the policy, the CLI gate, the web and the docs.
4. Depth records carry width and switchboards; Measures gains a Width column whose note names them.
5. Delete the per-package ceilings file and test; add analyzer regression cases.
6. Amend ADR 0082 in place, mark the 0058 ratchet superseded, update CONTEXT.md, the vault description, CLI help, site pages and the archboard skill.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Operation identity is syntactic: an arm runs an operation when it calls (outermost calls, by callee and number of arguments) or only writes state; arms with equal calls are one operation, and an arm whose calls hold another arm's calls is that operation plus checks. Constructions and capitalized Rust calls (Some, variants) build data. This reproduces the settled hits for changeArchitectureClaims 3, readArchitectureHistory 3, Stage::arrive 4, Stage::depart 4, measure_node 3, findVault 2 and durationMs 1 in the facts-level test; parseDocument counts 3, not the settled 2, because legacyBoard parses through a function of its own that syntax cannot equate with the shared schema path (recorded as a known limit in ADR 0082).
The check on this branch (rules layer, before the redesign): MODULE_SHALLOW on Scene (78 names, 91 logic, 1.17), timing (37, 132, 3.57) and Repository queries (5, 15, 3.0); no key-unclosed skip; no verdict changed by a switchboard. 0085 and 0086 are not on this branch, so nothing to annotate.
Lanes: types, lint:all, format:check, code-intel tests (481), test:repository (173), test:system (227), test:solo (15), site build with links.

archboard-deepen (merged from docs/deepen-renegotiate): a Job and Renegotiate in its vocabulary, a relocation test, a renegotiation pass in Explore with examples of jobs that outlived their terms, the renegotiation at the root of the design tree, dropped features as owner decisions, the code check described as a floor, and jobs on the report card and in the hand-off.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
MODULE_SHALLOW now holds when a module's W > 0 names hide fewer than 4W pieces of logic, at any width; INTERFACE_WIDE and the 8-name floor are gone, and a vault rule naming INTERFACE_WIDE is refused with a message naming the entry. The TypeScript and Rust adapters name switchboards (a callable that picks its operation by a closed key its caller passes); module depth counts one name per operation, closes keys through imported types, leaves selector logic out, and withholds a verdict an unclosed key would flip (skip key-unclosed). Depth records carry width and switchboards; Measures has a Width column whose note lists them. The per-package ceilings file and test are deleted; analyzer tests cover the 30-operation cases and the settled candidates. ADR 0082 is amended in place, ADR 0058 marks its ratchet superseded; CONTEXT.md, the vault description, CLI help, the site guides, README, INSTALL and the archboard skill follow. Verified: types, lint:all, format, test:repository, test:system, test:solo, apps/cli + code-intel + model tests (1189), site build. The check on this branch flags Scene, timing and Repository queries, each real under the new rule. Criterion 14 (archboard-deepen) is the orchestrator's. Known limit: parseDocument counts 3, not the settled 2 (ADR 0082). Follow-up: TASK-660 (factory members).
<!-- SECTION:FINAL_SUMMARY:END -->
