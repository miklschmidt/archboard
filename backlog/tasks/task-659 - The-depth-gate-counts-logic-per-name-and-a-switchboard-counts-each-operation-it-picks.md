---
id: TASK-659
title: >-
  The depth gate counts logic per name, and a switchboard counts each operation
  it picks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T01:58:00Z'
updated_date: '2026-11-22T01:58:00Z'
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
- [ ] #1 `MODULE_SHALLOW` holds on the measured ground when a module offers W > 0 names and hides L < 4W pieces of logic; equality passes, and no width exempts a module
- [ ] #2 The all-exports roll-up ground of `MODULE_SHALLOW` stays, and both grounds go in one finding
- [ ] #3 `INTERFACE_WIDE` is produced nowhere, and is gone from the CLI help, the check Action reference, CONTEXT.md, the archboard skill and the tests
- [ ] #4 A vault policy naming `codeCheck.rules.INTERFACE_WIDE` is refused with an error that names that entry
- [ ] #5 A callable whose caller-selected closed key (literal overloads, a literal or boolean union, a discriminated request property, a Rust enum parameter with or without payloads) picks its operation counts one name per arm that runs a different operation, in TypeScript and Rust, resolved through aliases, imports and closed handler tables, with no call-site test
- [ ] #6 A shared default arm does not hide the bespoke arms; an arm that only selects data, or runs the shared path plus checks, adds no name; a shape test (`in`, `instanceof`) is no key
- [ ] #7 The logic of a switchboard discounts only its selector comparisons and bare forwarding calls
- [ ] #8 Where a key type cannot be resolved and counting its arms would flip the verdict, the measured verdict is withheld and the answer names the gap
- [ ] #9 Each module record carries its judged width and the switchboards that widen it (callable, keys, locations), and Measures shows them, also on passing modules
- [ ] #10 tests/system/repository-policy/interface-width-ceilings.json and interface-width.test.ts are deleted; the package entry and import tests stay
- [ ] #11 Analyzer tests cover the same 30 operations as one module, as two modules and behind a selector, with logic just below and at 4 per name
- [ ] #12 ADR 0082 is amended in place with dated reasons, ADR 0058 marks its ceiling ratchet superseded by 0082 and keeps its caller-job principle, and 0085 and 0086 width claims are annotated where present
- [ ] #13 CONTEXT.md, the Module depth model description, CLI help, Measures, the check Action reference and the archboard skill describe the gate as logic per name with switchboards counted
- [ ] #14 The archboard-deepen skill teaches renegotiation before design
<!-- AC:END -->
