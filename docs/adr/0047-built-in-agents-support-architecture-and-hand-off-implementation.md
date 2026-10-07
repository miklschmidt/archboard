---
status: accepted
---

# Built-in agents support architecture and hand off implementation

Archboard's coordinator and workhorse inspect architecture, analyze code, and
author requested proposals and architecture documents. They can run existing
tests and diagnostic commands, and create temporary experiments outside the
repository. They leave product implementation to the user's own coding agent,
even when the user asks Archboard to implement a proposal.

For an implementation request, Archboard prepares an implementation brief. The
brief includes concise instructions for retrieving the board and relevant
information from the same Archboard instance, with its environment variables.
This keeps architecture work useful without creating a second implementation
agent on a branch where the user already works.

This decision replaces the implementation default in ADR 0019. The user chose
this boundary after a voice request started implementation on a branch that
already carried other work.
