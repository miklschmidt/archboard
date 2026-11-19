---
id: TASK-646.09
title: Fix with Codex sets up a missing language server
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T02:23:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.03
  - TASK-646.07
parent_task_id: TASK-646
type: feature
ordinal: 1095000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

A count is missing when a language has no server. The person must learn which server is missing and get it set up without leaving Archboard.

## Blocked by

- TASK-646.03
- TASK-646.07

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Flow steps `vKEsyHFk#Np3IKgXj`, `vKEsyHFk#Lc3BE31i`, `vKEsyHFk#Oh7qLIuo` (the missing-server branch of `vKEsyHFk#sgbsZcAx`). Application frame to Language server setup brief `vKEsyHFk#ePT7OKz6` (added). `workspace` `vKEsyHFk/vKEsyHFk#tdKalihR` (interface: gains the caller Application frame). Measures `vKEsyHFk#tQ2B3iEF` (changed by this ticket: the missing-server message and Fix with Codex). Endpoints: Application frame `vKEsyHFk#mlSnLR16`, Language server setup brief `vKEsyHFk#JQ4qwewE`, Shown conversation `vKEsyHFk/yejBBUFY#cLeaiTWy`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23mlSnLR16,vKEsyHFk%23JQ4qwewE,vKEsyHFk%23tQ2B3iEF (a worktree server serves the same address on its own port)
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
- [x] #1 A language without its server names the server that it needs
- [x] #2 Fix with Codex starts the setup in the conversation of the checkout that misses the server, with the shared brief
- [x] #3 The Codex text workbench browser test covers the routing to the right checkout
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. workspace: the setup brief's one export becomes languageServerSetup(missing?), which answers the server each missing language needs and the brief. It takes the languages as the code check names them and leaves out one that no agent configures. The package stays at its 40-name interface ceiling. init uses its brief, text unchanged.
2. Model reading: a context (LanguageServerFixContext) through which the Application frame gives Measures the server a language needs and the fix action, so the reader draws no relationship to workspace.
3. Measures: under the code status line, each checkout without a server names each language and the server it needs, with Fix with Codex.
4. Application frame: Fix with Codex finds the repository's checkout from the vault the catalogue lists (as the server names a pane's checkout; an untracked vault lists no checkout), shows that checkout's conversation through the existing fix-asked-for path, and asks with the brief. A checkout the tab cannot show gets a notice, never a message in another conversation.
5. Tests: brief unit tests, a Measures component test file, and one case in the Codex text workbench browser test that routes the fix to the other checkout.
6. Look at it in both themes, audit the site, archboard check, footprint gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1: model-measure-servers.test.tsx: each language without its server in a checkout names it and the server it needs (one line per language, once per checkout); outside the application it still names the missing server and offers no fix. language-server-setup.test.ts: needs names the server of each language; an unknown language is left out. Seen in the running app in both themes.
- AC2: the same component test: Fix with Codex calls the fix with the checkout's repository and its languages. Application.tsx composes languageServerSetup(languages).brief and asks in the checkout found from the repository's vault (checkoutOf in shell-actions.ts) through activate(..., { checkout }); a refused checkout raises a notice and asks nowhere.
- AC3: codex-text-workbench.test.ts, 'the dock follows the pane...': the orders pane's Measures reads a pass that found no Python server in the shop checkout; Fix with Codex puts the brief (pyright-langserver) in the shop conversation, which holds the shop's message, while orders was shown. Mutation check: asking in the shown conversation fails this test.
- Lanes after merging feat/module-depth at c22031f623: test:modules 5156 pass, test:repository 174 pass, browser owners codex-text-workbench and reader-measures pass, tests/system/cli/init.test.ts 9 pass, type-check, lint:policy, lint:tests, format:check clean. Site: painted and built (astro check, links resolve).
- archboard check and check code --fail-shallow-modules --base feat/module-depth: exit 1 on 813 EXPOSED_UNUSED, 246 EXPOSED_VALUE, 1 REEXPORT_PASS_THROUGH, 5 TEST_IMPORT_UNEXPOSED, the same totals as on the base; no MODULE_SHALLOW warning; the ticket adds no finding. workspace carries 7 older EXPOSED_VALUE warnings (LanguageServersSchema, DEFAULT_ARCHBOARD_URL, VAULT_DIRECTORY, VAULT_ORIGINS, CONFIGURABLE_LANGUAGES, CheckoutChoiceSchema, RepositoryListingSchema) that this ticket neither adds nor touches; left for TASK-646.14.
- Footprint gate exits 1. namedAndChanged: Language server setup brief, Init, Measures, Application frame. changedNotNamed: workspace (the private rules file behind the brief entry and its tests), Model reading (ModelMeasureServers.tsx, module-code.ts, use-module-code.ts and the new test, which Measures' binding to ModelMeasures.tsx does not hold), Canonical model reader (the context file in model-reader/state, beside ModelDraftContext), Application composition (checkoutOf in shell-actions.ts and the notice in notices.ts), Browser (tests), and the holders Packages, Agent CLI, Commands, Architecture drawing. Unbound: DESIGN.md, the install guide, the browser test and its support file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measures now says why a code count is missing when a language has no server, and offers Fix with Codex to set it up in the right checkout.

What changed:
- Language server setup brief: its one export, languageServerSetup(missing?), answers both the server each missing language needs (for a person) and the brief (for the agent). It takes languages as the code check names them and leaves out unknown ones. init uses its brief, text unchanged. workspace stays at its 40-name interface ceiling.
- Measures (What a module exposes): under the code status line, each checkout without a server says, per language, 'No Python language server in <repo>, so its code is not counted. It needs pyright-langserver, or basedpyright-langserver.' with Fix with Codex at the end.
- Application frame: provides that context. Fix with Codex finds the repository's checkout from the vault the catalogue lists (the server's own rule for a pane's checkout, which also covers an untracked vault), shows that checkout's conversation through the existing fix-asked-for path, and asks with the brief. If the tab cannot show that checkout, a notice says to open one of its models; it never asks in another conversation.
- DESIGN.md Measures section and the site's install guide mention it.

Verification: brief unit tests, a new Measures component test, one new case in the Codex text workbench browser test (mutation-checked), test:modules, test:repository, type-check, lint, format, site build; screenshots of the running app in both themes.

Risks / follow-ups: the footprint gate exits 1 on modules outside the named slice (workspace's rules file, Model reading, Canonical model reader, Application composition, tests, holders); none changes architecture beyond the plan. A repository with no vault cannot be fixed from the page (notice only).
<!-- SECTION:FINAL_SUMMARY:END -->
