---
id: TASK-115
title: Make the shared agent skill root the install default
status: Done
assignee: []
created_date: '2026-08-24 11:48'
updated_date: '2026-08-24 11:59'
labels: []
dependencies: []
references:
  - 'https://developers.openai.com/codex/skills'
  - 'https://github.com/vercel-labs/skills/blob/main/README.md'
modified_files:
  - INSTALL.md
  - scripts/check-install-doc.mjs
  - skills/archboard-dev/SKILL.md
  - skills/archboard/SKILL.md
  - skills/archboard/references/cheatsheet.md
  - src/cli/commands/install-skill.ts
  - src/cli/run.ts
type: chore
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard install-skill still treats ~/.codex/skills as the Codex-specific destination, while current Codex discovers user skills from ~/.agents/skills and follows symlinked skill folders. Make the shared agent root the default, retain an explicit Claude destination, and repair this development machine so its global archboard skill tracks the checkout through a symlink.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running install-skill without --dir or --target installs archboard under ~/.agents/skills and creates agent-neutral setup documentation
- [x] #2 Passing --target claude installs under ~/.claude/skills and creates Claude-oriented setup documentation
- [x] #3 Passing --target codex is refused with guidance to use the default, while --dir remains the custom-root escape hatch
- [x] #4 Current documentation and tests describe and verify the new destination contract
- [x] #5 This machine resolves ~/.agents/skills/archboard through a symlink to the checkout current skill
- [x] #6 The command accepts the skills.sh agent selector and canonical agent names without removing the requested --target claude shortcut
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep ~/.agents/skills as the canonical default. 2. Add skills.sh-compatible --agent selectors: codex maps to the canonical root and claude-code maps to Claude's root; keep --target claude as a compatibility shortcut and continue refusing --target codex. 3. Extend help, docs, and isolated tests. 4. Re-run focused verification, sync derived skills, and amend the unpublished commit before pushing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a closed destination contract: the default is ~/.agents/skills, Claude is explicit through --target claude, --target codex and unknown aliases are usage errors, and --dir remains the custom-root path. Refreshed install documentation and both skill references. Synced derived repo skills, then backed up the stale machine-global copy and replaced it with a symlink to the checkout's synced skill. Validation: bun run type-check; bun run test:install (67 checks); bun run test:parity; git diff --check; CLI help inspection; readlink, realpath, frontmatter, and diff verification of ~/.agents/skills/archboard.

Before push, the user requested skills.sh compatibility. Official skills CLI conventions use --agent with the identifiers codex and claude-code, while ~/.agents/skills is the canonical skill store. Reopened the task to add those selectors without breaking the requested --target claude spelling.

Added skills.sh-compatible --agent codex and --agent claude-code selectors, retained --target claude as a shortcut, and added exclusivity and unknown-agent validation. Revalidated with bun run type-check, bun run test:install (78 checks), bun run test:parity, git diff --check, CLI help inspection, and the live global symlink/frontmatter check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Changed install-skill to use ~/.agents/skills by default, added skills.sh-compatible codex and claude-code agent selectors while retaining --target claude, refused obsolete --target codex, updated docs and tests, and repaired this machine's global archboard skill as a verified checkout symlink.
<!-- SECTION:FINAL_SUMMARY:END -->
