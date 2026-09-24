---
id: TASK-281
title: Rename semantic boards and variants without losing identity or links
status: Done
assignee:
  - '@claude'
created_date: '2026-09-19 16:15'
updated_date: '2026-09-24 00:18'
labels:
  - needs-triage
dependencies: []
references:
  - src/runtime/semantic-board-store
  - src/cli
documentation:
  - docs/adr/0010-board-names-are-case-insensitive.md
  - skills/archboard/SKILL.md
type: feature
ordinal: 495000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user of the Docs-Architecture-Design vault asked to give every board and variant proper human-readable names. Existing boards have slug-like names such as platform-public-api and common-weblib; variants include Initial and public-api-independent. The installed semantic CLI can create names but cannot change existing board or variant names, and semantic edit exposes no naming metadata. The consumer skill correctly refuses direct edits to server-owned board files, so the request cannot currently be completed.

Enable agents to improve these names through the supported authoring interface while retaining the architecture, variant history, and navigation readers already use. Example outcomes: platform-public-api becomes Platform Public API, and public-api-independent becomes Independent Public and Phone APIs. Renaming must remain a metadata operation, not a delete/recreate or adoption operation. Keep the browser read-only. This task covers the naming capability, not renaming a particular consumer vault or unrelated node/icon work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent can rename an existing semantic board and an existing variant through a documented CLI operation, including names containing spaces, without editing vault files directly.
- [x] #2 Renaming preserves board, variant and subject IDs, all architectural content, variant ancestry, lifecycle, reconciliation and adoption history; it does not create replacement boards or variants.
- [x] #3 Board listings, variant selectors and open readers show accepted names. Existing drill-down references, including named-variant links, remain valid; saved pane URLs remain resolvable or receive a deterministic redirect to the renamed subject.
- [x] #4 Renames obey expected-version checks, leases and claims. A stale, conflicting or invalid request leaves the vault and its references unchanged, with an actionable diagnostic.
- [x] #5 Name validation follows the existing board addressing and collision rules, including case normalization and the @ delimiter; variant-name collisions within a board are refused. Case-only and unchanged-name requests have explicit, tested behavior.
- [x] #6 CLI help, consumer skill recipes/references and applicable generated schemas describe the supported naming workflow. Focused behavioral tests cover successful board/variant renames, identity and link preservation, live-reader refresh, collisions and stale-write refusal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Contract: optional formerNames on a board and on a variant (shared/semantic-board). A variant's name and former names are one address space inside the board (family integrity); findVariant answers id, then name, then former name. No schema-version bump: the fields are additive and optional, and a bump would rewrite every board of every vault on first read.
2. Store: a rename transition (board or one variant; NAME_UNCHANGED for an identical name; case-only board rename keeps the key and records no former name; variant collisions refused). resolveSemanticBoard: a name answers to the board whose file carries it, else to the board that formerly carried it (vault scan on a miss only). Reads and the write boundary resolve through it. The write boundary follows a candidate's new name: it refuses a name another board answers to, takes the new key's lease without waiting, moves the file durably and writes the board, as one accepted version.
3. Server: POST /api/semantic-boards/rename through the same envelope, --doing and expect-version. After a board rename, panes on the old name are pointed at the new one, the renamer's claim and doing lines move with the board, the listing reports drill links under accepted names, pane show and claims resolve former names to the board's own name.
4. CLI: archboard semantic rename <board> --to <name> [--variant <variant>], semantic client call, audit entry.
5. UI: the drill-down panel names and opens the target by its accepted name and matches a named variant by former name too.
6. Docs: ADR 0036 (a renamed board keeps answering to its former names), CONTEXT.md term, consumer skill recipe, schema obligations.
7. Tests: store contract (identity/history preserved, file moved, collisions, stale version, lease, unchanged/case-only), system CLI workflow (drill link and pane URL resolution, live pane re-pointed, listing), UI drill-target unit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision (ADR 0036): a rename is one write to one board, and the renamed board or variant keeps its old names in formerNames, which go on resolving. Chosen over rewriting every drill-down in the same write because boards are independent documents with no cross-file transaction (ADR 0023), a rewrite would edit frozen history, and it would still leave saved pane addresses, browser history and prose outside the vault naming nothing. formerNames answers all of them with one field and leaves no obligation on any other board or caller. A board's own name always wins over another board's former name; a former name is not free for another board (create and rename refuse it with BOARD_EXISTS); a board may take one of its own former names back.
Board file: the write that renames a board moves its file to where the new name lives (moved first, then written, so a crash leaves one file the reader refuses by name rather than two coherent boards); a failed write after the move moves it back. The new key's lease is taken without waiting (BOARD_HELD when somebody holds it). A case-only board rename keeps the key, records no former name and re-spells only the file's own segment; directories on the way keep their spelling.
Unchanged name: refused with NAME_UNCHANGED, no version advance. Variant names stay exact-match, so a case-only variant rename is an ordinary rename and the old spelling is kept. Variant collisions (another variant's name, former name or id) refuse VARIANT_EXISTS; names with @ or other reserved characters refuse INVALID_NAME. Any variant may be renamed whatever its lifecycle (a name is an address, not content).
No schema-version bump: formerNames is optional and additive; a bump would have made every board of every vault rewrite itself (version+1) on first read through the migration path, and an older build refuses the unknown field by name either way.
Server follow-ups on a board rename: panes on the old key get pane_board with the accepted address (so the address bar is replaced with the new name), this canvas's claim is carried to the new key for the rest of its campaign (warning CLAIM_NOT_CARRIED if it cannot be), doing lines move with the board, the change feed says the board was renamed. pane show, claims, reads and writes resolve former names; the listing reports drill links under accepted names; vault diagnostics accept a drill-down naming a former name.
UI (minimal): the drill-down panel matches a named variant by former name, names and opens the target by its accepted name, and hears its news under that name.

Evidence: src/runtime/semantic-board-store/tests/renaming.test.ts (identity and history preserved, file moved, old names resolve for reads and writes, drill-down diagnostics, stale version, board/variant collisions, invalid name, unchanged and case-only, taking a former name back, new-name lease held); tests/system/semantic-boards/renaming.test.ts (CLI rename of board and variant, stale refusal, live pane re-pointed, listing links under accepted names, saved pane address resolved to the accepted one, taken name refused, claim follows the board); src/ui/semantic-board-canvas/tests/semantic-board-inspection.test.tsx (drill-down written before a rename opens board and variant under their new names). Gates on 5a781469: type-check, lint, fmt:check pass; test:modules 3389/0; test:system 180/0; test:repository 8/0; test:serial-browser 18/0. Manual: a scratch copy of .archboard/vault renamed Canvas server to Archboard server at version 10->11; check reported no unknown drill-downs; the old name still reads the board.
Left out: a pane's selected view and selection are cleared when a rename re-points it (usePaneReadings treats a new board key as a new board); a pane that had drilled into a renamed board keeps the old name on its drill stack until reopened (it still reads it through the former name).

Merged into main (3960a666), then the TASK-324 rename applied to its new code (renameSemanticBoardOnServer, @/server/archboard paths, owned-server test support) in the merge 6222d6eb. Gate on the merged tree, lanes one at a time: type-check, lint, fmt:check, modules, system, repository and serial-browser all exit 0 (3584 tests). The dogfood board "Canvas server" is renamed once the dogfood server runs the new code.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard semantic rename renames a board or a variant as one write to that board; ids, history and content stay, the old name is kept as a former name that keeps resolving for drill-downs, saved pane URLs and claims (ADR 0036), and open panes follow. Verified by the store and system renaming owners, the UI inspection test and all gate lanes on the merged tree.
<!-- SECTION:FINAL_SUMMARY:END -->
