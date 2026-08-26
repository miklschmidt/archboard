---
id: TASK-128
title: Validate distributable skill frontmatter during lint
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-26 13:22'
updated_date: '2026-08-26 13:25'
labels: []
dependencies: []
references:
  - skills/archboard/SKILL.md
  - skills/archboard-dev/SKILL.md
  - package.json
  - scripts/sync-skills.mjs
priority: high
type: bug
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracked archboard skill currently fails discovery because its YAML frontmatter description contains an unquoted colon-space sequence. The same skill has malformed quick-reference table rows where literal shell pipes are parsed as column separators. Add a Bun-only lint check for every distributable skill under skills/*/SKILL.md, repair the current skill, and make the real lint/fix commands prevent recurrence. Do not use Python and do not add a dependency unless Bun YAML parsing proves inadequate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bun run lint fails with a file-specific diagnostic when any distributable SKILL.md has missing or invalid YAML frontmatter, including the reported unquoted colon-space case
- [ ] #2 bun run fix and the repository check path also validate distributable skill frontmatter after formatting, without Python
- [ ] #3 The validator discovers all tracked skills under skills/*/SKILL.md and proves its negative path with a deterministic self-test or fixture
- [ ] #4 The tracked archboard and archboard-dev skill frontmatter parse successfully with Bun YAML parsing
- [ ] #5 The archboard CLI quick-reference table preserves the intended literal pipe spellings without malformed columns or reduced guidance
- [ ] #6 Focused validation, bun run lint, bun run fix, type-check, and the relevant skill installation/sync checks pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the exact frontmatter parse error and malformed table columns through Bun and the tracked skill source.
2. Add a Bun script that discovers skills/*/SKILL.md, extracts required frontmatter, parses it with Bun.YAML.parse, validates a mapping with string name/description fields, and checks detected Markdown tables for consistent unescaped column separators. Include deterministic negative self-tests for the reported YAML and pipe cases.
3. Wire the skill check into bun run lint and bun run fix so bun run check inherits it; avoid a new dependency unless Bun parsing is insufficient.
4. Repair the archboard frontmatter without changing its description meaning and escape the quick-reference pipes so the rendered commands remain accurate.
5. Run the focused checker, lint, fix twice for stability, type-check, skill sync/install checks, and inspect the final diff before review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced the reported Bun YAML parse failure and two malformed quick-reference rows. Added scripts/check-skills.mjs with exact YAML and table negative self-tests, wired it into lint and both ends of fix, repaired the tracked skill, synced derived skill copies, and passed lint:skills, targeted oxlint, type-check, and test:install. Full lint/fix currently reaches and stops only on TASK-119 structuralFindings complexity 150/60, which is recorded in the paused TASK-119 worker and must be resolved before TASK-128 finalization.
<!-- SECTION:NOTES:END -->
