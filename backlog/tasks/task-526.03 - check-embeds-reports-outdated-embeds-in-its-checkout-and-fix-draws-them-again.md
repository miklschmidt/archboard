---
id: TASK-526.03
title: >-
  check embeds reports outdated embeds in its checkout, and --fix draws them
  again
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-24T18:03:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board proposal: Command interface@TASK-526.03 adds the Embeds check module (apps/cli/src/cli/operations/vault/embeds) under Commands, called by Vault check (checkEmbeds), calling Board client (list boards, render) and Board rasterizer (PNG redraw with --fix). No other board in the fence draws what changes: the listing gains a field, no route is added or rewired.

2. Renderer: export the recipe-to-render-request mapping from @archboard/renderer/recipe, and a recipe rewrite that replaces the recipe of an SVG or PNG in place (for the fingerprint-only refresh). The system test render-recipe.test.ts uses the production mapping instead of its requestOf helper.

3. Board listing: ListedBoardSchema gains the board id, so the CLI maps a recipe's board id to the name it has now through the listing route. The server-lifecycle client lists and renders in a named vault, because a recipe can name another registered checkout's vault.

4. CLI check embeds (operations/vault/embeds): the files the repository tracks in the checkout that holds the vault, .svg and .png only. An .svg counts when its content is an SVG document, a .png when it is a PNG. A file without a recipe is no embed. Vault by repository identity through checkoutsReadFrom (own checkout for its own identity, the chosen checkout otherwise). An unregistered identity or a null repo is information EMBED_VAULT_UNAVAILABLE. Board by id via the listing, drawn again through the render route with the recipe's choices, classified per ADR 0057: EMBED_OUTDATED warning, EMBED_RENDERER_CHANGED information, fingerprint-only current, EMBED_SOURCE_MISSING warning (board, variant or view gone, with the deleting commit from the vault's history and the board that holds the name now), EMBED_RECIPE_UNREADABLE warning. --fix redraws SVG and PNG (PNG through the rasterizer with the recipe's scale and region, and without Chromium it stays reported as not fixed), refreshes the recipe in the fingerprint-only case, re-points a current plus overview or Everything recipe to the board that holds a deleted name, and lists every rewrite and re-pointing. check and check all run embeds after semantics and code. --fix belongs to check, check all and check embeds, and check semantics and check code refuse it.

5. Tests: unit owners for classification and lines (apps/cli/tests), the recipe request mapping and the recipe rewrite (renderer tests), check-parts for routing and the refused --fix. One system test over a real server and temporary repositories: committed embeds, a board edit, a rename, a deletion with re-pointing, a registered other vault, an unregistered vault, an inline SVG page, a PNG without Chromium.

6. Docs: TESTING.md and skill mention of check embeds only where a reader needs it now. The command metadata describes the codes.

7. Gate: bun run check, the remaining lanes if it stops early. Correct the proposal to what was built, then the code check diff and the footprint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Context from the TASK-526.02 reviews (2026-10-24), for whoever plans this task:
- Recipe API: readRenderRecipe(bytes) and embedRecipeInPng from @archboard/renderer/recipe (packages/renderer/src/runtime/api/recipe.ts). It is cheap for the CLI to import.
- Mapping a recipe to a render request exists only as the helper requestOf in tests/system/semantic-boards/render-recipe.test.ts. Make it a production function and make that test use it. Board name from the board that holds recipe.board.id; theme from recipe.theme with fonts embedded; variant id or none for current; view id or none for overview; comparison off -> comparison=off, {against} -> against=<id>, on -> nothing; layout unless null; title true -> titled=on, words -> title=<words>; legend -> legend=<layout> plus legendOnly when alone. Send it through exportRenderRequest (apps/cli/src/cli/operations/semantic/input/semantic-input.ts) and renderSemanticBoardOnServer. A PNG draws again through rasterize with raster.scale and raster.region; its picture digest is the digest of its SVG, so a PNG compares without Chromium.
- No server route finds a board by id: resolveSemanticBoard takes a name or former name, and ListedBoardSchema has no id. Map the recipe id to a current name first (add id to the listing, or read the boards).
- The reader finds a recipe element anywhere in any non-PNG text, so an HTML or MDX page with an inline SVG reads as carrying a recipe. See the new acceptance criterion.
- The fingerprint covers the whole drawn variant and policy, not only what a view shows, so an edit outside a view moves it. See the new acceptance criterion: a warning needs a changed picture too.
- vault.repo null means the vault is in no Git repository (TASK-526.02 makes a Git failure refuse instead of writing null).

Built (commits 0cb4fc8e5, 672905a85, b398005e3, 8f55f343b, 01c57f9d7, proposal 4ff234284 and 1c3aea9fd): check embeds in apps/cli/src/cli/operations/vault/embeds (tracked-embeds, embed-vaults, embed-drawing, embed-findings, vault-history, embeds-check), the part schema in apps/cli/src/cli/protocol/check/embeds-answer.ts, the standing and re-pointing rules and lines in apps/cli/src/cli/rules/check/embed-state.ts, wired into check, check all and check embeds in vault.ts.

Decision: the board listing carries each board's id (ListedBoardSchema.id), and the CLI maps a recipe id to the current name through it, rather than a new by-id server route. One listing per vault, then the render route by name.

Decision: the recipe to render request mapping is recipeRenderRequest in @archboard/renderer/recipe, because a system test cannot import the CLI app. render-recipe.test.ts draws through it.

Decision: a recipe whose picture is current but whose recipe differs (a changed fingerprint, or a renamed board) is current, and --fix rewrites only the recipe with replaceRenderRecipe, which keeps every other byte so a post-processor's work stays. embedRecipeInPng now drops a recipe chunk the PNG carried already.

Decision: a recipe with repo null is EMBED_VAULT_UNAVAILABLE information. A vault in no repository has no checkout, so its files are no embeds and the case where such a recipe names this checkout's own vault cannot arise. An unregistered identity is EMBED_VAULT_UNAVAILABLE information (TASK-526.05 adds fetching).

Decision: re-pointing needs variant current, view overview or Everything, and comparison on or off, because a compared variant id does not exist on the other board either. A recipe whose board, variant or view is in its vault but draws nothing now is EMBED_SOURCE_MISSING with missing picture. EMBED_RECIPE_UNREADABLE is a warning.

Code check diff (check code with and without --variant TASK-526.03 after correcting the anchors to embed-drawing.ts): no new finding, one cleared (RELATIONSHIP_UNDRAWN Commands to Board rasterizer, which the embeds check's rasterizer call made).

Footprint read against base 0cb4fc8e5^ (the commit before this task's first code commit; the branch base main lacks the TASK-526 branch, so main would show the work of TASK-526.01 and .02). namedAndChanged: Board client, Vault check, Embeds check. changedNotNamed: Command catalogue (run.ts gains the check embeds entry in the table, a contract per command as drawn, b398005e3) and Commands (container of the named parts). namedNotChanged: none. Board rasterizer is a drill-down: its board is behind by png-recipe.ts (embedRecipeInPng drops an earlier recipe chunk, an internal change), and Semantic renderer by the recipe folder (render-request.ts and replaceRenderRecipe added inside Render recipe). Both stay true; neither draws the CLI as a caller, and adding the embeds check there is for the parent to decide.
<!-- SECTION:NOTES:END -->
