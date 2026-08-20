---
id: TASK-031
title: Bindings resolve against an ambient working directory
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 23:03'
updated_date: '2026-08-20 03:33'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 31000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A relative path never binds to a repository the caller did not name
- [x] #2 Promotion over MCP does not depend on the server process's working directory
- [x] #3 A repo can be named and resolved to a checkout without changing directory
- [x] #4 Cross-repo boards can be built in one session without cd between promotions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
DESIGN: a binding is resolved from something the caller named, and archboard keeps a machine-local
map from repository identity to a checkout on this machine (the registry ADR 0004 promised).

1. src/core/state-dir.ts — lift stateDir() out of pidfile.ts so more than one thing can keep
   machine-local state there. pidfile.ts imports it; no behaviour change.

2. src/core/repo-registry.ts — the registry. JSON at <stateDir>/repos.json, overridable with
   ARCHBOARD_REPOS (tests, and anyone running two archboards). One entry per repo identity:
   { repo, root, source: 'declared' | 'observed', addedAt }.
   - declareRepo(dir): git-inspect a directory, upsert as 'declared'.
   - rememberRepo(repo, root): what resolveBinding learned from a path that resolved. Never
     overwrites a declared entry, never overwrites a root that still exists.
   - checkoutFor(repo): the root, only when it is still there.
   - Writes are atomic (tmp + rename) and only happen when something actually changed.

3. resolveBinding gains an explicit origin and loses its default cwd:
       resolveBinding(request, origin)
       origin = { kind: 'cwd', dir } | { kind: 'none', surface }
   Resolution order, and every result says which one it used (resolvedFrom):
   - absolute path            -> 'path'      the caller named the file
   - relative + repo, known   -> 'registry'  the caller named the repository
   - relative + repo, unknown -> 'declared'  address recorded, no link, note says how to register
   - relative, origin cwd     -> 'cwd'       resolved, AND the note says which repo the working
                                             directory turned out to be, so it cannot look authoritative
   - relative, origin none    -> REFUSED     MCP has no working directory to resolve against
   Two more disclosures: --repo disagreeing with the checkout the path is actually in, and a
   registry entry whose checkout is now a different repository.
   Anything that resolves through 'path' or 'cwd' is remembered, so the registry fills itself.

4. Surfaces.
   - CLI: new `repo` command — list | add [dir] | forget <identity>.
   - MCP: promote_selection keeps its repo parameter, which now resolves; a relative path with no
     repo is refused with a message naming the registered repos. mcp-dispatch stops calling
     resolveBinding with the server process's cwd.
   - Parity: the three `repo` subcommands are CLI-only. Reason: the registry is host state — it
     names directories on this machine, which is precisely what a shell-less client cannot see.
     MCP consumes it (promote_selection's repo) rather than maintaining it.

5. ADR 0010 + CONTEXT.md entries for repository identity, checkout and registry.

6. scripts/check-repos.mjs, wired into `bun run test`: the unit rules plus an end-to-end proof of
   AC4 — two throwaway git repos, one board, both promoted from a third directory with no cd.

REJECTED: a per-board declared repo (frontmatter). It is wrong exactly where this hurts most: a
system board spans five repos and belongs to none of them.
REJECTED: scanning the filesystem for checkouts. A guess dressed as a lookup; the registry only
holds what was declared or actually seen.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WHAT LANDED

- src/core/repo-registry.ts, the checkout registry ADR 0004 promised and never built. JSON at
  <state dir>/repos.json, ARCHBOARD_REPOS overrides it. One entry per repository identity, marked
  `declared` (a person ran `repo add`) or `observed` (archboard resolved a binding through it).
  Atomic writes, quiet failure, corrupt file treated as a cache miss.
- src/core/git.ts, the git bits promote.ts had privately, now shared so the registry can use them
  without importing promotion.
- src/core/state-dir.ts, lifted out of pidfile.ts so two things can keep machine-local state.
- resolveBinding takes an explicit origin and has NO default cwd, so a new call site cannot
  reintroduce the ambient directory without a type error. Reports resolvedFrom on every answer:
  path | registry | cwd | declared.
- CLI: `repo list | add | forget`. `promote` passes { kind: 'cwd', dir: process.cwd() } and prints
  the disclosure note. mcp-dispatch passes { kind: 'none', surface: 'MCP' }.
- docs/adr/0010, CONTEXT.md (repository identity, checkout, checkout registry), CLAUDE.md.
- scripts/check-repos.mjs, wired into `bun run test`. 49 checks, including a real MCP stdio call
  and the two-repo one-session proof.

VALIDATION

`bun run test` exits 0 with all suites green, including the new repos suite and surface parity
(37 MCP tools against 45 CLI entries; the three `repo` subcommands are recorded CLI-only with a
reason). `bun run type-check` clean.

AC1, a relative path never binds to a repository the caller did not name. Over MCP it is refused
outright. On the CLI the working directory still resolves, because a shell has one the caller chose
and can see, but the answer now says which directory it used and which repository that turned out
to be, so it cannot pass for something the caller named. Proved both ways in check-repos.mjs, and
by hand:
  Promoted 1 element to the service "Payments" ... Resolved "src/service.ts" against the working
  directory /tmp/archboard-demo/payments, which is github.com/acme/payments. You named no
  repository, so check that is the one you meant.

AC2, promotion over MCP does not depend on the server process's working directory. check-repos.mjs
spawns dist/index.js with cwd INSIDE a repo that really does hold src/service.ts, then calls
promote_selection with that relative path over stdio. Refused: "\"src/service.ts\" is a relative
path and MCP has no working directory to resolve it against". The same process, given
repo=github.com/acme/beta, binds correctly.

AC3, a repo can be named and resolved to a checkout without changing directory. `repo add <dir>`
then resolveBinding({ path, repo }) from a directory that is not a repository at all, over MCP,
resolves through the registry and links into the right checkout.

AC4, demonstrated rather than asserted. Two throwaway git repos (acme/payments, acme/ledger), one
board, both promoted from /tmp/archboard-demo/here, which is neither of them and is not a git repo:
  payments -> github.com/acme/payments:src/service.ts | link: file:///tmp/.../payments/src/service.ts
  ledger   -> github.com/acme/ledger:src/service.ts   | link: file:///tmp/.../ledger/src/service.ts
The same shape runs in check-repos.mjs, so it stays proved.

NOT DONE HERE

INSTALL.md still tells people to run promotion from inside the repo the code belongs to, which is
this flaw dressed as guidance. Another agent owns that file right now, so the edit is described in
a comment rather than made.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 23:03
---
Raised by the user, who will be refactoring across several repositories including monorepos. Investigated rather than assumed; it splits three ways.

WORKS. resolveBinding (src/core/promote.ts:195) resolves the path against cwd, then walks up from the resulting ABSOLUTE path to find the git root, and reads origin from there. So an absolute path binds to the correct repository regardless of where the caller stands. Monorepos are fine too: one origin plus a repo-relative path is a correct identity, and the path is made relative to the git root.

BROKEN 1. A relative path resolves against an ambient cwd. From the wrong directory, if a file of that name happens to exist there, you get a confident and wrong binding with a real repo, branch and commit. If it does not exist you at least get "does not resolve on this machine" and no link, which fails visibly.

BROKEN 2, the serious one. mcp-dispatch.ts:865 calls resolveBinding with no cwd, so it defaults to process.cwd() of the MCP server process, which the client spawned. That directory is arbitrary and invisible to the user. Voice-driven promotion goes through this path, and there is no meaningful cwd in a voice session at all.

BROKEN 3. ADR 0004 promised a machine-local registry mapping repo identity to a checkout, and it was never built. Without it there is no way to say "this path is in acme/payments" without standing in acme/payments, and no way to resolve a binding to a tappable link for a repo that is checked out somewhere else.

DIRECTION, not a design. Stop resolving against an ambient directory. A binding should come from something the caller named: an absolute path, or a repo identity plus a repo-relative path resolved through the registry, or the board's own declared repo where it has one. Where the ambient cwd is still used, say so in the result rather than letting it look authoritative.

The cross-repo case is the one to design for. A system board whose boxes belong to five repositories should be buildable in one session, without cd between promotions, and it is the case a naming convention cannot rescue.

INSTALL.md currently tells people to run promotion from inside the repo the code belongs to. That is a workaround for this flaw dressed as guidance, and should go when this lands.
---

author: @claude
created: 2026-08-19 23:09
---
CORRECTION to the comment above, from the user. I wrote that the MCP path "is the path voice-driven promotion takes". That is wrong. Voice delegates to a Codex thread, the thread has a shell, and since TASK-027 the skill tells it to use the CLI. Voice-driven promotion therefore runs the CLI with the thread's own working directory, which is the repo Codex is working in: meaningful and visible.

BROKEN 2 still stands, on better grounds. MCP exists for a client with no shell (ADR 0008), and such a client cannot express a working directory at all. So the ambient cwd is not merely invisible there, it is unreachable by design: the caller has no way to set it, and the value used belongs to whatever process the client happened to spawn. A relative path over MCP is therefore not resolvable by intent, only by accident.

That reframes the fix rather than changing it. Do not treat MCP as an edge case of the CLI's cwd handling. Treat it as the surface that proves an ambient directory is the wrong idea: the caller must be able to name the repository, because on that surface there is nothing ambient to fall back to.
---

author: @claude
created: 2026-08-20 03:33
---
INSTALL.md change this lands but could not make: another agent owns that file right now.

The guide currently says to run promotion from inside the repo the code belongs to. That advice
existed to work around bindings resolving against the working directory, and it is now both
unnecessary and wrong for the case the user actually has, a system board spanning several repos.

What it should say instead:

1. Register each checkout once, from anywhere: `archboard repo add ~/src/payments`. The identity
   comes from git origin, so it is the same string in every clone.
2. Bind by naming the repo, not by standing in it:
   `archboard promote --board systems --kind service --repo github.com/acme/payments --path src/service.ts`
3. An absolute path works too, and needs no registration; archboard remembers where that repo was
   found, so the next promotion can name it.
4. A bare relative path is still fine when you are in the repo you mean, but the answer will say
   which directory it used and which repository that was. Over MCP it is refused, because a
   shell-less client has no working directory it can set (ADR 0010).
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A binding now comes from something the caller named. resolveBinding takes an explicit origin and has no default working directory: an absolute path, a repository identity resolved through a new machine-local checkout registry, or the caller's own cwd on a surface that has one, in which case the answer says which directory it used and which repository that turned out to be. On MCP, where no caller can set or see a working directory, a bare relative path is refused. The registry is the one ADR 0004 promised and never built: <state dir>/repos.json, populated by `repo add` and by observation, exposed as `repo list|add|forget` and consumed by both surfaces. Recorded as ADR 0010, with new CONTEXT.md terms. Verified by scripts/check-repos.mjs (49 checks, in `bun run test`), which refuses a relative path over a real MCP stdio call made from a process sitting inside a repo that would have resolved it, and builds one board with nodes in two throwaway repos from a third directory with no cd.
<!-- SECTION:FINAL_SUMMARY:END -->
