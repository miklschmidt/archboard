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
- **An export that can be called is a function, even when a call makes it**
  (TASK-646.15). A compound component made by `Object.assign(Root, {...})` is
  what `Root` is, wherever `Root` is defined, and an export that the language
  server types as callable, such as the helper that `cva(...)` returns, is a
  function. A value that a call makes and that cannot be called stays a value:
  an exported zod schema is one. A contract module keeps its schemas inside
  and exports a parse function and the types derived from them.
- **Each exported name gets at most one finding** (TASK-646.05).
  `EXPOSED_UNUSED` comes first, because its remedy removes the name. A
  function or method that only passes its call on is `CODE_PASS_THROUGH`,
  information. A name passed on from another module is
  `REEXPORT_PASS_THROUGH`: information through one door, a warning when files
  outside both modules also import the defining module, two doors to one name.
- **Math that callers repeat on an export is the exporter's** (TASK-646.06).
  When two or more modules write the same math on one exported value or
  getter, `EXPOSED_VALUE_COMPUTED` is a warning on that export, in place of
  `EXPOSED_VALUE`, with every line that writes the math as evidence. Two
  pieces of math are the same when their shapes are: the callers' own names
  count for nothing, the operands of `+`, `*`, `Math.min` and `Math.max` are
  sorted, and one local variable that holds the export is followed. Equality,
  comparison, bitwise and logical operators are no math, so comparisons do not
  flood the findings. Two pieces of math that only share a shape, such as a
  deadline and a jitter, match too; one function on the exporter clears both.
- **An unused export is a warning only after a complete read**: every file
  outside the module in its language parsed, every relative import resolved,
  no import of the whole module, and no caller drawn in the model whose code
  the check does not read. Otherwise it is information. Drawing the consumer
  of a published entry is how a package says that callers outside the checkout
  use it; no package setting does. A test is no user. Uses of a method go
  through values, which a syntax read cannot follow, so no method is judged
  unused, and members the language calls are never judged.
- **A sibling import keeps a folder export used** (TASK-646.17). A folder
  module that declares no interface, with no file that stands for it (such as
  `index.ts`, `__init__.py`, `mod.rs` or a project file) and no
  `package.json` `exports`, exposes every export of the files directly in it.
  TypeScript makes a file export a name so that another file can import it,
  and cannot hide that name from other folders. So in such a module, a name
  that another of its files imports counts as used. The rule holds in every
  judged language: a module with a declared interface keeps the rule above,
  and a language whose files of one module see each other without an import,
  as Go's and Swift's do, gives no such use, so the remedy there stays to stop
  exporting the name.
- **`MODULE_SHALLOW` rolls them up.** It names a module whose every export that
  is not a type carries `EXPOSED_VALUE`, `EXPOSED_VALUE_COMPUTED` or a
  pass-through finding. A class
  stands for its public methods. Types count for no verdict, so an
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
