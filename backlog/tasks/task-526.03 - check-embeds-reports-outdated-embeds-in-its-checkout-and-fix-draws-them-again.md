---
id: TASK-526.03
title: >-
  check embeds reports outdated embeds in its checkout, and --fix draws them
  again
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-24T17:07:00Z'
labels:
  - cli
  - code-check
  - renderer
dependencies:
  - TASK-526.01
  - TASK-526.02
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: high
type: enhancement
ordinal: 923000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With a recipe in every board render, the check can find the embeds that a repository keeps and compare each with what its board draws now. This is the step after a board correction in the flow that the owner described: check code says the board is wrong, the agent corrects it, and check says which embeds to draw again. ADR 0057 decides the severities, the re-pointing to a board that took a deleted name, and why a renderer-only change is information.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The check reads every file that Git tracks in the checkout and that carries a recipe, and ignores ignored files and files without a recipe
- [ ] #2 A changed fingerprint or a missing board, variant or view is a warning, and a changed picture hash alone is information
- [ ] #3 A warning for a deleted board names the commit that removed it when the vault history has it, and says when another board holds the name now
- [ ] #4 A renamed board is still found, because the recipe names it by id
- [ ] #5 --fix draws each outdated embed again from its own recipe, lists every file it rewrote, and exits 0 when nothing remains
- [ ] #6 --fix points a recipe that asks for current and the overview or Everything at the board that now holds a deleted board name, and lists each such re-pointing with the file, the old board and the new board
- [ ] #7 A PNG that --fix cannot draw again without Chromium stays reported as not fixed
- [ ] #8 The check reads a vault of a registered checkout as that checkout holds it
- [ ] #9 Only a .svg file whose content is an SVG document and a .png file count as embeds; an SVG inlined in an HTML, Markdown or MDX page is not an embed, and --fix never rewrites such a page
- [ ] #10 A changed fingerprint with an unchanged fresh picture digest is not outdated: the embed is current, and --fix only refreshes its recipe
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Context from the TASK-526.02 reviews (2026-10-24), for whoever plans this task:
- Recipe API: readRenderRecipe(bytes) and embedRecipeInPng from @archboard/renderer/recipe (packages/renderer/src/runtime/api/recipe.ts). It is cheap for the CLI to import.
- Mapping a recipe to a render request exists only as the helper requestOf in tests/system/semantic-boards/render-recipe.test.ts. Make it a production function and make that test use it. Board name from the board that holds recipe.board.id; theme from recipe.theme with fonts embedded; variant id or none for current; view id or none for overview; comparison off -> comparison=off, {against} -> against=<id>, on -> nothing; layout unless null; title true -> titled=on, words -> title=<words>; legend -> legend=<layout> plus legendOnly when alone. Send it through exportRenderRequest (apps/cli/src/cli/operations/semantic/input/semantic-input.ts) and renderSemanticBoardOnServer. A PNG draws again through rasterize with raster.scale and raster.region; its picture digest is the digest of its SVG, so a PNG compares without Chromium.
- No server route finds a board by id: resolveSemanticBoard takes a name or former name, and ListedBoardSchema has no id. Map the recipe id to a current name first (add id to the listing, or read the boards).
- The reader finds a recipe element anywhere in any non-PNG text, so an HTML or MDX page with an inline SVG reads as carrying a recipe. See the new acceptance criterion.
- The fingerprint covers the whole drawn variant and policy, not only what a view shows, so an edit outside a view moves it. See the new acceptance criterion: a warning needs a changed picture too.
- vault.repo null means the vault is in no Git repository (TASK-526.02 makes a Git failure refuse instead of writing null).
<!-- SECTION:NOTES:END -->
