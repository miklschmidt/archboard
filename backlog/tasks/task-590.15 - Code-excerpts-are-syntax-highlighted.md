---
id: TASK-590.15
title: Code excerpts are syntax highlighted
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T02:18:00Z'
updated_date: '2026-11-08T03:35:00Z'
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
- [x] #1 The source excerpt colours its code by the language of the file, in both themes, from the theme's own tokens
- [x] #2 A language loads only when an excerpt needs it, and a file of a language shiki does not know shows plain text
- [x] #3 The evidence line keeps its mark, and the excerpt stays readable while the highlighter loads
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shiki to apps/web; bun.lock and bun.nix follow.
2. clients/code-highlighter.ts: one highlighter core with the JavaScript regex engine and a CSS-variables theme; a language is imported only when an excerpt of it is first drawn, from a fixed list of the languages the code check reads, so the release carries no other grammar.
3. ModelCodeSource: lines draw plain at once, then take their tokens; the evidence mark stays.
4. app.css maps the --code-token-* variables to the theme's semantic colours, mixed toward the foreground for contrast, so both themes follow.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sol review S2 added the nix grammar and the .nix and .tofu extensions (3e0e310c5). The grammars are listed in model-reader/access/clients/code-grammars.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Source excerpts are highlighted by shiki with the JavaScript regex engine and a CSS-variables theme mapped to the --code-* tokens of app.css, so both themes follow. A grammar loads when its first excerpt is drawn, an unknown language stays plain, and the evidence line keeps its mark. Proof: unit tests of the highlighter and the source view, and screenshots of Rust excerpts in both themes.
<!-- SECTION:FINAL_SUMMARY:END -->
