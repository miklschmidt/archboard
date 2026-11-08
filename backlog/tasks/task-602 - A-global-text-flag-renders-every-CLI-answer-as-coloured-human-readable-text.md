---
id: TASK-602
title: A global --text flag renders every CLI answer as coloured, human-readable text
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T00:56:00Z'
updated_date: '2026-11-08T01:15:00Z'
labels: []
dependencies:
  - TASK-601
references:
  - apps/cli/src/cli/contract/operations/presentation.ts
  - apps/cli/src/cli/routing/operations/bootstrap.ts
ordinal: 1039000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI answers in JSON because agents are its main callers. A person at a terminal has to read that JSON. Only `repo list` and `browser panes` had a `--text` option of their own. On 2026-11-08 the owner asked for one global flag that renders all output as formatted, coloured text for people, and chose the name `--text` so that it matches the two existing options (`--plain` would promise text without colour).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `--text` is accepted with every command, before or after the command name, and the command's answer on stdout is human-readable text instead of JSON. Without it, every answer is the same JSON as before
- [x] #2 The text names each field in words, indents nested values, renders a list of records with the same plain fields as a table, keeps the lines of multi-line text, and leaves out `success: true`
- [x] #3 A refusal renders as text that says it is a refusal, with its code, message and recovery. Exit codes do not change
- [x] #4 At a terminal the text is coloured. It follows NO_COLOR and FORCE_COLOR, and `--text` output to a pipe has no colour unless FORCE_COLOR is set
- [x] #5 `repo list` and `browser panes` keep their own human form under the global flag, and their own `--text` options are gone
- [x] #6 Help lists `--text`, and INSTALL.md and the README say how a person reads an answer as text
- [x] #7 One module test owns the rendering and one system test owns the flag end to end
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The bootstrap takes every --text before -- out of argv, beside --url, and routing passes who reads the answer (json or text) to runCommand.
2. Presentation prints a generic text rendering (contract/rules/answer-text.ts) in place of a JSON or file-receipt answer, coloured with styleText on stdout.
3. The command context carries answer and paint, so repo list and browser panes answer with their own read-outs; their local --text options go.
4. bin.ts keeps colour for --text output; root help, INSTALL.md and README say how a person reads an answer.
5. A module test for the rendering and a system test for the flag; update the Command contract and Command routing descriptions in the model.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A per-command text hook on CommandContract was tried first and dropped: a contract that spreads another contract with a different result type (model claims, model init) inherits a hook typed for the wrong result, which tsc refuses. The command context now carries answer and paint instead, which leaves the contract type unchanged.
Rendering rules: records with at most 6 fields that each fit one line form a table, unless the table is wider than 100 columns, where each record is a block. An object of records keyed by id forms a table with an Id column (the policy of check semantics went from 161 to 55 lines). Fractions show six significant digits.
Verified: tsc; format:check, lint:policy and lint:tests clean; test:modules 4959 pass; test:system 236 pass; test:repository 170 pass. A PTY run of --text model claims prints ANSI colour, and none with NO_COLOR=1. browser panes --text prints the server's read-out. A refused model edit exits 2 with --text, as without it.
Model: proposal y017ReIz updated the descriptions of Command contract and Command routing and was adopted on the branch. check semantics has no diagnostic, check code --state y017ReIz has no finding on either module, and check embeds has no finding.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A global --text, written anywhere before --, prints a command's answer as coloured text for a person instead of JSON. The text names each field in words, indents nested values, shows records as a table, keeps multi-line text, and starts a refusal with Refused, its code and message. Colour follows the terminal, NO_COLOR and FORCE_COLOR. Without the flag every answer is the same JSON. repo list and browser panes keep their own read-outs through the command context, and their local --text options are gone. Help, INSTALL.md and the README say how to read an answer as text. A module test owns the rendering and a system test owns the flag end to end. All lanes pass.
<!-- SECTION:FINAL_SUMMARY:END -->
