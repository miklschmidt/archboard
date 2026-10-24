---
id: TASK-526.02
title: >-
  A board render carries its render recipe, and SVG renders follow the reader
  and show their legend
status: Done
assignee:
  - '@claude'
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-24T17:24:00Z'
labels:
  - renderer
  - cli
dependencies: []
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: high
type: enhancement
ordinal: 922000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A rendered file records nothing about the board it draws, so nothing can tell later whether it is outdated or draw it again. Archboard runs from a clone, so two machines can run two renderer commits, and a comparison of picture bytes alone flaps between them. ADR 0057 decides what the recipe holds and the new defaults. The owner wants an embed to work in light and dark documentation pages without options.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An SVG render holds its render recipe in its metadata element, and a PNG render holds it in a text chunk, on stdout, with --out and on the clipboard
- [x] #2 The recipe names the board by id and name, the variant by id or as current, the view by id, the variant drawn against, and the theme, layout, legend and title
- [x] #3 The recipe holds a fingerprint of the drawn input and a hash of the picture without the recipe, and no output path or board version
- [x] #4 A draft edit, a walkthrough edit or a rename leaves the fingerprint of a render of the current variant unchanged, and an edit of the drawn variant changes it
- [x] #5 The same board and recipe give the same bytes twice
- [x] #6 semantic render defaults to the auto theme and a horizontal legend, and --no-legend draws none
- [x] #7 semantic rasterize defaults to the dark theme
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Recipe schema and file codec in @archboard/renderer/recipe (packages/renderer/src/runtime/api/recipe.ts over runtime/operations/recipe/): RenderRecipeSchema (version 1, zod), readRenderRecipe(bytes) for SVG and PNG, embedRecipeInPng; the SVG writer stays inside the renderer.
2. The shared renderBoard (packages/renderer/src/shared/rules/render/board.ts) names the drawn input beside its answer: drawn variant and comparison base without walkthroughs, the view's reading, the presentation policy (relationship evidence left out), the board level, the Planned frame, the drawn title and the unsettled subjects. The Bun renderBoard fingerprints it (sha256 of canonical JSON), hashes the SVG before the recipe goes in, and writes the recipe into a metadata element when the caller gives the vault.
3. Server render route: a render that stands alone (a theme and embedded faces) passes the vault's repository identity, so every export carries its recipe; panes and semantic views get none.
4. CLI: semantic render defaults to --theme auto; render and rasterize default to a horizontal legend and take --no-legend; rasterize defaults to dark and writes the recipe (with scale and region) into an iTXt chunk of the PNG on stdout, --out and the clipboard.
5. Tests: renderer codec unit owner; a system owner for the recipe fields, the fingerprint under real draft, walkthrough, rename and current edits, stdout = --out, the same bytes twice and the defaults; the rasterize system owner for the PNG recipe and the dark default.
6. Skill render guidance (skills/archboard/references/sequences-views-walkthroughs.md), README kit keeps its pictures (--no-legend), boundaries doc names the new subpath.
7. Board proposals: Semantic renderer@TASK-526.02, Board rasterizer@TASK-526.02, Archboard server routes@TASK-526.02.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (implementer, worktree branch worktree-agent-acb5444b618ab734a):
- Recipe schema and file codec live in @archboard/renderer/recipe (packages/renderer/src/runtime/api/recipe.ts): readRenderRecipe(bytes) -> {kind: recipe|absent|unreadable}, embedRecipeInPng(png, recipe), types RenderRecipe and RenderRecipeRead. The schema (runtime/operations/recipe/schema.ts) is zod, strict, version recipe: 1. Not in @archboard/board: the render reply is unchanged, and only Bun code (server, CLI, the future check) reads a recipe; the CLI reads the SVG's recipe back with readRenderRecipe to build the PNG's.
- Recipe fields: recipe, board {id, name}, vault {repo: repository identity of the vault's checkout or null}, variant (current | {id}), view (overview | {id}, Everything included), comparison (on | off | {against: id}), theme, layout (null = default), title (string | true | null), legend ({layout, alone} | null), raster ({scale, region|null}, PNG only, theme then light or dark), fingerprint and picture (sha256:<hex>). The vault field is from ADR 0057's 'a recipe names its vault by the repository identity'; TASK-526.03/05 need it.
- Fingerprint: sha256 of canonical JSON (sorted keys) of the drawn input that the shared board answer names (packages/renderer/src/shared/rules/render/board.ts drawBoard): the drawn variant's nodes, edges and flows (no walkthroughs), the comparison base's nodes, edges and flows (the variant named by --against, else the one the board reads it against, also with --no-comparison because the layout reads it), the view's scope and grammar, the vault policy without relationship evidence (code check only), the board level, the unsettled subjects, the Planned frame and the drawn title text. Not the board name, version, other variants, view names or drawing choices. So a draft edit, a walkthrough edit or a board or variant rename leaves an untitled current render's fingerprint; a --title (names) render follows renames because its picture does.
- Picture digest: sha256 of the SVG the renderer drew before the recipe goes in; a PNG carries its SVG's digest, so the check can compare without Chromium.
- SVG: <metadata><archboard:render-recipe xmlns:archboard=...>JSON</...></metadata> closes the document (last, because HTMLRewriter loses the root's children after a metadata element and the clipboard's alt text reads svg > desc). PNG: an iTXt chunk (keyword archboard:render-recipe, UTF-8) right after IHDR.
- Only a render that stands alone (a theme and embedded faces) carries a recipe: the server route passes the vault then. Panes and semantic views get none.
- Legend default horizontal and --no-legend on both render and rasterize (shared options in apps/cli/src/cli/operations/semantic/draw/framing-options.ts), so rasterize keeps drawing the picture render draws; --legend-only now works alone; --no-legend with --legend or --legend-only is refused. Parent may decide rasterize should draw no key by default.
- Outside the fence: apps/cli/src/cli/rules/commander/commander.ts sets option.negate = false, because Commander paired --no-legend with --legend and overwrote its value; tests/system/semantic-boards/view-listing.test.ts compares the views size with a --no-legend render; docs/agents/boundaries.md names the new subpath.
- README kit renders and the thumbnail pass --no-legend so README pictures stay as they were (TASK-526.07 decides). evals/coverage.json still says --legend-only needs --legend, and eval captures now draw dark with a key: outside the fence.
- Proposals: relabelled check --code to check code on Archboard server routes@TASK-526.02 at the coordinator's request. Code check diff (check code vs --variant TASK-526.02): the proposals only clear findings (DIvMjVOy and 4RbEQ6uO anchors, step llrceIKD). Footprint against 08e81fb27^: Semantic renderer namedAndChanged Bun renderer, Board answer, Render recipe; Board rasterizer PNG recipe chunk (PNG header named only by relationship); Archboard server routes Board routes. changedNotNamed Code findings memory and Code check come from TASK-526.01 commits 63eea0409 and 11110d1bc (merged), not this task. Rasterize command is skipped by the footprint and changed by 08e81fb27, which the proposal names by its new relationship.

Review: three independent reviewers (recipe and fingerprint, CLI options and server route, recipe contract) fixed every finding in commits 2de419cb9 (anchors no longer move the fingerprint), f4bc56443 (SVG reader decodes each escape once), 60c6f5dea (bytes after IEND), 9be981456, 8370e68c3, f026a7aa7 (a render drawn again from its recipe gives back the same recipe and digests), eebe35b52, f48a7b5c3. Producer follow-ups: 3f965c673 (semantic render refuses RENDER_RECIPE_UNAVAILABLE when a stale server draws no recipe) and 63525b58b (a standalone render refuses VAULT_REPOSITORY_UNKNOWN when Git fails, so repo null means only no repository). Accepted departure: rasterize also draws the legend by default with --no-legend; ADR 0057 says so. Closing: Semantic renderer@TASK-526.02 (v84), Board rasterizer@TASK-526.02 (v77) and Archboard server routes@TASK-526.02 (v92) adopted; the code check diff showed the proposals add no finding and clear three stale anchors. After adoption the semantics check reported a relationship from Bun renderer to the Render recipe nested in it, so Render recipe now sits beside Bun renderer (v85). Gate on the merged branch: bun run check exit 0. Open for later tasks: the README kit draws from a scratch vault outside Git, so its recipes carry repo null (TASK-526.07); skill eval captures now draw dark with a legend, by the new defaults.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every standalone board render carries its render recipe: SVG in a metadata element, PNG in an iTXt chunk, on stdout, --out and the clipboard. The recipe names the board by id, the variant or current, the view, the comparison, the drawing choices and the PNG raster, and holds a fingerprint of the drawn input (without walkthroughs, anchors or evidence) and a digest of the picture without the recipe. @archboard/renderer/recipe reads and writes it. semantic render defaults to the auto theme, rasterize to dark, and both draw a horizontal legend unless --no-legend. render refuses a picture without a recipe, and a standalone render refuses when Git cannot name the vault repository. Verified by render-recipe.test.ts (system), recipe-file.test.ts, rasterize.test.ts, the CLI and server refusal tests, and a full bun run check on the merged branch.
<!-- SECTION:FINAL_SUMMARY:END -->
