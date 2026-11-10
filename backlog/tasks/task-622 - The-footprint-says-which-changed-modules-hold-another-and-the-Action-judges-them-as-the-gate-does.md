---
id: TASK-622
title: >-
  The footprint says which changed modules hold another, and the Action judges
  them as the gate does
status: To Do
assignee: []
created_date: '2026-11-10T01:07:00Z'
updated_date: '2026-11-10T01:18:00Z'
labels:
  - footprint
  - actions
dependencies: []
priority: medium
ordinal: 1068000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pull-request Action lists a module bound to a directory as changed outside the plan whenever a module inside it changed, while `model footprint --fail-outside` lets that module pass. On PR #89 the Action showed 8 such modules. The rule lived only in the CLI, and the Action runs without the CLI's packages, so it could not share it. The footprint answer now says, for each changed part, which other changed parts its binding holds, and both the gate and the Action read that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each changed part of a footprint lists the ids of the other changed parts that its binding holds, as `holds`; an unchanged part lists none
- [ ] #2 `model footprint --fail-outside` fails only on a changed module outside the draft whose `holds` is empty, and the CLI rule file is gone
- [ ] #3 The pull-request Action leaves a changed module that holds another changed module out of 'Changed outside the plan', and an answer without `holds` keeps the old behavior
- [ ] #4 The CLI summary line counts 'changed outside the plan' the way the gate does
- [ ] #5 Docs, skills and the vault say the Action applies the same rule
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review of 1c4aac8967..c67a0f1ca6: approved after one documentation fix in 4ab8277be. The design-lens guide treated every changedNotNamed entry as a gate failure. It now states that only entries with empty holds fail. The site and guide explain the Action fallback for older CLI answers.

The rule matches the previous CLI rule for reachable paths, directory roots, equal scopes, .csproj projects, repository boundaries, and pinned parts. Invalid paths already stay outside the changed lists. The strict schema, HTTP producer, CLI consumers, Action consumers, and fixtures have no verified defect. Unchanged parts keep empty holds. No new architecture proposal is needed because the fix changes guidance only. Current already describes Footprint names held modules, including History lens vKEsyHFk/HBlhIeSD#radK8osF, Model footprint vKEsyHFk/XppR9owz#MrE3v2T6, and Pull-request Action vKEsyHFk#mAh7CmuS.

All required commands passed: bunx vp run type-check; bunx vp run lint:policy (0 warnings, 0 errors); bunx vp run test:modules (5035 passed, 2 skipped); bun test tests/system/models/model-footprint.test.ts tests/system/actions/ (43 passed). The site build passed with 0 errors, warnings, or hints. Its guide tests passed, and all internal links resolved. The changed page rendered correctly in agent-browser. archboard check semantics passed with no diagnostics. bunx vp fmt on both edited files and git diff --check passed. Source inspection found no simpler implementation that preserves the contract. No push or merge was performed.
<!-- SECTION:NOTES:END -->
