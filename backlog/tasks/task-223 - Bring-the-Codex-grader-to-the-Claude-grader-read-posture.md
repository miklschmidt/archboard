---
id: TASK-223
title: Bring the Codex grader to the Claude grader read posture
status: To Do
assignee: []
created_date: '2026-09-15 09:56'
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
- [ ] #1 A Codex grader call that reads or executes a command reaching outside graders/workspace is filed as an error, not a verdict
- [ ] #2 The Codex grader cannot reach blinding.json or evals/ from the staged workspace, verified by a model-free test
- [ ] #3 evals/README.md describes the same read posture for both runners
<!-- AC:END -->
