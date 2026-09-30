---
id: TASK-223
title: Bring the Codex grader to the Claude grader read posture
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 09:56'
updated_date: '2026-09-15 19:39'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/grading-run.ts
  - src/runtime/skill-evaluation/lib/isolation.ts
priority: medium
type: enhancement
ordinal: 383000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Claude grader runner limits the grader to Read, Grep and Glob inside the staged workspace and files a call that reads outside it as an error. The Codex grader runs under a read-only sandbox that blocks writes but not reads, so a curious grader can still open ../../blinding.json from the workspace; only the prompt stands in the way. Bring the Codex grader to the same stricter posture so both graders are blinded by the harness rather than by instruction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Codex grader call that reads or executes a command reaching outside graders/workspace is filed as an error, not a verdict
- [x] #2 The Codex grader cannot reach blinding.json or evals/ from the staged workspace, verified by a model-free test
- [x] #3 evals/README.md describes the same read posture for both runners
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. outsideReaches over the parsed trace: absolute and workspace-relative paths named by commands, and file-change paths, resolved against the workspace. 2. codexProtocolFailure with the Claude runner precedence; a failure removes the -o verdict. 3. Model-free tests over traces; README and graders.json.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
tests/codex-grader.test.ts proves ../../blinding.json, an absolute evals/evals.json read, a cd out of the workspace and a file change outside are filed as errors with the verdict discarded, while workspace reads by any spelling pass; harness suite 118 pass. The resume argv is unchanged (cwd and config.toml keep the sandbox), since the stream check is what blinds either call.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Codex grader is blinded by the harness reading its stream, matching the Claude runner; verified by model-free trace tests and documented in graders.json and the README.
<!-- SECTION:FINAL_SUMMARY:END -->
