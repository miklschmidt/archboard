---
id: TASK-031
title: Bindings resolve against an ambient working directory
status: To Do
assignee: []
created_date: '2026-08-19 23:03'
updated_date: '2026-08-19 23:03'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 31000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A relative path never binds to a repository the caller did not name
- [ ] #2 Promotion over MCP does not depend on the server process's working directory
- [ ] #3 A repo can be named and resolved to a checkout without changing directory
- [ ] #4 Cross-repo boards can be built in one session without cd between promotions
<!-- AC:END -->

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
<!-- COMMENTS:END -->
