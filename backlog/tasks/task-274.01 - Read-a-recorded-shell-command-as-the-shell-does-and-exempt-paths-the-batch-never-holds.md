---
id: TASK-274.01
title: >-
  Read a recorded shell command as the shell does, and exempt paths the batch
  never holds
status: To Do
assignee: []
created_date: '2026-09-19 00:40'
labels:
  - bug
dependencies: []
parent_task_id: TASK-274
priority: high
ordinal: 485000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two false contaminations in batch 2026-09-18T23-44-56-390Z. (1) baseline S08 rep 2: unwrapped() in src/runtime/skill-evaluation/lib/classify.ts strips the outer bash -lc "..." quotes literally without shell-unquoting the argument; with \" escapes and "'...'" splicing the word splitter in lib/other-run.ts then misreads '<world> status --short' as one path outside the world. The command only touched its own world. (2) candidate S02 rep 3 and S12 rep 3: 'ARCHBOARD_VAULT=<batch>/world/vault archboard ...', Codex 0.155.0's skill-root alias mis-expanded again; the CLI goes through the server so nothing was read, no ENOENT was printed, and the script's assignment word makes nothing exemptable. The batch root holds only harness-written top-level entries (runs/, skill/, graders/, batch.json, blinding.json, report.*); <batch>/world is none of them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The -c argument of a recorded bash/sh/zsh -c or -lc command is classified as the shell passes it (outer quoting and escapes undone), for every rule that reads the script, not only exposure
- [ ] #2 A batch path whose first segment under the batch root names no entry the batch holds reaches nothing and is not other-run exposure; the batch root itself, a glob or expansion at that segment, and every existing entry still count
- [ ] #3 Re-reporting .skill-evals/2026-09-18T23-44-56-390Z sets none of the three runs aside, and every other run's exposure is unchanged; any change in command classes (discovery, operation, investigation...) from the unwrap fix is listed and explained in the notes
- [ ] #4 Behavioural tests own both rules, and the TASK-273.01 bypass probes still count
<!-- AC:END -->
