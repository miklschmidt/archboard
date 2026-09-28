---
id: TASK-360
title: Move Codex to 0.158.0 and regenerate its app-server types
status: To Do
assignee: []
created_date: '2026-09-28 17:35'
labels:
  - codex
dependencies: []
priority: high
type: chore
ordinal: 601000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard pins @openai/codex 0.155.1 (package.json) and generates its app-server contract and TypeScript types from that exact version; the machine's Codex CLI is 0.157.1 and npm's latest is 0.158.0 (2026-09-28). The user asked to update the dependency and the generated Codex types. Code, comments and docs state behaviour 'read against Codex 0.155.1' in about 57 places; a statement is only true of a new version once it is checked against that version's source, and the local source clone /home/msc/Projects/codex is kept at the pinned tag for exactly that reading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json and bun.lock pin @openai/codex 0.158.0, and bun install regenerates the app-server contract and types from it
- [ ] #2 Everything that uses the generated Codex types type-checks against 0.158.0, with any protocol change adapted in code rather than cast away
- [ ] #3 Every statement naming the Codex version it was checked against is re-read against the 0.158.0 source and either confirmed with the new version or corrected
- [ ] #4 The local Codex source clone is checked out at the 0.158.0 tag
- [ ] #5 bun run check passes, and a signed-in Archboard server starts with its workbench ready
<!-- AC:END -->
