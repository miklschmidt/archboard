---
id: TASK-550
title: Opening a board beside one pane is one history entry
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26T04:42:00Z'
updated_date: '2026-10-26T05:13:00Z'
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
- [x] #1 With one pane, opening a board beside it from the navigator or the About page adds exactly one history entry
- [x] #2 Back from that entry returns to the one pane on its board and view, and Forward returns to both panes
- [x] #3 The address never names the added pane before it shows the board it was added for, and the pane it was opened from stays active
- [x] #4 Adding a pane with the add control, and opening beside with two panes, each still make one history entry
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in cc492e71e as planned, with one finding on the way: livePanesOver forwarded add() without its argument, so the opening board was dropped; it forwards it now (types do not catch a dropped optional argument).

- Server: boardForNewPane(clientId, vault, asked) prefers the board the pane held, then the board its socket names (?board=), then the board in front of the person, then the vault's first board. websocket-connection.ts reads ?board= at the upgrade.
- Browser: the pane list entry carries opensOn {board, vault}; use-pane-views opens the pane in that vault and on that board; the socket names the board on every connect until one opens; use-pane-session marks board and variant as the person's (ADR 0034) when the pane opens on a board. ShellActions.addPane(beside?) resolves the vault as a show by hand does and returns whether it added a pane. use-beside-opening adds the pane on the board, tells it the view to arrive through, and selects the pane it came from at once; the pending board and its readiness effect are gone.

Tests: open-beside.test.tsx (one pane from About: the socket names shop@v2, one history entry, no address names pane B on another board or as active, B reports the board as the person's, Back is the one pane with its view; two panes: Gift wrap replaces B as one entry with no pane added; navigator Alt: the socket names the board). tests/system/server-state/pane-start.test.ts: a socket that names a board starts on it, one that names none starts on the board in front. Mutations: no board in the socket URL, no selectPane, no ADR 0034 mark, and a server that ignores the named board each fail a test.

Browser QA, dark, 1920x1080, web-shop copy, screenshots in /tmp/archboard-brainstorm/beside-history/: About Open beside on Queued fulfilment wrote one push (then a replace adding viewB), pane B drew only Queued fulfilment, pane A stayed active; Back gave the one pane on Synchronous checkout with Place an order; Forward gave both panes back; navigator Alt from a fresh one-pane page wrote one push and B drew only the proposal.

Closing: bun run check passed (exit 0, no failed test). Code check findings with and without --variant TASK-550: the same 41. Footprint read against base 4a5f13c8f (the plan commit, parent of cc492e71e). Live panes: Pane registry, Pane socket and Pane session named and changed. Browser application: Application composition, Pane session and Beside opening named and changed; Pane composition changed, not named (ApplicationPane passes openingBoard to the session options; inside only); Session lifecycle changed, not named (use-pane-session reads the opening board once, marks it and connects with it; the Pane session description above it says so). Adopted Live panes (version 69) and Browser application (version 149); archboard check reports no diagnostics. Behind: cc492e71e puts Archboard behind through its workbench and Workspace packages bindings; a socket parameter changes nothing that board draws.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
With one pane, opening a board beside it (navigator Alt or Open beside on the About page) now adds exactly one history entry. The added pane names its board on its socket and the server starts it there, so the pane never shows the other board first, the address writes the two panes once with the original pane active, and Back returns to the one pane on its board and view. Adding a pane with the add control and opening beside with two panes are unchanged. Verified by the open-beside tests, a system test of the server's starting board, dark browser QA, and the full gate.
<!-- SECTION:FINAL_SUMMARY:END -->
