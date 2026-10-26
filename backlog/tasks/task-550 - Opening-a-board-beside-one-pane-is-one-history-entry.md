---
id: TASK-550
title: Opening a board beside one pane is one history entry
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T04:42:00Z'
updated_date: '2026-10-26T04:51:00Z'
labels:
  - ui
  - compare
dependencies: []
priority: medium
type: bug
ordinal: 952000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With one pane, opening a board beside it (Alt on a navigator row, or Open beside on the About page) makes two history entries. The second pane is added first, showing the board of the active pane, and that is pushed. Then the board opens in it, and that is pushed too. Back from two panes therefore lands on two panes that show the same board, not on the one pane the person had. With two panes, opening beside replaces the other pane and is one entry already. The owner asked for this fix on 2026-10-26, after TASK-538.04 QA found it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With one pane, opening a board beside it from the navigator or the About page adds exactly one history entry
- [ ] #2 Back from that entry returns to the one pane on its board and view, and Forward returns to both panes
- [ ] #3 The address never names the added pane before it shows the board it was added for, and the pane it was opened from stays active
- [ ] #4 Adding a pane with the add control, and opening beside with two panes, each still make one history entry
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
The pane added for a board beside opens on that board. Today the server starts every new pane on the board in front of the person, the address writes that down as one entry, and the board then opens in it as a second one. If the added pane names its board when it connects, there is no state between one pane and both, so the panes intent the add already expects is the one entry, and the pane draws no copied board first.

1. Server: packages/workbench/src/server/services/panes/registry.ts boardForNewPane(clientId, vault, asked) takes the board the socket names. Order: the board the pane held before its socket dropped, then the named board, then the board in front of the person, then the vault's first board. Each is used only while it is still there. apps/server/src/server/sockets/panes/websocket-connection.ts reads ?board= from the upgrade.
2. Socket: apps/web/src/ui/clients/pane-session/pane-socket.ts connect(startsOn) names the board in the socket URL on every connect until a socket opens. hooks/pane-session/use-pane-session.ts reads the pane's openingBoard once, marks board and variant as the person's (ADR 0034), as a show by hand does, and connects with it. rules/pane-session/session-contracts.ts gains openingBoard. ApplicationPane passes it.
3. Pane list: rules/application/pane-list.ts PaneEntry gains opensOn {board, vault}; addPane(list, opensOn) and freePaneId(list). pane-moves, use-panes add(opensOn). use-pane-views opens each pane in the vault and on the board of its entry, else the served vault.
4. Shell: ShellActions.addPane(beside?) resolves the vault of a board beside as selectBoard does (placeFor over the active pane), raises the same notice when it cannot, expects the panes intent, and returns whether it added a pane.
5. hooks/application/use-beside-opening.ts: with one pane it adds the pane on the board, tells it the view to arrive through, and selects the pane it came from at once, so the entry has that pane active. The pending board, its effect and the readiness wait go. Two panes: unchanged.
6. Tests: open-beside.test.tsx (the second socket names the board; one history entry; Back is the one pane on its board and view; Forward is both). A system test: a socket that names a board starts on it, and one that names none starts on the board in front of the person.
7. Docs: the registry and socket comments, docs/design/operator-canvas-shell.md if it says how the second pane opens.

Proposals: Browser application@TASK-550 (Beside opening, Pane session socket naming the board). Live panes@TASK-550 (A socket starts a pane: the board the socket names; A page connects its socket: the socket names it).
<!-- SECTION:PLAN:END -->
