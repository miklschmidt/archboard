---
id: TASK-472.04
title: Every server call names its vault
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 00:31'
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
- [x] #1 Every board route (list, read, render, the writes, claim, release, take-back, locality, footprint, vault check, code check, code findings, pane show, semantic context and code target open) refuses a call that names no vault, and the refusal says how to name one
- [x] #2 The CLI names its vault on every server call
- [x] #3 With two vaults served by one server, a write to a board in one vault is announced only to panes that show that board in that vault, even when the other vault has a board of the same name
- [x] #4 Leases, claims, doing lines, the agent activity list, the settled change feed, the lock sweep and the disk watch are keyed by vault and board together
- [x] #5 The browser names the vault of each pane on every call and socket message
- [x] #6 The opt-in topology lane still passes
- [x] #7 AGENTS.md's invariants, the archboard-dev skill and TESTING.md describe vault naming as built
- [x] #8 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
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

Board closing (steps 1 to 7), run 2026-10-15.
Step 1, check --code with and without --variant TASK-472.04, findings diff. Before correction: three `>` lines. (a) RELATIONSHIP_UNDRAWN: HTTP application reaches Vault requirement (application.ts mounts requireVault on /api/code-targets/open) on Archboard server and again on Live panes; (b) RELATIONSHIP_UNSUPPORTED information: Rename route -> Vault requirement had no anchor. Two `<` lines were the reviews' known gap: ANCHOR_SYMBOL_MISSING for sendToAllClients on Pane registry -> Browser (Live panes) and Live panes -> Browser (Archboard server), cleared by re-anchoring both on sendToVaultClients in pane-registry.ts, which sends board and agent news to the sockets of one vault. After correction the diff has only the two `<` lines and no `>`.
Corrections: drew HTTP application -> Vault requirement (call, anchor requireVault in application.ts) on Archboard server@TASK-472.04 and on Live panes@TASK-472.04; removed Rename route -> Vault requirement (its vault reaches it through Board write routes, statedWrite, which already has the edge). Service routes: Service routes now also answers the served vault (GET /api/served-vault, the one call that names none) and Code findings memory is kept per vault, so both responsibilities were restated on the routes proposal and the findings-memory one on the server proposal; Route handlers' responsibility says the page, health and served vault. Re-anchoring an edge through `edit` cannot clear a field, so the Live panes -> Browser edge on Archboard server now carries label "board and agent news" beside its description (compare reports that one field as changed). Each proposal's summary was set to the board's own scope (copied from the current variant).
Step 3, footprint, base 62bf2525e (the parent of 9a17d28dc, the first TASK-472.04 code commit; 28 commits in range, one large: 9a17d28dc, 88 files, the task's own feature). namedNotChanged: none on any board. changedNotNamed after the corrections: Archboard server routes: Rename route (9a17d28dc, only passes the vault it is given; the Board write routes edge draws how it gets one), Board lease (9a17d28dc claims keyed by vault and board, and 84a025732 of TASK-473; the lease file already lived in the vault, so the part's words hold), History lens (ed7fcf747 of this task keeps a locality answer per vault; e4891be46 is TASK-472.03), Code check (TASK-472.03 commits only). Live panes: Disk change watcher (9a17d28dc keys its memory by vault; what it is for is unchanged), Board lease (as above). Archboard server: Code opener (9a17d28dc passes the vault as a third argument to resolveTarget; the route's requirement is drawn from HTTP application), Archboard server (the container, 3 commits), Board lease, History lens, Code check (as above), Code findings memory (restated per vault). Skipped parts are drill-downs and unbound containers; the unbound Live panes and Route handlers are named by relationships.
Step 4, adopted: Live panes at version 15, Archboard server routes at version 14, Archboard server at version 243.
Step 6: ./bin/dogfood check reports no diagnostics.
Step 7, behind: boards that 9a17d28dc and the other TASK-472.04 commits put behind and no proposal names. Browser application was wrong: the viewer's fetch now calls withVault from Server requests, so the code check warned RELATIONSHIP_UNDRAWN Semantic viewer -> Server requests. Corrected in place (version 45): drew Semantic viewer -> Server requests (call, anchor withVault in api/semantic-boards.ts) and Server requests now says it names the vault on every call. Board viewer (version 91): Page start learns the served vault before the application renders; its responsibility says so. Still right and left alone: Command interface and Command dispatch (defineCommand adds the two vault refusals to every server command and exit-codes.ts maps them; Command contract and Failure reporting still do what their words say), Board viewer's Fetch semantic reads, Browser application's Pane session and Code target (they name the vault; their responsibilities hold). Board persistence is behind through board-lock.ts, read.ts, write.ts, discard.ts and History lens, from this task and TASK-472.01/03; it was not touched because TASK-472.12 may draw a proposal there. Its current warnings (Drill-down checks reaches Former names and Decode board bytes) come from TASK-472.12's uncommitted drill-down.ts, and the Board rasterizer's drawRequest anchor is not about any file of this task.

Closing evidence: the complete gate passed at 65c950de5, every lane, exit 0, including tests/system/server-state/vault-naming.test.ts (two vaults, one server, news only to the right vault's pane). The opt-in topology lane passed at 84a025732, which holds this task's code (TASK-473 notes). AGENTS.md:65, TESTING.md:44 and the archboard-dev skill describe vault naming. Proposals adopted in 1fa993226. TASK-472.05 replaces the browser's one named vault with each pane's own vault.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every board route, the pane show, the semantic context and the code target open now refuse a call that names no vault (VAULT_REQUIRED) or an unreadable one, and say how to name it. The CLI and the browser name the vault on every call and on the pane socket. Leases, claims, doing lines, agent activity, the change feed, the lock sweep and the disk watch are keyed by vault and board, so a write in one vault is announced only to that vault's panes. Verified by the complete gate at 65c950de5 and the topology lane at 84a025732. AGENTS.md, TESTING.md and the archboard-dev skill describe it, and the proposals of five boards are adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
