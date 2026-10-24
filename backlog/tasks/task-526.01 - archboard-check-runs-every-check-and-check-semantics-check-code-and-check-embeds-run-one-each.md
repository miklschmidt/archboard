---
id: TASK-526.01
title: >-
  archboard check runs every check, and check semantics, check code and check
  embeds run one each
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-24T16:19:00Z'
labels:
  - cli
  - code-check
dependencies: []
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: high
type: enhancement
ordinal: 921000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The plain `archboard check` never runs the code check, so people and CI skip it, and nothing reports a board that the code no longer matches. ADR 0057 makes `archboard check` and `archboard check all` run every check, with one subcommand per check. `check --code` is named in 26 files under docs, skills, apps and packages, and ADR 0045, ADR 0046 and ADR 0054 decide around it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check` and `archboard check all` run the semantics check and the code check, and the embeds check once it exists
- [ ] #2 `archboard check semantics` runs the former plain check, and `archboard check code` runs the code check with behind
- [ ] #3 The JSON answer has one part per check, and a subcommand fills only its own part
- [ ] #4 The command exits 1 when any part has a diagnostic or a warning, and information never changes the exit status
- [ ] #5 `--variant`, `--every-draft` and `--plan` work on `check`, `check all` and `check code`, and the other subcommands refuse them
- [ ] #6 `--code` is refused as an unknown option, and no doc, skill, ADR text or help names it
- [ ] #7 The route that panes poll still runs only the semantics check
- [ ] #8 ADR 0045, ADR 0046 and ADR 0054 carry an Amended by line that points to ADR 0057, and the Code check entry in CONTEXT.md names the new command
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected board: Command interface (the Vault check module's responsibility and its code-check relationship). Command dispatch, the server boards and the renderer boards are not affected (the server route stays the semantics check only; the render boards belong to TASK-526.02). Proposal: Command interface@TASK-526.01, drawn: Vault check responsibility, and the label of its relationship to the server's code-check route.
2. CLI: check is a namespace with the bare default all (withLeadingOptions, as repo does). Children all, semantics, code. check all and check code take --variant, --every-draft, --plan; check semantics takes none. --code is deleted. The answer is {semantics?, code?} (embeds joins in TASK-526.03 as a third optional part); the runner table is keyed by check name so embeds adds one entry. Exit 1 when the semantics part has a diagnostic or the code part a warning.
3. Tests: rewrite apps/cli check-code and check tests for routing (which routes each command asks), answer parts, exit status, refusal of --code and of the options on semantics, discovered from registry metadata. Update system tests and the readme asset script that run check --code.
4. Docs: ADR 0045, 0046, 0054 Amended by notes; CONTEXT.md Code check; every doc, skill, help text and evals row that names check --code; docs/design/cli-command-audit.json check entry; skills artifacts regenerate.
5. Close: gate (bun run check), code check diff procedure with the new check code --variant, footprint, correct proposal to what was built. Do not adopt.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Base: this worktree started from a commit that lacked ADR 0057 and the TASK-526 tasks (they sit on feat/check-export-artifacts), so I merged that branch into this one before starting.
Design: check is a namespace route with the bare default all (withLeadingOptions, as repo does), children all, semantics, code. The answer is {semantics, code}; semantics holds the vault check plus its timings, code is the code check answer unchanged. The embeds part and --fix are not added: TASK-526.03 adds a third optional part to CheckAnswerSchema and a CheckName in runChecks (apps/cli/src/cli/operations/vault/vault.ts), and --fix to check all and check embeds. Until then --fix is refused as an unknown option.
Consumers of the old answer shape changed with it: packages/skills runs/vault.ts (the eval harness reads check semantics now), tests/system/cli/drill-down-repository.test.ts, tests/system/cli/vault-checkout.test.ts, scripts/readme-assets/evidence.ts.
The server route /api/vault/check is untouched and still the only semantics check; no server code changed, only two comments.
Outside the scope fence: apps/server comments, packages/board and packages/code-intel comments and the schema description that said check --code (text only); the vault board Archboard server routes still has a relationship labelled check --code (belongs to the TASK-526.02 worker's boards, not changed here); ADR 0057 was formatted by oxfmt because fmt:check failed on it.
Footprint read against base 89ecc5bc8~1 for Command interface@TASK-526.01: Command catalogue (run.ts) and Commands changed and were not named: the commit adds the check subcommands to the table, the part's job is unchanged, so no proposal change. Request transport is named only by a relationship (normal). The code check diff (check code vs check code --variant TASK-526.01) is empty.
README assets: bun run readme:check lists stale assets; code-evidence types the old command and needs a refresh by a person (bun run readme:assets code-evidence); the others were stale from earlier commits.
<!-- SECTION:NOTES:END -->
