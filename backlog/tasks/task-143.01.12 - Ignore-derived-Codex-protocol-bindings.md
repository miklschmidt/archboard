---
id: TASK-143.01.12
title: Ignore derived Codex protocol bindings
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 16:58'
labels: []
dependencies: []
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - .gitignore
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 239000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one ignore rule for derived exact-version Codex protocol bindings in `.gitignore`. Canonical authored inputs and the reviewed schema hash remain tracked; regenerated TypeScript does not.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact src/runtime/codex-protocol/generated/ path is ignored without broad generated, src, runtime, or TypeScript patterns.
- [ ] #2 git check-ignore and git status fixtures prove regenerated bindings stay untracked while module source, authored fixtures/instructions, and schema hash remain trackable.
- [ ] #3 The rule introduces no committed placeholder or generated artifact and is in place before TASK-143.01.03 protocol generation.
<!-- AC:END -->
