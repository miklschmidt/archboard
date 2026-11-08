---
id: TASK-591
title: archboard check runs as a gate beside lint, type checks and tests
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:42:00Z'
updated_date: '2026-11-08T12:24:00Z'
labels: []
dependencies: []
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: high
type: feature
ordinal: 1037000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Market research on X (2026-11-06) found that experienced engineers who run coding agents trust hard checks such as import-linter, tsc and tests, and that rules in AGENTS.md get ignored. The `archboard check` family is already deterministic, but nothing packages it as a gate in CI, in Git hooks or in an agent loop. This is the first adoption bet of the research (P0). Package and document the existing CLI. Do not add an analysis engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The exit codes of `archboard check`, `archboard check code` and `archboard check embeds` are documented, and tests hold which outcome passes, warns and fails
- [x] #2 A GitHub Action runs the same CLI on a pull request and fails or warns on the documented findings, as its configuration says
- [x] #3 A pre-commit or pre-push hook runs the same `bin/archboard` executable
- [x] #4 README or INSTALL shows the check as a gate, as for tsc and ruff, and shows an agent loop that gives the check output back to the agent before human review
- [x] #5 A public demo clip shows a check that fails and then passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Exit codes: the docs page /docs/gate/ and the CLI reference list 0 pass, 1 warning or diagnostic, 2 usage or refusal, 3 no server. Tests hold them: apps/cli/tests/cli/commands/vault/operations/check-parts.test.ts (information passes, a warning fails the code check, a semantic diagnostic fails, an embed that nobody can draw again fails, refusals exit 2). The check Action (actions/check) installs the published CLI, annotates each finding and fails on fail-on: warning; tests/system/actions/check-action.test.ts holds fail-on and allow-codes. On relay PR #1 it failed with the annotation on services/intake/src/accept.ts:51. The relay example's .githooks/pre-push runs node_modules/.bin/archboard check, the pinned executable that CI runs; on a fresh clone it exited 1 after gate:break and 0 after gate:restore. INSTALL.md section 7 and README show the gate and an agent loop. docs/clips/gate.gif in the relay repo is a real recording that fails and passes again.

Review of docs/relay-cli-reference: the local hook now names ./node_modules/.bin/archboard, so the documented pinned CLI runs without a global install. No architecture proposal is needed for this documentation correction.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check is a documented gate. The docs site has a gate guide (exit codes, hook, CI, Stop hook and a shell loop for agents), INSTALL and README show it, the check GitHub Action runs it on pull requests with annotations, and the relay example carries a pre-push hook and a recorded clip of a fail and a pass. Proof: relay PR #1 fails with the annotation on the changed line, and main passes.
<!-- SECTION:FINAL_SUMMARY:END -->
