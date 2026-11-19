---
id: TASK-646.08
title: The About page lists a module's code exports
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T02:36:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.07
parent_task_id: TASK-646
type: feature
ordinal: 1094000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

A person reading one module wants its real interface: what the code exports, what is wrong with each export, and where it is.

## Blocked by

- TASK-646.07

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Code exports `vKEsyHFk#Y0s83yrf` (added). Right panel to Code exports `vKEsyHFk#8edJWcN6` (added). Flow step `vKEsyHFk#OAhe57tI` of `vKEsyHFk#sgbsZcAx`. Endpoint: Right panel `vKEsyHFk#iOyrvcQp`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23Y0s83yrf,vKEsyHFk%23iOyrvcQp (a worktree server serves the same address on its own port)
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
- [x] #1 The About page lists the selected module's code exports by kind, each with its findings
- [x] #2 Open code on an export opens its exact source, and the canonical model code browser test covers it
- [x] #3 The model code warnings component test covers the list
- [x] #4 A canvas that opens no About page does not download every module export: the code-findings answer that every canvas reads stays about the size it was before TASK-646.07, and the About page reads the exports of the selected module only
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Code findings answer: the remembered depth leaves out export names (RememberedModelSchema depth omits names); the memory keeps them. GET /api/vault/code-exports?model&state&revision&module answers one module's measure with its names, as the depth of a code-check answer that holds that module alone, and 404 CODE_EXPORTS_UNREAD when no remembered pass of that exact version measured it. Never starts a pass. code-intel exports no new name (interface-width ceiling): the client parses with CodeCheckAnswerSchema.pick({ depth: true }).
2. Open code at an export: the code-opener request gains {repo, path, symbol?, line?}: a file of a repository that the vault reads a checkout of, opened at the line that defines the symbol now, else the remembered line. The binding resolver refuses a path that leaves the checkout.
3. Code exports (apps/web/.../model-reader/reading/code-exports): a rule groups a module's names by kind (methods under their class), joins each with its findings (subject = module, export = name), names files from the module's directory, and keeps the MODULE_SHALLOW roll-up for the head; a component lists them on the module's About page after Interface, each row opening its source. States: no pass read this version, not measured, skipped, partial, reading, failure, forgotten, no exports. The query sits beside sourceLinesQuery in model-reader/access/clients.
4. Tests: code-findings route test, answer-path system test, model-code-warnings component test, canonical-model-code browser test.
5. Measure the answer size; screenshots in both themes; site audit; DESIGN.md About page.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1: model-code-warnings.test.tsx 'code exports list a module's exports by kind, each with its findings, read for that module alone' (function, class, method under its class, value with EXPOSED_VALUE, type; MODULE_SHALLOW roll-up over the lists, CALLER_UNDRAWN not). Seen in the running app on this repository (timing, ui-kit), both themes.
- AC2: canonical-model-code.test.ts 'a code export on the About page opens its own source, at the line that defines it' (real code pass, real opener, captures src/gateway/index.ts:5). answer-path.test.ts: the repo form opens at the line that defines the symbol now, else at the remembered line; a repository the vault reads no checkout of, and a path that leaves the checkout, open nothing (TARGET_OUTSIDE_CHECKOUT).
- AC3: model-code-warnings.test.tsx, two cases (the list and its open; no pass, not measured, skipped read nothing).
- AC4: code-findings-route.test.ts 'every canvas reads no export names, and the exports of one module are read alone, for the exact reading' (no name in the findings answer; one module's names; 404 for another revision or an unmeasured module; no pass started). On this repository after merging TASK-646.06: findings answer 1.20 MB (1,203,126 B); without depth and skipped, as before TASK-646.07, 1.13 MB; with the names it would be about 1.47 MB (names 265 KB). The exports answer of one module: 4.7 KB (timing), 5.5 KB (ui-kit). The component test asserts that the page asks only /api/vault/code-exports for that module.
- Lanes after merging feat/module-depth (e30f02a7e9): test:modules 5156 pass, test:repository 174 pass, test:system 307 pass, tests/system/code-targets 73 pass, browser canonical-model-code (2) and reader-measures (1) pass, types, lint:all, format:check clean.
- archboard check and check code --fail-shallow-modules --base feat/module-depth: exit 1 on 813 EXPOSED_UNUSED, 222 EXPOSED_VALUE, 8 EXPOSED_VALUE_COMPUTED, 1 REEXPORT_PASS_THROUGH, 5 TEST_IMPORT_UNEXPOSED: the counts TASK-646.06 recorded for the branch below. None is new; no touched module is shallow. A first RememberedExportsSchema export raised one EXPOSED_VALUE on code-intel; the final design exports no new name.
- Footprint gate exits 1: namedAndChanged Code exports (slice), Code findings memory and Code check route (07's slice: the answer leaves names out, the exports route). changedNotNamed: code-intel (protocol: remembered depth omits names), Code opener / code-opener (open a file of a repository at an export's line), Model reading (ModelAboutSelection renders the section; Right panel binds ModelPanel.tsx only), Model queries (access/clients/code-exports.ts), Archboard server and Browser (tests). Unbound: DESIGN.md, the task file, two system tests.
- Site audit: no site mock shows a module's About page; the right panel and header mocks are unchanged, so the site needs no change.
- Found: a module bound to a single file gets no depth and no skip from the code check, so its About page says the last check did not measure it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A module's About page lists its code exports by kind, each with its findings, and a row opens the export's source at the line that defines it.

What changed:
- Code findings answer (every canvas reads it): the remembered depth leaves out export names. The server keeps them and answers one module's measure with its names from GET /api/vault/code-exports, for the exact model, state and revision, or 404 when no remembered pass measured it. It never starts a pass. code-intel exports no new name: the client parses with CodeCheckAnswerSchema.pick({ depth: true }).
- Code opener: a request {repo, path, symbol, line} opens a file of a repository the vault reads, at the line that defines the symbol now, else at the line the check read. A path that leaves the checkout, or a repository with no checkout here, opens nothing.
- Code exports (model-reader/reading/code-exports): Functions, Classes, Methods (under their class), Values and Types side by side, each name with its finding chips and its file from the module's directory and line; long lists show eight rows. The shallow-module roll-up stands over the lists. Words stand in for the lists where no check read this version, the check did not measure the module, judged none of its languages, or the names are no longer remembered. DESIGN.md About page.

Verification: code-findings route test, answer-path system test, model-code-warnings component test, canonical-model-code browser test; test:modules, test:repository, test:system, code-targets, browser owners, types, lint, format; screenshots of the running app in both themes; site audit. Answer on this repository: 1.20 MB (1.13 MB before TASK-646.07, about 1.47 MB with names); one module's exports 5 KB.

Outside the slice: code-intel (protocol), Code findings memory and Code check route, Code opener, Model reading (ModelAboutSelection), Model queries (the query), Archboard server and Browser (tests).

Findings surfaced on modules this ticket does not change: none.

Risks / follow-ups: a module bound to a single file gets neither depth nor a skip from the code check, so its About page says the check did not measure it. EXPOSED_VALUE_COMPUTED has no chip name of its own and reads as 'Exposed value computed'.
<!-- SECTION:FINAL_SUMMARY:END -->
