---
id: TASK-472.08
title: >-
  archboard runs the source of the archboard checkout it stands in, and each
  worktree has its own port
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 04:34'
labels: []
dependencies:
  - TASK-472.06
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 828000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A worktree of archboard that changes server source needs a server that runs its own source, and today it would take port 3000 from the owner's daily server. `./bin/dogfood` exists only to choose archboard's vault, which the CLI now finds by itself. ADR 0049 decides: inside an archboard checkout `archboard` runs that checkout's source, the main checkout keeps port 3000, and a linked worktree gets a stable port from its path, as worktrunk's `hash_port` does from a branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inside an archboard checkout whose source is not the running source, `archboard` executes that checkout's `bin/archboard` with the same arguments and environment
- [ ] #2 The main archboard checkout uses port 3000, and a linked worktree uses a port that is a stable hash of its root path into 10000 to 19999, the same on every run
- [ ] #3 A set `ARCHBOARD_URL` or `--url` still decides the URL
- [ ] #4 `/health` reports the source checkout of the server, and a command that finds a server of other source on its port refuses and names both checkouts
- [ ] #5 `bin/dogfood` is deleted, and nothing in the repository runs or names it except history
- [ ] #6 AGENTS.md, TESTING.md, .archboard/README.md, PRODUCT.md, docs/agents/readme-assets.md and the archboard-dev skill say `archboard` where they said `./bin/dogfood`, and describe worktree servers and ports
- [ ] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/runtime/engine/source-checkout.ts: the real path of the archboard checkout this process runs (SOURCE_CHECKOUT), its server port (3000 for a main checkout, whose .git is a directory; for a linked worktree, whose .git is a file, 10000 + the first four bytes of sha256(root path) mod 10000; worktrunk's hash_port algorithm is not readable from the installed binary and does not need matching, because its input is a branch and ours a path), the default URL, and the hand-off decision.
2. Hand-off: bin.ts first asks whether the working directory stands in an archboard checkout (the nearest .git root holds package.json named archboard and bin/archboard) whose real path is not the running source. If so, it runs that checkout's bin/archboard with the same argv and an untouched environment (stdio inherited) and exits with its status. -C does not decide, because -C changes only where the vault is found. Loop guard: hand off only when the target bin/archboard resolves inside that checkout, so the child runs exactly that source and decides not to hand off again; an older checkout has no hand-off at all.
3. config.ts ARCHBOARD_URL default, the --url help default and the server's PORT default all come from the checkout port. A set ARCHBOARD_URL or --url still decides.
4. /health reports source.checkout. The CLI's identity gate refuses a server whose checkout differs (SERVER_UNREACHABLE, exit 3) and names both checkouts; ensureServerRunning, stop and the readiness wait carry the refusal instead of treating it as no server; status reports it as the foreign-service outcome. A server that reports no checkout (older build) is accepted.
5. Delete bin/dogfood; replace ./bin/dogfood with archboard in AGENTS.md, TESTING.md (dogfood and port parts only), .archboard/README.md, PRODUCT.md, docs/agents/readme-assets.md, the archboard-dev skill (dogfood parts only), the acceptance procedures in docs/design and ADR 0046; describe worktree servers and ports.
6. Tests: unit for the port (main 3000, linked in range and stable, pinned hash) and the hand-off decision; a system test that runs the shipped bin in a stand-in archboard checkout (same args, env, exit status) and against a /health double of other source (status, a vault command and start refuse naming both); staleness-source asserts /health names the checkout.
7. Boards: Archboard (CLI runs the checkout's source; each worktree has its own server and port), Command interface (the hand-off before bootstrap), Archboard server routes (/health names the source checkout). The parent draws the proposals.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: (1) The hand-off follows the working directory only, not -C: -C changes only where the vault is found, and the Codex workhorse runs from the server's checkout with -C naming any vault, so following -C would hand a workhorse command to another checkout's source and then refuse its own server. (2) Loop guard: hand off only when <root>/bin/archboard resolves inside <root>; that bin runs the source beside its real path, so the child finds itself the running source. No environment marker is added, so the child gets the environment unchanged. (3) Port hash: 10000 + (first 4 bytes of sha256(real root path)) mod 10000. worktrunk 0.77 is installed but its hash_port source is not readable from the binary, and matching it has no value because it hashes a branch. (4) A main checkout is one whose .git is a directory; a linked worktree has a .git file. (5) The other-source refusal uses SERVER_UNREACHABLE (exit 3), like a foreign service, and lives in the identity gate; healthOrNull carries it so start, stop and the readiness wait refuse instead of spawning or signalling; status reports it as the foreign-service outcome. A server that reports no checkout (older than this change) is accepted, so the owner's running server keeps working until it restarts. (6) The server's PORT default and the --url help default also come from the checkout port. Left: vite.config.ts still proxies bun run dev to port 3000; TESTING.md already says so.
<!-- SECTION:NOTES:END -->
