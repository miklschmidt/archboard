---
id: TASK-646.07
title: A person reads module depth in Measures
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T01:52:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.04
parent_task_id: TASK-646
type: feature
ordinal: 1093000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

The browser tracer bullet. A person sees the code's own interface beside the model's, and the code findings beside the model findings, from the last code pass.

## Blocked by

- TASK-646.04

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Flow `vKEsyHFk#sgbsZcAx` "A person reads module depth in Measures", steps `vKEsyHFk#ThS1TrIe`, `vKEsyHFk#nv6IUIIo`, `vKEsyHFk#Mw2ObWB8`, `vKEsyHFk#ap5B41FS`, `vKEsyHFk#CkmWAi8p` and the decision `vKEsyHFk#eLM3oKam` (its missing-server branch belongs to TASK-646.09). Measures `vKEsyHFk#tQ2B3iEF` (changed: Model and Code columns, code findings). Code findings memory `vKEsyHFk/HBlhIeSD#yYQ3AHkf` (changed). Measures to Fetch semantic reads `vKEsyHFk#HeTg2hKV` (added). Interfaces: `Retained reads` `vKEsyHFk/UOXNWLhR#kr46TVLf` and `Picture clients` `vKEsyHFk/yejBBUFY#dtYjWvlf` gain the caller Measures. Endpoints: Fetch semantic reads `vKEsyHFk/UOXNWLhR#tmwUm8BL`, Code check route `vKEsyHFk/HBlhIeSD#3bPZg9a5`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&grammarA=sequence&flowA=vKEsyHFk%23sgbsZcAx (a worktree server serves the same address on its own port)
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

TASK-646 adds rules to `archboard check`, and this repository does not obey them yet. The CI task `check:model` fails on any warning. From the first ticket that reads more modules or adds a rule, the stack layers can fail `check:model` until TASK-646.14 clears the old findings. The stack merges as one unit, after its top layer passes.

1. Before you hand back, run `archboard check`. After TASK-646.04 is in your branch, also run `archboard check code --fail-shallow-modules --base <the branch below yours>`.
2. To find what your ticket surfaced, compare the findings with `archboard check` on the branch below yours.
3. If a finding is on a module that your ticket adds or changes, fix it in this ticket. Use the seam that the archboard skill gives for that finding. The code that this ticket writes adds no findings.
4. If a finding is on a module that your ticket does not change, leave it. TASK-646.14 clears it.
5. Never silence a finding. Add no waiver or exemption, weaken no rule or policy, and do not change `scripts/check-model.ts` or the `check:model` task to pass.
6. In your final summary, list the findings that your ticket surfaced on modules that it does not change: each code, with its count of modules. TASK-646.14 and the pull-request body account for them.
7. A ticket that adds a rule tests it on fixtures, never on this repository's code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `What a module exposes` shows grouped Model and Code columns side by side, each sortable
- [x] #2 Code findings join the findings list
- [x] #3 A module with no findings shows as clean, and an incomplete read names what it skipped
- [x] #4 Code findings memory keeps each module's exports, counts, findings, language coverage and skipped reads per model, state and revision, modules with no findings included
- [x] #5 Opening a pane never starts a code pass
- [x] #6 The model code evidence and model measures component tests cover the columns and the findings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Code check answer: Module depth also lists each counted export (name, kind, path, line) as names, and names the languages it exposes names in that no rule judges yet (unjudged). A skip that names a subject carries the canonical model and state, as findings do. (code-intel: Module depth and Code check, outside the slice; TASK-646.08 needs the names and its slice changes no data.)
2. Code findings memory: each canonical reading keeps depth (every measured module, those with no findings included) and skipped (its subject skips and the checkout- or language-wide ones).
3. Measures, What a module exposes: grouped Model and Code column heads; Code columns Exports (by-kind breakdown on hover), Values, Logic, Findings, each sortable, w-24. Rows read the remembered findings of this exact model, state and revision; the view never starts a pass. Findings cell: count of code findings on the module, Clean when complete and none, Partial when a language was not judged or a language server was missing; a module the pass skipped takes a dash with the reason. The foot says what the code counts cover and how to get a pass.
4. Findings list: EXPOSED_VALUE named, a depth finding shows its export; the code view's gloss names shallow modules.
5. Tests: memory route, module-depth (names, unjudged, canonical skips), model-measures and model-code-evidence component tests. DESIGN.md Measures section. Screenshots both themes, site audit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge gate (orchestrator): footprint exits 1 on Archboard server, Browser, code-intel and Model reading (with their holders). Model reading: Measures binds only ModelMeasures.tsx, so its own head, row, dialog, rules, hook and the findings list files sit under Model reading. code-intel: the code-check answer contract gains the export list, unjudged languages and skip identities. Archboard server and Browser: tests. None changes architecture beyond the plan, so the exception is recorded in the proposal history (operation task-646-07-exceptions). Unbound: DESIGN.md and the site's EvidenceTabs demo copy. Follow-up for TASK-646.08: the code-findings answer is about 1.1 MB on this repository with 2018 export names, and every canvas reads it.

Evidence:
- AC1: model-measures.test.tsx 'what a module exposes sets the model's counts beside its code's, and a code column sorts' (Model colSpan 4, Code colSpan 4, sort by Exports). Seen in the running app, both themes (screenshots in the handback).
- AC2: model-code-depth-findings.test.tsx: EXPOSED_VALUE and MODULE_SHALLOW stand in the findings list, warnings first, in cards and list, with the export named.
- AC3: model-measures.test.tsx 'a module with no findings is clean, one read in part never is, and a skipped one says why' (Clean, Partial, a dash per code cell with the skip reason).
- AC4: code-findings-route.test.ts 'a canonical reading keeps each module's depth and what the pass skipped, a module with no findings included'; module-depth.test.ts covers names, unjudged languages and canonical subject skips.
- AC5: model-measures.test.tsx 'the code columns read the remembered pass, and opening them never starts a pass' (only /api/vault/code-findings is asked).
- AC6: the two component tests above.
- Lanes: test:modules 5149 pass, test:repository 174 pass, browser reader-measures/reader-context/reader-branch-footprint pass, tsc both projects, lint:policy, lint:tests, format:check clean.
- archboard check and check code --fail-shallow-modules --base feat/module-depth: exit 1 on 813 EXPOSED_UNUSED, 246 EXPOSED_VALUE, 1 REEXPORT_PASS_THROUGH, 5 TEST_IMPORT_UNEXPOSED, none on a module this ticket changed; no touched module is shallow. The ticket adds no rule.
- Footprint gate exits 1: namedAndChanged Code findings memory, Measures (slice) and Code check, Module depth (outside the slice: the answer contract gains names, unjudged and canonical subject skips, which AC4 and TASK-646.08 need). changedNotNamed: Archboard server, Browser, code-intel (tests and the code-check answer contract), Model reading (Measures' own head, row, dialog, rules and hooks, and the findings list, which Measures' binding to ModelMeasures.tsx alone does not hold). Unbound: DESIGN.md, the site's EvidenceTabs, the task file.
- Site audit: EvidenceTabs glosses match the shell's new glosses; the interface panel says Measures counts the code's exports. Painted and ran the site; the evidence tabs render. The Measures demo mock keeps model and history columns only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measures sets a module's interface in the model beside its interface in the code, from the last code pass, and never starts one.

What changed:
- Code check answer: each measured module lists its exports (name, kind, path, line) as names, and the languages it exposes names in that no rule judges yet (unjudged). A skip that names a part carries the canonical model and state. (Module depth, Code check.)
- Code findings memory keeps, per canonical model, state and revision, every measured module (those with no findings included) and what the pass skipped.
- What a module exposes: head groups Model and Code; Code columns Exports (kinds on hover), Values, Logic and Findings, each sortable. A module with no findings says Clean, one read in part says Partial with what was skipped, an unjudged one takes a dash with the reason. A foot line names the pass and what it did not judge, or that none read this version. The view reads /api/vault/code-findings only.
- Findings list: EXPOSED_VALUE named; a depth finding shows its export. Tab glosses updated in the shell and on the site; DESIGN.md Measures section.

Verification: component tests (model-measures, model-code-depth-findings), route and module-depth tests, test:modules, test:repository, three Measures browser tests, tsc, lint, format; screenshots of the running app in both themes.

Risks / follow-ups: the code-findings payload is ~1.1 MB on this repository (2018 export names); 08 reads names from it. Logic counts of package-level modules are large (whole directory). Findings on modules this ticket does not change: none new; the ticket adds no rule.
<!-- SECTION:FINAL_SUMMARY:END -->
