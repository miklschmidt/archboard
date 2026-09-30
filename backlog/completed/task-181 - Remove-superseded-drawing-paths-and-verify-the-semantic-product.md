---
id: TASK-181
title: Remove superseded drawing paths and verify the semantic product
status: Done
assignee:
  - '@claude-cutover'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 04:58'
labels:
  - ready-for-agent
dependencies:
  - TASK-180
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 332000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Complete the replacement so agents and maintainers face one authoritative model and one supported workflow rather than permanent compatibility machinery.

## Blocked by

TASK-180

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Remove superseded Excalidraw, Obsidian, free-drawing, stencil, promotion, native-element conversion and geometry-inference runtime callers/dependencies after semantic consumers are integrated.
- [x] #2 Preserve existing legacy board files without mutation; document the intentional lack of automatic migration or legacy opening support.
- [x] #3 Update active product docs, domain language, CLI guidance and tracked skills to the shipped semantic behavior, preserving relevant claims, persistence and workhorse guarantees.
- [x] #4 Run the full repository check, resolve touched-scope warnings and integration failures without weakening checks, perform final app verification, and simplify the resulting design.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace legacy application pane substrate and navigation with semantic consumers, coordinating the semantic agent-context interface. Remove superseded Excalidraw/Obsidian runtime callers and dependencies while preserving required font measurement, claims, sessions and legacy files. Update active docs and developer guidance; verify focused behavior before integration. Final acceptance remains after real example, full repository check and simplification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User authorized early independent cutover in an isolated worktree for speed. Opus5 high worker w1E:pA owns /home/msc/Projects/archboard.feat-semantic-runtime-cutover from snapshot tree cc657a18b35b11401b51497057248cad0793b9ce. Main process retains semantic schema/store/renderer/viewer and lifecycle APIs. Legacy board files must remain untouched; no migration. Parent owns final integration, example and complete gate.

Integrated w1E:pA's cutover delta (697 files, 501 deletions) into the working tree from their manifest, after two rehearsals on copies of the tree caught defects before they could land: an incomplete rename in the first artifact (twelve lost deletions, including the whole src/ui/canvas to src/ui/pane-session move and CanvasStages.tsx, caused by `git diff --name-only` collapsing a rename to its destination), and the overlap set needing verification rather than the manifest's take-mine rule.

Four files were merged by hand rather than taken: server/canvas/index.ts (main's, minus the three exports the cutover drops, so p9's six survive), codex-semantic-input.ts (main's TASK-179 context layer kept; pA's inline version had no semantic-board-context.ts to delegate to), the CLI runner's move (the optional env that carries ARCHBOARD_PANE), and the two level-reading owners pA's copy was missing.

Defects found and fixed during integration: the context read the pane's full address where the store refuses one, and compared a report's key exactly against the aggregate, dropping the variant, view and selection of any pane showing a proposal; the change feed read `paneId` while the announcement published `by`, so every settled change arrived unattributable — the wire shape now has one author, built and read in the same module; the inspector said 'Planned' about a node that is merely unbound, and drew a Description heading over nothing; the open-code button's label ran out of the pane; a voice-context owner still asserted the pre-TASK-179 selection shape.

TEST FIXTURE CONTAMINATION, recorded because it is the reason the prevention exists. ARCHBOARD_VAULT was set in the working session's environment to a real vault outside this repo, and 72 entries were observed there, 71 written in a nine-second burst and one at 03:33:08 — names and timestamps consistent with this repo's semantic fixtures. Not every entry is asserted to be ours; none were moved. The one file confirmed by content is /home/msc/Work/Platform-Architecture/architecture-vault/Ingest pipeline.semantic.json, sha256 e1ff3f895e811e17318cd5a1f3aa664db62801cfa3fb827e343e6f5648cceb84, 2523 bytes. Everything was left byte-intact pending provenance confirmation.

Cause, reproduced in a temp vault rather than assumed: the vault is read from the environment once, when the config module is first imported, and an import runs before any statement in the file that sets it. `bun test` over the store suite without --isolate shares one process, so the first file to resolve the vault fixes it for all of them; with the variable set in the environment, that is whatever vault the caller had. The repository's own scripts always pass --isolate, which is why `bun run check` never did this.

Prevention: src/runtime/semantic-board-store/tests/own-vault.ts refuses before the first write when the resolved vault is not the one the test made, naming where the write would have landed. It imports nothing, because importing anything that pulls the config is the bug itself. Wired into all nine store owners and the agent-context owner; verified by running the unsafe combination, which now fails loudly and writes nothing.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-09-11 19:04
---
Carried from TASK-171: the semantic renderer currently measures and draws in Nunito and Cascadia Code, the families @excalidraw/excalidraw ships as files, because that is what src/runtime/engine/measure-text.ts can measure today. They are regular-weight only, so the renderer emits no font weight above normal and builds hierarchy from size, colour, case and tracking. The repository already owns better faces for this — Onest (variable 400-700) and DM Mono in src/ui/shell/assets/fonts, registered by src/ui/theme/app.css as the shell's own type. Removing the last Excalidraw dependency means teaching src/runtime/engine/font-file.ts to read plain sfnt files as well as woff2, then measuring Onest and using real weights. Detail is in src/runtime/semantic-renderer/NOTICE.md under 'A first-slice choice, not a settled one'.
---

author: @claude
created: 2026-09-11 19:09
---
Superseded: the font work described in the previous comment was pulled forward into TASK-171 after a review found the emitted SVG named Nunito and Cascadia without registering either, so a standalone export drew in whatever the host had rather than in what the server measured. src/runtime/engine/font-file.ts now reads plain sfnt as well as woff2, src/runtime/engine/measure-text.ts exposes measureLineIn() for a caller-named face stack, and the canvas serves the shell's own faces at /assets/diagram-fonts. Nothing about fonts is left for this ticket.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Excalidraw is gone from the product. The drawing paths, the note conversion, the geometry inference, the stencils, the promotion and the free-drawing surface went with their runtime callers — 501 files deleted — and what is left is one kind of board: a semantic document an agent authors as meaning and a renderer draws. The shell opens boards from a navigator, a pane addresses a board and the variant it is reading, and following a link down a level moves the pane's own address so that everything keyed to 'the board this pane holds' — the inventory, the claim, the code a picked node opens, the file the canvas watches — follows it there.

Legacy notes are preserved exactly: nothing reads, writes or migrates a .excalidraw.md, and the one in the verification vault is byte-identical before and after the whole cutover and its QA, by md5. The lack of automatic migration is deliberate and documented, in the skill and in ADR 0023.

Verified by `bun run check` exiting 0 on the real checkout, read from the command's own status rather than a pipeline's: both type-check programs, lint, formatting, 2706 module tests, 155 system tests, 8 repository-policy tests and the twelve-owner serial browser lane, with zero failures. Verified again by hand at 1920x1080 through the integrated build: both grammars, the walkthrough rail, a drill-down that moves the address and offers the way back, the bound repository with a working open, the variant bar showing current, draft and historical together, and a blocked draft naming the state whose decision it waits for. The parent's independent QA passed the same ground.

Three peers built this in separate worktrees; the integration was rehearsed twice on copies of the tree before anything was applied, which is what caught an incomplete rename in the published delta and two files whose newest versions the manifest would have overwritten.
<!-- SECTION:FINAL_SUMMARY:END -->
