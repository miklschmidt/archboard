---
id: TASK-259
title: A check that cannot be answered does not run on frozen history
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-17 22:29'
updated_date: '2026-09-17 22:51'
labels: []
dependencies: []
references:
  - src/runtime/semantic-board-store/lib/drill-down.ts
  - docs/adr/0029-a-node-standing-for-another-board-carries-that-boards-level.md
  - TASK-257
ordinal: 466000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A historical variant refuses content edits on purpose — what was true then does not change — so a diagnostic about its content names something no accepted write can repair. `./bin/dogfood check` sits at exactly one warning today and it is that shape: `Renderer layout`/`Initial` carries `Render driver`, kind `function`, opening the `Semantic renderer` board at level `module`, which ADR 0029 asks to agree. The drill-down checks added with that ADR (src/runtime/semantic-board-store/lib/drill-down.ts) read every variant, current, draft and historical alike.

This is the last thing standing between the vault and a clean check, and it is why TASK-255 and TASK-257 each sit one acceptance criterion short. It also decides the shape of TASK-260: a check whose answer depends on the world outside the board belongs over the variants somebody can still edit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A diagnostic about a variant's content is reported for current and draft variants and not for historical ones
- [x] #2 `./bin/dogfood check` reports no diagnostics against the tracked vault
- [x] #3 A test owns the exemption, including a historical variant that would fail the check if it were current
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Classify every vault diagnostic by whether an accepted write can repair it on a frozen variant. Content diagnostics (repairable only by a content edit to the variant that carries them): DRILL_DOWN_ONLY_NODE, DRILL_DOWN_UNKNOWN_BOARD, DRILL_DOWN_LEVEL_MISMATCH. Not content diagnostics: INVALID_CONFIG, VAULT_UNREADABLE, BOARD_UNREADABLE, BOARD_MISSING, DUPLICATE_BOARD (none is about a variant), and UNKNOWN_VOCABULARY (its subject is the vault configuration, and its repair — defining the value in .archboard/config.yaml — is an accepted write that clears it on a historical variant too).
2. Add one named seam in the store, src/runtime/semantic-board-store/lib/content-checks.ts, saying which variants a content diagnostic runs over: every variant that still accepts content edits, i.e. lifecycle other than historical. TASK-260's binding check reuses it.
3. Make semanticDrillDownDiagnostics walk that set instead of board.variants, and say why in the file comment.
4. Own the exemption in src/runtime/semantic-board-store/tests/drill-down.test.ts: a board whose only variant carries a level mismatch is reported; after branching a repaired proposal and adopting it, the same content is frozen as historical and reported no more, while a draft that introduces a mismatch is still reported.
5. Run the focused module owner with --max-concurrency=1, then ./bin/dogfood check to prove the tracked vault is clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Classification. A vault diagnostic is a *content* diagnostic when the only accepted write that clears it edits the content of the variant it points at. On a historical variant that write is refused (VARIANT_HISTORICAL), so the warning names a repair the store will never take.

Content diagnostics (exempted on historical variants): DRILL_DOWN_ONLY_NODE, DRILL_DOWN_UNKNOWN_BOARD, DRILL_DOWN_LEVEL_MISMATCH. Every repair each of them names — draw the real participant and move the link onto it, point the link elsewhere or drop it, carry the target board's level as the kind — rewrites that variant's own nodes.

Not content diagnostics: INVALID_CONFIG, VAULT_UNREADABLE, BOARD_UNREADABLE, BOARD_MISSING and DUPLICATE_BOARD are about the config file, a directory, a file or two filenames, and name no variant at all.

UNKNOWN_VOCABULARY, decided explicitly: it keeps running over every variant, historical included. It sits at a content path but its subject is the vault configuration — the board did not change, a definition was removed from .archboard/config.yaml — and the repair the message leads with, defining the value again, is an ordinary accepted write that clears it on frozen history exactly as on current. History is still drawn with that vocabulary (neutral appearance when the definition is gone), so silencing it there would hide a real, repairable gap rather than a question nobody can answer.

Implementation. New seam src/runtime/semantic-board-store/lib/content-checks.ts: acceptsContentEdits(variant) is lifecycle !== 'historical', contentCheckedVariants(board) is the variants a content diagnostic runs over, with the reasoning above in its header. semanticDrillDownDiagnostics now walks that set instead of board.variants. transitions.ts was deliberately left alone (another worker owns the variant lifecycle), so the frozen rule is still stated once there and once here.

Validation. bun test --isolate src/runtime/semantic-board-store/tests/ --max-concurrency=1: 143 pass, 0 fail. Flipping drill-down.ts back to board.variants makes the new frozen-history test fail with the mismatch it should no longer report, so the test owns the exemption rather than passing vacuously. bun run type-check, bun run lint and bun run fmt:check all clean. The canvas had to be restarted (./bin/dogfood stop && start) because check answers from the server's source.

Follow-up while implementing TASK-260: acceptsContentEdits is spelled as an allowlist (lifecycle is 'current' or 'draft') rather than 'not historical'. The variant-lifecycle worker added a 'shelved' lifecycle mid-task, and transitions.ts refuses content edits on it too (VARIANT_SHELVED), so 'not historical' would already have been wrong. Naming what the checks admit makes a later kept-state lifecycle silent until somebody decides it belongs, which is the safe direction: the cost of the other one is a warning nobody can clear.

Not done here, and outside this worker's files: skills/archboard/references/authoring.md documents DRILL_DOWN_LEVEL_MISMATCH and UNKNOWN_VOCABULARY for authors and says nothing about the frozen-history exemption or TASK-260's BINDING_PATH_MISSING. skills/** belongs to another worker.
<!-- SECTION:NOTES:END -->
