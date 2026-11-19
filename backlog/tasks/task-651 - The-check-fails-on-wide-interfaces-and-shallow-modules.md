---
id: TASK-651
title: The check fails on wide interfaces and shallow modules
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T13:59:00Z'
updated_date: '2026-11-19T14:02:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-650
priority: high
type: feature
ordinal: 1111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

After TASK-646 and its cleanup, every per-export rule passes on this repository, yet `model` exposes 140 callable names, `workbench` 75 and `renderer` 51, and `timing` hides 126 pieces of logic behind 37 functions. The rules judge what each export is, never how many there are or how much they hide, and a getter for a constant clears EXPOSED_VALUE without narrowing anything. The owner (2026-11-19): "we must fail the check when modules are shallow and/or interfaces are wide, on Ousterhout's measure. It's okay to call an interface wide or a module shallow without an explicit how to fix: agents have reasoning; they need to be told the principles of narrow interfaces, deep modules and testing at the seams." Types do not count toward width (owner). Astra and Fable converged on this design over two rounds.

## Design

- Width: the exported functions, classes, public methods and values of a module, getters included. Exported types count zero. Benefit: the existing `logic` count.
- `INTERFACE_WIDE`: width above 20, on every module kind alike. Message: the counts and the principle, for example "`model` has a wide interface: callers must learn 140 names (133 functions, 7 values). A narrow interface is the few operations callers need." No prescribed fix.
- `MODULE_SHALLOW`: today's roll-up, or `width >= 8 && logic < 4 * width`, emitted once with all applicable evidence, for example "`timing` is shallow: 37 names with 126 pieces of logic behind them, about 3 each. A deep module hides much logic behind few names." No prescribed fix.
- Thresholds are fixed (not configurable). Both codes are warnings on every module by default, so they fail the check, and `MODULE_SHALLOW` stops being information by default.
- `codeCheck.rules` (TASK-650) gains `INTERFACE_WIDE`. A repository lowers either code to `information` or `off`. With `failShallowModules` on, an `information` finding of either code is promoted to a failing warning on the modules a branch touched (debt mode). Only `off` together with the gate stays an invalid configuration (and a refusal with the flag).
- Both measured grounds need a complete, supported reading, and external modules stay exempt, as for every depth finding.

## Rejected

A score, configurable thresholds, thresholds per module kind, counting types, estimating parameters from source text, per-module exemptions, generated fixes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 INTERFACE_WIDE is a warning on a module whose exported functions, classes, public methods and values (getters included, types excluded) number more than 20, and its message gives the counts and the principle
- [ ] #2 MODULE_SHALLOW is a warning on a module the roll-up names, or whose width is at least 8 with fewer than 4 pieces of logic per counted name, emitted once with the evidence that applies
- [ ] #3 Both codes warn on every module by default and fail the check; codeCheck.rules lowers either to information or off
- [ ] #4 With failShallowModules on, an information finding of either code fails the check on a touched module only; off together with the gate is an invalid configuration, and a refusal with --fail-shallow-modules
- [ ] #5 Exported types never count toward width, and external modules and incomplete readings get no measured finding
- [ ] #6 ADR 0082 records the measure and why the earlier ratio rejection changed; ADR 0058 and CONTEXT.md say this width differs from the interface-width ceiling test, which counts types; the archboard skill states the principles of narrow interfaces, deep modules and testing at the seams without prescribing fixes; the site, check help and schema descriptions document both codes, the defaults and debt mode
- [ ] #7 Tests cover each threshold edge, types not counting, the rules and debt mode, and one CLI exit case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure measure (module-depth/operations/module-measure.ts): width = functions+classes+methods+values; INTERFACE_WIDE above 20; MODULE_SHALLOW from the roll-up or width>=8 && logic<4*width, once, both warnings; measured grounds only on a supported (no unjudged or infrastructure names) and complete (every judged file gave a logic count) reading; external stays exempt. Unit test the edges and types.
2. module-depth.ts uses it; update fixtures that expected MODULE_SHALLOW information.
3. Policy: rules gain INTERFACE_WIDE; the refinement refuses only off of MODULE_SHALLOW or INTERFACE_WIDE beside failShallowModules. Schema test.
4. CLI gate: an information finding of either code on a touched module becomes a warning; SHALLOW_RULE_CONFLICT only for off. CLI exit test.
5. Web labels INTERFACE_WIDE as a module-level code.
6. Docs: ADR 0082, ADR 0058, CONTEXT.md, archboard skill (principles), site gate/pull-requests, check help, schema meta. Run gates; report this repository's findings.
<!-- SECTION:PLAN:END -->
