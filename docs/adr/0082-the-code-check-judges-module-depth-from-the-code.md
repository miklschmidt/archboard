---
status: accepted
---

# The code check judges module depth from the code

The owner decided this on 2026-11-18 (TASK-646), and amended the gate on
2026-11-22 (TASK-659): logic per name at any width, with switchboards counted.
It supersedes the claim of
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
  as named findings.** It never gives a score. A count is evidence, and one
  fixed threshold on the counts makes a finding (TASK-651, TASK-659).
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
  counts. A TypeScript class stays a class.
- **A switchboard counts one name for each operation it picks** (the owner,
  2026-11-22, TASK-659). A switchboard is an exported function or public
  method that picks the operation it runs by a closed key its caller passes:
  literal overloads, a literal or boolean union, a property of a request
  object that tells its kind, or a Rust enum parameter, with or without
  payloads. The key is closed through type aliases, imports and a closed
  table of handlers that the key indexes. No call site is read, because a
  choice crosses HTTP and WebAssembly as data. Each arm that runs a different
  operation counts: a shared default arm counts once and hides no bespoke arm
  beside it. An arm that only selects or builds data runs no operation, so a
  keyed getter stays one name. Two arms that make the same calls, compared by
  callee and number of arguments, run one operation, and so does an arm whose
  calls hold another arm's calls: the shared path plus checks. An arm that
  only writes state runs an operation of its own. A test of shape, `in` or
  `instanceof`, is no key, and a key typed `string` or `number` is open. The
  module's logic leaves out a switchboard's tests of its key and the calls of
  its arms that only hand names on, so folding names behind a key earns no
  logic. Each module's record in the answer carries its judged `width` and its
  `switchboards`, with the keys and line of each operation, also when it
  passes. This width differs from the interface width of
  [ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md),
  which counted types.
- **`MODULE_SHALLOW` is a warning on a shallow module, once, with the evidence
  of each ground that holds.** One ground rolls up the names: every export
  that is not a type carries `EXPOSED_VALUE`, `EXPOSED_VALUE_COMPUTED` or a
  pass-through finding, and a class stands for its public methods. The other
  ground is Ousterhout's measure: a module that offers W > 0 names with fewer
  than 4W pieces of logic behind them (TASK-659). Equality passes. No width
  exempts a module and none caps it: logic and names both add up across a
  cut, so cutting a shallow module leaves a shallow part, and a wide module
  deep enough passes. Its message gives the counts, each switchboard with the
  keys of each operation it picks, and the principle: a deep module hides much
  logic behind few names, and a name moved to another module, or behind a key,
  is still a name its callers learn.
- **The message prescribes no fix.** An agent reasons the fix out from the
  principles of narrow interfaces, deep modules and testing at the seams,
  which the archboard skill states. Splitting a module and folding names
  behind a key only move width.
- **The measured ground needs a reading the counts can stand on.** Every name
  the module exposes is in a language whose adapter names each export's kind.
  Otherwise the module gets no measured ground of `MODULE_SHALLOW`, and an
  `external` module gets no verdict at all. The measured ground of
  `MODULE_SHALLOW` also needs every code file parsed whole, because logic in
  code that did not parse goes uncounted. A manifest such as a `Cargo.toml`
  holds no logic and changes nothing. Where the logic counted would make the
  module shallow and a file did not parse, the check withholds the verdict
  and says so with the skip `logic-unparsed`, which names each file and its
  lines, so a module never passes silently. Where the logic counted already
  makes the module deep, the code that did not parse cannot change that, and
  nothing is said. A switchboard whose key is typed by a name in which the
  check finds no closed set of keys, such as a type from outside the checkout,
  counts as one name. Where counting its operations would make the module
  shallow, the check withholds the verdict and says so with the skip
  `key-unclosed`, which names each switchboard and the type.
- **No exemption for values a language forces to be constants.** The archboard
  skill teaches the seam that replaces each one.
- **The answer's severities never depend on the caller.** The server
  remembers every finished pass for the panes, so a flag that changed the
  answer would make Measures show whatever the last caller asked for.
- **The CLI owns the gate.** `archboard check --fail-shallow-modules`, or a vault
  policy that sets `codeCheck.failShallowModules`, makes an information
  `MODULE_SHALLOW` a warning on the modules that the branch touched, so the
  existing exit rule fails. It is a warning without a rule, so the gate is
  debt mode (TASK-651): a vault sets it to information,
  and the gate fails only the modules that a branch touched. The branch is read from its base up to the working tree, uncommitted
  changes included (TASK-646.02). `--base` names the base, and the default-base
  lookup decides without it. A base that does not resolve is a refusal, never a
  pass, and so is a gated module whose range the check could not read.
- **The vault sets the level of each module-depth rule** (TASK-650). The
  vault policy's `codeCheck.rules` maps the seven module-depth codes to
  `information`, which caps a finding's level and says that the vault policy
  set it, or `off`, which removes its findings, counts, Measures entries and
  annotations. The answer's `models[]` entry carries the rules, and the CLI
  prints one line that names the codes that are off. A rule only lowers, so
  an incomplete read that made a finding information never becomes a warning,
  and `failShallowModules` stays the only promotion. The run applies the rules
  to each reading once `MODULE_SHALLOW` is derived, so a rule never changes
  which modules are shallow, and the rules belong to the vault, so no
  severity depends on the caller. Another code or level is an invalid
  configuration, and so is `off` on `MODULE_SHALLOW` beside
  `failShallowModules: true` (TASK-651). A rule on `INTERFACE_WIDE`, which
  TASK-659 retired, is refused with a message that names the entry and asks
  for its removal; the code never reached a release. Beside `--fail-shallow-modules`
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
  Ousterhout's measure. The fixed threshold gives no score to pad toward.
- A flat cap on width, `INTERFACE_WIDE` above 20 names (TASK-651, retired on
  2026-11-22 by TASK-659). It rewarded cutting a module into pieces: two
  halves of 15 passed where the whole of 30 failed, though callers that need
  both still learn 30. Under it, agents folded names behind keys and split
  packages to stay at 20, which moved width and removed none.
- A minimum width of 8 for the measured ground (TASK-651, retired on
  2026-11-22 by TASK-659). It was meant to keep a small narrow module clean,
  but 14 shallow names passed as two groups of 7, the one place a cut still
  paid. Of the modules under 8 names here, all but one pass at 4 without it.
- A separate information code for a switchboard (TASK-659). Its keys are
  evidence of the width, which the answer and Measures show, not a verdict on
  a name.
- Reading the key from call sites (TASK-659). A caller that hands on a
  request it parsed, or a key that crosses WebAssembly as JSON, would hide a
  switchboard that the module offers.
- Counting the keys of a keyed getter (TASK-659). One verb over a set of data
  keys is one name, as ADR 0083 holds; `timing` would count 141 names.
- Configurable thresholds, thresholds per module kind, counting types,
  estimating parameters from source text, exemptions per module, and
  generated fixes (TASK-651).
- Failing on every shallow module on every run, as TASK-646 decided against:
  old debt would block every change. TASK-651 reversed this. `MODULE_SHALLOW`
  now fails on every module by default, and a vault that is not ready sets it
  to information and keeps the gate for the modules that a branch touched.
- A flag that changes the answer. The panes read the remembered answer, and two
  callers would see two answers to one pass.
- Exempting constants that a language forces, such as case labels. Each has a
  seam that keeps the value inside the module.

## Known limits

Recorded on 2026-11-22 (TASK-659).

- **A factory's members hide width.** Types count zero, so an exported
  function whose result carries many function members counts one name, though
  callers learn each member: `createCodeCheck()` returns `fileOwners`, `run` and
  more. The rule it would take is to count the function-valued members of the
  object an exported function returns as the public methods of an exported
  class are counted. TASK-660 tracks it, because it moves widths across the
  repository and needs a run against the corpus first.
- **Syntax decides what an arm runs.** An arm that parses through a function
  of its own counts as its own operation even where it is the shared path plus
  checks, and two arms that build nearly the same value through different
  calls count twice. Both matter only for a module near 4 pieces per name.
- **Merging pays.** A thin module moved into a deep one passes, because a
  module's logic counts every file in it. Layer rules and review hold this.
