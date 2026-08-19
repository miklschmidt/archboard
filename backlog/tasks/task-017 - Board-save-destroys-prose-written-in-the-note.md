---
id: TASK-017
title: Board save destroys prose written in the note
status: To Do
assignee: []
created_date: '2026-08-19 17:50'
updated_date: '2026-08-19 17:50'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 17000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Markdown a human writes outside the Drawing block survives an archboard save
- [ ] #2 Verified with prose both above and below the Excalidraw Data section
- [ ] #3 Export stays idempotent and lossless
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 17:50
---
Verified by the orchestrator, not just reported: added '## Why this shape' prose to a saved note, ran board open --reload then board save, and the prose was gone. Any save destroys it — not only --force, because wrapSceneAsObsidianMd carries frontmatter across but regenerates the note body.

Severity is higher than it looks. ADR 0004 chose an Obsidian vault partly because it gives 'prose alongside the diagrams' for free; it does not, because archboard eats it. This is silent data loss of exactly the knowledge-base content the vault decision was made for, and it lands on the human's own writing rather than on generated content.

Note the irony worth avoiding in the fix: TASK-010 built careful protection against Obsidian eating archboard's changes while this goes the other way.
---
<!-- COMMENTS:END -->
