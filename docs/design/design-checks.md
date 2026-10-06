# Design checks: code, interfaces and history

Three proposals hold a board to the design principles of the engineering skills
in this repository: deep modules, seams, information hiding and locality. Each
proposal is a parent task in Backlog, and each has small subtasks. This note holds
the facts and the measurements that the tasks share. ADR 0044, ADR 0045 and ADR
0046 record the decisions.

- Proposal 1 (TASK-367): check the board against the code and the
  infrastructure.
- Proposal 2 (TASK-368): derive the interface of each container from the
  board.
- Proposal 3 (TASK-369): read the Git history of a board through its bindings.

A visual summary of the three proposals is at
<https://claude.ai/artifact/6bvGCNdthJh2CoHvPaCjNS> (private to the owner).

## What was measured

All numbers come from `.archboard/vault` at commit `048312ee` on 2026-09-29.

- The 15 current boards have 282 parts and 202 relationships that cross a code
  module (`src/<area>/<module>`). 37 of these relationships end on a part that
  is bound to a private file of another module. The lint of this repository
  forbids such an import, so the board draws the implementation and not the
  interface.
- 9 of the 15 boards draw no container at all.
- Board persistence: 23 relationships join two bound files. A runtime import
  stands behind 22 of them. The last one, Write under lease to Lifecycle
  transitions, is a call through a value that `write.ts` receives, so only a
  type import is visible. The code has 3 runtime calls that the board does not
  draw: `diagnostics.ts:100`, `settle.ts:257` and `shelve.ts:148`. 7 parts
  import the shared address helper, and 5 imports are type-only.
- `src/runtime/semantic-board-store/index.ts` exports 40 names from 12 of the 32
  private files. 18 of the 40 names have no caller outside the store: 5
  functions and constants, and 13 types.
- Commits to bound files since each board was last written: Board viewer 10,
  Command interface 3, Codex session 2, four boards 1, eight boards 0. A part
  that drills into its own board must be skipped. Archboard server binds its
  Semantic renderer card to a whole directory, which adds 259 commits.
- Change coupling with the code-maat filters (commits of 30 files or fewer, at
  least 5 shared commits, degree 30% or more): Architecture painter and
  Sequence painter changed together in 6 commits (degree 36%), and no
  relationship joins them. Without the 30-file filter, Claims and Panes look
  coupled, but 10 of their 12 shared commits were large commits of 50 to 864
  files.
- Earlier evidence: TASK-257 found 9 of 89 bindings dead after 141 commits with
  no vault update. TASK-328 found boards whose bindings exist but whose
  descriptions no longer match the code.

## Proposal 1: check the board against the code

The consumer skill makes an agent write one line of evidence for every
relationship: a file and a symbol (evidence rule 3). The product discards that
line, because a relationship has no field for it. The code check keeps the line
as an anchor and reads the code again.

ADR 0046 records the decisions of this proposal. An anchor is
`{ repo, path, symbol }` on a relationship or a flow step, and a binding can
name a `symbol`.

The check reads the current variant of every board. A draft is ahead of the
code (ADR 0031). If an agent names a draft, for example when a task closes, the
check reads it. Historical and shelved variants are records, and the check
never reads them. `--variant <name>` reads the draft of that name on every
board that has one (ADR 0046).

`archboard check --code` runs the check on a route of its own, and never inside
the check that canvases poll. A finding has the shape of a vault diagnostic,
with the evidence that it rests on: its kind, and whether it is resolved or a
candidate (ADR 0046).

On 2026-10-06 the check reproduced the Board persistence measurement above: 22
calls, one type import, 3 undrawn calls and one finding for the 7 parts of the
address helper (TASK-367.07). It counts 6 type-only imports, not 5, and all 6
are in the files at `048312ee`, so the count above missed one. It also reports
Archboard server to Board lease, because it reads directory bindings, and the
measurement counted only pairs of bound files.

### Evidence kinds

Not every link in code or infrastructure is a relationship at run time. Each
finding names the kind of evidence that it rests on.

| Kind             | What it proves                                          | Examples                                                                                  |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Call             | One part uses the other at run time, or starts its work | a call site, a queue that triggers a function, a topic subscription, a route to a service |
| Configured path  | Configuration connects the two parts                    | an environment value set to another service's address, a service selector, a network rule |
| Permission       | Access is allowed, not that it happens                  | an IAM grant, a network policy that allows traffic                                        |
| Import           | Code names other code only to import it or as a type    | an import, an include, a `using` with a reference                                         |
| Build dependency | One part is built from another                          | a Nix input, a project reference, a package target dependency                             |
| Provisioning     | One part is set up with another, with no traffic        | a role or a log group attached to a function                                              |

Each relationship kind can name the evidence kinds that it accepts, under a new
key `evidence` in the vault configuration. The default vocabulary carries the
key for its kinds (ADR 0046).

### The engine

Tree-sitter parses every language in one way: a query file per language finds
definitions, references and imports. The results are candidates, because a
name can match more than one definition. A language server then resolves each
candidate to its definition. When no language server is installed, the check
says so and reports candidates. An import path or an infrastructure address
names what it reaches, so evidence through one is resolved with no server (ADR
0046).

The text reading of the tracer bullet stays as the adapter for every file that
no grammar or parser reads. So the seam between the check and the languages has
two adapters from the TypeScript adapter on (ADR 0046). Kubernetes manifests,
compose files and `flake.lock` need no grammar, because Bun parses YAML and
JSON.

The engine is new: `web-tree-sitter` and a WebAssembly grammar per language.
ADR 0046 records the engine, its modules and its packages. Archboard has no
build step (ADR 0014). Every grammar must load under Bun from a published
WebAssembly file. If a grammar has no such file, the cost to build one must be
known.

#### Grammars measured under Bun

TASK-367.01 measured every grammar on 2026-10-06 with Bun 1.4.2 and
`web-tree-sitter` 0.27.0 (MIT). That runtime loads grammars of ABI 13 to 15.
Each grammar loaded from its `.wasm` file in `node_modules` in 12 ms or less,
with no build step. The parse time is the median of four parses after a first
one. Error lines are the lines inside an `ERROR` node. Tree-sitter recovers
from such a node and parses the rest of the file.

| Grammar     | Package                                 | Version | Licence    | `.wasm` published | ABI | `.wasm` size | Real file parsed                                         | Lines   | Parse time | Error lines |
| ----------- | --------------------------------------- | ------- | ---------- | ----------------- | --- | ------------ | -------------------------------------------------------- | ------- | ---------- | ----------- |
| TypeScript  | `tree-sitter-typescript`                | 0.23.2  | MIT        | yes               | 14  | 1381 KiB     | this repository, every tracked `src/**/*.ts`, 1781 files | 368,793 | 948 ms     | 1           |
| TSX         | `tree-sitter-typescript`                | 0.23.2  | MIT        | yes               | 14  | 1412 KiB     | this repository, every tracked `src/**/*.tsx`, 187 files | 32,682  | 80 ms      | 0           |
| Python      | `tree-sitter-python`                    | 0.25.0  | MIT        | yes               | 15  | 447 KiB      | CPython `Lib/_pydecimal.py`                              | 6,432   | 16 ms      | 0           |
| C#          | `tree-sitter-c-sharp`                   | 0.23.5  | MIT        | yes               | 15  | 5225 KiB     | Roslyn `Binder_Expressions.cs`                           | 12,560  | 62 ms      | 0           |
| Swift       | `@lumis-sh/wasm-swift` (grammar 0.7.3)  | 0.26.3  | MIT        | not by upstream   | 15  | 3737 KiB     | swift-syntax `Sources/SwiftParser/Expressions.swift`     | 2,927   | 16 ms      | 5           |
| Objective-C | `tree-sitter-objc`                      | 3.0.2   | MIT        | yes               | 14  | 5193 KiB     | AFNetworking `AFURLSessionManager.m`                     | 1,274   | 8 ms       | 1,170       |
| C           | `tree-sitter-c`                         | 0.24.1  | MIT        | yes               | 15  | 611 KiB      | SQLite `src/btree.c`                                     | 11,658  | 28 ms      | 41          |
| C++         | `tree-sitter-cpp`                       | 0.23.4  | MIT        | yes               | 14  | 3354 KiB     | LLVM `SelectionDAG/DAGCombiner.cpp`                      | 32,562  | 100 ms     | 17          |
| HCL         | `@tree-sitter-grammars/tree-sitter-hcl` | 1.2.0   | Apache-2.0 | yes               | 14  | 90 KiB       | terraform-aws-modules `terraform-aws-vpc/main.tf`        | 1,543   | 7 ms       | 0           |
| Nix         | `@lumis-sh/wasm-nix` (grammar 0.3.0)    | 0.26.3  | MIT        | not by upstream   | 15  | 82 KiB       | nixpkgs `pkgs/top-level/all-packages.nix`                | 10,767  | 20 ms      | 0           |

The HCL package has two grammars, `hcl` and `terraform`. Both gave the same
result on the Terraform file. The foreign files come from these commits:
cpython `85c03d47a2`, roslyn `1441e946e7`, swift-syntax `624d85ee1b`,
AFNetworking `d9f589cc2c`, sqlite `466e0851d9`, llvm-project `197fb4b24a`,
terraform-aws-vpc `b3abd6df2e` and nixpkgs `9dfea86cda`. This repository was at
`a78c14bfd`.

What causes the error lines:

- TypeScript: one regular expression with raw control characters, in
  `src/transformers/semantic-renderer/lib/svg/primitives.ts`.
- C and C++: macros that the grammar cannot expand, for example
  `SQLITE_NOINLINE` and `LLVM_DEBUG(...; ...)`.
- Swift: newer syntax, for example module selectors and `#if` around an
  attribute. swift-nio `ByteBuffer-core.swift` has 8 error lines of 1,575.
- Objective-C: one unknown macro after a declaration, `AF_API_AVAILABLE(...)`,
  puts 92% of the file inside `ERROR` nodes. With its 6 uses removed, 1 line is
  in error. SDWebImage `SDWebImageManager.m` (816 lines) has no error lines.
  The Objective-C adapter (TASK-367.10) needs a way around this, for example
  to remove known attribute macros before it parses.
- Objective-C++ (`.mm`) has no grammar. `RLMObjectSchema.mm` from
  `realm/realm-swift` has 355 error lines of 399 under the Objective-C grammar.

#### Reading the dogfood vault's bound files

TASK-367.06 measured `src/runtime/code-facts` on 2026-10-06 with Bun 1.4.2, at
commit `773433125`. The current variants of the 15 boards in
`.archboard/vault` hold 310 bindings to this repository. They name 1,154 files
that Git does not ignore, every file below a bound directory included, and
1,046 of them are TypeScript or TSX. One pass read each file once, in three
runs of one process:

| Pass                                        | Time              | Parsed | From the cache | Longest wait of the event loop |
| ------------------------------------------- | ----------------- | ------ | -------------- | ------------------------------ |
| Load both grammars and parse the first file | 91 to 99 ms       | 1      | 0              | the load itself                |
| Cold, every file parsed                     | 1,681 to 1,767 ms | 1,046  | 0              | 7 to 8 ms                      |
| Warm, no file changed                       | 48 to 57 ms       | 0      | 1,046          | 1 ms                           |

A warm pass still reads and hashes every file, so it sees every edit. The pass
yields to the event loop after each parse. So a poll or a socket of the server
waits for one file at most. The longest single parse in this repository took
14 ms.

The rows above read one file after another. The check also reads files
together: every file below a directory that a part binds with a symbol. Their
bytes then arrive together, and the first build parsed them back to back in
one turn of the event loop. The review of TASK-367.06 measured it through the
real check, with one part bound to `src` and a symbol (2,068 files). The event
loop waited 2,963 ms. Parses now run one at a time through one queue, with a
turn of the event loop after each one. With the grammars loaded, the longest
wait was 14 to 16 ms in the same check. The grammars load once per process. Over all 2,032 tracked TypeScript
and TSX files of `src`, parsing took 1,220 ms and reading the facts from the
trees 1,612 ms.

The real `./bin/dogfood check --code` also runs the plain check and behind. It
took 1,582 ms on its first run after a server restart, and 1,141 ms on the
second run.

#### Reading Flask through the Python adapter

TASK-367.08 measured the Python adapter on 2026-10-06 with Bun 1.4.2 on Flask
3.0.0 (`735a4701`), the checkout the skill evaluations pin. One process read
all 82 tracked `.py` files in one pass: 168 to 171 ms cold, grammar load
included, and 5 ms warm, with every file from the cache. No line of Flask fell
in a part that did not parse. The files hold 1,096 definitions, 4,601
references and 621 imports. 281 imports resolve to a file of the checkout.
Every import of Flask's own code in `src` and `tests` resolves. The other
imports name the standard library or installed packages. Each of the
`examples` is a project of its own, and its `pyproject.toml` takes `flask`
from the environment.

A board of 13 parts bound to `src/flask` and 9 relationships ran through the
real check in 189 ms cold and 102 ms warm. Every piece of evidence was
resolved through an import, and nothing was read as text. The imports were
relative (`from ..ctx import _AppCtxGlobals`), of a submodule
(`from . import json`), or of a name that a package's `__init__.py` passes on.

#### Reading docker-compose files

TASK-367.20 measured the compose adapter on 2026-10-06 with Bun 1.4.2 on
docker's `awesome-compose` samples (`30f4b7f`). One process read the 39
compose files and 4 `.env` files that Git tracks: 9 to 13 ms cold and 2 ms
warm. They hold 117 definitions, 92 configured paths and 126 environment
names. Every configured path resolves to a service, network or volume that
its project declares. No sample has an override file or an `env_file` entry,
and the four `.env` files only fill interpolations. On the first run, one
path was wrong: `REV_SERVER=true` read as a host named `true`. A YAML boolean
word is now never a host.

A temporary vault with two boards bound 9 parts to services, networks and
volumes of two samples, through the real check, in 95 ms. Each finding was
right:

- `react-express-mysql`: the frontend depends on the backend, which supports
  that relationship. The backend's anchor `services.db` holds. The database's
  mount supports database -> database files. The check reports the backend
  and the database joining the private network that no relationship draws
  (`RELATIONSHIP_UNDRAWN`, a warning). No configuration joins the frontend
  and the database (`RELATIONSHIP_UNSUPPORTED`). A part bound to
  `services.cache`, which the file does not declare, is
  `BINDING_SYMBOL_MISSING`.
- `nginx-golang-postgres`: backend -> proxy is `RELATIONSHIP_BACKWARDS`,
  because the proxy depends on the backend. An anchor at `services.dbx` is
  `ANCHOR_SYMBOL_MISSING`.

#### Resolving candidates with the TypeScript language server

TASK-367.13 measured the language server on 2026-10-06. It used Bun 1.4.2 and
the `tsc --lsp --stdio` of TypeScript 7.0.2. Other agents kept the machine at
a load average of about 7 on 24 cores.

The server is fast to start. It answered `initialize` in 3 to 4 ms. Its first
definition request loaded the project of this repository in 240 to 300 ms.
That project has 8,733 files. 200 more requests together took 20 to 25 ms. A
`shutdown` and an `exit` ended the process in 19 to 27 ms. It starts no child
process, and it reads each file from disk. Opening 600 files with `didOpen`
cost about 400 ms more, so the check opens none.

The first build asked about two kinds of use that no import resolves. A
candidate is a use of a name the same file defines at module level. A use
through a value is a name spelled through a parameter or a local, such as
`ledger.post()`. The pass does not ask about a bare local, parameter or
global. Its definition is in the same function or outside the checkout.
Without those questions, the dogfood vault asked 24,349 questions instead of
42,837, with the same findings.

Over the 1,447 TypeScript files of `src` that are not tests, the answers were:

| Use             | Asked  | Code that runs | A type or data | Outside the checkout | No answer |
| --------------- | ------ | -------------- | -------------- | -------------------- | --------- |
| Candidate       | 12,438 | 11,450         | 384            | 581                  | 23        |
| Through a value | 29,904 | 139            | 19,806         | 9,885                | 74        |

For 58 candidates, the code is in another file than the name match said.

Most uses through a value land on a member of a type. 13,443 land on an
interface or a type literal, and 4,186 on a property or a field. 2,177 land on
a name that the outline does not declare. A definition request names where a
name is declared. So `memory.remember()` resolves to the method that the
interface `CodeFindingsMemory` declares. It does not resolve to the method
that `createCodeFindingsMemory` returns. Before the check read the outline,
such answers made 10 undrawn warnings and one `ANCHOR_MISMATCH` on the dogfood
vault. One of them made `entry.name` a call to the part that declares the
type of `entry`. No right change clears such a warning.

So a use at run time counts only where the outline of the server
(`textDocument/documentSymbol`) declares code at exactly that place. Code is a
class, function, method, constructor, variable, constant or enum, and no
interface holds it. A use only as a type counts wherever its definition is.

The first build added about 5 s to a warm pass: 5,672 to 6,054 ms, and 853 to
974 ms with no server. It changed one finding. Board rasterizer has the
relationship Raster session -> DevTools connection. It was
`RELATIONSHIP_UNSUPPORTED`, with only a type import, and the server showed
that the session calls a method of the connection that it holds.

The review of TASK-367.13 measured again, after TASK-367.27 had given that
relationship and most others an anchor. It used a copy of the dogfood vault
and a clone of this repository, both at `3a7157874`, and the code check at
`4a2fa8aaf`. One process ran a cold pass and then four warm passes, each file
from the cache, in each of four ways. Other agents kept the load average at 7
to 14 on 24 cores.

| The server is asked about                                 | Questions | Warm pass          | Findings |
| --------------------------------------------------------- | --------- | ------------------ | -------- |
| Nothing (no server)                                       | 0         | 988 to 1,025 ms    | 40       |
| Each anchor's use and each candidate that joins two parts | 95        | 1,583 to 1,666 ms  | 40       |
| Also every other candidate                                | 11,284    | 4,935 to 6,809 ms  | 40       |
| Also every use through a value (the first build)          | 39,453    | 9,118 to 10,223 ms | 40       |

All four ways gave the same 40 findings. So the pass asks only where the
answer can change a finding, the second row:

- A candidate whose name match joins a part to itself, or to a part that holds
  it, is no evidence, whatever the server answers. The pass asks about a
  candidate only where the match joins two parts. On the dogfood vault, one
  candidate does.
- A use through a value gives no evidence. The server is asked about one only
  where an anchor names it, so Raster session -> DevTools connection is
  judged through its anchor `DevTools.evaluate`. A question about every use
  through a value finds a call that no import shows: an undrawn dependency
  through a value that a part holds. On the dogfood vault it found none, and
  it cost 3 to 5 s of every pass.

The first build's real `./bin/dogfood check --code` took 9,083 ms on its first
run after a restart. Five later runs took 4,743 to 7,141 ms. Before
TASK-367.13, a warm run took about 1,400 ms.

After the review, at a load average of 11 to 12, the real command took
4,738 ms on its first run after a restart, and 2,913 to 4,209 ms on five later
runs. The answer had 39 findings and named no missing or failed server, and
no `tsc` process ran after it.

#### Swift and Nix have no upstream WebAssembly file on npm

Swift: the npm package `tree-sitter-swift` stops at 0.7.1 and has no `.wasm`.
The GitHub release 0.7.3 of `alex-pinkus/tree-sitter-swift` has one.
`@lumis-sh/wasm-swift` 0.26.3 is built from the 0.7.3 tag, and it gives the same
tree as the release file on both Swift files. A build from the npm 0.7.1 source
with `tree-sitter build --wasm` took 36 s. That build is ABI 14 and parses 7 to
23 times slower. It also puts 56 lines of `ByteBuffer-core.swift` in error,
against 8 for 0.7.3. `@repomix/tree-sitter-wasms` 0.1.17 (Unlicense) has the
same slow build. The other alternative is the release file itself. To use it,
Archboard downloads it on install, which is a build step, or commits it, which
puts a derived binary in Git.

Nix: `nix-community/tree-sitter-nix` publishes no `.wasm` and no release. The
npm package `tree-sitter-nix` stops at 0.0.2 from 2023. A build from the v0.3.0
tag with `nix shell nixpkgs#tree-sitter -c tree-sitter build --wasm` took
0.4 s. Before the first build, tree-sitter 0.26.11 downloads wasi-sdk 29
(114 MB, 390 MB unpacked into `~/.cache/tree-sitter`) in 5 s. The build is ABI
13, because the tag holds an old generated parser. It gives the same tree as
`@lumis-sh/wasm-nix` 0.26.3, which is built from the same tag. A cheaper
alternative exists for part of the work: `flake.lock` is JSON and needs no
grammar. Only `flake.nix` outputs and derivation inputs need the Nix grammar
(TASK-367.21 and TASK-367.22).

#### Sources that were rejected

- `tree-sitter-wasms` 0.1.13 was built with tree-sitter 0.20. Its files carry
  the old `dylink` section, and `web-tree-sitter` 0.27 refuses to load them.
- `@vscode/tree-sitter-wasm` 0.3.1 loads, but it has no Swift, Objective-C, HCL
  or Nix grammar.
- The whole `@lumis-sh/wasm-*` set covers all ten grammars in 27 MB, with no
  dependencies and no install scripts. But it builds some grammars from a
  branch and not from the release tag. `@lumis-sh/wasm-python` 0.26.5 names
  grammar 0.25.0, but it is two commits later, where `expression_statement`
  became a hidden supertype. Its tree for `_pydecimal.py` differs from the
  0.25.0 release. The query `(expression_statement (call) @c)` finds 54 calls
  with the release, and the `@lumis-sh` build refuses to compile it.
  `@lumis-sh/wasm-hcl` 0.26.4 holds HCL 1.1.0, older than npm 1.2.0.
- The npm name `tree-sitter-hcl` is a security placeholder (`0.0.1-security`).

#### Recommended packages

ADR 0046 records this list and the date of the user's approval. Every
grammar is the upstream release, so a query is written against a tagged
grammar. Swift and Nix come from `@lumis-sh`, because no upstream publishes
them on npm. Both are built from the exact upstream tag.

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

They also install `tree-sitter-javascript` 0.23.1, two nested
`tree-sitter-c` 0.23.6, `node-addon-api` 8.9.2 and `node-gyp-build` 4.8.4, all
MIT. The upstream grammar packages also ship native Node bindings, prebuilt
binaries and their C sources. So the set puts 248 MB into `node_modules`, of
which 23 MB is `.wasm`. The repository's `node_modules` is 1.4 GB today. Bun
blocks the 9 `node-gyp` install scripts, because the repository does not trust
these packages, and the code check needs none of them.

The spike script is not in the repository. The notes of TASK-367.01 hold the
commands that reproduce these numbers.

### Languages

| Language    | Dependencies in the source                                | Declared interface                                                | Language server                         |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| TypeScript  | `import` and `export`                                     | module root files and `package.json` `exports`                    | Archboard's own TypeScript, `tsc --lsp` |
| Python      | `import` and `from ... import`                            | `__all__`, names that start with `_`, `__init__.py`               | pyright or basedpyright                 |
| C# and .NET | `using` plus type references, `ProjectReference`          | `public`, `internal`, `InternalsVisibleTo`                        | csharp-ls or the Roslyn language server |
| Swift       | module `import`, type references, `Package.swift` targets | `open`, `public`, `package`, `internal`, `fileprivate`, `private` | sourcekit-lsp                           |
| Objective-C | `#import`, `@import`, message sends                       | public headers, class extensions in `.m`                          | clangd                                  |
| C and C++   | `#include` through `compile_commands.json`                | public headers, `static`, anonymous namespaces                    | clangd                                  |

In C# and Swift, the files of one project or module see each other without an
import. There, file dependencies come from references to names that another
file defines.

### Infrastructure and Nix

| Source                 | What the check reads                                                                                                        | Evidence                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Terraform and OpenTofu | `.tf` and `.tofu` files, statically: resources, data sources, modules, variables, outputs and the references in expressions | configured path, until provider rules make it a call, a permission or provisioning                      |
| Kubernetes             | manifest YAML, and Helm or Kustomize output given as files                                                                  | service selectors, Ingress and Gateway routes, network policies, environment values that name a service |
| docker-compose         | compose files and their override files                                                                                      | `depends_on`, links, networks, environment values that name a service, shared volumes                   |
| Nix                    | `flake.lock` (JSON), `flake.nix` outputs, derivation inputs                                                                 | build dependency                                                                                        |

A part binds to a resource address as it binds to a code symbol. Examples are
`module.checkout.aws_lambda_function.api`, `Deployment/checkout` and
`packages.x86_64-linux.archboard`. The `symbol` field of a binding holds either
(ADR 0046).

Nix says nothing about run time. It shows software dependencies that are not
explicit anywhere else: flake inputs, and the packages that a derivation is
built from.

A compose file is one that compose finds by itself in a directory:
`compose.yaml`, `compose.yml`, `docker-compose.yml` or `docker-compose.yaml`,
in that order of preference. Then compose merges the first override file over
it: `compose.override.yml`, `compose.override.yaml`,
`docker-compose.override.yml` or `docker-compose.override.yaml`. The check
merges in the same order (TASK-367.20). An override adds
dependencies, links and networks to those of the base. Its environment value,
volume mount or `network_mode` replaces the base's entry of that name or
target, and the replaced entry is no evidence. A part bound to a service owns
the service's block in each file of the project. A file that only `-f` names,
such as `compose.prod.yaml`, merges as a command says, and no file records
that command. So the check reads such a file as text.

If the host of an environment value is the name, `container_name`, `hostname`
or network alias of a service, the value names that service. The host comes
after a scheme or a user, or before a port. A bare word counts only under a name that ends in
`HOST`, `SERVER` or `ADDR`, such as `REDIS_HOST: redis`. A host with a dot
names a machine outside the project. An interpolation takes the default that
the file writes (`${API_HOST:-api}`). The check never reads the shell or the
project's `.env` for it. An env file gives the names it sets and never a
value, and the check keeps no value of a compose file either.

The strongest result joins code and infrastructure. The code reads
`QUEUE_URL`, and the infrastructure sets `QUEUE_URL` for that service to the
address of a queue. Together they prove a relationship across a network hop,
which no code analysis can prove alone.

### Safety

The check reads files only. It never reads Terraform state, because state holds
secrets in plain text, and the Archboard server has no authentication. It never
runs `terraform plan`, `kubectl` or `nix eval`, because these need credentials,
reach the network or run code. A plan JSON that CI already produced is an
optional input. The difference between the infrastructure code and the live
cloud stays the job of `terraform plan`.

ADR 0046 states the full rules. They include what the check reads from a plan
JSON and which language servers it starts.

## Proposal 2: derive each container's interface

ADR 0044 decides how the store derives the interface and what its parts are
called.

A container's interface is the set of its children that relationships reach
from outside the container. The store can derive this set from the board, so
it needs no new authored field (ADR 0031). The store derives five measures:
the entry points, the hidden parts and the callers. The other two are the
relationships that leave the container and the entry points that only pass one
call through.

The measures need their own name, because "scorecard" already means how
readable a drawing is. The skill must draw a module that a board describes as a
container, so that callers land on its entry points. Comparison reports
interface changes before implementation changes, because an interface change
costs every caller.

## Proposal 3: read the history through the bindings

ADR 0045 decides how the lens reads Git and where each reading answers. It
names the readings behind, footprint, hotspots and change coupling, and the
terms large commit and period. `CONTEXT.md` defines each of them.

Every commit maps onto the parts whose bound files it changed. A binding to a
directory counts every file below it. A part that drills into another board is
skipped, because its own board carries its history. One mapping gives three
readings:

- Behind: the commits to bound files after the last change of the board's
  current variant.
- Footprint: the parts that a branch changed, against the parts that its
  proposal names.
- Locality: hotspots, and change coupling between parts that no relationship
  joins.

The readings are derived on request. They are never stored in a board (ADR 0015) and never drawn as traffic (ADR 0027). Call the co-change measure change
coupling. "Temporal coupling" means three different things in the three books.

## Prior art

- ArchUnit checks code dependencies against a PlantUML diagram. It does not
  check that each drawn relationship exists.
  <https://www.archunit.org/userguide/html/000_Index.html#_plantuml_component_diagrams_as_rules>
- Tach declares module interfaces for Python and refuses deep imports.
  <https://github.com/tach-org/tach/blob/main/docs/usage/interfaces.md>
- IcePanel checks that the code links of its nodes still exist, not its
  connections. <https://docs.icepanel.io/integrations/linking-to-reality>
- Inframap reads Terraform HCL or state and keeps the relevant resources and
  connections per provider. It draws a diagram and checks no authored claim.
  <https://github.com/cycloidio/inframap>
- code-maat computes change coupling from `git log`.
  <https://github.com/adamtornhill/code-maat>
- Sources for the principles: Ousterhout, _A Philosophy of Software Design_.
  Thomas and Hunt, _The Pragmatic Programmer_. Feathers, _Working Effectively
  with Legacy Code_, chapter 4. Parnas, "On the Criteria To Be Used in
  Decomposing Systems into Modules".

The survey found three gaps. No tool stores an anchor for each relationship of
a diagram and reads it again. No tool compares competing authored proposals by
their interfaces. No tool maps a branch onto the parts of an authored
architecture.
