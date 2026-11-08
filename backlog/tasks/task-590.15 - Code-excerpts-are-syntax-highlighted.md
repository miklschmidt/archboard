---
id: TASK-590.15
title: Code excerpts are syntax highlighted
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-08T02:18:00Z'
updated_date: '2026-11-08T02:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1058000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-08 the owner asked for syntax highlighting in the source excerpt of a code finding. The owner approved shiki as the dependency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The source excerpt colours its code by the language of the file, in both themes, from the theme's own tokens
- [ ] #2 A language loads only when an excerpt needs it, and a file of a language shiki does not know shows plain text
- [ ] #3 The evidence line keeps its mark, and the excerpt stays readable while the highlighter loads
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shiki to apps/web; bun.lock and bun.nix follow.
2. clients/code-highlighter.ts: one highlighter core with the JavaScript regex engine and a CSS-variables theme; a language is imported only when an excerpt of it is first drawn, from a fixed list of the languages the code check reads, so the release carries no other grammar.
3. ModelCodeSource: lines draw plain at once, then take their tokens; the evidence mark stays.
4. app.css maps the --code-token-* variables to the theme's semantic colours, mixed toward the foreground for contrast, so both themes follow.
<!-- SECTION:PLAN:END -->
