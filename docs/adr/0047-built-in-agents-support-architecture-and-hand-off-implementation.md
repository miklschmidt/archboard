---
status: accepted
---

# Built-in agents support architecture and hand off implementation

Archboard's coordinator and workhorse inspect architecture, analyze code, and
author requested proposals and architecture documents. They can run existing
tests and diagnostic commands, and create temporary experiments outside the
repository. They leave product implementation to the user's own coding agent,
even when the user asks Archboard to implement a proposal.

Agent instructions define this role, with the existing permissions preserved.
Repository-local diagnostics can write their normal untracked output folders.
The user chose this approach because narrower write permissions can prevent
useful inspection commands.

For an explicit implementation request, Archboard saves an implementation brief
in the OS temporary directory, following the handoff skill's storage convention.
It reports the saved path in the conversation. The brief names the board,
proposal, observed version, unresolved decisions, affected repositories, and
acceptance criteria. It gives
the exact CLI path, `ARCHBOARD_URL`, `ARCHBOARD_VAULT`,
`ARCHBOARD_NO_AUTOSTART=1`, and commands to retrieve the proposal and its
differences.

This keeps architecture work useful without creating a second implementation
agent on a branch where the user already works.

An ambiguous build question receives feasibility, blockers, and the next
architectural steps. It does not request a saved brief.

This decision replaces the implementation default in ADR 0019. The user chose
this boundary after a voice request started implementation on a branch that
already carried other work.

Tracked for implementation in TASK-447.
