---
id: TASK-026
title: 'Expose the library catalogue to agents: CLI, MCP, and the skill'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 21:43'
updated_date: '2026-08-19 22:55'
labels:
  - needs-triage
dependencies:
  - TASK-025
ordinal: 26000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A registered CLI command lists the catalogue and inserts an item by name
- [x] #2 An equivalent MCP tool exists, registered alongside the others
- [x] #3 The excalidraw skill documents it, so an agent discovers it without being told
- [x] #4 Listing carries enough to choose between items without rendering them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract the catalogue + insertion logic out of src/cli/commands/library.ts into a new core module (src/core/library-catalogue.ts): name resolution, a per-item digest, candidate selection with typed not-found/ambiguous errors, and the fresh-id remap + place. CLI and MCP then call the same code instead of MCP reimplementing insert.
2. Make the listing choosable-from without rendering (AC #4): add bounding-box size and the stencil's own text to each entry, alongside name, source, id and element count. Same digest serves CLI JSON, CLI --text and MCP.
3. Add MCP tools list_library_items and insert_library_item in src/core/mcp-tools.ts with dispatch arms in src/core/mcp-dispatch.ts. Ambiguity is a decision the caller has to make, so insert refuses and returns both candidates with their source and id (the save_board conflict shape), never a silent pick.
4. Pair both in scripts/check-surface-parity.mjs PAIRS and delete the two 'MCP lags' CLI_ONLY entries; add a Library section to skills/excalidraw-skill/references/cheatsheet.md so the parity check's cheatsheet gate passes.
5. Document it in skills/excalidraw-skill/SKILL.md: a quick-reference row plus a short 'Workflow: Stencils' section in the shape of the existing workflow sections. Run node scripts/sync-skills.mjs.
6. Verify over MCP stdio on port 3400 (EXPRESS_SERVER_URL=http://127.0.0.1:3400): list, insert by name, ambiguous insert refused, inserted stencil lands as ordinary plain elements. Then bun run test and bun run type-check. Leave the canvas cleared.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
MCP half and the skill section are in.

Shape of the change: the catalogue and insertion logic moved out of the CLI command into src/core/library-catalogue.ts, so both surfaces call one implementation and cannot answer differently. It exposes readCatalogue / catalogueText / chooseStencil / remapElements / insertStencil, plus AmbiguousStencilError and UnknownStencilError. The errors deliberately carry the candidates but not the retry wording — one surface has flags, the other has fields — so each appends its own.

MCP tools (src/core/mcp-tools.ts, dispatch arms in src/core/mcp-dispatch.ts):
- list_library_items (no params) returns the table, not JSON: 111 stencils as pretty-printed objects is ~1000 lines of context to answer 'what can I draw with'.
- insert_library_item {x, y, name|itemId, source?} places a copy with its top-left at (x, y) and returns name, source, itemId, count and the new element ids — not the artwork.

AC #4, choosable without rendering: an entry now carries name, source library, bounding-box size, element count, id, and the words drawn inside the stencil when those are not merely its name (53 of 111 names were read off that text in TASK-025, so repeating it would be noise; 17 differ and earn the field). Size does real work: system-design's Docker is 73x95, drwnio's is 1224x509.

Ambiguity is surfaced, not swallowed. insert_library_item returns isError with the message plus {ambiguous, candidates} — every candidate with its source, id and size — in the shape save_board uses for a refused write. The CLI exits 2 with the same candidates and 'Disambiguate with --source or --id'.

Skill: skills/excalidraw-skill/SKILL.md gained a 'Workflow: Stencils' section in the shape of the existing ones (what the palette is, listing is choosable-from, --x/--y is the top-left and the stencil keeps its size, ambiguity is refused, what lands is ordinary elements, when to prefer a stencil over a labelled rectangle, and the two MCP names), a quick-reference row, and branch (7) in the description so the skill fires on stencil work. references/cheatsheet.md gained a Stencil Library section on both the CLI and the MCP side. node scripts/sync-skills.mjs run.

Parity ledger shrank: 'library list' and 'library insert' left CLI_ONLY and joined PAIRS. 37 MCP tools against 42 CLI entries — 32 paired, 10 CLI-only (was 12), 3 MCP-only. Two 'MCP lags' debts remain (changes, snapshot list).

Coverage: scripts/check-library.mjs gained 21 checks over the two decisions the catalogue makes for both surfaces — which stencil a name means (case-insensitive match, source settles a collision, ambiguous refuses with both candidates, unknown name/id/source refuse) and what a placed copy is (fresh ids, group ids remapped, arrow bindings and containerId following them, v1 'draw' becoming 'arrow', translation not distortion, attribution recorded, the library item itself unmutated).

Verified on port 3400 by driving dist/index.js over real MCP stdio: tools/list serves both; list_library_items returns 118 lines; insert by name+source placed 9 plain elements; insert by itemId placed 4; 'Database' was refused with all four candidates; an unknown name and a call with neither name nor itemId both came back isError. describe then reported '0 nodes, 22 elements, nothing carries archboard metadata' with the bounding box starting exactly at the requested top-left, and customData.library recording provenance — so a stencil lands as ordinary elements. bun run test exits 0 (5 stdio wire checks, 108 obsidian, labels, library 47, parity) and bun run type-check is clean. Canvas cleared and the 3400 server stopped.

Orchestrator verification: parity ledger shrank from 12 CLI-only to 10, with both library entries moving into PAIRS, which is the check doing its job rather than an allowlist being edited. 47 library checks and the full suite green.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 21:43
---
Split out because TASK-025 was deliberately barred from touching src/cli/run.ts while TASK-023 and TASK-024 are live in the same tree — registering a command there would have collided.

So TASK-025 delivers the catalogue and the insertion logic; this delivers the surface. Three layers are needed for an agent to actually use library items and only the first is covered:

1. catalogue data + insertion  (TASK-025)
2. registered CLI command and MCP tool  (here)
3. a section in skills/excalidraw-skill/SKILL.md  (here)

Layer 3 is the one that is easy to forget and decides whether this is ever used: an agent's sense of what archboard can do comes from the skill, so a registered tool absent from it is a tool nobody calls. The skill already has a Workflow section per capability — promotion, panes, comparing variants — and this should follow that shape.

Listing needs to be choosable-from without rendering: name, source library, rough size, and probably a short description, since 'Server' and 'Device' are not distinguishable from a name alone.
---

author: @claude
created: 2026-08-19 21:50
---
SCOPE CHANGED by TASK-023. A 'library list' CLI command now exists and is registered in src/cli/run.ts, and library items live on the canvas server (ADR 0007) rather than in the frontend. So layer 2 of the three is partly built already.

What remains here:
- extend the existing command rather than adding a second one (insertion by name, at a position)
- the MCP tool — but see the open question below, this may be moot
- the skill section, which is still the layer that decides whether any of it gets used

Open question that should be settled before building the MCP half: the user has asked whether to keep the MCP surface at all, given it is ~1618 lines against the CLI's ~1500 for the same capabilities over the same core, and both consumers have a shell. If MCP goes, this task loses its middle acceptance criterion. Do not build an MCP tool for the library until that is decided.
---

author: @claude
created: 2026-08-19 22:08
---
Unblocked by ADR 0008: MCP stays, so the library MCP tool is worth building. Build the CLI side first and treat the tool as following it.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stencils are reachable from a client with no shell. The catalogue and insertion logic moved into one core module that both surfaces call, so the CLI and the two new tools cannot drift apart. Listing returns a table rather than JSON, because 111 stencils as objects is about a thousand lines of context to answer what can I draw with. The skill gained a Stencils workflow, which is the layer that decides whether any of it is used.
<!-- SECTION:FINAL_SUMMARY:END -->
