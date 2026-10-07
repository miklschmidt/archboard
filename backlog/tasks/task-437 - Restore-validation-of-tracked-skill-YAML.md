---
id: TASK-437
title: Restore validation of tracked skill YAML
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 00:45'
updated_date: '2026-10-07 00:46'
labels: []
dependencies: []
references:
  - skills/archboard-dev/SKILL.md
  - tests/system/repository-policy
priority: high
type: bug
ordinal: 711000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The archboard-dev description contains unindented continuation lines and fails YAML parsing. TASK-128 introduced a gate for this contract, but commit 271c4ac16 deleted its last test. Agents must receive skills that their loader can read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The normal repository lane rejects missing or malformed YAML frontmatter in every tracked skills/*/SKILL.md with the file path in the failure.
- [ ] #2 The same gate requires a mapping with a matching skill name and a nonempty string description without fixing description wording.
- [ ] #3 The repaired archboard-dev description parses completely and the restored test demonstrates failure before the repair and success after it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Restore one repository test that discovers skills/*/SKILL.md and parses each frontmatter block with Bun.YAML.parse. Require the directory name and a nonempty description, with file-specific failures.
2. Run the restored test against the broken archboard-dev source, then repair its description as a folded YAML scalar without changing its text.
3. Document the owner in the test lane, run focused validation and bun run check, and commit the change.
No board is affected: this changes a repository test and YAML formatting only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restored one repository owner that discovers canonical skills, parses YAML with Bun, and applies the existing Zod dependency to the discovery fields. Before repair, the owner exited 1 on skills/archboard-dev/SKILL.md and passed skills/archboard/SKILL.md. After repair, all three cases pass. Focused lint, formatting, git diff --check, and dogfood check pass. The description uses a folded scalar and preserves its text. The simplification pass removed manual type narrowing in favor of one schema. Full bun run check is running under the monitor agent.
<!-- SECTION:NOTES:END -->
