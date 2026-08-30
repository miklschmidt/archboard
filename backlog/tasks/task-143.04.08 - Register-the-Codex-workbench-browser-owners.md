---
id: TASK-143.04.08
title: Register the Codex workbench browser owners
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
labels: []
dependencies:
  - TASK-143.03.13
  - TASK-143.04.07
references:
  - docs/agents/test-suite.md
modified_files:
  - tests/system/browser/support/agent-browser.ts
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the single browser-inventory integration for the new text and controlled-voice owners in `tests/system/browser/support/agent-browser.ts`. It changes no application or test behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both exact owner paths appear once in BROWSER_TEST_PATHS in stable execution order and validate as BrowserTestPath values.
- [ ] #2 Focused selection runs each owner and package selection refuses an inventory that omits, duplicates, or reorders either owner.
- [ ] #3 The existing repository inventory, serial lane isolation, cleanup audit, and CI browser gate pass without exclusions or weakened checks.
<!-- AC:END -->
