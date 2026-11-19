---
id: TASK-651
title: The check fails on wide interfaces and shallow modules
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T13:59:00Z'
updated_date: '2026-11-19T14:18:00Z'
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
- [x] #1 INTERFACE_WIDE is a warning on a module whose exported functions, classes, public methods and values (getters included, types excluded) number more than 20, and its message gives the counts and the principle
- [x] #2 MODULE_SHALLOW is a warning on a module the roll-up names, or whose width is at least 8 with fewer than 4 pieces of logic per counted name, emitted once with the evidence that applies
- [x] #3 Both codes warn on every module by default and fail the check; codeCheck.rules lowers either to information or off
- [x] #4 With failShallowModules on, an information finding of either code fails the check on a touched module only; off together with the gate is an invalid configuration, and a refusal with --fail-shallow-modules
- [x] #5 Exported types never count toward width, and external modules and incomplete readings get no measured finding
- [x] #6 ADR 0082 records the measure and why the earlier ratio rejection changed; ADR 0058 and CONTEXT.md say this width differs from the interface-width ceiling test, which counts types; the archboard skill states the principles of narrow interfaces, deep modules and testing at the seams without prescribing fixes; the site, check help and schema descriptions document both codes, the defaults and debt mode
- [x] #7 Tests cover each threshold edge, types not counting, the rules and debt mode, and one CLI exit case
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: AC1, AC2, AC5 (types): packages/code-intel/tests/runtime/module-depth/operations/module-measure.test.ts (width 20 passes, 21 warns with counts; width 8 with logic 31 shallow, 32 deep, width 7 never; 100 types and 1 function pass; roll-up and measure make one finding with both grounds; measured:false keeps only the roll-up). AC5 (incomplete): module-depth-measure.test.ts, eight thin functions are shallow and the same module with a file that does not parse is not (red without the unparsed check). External modules keep findings: [] as before. AC3: module-depth.test.ts and the language tests now expect MODULE_SHALLOW warning; the swift and rust fixtures are measured shallow. depth-rules.ts applies rules to INTERFACE_WIDE unchanged. AC4: configuration.test.ts (information beside the gate valid, off beside it INVALID_CONFIG naming codeCheck.rules.<CODE>), check-parts.test.ts (gate promotes information MODULE_SHALLOW and INTERFACE_WIDE only on the touched module; off on either code with the flag exits 2 SHALLOW_RULE_CONFLICT; information with the flag exits 1). AC6: ADR 0082 (measure, ratio and debt reversal, complete reading), ADR 0058 (width differs, types counted there), CONTEXT.md (Module width, Wide interface, Shallow module, gate, rule), skills/archboard SKILL.md and design-lens.md (three principles, no fixes), site gate.mdx and pull-requests.mdx, check help, refusal text, schema meta, README, DESIGN.md. Web labels INTERFACE_WIDE as a module finding. Gates: bun run build, types, lint:all, format:check, test:modules 5313 pass, test:repository 174, test:system 227, site reference and build pass. check-model exits 1 on INTERFACE_WIDE and MODULE_SHALLOW only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check now fails on wide interfaces and shallow modules, on Ousterhout's measure. A module's width is its exported functions, classes, public methods and values; types count zero. INTERFACE_WIDE warns above 20. MODULE_SHALLOW is now a warning and names the roll-up or a width of at least 8 with fewer than 4 pieces of logic per name, once, with the evidence of each ground; neither message prescribes a fix. The measured grounds need a supported reading (every exposed name in a judged language, no infrastructure names) and a complete one (every judged file parsed whole with a logic count); external modules stay exempt. codeCheck.rules gains INTERFACE_WIDE. With failShallowModules (policy or flag), an information finding of either code fails only on a touched module (debt mode); off on either beside the gate is INVALID_CONFIG, and SHALLOW_RULE_CONFLICT with the flag. Pure logic lives in module-depth/operations/module-measure.ts. Docs: ADRs 0082 and 0058, CONTEXT.md, archboard skill, site, help, schema. This repository now fails check-model on INTERFACE_WIDE for 21 modules and MODULE_SHALLOW for Scene and timing; its vault was not changed. Risk: one file that does not parse removes both measured verdicts from its whole module (workbench lost its INTERFACE_WIDE that way).
<!-- SECTION:FINAL_SUMMARY:END -->
