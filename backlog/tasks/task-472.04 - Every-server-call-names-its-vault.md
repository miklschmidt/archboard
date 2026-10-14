---
id: TASK-472.04
title: Every server call names its vault
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-14 23:27'
labels: []
dependencies:
  - TASK-472.01
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 824000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The server resolves every board call against the one vault it started with. ADR 0049 requires every call to name its vault, because one server will serve every vault and has no working directory. Expand step: the server still starts with `ARCHBOARD_VAULT`, and until the navigator task the browser addresses that one vault, which the server reports to it. The CLI already knows its vault and sends it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every board route (list, read, render, the writes, claim, release, take-back, locality, footprint, vault check, code check, code findings, pane show, semantic context and code target open) refuses a call that names no vault, and the refusal says how to name one
- [ ] #2 The CLI names its vault on every server call
- [ ] #3 With two vaults served by one server, a write to a board in one vault is announced only to panes that show that board in that vault, even when the other vault has a board of the same name
- [ ] #4 Leases, claims, doing lines, the agent activity list, the settled change feed, the lock sweep and the disk watch are keyed by vault and board together
- [ ] #5 The browser names the vault of each pane on every call and socket message
- [ ] #6 The opt-in topology lane still passes
- [ ] #7 AGENTS.md's invariants, the archboard-dev skill and TESTING.md describe vault naming as built
- [ ] #8 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Affected boards, each with a proposal named TASK-472.04: Archboard server routes@TASK-472.04 (a Vault requirement module that every board route mounts), Live panes@TASK-472.04 (the same module for the pane routes and the pane socket; the pane registry, board announcements and change feed hold their news per vault), Archboard server@TASK-472.04 (the Vault requirement module in the server, reached from the route handlers and the live panes). No other board is affected: Command interface and Command dispatch draw no vault flag, and Board persistence keeps the same API with a vault argument.

1. Wire shape. A call names its vault as ?vault=<absolute directory> on a request or a vault field in its JSON body, and the pane socket names it once in its URL. src/server/archboard/lib/request-vault.ts holds requireVault (Express middleware, mounted per route) and vaultOfRequest. A call naming none gets VAULT_REQUIRED (400); an unreadable one gets VAULT_UNREADABLE (404), checked read-only so nothing is created. The server canonicalises the path with realpath, so two spellings of one directory are one vault.
2. Memory keyed by vault and board: boardMemoryKey(vault, board) in the engine keys claims, revocations, announced lock state, the LockSink, the sweep, doing lines, agent activity, the settled change feed and the disk watch. The pane registry keeps a vault per socket and per pane and sends board news only to the sockets of that vault.
3. The CLI names ARCHBOARD_VAULT on every API call in the transport (server-client-session withVault); defineCommand appends the two vault refusals (exit 2) to every command that needs a server. The browser learns the one vault from GET /api/served-vault before it renders and names it on every call and socket URL. The Codex workbench stays bound to the startup vault (serverVault()) until TASK-472.10. No registry membership check yet: a vault only has to be a readable directory (the registry arrives in TASK-472.05).
4. Tests: tests/system/server-state/vault-naming.test.ts (one owned server, two vaults: news, claims and leases apart; every route refuses a no-vault call; unreadable vault; socket without a vault; served vault), src/runtime/engine/tests/board-lock-vaults.test.ts (claims, hold, announcements, doing lines apart in the engine), and every existing requester, pane helper and raw fetch now names its vault.
5. Docs: AGENTS.md invariant, TESTING.md, the archboard-dev skill. Boards: branch the three proposals with ./bin/dogfood, draw, compare. Gate lanes one at a time, then commit by path with Refs: TASK-472.04.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions. (1) Per-route requireVault rather than a prefix-mounted middleware, so bare-app route tests and each route's refusal stay local. (2) The socket names the vault once at connect (?vault=); a pane report on /api/panes must name the same vault or it gets 409 VAULT_MISMATCH. A pane cannot change its vault for the life of its socket; reconnecting with another vault clears the pane's remembered board. (3) Codex workbench, voice and narration stay bound to the startup vault (serverVault()) until TASK-472.10; pane-derived calls use the pane's vault. (4) No registry check: any readable directory is a vault until TASK-472.05. (5) code-opener dependency signatures take the vault as a third argument and routes.ts is committed whole with the TASK-472.03 resolveInVault wiring, as the coordinator asked. (6) GET /api/panes, /api/panes/open and /api/panes/close are not vault-scoped yet: their per-repository reporting is TASK-472.14. Test fixtures that start a server on a vault path now create that directory first, because a pane cannot name a vault the server cannot read.
<!-- SECTION:NOTES:END -->
