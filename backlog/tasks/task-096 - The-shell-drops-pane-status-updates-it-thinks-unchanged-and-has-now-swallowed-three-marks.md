---
id: TASK-096
title: Suppress only complete duplicate pane status publications
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-22 17:47'
updated_date: '2026-08-28 01:57'
labels: []
dependencies: []
references:
  - src/ui/shell/Shell.tsx
  - src/ui/canvas/useCanvasSession.ts
  - scripts/check-fixed-point.mjs
priority: high
type: bug
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shell must store every material PaneStatus publication so held, note-written-elsewhere, and doing marks cannot be swallowed. It must also suppress complete duplicate publications, because status-only shell updates rerender the hosted CanvasPane and can disturb local edit persistence.

Replace the partial field comparison with an exhaustive, type-checked comparison over every PaneStatus key. Compare scalar fields by value and the audited immutable nested values by reference. Replace the shell's stored status whenever any material published value changes. Keep the existing event-driven publication points and rendered browser coverage. Do not add generic deep equality, schema reflection, a generated comparator, or a new state framework.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shell suppresses only complete duplicate PaneStatus publications through an exhaustive type-checked comparison and replaces the stored pane status for every material publication.
- [ ] #2 Held state, note-written-elsewhere state, board identity, element count, connection state, and all doing entries still reach the visible shell in the browser checks.
- [ ] #3 The change adds no generic deep equality, generated comparator, schema reflection, or replacement state framework.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In `src/ui/shell/Shell.tsx`, restore a local `samePaneStatus` guard that is exhaustive over the actual ten-key `PaneStatus` shape. Build a `same` object with one boolean for `paneId`, `clientId`, `connected`, `board`, `boardKey`, `elementCount`, `lastChangeAt`, `hold`, `writtenElsewhere`, and `doing`; require it with `satisfies Record<keyof PaneStatus, boolean>` and return `Object.values(same).every(Boolean)`. Compare scalar fields by value and the four nested values by reference. Every material publication replaces those nested objects or arrays, while genuinely duplicate publications retain them.
2. Keep `onStatus` local to the shell: return the previous state only when the exhaustive guard says every current key is unchanged; otherwise replace the pane entry with the complete published `PaneStatus`. Add no deep equality, serialization, schema reflection, generic state machinery, shell memoization, or `CanvasPane` change.
3. Add no test file. `bun run type-check` is the regression gate for a future unhandled `PaneStatus` key. Existing rendered checks already exercise the product behavior: `test:browser` covers board identity, element count, connection chrome, and doing history; `test:live-session` covers suppression of duplicate status publications through human-edit persistence, plus held state, external-note state, doing lines, and disconnection. Preserve `scripts/check-fixed-point.mjs`.
4. Run `bun run build`, `bun run type-check`, `bun run lint:code`, and `bun run fmt:check`. After the parent releases the browser lane, run `bun run test:browser` and then `bun run test:live-session`, strictly sequentially.
5. Replace the rejected unpushed implementation by amending commit `0127585`, so the fixed range contains one coherent TASK-096 commit rather than a known-broken intermediate commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audited the full PaneStatus publication contract. The previous guard compared only selected scalar and nested fields. It omitted paneId; board.board; hold.board, fromScreen, conflict, and message; writtenElsewhere.board, file, lastReadAt, versionMove, ourVersion, and message; and doing content, writer, kind, claimed state, older timestamps, order, and replacement at a stable length. Those omissions had already hidden held state, note-written-elsewhere state, and agent doing lines.

Implemented a shell-local guard that names all ten PaneStatus keys in a boolean object checked with satisfies Record<keyof PaneStatus, boolean>. Scalar values compare by value. The audited board, hold, writtenElsewhere, and doing publishers replace their immutable nested values, so the guard compares those values by reference. Shell state now suppresses only a publication whose complete current shape is unchanged.

The earlier live-session failures in this dot-prefixed Codex worktree were not evidence that Shell status updates broke human-edit persistence. Exact-base and candidate Shell bundles failed at the same first hold/report boundary. TASK-131 identified and fixed the validation prerequisite: Excalidraw CSS was not served from dot-prefixed repository paths. TASK-096 validation must run with reviewed prerequisite 646fe3b78f05af183cae82e6f5ef9390c247925e applied separately.
<!-- SECTION:NOTES:END -->
