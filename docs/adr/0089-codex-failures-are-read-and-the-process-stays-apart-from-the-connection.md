---
status: accepted
---

# Codex failures are read, and the process stays apart from the connection

Decided for TASK-653.11, candidate 8 of the archboard-deepen run. It applies
[ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md) to
`@archboard/codex-app-server` and keeps [ADR 0019](0019-the-workbench-owns-one-codex-app-server-session.md)'s
one child and one epoch per child.

## Context

The package exported seven error classes, and callers tested them with `instanceof` and read
fields they knew by class: a mutation's outcome, a process failure's code, an identity refusal's
code. Each class was a name in the interface, tests outside the package constructed them to make
fakes fail, and the classes said nothing about which questions a caller may ask. Callers also put a
connection together from a ledger, authorities, a transport and a session, beside a process that
outlives each child.

## Decision

- **Failures are read, not class-tested.** `readCodexFailure(error)` returns what went wrong as
  data: a mutation with its outcome, a refused write, a remote error, a process or executable
  failure with its code, or an identity refusal with its code; anything else is `null`.
  `createCodexFailure(spec)` makes the error Codex itself would throw, with the message the spec
  states, and reads back as its spec. The classes stay inside and keep their names and messages.
- **The reader walks no causes.** It reads the value it is given. A mutation failure is caused by
  a transport error, so a walk would change answers; a caller that must look inside, such as the
  server's startup sentence, walks causes and aggregates itself and reads each one.
- **Each caller keeps its own default.** Voice treats an unread outcome as `outcome_unknown`;
  workbench reads any object's `outcome` and defaults to `not_delivered`.
- **The process stays apart from the connection.** One process yields many children over its life,
  and a connection belongs to one child and one epoch. `openCodexConnection({ child, recordPrefix })`
  opens plain data (child, epoch, identities, transport), `openCodexSession(connection, options)`
  opens a session and hands its control to the caller, and `createCodexProcess` owns the children.

## Considered and rejected

- **A reader that walks causes.** It would read a mutation as the transport failure under it.
- **One shared duck-typed outcome reader.** Workbench reads arrays and inherited fields that the
  package's own check refuses, and its default differs from voice's.
- **A connection with a session method, or one that also owns the process.** A function member is
  an operation the interface hides, and one operation with two lifetimes would make the voice
  owner's restart logic part of the package.
