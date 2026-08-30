---
id: TASK-143.03.03
title: Choose and disclose the pane thread link
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.09
  - TASK-143.01.11
  - TASK-143.03.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-thread-link
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own pane thread-link selection and readiness disclosure. Create and Attach are separate commands with separate prerequisites; no recent-thread heuristic or implicit load occurs. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pane selection lists only joined persisted/current loaded records and shows executable, inspect-only, stale, prior-epoch, source, loaded, status, and controllability reasons before bind.
- [ ] #2 Create/attach/relink/recover actions target captured pane and epoch; a focus change cannot retarget an in-flight action, and ambiguous creation remains inspect-only.
- [ ] #3 The account UI distinctly renders API key, hosted ChatGPT, explicit amazonBedrock apiKey+region, and amazonBedrockAccessKeys accessKeyId+secretAccessKey+optional sessionToken+region forms; device code, client tokens, and Bedrock profile/environment setup are unavailable with an explanation.
- [ ] #4 Missing/wrong binary, locked home, backoff/stopped, config/storage mismatch, login progress/failure/logout, command-before-ready, empty list, duplicate rows, and stale response have accessible recovery paths.
<!-- AC:END -->
