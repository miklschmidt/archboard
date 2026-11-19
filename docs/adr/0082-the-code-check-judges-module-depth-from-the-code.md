---
status: accepted
---

# The code check judges module depth from the code

The owner decided this on 2026-11-18 (TASK-646). It supersedes the parts of
[ADR 0044](0044-a-containers-interface-is-what-relationships-from-outside-reach.md)
that give the interface no verdict, and the part of
[ADR 0046](0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md)
that lets only a contradiction of the board be a warning.

## Context

A deep module has a small interface that hides much logic. A shallow module
hands its insides to its callers. ADR 0044 gave the interface measures no
verdict, because a model holds no behaviour. That is still true of the model.
But the code holds the behaviour, and the code check already reads it.

The code shows the problem plainly. This repository's `timing` module exports
frozen groups of durations, and its callers do the backoff math on them. The
module that owns the timing does not own the logic for timing. No check said so,
so agents in an implementation loop added exported constants and nothing failed.

## Decision

- **The code check measures each bound module from its code, and gives verdicts
  as named findings.** It never gives a score or a ratio. A count is evidence.
- **It counts the exports by kind:** functions, classes, values and types. Each
  public method of an exported class counts as its own export, so a wide class
  cannot hide. It counts the pieces of logic behind them: calls, operators,
  conditions, loops and hidden values. No gate reads that count.
- **It judges each exported name.** `EXPOSED_VALUE` is a warning on an exported
  value that code outside the module reads, and a value that a call makes, such
  as `durations({...})`, is one. Its remedies follow the readers: one reader
  takes the value, several get what they do with it moved into the module. A
  function that returns the value, a getter, is an interface and clears it.
  Later rules join it: pass-throughs, unused exports, and math that callers
  repeat on one export.
- **`MODULE_SHALLOW` rolls them up.** It names a module whose every export that
  is not a type carries a finding of its own. Types count for no verdict, so an
  exported union or enum keeps the compiler's exhaustive checks. An enum counts
  as a type.
- **No exemption for values a language forces to be constants.** The archboard
  skill teaches the seam that replaces each one.
- **The answer's severities never depend on the caller.** `MODULE_SHALLOW` is
  information in the answer. The server remembers every finished pass for the
  panes, so a flag that changed the answer would make Measures show whatever the
  last caller asked for.
- **The CLI owns the gate.** `archboard check --fail-shallow-modules`, or a model
  policy that sets `codeCheck.failShallowModules`, makes `MODULE_SHALLOW` a
  warning on the modules that the branch touched, so the existing exit rule
  fails. The branch is read from its base up to the working tree, uncommitted
  changes included (TASK-646.02). `--base` names the base, and the default-base
  lookup decides without it. A base that does not resolve is a refusal, never a
  pass, and so is a gated module whose range the check could not read.
- **A rule judges a language only where its adapter names the kind of each
  export.** TypeScript first, then the other languages. Terraform keeps its own
  `VARIABLE_PASSED_THROUGH` and `MODULE_SHALLOW`.

## Considered and rejected

- A depth score, or a ratio of logic to interface. A small narrow module is a
  good module, and a ratio rewards padding the implementation.
- Judging every module on every run. Old debt would block every change, so the
  gate judges only the modules that the branch touched.
- A flag that changes the answer. The panes read the remembered answer, and two
  callers would see two answers to one pass.
- Exempting constants that a language forces, such as case labels. Each has a
  seam that keeps the value inside the module.
