---
status: accepted
---

# The code check judges module depth from the code

The owner decided this on 2026-11-18 (TASK-646). It supersedes the claim of
[ADR 0044](0044-a-containers-interface-is-what-relationships-from-outside-reach.md)
that depth has no measure: a board holds no behaviour, but the code does. The
interface measures of a board still give no verdict. It also supersedes the
rule of
[ADR 0046](0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md)
that only a contradiction of the board makes a warning.

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
  as named findings.** It never gives a score. A count is evidence, and two
  fixed thresholds on the counts make findings (TASK-651).
- **It counts the exports by kind:** functions, classes, values and types. Each
  public method of an exported class counts as its own export, so a wide class
  cannot hide. It counts the pieces of logic behind them: calls, operators,
  conditions, loops and hidden values.
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
  and exports a parse function and the types derived from them. Where no
  language server types a value that a call makes, nothing tells whether it
  can be called, so its `EXPOSED_VALUE` is information and no
  `MODULE_SHALLOW` rests on it: a missing server never makes a warning.
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
  count for nothing, the operands of `+`, `*`, `Math.min`, `Math.max` and
  `Math.hypot` are sorted, and one local variable that holds the export is
  followed. Equality, comparison, bitwise and logical operators are no math,
  so comparisons do not flood the findings. Two pieces of math that only share a shape, such as a
  deadline and a jitter, match too; one function on the exporter clears both.
- **An unused export is a warning only after a complete read**: every file
  outside the module in its language parsed where it names the module's names,
  every relative import resolved,
  no import of the whole module, and no caller drawn in the model whose code
  the check does not read. Otherwise it is information. Drawing the consumer
  of a published entry is how a package says that callers outside the checkout
  use it; no package setting does. A test is no user. Uses of a method go
  through values, which a syntax read cannot follow, so no method is judged
  unused, and members the language calls are never judged. A Rust item
  exported to the host language counts as used by it: one that
  `#[wasm_bindgen]` exports to JavaScript (TASK-646.16), and a type that
  derives ts-rs's `TS`, whose bindings TypeScript names (TASK-646.18).
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
- **What a sibling use keeps used stays visible** (TASK-646.18). Such a
  module gets `INTERFACE_UNDECLARED`, information, once only its own files
  use one of its names. It says how many of its names files outside it use,
  and how many only its own files import, naming the first five. Declaring
  the interface with what callers use, as the language does, keeps the rest
  inside: an `index.ts` or the package's `exports` in `package.json` in
  TypeScript, an `__init__.py` in Python, a `mod.rs` in Rust, and public
  headers in an include directory in C, C++ and Objective-C. The finding
  names the ways of the languages its files are in.
- **Code the repository does not own gets no verdict** (TASK-646.18). A module
  that the model marks `external`, or that a part marked `external` holds, as
  a vendored crate is, keeps its counts and gets no finding on its exports and
  no `MODULE_SHALLOW`. Nobody here refactors its interface.
- **The width of a module is what its callers must learn** (TASK-651): its
  exported functions, classes, public methods and values, getters included.
  Exported types count zero, so an exported union or enum keeps the
  compiler's exhaustive checks. An enum counts as a type. So does a type that
  holds data and has no public method in its module, wherever its methods
  are defined (the owner, 2026-11-19): a Rust struct, enum or union, a Go
  struct or other named type, a C# struct or record, a Swift struct or enum,
  a Python dataclass or enum, and a C or C++ struct, union or class with no
  member function. With a method it is a class, and each public method
  counts. A TypeScript class stays a class. This width differs
  from the interface width of
  [ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md),
  which counts types.
- **`INTERFACE_WIDE` is a warning on a width above 20**, on every module kind
  alike. Its message gives the counts by kind and the principle: a narrow
  interface is the few operations callers need.
- **`MODULE_SHALLOW` is a warning on a shallow module, once, with the evidence
  of each ground that holds.** One ground rolls up the names: every export
  that is not a type carries `EXPOSED_VALUE`, `EXPOSED_VALUE_COMPUTED` or a
  pass-through finding, and a class stands for its public methods. The other
  ground is Ousterhout's measure: a width of at least 8 with fewer than 4
  pieces of logic behind each name. Its message gives the principle: a deep
  module hides much logic behind few names.
- **Neither message prescribes a fix.** An agent reasons the fix out from the
  principles of narrow interfaces, deep modules and testing at the seams,
  which the archboard skill states.
- **The measured grounds need a reading the counts can stand on.** Every name
  the module exposes is in a language whose adapter names each export's kind.
  Otherwise the module gets neither `INTERFACE_WIDE` nor the measured ground
  of `MODULE_SHALLOW`, and an `external` module gets no verdict at all. The
  width needs no whole parse, because the exposure reader names the exports,
  so a file that did not parse keeps `INTERFACE_WIDE`. The measured ground of
  `MODULE_SHALLOW` also needs every code file parsed whole, because logic in
  code that did not parse goes uncounted. A manifest such as a `Cargo.toml`
  holds no logic and changes nothing. Where the logic counted would make the
  module shallow and a file did not parse, the check withholds the verdict
  and says so with the skip `logic-unparsed`, which names each file and its
  lines, so a module never passes silently. Where the logic counted already
  makes the module deep, the code that did not parse cannot change that, and
  nothing is said.
- **No exemption for values a language forces to be constants.** The archboard
  skill teaches the seam that replaces each one.
- **The answer's severities never depend on the caller.** The server
  remembers every finished pass for the panes, so a flag that changed the
  answer would make Measures show whatever the last caller asked for.
- **The CLI owns the gate.** `archboard check --fail-shallow-modules`, or a vault
  policy that sets `codeCheck.failShallowModules`, makes an information
  `MODULE_SHALLOW` or `INTERFACE_WIDE` a warning on the modules that the branch
  touched, so the existing exit rule fails. Both codes are warnings without a
  rule, so the gate is debt mode (TASK-651): a vault sets them to information,
  and the gate fails only the modules that a branch touched. The branch is read from its base up to the working tree, uncommitted
  changes included (TASK-646.02). `--base` names the base, and the default-base
  lookup decides without it. A base that does not resolve is a refusal, never a
  pass, and so is a gated module whose range the check could not read.
- **The vault sets the level of each module-depth rule** (TASK-650). The
  vault policy's `codeCheck.rules` maps the module-depth codes, eight with
  `INTERFACE_WIDE`, to
  `information`, which caps a finding's level and says that the vault policy
  set it, or `off`, which removes its findings, counts, Measures entries and
  annotations. The answer's `models[]` entry carries the rules, and the CLI
  prints one line that names the codes that are off. A rule only lowers, so
  an incomplete read that made a finding information never becomes a warning,
  and `failShallowModules` stays the only promotion. The run applies the rules
  to each reading once `MODULE_SHALLOW` is derived, so a rule never changes
  which modules are shallow, and the rules belong to the vault, so no
  severity depends on the caller. Another code or level is an invalid
  configuration, and so is `off` on `MODULE_SHALLOW` or `INTERFACE_WIDE`
  beside `failShallowModules: true` (TASK-651). Beside `--fail-shallow-modules`
  it is the refusal `SHALLOW_RULE_CONFLICT`. A vault without rules keeps every built-in
  level, so upgrading adopts the new warnings. No rule is scoped to a path or
  a module, since the model's `external` mark covers code that a repository
  does not own, and no CLI flag or Action input sets one.
- **A rule judges a language only where its adapter names the kind of each
  export.** TypeScript, Python, Go, C#, Rust, Swift, C, C++ and Objective-C
  have such adapters. Terraform, Nix flakes and Helm charts get counts and no
  verdict. Terraform keeps its own
  `VARIABLE_PASSED_THROUGH` and `MODULE_SHALLOW`.

## Considered and rejected

- A depth score. A small narrow module is a good module. TASK-646 also
  rejected a ratio of logic to interface, because a ratio rewards padding the
  implementation. TASK-651 changed that: every per-name rule passed on this
  repository while `model` exposed 140 callable names and `timing` hid 126
  pieces of logic behind 37 functions, because the rules judged what each
  export is and never how many there are. A getter for a constant cleared
  `EXPOSED_VALUE` and narrowed nothing. The owner decided to fail on
  Ousterhout's measure. The minimum width of 8 keeps a small narrow module
  clean, and the fixed thresholds give no score to pad toward.
- Configurable thresholds, thresholds per module kind, counting types,
  estimating parameters from source text, exemptions per module, and
  generated fixes (TASK-651).
- Failing on every shallow module on every run, as TASK-646 decided against:
  old debt would block every change. TASK-651 reversed this. Both module
  codes now fail on every module by default, and a vault that is not ready
  sets them to information and keeps the gate for the modules that a branch
  touched.
- A flag that changes the answer. The panes read the remembered answer, and two
  callers would see two answers to one pass.
- Exempting constants that a language forces, such as case labels. Each has a
  seam that keeps the value inside the module.
