---
status: accepted
---

# Boards carry anchors, and the code check reads them on request

Accepted on 2026-10-06 for TASK-367.02 after an independent review. It
serves TASK-367 and its subtasks TASK-367.03 to TASK-367.27, TASK-368.10,
TASK-368.11 and TASK-369.02, and Proposal 1 of the
[design checks](../design/design-checks.md).

Amended by TASK-367.13 (2026-10-06): the language servers are their own
module, `packages/code-intel/src/runtime/operations/language-servers`. They are not a part of code facts,
because a process to start and stop is a concern apart from the facts of a
file.

Amended by TASK-367.15 (2026-10-06): clangd is a default server. With the
flags and the copy of the database that the check gives it, it runs no code
of the project. It runs no compiler without `--query-driver`, which
the check never passes. It loads no plugin that a compile command names. With
`--enable-config=false`, it reads no `.clangd` file. A `.clangd` file can
name a remote index, and clangd then reaches that index over the network.
That flag also turns off the user's own clangd configuration, because no flag
turns off only the project's file. clangd names a definition in another file
only through its background index. Without that index, an answer depends on
which files the pass opened before. So the check keeps the index on and waits
until it is complete. clangd writes the index beside the database that it
reads. So the check gives it a copy of the checkout's `compile_commands.json`
in a temporary directory of its own. When clangd stops, the check removes
that directory. clangd builds modules into the cache that a command names,
which can be inside the checkout. So the copy moves the module cache of each
command into that directory. The check must know whether clangd can answer,
and it must make that copy. So it reads the `compile_commands.json` that
clangd finds, also where Git ignores it, as in CMake's `build`. It reads
nothing else that Git ignores.

Amended by the review of TASK-367.15 (2026-10-06): those flags were not
enough. A compile command comes from the checkout. clangd runs clang's driver
on each command. When a CUDA, HIP or OpenMP command asks for the `native`
GPU, the driver runs a program to find it. The command can name that program
(`--nvptx-arch-tool=`). It can also put the program where the driver looks:
in a `-B` directory, in a `--cuda-path`, or beside the compiler that the
command names. clangd 21.1.8 ran such a script of a scratch checkout up to
six times for one command. A response file or a driver configuration file can
hold any of these flags. `-Xclang=` and a response file each moved the module
cache back into the checkout. `--query-driver` in the `CLANGD_FLAGS`
environment variable ran the compiler that a command names. So the copy of
the database names a GPU program that does not exist. It keeps no `-B`, no
response file and no configuration file. It moves the compiler into the
temporary directory under the same name, and it drops every module cache but
its own. Its own flags stand right after the compiler, where no flag of the
command can take one as its value. clangd starts without `CLANGD_FLAGS`, and
keeps its temporary files in the same directory. With these, clangd ran
nothing of the checkout and wrote only into that directory.

Amended by the review of TASK-367.16 (2026-10-06): the check itself writes
nothing into a checkout. The user names some servers for trusted checkouts.
Such a server can keep its own files in the build output of the project,
which Git ignores. An editor that runs the server gets the same files.
sourcekit-lsp 6.2.4 writes its index database and a module cache under the
package's `.build`, and no option of version 6.2 moves them. The check must
know whether sourcekit-lsp can answer. So it reads the package's
`.sourcekit-lsp/config.json` and looks for an index unit under `.build`. It
reads nothing else there.

Amended by TASK-367.11 and TASK-367.12 (2026-10-06): the refinement of
TASK-367 #4 said that C# and Swift keep their candidates without a language
server. As built, C# looks a name up over the namespaces of a project, and
Swift looks it up over the files of a package's module. Each lookup finds a
declaration by its address, as an import path names a file. So that evidence
is resolved without a language server. A use that the lookup cannot place,
such as a member of a value, still needs a language server.

Amended by TASK-367.09 (2026-10-06): the refinement of TASK-367.09 #1 matched
an include that resolves nowhere by its file name, as a candidate. That is not
built. On Redis, a match by file name finds one file for 393 of the 1,686
includes that resolve nowhere. 191 of those are system headers such as
`<stdint.h>`, and the match finds jemalloc's own copies of them. An include
that resolves nowhere reaches no file of the checkout. A checkout that needs
exact includes lists them in `compile_commands.json`.

Amended by TASK-367.28 (2026-10-06): a use as a value never makes a
dependency undrawn on its own. A call and a construction run a name. So do a
rendered component, a decorator and an attribute. A message to a class and a
class that derives from it also run it. In a chain that the
code calls, each name runs, as `api` does in `api.read()`. The check cannot
tell a member that the module of the name defines from a member of a library.
Every other use at run time is a use as a value: it reads a constant, passes
the name on, or tests a value against a class, as `instanceof`, `isinstance`
and a catch do. Each adapter marks such a use (`asValue` on a reference). It
stays call evidence, so it still supports a relationship and an anchor. But
`RELATIONSHIP_UNDRAWN` and `CALLER_UNDRAWN` rest only on a use that runs code.
The check is sure that a board must draw a dependency only where one part
runs the code of the other. A board seldom needs a constant read or an error
class in a catch. And nothing on a board can say that such a use is no
dependency. On the dogfood vault, the rule cleared 6 of 31 undrawn warnings.
It took parts out of 4 others, and it changed no other finding. The first
trial made such a use import evidence instead. That turned 39 right anchors
into `ANCHOR_MISMATCH` warnings. 25 of them are on call relationships that
cite a handler or a contract that the code passes on. 11 are on data
relationships that cite a constant, 2 on event and 1 on rpc relationships. So
the evidence kind stays call.

Amended by the review of TASK-367.28 (2026-10-07): a subscript is a link of a
chain, as a member is. So `handlers[kind]()` runs `handlers`, and a Python
class whose base is generic, `Base[int]`, derives from `Base`. Swift writes a
subscript as a call with its arguments in brackets, and that subscript reads
and runs nothing. A name passed on is a use as a value, and that has a
measured cost. On a copy of the dogfood vault with no relationships and no
flows, the rule took 41 of 246 undrawn findings away. Passing a name as an
argument was the only evidence for 28 pairs of parts. 21 of those pairs are
handlers that one part registers with another: the 18 command contracts of
the command table (`run.ts`), and the 3 write routes that the board routes
mount. The other 7 are constants. On Flask, the same reading joined 8 pairs:
each one was an `isinstance` test, a `TypeVar` bound or a `cast`. A part can
also keep a value to run it later. Examples are a class in an attribute
(`json_provider_class = DefaultJSONProvider` in Flask) and a function in a
list. That is a use as a value too. The syntax cannot tell a handler that a
part passes on from a constant that it passes on. And no right work clears a
warning that asks the board to draw a constant. So the rule stays, and the
check does not remind an author of a registration that the board leaves out.
Every such registration on the dogfood boards is drawn. To tell the two apart,
code facts must say whether a definition is a function, a class or a value.

Amended by TASK-436.15 (2026-10-07): each definition now records its kind.
A function includes a callable declaration or a directly assigned function literal.
A class includes another named type with members, such as a struct or a protocol.
Other definitions are values, including infrastructure declarations.
Each code adapter also marks a name passed as a call argument.
If that name reaches a function definition, the check counts it as running evidence.
The receiver can run that function later, so an undrawn registration now produces
`RELATIONSHIP_UNDRAWN`. A passed constant stays a value.
A class test, a plain function read and a name kept in an attribute or a list
also stay values. The evidence kind remains call for every runtime use, so
anchors keep their existing contract. A use whose definition kind is unknown
also keeps its existing value behavior.

The drawn rule counts a flow step as it counts a relationship. The code check
has done so since TASK-367.07 (`relationships.ts`). On a board that has
relationships of its own, the architecture picture draws no line for a step
(`step-lines.ts`). So a dependency that only a step draws shows only in the
board's sequences. It is not part of a container's interface either (ADR 0044).

Amended by TASK-433 (2026-10-07): a language server that can run code of a
checkout runs only where the agent that works in that repository configured it.
Then it runs as an editor runs it. This replaces the default servers of
TASK-367.14 and TASK-367.15. It also replaces the guards that made those
servers safe to run in a checkout that nobody agreed to run.

The old design had three problems:

- A checkout can be registered by observation. So a default server ran code of a
  repository that no agent chose to run.
- Every guard changed what the server did. So a server did not behave as it does
  in the user's editor, and the list of dangerous compiler flags was never
  certain to be complete.
- clangd rebuilt its index on every pass. That took 3.1 s per pass on Redis, and
  the pass failed on LLVM.

The observation-registration premise above is historical. TASK-436.16
(2026-10-07) removes its uncalled path: checkouts are registered explicitly with
`repo add`. Previously stored `observed` registrations still read. The
requirement to configure language servers per checkout remains.

The decision has these parts:

- Python, C, C++, Objective-C, C# and Swift have no default server. pyright is
  no safer than the others, because it runs the interpreter of the checkout's
  `.venv`. An agent configures the server of one language with
  `archboard repo language-server <language> <command>`. The registration of the
  checkout in `repos.json` keeps the command and its arguments. So the
  configuration is machine-local. `repo list` shows it, `repo forget` removes it,
  and registering the same root again keeps it. Registering the same identity at
  another root drops it, because nobody configured a server there.
- `language-servers.json` and `ARCHBOARD_LANGUAGE_SERVERS` are gone. The `false`
  value is gone too, because nothing needs it now. INSTALL.md and the consumer
  skill say that a configured server runs the code of the repository. So an agent
  configures one only for a repository that it works in.
- A configured server runs with exactly its command, its arguments and the
  environment of the Archboard server, in the directory of its project. The check
  no longer changes what clangd reads or writes:
  - It gives clangd no rewritten copy of `compile_commands.json` and no directory
    of its own, and it sets no `TMPDIR` or `XDG_CACHE_HOME`.
  - It passes no `--compile-commands-dir`, `--enable-config=false` or
    `--clang-tidy=false`.
  - It removes no `CLANGD_FLAGS`.
- The copy also dropped response files, `-B`, `--prefix`, `--config`, flags for
  GPU programs and module caches, and it moved the compiler. All of that is
  gone. So is the refusal of a database whose real path is outside the checkout.
  The refusal of pyright for a checkout whose `.venv` interpreter Git tracks is
  gone too.
- clangd keeps its background index where it keeps it under an editor, in
  `.cache/clangd/index`. The `.cache` directory is next to the
  `compile_commands.json` that clangd found. If that file is in a `build`
  directory, the `.cache` directory is next to `build`. This was measured with
  clangd 21.1.8.
- Without the copy, clangd 21.1.8 loads no plugin that a command names
  (`-fplugin=`, `-fpass-plugin=` or `-Xclang -load`), and it runs no compiler
  unless it gets `--query-driver`. It runs one program of the checkout. If a
  CUDA, HIP or OpenMP command asks for the `native` GPU, clang runs a helper
  program to find it. A script in a `-B` directory of the command ran four times
  for one command. By configuring clangd, an agent accepts that code.
- What the protocol needs for an answer stays:
  - opening the files of a server that answers only about an open file.
  - `workspace/synchronize` for sourcekit-lsp.
  - waiting for the end of the index progress of clangd.
  - finding the database, package or solution that a file belongs to. If there is
    none, the check says `language-server-unready`.
  - telling pyright which `.venv` to use.
  - killing the process group of a server that does not stop.
- sourcekit-lsp keeps the initialization option `backgroundIndexing: false`. A
  package whose own configuration turns it on stays `language-server-unready`.
  No Swift toolchain was on the machine that dropped the other guards, so nobody
  measured the default. If a later measurement shows that a warm package
  answers within the pass timeout with the default, the option goes.
- A language with no configured server says `language-server-missing` once for
  each checkout and language. The skip has the `repo` of the checkout, and its
  `detail` names the command that configures a server. A configured command that
  the Archboard server cannot find gets the same skip.
- At its start, a pass reads `repos.json` once. It takes the root and the
  servers of every checkout from that one reading. A change that another process
  writes during the pass applies to the next pass. `check --code` runs in the
  Archboard server. That server reads the file again for each pass, so a running
  server needs no restart for a new configuration. It looks up a command that is
  a name on the `PATH` that it started with. That `PATH` can differ from the
  `PATH` of the agent's shell. The skip says so, and an absolute path avoids the
  problem.
- TypeScript needs no configuration. The check runs the native
  `tsc --lsp --stdio` of the `typescript` package that the checkout installs. It
  looks only at `node_modules/typescript` at the root of the checkout. The
  package and the native program must be inside the checkout once their links
  resolve. The package must declare version 7 or later. The native program for
  this platform (`@typescript/typescript-<platform>-<arch>`) must be beside the
  package or inside it.
- TypeScript before version 7 has no `--lsp`. In that case, and for a checkout
  with no TypeScript, no native program or a link that leaves the checkout, the
  check runs the `tsc` of the `typescript` package of Archboard. In a monorepo
  the root decides, because a rule that reads the root only is easy to predict. A
  package that installs another version than the root uses the version of the
  root.
- This replaces the rule that no TypeScript of the checkout runs. The program is
  code of the checkout. The owner decided that it runs without configuration,
  because the checkout installed it for its own editor (TASK-433 #8).
- The cost sentence of TASK-367.15 no longer holds. On Redis (303 files in
  `compile_commands.json`, clangd 21.1.8, 24 cores), a cold pass took 4.6 to 4.8 s and each warm pass
  took 1.9 to 2.0 s, against 3.1 s before. A pass without clangd took 0.15 s. If
  the first index of a checkout takes longer than the 30 s bound, the pass still
  says `language-server-failed` once. Nobody measured whether the index shards
  that clangd writes before the check kills it let a later pass finish.

Amended by TASK-436.01 (2026-10-07): SourceKit-LSP owns its background indexing,
including building a Swift package on its first run. The check sends no
`backgroundIndexing` initialization option and requires no prebuilt index. A
package that enables background indexing is ready. A Swift file without a
`Package.swift` remains unready. Before questions, `workspace/synchronize` with
`index: true` waits for the build graph and background index to finish. This
replaces the SourceKit guards retained by TASK-433. Swift 6.1 and later enable
background indexing by default. The Swift 6.2.4 implementation of
[`Workspace.synchronize`](https://github.com/swiftlang/sourcekit-lsp/blob/swift-6.2.4-RELEASE/Sources/SourceKitLSP/Workspace.swift#L474-L483)
waits for both. No Swift toolchain was available on this implementation machine,
so no first-run or later-run duration was measured here.

Amended by TASK-436.02 (2026-10-07): a requested code check has no time
limit. Language-server initialization, indexing and questions, and the Git
commands for its code and history reading, wait until they finish. Caller
cancellation or a process exit ends the wait. Shutdown after the answers still
has a short cleanup deadline, then kills the process group. This replaces the
30-second request and index bound and the Git analysis bounds. Each requested
check reports its elapsed wall time first in text and in JSON `timings`: board,
code facts, each language server, and history. Language-server times
include startup, indexing, questions and cleanup, but exclude idle time between
questions. Code and history run together, so their times overlap. TASK-429 is
archived because a first index longer than 30 seconds no longer fails the pass.

Amended by TASK-539.01 (2026-10-25): the pass keeps what it reads of each module
that a container binds, and the server remembers it for the panes. For each
judged container the pass makes an exposure reading. It holds the module's
directory and root files, the exact count of the names the module exposes, the
exact count of those that a file outside it uses, and the names. A name has its
file and line, the files that pass it on (`via`), the exact count of the files
outside the module that use it, and those files with the first line of each use
and the ids of the parts of the board that hold that line. The parts come from
the rule that owns evidence, so a user is held by the same parts as a finding
puts it in. The names are listed with the most used first, then by name.
A reading lists at most 200 names and 25 users for a name, and the counts beside
the lists stay exact. `EXPOSED_UNUSED` and the reading take the names from one
rule (`exposed-names.ts`), so the number of names exposed, minus the number used
outside, is the number of names that the finding lists. A name that several
places declare counts once, and a member of a name counts with that name.
A reading quotes symbols, paths and lines, and no other text of a file
("Safety" holds for it).

The reading is no part of the answer of `archboard check --code`. The answer is
what it was, until a command asks for the names with an option of its own. The
server remembers each reading with the findings of its board and variant, in
the memory of TASK-367.24, and a later pass replaces it. Each remembered reading
of a board now also carries what the pass skipped on that board, what it
skipped without naming a board, and the counts of each container (module,
names exposed, names used outside). The panes poll these, so the names stay
out of them. `GET /api/vault/code-findings/exposure?board=&variant=&container=`
answers the names of one container from the same memory. Like the other route,
it requires a vault (ADR 0049), reads memory alone and never starts a pass. It
answers 404 when no pass has judged that container since the server started.

Amended by TASK-539.06 (2026-10-25): `archboard check --code --exposed` is the
option of its own. It sends `exposed=true` to the code check route, and the
answer then carries the readings as `exposures`, with the caps above; it needs
`--code`. Without the option the answer has no `exposures` key. Agents asked
for it by opting in, so an ordinary check stays small. The text output adds one
line for each container with its counts.

## Context

A board makes claims about code. Evidence rule 3 of the consumer skill makes an
agent keep one line of evidence for every relationship and every flow step: the
file and the symbol that prove the mechanism (`skills/archboard/SKILL.md`). The
product throws that line away, because a relationship has no field for it. A
binding names a file, but not what inside the file the part stands for.

The plain `archboard check` only tests that a bound path exists
(`src/runtime/semantic-board-store/lib/bindings.ts`). TASK-257 found 9 of 89
bindings dead after 141 commits with no vault update. TASK-328 found boards
whose bindings exist and whose descriptions no longer match the code. Every
open canvas polls the plain check every 5 seconds (`VAULT_CHECK_POLL_MS`), so
no reading of code can go there.

TASK-367.01 measured ten tree-sitter grammars under Bun with `web-tree-sitter`
0.27.0. Each one loaded from a `.wasm` file published on npm, with no build
step. The 1,781 TypeScript files of this repository parsed in 948 ms.
TASK-367.03 gave every vault diagnostic an optional subject, `{ kind, id, name }`
with the kind `node` or `edge`, and one line formatter, `diagnosticLine` in
`src/shared/semantic-policy`.

[ADR 0044](0044-a-containers-interface-is-what-relationships-from-outside-reach.md)
derives the interface of a container and leaves what the code exposes to the
code check.
[ADR 0045](0045-git-history-is-read-through-bindings-on-request.md) reads Git
history through bindings and states what it assumes about the code check. The
section "What ADR 0045 assumed" answers each assumption.

## Decision

### Terms

- The **code check** reads, on request, the code and the infrastructure that the
  bindings and anchors of a board name, and reports findings.
  `archboard check --code` runs it. The plain `archboard check` never does.
- An **anchor** is the one place in code that an author cites as proof of a
  relationship or a flow step: a repository, a file in it and a symbol in that
  file.
- A **symbol** is a name that code or infrastructure defines or references: a
  definition or a reference in code, or the address of a declaration in
  infrastructure or Nix.
- **Code facts** are what one file tells the check: what it defines, with the
  visibility of each definition, what it references, and what it imports.
- An **evidence kind** is what one piece of code or infrastructure proves about
  two parts.
- A **candidate** is evidence that the check matched by name only. Evidence is
  **resolved** in two cases. A language server named its definition, or the
  code names the file or the address that the evidence reaches. An import path
  and a Terraform reference name what they reach.
- A **finding** is one thing that the code check reports about one part,
  relationship or flow step.
- The **bound code** of a part is what its binding names: the definition that
  its symbol names, or else the whole file, or every file below the directory.

Language servers and the tasks say "resolved". `semantic resolve` settles a
reconciliation, and that is another thing.

### The anchor

A relationship and a flow step each accept one optional `anchor`. It has three
fields. Each one is required, in the input as in the board, as on a binding:

```json
"anchor": {
  "repo": "github.com/miklschmidt/archboard",
  "path": "src/runtime/semantic-board-store/lib/write.ts",
  "symbol": "newVocabularyProblem"
}
```

`repo` and `path` mean what they mean on a binding. `symbol` is the name in
that file that proves the mechanism. It can be the function that the file
calls, the component that it renders or the value that it passes on. It can
also be the environment value that the file reads or the event that one end
defines. In infrastructure, it is the declaration that joins the two parts.

Two things make an anchor **hold**. Its file is in the checkout, and the file
defines or references its symbol. An anchor that holds **supports** its
relationship or step, unless code facts show one of two things:

- The anchor proves an evidence kind that the relationship kind does not
  accept. A flow step has a message kind and no relationship kind, so the check
  never judges the evidence kind of a step's anchor.
- The symbol names a definition in the checkout, and that definition is in the
  bound code of neither end, nor of a part inside an end.

If the file uses the symbol in more than one way, one accepted evidence kind is
enough. If code facts cannot tell the evidence kind, the check does not judge
it. A file read as text gives no kind. A name that the file defines itself,
such as the event that one end defines, gives none either.

An anchor that supports its relationship is the author's proof. The check does
not argue with it, so it reports no backwards or unsupported finding for that
relationship.

The anchor stores no line. A line moves with every edit above it, so a stored
line is wrong after an edit that changes nothing about the relationship. The
check finds the line from the symbol, and a finding carries that line. The line
is never written into the board.

The evidence kind of an anchor is not authored. The code facts of the anchored
file decide it. An authored kind is a second answer that only the author keeps
true (ADR 0031).

On a draft, an anchor can name code that is not written yet: the place where
the call will be. This is the rule for a binding on a draft (ADR 0031). A
sentence in a request or a design document that states an intent is not an
anchor, because a sentence is not a symbol. A planned relationship whose
mechanism only a sentence states carries no anchor, and its `description` holds
the intent.

An anchor is bookkeeping (ADR 0023). Comparison ignores it, so a new or changed
anchor never marks a relationship or a step as changed. Reconciliation merges
it field by field, as it merges `emphasis` on a relationship and `note` on a
step. A conflicting change to it is a disagreement like any other. Every write
replaces the subject that it states, and a field left out is cleared
(`src/runtime/semantic-board-store/lib/edit-content.ts`). So a restatement
without the anchor drops it, and the answer of the write says so in a notice,
as `RELATIONSHIP_REPLACED` does. An anchor has no id of its own. It belongs to
its relationship or step.

### The binding symbol

A binding accepts one more optional field, `symbol`:

```json
"binding": {
  "repo": "github.com/miklschmidt/archboard",
  "path": "src/runtime/semantic-board-store/lib/vocabulary.ts",
  "symbol": "newVocabularyProblem"
}
```

The symbol is the definition that the part stands for. It is spelled as its
language or tool spells a qualified name. The same field holds the address of a
declaration in infrastructure or Nix:

| Code                   | Example `path`         | Example `symbol`                          |
| ---------------------- | ---------------------- | ----------------------------------------- |
| TypeScript             | `src/payments/post.ts` | `postPayment`, `Ledger.post`              |
| Terraform and OpenTofu | `infra/`               | `module.checkout.aws_lambda_function.api` |
| Kubernetes             | `deploy/checkout.yaml` | `Deployment/checkout`                     |
| docker-compose         | `compose.yaml`         | `services.checkout`                       |
| Nix                    | `flake.nix`            | `packages.x86_64-linux.archboard`         |

A symbol in a bound directory names a definition in some file below it. A
Terraform address is relative to the root module that the path names.

A changed symbol is a changed binding. Comparison compares a binding as one
record by value (`src/shared/semantic-board/lib/compare.ts`), so it needs no new
rule.

Each reader of a binding says what it does with the symbol:

- If code facts find the symbol, "open the code" opens the line where it is
  defined. Otherwise it opens the file (TASK-367.25).
- The pane inspector shows the symbol.
- The plain check tests the path only, as today.
- The history lens maps commits to files, and the symbol narrows nothing there
  (ADR 0045).

### Bound code

With a symbol, the bound code of a part is that definition and nothing else in
the file. Two parts can then bind one file with two symbols, and the check
tells their code apart. Without a symbol, the part owns the whole file or
directory.

Where the bound code of two parts on one board overlaps, the code belongs to
the part with the narrower binding. A symbol is narrower than its file, and a
file is narrower than a directory that holds it. Code that two parts bind in
the same way belongs to both.

Evidence from or to a part inside an end of a relationship counts as evidence
of that end. A relationship that ends on a container is a dependency drawn at a
higher level (ADR 0044). Evidence never joins a part to a part inside it, and
never joins two parts that bind the same code. The board already says that the
one holds the other, and the check cannot tell the code of the two apart.

### Evidence kinds

Every piece of evidence has one of six kinds:

| Kind             | Spelling           | What it proves                                                          |
| ---------------- | ------------------ | ----------------------------------------------------------------------- |
| Call             | `call`             | One part uses the other at run time, or starts its work.                |
| Configured path  | `configured-path`  | Configuration connects the two parts.                                   |
| Permission       | `permission`       | Access is allowed. It does not prove that access happens.               |
| Import           | `import`           | Code names other code, but only to import it or to use it as a type.    |
| Build dependency | `build-dependency` | One part is built from the other.                                       |
| Provisioning     | `provisioning`     | One part is set up with the other, and no traffic runs between the two. |

In code, a call is any use at run time of a name that another part defines: a
call, a construction, a rendered component, or the name passed on as a value.
So an import whose name the code uses at run time gives call evidence. An
import that only types use gives import evidence. A type-only import is never a
dependency at run time.

Configured path is one term. It is never shortened to "path", which is the file
field of a binding and an anchor.

The adapters classify what they read:

- **Code.** A use at run time is a call. An import, an include and a `using` are
  imports. A project reference in a `.csproj` file and a target dependency in
  `Package.swift` are build dependencies. An environment value that the code
  reads joins two parts only once infrastructure sets it to the address of
  another part. Then it is a configured path (TASK-367.23).
- **Terraform and OpenTofu.** A reference in an expression is a configured path.
  TASK-367.18 adds rules for each cloud provider that the user names. Under
  those rules, a trigger, a subscription and an event mapping are calls, and a
  grant is a permission. A listener, a target group and a network rule stay
  configured paths, and every other reference of that provider is provisioning.
- **Kubernetes.** A route to a Service is a call. A Service selector and an
  environment value that names a Service are configured paths. A NetworkPolicy
  that allows traffic is a permission.
- **docker-compose.** `depends_on`, links, an environment value that names
  another service and a shared volume are configured paths.
- **Nix.** A flake input and a derivation input are build dependencies.

Each piece of evidence has a direction. It goes from the part whose code makes
the use, holds the configuration or imports, to the part that it reaches. A
declaration that joins two other parts, such as an event mapping, goes from the
part that sends to the part whose work it starts.

### How relationship kinds accept evidence kinds

Each relationship kind in the vault configuration can name the evidence kinds
that it accepts, under a new key `evidence` (ADR 0024):

```yaml
relationshipKinds:
  call: { name: Call, dash: solid, arrowhead: filled, evidence: [call] }
  dependency:
    {
      name: Dependency,
      dash: dotted,
      arrowhead: open,
      evidence: [call, configured-path, import, build-dependency],
    }
```

A kind without the key accepts every evidence kind. The check then never judges
the evidence kind of its relationships. An unknown evidence kind makes the
configuration invalid, and the plain check reports it as it reports every
invalid configuration (ADR 0026).

The default vocabulary carries the key for its kinds, so a new vault gets these
values:

| Relationship kind                       | `evidence`                                              |
| --------------------------------------- | ------------------------------------------------------- |
| `call`, `render`                        | `call`                                                  |
| `http`, `rpc`, `event`, `queue`, `data` | `call`, `configured-path`                               |
| `dependency`                            | `call`, `configured-path`, `import`, `build-dependency` |
| `other`                                 | no key                                                  |

A call and a render are uses in code. A use in code, a trigger or a route in
infrastructure, or configuration that points one part at the other proves a
network relationship. Every kind that shows that one part needs the other
proves a dependency. Permission and provisioning show no need, so no
default kind accepts them. A vault that draws grants or provisioning adds a
kind that accepts them.

### What the check judges

The check judges four things:

- **A binding with a symbol.** The bound file or directory must define the
  symbol or declare the address.
- **An anchor.** It must hold and support its relationship or step. The check
  tests every anchor in a checkout that it reads, also on a relationship with
  an unbound end, such as a call to an external library.
- **A relationship with no anchor, both ends bound.** Accepted evidence from the
  bound code of its start to the bound code of its end supports it. Otherwise
  the check says that the accepted evidence runs only the other way, or that
  none joins the ends. A relationship with an anchor gets no such judgement,
  because its anchor decides.
- **Two bound parts with no relationship between them.** Evidence of a call, a
  configured path or a build dependency from one to the other is a dependency
  that the board does not draw.

Three things make a finding a warning:

- The code contradicts what the board states.
- The check is sure of it. The check is sure of a name that is absent from a
  file, and of resolved evidence.
- A right change to the board or the code clears it.

Every other finding is information. Information means here what it means in
ADR 0045: it changes no exit status, it puts no dot on the diagnostics bell,
and the canvas draws nothing for it.

A candidate is never a warning. A name can match an unrelated definition, and
nothing on a board can clear a false match. A warning that right work cannot
clear makes a clean check unreachable, and then the warning stops meaning
anything (ADR 0031, ADR 0045).

The judgement of a relationship with no anchor is always information. It rests
on evidence alone, and evidence alone does not make the check sure. The
direction of a relationship kind is the vault's convention (ADR 0024), and code
does not always run that way: a subscription in code runs from the handler to
the part that sends the event. And the absence of evidence proves nothing about
a call across a network, through an event bus or through a value that a part
receives. An anchor turns the relationship into a claim that the check holds to
the code, and the findings about an anchor are warnings.

| Code                       | Says                                                                                       | Severity                            | Task                     |
| -------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------ |
| `ANCHOR_PATH_MISSING`      | The anchored file is not in the checkout.                                                  | warning                             | TASK-367.05              |
| `ANCHOR_SYMBOL_MISSING`    | The anchored file neither defines nor references the symbol.                               | warning                             | TASK-367.05              |
| `BINDING_SYMBOL_MISSING`   | The bound file or directory does not define the symbol or declare the address.             | warning                             | TASK-367.05              |
| `BINDING_PATH_MISSING`     | On a named draft, the bound path is not in the checkout.                                   | warning                             | TASK-367.05              |
| `ANCHOR_MISMATCH`          | The anchor holds, and it does not support its relationship or step.                        | warning, information on a candidate | TASK-367.06, TASK-367.07 |
| `RELATIONSHIP_UNDRAWN`     | Evidence joins two bound parts, and no relationship joins them.                            | warning, information on a candidate | TASK-367.07              |
| `RELATIONSHIP_BACKWARDS`   | The relationship has no anchor, and accepted evidence runs only from its end to its start. | information                         | TASK-367.07              |
| `RELATIONSHIP_UNSUPPORTED` | The relationship has no anchor, and no accepted evidence joins its ends.                   | information                         | TASK-367.07, TASK-367.23 |

`ANCHOR_MISMATCH` says which of the two reasons holds. TASK-367.06 brings the
definitions, so it reports a definition outside both ends. TASK-367.07 brings
the `evidence` key, so it reports an evidence kind that the relationship kind
does not accept. A finding about a missing path or a missing symbol is the only
finding about that binding or anchor.

The tracer bullet reads every file as text. There, the test of a symbol is its
last name as a whole word in the file: `post` for `Ledger.post`, and
`checkout` for `Deployment/checkout`. The address of a declaration never
stands in a file as one word, so the text reading can test only its last name.
With an adapter, a symbol that the file holds only in a comment is absent. So
is a symbol in a string that the adapter does not count as a reference. A symbol that the file holds only inside a part that did not parse is
skipped, never absent.

An undrawn finding is about the part that the evidence reaches. It lists every
bound part that reaches that part with no relationship, with one piece of
evidence for each. So 7 parts that use one shared helper make one finding on
the helper (TASK-367.07). A relationship in either direction between the two
parts, or between parts that contain them, counts as drawn. Evidence of kind
permission, import or provisioning is never undrawn. Each board owns its
content (ADR 0023), so the check never joins parts on two boards.

TASK-368.10 and TASK-368.11 name their own codes under the same rule. An entry
point bound to a definition that the code does not expose is a warning. A
hidden part bound to an exposed definition that an outside file uses is a
warning, or information on a candidate. If a part on the board binds that
outside file, the undrawn finding already says so, and TASK-368.10 adds no
second finding. An exposed name that nothing outside its module uses, a
pass-through variable and a shallow Terraform module are information.

### Which variants the check reads

The check reads the current variant of every board. A board with no current
variant has nothing built, and the check skips it (ADR 0031).

`--variant <name>` names a draft. Every board that has a draft of that name is
read at that draft, and every other board at its current variant. So
`--variant TASK-123` reads the vault as it will stand after the adoption of
every proposal of TASK-123. A task proposes on several boards under one name
and closes all of them at once (archboard-dev). If no board has a draft of that
name, the command is refused, and the refusal names the drafts that exist.

The check never reads a historical or a shelved variant. They are records of
what was true or what was proposed, and a finding on them pushes somebody to
rewrite a record.

To name a draft is to say that its code is built now. On a named draft, the
check also reports a bound path that is not in the checkout, with the plain
check's code `BINDING_PATH_MISSING`. The plain check stays silent about drafts
(ADR 0031), and a task that closes needs to know before it adopts.

### What the check reads

The check reads the files of each registered checkout as they are on disk, with
uncommitted edits. That is the code that "open the code" opens. It is also the
state in which an agent closes a task, before it commits.

It reads only the files that Git does not ignore: the tracked files, and new
files that Git does not ignore. So a binding to a directory never reads
`node_modules`, build output or an ignored `.env` file.

The check skips what it cannot read, and the answer names the reason. These are
the reasons:

- A repository that this machine has not registered.
- A binding pinned to a branch or a commit that its checkout does not have out.
  A relationship or a step with a skipped part at an end is skipped with its
  anchor.
- A bound path that Git ignores.
- Code that the check reads only as text, such as an Objective-C++ file, for
  the findings that need references: backwards, unsupported and undrawn. Its
  anchors and bindings still get the text reading.
- A symbol that the check finds only inside a part of a file that did not
  parse.
- A board with no current variant and no draft of the named variant.

Later tasks add reasons of their own: a missing language server, project file,
`compile_commands.json` or index (TASK-367.13 to TASK-367.16), and a Nix
expression that the static parse cannot follow (TASK-367.21, TASK-367.22).

A skipped subject gets no finding and changes no exit status. A subject that the
check did not read must never look like a subject with no findings. So the
answer lists everything that the pass skipped, with the reason, and the CLI
prints one line for each reason with a count. A reason that holds for a whole
checkout or language, such as a missing language server, is listed once and
names no subject. That is how the check says a thing once.

### The command, the route and the answer

`archboard check --code [--variant <name>]` runs the plain check and then the
code pass, and prints both. TASK-367.17 adds `--plan <file>`, which names a
Terraform or OpenTofu plan JSON inside a registered checkout. It can repeat.

The CLI asks the plain check's route and then `GET /api/vault/code-check`, a
route of its own. A pass changes nothing, so the route is a `GET`. The pass runs
in the Archboard server as checkout work
(`src/server/archboard/lib/checkout-work.ts`), the admission that the code
opener already uses. A caller that disconnects cancels the pass. A stop cancels
it and waits for it to settle, so a stop never waits on a long pass and never
refuses because of one. Before a pass settles, it stops every language server
that it started. `/api/vault/check`, which every open canvas polls, never runs
a pass.

The answer has four parts:

- `boards`: each board that the pass read, the variant that it read, and the
  version of the board.
- `findings`: what the pass found.
- `skipped`: what it did not read or do, with the reason.
- `behind`: the reading of ADR 0045, the commits that each board and part is
  behind its code. It is information, and it stays apart from the findings.
  TASK-369.02 builds it.

A pane never starts a pass (TASK-367.24). For the pane, the server keeps the
findings of the last pass in its memory, and never in a file. Beside them it
keeps the version of each board that the pass read. TASK-367.24 builds that
memory and the route that reads it, because only the pane needs them.

### The shape of a finding

A finding has the shape of a vault diagnostic. It reuses the diagnostic's
`code`, `file`, `path`, `board`, `variant`, `subject` and `message`. `file` and
`path` say where in the board the subject is, as on every diagnostic. Its
`severity` is `warning` or `information`, never `error`. One more field,
`evidence`, lists what the finding rests on:

```json
"evidence": [
  {
    "kind": "call",
    "resolution": "resolved",
    "from": "persist",
    "to": "settle",
    "repo": "github.com/miklschmidt/archboard",
    "path": "src/runtime/semantic-board-store/lib/diagnostics.ts",
    "line": 100,
    "symbol": "readSemanticBoardAt"
  }
]
```

`resolution` is `resolved` or `candidate`. `from` and `to` are the ids of the
parts whose bound code makes the use and holds what it reaches, where the check
knows them. A finding that says something is missing has no evidence to rest
on, so it has no `evidence`. An undrawn finding has one piece of evidence for
each part that reaches its subject.

The subject of a diagnostic gains the kind `step`, because a flow step carries
an anchor. TASK-367.03 allows only `node` and `edge`. The kinds stay the
board's own subject kinds. A step has no name of its own, so its subject names
it by three things: the name of its flow, its ends as a relationship names
them, and its label. An example is `Checkout: Web shop -> Orders API: place order`.
`describeSubject` prints the kind as `step`.

The widened kind is in the one `DiagnosticSubjectSchema` of
`src/shared/semantic-policy`. Every reader of a diagnostic parses it through
that one enum: the CLI, `semantic-board-client`, the pane and the skill
evaluation. No reader keeps a narrower copy of it. The plain check never names
a step, but every reader accepts one. The schema of a finding extends
`VaultDiagnosticSchema`, replaces its severity and adds `evidence`.

The CLI prints a finding with `diagnosticLine`, and then each piece of
evidence: its kind, its resolution and its place in code, for example
`call, resolved, src/runtime/semantic-board-store/lib/diagnostics.ts:100`.

A finding quotes a symbol, a path and a line. It never quotes other text from a
file. A file can hold a secret, and the Archboard server answers any request
from this machine with no authentication.

### Exit status

The exit status follows `archboard check`. If the plain check has a diagnostic
or the code pass has a warning, the command exits 1. Otherwise it exits 0.
Information never changes it.

Code findings put no dot on the diagnostics bell. The bell reads the plain check
(ADR 0026), and only a request starts a code pass. TASK-367.24 decides how a
pane shows findings.

### The cache

Code facts are cached by file content. The Archboard server keeps one entry in
memory for each file that a pass read: the hash of the bytes that it read, and
their facts. Each pass reads and hashes every file again. If the hash matches,
the pass takes the facts from the entry. Otherwise it parses the file and
replaces the entry. So a pass always sees an edit, an uncommitted one too, and
the cache never holds more than one entry for a file.

A new grammar or a new query needs a restart (ADR 0021), and a restart starts
with an empty cache. Some facts depend on another file, such as an import
resolved through the `paths` of `tsconfig.json`. Each pass resolves those again
from the cached facts.

Amended by TASK-436.07 (2026-10-07): a C-family header uses the language
of its supported source with the same name in the same directory.
Without that source, the header keeps its existing reading from its own text.
The cache also compares the source's path and content hash.
An edit to either file therefore refreshes the header's facts.

The answers of a language server are not cached from one pass to the next. One
pass starts each server once and asks it every candidate. If a measurement
shows the need, a later task can add a cache.

Nothing writes code facts or a finding into a board, into the vault or into any
file (ADR 0015). The memory goes with the process.

### The engine

Tree-sitter reads every programming language and Terraform in one way. A query
file for each grammar finds the definitions, references and imports of a file.
A name that matches is a candidate. A language server resolves a candidate to
its definition. With no language server, the check says so once and reports
candidates.

Kubernetes manifests and compose files are YAML, and `flake.lock` is JSON.
Their adapters parse them with Bun's own parsers, as the vault configuration is
parsed, and need no grammar. `Bun.YAML.parse` reads a file of several YAML
documents as a list (Bun 1.4.2, measured on 2026-10-06).

The engine is two modules under `docs/agents/boundaries.md`:

- `packages/code-intel/src/runtime/operations/code-facts` owns the grammars, the query files, the adapters, the
  cache and the language servers. The check asks it for the code facts of a
  file and for the resolution of candidates. The check never sees tree-sitter, a
  grammar or a language server.
- `packages/code-intel/src/runtime/operations/code-check` reads boards through the store's interface, holds
  anchors, bindings and relationships against code facts, and gives findings.

The schema of the answer lives in `packages/code-intel/src/shared/protocol/code-check.ts`. The schema of the
anchor lives beside the schema of the binding in `packages/code-binding/src/shared`. The
evidence kinds live in `src/shared/semantic-policy`, because the vault
configuration names them. The route is mounted in `src/server/archboard`, and
the CLI option joins the check command in `src/cli/commands/vault.ts`.

One adapter answers the code facts of one file of a checkout:

- **Definitions**: each symbol, the lines that it spans, and its visibility. The
  visibility is the language's own word or rule, such as `public` or a name in
  `__all__`. It also says whether the definition is exposed outside its module
  or internal.
- **References**: each symbol, its line, its evidence kind, whether only a type
  uses it, and the file or the address that it reaches, where the code names
  one.
- **Imports**: what each one names, the file that it resolves to, where the
  adapter can resolve it, and whether only types use it.

Infrastructure and Nix adapters answer the same three. A Terraform resource is
a definition, and a reference in an expression is a reference.

The tracer bullet reads every file as text, and that text reading stays as the
adapter for every file that no grammar or parser reads. So the seam has two
adapters from TASK-367.06 on, and the Python adapter (TASK-367.08) is the third.

A part of a file that did not parse holds no facts. The check skips a symbol
that it finds only there, and never reports it as missing. Tree-sitter recovers
from an error and parses the rest of the file.

A language server runs over stdio. The machine-local file
`language-servers.json`, in the state directory of Archboard beside
`repos.json` and `opener.json`, names the command for each language. A server
command is a fact about this machine, not about the vault (ADR 0011, ADR 0018).

By default the check uses three servers that read a project without running any
of it:

- TypeScript uses Archboard's own `typescript` package. Its version 7.0.2 is a
  language server with `tsc --lsp --stdio`. On 2026-10-06 it resolved
  `newVocabularyProblem` in `write.ts` through the `@/` alias to its definition
  in `vocabulary.ts`, 301 ms after it started. So TypeScript needs nothing more
  on a machine, and no TypeScript of the checkout runs.
- Python uses `pyright-langserver`, and C, C++ and Objective-C use `clangd`. The
  check looks for both on the `PATH`.

Other servers evaluate project files that can hold code. The C# servers
evaluate MSBuild files, and sourcekit-lsp evaluates `Package.swift`. The check
starts such a server only from an entry in `language-servers.json`. The user
writes that entry for this machine and for checkouts that they trust. The check
never asks a server to build. Every timeout of the engine lives in
`packages/timing/src/shared/constants/timing.ts`.

### The packages

The check needs these packages. Each grammar is the upstream release of a
tagged grammar, so a query is written against a known tree. Swift and Nix come
from `@lumis-sh`, because no upstream publishes them on npm. Both are built from
the exact upstream tag (TASK-367.01).

| Package                                 | Version | Licence    | Gives                  |
| --------------------------------------- | ------- | ---------- | ---------------------- |
| `web-tree-sitter`                       | 0.27.0  | MIT        | the runtime            |
| `tree-sitter-typescript`                | 0.23.2  | MIT        | TypeScript and TSX     |
| `tree-sitter-python`                    | 0.25.0  | MIT        | Python                 |
| `tree-sitter-c-sharp`                   | 0.23.5  | MIT        | C#                     |
| `tree-sitter-objc`                      | 3.0.2   | MIT        | Objective-C            |
| `tree-sitter-c`                         | 0.24.1  | MIT        | C                      |
| `tree-sitter-cpp`                       | 0.23.4  | MIT        | C++                    |
| `@tree-sitter-grammars/tree-sitter-hcl` | 1.2.0   | Apache-2.0 | Terraform and OpenTofu |
| `@lumis-sh/wasm-swift`                  | 0.26.3  | MIT        | Swift                  |
| `@lumis-sh/wasm-nix`                    | 0.26.3  | MIT        | Nix                    |

The user approved this list on 2026-10-06, as the notes of TASK-367.01 record.

They are runtime dependencies, pinned to these exact versions. A grammar
release can rename the nodes that a query names, so an upgrade is a task of its
own that runs the adapter tests. The set puts 248 MB into `node_modules`, of
which 23 MB is `.wasm`. The check loads only the `.wasm` files. None of the
packages joins `trustedDependencies`, so Bun keeps blocking their `node-gyp`
install scripts. Nothing is built at install or at run time (ADR 0014).

`typescript` is a development dependency today. The check runs it, so it moves
to the runtime dependencies (TASK-367.13). No package is added for YAML or JSON.

### Safety

The check reads files and nothing else.

- It reads only files inside a registered checkout that Git does not ignore. It
  tests that a path stays inside its checkout before and after it resolves
  symbolic links, as the code opener does (`packages/code-binding/src/runtime`).
- It never reads Terraform state (`*.tfstate`), variable files (`*.tfvars`) or
  the `.terraform` directory, even where Git tracks them. State and variable
  files can hold secrets in plain text, and the Archboard server has no
  authentication.
- It never reads a secret value: the data of a Kubernetes Secret, or a value in
  an env file. An env file gives names only.
- It never reaches the network or a cloud API. A remote Terraform module and a
  flake input are references that reach code that the check does not read.
- It never runs `terraform`, `tofu`, `kubectl`, `helm`, `kustomize` or `nix`.
  These need credentials, reach the network or run code. Helm and Kustomize
  output counts only as files that somebody rendered.
- It reads only the plan JSON files that an agent names with `--plan`, and only
  inside a registered checkout. The server takes paths from any local request,
  so it reads no path outside a registered checkout. From a plan JSON it reads
  addresses and the references between them, never an attribute value. A plan
  JSON can hold sensitive values in plain text.
- The only programs that it starts are `git`, to list the files and the refs of
  a checkout, and the language servers that the rules above allow. By default
  no code of the project runs. A server that the user names can keep its own
  files in the ignored build output of the project (the amendment above).

The difference between the infrastructure code and the live cloud stays the job
of `terraform plan`.

### What the spike found that later tasks must handle

- **The Objective-C macro problem.** One unknown macro after a declaration,
  `AF_API_AVAILABLE(...)`, puts 92% of `AFURLSessionManager.m` inside error
  nodes. Before TASK-367.10 parses a file, it blanks out known attribute
  macros. The blanks are spaces of the same length, so every line and column
  keeps its place. The adapter keeps its own list of the attribute macros of
  the SDK. A macro that a header of the checkout defines with `#define` as one
  of those macros joins the list. The check reads no SDK header, because it
  reads no file outside a checkout.
- **Objective-C++ has no grammar.** `.mm` files parse badly under the
  Objective-C grammar (355 error lines of 399 in `RLMObjectSchema.mm`). The
  check reads them as text: anchors and bindings get the text reading, and no
  evidence comes from them. The answer names them as read only as text.
- **The TypeScript regex failure.** One regular expression with raw control
  characters, in `packages/renderer/src/shared/rules/svg/page/primitives.ts`,
  puts one line in an error node. The rule for parts that did not parse covers
  it. TASK-367.06 tests that the rest of the file keeps its facts.
- **Macros in C and C++, and newer Swift syntax**, put a few lines in error
  nodes (41 of 11,658 in SQLite `btree.c`). The same rule covers them.

### Refinements of the tasks

This decision refines these acceptance criteria. Each refinement is the
criterion as the tasks must now read it.

- **TASK-367 #3** ("Every finding names the evidence kind it rests on and says
  whether a language server resolved it or it is a candidate"). A finding that
  says something is missing rests on no evidence, so it names no evidence kind.
  Evidence is also resolved where the code names the file or the address that
  it reaches: an import path, a Terraform reference or a compose service name.
  Infrastructure has no language server, so otherwise no finding about
  infrastructure is ever a warning. TASK-367.07 #4 reads the same way.
- **TASK-367 #4** ("never ... commands that need credentials or run code"). The
  check runs no code of the project. A language server that evaluates project
  files, for C# or Swift, runs only where the user named it for this machine.
  Without one, C# (TASK-367.14) and Swift (TASK-367.16) keep their candidates,
  and the check says so once.
- **TASK-367 #1 and TASK-367.07 #3** (relationships that the code runs the
  other way). The check reports them as information, for the reason in "What
  the check judges".
- **TASK-367.05 #4** ("Repositories this machine has not registered stay
  silent"). Silent means no finding and no change to the exit status. The
  answer still lists their parts as skipped.
- **TASK-367.09 #1** ("configured include directories"). No configuration names
  include directories. Without `compile_commands.json`, an include first
  resolves against the directory of the file that includes it. Then it resolves
  against the checkout root and each directory named `include`. An include that
  resolves nowhere is matched by file name, as a candidate. A checkout that
  needs exact includes generates `compile_commands.json`, which clangd needs
  too (TASK-367.15).
- **TASK-367.17 #3** (references between resource-bound parts). Until
  TASK-367.18 gives a provider its rules, every reference of that provider is a
  configured path. So a reference supports a relationship, and a reference that
  the board does not draw is undrawn, as TASK-367.17 asks. TASK-367.18 then
  makes most of them provisioning.
- **TASK-367.20 #2** ("a shared volume is a data relationship"). A shared volume
  is configured-path evidence, which a `data` relationship accepts.
- **TASK-367.24 #3** ("The pane reads cached findings"). The server keeps the
  findings of the last pass in memory, and TASK-367.24 builds that memory.
- **TASK-367.26 #1** ("on each proposal before adoption"). One run of
  `archboard check --code --variant TASK-<n>` reads every proposal of the
  task, because they share its name.

### What ADR 0045 assumed

ADR 0045 assumed six things about the code check. This decision keeps four and
changes two.

1. "`archboard check --code` runs on a route of its own that only a request
   starts, never inside the polled check." Kept. The route is
   `GET /api/vault/code-check`.
2. "The server keeps its answer in memory, keyed on the HEAD of each checkout it
   read." Changed. The code check reads uncommitted edits, so an answer kept on
   HEAD is wrong after the next edit. The check caches code facts by file
   content, and hashes the files again on each pass. The findings that the
   pane reads are kept beside the version of each board (TASK-367.24). Behind,
   the reading of ADR 0045, reads commits, so it keeps its own memory keyed on
   HEADs.
3. "It reads each registered checkout at its HEAD, and a repository that this
   machine has not registered stays silent." Changed in its first half. The
   check reads the files of each registered checkout as they are on disk, which
   is HEAD with the uncommitted edits. Behind still counts the commits on HEAD.
   The paragraph of ADR 0045 on where behind answers now says so. The second
   half is kept: an unregistered repository gets no finding, and the answer
   lists its parts as skipped.
4. "It reads the current variant of every board, and a named draft with
   `--variant`." Kept. `--variant` names the draft on every board that has one,
   and every other board is read at its current variant.
5. "Its exit status follows `archboard check`, so only a warning or an error
   fails it." Kept. Information never fails it.
6. "It skips a part pinned to a ref that its checkout does not have out, as this
   decision does." Kept. A relationship or a step with such a part at an end is
   skipped with its anchor.

Behind joins the answer of `archboard check --code` as information, apart from
the findings, as ADR 0045 decides.

## Considered and rejected

### The anchor

- **Call the field `evidence`.** Evidence is what the check finds in the code.
  The anchor is what the author cites. One word for both gives "the evidence of
  this relationship" two meanings.
- **Call it `source`.** The start of a relationship is its source, and "source"
  also means source code.
- **Call it a binding.** A binding is the one primary code location of a node,
  and "open the code" opens it. A relationship has nothing to open.
- **Call it `proof`.** An anchor can stop holding. The name claims more than the
  field is.
- **Take `repo` from a binding at an end, in the board or only in the input.**
  An end can be unbound or external, and evidence in infrastructure often lives
  in another repository. In the board, the anchor then moves with every new
  binding of a part at its end. In the input, the write boundary needs one more
  rule and one more refusal, for an anchor whose ends are both unbound. A
  binding already makes an agent write its repository.
- **Store a line.** Lines move with unrelated edits. Every such edit makes a
  finding, or needs a write to the vault to move the line.
- **One string, such as `src/write.ts#settle`.** It needs one more parser and a
  rule for the repository, and the schema cannot check its parts.
- **A list of anchors.** Evidence rule 3 records one line for each relationship.
  A list invites an agent to cite every call site. The check finds the other
  evidence itself, such as the infrastructure side of a network hop
  (TASK-367.23).
- **A branch or a commit on the anchor.** The check reads the files on disk, and
  an anchor opens nothing. The pins of the bindings at the ends decide whether
  the check can read it.
- **Compare anchors.** Then a better citation marks a relationship as changed,
  and a proposal that only adds anchors reads as a redesign (ADR 0023).
- **Let a sentence be an anchor.** A sentence is not a symbol, and the check
  cannot hold a sentence to code. The word symbol then means two things.

### The binding symbol

- **A separate field for infrastructure, such as `address`.** A resource
  address and a code symbol do the same work: they name the definition inside
  the path that the part stands for. Two fields need a rule that says which one
  applies, and every reader must learn both.
- **A symbol outside the binding.** Then a changed symbol is not a changed
  binding, and comparison needs a new rule.

### The mapping

- **A default by kind name, with no key.** The product then reads meaning into
  names that the consumer chose (ADR 0024). A vault that calls its event kind
  `publishes` gets nothing, and a vault that means something else by `call`
  gets the wrong rule.
- **A default by kind name and a key.** It is two ways to say one thing. A
  reader cannot tell from the configuration which rule applies. The default
  vocabulary carries the key, so a new vault gets the values with no name rule.
- **Authored evidence kinds on each relationship.** The kind of the relationship
  already says what the author claims. A second authored kind can disagree with
  it.
- **Make the key required.** Every vault then needs a change to its
  configuration before the check can run. A kind without the key still gets
  every finding except the judgement of its evidence kind.

### The findings

- **Make a candidate a warning.** Nobody can clear a false match. A machine with
  no language server then fails the check for names that it cannot resolve.
- **Resolve only through a language server.** A Terraform address, a compose
  service name and an import path name what they reach exactly. To call them
  candidates says that the check is unsure of what it knows. Infrastructure has
  no language server at all, so its findings can never be warnings.
- **Make a backwards or an unsupported relationship a warning.** An event
  relationship that is right reads as backwards in code, and a call across a
  network shows no evidence in code. Each warning then fires on a right board
  until somebody adds an anchor. The code check of every vault without anchors
  then fails on its first run.
- **Two codes for an anchor that does not support its relationship**, one for
  its evidence kind and one for a definition outside both ends. Both have one
  repair: cite the symbol that proves the relationship, or change the
  relationship to what the code does.
- **`ANCHOR_FILE_MISSING`.** The field is `path`, and the plain check already
  says `BINDING_PATH_MISSING`. One word for one meaning.
- **One undrawn finding for each pair of parts.** 7 parts that use one shared
  helper then make 7 findings, and TASK-367.07 asks for one.
- **Report a relationship without an anchor.** Most boards have none today. The
  backwards and unsupported findings already read such a relationship through
  its evidence. The consumer skill writes anchors from now on.
- **A finding for a subject that the check did not read.** A skipped subject is
  not a fault of the board. A list of skipped subjects with reasons says so
  without a severity.

### The command and the answer

- **Run the code pass inside the plain check.** Every open canvas polls it every
  5 seconds, and the skill runs it after every board write.
- **A command of its own, such as `archboard code-check`.** The agent already
  runs `archboard check` after board work. A flag keeps one command with one
  exit status for the whole check.
- **Run the pass in the CLI process.** The pane then cannot read its findings,
  and two processes each keep a cache.
- **A `POST` route under `asyncEndpoint`.** Every request other than a read
  takes a write admission until it answers
  (`src/server/archboard/lib/mutation-work.ts`). A stop waits only
  `SERVER_MUTATION_DRAIN_TIMEOUT_MS`, one second, for that admission, and then
  refuses. A pass reads and runs for seconds, so it is checkout work.
- **A route for the findings of the last pass, built with the pass.** Only the
  pane reads it, so TASK-367.24 builds it.
- **A finding type of its own.** It repeats the site and subject fields, and it
  needs a second line formatter. The inspector then lists two shapes for one
  subject. A finding is a diagnostic with evidence.
- **Put code findings among the plain diagnostics.** The poll then shows the
  findings of a pass from an hour ago as current, and the bell lights for them.
- **`--variant` for one board, as `<board>@<variant>`.** A task proposes on
  several boards under one name, and closes all of them at once (archboard-dev).
- **Read HEAD, not the files on disk.** An agent runs the check before it
  commits, and "open the code" opens the files on disk.
- **`--plan` from TASK-367.05.** Only Terraform needs it, so TASK-367.17 adds it.

### The cache

- **Key the answer on the HEAD of each checkout.** The check reads uncommitted
  edits, and an agent runs it before it commits.
- **Key the cache on the hash alone.** Every edit then adds an entry, and the
  cache grows for the life of the server.
- **Keep code facts on disk.** A file on disk outlives the process that wrote
  it, and a new grammar then reads the facts of the old one (ADR 0014). This
  repository parses in under a second, so memory is enough until a measurement
  says otherwise.
- **Cache the answers of language servers.** An answer depends on every file of
  the project, not only on the two files that it names. A key of every file is
  the cost that a pass already pays.

### The engine

- **A language server alone.** It needs a server for every language on every
  machine, and infrastructure has none. The check must work without one.
- **The TypeScript compiler API.** It reads one language. The check needs eleven
  kinds of file through one seam.
- **Text or regular expressions alone.** A name in a comment or a string counts,
  and references and visibility are out of reach. The text reading stays only
  where no grammar or parser exists.
- **Native tree-sitter bindings.** They compile with `node-gyp` at install, which
  is a build step (ADR 0014), and Bun blocks their install scripts.
- **External tools, such as universal-ctags, ast-grep or semgrep.** Each is a
  binary that a machine does not always have, and none covers all eleven kinds
  of file with references and visibility.
- **A YAML grammar.** Bun parses YAML and JSON already. A grammar is one more
  package for the user to approve.
- **`typescript-language-server`.** It is one more program for every machine to
  install. It can also start the TypeScript of the checkout, which is code of
  the project. Archboard's own TypeScript already answers the protocol.
- **Language servers that run project code, on by default.** The safety rules
  say that the check runs no code of the project. The user turns such a server
  on for checkouts that they trust.
- **Language server commands in the vault configuration or in a checkout.** A
  command and its place on disk are facts about one machine, and the vault and
  the checkout are shared. Archboard writes nothing into a checkout.
- **An environment value that moves `language-servers.json`**, as
  `ARCHBOARD_REPOS` moves `repos.json`. Nothing needs it yet. A test that needs
  one can add it.
- **Include directories in a configuration.** `compile_commands.json` already
  holds them, and clangd needs that file anyway.

### The packages

These are the sources that TASK-367.01 rejected:

- `tree-sitter-wasms` 0.1.13 was built with tree-sitter 0.20, and
  `web-tree-sitter` 0.27 refuses its files.
- `@vscode/tree-sitter-wasm` 0.3.1 has no Swift, Objective-C, HCL or Nix
  grammar.
- The whole `@lumis-sh/wasm-*` set builds some grammars from a branch and not
  from the release tag. Its Python grammar gives another tree than the 0.25.0
  release, and a query for the release does not compile against it.
- A `.wasm` file built at install is a build step (ADR 0014). A `.wasm` file
  committed to Git is a derived binary in the repository.
- The npm name `tree-sitter-hcl` is a security placeholder.

## Consequences

- TASK-367.04 adds `anchor` to a relationship and a flow step and `symbol` to a
  binding, in the persisted schema and the agent input. `CodeAnchorSchema` sits
  beside `CodeBindingSchema`, with three required fields. Comparison leaves the
  anchor out of the compared fields, and reconciliation merges it as it merges
  `emphasis` and a step's `note`. A restatement that drops an anchor answers
  with a notice. The consumer skill writes the record of evidence rule 3 as the
  anchor. A planned relationship carries an anchor only where the request names
  the code.
- TASK-367.05 adds `--code` and `--variant` to `archboard check`, the route
  `GET /api/vault/code-check` as checkout work, the schema of the answer and the
  text adapter. It reports the first four codes of the table. It gives the
  subject of a diagnostic the kind `step`. It reads only the files that Git
  does not ignore. It prints skipped subjects as one line for each reason, and
  it refuses a `--variant` that names no draft.
- TASK-367.06 creates `src/runtime/code-facts` with the cache and the TypeScript
  adapter, and reports `ANCHOR_MISMATCH` for a definition outside both ends.
  Parsing must not hold the event loop of the server for long, so that open
  panes keep their polls and sockets. The task decides which string literals
  count as references, because the name of an environment value and the name of
  an event are strings (TASK-367.23).
- TASK-367.07 adds the `evidence` key to the policy schema and the default
  vocabulary, `ANCHOR_MISMATCH` for an evidence kind, and the undrawn, backwards
  and unsupported findings. A subscription in code runs from the handler to the
  part that sends the event, so an event relationship with no anchor reads as
  backwards. That finding is information, and the anchor of the relationship
  clears it. An event that passes through a bus has no direct evidence, so its
  anchor names the event that one end defines.
- TASK-367.08 to TASK-367.12 give each definition its visibility in the
  language's own word or rule, and say what exposed means for the module of
  that language. TASK-368.10 reads that.
- TASK-367.09 resolves includes through `compile_commands.json`, or else by the
  rule in "Refinements of the tasks", with no configuration.
- TASK-367.13 creates `language-servers.json` and its defaults, and moves
  `typescript` to the runtime dependencies. It tests that `tsc --lsp` loads no
  plugin from the checkout, and it measures the added time. TASK-367.14 and
  TASK-367.16 start the C# or the Swift server only from an entry in
  `language-servers.json`. TASK-367.16 must start sourcekit-lsp so that it reads
  the existing index and builds nothing.
- TASK-367.17 reads `.tf` and `.tofu` files, adds `--plan`, and reads a named
  plan JSON under the safety rules. It treats a remote module as a reference
  that it does not follow. Until TASK-367.18, every reference is a configured
  path. TASK-367.18 adds the rules for each provider that the user names.
- TASK-367.19 and TASK-367.20 parse YAML with Bun. TASK-367.19 decides how a
  namespace joins the address `Kind/name`.
- TASK-367.21 and TASK-367.22 skip what the static parse cannot follow, and the
  answer names it.
- TASK-367.23 joins code and infrastructure evidence across a network hop.
  `RELATIONSHIP_UNSUPPORTED` then says which side has no evidence.
- TASK-367.24 builds the memory of the findings of the last pass and the route
  that reads it. The pane never starts a pass. The bell stays the plain check's.
- TASK-367.26 runs `archboard check --code --variant TASK-<n>` once for all
  the proposals of a task.
- TASK-367.27 adds the `evidence` key to the dogfood configuration, and anchors
  to the dogfood boards.
- TASK-368.10 and TASK-368.11 report under the severity rule of this decision.
- TASK-369.02 fills `behind` in the answer of `archboard check --code`.
- `CONTEXT.md` gains code check, anchor, symbol, code facts, evidence kind,
  candidate and finding. Its Binding and Logical address entries name the
  symbol.
