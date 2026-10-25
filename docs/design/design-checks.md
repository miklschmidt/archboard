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

`archboard check code` runs the check on a route of its own, and never inside
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
  `packages/renderer/src/shared/rules/svg/page/primitives.ts`.
- C and C++: macros that the grammar cannot expand, for example
  `SQLITE_NOINLINE` and `LLVM_DEBUG(...; ...)`.
- Swift: newer syntax, for example module selectors and `#if` around an
  attribute. swift-nio `ByteBuffer-core.swift` has 8 error lines of 1,575.
- Objective-C: one unknown macro after a declaration, `AF_API_AVAILABLE(...)`,
  puts 92% of the file inside `ERROR` nodes. With its 6 uses removed, 1 line is
  in error. SDWebImage `SDWebImageManager.m` (816 lines) has no error lines.
  The Objective-C adapter (TASK-367.10) needs a way around this, for example
  to remove known attribute macros before it parses. It blanks them; see
  "Reading Objective-C through its adapter".
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

The real check of that time (the semantics check first, then the code check and
behind) took 1,582 ms on its first run after a server restart, and 1,141 ms on
the second run.

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

#### Reading swift-argument-parser through the Swift adapter

TASK-367.12 measured the Swift adapter on 2026-10-06 with Bun 1.4.2 on
`apple/swift-argument-parser` at `efd239f`, while other agents kept the machine
at a load average of about 12 on 24 cores. One process read all 170 tracked
`.swift` files in one pass: 435 to 562 ms cold, grammar load included, and 27
to 30 ms warm, with every file from the cache. The files hold 3,958
definitions, 7,929 references and 265 imports. 1,180 uses lead to a file or a
module of the checkout: 540 at run time, 461 as types, and 179 imports of a
local module that the importing target depends on. The static reading of
`Package.swift` found all 21 targets and the 26 dependencies between them,
without running the manifest.

2,085 lines in 13 files fell in parts that did not parse, nearly all in tests
and test helpers. Swift Testing's macro expressions (`#expect`, `#require`),
the default argument `#_sourceLocation` and the shorthand `if let prefix {`
put the rest of a file in one error node. The library itself lost 3 lines: a
line that starts with the operator `<`, and an `#if` inside a struct body.

A board of 13 parts ran through the real check in 435 to 612 ms cold and 161
to 163 ms warm:
the library's target directory and seven of its subdirectories as parts inside
it, the tool-info target, the `math` example, the `generate-manual` tool, one
part bound to the extension member `ParsableCommand.main`, and one planted
binding. Every finding is right:

- `BINDING_SYMBOL_MISSING` on the planted part, and `ANCHOR_SYMBOL_MISSING`
  on a planted anchor.
- `ANCHOR_MISMATCH` on `math example -> ArgumentParser`, a `call` anchored at
  `ParsableCommand`: `Math.swift` only conforms to that protocol, which is
  import evidence. The anchor named the wrong symbol.
- `RELATIONSHIP_UNDRAWN` on `ArgumentParser`: `generate-manual` imports it
  (`AuthorArgument.swift:12`), a build dependency that `Package.swift` declares.
- `RELATIONSHIP_UNDRAWN` on six subdirectories of the library, every piece a
  use of a type or a function that one other file of the module declares:
  `CommandParser`, `MessageInfo`, `CompletionsGenerator`, `OptionGroup`,
  the property wrapper `@Argument`, the free function `configurationFailure`,
  `Platform`, `Tree`, and `JSONEncoder`, which the module declares itself and
  so shadows Foundation's.
- `RELATIONSHIP_BACKWARDS` on `Tool info -> ArgumentParser`: Completions and
  Usage import the tool-info module and use `ToolInfoV0`.

The first run resolved `String.init` in `Platform.swift` to an initializer that
an extension of `String` in the library adds. The standard library's own
initializers are not read, so a spelling resolves now only where the module
or a module it imports declares its first name.

The review of TASK-367.12 read two more packages on 2026-10-06:
`apple/swift-collections` at `3b69ced` (733 `.swift` files, 136,308 lines) and
`apple/swift-nio` at `6db9d9a` (555 files, 208,386 lines). Four readings led a
use to the wrong file, or reported a symbol missing that its file declares:

- A file can bind a name itself: as a parameter, a local, a closure's or a
  generic parameter, or a member of its types. A use of such a name was led to
  a declaration of the same name in another file of the module. This was true
  of 7 of 991 resolved uses in swift-argument-parser, 381 of 1,750 in
  swift-collections and 727 of 6,057 in swift-nio. Such a use now leads
  nowhere.
- A member reached through `self`, a call's result or a literal was spelled
  with its name alone. So `self.close()` reached a function `close` of the
  module. Such a member is spelled `.close` now, as C# spells it.
- `!ready`, `-offset` and `&buffer` were no use of their name.
- tree-sitter-swift 0.7.3 cannot read `unsafe` (Swift 6.2). Inside a type body,
  it cannot read an `#if` condition such as `_pointerBitWidth(_64)`. It
  recovers with a guess about where the code after that place belongs. It puts
  later members inside the function that it broke. Or it closes the type early
  and reads its members at file level, and the locals of a broken function
  too. 35 files of swift-collections parse to a tree that is one error. In
  `_HTable+Bitmap.swift`, `collisionChainEnd` is in no definition and in no
  error. So a binding to `_HTable.Bitmap.collisionChainEnd` was reported
  missing, a warning that no change can clear.

Now the part of a Swift file that did not parse starts at the first place
that the grammar does not read. It ends with the last declaration at file
level that holds such a place, so it also holds the `}` that a type closed
early leaves behind. A name that the check does not find in that part is
skipped as `symbol-unparsed`. No use in another file leads to a definition in
that part. A file whose tree is one error has no definitions. The part covers
6,868 lines of swift-argument-parser, 60,243 of swift-collections and 65,537
of swift-nio. The `Sources` of the three packages declare 460, 3,534 and 5,554
types and functions. The check does not find 2, 2 and 23 of them, and each of
those is a local function or type.

After these changes, 1,161 uses in swift-argument-parser lead to a file or a
module, 1,276 in swift-collections and 5,547 in swift-nio. An implicit `self`
misleads a use by its bare name inside a type that another file gives a
member of that name. No such use leads anywhere. The board of 13 parts gives
the same findings as before, in 540 ms cold and 137 ms warm. Its container
`ArgumentParser` is now held to what the module exposes (TASK-368.10). It gets
`EXPOSED_UNUSED`, and `CALLER_UNDRAWN` on Parsable properties and Parsable
types: examples and tools that the board does not draw use their property
wrappers and `CommandConfiguration`. On a board of swift-nio, the grammar
reads `SocketChannel.connectSocket` at file level. A binding to it is skipped
as `symbol-unparsed` at `SocketChannel.swift:132-1316`.

#### Reading Kubernetes manifests

TASK-367.19 measured the Kubernetes adapter on 2026-10-06 with Bun 1.4.2 on
Google's `microservices-demo` (`38e7348`). Git tracks 103 YAML files in it. 86
are manifests: the plain manifests, a rendered release, Kustomize bases,
components and overlays, and Istio manifests. The other 17 are GitHub
workflows, Cloud Build files and the Helm chart's `Chart.yaml` and
`values.yaml`, and the check reads them as text. 13 of the manifests are Helm
templates that do not parse as YAML, and each is one part that did not parse.
One pass read the 103 files in 34 ms cold and in 17 to 26 ms warm. They declare
147 objects, 55 configured paths and 4 calls by address, and 116 environment
names. Every address resolves to a manifest that declares it. By labels,
Services join 40 Service and workload pairs, and NetworkPolicies give 15
permissions.

A temporary vault with two boards bound 18 parts to Deployments, and one part
to the directory of the NetworkPolicy component. The real check took 120 ms.
Each finding was right:

- `kubernetes-manifests`: the frontend's `AD_SERVICE_ADDR` names the Service
  `adservice`. No part binds that Service, so the value reaches the ad
  service's Deployment, and no relationship draws it (`RELATIONSHIP_UNDRAWN`,
  a warning). Email service -> checkout service is `RELATIONSHIP_BACKWARDS`,
  because the checkout service names the email service. No configuration
  joins the payment service and the email service
  (`RELATIONSHIP_UNSUPPORTED`). The anchor `Service/cartservice` in the
  frontend's manifest holds. The anchor `Service/paymnt` is
  `ANCHOR_SYMBOL_MISSING`, and a part bound to `Deployment/shoppingcart` is
  `BINDING_SYMBOL_MISSING`. `REDIS_ADDR` supports cart service -> Redis.
- `kustomize/base` with the `network-policies` component: payment service ->
  checkout service is backwards. The checkout service names the payment
  service in `PAYMENT_SERVICE_ADDR`, and the payment service's NetworkPolicy
  lets the checkout service in, a permission from the checkout service to the
  payment service. Checkout service -> cart service is undrawn.

`SHOPPING_ASSISTANT_SERVICE_ADDR` resolves to the Service of the optional
`shopping-assistant` component. That is the nearest manifest that declares the
Service, though the default manifests do not deploy it.

The review of TASK-367.19 read three more checkouts on 2026-10-06:
`argoproj/argocd-example-apps`, `kubernetes/examples` and
`kubernetes-sigs/kustomize`. Some Helm and Go templates parse as YAML, because
`{{ .Values.name }}` is a YAML mapping. The adapter had read such a template as
a manifest that declares nothing. So a part bound to `Service/helm-guestbook`
in `helm-guestbook/templates/service.yaml` got `BINDING_SYMBOL_MISSING`, and an
anchor there got `ANCHOR_SYMBOL_MISSING`, both warnings. Now the adapter reads
a Helm action where YAML expects a value, or in a name, as a template. Of the
three checkouts, 18 templates that parse as YAML are now skipped, and no plain
manifest is read as a template. In `kustomize`, 8 references in test data name
a ConfigMap of which two to four copies stand at the same distance. Each test
case has its own copy. Path order had picked the first copy, which was the
wrong one for 6 of the 8. Now they resolve to none. No Secret value of the four
checkouts is in a fact.

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

The review of TASK-367.20 read compose-go (`compose-spec/compose-go`,
`32d8d5d`) on 2026-10-06. `cli/options.go` names the base files and the
override files in the order the check uses, and takes only the first override
beside the first base. `override/merge.go` and `override/uncity.go` merge
`environment` by name, `depends_on` and `networks` by name, `links`,
`volumes_from` and `env_file` as lists that add up, and the mounts of a
service by target, whatever the kind of the mount. `loader/loader.go` merges
the YAML documents of one file in order. So a bind mount or an anonymous
volume in an override replaces a named volume at the same target, and
`network_mode: host` replaces `service:<name>`. The check missed both, and
reads them now.

The review also read 17 compose files of 16 public projects, among them
Supabase, Immich, PostHog, Appwrite, Superset, Jitsi and Sentry's self-hosted
release: 6,098 lines, their facts in 19 ms. Each line that a fact names holds
its key or its item, except an entry that a YAML alias or merge key
(`<<: *worker`) brings in, which stands at the line of the key that names the
alias. A plain value with a bracket in it (`command: echo [`) had read as the
start of a flow collection and put every later line under the service before
it. Only a value that starts with a bracket opens one now. Appwrite's
`depends_on: [${_APP_DB_HOST:-postgresql}]` read as a service named
`${_APP_DB_HOST`, because the check interpolated only environment values, and
compose interpolates every value before it merges. It interpolates every value
now. Then 557 of the 566 configured paths of these files resolve. The other 9
name the implicit `default` network, or a service that only another PostHog
file declares, which compose merges only when `-f` names it. Bun 1.4.2 refuses
Sentry's `docker-compose.yml`, which is valid YAML: a comment line inside a
flow sequence, and a closing `]` at the indentation of its key, are each
`Unexpected token`. The file is one part that did not parse, so its symbols
are skipped and never missing.

#### Reading Nix flakes

TASK-367.21 measured the Nix adapter on 2026-10-06 with Bun 1.4.2. It read the
flakes of six public repositories, cloned into a scratch directory: helix
(`ba40e54`), ghostty (`c3203ea`), home-manager (`0e11b7b`), disko
(`725ea35`), nixvim (`8fbc7d3`) and nixpkgs (`9af746aa`, `flake.nix` only).
One process read the six `flake.nix` files and five `flake.lock` files. The
first `flake.nix`, with the grammar load, took 13 to 17 ms. Each other one
took 0.4 to 4.2 ms, and each lock less than 1 ms. The next pass took every
file from the cache.

What the static reading found:

- helix: every output. Its systems are `lib.systems.flakeExposed`, so `*`
  stands for each system: `packages.*.helix`, `packages.*.default`,
  `checks.*.helix` and `devShells.*.default`, which come through
  `lib.mapAttrs`, and `overlays.helix` and `overlays.default`.
- ghostty: 34 outputs. Its systems come from an input
  (`lib.attrNames zig.packages`), and its packages from
  `builtins.foldl' lib.recursiveUpdate` over a list of sets. Only the names
  below `checks.*` are unknown.
- home-manager: 69 outputs. A list names the four systems that get a shell.
  `lib` is an `import`, so its names are unknown.
- disko: 89 outputs for the five systems that a list names. The names that
  `//` adds to the packages and checks of each system from a call of a local
  function are unknown.
- nixvim: no output. Its flake-parts module imports `./flake`, which the check
  does not read, so every name is unknown.
- nixpkgs: 18 outputs. The names below `lib`, `legacyPackages.*` and the
  `formatter` that `lib.filterAttrs` gives are unknown.

A temporary vault with six boards bound 27 parts to outputs and to
`flake.lock`. Six relationships had anchors at lock inputs. The real check
took 445 ms cold and 372 ms warm. Most of that time is Git listing the files
of the nixpkgs checkout. Each finding was right:

- `BINDING_SYMBOL_MISSING`: `packages.x86_64-linux.hx-lsp` in helix and
  `nixosModules.readOnlyPkgz` in nixpkgs, which are not outputs, and
  `devShells.x86_64-darwin.default` in home-manager, which gives a shell only
  for the four systems of its list.
- The anchors at `inputs.nixpkgs` and `rust-overlay` (helix), `inputs.zig`
  (ghostty) and `inputs.flake-parts` (nixvim) hold and support their
  `dependency` relationships. The same input as the anchor of a `call` is
  `ANCHOR_MISMATCH`, because a lock input is build-dependency evidence. It is a
  warning: the lock names the source that it pins, so the evidence is
  resolved. An anchor at `inputs.flake-utils`, which helix does not use, is
  `ANCHOR_SYMBOL_MISSING`.
- Six parts were skipped as `expression-not-followed`, each with the lines of
  the expression that the reading cannot follow: a check of ghostty and one of
  disko, `lib.hm.dag` of home-manager, nixvim's
  `packages.x86_64-linux.default`, and `legacyPackages.x86_64-linux.hello` and
  `lib.nixosSystem` of nixpkgs.
- Every other part held its output.

The independent review read four more flakes: nixos-hardware (`31cc5f4`, 499
outputs), crane (`47b6b27`, whose own `eachSystem` folds over
`builtins.attrNames`, so every name is unknown), devenv (`fe20b5c`, 54) and
treefmt-nix (`03d8ee1`, 10). No real flake spent 5,000 of the 200,000 steps of
the reading. Flakes written to break the bounds broke them at first. A
recursion that makes a new set at each level, and an attribute path of 20,000
names, overflowed the stack and failed the whole pass. A list doubled 24 times
held 5 GB, and a set of 20,000 names that a function gives for each of 20,000
systems ran out of memory. Now each name or item that the reading binds,
copies or walks spends a step, the outputs stop 400 names deep, and each of
those flakes reads in less than 200 ms.

The review also found five ways in which the check reported an output missing
without being sure of it:

- an `or` default that stood where the name may be present;
- a formal's default that stood for an input, which Nix always gives;
- an output past the 10,000th;
- a name with a `-` in a part that did not parse;
- a system that flake-utils' default systems leave out, though a flake can
  change them through its `systems` input.

The check now skips the first four and finds the fifth.

#### Reading C and C++ through their adapters

TASK-367.09 measured the C and C++ adapters on 2026-10-06 with Bun 1.4.2, on
shallow clones of Redis (`7f44037`), SQLite (`6222fff`) and leveldb
(`7ee830d`). One process read every tracked C and C++ file in one pass:

| Checkout | Files | Lines   | Cold     | Warm  | Definitions | References | Includes | Resolved | Lines not parsed |
| -------- | ----- | ------- | -------- | ----- | ----------- | ---------- | -------- | -------- | ---------------- |
| Redis    | 796   | 377,340 | 3,474 ms | 55 ms | 31,385      | 58,130     | 3,236    | 1,550    | 2,845            |
| SQLite   | 359   | 460,758 | 3,501 ms | 22 ms | 27,098      | 58,884     | 1,505    | 264      | 4,385            |
| leveldb  | 133   | 28,900  | 377 ms   | 7 ms  | 3,233       | 6,769      | 778      | 498      | 112              |

A `.h` file is read by the C++ grammar. Measured with the error lines of each
grammar: the 84 headers of Redis `src` give 431 under C and 427 under C++,
the 24 of SQLite `src` 20 under both, and the 56 headers of leveldb, which are
C++, 1,434 under C and 163 under C++. The includes that resolve nowhere name
the system's headers, the C++ library, and headers that the build generates,
such as SQLite's `sqlite3.h`.

Tree-sitter wraps everything after a preprocessor condition that it cannot
close in one error node, while the declarations inside it parse whole: in
SQLite `src/analyze.c`, one error node spans 1,871 of 2,013 lines. The
adapter reads the whole declarations inside an error node, and only the
pieces that are not a whole construct are code that did not parse. That took
SQLite from 68,067 lines not parsed to 4,385, and Redis from 8,104 to 2,845.

The longest single file was SQLite `autosetup/jimsh0.c`, 25,495 lines: about
100 ms to parse and 145 ms to read its facts, in one turn of the event loop.
No TypeScript file of this repository comes close. The review of TASK-367.09
measured what that costs the server: another process sent an HTTP request
every 10 ms while one pass read the file. The longest request waited 223 to
260 ms, the time of that one file. While the pass read it with `btree.c`,
`vdbe.c` and `where.c`, 550 ms in all, the longest request still waited
225 ms, because the pass yields between files. A turn of the event loop
between the parse and the facts of one file did not help under Bun 1.4.2: the
longest request still waited for the whole file, 240 to 260 ms, so it was not
kept. That wait is far below a pane's poll of 5 s and `SOCKET_RECONNECT_MS`. A
vendored amalgamation is the limit: SQLite's `src/*.c` written as one file of
208,963 lines takes 550 to 620 ms to parse and about 1,175 ms to read, most of
it in tree-sitter's walk from a node to its parent. A checkout that tracks such
a file would need the parse in a worker.

A board of 12 parts bound to Redis `src` files and 7 relationships ran through
the real check in 1,223 ms cold and 477 ms warm. A board of 9 parts bound to
leveldb files and 5 relationships ran in 325 ms cold and 157 ms warm, with the
same findings whether or not the checkout had a `compile_commands.json`
(written by hand with CMake's `-I` directories, because the machine had no
CMake). The findings, each read against the code:

- The planted errors: `BINDING_SYMBOL_MISSING` for `aeNoSuchThing` and
  `DBImpl::NoSuchThing`, `ANCHOR_SYMBOL_MISSING` for two anchors that name no
  use.
- Undrawn uses, every piece resolved through the includes: AOF, the cluster,
  networking and the server core reach the dict part through `dict.h`
  (`dictCreate`, `dictFetchValue`) and the SDS part through `sds.h`, which a
  part binds as the header of `sds.c`; the database reaches the cluster
  through the macro `CLUSTER_SLOTS` in `cluster.h`; leveldb's version set
  constructs a `log::Writer`, and the database implementation constructs a
  `TableBuilder` and calls `NewLRUCache` and `Log`, each declared in a public
  header under `include/leveldb`, the pair of its source file.
- A relationship drawn the wrong way, `RELATIONSHIP_BACKWARDS`, where the code
  calls the other way, in both checkouts.
- The anchors that cite real uses (`flushAppendOnlyFile`, `log::Writer`) hold
  and support their relationships.

An include names the file of a declaration, not of the code that runs. The
first build took a use that reached a prototype as resolved evidence, so the
part bound to the header's pair was credited with code that runs elsewhere.
Redis declares nearly every function in `server.h`, so a use of
`LFUDecrAndReturn`, which `evict.c` defines, reached the part bound to
`server.c` as a warning. leveldb declares `WriteBatchInternal::Append` in
`db/write_batch_internal.h` and defines it in `db/write_batch.cc`, which are no
pair, so an anchor that cites it gave the warning `ANCHOR_MISMATCH`. No right
change clears either, and ADR 0046 makes a warning need the check to be sure.

The review of TASK-367.09 marks a prototype, a method declared without its
body and an `extern` variable with no value as declarations. A use that
reaches one leads to the definition of the name in the header's pair, and is
resolved there. Where the pair defines nothing of the name, the use matches by
name only: a candidate, until clangd names the definition (TASK-367.15). On
the same two boards, four pieces changed. `LFUDecrAndReturn` gave way to
`server`, the global that `server.c` defines. `getClusterConnectionsCount` and
`clusterPromoteSelfToMaster`, which `cluster.h` declares and
`cluster_legacy.c` defines, became candidates, so the first resolved use of
the cluster part is the macro `INVALID_CLUSTER_SLOT` of `cluster.h`. The uses
of `dictFind` in `rdb.c` and `server.c` now reach the part bound to `dictFind`
in `dict.c`, as a warning, where they went to the part bound to the whole file.
leveldb's `ANCHOR_MISMATCH` is now information. The include search moved into
the include resolver, which gives every use its target as C# and Swift do, and
lookups by name are narrowed by last name: in the same runs, the Redis board
took 1,115 to 1,186 ms cold and 167 to 176 ms warm, against 1,079 to 1,444 ms
and 410 to 776 ms before. A pass that reads all of Redis's files now resolves
the includes of each one, 214 ms warm.

The review also read two C++ libraries with templates and namespaces:
fmt (`4afd0e4`, 74 files) and abseil-cpp (`95e66a0`, 876 files). A macro
before a namespace, such as abseil's `ABSL_NAMESPACE_BEGIN` or fmt's
`FMT_BEGIN_EXPORT`, makes the grammar read `namespace detail {` as a function
named `namespace::detail`, with no error node, and every declaration inside it
was lost: 505 such functions over 108,713 lines of abseil, and 9 over 1,933
lines of fmt. No function can have that name, so the adapter now reads it as
the namespace it is. A macro between `class` and its name, as leveldb's
`class LEVELDB_EXPORT WriteBatch`, makes the grammar read a function named
`WriteBatch`, and every member was lost too. A function's declarator names its
parameters, so a bare name after a class with no body is the class, and its
members are read with the access words that the grammar takes for labels.
With both, leveldb went from 3,233 definitions to 3,416, fmt from 8,383 to
9,336 and abseil from 13,769 to 25,113. Three more readings were wrong
everywhere: an include guard was an exposed macro of every header, a
destructor's name read as a call to its class, and a member of a value that the
code does not name, as in `open()->Append()`, read as the bare name `Append`,
which the includes then led to a function of that name. It is now spelled
`.Append`, as C# and Swift spell it. Braces construct a C++ value as
parentheses do, so `Ledger ledger{...}` is call evidence, and C's
`Ledger ledger = {...}` stays a type.

ADR 0046 matches an include that resolves nowhere by its file name, as a
candidate. It is not built. On Redis, 393 of the 1,686 includes that resolve
nowhere would match one file by name. 279 of them are in angle brackets, and
191 are system headers (`<stdint.h>`, `<assert.h>`, `<math.h>`, `<strings.h>`,
`<stdbool.h>`) that would match jemalloc's own copies. The rest are in
`modules/`, `tests/` and `deps/`, which resolve with a `compile_commands.json`.
SQLite would gain 84 such matches, leveldb none, fmt 22 (gtest and gmock) and
abseil 16. A `compile_commands.json` that Git ignores, as a CMake build
directory usually is, is not read either, because the check reads only what
Git does not ignore. Such a checkout resolves its includes by the fallback.

A C or C++ module is a directory (TASK-368.10). Its public headers are the
headers below its `include` directory, or else the headers directly in it
whose source file is in it too. A declaration in one is exposed where its code
is, passed on by the header. leveldb's checkout publishes 15 headers under
`include/leveldb`, which expose 148 names. Its `db` directory has 11 public
headers and 206 names, 98 of them at the code of a source file. Redis's `src`
has 67 public headers and 6,099 names, and its callers can be in the 577 C
files outside it.

#### Reading Objective-C through its adapter

TASK-367.10 reads `.m` files with `tree-sitter-objc` 3.0.2, and also each
`.h` file in which a line outside a comment starts with `@interface`,
`@protocol`, `@class`, `@end`, `@import` or `#import`. Any other `.h` file is
read as C++, as before. The cache keeps facts by the bytes of their file. So
the text of a header decides how it is read, and its pair does not. In
AFNetworking, 30 of the 31 headers are read as Objective-C. The other one holds
only macros. An Objective-C++ file (`.mm`) is read as text,
as ADR 0046 decides, and pairs with no header.

The C adapter reads what an Objective-C file shares with C: functions,
variables, types, macros, the names that they use, and `#include` and
`#import`, which include in the same way. The Objective-C adapter adds these:

- Classes, categories and protocols, with their methods, properties and
  instance variables. A member is qualified with `::`, as the C family
  qualifies a member, and a method is named by its selector:
  `Ledger::post:by:`. A category is `Ledger(Audit)`, and its methods belong to
  the class. A binding can spell a method `Ledger.post:by:`.
- Message sends. A send is a call of its selector. Where the syntax shows the
  class of the receiver, the send is qualified by it: a class name, `self`,
  `[[Ledger alloc] init]`, or a parameter, a local, a loop variable or an
  `@catch` parameter that is declared as `Ledger *`. The nearest declaration
  of the name counts. Any other receiver gives `.post:by:`, which only a
  language server can resolve (TASK-367.15).
- An `@interface` and its methods are declarations. Their code is the
  `@implementation`, which is in the same file or in the pair of the header.
  So a send that an `#import` finds is resolved at the method's code.
- A header exposes its interfaces, categories and protocols. A class
  extension, `@interface Ledger ()`, exposes nothing, and nothing in an `.m`
  file is exposed. The module rule of C and C++ reads an Objective-C directory
  in the same way: its public headers are the headers whose `.m` file is in it.
- `@import Name;` names a module, not a file. It is read as
  `#import <Name/Name.h>`, the umbrella header of a framework, and
  `@import Name.Part;` as `#import <Name/Part.h>`. The SDK's modules, such as
  `Foundation`, are outside the checkout and resolve to no file.

Before the parse, the adapter replaces the macros that the grammar cannot read
with spaces of the same length. Every line break stays, so every line keeps its
place. It blanks these macros:

- The attribute macros of Apple's SDK, from its own list: availability,
  nullability regions such as `NS_ASSUME_NONNULL_BEGIN`, Swift names,
  initializer and ownership notes. The check reads no SDK header.
- A macro that the same file defines only as one of those, or as nothing.
- A macro that a header of the checkout defines as one of those, as ADR 0046
  decides: Realm's `RLM_HEADER_AUDIT_BEGIN` is `NS_HEADER_AUDIT_BEGIN`.
- A macro whose name ends with one of those after `_`, as a project wraps the
  SDK's macro under its own prefix: `AF_API_AVAILABLE`. This rule also works
  where the header that defines the macro is not in the checkout.

A macro that a `#define` writes as other code is not blanked by the last three
rules. So a log macro that one branch of an `#if` defines as code stays. A
macro that is defined as the name of a macro with arguments takes the
arguments too. `NS_ENUM(NSInteger, Kind)` and its kin become `enum Kind`, with
the name in its own place.

So the facts of an Objective-C file depend on its bytes and on the macros that
its checkout's headers wrap. A pass reads the `.h` and `.pch` files of a
checkout that has an `.m` or `.mm` file, once, for their `#define` lines: about
2 ms for the 159 headers of SDWebImage. The cache keeps one reading for each
set of these macros. When a header changes the set, the next pass reads every
Objective-C file again.

Measured on 2026-10-06 with Bun 1.4.2, on shallow clones of AFNetworking
(`d9f589c`, 80 `.m` and `.h` files, 15,549 lines) and SDWebImage (`c3ad5e1`,
263 files, 41,444 lines). "In error nodes" counts each line inside an error
node, as TASK-367.01 counted them. "Not parsed" counts the lines that the
adapter skips: the pieces of an error node that are not a whole declaration.

| Checkout     | In error nodes, before | after | Not parsed, before | after | Definitions, before | after | Cold   | Warm  |
| ------------ | ---------------------- | ----- | ------------------ | ----- | ------------------- | ----- | ------ | ----- |
| AFNetworking | 2,562                  | 3     | 416                | 6     | 1,266               | 1,462 | 307 ms | 7 ms  |
| SDWebImage   | 1,871                  | 622   | 486                | 29    | 3,553               | 4,145 | 546 ms | 49 ms |

`AFURLSessionManager.m` went from 1,170 lines in error nodes to 1. These
causes remain:

- A method whose header is written twice, under `#if` and `#else`, with one
  body. In SDWebImage `SDAnimatedImageView.m`, one error node spans 619 lines,
  but its methods parse whole, so the adapter skips only 20 lines.
- An `else if` that only one branch of an `#if` holds.
- `__has_warning(...)` in a condition.

A temporary vault had two boards. The first has 10 parts bound to AFNetworking
files and 6 relationships. The second has 7 parts bound to SDWebImage files and
5 relationships. The real check ran both boards in 471 to 532 ms cold and 148 to
173 ms warm. Each finding was read against the code:

- The planted errors: `BINDING_SYMBOL_MISSING` for
  `AFURLSessionManager.noSuchThing:`, and `ANCHOR_SYMBOL_MISSING` for an anchor
  whose send is not in the file.
- `RELATIONSHIP_BACKWARDS` where a relationship was drawn the wrong way: the
  session manager uses `AFSecurityPolicy`, and the SDWebImage manager uses
  `SDImageCache`.
- Undrawn uses, each resolved through an `#import`: the HTTP session manager
  subclasses `AFURLSessionManager` and makes an `AFJSONResponseSerializer`;
  the session manager uses `AFNetworkReachabilityManager`; the HTTP session
  manager reads `AFSSLPinningModeNone`, which `NS_ENUM` declares and which
  only the rewrite of `NS_ENUM` brings in; `UIView+WebCache.m` uses
  `SDImageCache`.
- The anchors that cite real sends, such as
  `dataTaskWithRequest:uploadProgress:downloadProgress:completionHandler:` and
  `loadImageWithURL:options:context:progress:completed:`, hold.

One limit is inheritance. `UIImageView+WebCache.m` sends
`sd_internalSetImageWithURL:...` to `self`, a `UIImageView`, and the category
of `UIView` defines that method. A send is qualified by the class that the
syntax shows. That class does not define the method, so the relationship from
the image view to the view category is `RELATIONSHIP_UNSUPPORTED`, which is
information. A send to a subclass, to `super`, or to a value whose class the
syntax does not show needs clangd (TASK-367.15).

The review of TASK-367.10 found these faults and fixed them:

- A loop variable or an `@catch` parameter that has the name of a parameter
  of another class gave the send the class of the parameter. So
  `for (Audit *x in audits) [x post];` in a function that takes `Ledger *x`
  was a resolved use of `Ledger`, and a false `RELATIONSHIP_UNDRAWN`. A
  declaration under a `case` or an `#if` was missed in the same way.
- An instance variable that a header declares `@package` was found by its bare
  name. So another class's own `_queue` was a resolved use of that header.
- A C++ header with `@class` in a documentation comment was read as
  Objective-C, and lost its classes.
- `#define RLM_HEADER_AUDIT_BEGIN NS_HEADER_AUDIT_BEGIN` blanked the name of a
  use and left its arguments. The arguments then read as uses.
- A character outside the Basic Multilingual Plane in a blanked macro, such as
  an emoji in a deprecation message, and an enum with no name, such as
  `CF_ENUM(uint32_t)`, changed the length of a line. A comment after the name
  of an enum lost the name.

The review measured the wrappers that the prefix rule does not find. It finds
both wrappers of AFNetworking. SDWebImage, Mantle (`2a8e212`) and FMDB
(`d3abf74`) define none. Realm (`realm-swift` `a40ced7`, `Realm/`) defines
`RLM_HEADER_AUDIT_BEGIN` and `RLM_HEADER_AUDIT_END`, and 48 headers use them.
So the join of the checkout's headers was built. On the 216 Objective-C files
of `realm-swift`, it gives 16 more definitions and 25 fewer lines not parsed.
`RLMLogger.h` went from 79 lines in error nodes to 0. It also removes 353
references, mostly the names of these macros and their arguments. The macros
that Realm defines as `__attribute__((...))`, such as `RLM_FINAL`, are not on
the list, and they still put lines in error nodes. After the review, the real
check ran both boards in 470 ms cold and 146 ms warm.

#### Reading Terraform with the HCL grammar

TASK-367.17 reads `.tf` and `.tofu` files with the `terraform` grammar of
`@tree-sitter-grammars/tree-sitter-hcl` 1.2.0. The package also ships an
`hcl` grammar, and both give the same tree on the files that were tried. The
`terraform` grammar is the dialect that the package builds for Terraform's
templates, so the adapter uses it. The JSON syntax (`.tf.json`) is read as
text.

On 2026-10-06, with Bun 1.4.2, one process read the 77 tracked `.tf` files of
terraform-aws-modules `terraform-aws-vpc` (`b3abd6df2e`, version 6.7.3) in
172 ms cold, grammar load included, and in 2 ms warm. They hold 2,631
definitions and 3,090 references, and no line of them fell in a part that did
not parse. A board of 10 parts bound to the root module `examples/complete`
and 5 relationships ran through the real check in 216 ms cold and 95 ms warm.
The root module calls the repository's own root (`../../`) as `vpc` and
`modules/vpc-endpoints` three times, and its address space holds 189
resources, data sources and module calls. The check found what was planted, a
missing `module.vpc.aws_vpc.gone` and an address in the wrong module, and
every other finding was right. It reported as undrawn the public subnets and
the flow log, which reach the VPC through `local.vpc_id`, the NAT addresses
and the NAT gateway, which name the internet gateway (one by `depends_on`),
and the private NAT route, which names the NAT gateway. The relationship from
the endpoints module call to the VPC holds through the call's argument
`vpc_id = module.vpc.vpc_id` and the output of the `vpc` module, and the one
drawn from the public subnets to the private NAT route has no reference.
TASK-367.18 then made every one of those references provisioning, as the next
section says.

#### Classifying Terraform evidence by provider

On 2026-10-06 the user named the providers to cover first: AWS, Google Cloud,
Azure, and Kubernetes through the `kubernetes` and `helm` providers.
TASK-367.18 gives each one a table in
`packages/code-intel/src/runtime/operations/code-facts/terraform/terraform-providers.ts`. The table maps a
resource or data source type to the kind of evidence that each of its
arguments gives. An argument is a path of attribute and nested block names,
such as `default_action.target_group_arn`. The rule of ADR 0046 decides each
entry. A trigger, a subscription and an event mapping are calls. A listener,
a target group and a network rule are configured paths. A grant is a
permission. Every other reference of a named provider is provisioning. Three
rules hold in every provider:

- An environment value that a resource sets for the code it runs is a
  configured path. These are the shapes that the providers share:
  `environment { variables }`, `environment_variables`,
  `runtime_environment_variables`, `app_settings`, and the `value` of an `env`
  block. They are the same shapes that TASK-367.23 joins with the code that
  reads them.
- Terraform's meta-arguments are provisioning: `depends_on`, `count`,
  `for_each`, `lifecycle`, `provisioner`, `connection`, and the `for_each` of
  a `dynamic` block.
- A reference in a module call, a variable, an output or a local value has no
  provider, so it stays a configured path. Such a reference only passes a
  value on. The kind of a way through it is the kind of the reference that
  starts the way, in a resource. The call of a module that the check does not
  read reaches what its arguments name as provisioning, unless the argument is
  an environment value or a named plan shows the resource that it flows into,
  because an argument such as `vpc_id` only places what the module creates.

A joining declaration joins two other declarations. Its table entry names the
arguments that name the end the join runs from and the arguments that name
the end it runs to. Its evidence runs from the parts that own the one end to
the parts that own the other, and the piece cites the joining declaration. It
never runs from the joining declaration to each end. An end that its
arguments name no declaration for is the joining declaration itself. So a
Cloud Function's `event_trigger` runs from its topic to the function, and a
pull subscription runs from its topic to the subscription. An anchor can name
a joining declaration, and the check does not require it to be in the code of
either end. The check judges it by the kind of its join, so a Lambda
permission that anchors a `call` is an `ANCHOR_MISMATCH` warning. Any other Terraform declaration that an anchor names is judged as
code is: it must be in the code of an end.

The tables cover the common connections of each provider. A type that is
not listed falls back to provisioning.

- AWS calls: the joins of an event source mapping, an EventBridge pipe, an
  SNS subscription, an EventBridge target, an S3 bucket notification, a
  Lambda event invoke config and the API Gateway integrations. Also the
  target of an EventBridge Scheduler schedule and the definition of a Step
  Functions state machine.
- AWS configured paths: the joins of a load balancer listener, a listener
  rule, a target group attachment and the VPC security group ingress and
  egress rules. An ECS service and an Auto Scaling group join their target
  groups to themselves, and a security group joins its ingress groups to
  itself. Also an SQS redrive policy, a Lambda dead-letter target, an API
  Gateway route target, CloudFront origins, Route 53 aliases and records, and
  `aws_security_group_rule`.
- AWS permissions: the joins of a Lambda permission, a role policy
  attachment, an inline role policy, and the SQS, SNS and S3 bucket policies.
  Also an IAM policy's document and a policy document's statements.
- Google Cloud calls: the joins of a Pub/Sub subscription, the event triggers
  of Cloud Functions, an Eventarc trigger and a Cloud Storage notification.
  Also the Pub/Sub and HTTP targets of a Cloud Scheduler job.
- Google Cloud configured paths: the join of a firewall, from its source to
  its target service accounts and tags. Also a subscription's dead-letter
  topic, backend services, URL maps, target proxies, forwarding rules and
  serverless network endpoint groups.
- Google Cloud permissions: the IAM members and bindings of topics,
  subscriptions, Cloud Run services, Cloud Functions, buckets, secrets,
  BigQuery datasets, service accounts and projects. Each one joins its member
  to the resource of the grant.
- Azure calls: the joins of an Event Grid event subscription, a system topic
  event subscription, a system topic and a Service Bus subscription.
- Azure configured paths: the joins of a load balancer rule, a network
  interface's backend pool association, a network security rule and a
  virtual network peering. Also Service Bus queue forwarding, app connection
  strings, Application Gateway backend pools and private endpoint
  connections.
- Azure permissions: the join of a role assignment, from its principal to its
  scope.
- Kubernetes: an Ingress backend is a call. A Service selector, config map
  data and the `set`, `set_list` and `values` of a `helm_release` are
  configured paths. A NetworkPolicy spec is a permission.

Some declarations fall back on purpose. ECS container definitions are one
encoded string that holds environment values, an image and a log group
together, so they stay provisioning. An `aws_security_group_rule` reads its
direction from its `type`, so its references are configured paths from the
rule and not a join. A Kubernetes Secret's data is a credential that a
workload is set up with, so it is provisioning. `kubernetes_manifest` can hold
any object, so it is provisioning. A plan JSON's references are classified by
the keys of their expressions. These keys are the arguments of the `.tf`
files.

The check read real configurations through temporary vaults. They were
cloned on 2026-10-06:

- terraform-aws-modules `terraform-aws-lambda` (`3a1405b`): the examples
  `event-source-mapping` and `triggers`.
- terraform-aws-modules `terraform-aws-vpc` (`b3abd6d`): the example
  `complete`.
- terraform-google-modules `terraform-docs-samples` (`f96259b`):
  `functions/pubsub` and `eventarc/basic_pubsub`.
- `terraform-provider-azurerm`: `examples/eventgrid/event-subscription` and
  `examples/servicebus/forwarding`.
- `terraform-provider-kubernetes`: `_examples/ingress` and
  `_examples/wordpress-mysql-gce-pv`.

Nine boards had 42 parts and 16 relationships. Before the rules, the check
gave 23 findings. 14 of them were undrawn warnings. Each one rested on a
provisioning reference: a role, a log group, a namespace or a VPC, for
example. Five drawn calls had no
support or ran backwards. Each one was an event that a joining declaration or
a trigger carries, such as a Pub/Sub topic to the function that it triggers.
After the rules, the check gave 8 findings, and none of them was a warning.
Each of the five calls now holds through its joining declaration. Four
`dependency` relationships of the VPC board now have only provisioning
evidence, because a placement in a VPC is provisioning. The finding lists that
evidence. Three event source mappings of `terraform-aws-lambda` still have no
evidence. That module takes its sources through
`for_each = var.event_source_mapping` and `each.value`, and these name no
address.

The review of TASK-367.18 read each table entry against the documentation of
its provider on 2026-10-06. Some entries named a whole block as the end of a
join or as a configured path, and the block also names a credential. So the
service account in a push subscription's `oidc_token` was a call from the
topic, and a board that binds that account got an undrawn warning. The same
was true of the account of a BigQuery or a Cloud Storage subscription, the
network attachment of an Eventarc destination, and the access control,
access identity and client certificate of a CloudFront origin. Each entry now
names the argument that names the end: `push_config.push_endpoint`,
`bigquery_config.table`, `cloud_storage_config.bucket`, the five targets of an
Eventarc `destination`, and the `domain_name` and `vpc_origin_config` of an
origin. An Eventarc trigger on the events of a bucket names the bucket in its
`matching_criteria`, and a trigger on a third-party source names its
`channel`. The trigger now runs from either one. azurerm 5 renamed the
endpoints of an Event Grid subscription, for example `service_bus_queue_id`
for `service_bus_queue_endpoint_id`. The table had only the old names, so a
subscription written for azurerm 5 joined nothing. It now has both.
`helm_release` gained `set_list`. One more fault was in the anchors. An anchor
that named a declaration inside a local module, such as its variable, was
judged outside a part bound to the module call, such as `module.worker`. Such
a part holds every declaration of its module instance, so the anchor now
supports its relationship. The nine boards give the same findings as before.

#### Reading the interface of Terraform modules

TASK-368.11 gives Terraform and OpenTofu a rule of the interface check
(TASK-368.10). A module is the `.tf` and `.tofu` files directly in a
directory, and it exposes its variables and outputs. A module in a directory
below it, such as an example, is a module of its own that can call it. A call
of the module uses the variables that its arguments set and the outputs that
the calling module reads, such as `module.queue.url`. A reference to the
whole call, such as `value = module.queue`, reads every output, except in
`depends_on`, which only orders. Configuration outside a module reaches it
only through its outputs. So the check never reports an
entry point of a Terraform module as unexposed: a drawn caller cannot reach
past the outputs.

Two more findings read what the module does with its variables. Both are
information on the container bound to the module. A variable is a
pass-through variable when the module uses it once, as the whole value of one
argument of a resource that it manages, such as `bucket = var.bucket`. A
meta-argument, such as `count`, is no argument of the resource, and a use in
the variable's own validation is no use. `VARIABLE_PASSED_THROUGH` names these
variables. A module is shallow when it manages exactly one resource, calls no
module, passes every variable through, and the resource reads nothing else,
such as a local or a data source. A variable that only sets the `count` of that
resource, such as `create`, is allowed, because a caller can say that on the
call itself. A variable in its `for_each` is not: `each.value` carries the
variable's data into the arguments, and no reference shows that. A literal
argument shows no reference either, so a module that fixes an argument to a
constant still reads as shallow. `MODULE_SHALLOW` says so and names each
variable that the module passes through, so a shallow module gets no
`VARIABLE_PASSED_THROUGH`.

On 2026-10-06, with Bun 1.4.2, the real check read terraform-aws-modules
`terraform-aws-s3-bucket` (`5dc2f1f`, version 5.16.1) and
`terraform-aws-key-pair` (`f3221d3`, version 3.0.1) through a temporary vault.
Containers were bound to the root module of each repository and to
`modules/account-public-access`, `modules/object` and `modules/notification`,
and examples drawn as their callers. The pass took 302 ms. Before this task,
each of the 5 containers was skipped as `exposure-unknown`. Now each is
judged:

- `modules/account-public-access` is shallow. It manages one
  `aws_s3_account_public_access_block` and passes 5 of its 6 variables through.
  The sixth, `create`, only sets `count`.
- `modules/object` passes 22 of its 27 variables through to its one
  `aws_s3_object`, and it is not shallow. It changes `storage_class` and the
  two object lock variables with `upper`, and `override_default_tags` decides
  whether a block is made.
- The root module of `terraform-aws-s3-bucket` passes 15 of its 72 variables
  through. Its examples and `wrappers/` call it, and they set every variable.
  `wrappers/outputs.tf` passes every output on with `value = module.wrapper`,
  so nothing that the root module exposes is unused. Before the review, a
  whole call read no output, and `EXPOSED_UNUSED` named 3 outputs.
  `modules/notification` passes 1 of 11 through, and nothing reads 1 output.
- The root module of `terraform-aws-key-pair` passes 5 of its 10 variables
  through to its two resources.

No entry point was reported unexposed, and no caller undrawn.

The independent review read three more repositories the same way:
terraform-aws-modules `terraform-aws-cloudwatch` (`82e5143`, version 5.7.3),
`terraform-aws-iam` (`da8e6a8`) and `terraform-aws-security-group`
(`b3c1b2e`), with a container for each of 13 modules and an example drawn as
its caller. The pass over all five repositories took 947 ms.

- 5 more modules are shallow: `log-group`, `log-stream`, `query-definition`
  and `log-metric-filter` of `terraform-aws-cloudwatch`, and `iam-policy` of
  `terraform-aws-iam`. Each manages one resource with
  `count = var.create ? 1 : 0` and passes every other variable through.
- `metric-alarms-by-multiple-dimensions` is not. Its
  `for_each = { for k, v in var.dimensions : k => v if var.create_metric_alarm }`
  sets `dimensions = each.value`, so `var.dimensions` gives an argument its
  value. Under the rule that let a variable in `for_each` toggle the resource,
  such a module that passed every other variable through would read as
  shallow. The root module of `terraform-aws-security-group` sets every
  argument of its ingress rules from `each.value` the same way.
- 7 more modules pass some variables through and are not shallow, such as
  `metric-alarm` (21 of 23), whose `metric_query` blocks look up their values
  with defaults, and `log-subscription-filter` (5 of 7), whose `name` an
  output also reads.

#### Reading build dependencies between Nix packages

TASK-367.22 measured the reading of derivations on 2026-10-06 with Bun 1.4.2.
It read the `flake.nix` of 16 public repositories, cloned into a scratch
directory: nixd (`bdb4670`), deploy-rs (`cf64c8c`), nix-index (`dd6792b`),
helix (`ba40e54`), devenv (`fe20b5c`), nixvim (`8fbc7d3`), treefmt-nix
(`03d8ee1`), crane (`47b6b27`), rust-overlay (`b962e5d`), Nix (`bea853d`),
lanzaboote (`ba33415`), Hydra (`6e99f07`), nil (`205c8ba`), microvm.nix
(`52860fa`), fenix (`eff70f3`) and attic (`7a19204`). The first file, with the
grammar load, took 14 ms. Each other one took 0.4 to 4.8 ms.

Few flakes write a build dependency between their own packages in
`flake.nix`. Most build each package with `callPackage` from a file of its own,
or take the packages from an `import nixpkgs` with the flake's overlay. Only
nixd names its packages to each other. In its flake-parts `perSystem`,
`callPackage ./nixd` gets `nixf` and `nixt` as arguments, so `nixd` is built
from `nixf` and `nixt`. The reading found those two, and the same two for
`packages.default`, which is `nixd`. It also found `nixd` in the arguments of
the editor shells `nvim` and `vscodium`. One `genAttrs` call gives both
shells, so they share its lines, and that dependency is unknown (see below).

A temporary vault with six boards bound 21 parts to outputs of six of these
flakes: nixd, helix, deploy-rs, nix-index, microvm.nix and nil. It drew 11
`dependency` relationships with no anchor. The real check took 362 ms cold and
320 ms warm. The code before this task found 9 `RELATIONSHIP_UNSUPPORTED` and
3 `BINDING_SYMBOL_MISSING` in the same vault. Now:

- nixd's `nixd` to `nixf` is supported by the build dependency at the line that
  names `nixf`.
- 2 `RELATIONSHIP_UNDRAWN` warnings, both resolved and both right: `nixd` and
  `default` are built from `nixf` and `nixt`. Before the review there were
  4: the editor shells were also built from `nixd`, which is also `default`.
- 10 relationships are skipped as `expression-not-followed`. Each names the
  output and the lines of what the reading cannot follow. Some are packages
  that `callPackage` builds from a file: nixd's `nixf`, microvm.nix's
  `build-microvm` and nil's `coc-nil`. Some come from an `import nixpkgs` with
  an overlay (helix, deploy-rs). The others are an `overrideAttrs` (a
  deploy-rs check) and shells that `mkShell` makes (helix, nix-index, nixd).
- The parts bound to an overlay's package, `overlays.helix.helix` and
  `overlays.default.deploy-rs`, now hold. nil's `overlays.default` is
  `lib.composeExtensions` of two overlays, which the reading does not follow,
  so `overlays.default.nil` is skipped, not missing.

TASK-436.06 repeated the same 16 pinned checkouts on 2026-10-07, with Bun
1.4.2, against `fa6e5be85` and the local-import reading. A local `import` or
`callPackage` now parses its file through the checkout's read boundary.
Directory paths read `default.nix`; paths and links outside the checkout stay
unknown. One 200,000-operation budget covers the flake and every imported
expression. The callPackage argument rule follows
[Nixpkgs' function-argument intersection and explicit overrides](https://nixos.org/guides/nix-pills/13-callpackage-design-pattern):
only the function's actual build inputs count when its function can be read.

| Flake                    | Output definitions before → after | Relationships skipped → supported |
| ------------------------ | --------------------------------: | --------------------------------: |
| nixd (`bdb4670`)         |                           14 → 14 |                                 0 |
| deploy-rs (`cf64c8c`)    |                           25 → 38 |                                 0 |
| nix-index (`dd6792b`)    |                           44 → 44 |                                 0 |
| helix (`ba40e54`)        |                           15 → 15 |                                 0 |
| devenv (`fe20b5c`)       |                           55 → 55 |                                 0 |
| nixvim (`8fbc7d3`)       |                             0 → 0 |                                 0 |
| treefmt-nix (`03d8ee1`)  |                           10 → 38 |                                 0 |
| crane (`47b6b27`)        |                           18 → 18 |                                 0 |
| rust-overlay (`b962e5d`) |                           12 → 68 |                                 0 |
| Nix (`bea853d`)          |                          90 → 208 |                                 0 |
| lanzaboote (`ba33415`)   |                           27 → 27 |                                 0 |
| Hydra (`6e99f07`)        |                         125 → 142 |                                 0 |
| nil (`205c8ba`)          |                           11 → 11 |                                 0 |
| microvm.nix (`52860fa`)  |                           58 → 85 |                                 0 |
| fenix (`eff70f3`)        |                           13 → 16 |                                 0 |
| attic (`7a19204`)        |                             0 → 0 |                                 0 |

This measurement compares every resolved sibling-output dependency in the
facts of each flake. The four logical dependencies already found in nixd
remain supported; none is removed. Reading local files exposes more output
names in seven flakes, but adds no supported relationship in this sample.
The same six-board, 21-part, 11-relationship real check still has one supported
relationship, two resolved undrawn warnings and ten relationship skips.
Before: 395 ms cold / 374 ms warm. After: 356 ms cold / 327 ms warm. One
run of each does not establish a speed change.

The remaining expressions depend on an outside package set, such as
`import nixpkgs` with an overlay, or builders the reading does not know,
such as `overrideAttrs` and `mkShell`. Three skips now name the imported
expression: microvm.nix's `pkgs/build-microvm.nix:9-61`, nixd's
`nixd/docs/editors/test-shell.nix:38-46`, and `libnixf/default.nix:43`.
The dependency remains owned by its output in `flake.nix`. The focused
import owner also proves a new supported local build dependency, nested
relative imports, explicit and automatic arguments, ignored arguments,
outside paths and links, cycles, edits across passes, and the shared limit.

Before this task, some packages of flake-parts and flake-utils shared the
lines of one binding. This occurred where several bindings, such as
`packages.a` and `packages.b`, or one `inherit` of three names, gave the
packages of one system. So every package owned the inputs of every other. Now
a name that a binding or an `inherit` writes has its own lines.

The review of TASK-367.22 found that one line can still hold several
packages. Examples are `inherit core lib app;` on one line, as devenv writes
`inherit (workspace.crates) devenv devenv-tasks;`, a set written on one line,
and the shells of one `genAttrs` call. The check gives a piece of evidence to
every part whose output holds the line that names the input. It takes the
evidence to every part whose output holds the lines of the output it names.
So in a temporary vault, `app` built from `lib` on such a line gave 4 false
`RELATIONSHIP_UNDRAWN` warnings, such as `core` built from `lib`. Now a build
dependency is evidence only where no other package shares those lines. The
same package under another name (`default = nixd`) or for another system can
share them. Elsewhere the dependency is unknown at that line. The review also
narrowed the skip. A build dependency in a flake reaches only the outputs of
that flake. So if the end of a relationship holds an output of the same
flake, the check skips it. Otherwise the check judges it. Before, take a part
bound to a directory with a flake that makes a shell with `mkShell`. Every
unsupported `dependency` from that part was skipped, also one to TypeScript.
An input that is a set merged with a value that the reading cannot follow,
such as `pkgs.hello // { ... }`, is now unknown too. Before, it was left out,
and the relationship was reported unsupported.

#### Reading .NET projects through the C# adapter

TASK-367.11 measured the C# adapter on 2026-10-06 with Bun 1.4.2, on shallow
clones of `dotnet/command-line-api` (System.CommandLine, `ba7fb9b`) and
`dotnet/BenchmarkDotNet` (`34da531`), while other agents kept the machine at
a load average of 11 to 16 on 24 cores. One process read every tracked `.cs`
and `.csproj` file in one pass. A file's names resolve through its project,
so the first file of a project reads the facts of all of its files and of the
projects it references, through the cache, one parse at a time.

| Checkout           | Files | Cold              | Warm          | Definitions | Uses in code | Lead to a file | Of another file | Unparsed lines |
| ------------------ | ----- | ----------------- | ------------- | ----------- | ------------ | -------------- | --------------- | -------------- |
| System.CommandLine | 213   | 415 to 644 ms     | 29 to 60 ms   | 2,161       | 8,482        | 1,774          | 947             | 288 in 4 files |
| BenchmarkDotNet    | 1,204 | 1,464 to 1,775 ms | 198 to 294 ms | 15,121      | 50,547       | 15,035         | 7,542           | 23 in 11 files |

The longest wait of the event loop in a cold pass was 89 to 186 ms: the first
parse loads the grammar, and with the grammar loaded the longest single parse
of BenchmarkDotNet held the loop for 103 ms. Reading one file of
BenchmarkDotNet's test project in a new pass read its 730 files from the cache
in 10 ms, with a longest wait of 2 ms. A `ProjectReference` resolved in each
of the 11 and 52 cases. `InternalsVisibleTo` gave an internal member of
BenchmarkDotNet its 10 friends, named in attributes as
`"BenchmarkDotNet.Tests,PublicKey=" + BenchmarkDotNetInfo.PublicKey`.

Tree-sitter reads every branch of an `#if` as code. In System.CommandLine,
two branches that each hold half an `if` statement put all 133 lines of
`Argument{T}.cs` in one error node. The adapter now reads the first branch of
each `#if` and blanks the other branches and the directives, keeping every
line in place, and the library parses fully. The 288 lines left are in tests
and in one project: tree-sitter-c-sharp 0.23.5 does not read an interpolated
verbatim string with doubled quotes (`$@"move --to ""{path}"""`), which put a
whole test file of 242 lines in error, or a C# 14 `extension` block.

A board of 12 parts and 8 relationships over System.CommandLine ran through
the real check in 486 to 637 ms cold and 166 to 199 ms warm. The library's
project file was bound as a container, with `Command.cs`, `ParseResult.cs`,
four of its directories and one symbol inside it, beside `dotnet-suggest` by
its directory, the static completions by their project file, and the tests.
Every finding is right:

- `BINDING_SYMBOL_MISSING` on a planted binding, and `ANCHOR_MISMATCH` on a
  planted anchor: `dotnet-suggest -> Help` anchored at `Command`, which the
  library's `Command.cs` declares.
- `RELATIONSHIP_UNDRAWN` on Parsing, Invocation and Completions, each piece a
  construction, a static member or a base class: `ParseDiagramAction.Diagram`,
  `TokenType.Directive`, `new AnonymousSynchronousCommandLineAction`,
  `CompletionAction : SynchronousCommandLineAction`, `new CompletionItem`,
  `CompletionContext.Empty`.
- `RELATIONSHIP_BACKWARDS` on `Invocation -> Parse result`: `ParseResult`
  calls `InvocationPipeline.InvokeAsync`. And on
  `System.CommandLine -> Static completions`: the static completions' project
  file references the library, a build dependency.

The anchored relationships hold, and `Help -> Invocation` is supported because
`HelpAction` derives from `SynchronousCommandLineAction`. The first runs gave
five wrong pieces on two findings, each a name taken for the type of the same
name: an inherited property passed as a value (`ParseResult`), a member that
a property pattern names (`{ Command.Action: ... }`), a member of a cast's
result, and two `is Option or Command` patterns read as calls. So a name may
be found as a type only where the syntax lets only a type stand, a member of
a value the code does not name is looked up nowhere, and a pattern is a type. A board
of 9 parts over BenchmarkDotNet ran in 1,686 ms cold and 379 ms warm and gave
six undrawn warnings and one backwards finding, each right, among them a test
project's `ProjectReference` to the Windows diagnostics.

The review of TASK-367.11 changed three things that these runs rest on. A
part bound to a `.csproj` now binds its project: every file below its
directory, as a part bound to that directory does. Before, it owned only the
project file and, through it, what the code of other projects used of its
project. The uses in its own code belonged to no part, so a `call` between two
projects bound by their project files had only `build-dependency` evidence. A
part of a partial type that writes no accessibility now takes the one that
another part writes. The `.Designer.cs` parts of eShopOnWeb's migrations were
`internal` before. A later branch of an `#if` is now code that the check did
not read, so it skips a symbol that only that branch holds.

The same review gave C# its rule for the interface check: a project exposes
the public types of all its files and their public members. On eShopOnWeb
(`4da8212`), a board of 9 parts ran through the real check in 428 ms. Each
project was bound by its project file, with three folders of ApplicationCore
inside it. It gave five undrawn warnings, each right, among them Web's
`ProjectReference` to BlazorAdmin. `EXPOSED_UNUSED` listed 8 of
ApplicationCore's 40 names, and `git grep` finds none of them in the code of
another project. On System.CommandLine, a board of 8 parts gave
`CALLER_UNDRAWN` on Completions, from two benchmark files that no part binds,
and `EXPOSED_UNUSED` listed 24 of the library's 37 names. Two of them,
`ArgumentValidation` and `OptionValidation`, hold extension methods. A call of
one goes through a value, which only a language server resolves
(TASK-367.14).

#### Joining code and infrastructure across a network hop

TASK-367.23 tried the join on 2026-10-06 with Bun 1.4.2, through the real
check and a temporary vault:

- docker's `awesome-compose` (`30f4b7f`): no sample reads an address from the
  environment in a language that the check parses. The code that reads one is
  JavaScript, Java, Rust or an nginx template that `envsubst` fills.
  `react-express-mysql/backend/src/config.js` reads `DATABASE_HOST`, which
  compose sets to `db`, but JavaScript is read as text. So the join has no
  read there, and the relationships of that board are skipped as `text-only`.
  The Python samples read only a port (`FLASK_SERVER_PORT`) and write their
  hosts in the code (`mongo:27017`).
- testdriven.io's `fastapi-tdd-docker` (`16433b6`): `project/app/db.py` reads
  `DATABASE_URL` at line 12. Line 13 of `docker-compose.yml` sets it for `web`,
  which builds `./project`, to `web-db`, which builds `./project/db`. The
  board has DB setup (`db.py`), API routes, Models and Database
  (`services.web-db`). The two pieces support DB setup -> Database. Without
  that relationship, the check warns `RELATIONSHIP_UNDRAWN` on Database with
  both pieces. API routes -> Database is `RELATIONSHIP_UNSUPPORTED` with
  `missing: code`. Compose sets `DATABASE_URL` and `DATABASE_TEST_URL` to the
  database for the code of the routes. The routes reach the database through
  the ORM that `db.py` sets up. An anchor at the ORM call is the repair. The pass
  over these boards and the `awesome-compose` board took 194 ms cold and 125
  to 129 ms warm.
- The dogfood vault: the join changed no finding. The repository has no
  compose file, and no relationship of the vault is unsupported.
- Terraform and Kubernetes were not tried on a real project. Their join is
  owned by `packages/code-intel/tests/runtime/operations/code-check/infrastructure/network-hop.test.ts`: a Lambda
  function's `environment` block, and a Deployment's `env` and `envFrom`.

The independent review planted what the trials did not have. A value that
names a service whose build holds two bound parts reached both parts as
resolved evidence. So did a read in a directory that two services build to two
targets with different values. Each gave a `RELATIONSHIP_UNDRAWN` warning that
only a wrong relationship clears, through compose, Kubernetes and Terraform
alike. Such pieces are now candidates. A synthetic repository with 300 compose
projects (1,200 services) and a part bound to 4,000 TypeScript files took
499 s through the real check, because the check searched which service runs a
file again for each service and file. It now looks the services up by
directory, and the same pass takes 0.8 s cold. No probe found a value in an
answer: credentials in a compose `DATABASE_URL`, a Terraform `environment`
literal, a Kubernetes `env` value, a Secret and an env file stay out of every
finding.

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

The first build's real code check took 9,083 ms on its first
run after a restart. Five later runs took 4,743 to 7,141 ms. Before
TASK-367.13, a warm run took about 1,400 ms.

After the review, at a load average of 11 to 12, the real command took
4,738 ms on its first run after a restart, and 2,913 to 4,209 ms on five later
runs. The answer had 39 findings and named no missing or failed server, and
no `tsc` process ran after it.

#### Resolving Swift candidates with sourcekit-lsp

TASK-367.16 measured sourcekit-lsp on 2026-10-06. nixpkgs has only Swift
5.10.1. Its sourcekit-lsp cannot find a toolchain, and its sourcekitd library
does not load (an undefined symbol, `OStream_write`). So the run used the
official `swift:6.2` image (Swift 6.2.4) through podman. A script in a scratch
directory ran `sourcekit-lsp` in the image, with the checkout mounted at its
own path, and `language-servers.json` named that script. The package had two
targets: `Core` with `Ledger.swift`, and `App`, whose `main.swift` calls
`ledger.post` through a value.

What sourcekit-lsp 6.2.4 does:

- It answers only about a file that the client opened. For a closed file, it
  refuses with "No language service". So the Swift row opens each file once,
  with its text on disk.
- Background indexing is on by default. At the start, the server ran
  `swift build` to prepare each target and wrote `.build/index-build`. With
  `initializationOptions` `{ "backgroundIndexing": false }`, it runs no build.
  It then reads the index that `swift build` wrote under
  `.build/debug/index/store`, and keeps its database in `.build/debug/index/db`.
- These options win over `~/.sourcekit-lsp/config.json`. A
  `.sourcekit-lsp/config.json` in the package wins over them: with
  `backgroundIndexing: true` there, the server built again. So the check does
  not ask about such a package.
- It loads the index after it answers `initialize`. A question about another
  module before that gets `null`. `workspace/synchronize` with
  `{ "index": true }` answers when the index is loaded, in about 100 ms here.
- Started at the checkout root, it did not resolve a use across modules in a
  package one directory down. So the check starts one server in each package.
- Swift 6.2 `swift build` writes the index on Linux by default. Swift 5.10
  writes it only with `--enable-index-store`.

Through the real `checkCode`, a board bound `Ledger.post`, `normalize` and the
`App` directory. It also had a `call` from App to the part of `normalize`,
anchored at `ledger.post` in `main.swift`. The table shows each run. Each pass
took the time shown, with podman starting the image.

| Run                        | Pass   | Findings                                                                        | Skipped                   |
| -------------------------- | ------ | ------------------------------------------------------------------------------- | ------------------------- |
| Built, sourcekit-lsp       | 777 ms | `RELATIONSHIP_UNDRAWN` warning (resolved), `ANCHOR_MISMATCH` warning (resolved) | none                      |
| Built, no entry for Swift  | 221 ms | `RELATIONSHIP_UNDRAWN` information (candidate)                                  | `language-server-missing` |
| Never built, sourcekit-lsp | 257 ms | `RELATIONSHIP_UNDRAWN` information (candidate)                                  | `language-server-unready` |

In the first run, `post` calls `normalize`, a name of the same file, and the
server resolved it. It also named `Ledger.post` as the definition of the
anchor's `ledger.post`, outside both ends. In the last run, the check started
no server and wrote nothing into the package. No `index-build` directory and
no container were left after any run.

The review of TASK-367.16 ran sourcekit-lsp 6.2.4 again in the same image.
It used the check's own session. The scratch package had two targets and a
test target, and `swift build` built it once.

- With background indexing off, the server built nothing. No `index-build`
  directory appeared, and no object file changed. The server wrote two things
  under `.build/<triple>/debug`: its index database, and a module cache for
  the Clang modules of the standard library. Nothing else in the package
  changed. No option of version 6.2 moves them out of `.build`. Its `index`
  options are only `indexPrefixMap` and `updateIndexStoreTimeout`. So ADR
  0046 now lets a server that the user names keep its own files in the build
  output of the project, which Git ignores.
- `backgroundPreparationMode: "build"` in the package's configuration built
  nothing. Preparation runs only inside background indexing.
- `backgroundIndexing: true` in `~/.sourcekit-lsp/config.json` and in
  `$XDG_CONFIG_HOME/sourcekit-lsp/config.json` built nothing. The options of
  the client win over both files. The server's log showed background indexing
  off.
- `workspace/synchronize` with `{ "index": true }` waits for the build graph.
  Then it reads the new units of the index store. With background indexing
  off, sourcekit-lsp 6.2 has no index manager (`Workspace.swift`). So the
  request starts no indexing and no preparation.
- With a `buildServer.json` in the package, the server ran the program that
  the file names. It did not read `Package.swift`, and every answer was
  empty. That program is code of the checkout, which the user's entry allows.
  An empty answer keeps the candidate.
- After a build that skipped the tests, the server resolved two uses in a
  test file: a name of another test file, and `ledger.post` in `Core`.
- One package had 150 directories and 5,000 index units. The readiness check
  looked at the package once for each directory and took 25 to 45 ms in each
  pass. Now a pass looks at each package once, in 2 to 3 ms.

#### Resolving Python and C# candidates with pyright and csharp-ls

TASK-367.14 measured pyright 1.1.412, basedpyright 1.39.8 and csharp-ls 0.28.0
on 2026-10-06, each from nixpkgs in a scratch shell. Nothing was added to the
repository. A scratch script ran the real `checkCode` over a temporary vault
with one board, with `language-servers.json` naming each server in turn.

What pyright does:

- It asks the client for its configuration (`workspace/configuration`, the
  sections `python` and `pyright`) after `initialized`, and lists the project's
  files after that. A question about a file that it has not opened, asked
  before it has listed the files, gets `null`. On Flask that was the first
  question, about 60 ms after the start. An opened file is answered once its
  configuration has come. So the Python row opens each file once.
- With `python.pythonPath` naming `.venv/bin/python` of the checkout,
  `BadRequestKeyError` in `app.py` resolved to `werkzeug/exceptions.py` in
  that environment's `site-packages`. Without it, the answer was empty: the
  `python` on the `PATH` had no Werkzeug.
- Its outline lists a function's parameters under the function, on the line
  of its name. The outline rule took the innermost symbol on that line, a
  parameter, and called the function unknown. It now takes the symbol whose
  name starts where the definition does.

Flask 3.0.0 (`735a470`), with a `.venv` that held its dependencies, had a board
of nine parts bound to symbols of `ctx.py`, `helpers.py`, `sessions.py` and
`templating.py`. One relationship was anchored at
`session_interface.open_session` in `ctx.py`. The pass asked three questions:
two candidates that join two parts, and the anchor. One process ran a cold pass
and five warm passes for each table, at a load average of about 7.

| Run                     | Cold   | Warm          | Findings                                           |
| ----------------------- | ------ | ------------- | -------------------------------------------------- |
| No server for Python    | 181 ms | 81 to 94 ms   | two `RELATIONSHIP_UNDRAWN` information (candidate) |
| pyright-langserver      | 506 ms | 427 to 443 ms | the same two as warnings (resolved)                |
| basedpyright-langserver | 537 ms | 450 to 654 ms | the same two as warnings (resolved)                |

So pyright adds about 350 ms to each pass on Flask: its start, and the
analysis of the three files it opened. The run with no server said
`language-server-missing` once. No pyright process was left after any run.

What csharp-ls does:

- csharp-ls 0.28.0 needs .NET 10. With the .NET 8 SDK on the `PATH` it exits
  at once, and the check says `language-server-failed`.
- It asks for the `csharp` section after `initialized`.
  `solutionPathOverride` names the solution that it loads. The first question
  waits until it has loaded the solution, about 2.3 s for two projects. It
  answers about files that it has not opened.
- It resolved a member that a base class declares (`Audit` in a subclass of
  `Ledger`), a member through a value (`_ledger.Post`) and an extension method
  (`_ledger.Close`).
- Its MSBuild evaluation wrote design-time files under each project's `obj`
  (`AssemblyInfo.cs`, an `.editorconfig`). It compiled nothing and restored no
  package, but it runs the project's targets up to the compiler (the review
  below).
- The Roslyn language server (roslyn-ls 5.11.0) loads nothing until the client
  sends its `solution/open` notification. It answers `null` until it sends
  `workspace/projectInitializationComplete`, and by default it runs
  `dotnet restore`, which reaches the network. So the check does not support
  it.

A two-project solution (`Shop.App` references `Shop.Core`) had a board of five
parts. A relationship from the `AuditedLedger` part to the `Ledger extensions`
part was anchored at `Post`, which `Ledger` declares.

| Run                             | Pass              | Findings                                                     | Skipped                   |
| ------------------------------- | ----------------- | ------------------------------------------------------------ | ------------------------- |
| No entry for C#                 | 83 to 218 ms      | two `RELATIONSHIP_UNDRAWN` warnings                          | `language-server-missing` |
| csharp-ls, with `Shop.sln`      | 2,659 to 2,808 ms | the same, and `ANCHOR_MISMATCH` warning (resolved) on `Post` | none                      |
| csharp-ls, `.csproj` files only | 2,812 ms          | the same as with `Shop.sln`                                  | none                      |
| csharp-ls, no project file      | 207 ms            | the two warnings                                             | `language-server-unready` |

The server names `Ledger.Post` as the definition of the anchor's `Post`,
outside both ends. The C# lookup cannot reach a member that a base class
declares. The cost is the solution load, which every pass pays again because
no answer is kept from one pass to the next.

The independent review of TASK-367.14 ran the same servers from nixpkgs on
2026-10-06 through the check's own session, in scratch checkouts. A probe
interpreter wrote a mark each time it ran.

- basedpyright 1.39.8 runs `.venv/bin/python` of its workspace by itself when
  the client names no interpreter, `venvPath` or `venv`. A checkout that
  committed `.venv` had its interpreter run three times, although the check
  did not name it. pyright 1.1.412 has no such fallback: it runs the `python3`
  on the `PATH`. Both remove the working directory from `sys.path` before
  their script imports `json`, and pass `-I` only to read the version.
- The check also named an interpreter that Git tracks in three other ways: an
  untracked `.venv` link to a tracked directory, a committed `.Venv` on a disk
  that ignores case (`git ls-files -- .venv` lists nothing for it when
  `core.ignorecase` is set), and any `.venv` when Git could not list the
  checkout. Now the check asks Git about the real places of the directory and
  of the interpreter, in any case, and a checkout whose `.venv` holds an
  interpreter that it does not name starts no Python server. Afterwards each
  of these runs started no server, and only an ignored `.venv` made on the
  machine ran its interpreter.
- A `pyrightconfig.json` or `[tool.pyright]` cannot name an interpreter: it
  names a `venvPath` and `venv`, whose `site-packages` pyright reads as files.
- csharp-ls 0.28.0 ran a target that a project hooks before `CoreCompile`: its
  `Exec` ran `touch`. A property function cannot write a file during
  evaluation: MSBuild allows only reading members of `System.IO.File`, and the
  project failed to load. A `PackageReference` with no assets file was not
  restored and reached no network. A project whose `Sdk` names
  `Microsoft.Build.NoTargets/3.7.56` made MSBuild try `api.nuget.org` over
  HTTPS 24 times in a network namespace with no route, which cost 13.6 s.
- roslyn-ls 5.11.0, named in the `csharp` entry, answered an empty list, so
  the use stayed a candidate and no skip said why.

#### Resolving C, C++ and Objective-C candidates with clangd

TASK-367.15 measured clangd 21.1.8 (nixpkgs `clang-tools`) on 2026-10-06 in
scratch checkouts, at a load average of 3 to 7 on 24 cores. Nothing was added
to the repository. A scratch script ran the real `checkCode` over a temporary
vault, with the table naming clangd or turning `c` off.

What clangd does:

- It refuses a question about a file that it has not opened (`trying to get
  AST for non-added document`), so the row opens each file. A definition
  request sent at once after `didOpen` waits until clangd has parsed the file:
  on Redis `db.c` the answer came 80 ms after the open, after the preamble of
  `server.h`. So no settle request is needed for the parse.
- It takes a file's language from its compile command, not from the
  `languageId`: a `.h` opened as `c`, `cpp` or `objective-c` gave the same
  outline and the same answer. A header gets the command of a source file
  beside it.
- With the background index off, an answer depends on which files the pass
  opened before. `ledger_post` in `main.c` named the declaration in
  `ledger.h` until `ledger.c` had been opened, and then named the definition
  in `ledger.c`. Closing `ledger.c` did not undo that. `--index` is an
  obsolete flag that turns nothing off. So the check keeps the background
  index on, which indexes every file that `compile_commands.json` lists before
  it answers.
- The background index is written into `.cache/clangd/index` beside the
  database it reads. With `--compile-commands-dir` naming a directory of the
  server's own that holds a copy of the database, the index was written there,
  and nothing was written into the checkout or into `~/.cache/clangd`.
  clangd reports the index as the work-done progress
  `backgroundIndexProgress`: a begin, a report `0/1` for the task that lists
  the database, a report `0/N`, and an end once every file is indexed. The
  check waits for that end after its first open. A database with no command,
  or one that is not valid, starts no index and reports no progress, so such
  a database is `language-server-unready`.
- Index time: Redis (`7f44037`, 303 commands from `bear -- make`) 1.4 to
  1.6 s, at low or normal thread priority alike; libuv (`954c1d1`, 35
  commands from CMake) and leveldb (`7ee830d`, 39 commands) about 0.1 s.
- Objective-C on Linux, with `-x objective-c -fobjc-runtime=gnustep-2.0` and
  no SDK: a send to a method that a superclass implements, a send to `super`,
  a send to an `id` and `[[Ledger alloc] init]` each named the
  `@implementation` method in another `.m` file. A file that imports a
  missing `<Foundation/Foundation.h>` was parsed past the import. clangd's
  outline puts an Objective-C method's name at its sign (`-`), while a
  definition answer names its first selector part, so the outline rule
  accepts a method whose sign starts the line.

What clangd runs, loads and writes, measured with a database whose commands
name a script as the compiler, `-fplugin=`, `-Xclang -load`, `-fpass-plugin=`
(each a library that writes a mark when it loads), `-MD -MF`, `-o`,
`-save-temps`, `-ftime-trace`, `--serialize-diagnostics`,
`-fcrash-diagnostics-dir` and `-fprofile-instr-generate`, each pointing into
the checkout:

- Without `--query-driver` it never ran the compiler script, in `--check`
  mode, as a server or while it indexed.
- It loaded no plugin. clang loads plugins when it runs its own front end,
  and clangd parses without it.
- It wrote none of those files.
- It did write the module cache that `-fmodules-cache-path` names, into the
  checkout, for an Objective-C file that imports a module (`@import Base;`).
  So the copy of the database drops each `-fmodules-cache-path` and adds one
  in the server's own directory.
- A `.clangd` file in the checkout and `~/.config/clangd/config.yaml` were
  both loaded by default. A `.clangd` can add flags, turn the background
  index on, load an index file from any path and name a remote index server,
  which a clangd built with remote index support reaches over the network.
  This build has no remote index support (`Features: linux`), so that part
  is read from clangd's documentation. `--enable-config=false` loaded
  neither file. There is no flag that turns off only the project's file.
  `-fplugin=` added through `.clangd` loaded no plugin either.
- A repeated flag is allowed, and the last one wins: `--log=error
  --log=verbose` logged verbosely. So the check adds its flags after the
  `args` of an entry, and they win.
- On NixOS only the compiler wrapper knows where the C and C++ standard
  headers are. Without `--query-driver`, clangd parsed leveldb's
  `db_bench.cc` without `<atomic>` and `<cstdio>`, and `DB::Open` stayed a
  candidate.

The real `checkCode`, warm passes in one process:

| Checkout and board                              | No server | clangd            | Moved from candidate or no evidence to resolved                                                                                                                                                              |
| ----------------------------------------------- | --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| libuv, 8 parts in `src` and `src/unix`, 4 edges | 92 ms     | 555 to 772 ms     | `uv__io_start` (anchor of Stream to Core) now holds; four undrawn warnings and one backwards: `uv__socket`, `uv__close` and others in `core.c`, `uv__write_cancel` in `stream.c`, `uv__tcp_close` in `tcp.c` |
| libuv with `build/` moved away                  | 93 ms     | 93 ms             | none; `language-server-unready` once for the checkout                                                                                                                                                        |
| leveldb, 8 parts, 4 edges                       | 93 ms     | 283 to 482 ms     | `WriteBatchInternal::Append` (anchor of DBImpl to WriteBatch) now holds; `Env::Default` in `env_posix.cc` became an undrawn warning                                                                          |
| Redis, 8 parts, 3 edges                         | 146 ms    | 3,080 to 4,207 ms | `LFUDecrAndReturn` (in `evict.c`) and `clusterPromoteSelfToMaster` (in `cluster_legacy.c`) anchors now hold; five more undrawn warnings, such as `emptyData` and `selectDb` in `db.c`                        |
| Objective-C sample, 4 parts, 3 edges            | 98 ms     | 132 to 226 ms     | the anchor `balance`, sent to an `id`, is judged at `Ledger.m` (a mismatch warning)                                                                                                                          |

Each moved finding was read against its source line: every function named is
defined in the file of the part that the evidence reaches. Before clangd, a
use that an include led only to a declaration in a header whose own source
file does not define it was a candidate, and where that header was the using
part's own pair, it was no evidence at all. Redis declares nearly everything
in `server.h`, so its passes ask many such uses, which is most of the 3 s.
Every pass left no clangd process and no temporary directory, and `git status
--ignored` showed nothing new in any checkout.

The review of TASK-367.15 ran clangd 21.1.8 through the check's own session
on a scratch checkout, under `strace -f`, which listed each program started
and each file opened for writing. It read the clang 21.1.8 sources of the
driver and of clangd. It found that the flags above did not keep clangd from
running code of the checkout:

- clang's driver runs a program to find the GPU when a CUDA, HIP or OpenMP
  command asks for the `native` one (`getSystemGPUArchs` in
  `ToolChains/Cuda.cpp` and `ToolChains/AMDGPU.cpp`, the only programs that
  the driver runs before it compiles). A script of the checkout ran 1 to 6
  times for one command when the command named it with
  `--nvptx-arch-tool=` or `--amdgpu-arch-tool=`, or put it in a `-B`
  directory, in a `--cuda-path`, or beside the compiler that the command
  names. It also ran for `-mcpu=native` on an AMD GPU target, for
  `-march=native` on an NVIDIA target, and for an OpenMP target with no
  architecture. It ran when a response file held the flags, when a driver
  configuration file beside the compiler (`clang.cfg`) held them, and when
  `--config` named such a file. A `-sectcreate` at the end of a command took
  the next three arguments as its values. So a flag that the copy added at
  the end was lost, and the command's own program ran.
- `CLANGD_FLAGS=--query-driver=**` in the environment ran the compiler that
  a command names.
- `-Xclang=-fmodules-cache-path=` and a response file that holds
  `-Xclang -fmodules-cache-path=` each made clangd write the module cache
  into the checkout. `-Wp,` and `-Xpreprocessor` did not.
- clangd wrote its preambles (`preamble-*.pch`) and the driver's
  `toolchain-program-*.txt` into the system's temporary directory. They stay
  there when clangd is killed.

The copy of the database now drops every response file, `-B`, `--prefix`,
`--config`, and every argument that names a module cache or a GPU program in
any spelling. It also drops everything from `--` on, which clangd replaces
with the file. It moves a compiler named with a directory into the server's
own directory under the same name. Right after the compiler it puts its own
module cache and a GPU program that does not exist, spelled `/clang:` for
clang-cl. clangd starts with `TMPDIR` and `XDG_CACHE_HOME` set to the
server's own directory, and without `CLANGD_FLAGS`. After the fix, the same
30 commands ran nothing of the checkout. clangd tried the missing GPU program
and failed. Every file that clangd wrote was in the server's own directory,
`git status --ignored` was clean, and nothing new was under `~/.cache`.

The readiness of a database, measured through the session: no database, a
database `[]`, one that is not valid JSON, and one whose link leads outside
the checkout were each said once, with no server and the candidates kept.
A database in `build/`, which Git ignored, was read and answered. A
`compile_flags.txt` alone counts as no database. A database that lists only a
file that no longer exists still ended its index progress, after 52 ms.

The real `checkCode` after the fix gave the same findings on the libuv,
leveldb and Redis boards above. Redis took 3,125 to 3,238 ms warm, and 170 ms
without clangd.

What the index costs, on 24 cores: LLVM 21.1.8, configured with CMake for the
X86 target only and not built, so some generated headers were missing, lists
2,283 commands. Its index took 53.8 s, longer than the 30 s that the check
waits, so such a checkout fails once in each pass, after 30 s, and keeps its
candidates. The 168 commands of `llvm/lib/Support` alone took 0.93 to 0.96 s.
The cost stands for now, and INSTALL.md states it. With an index of only the
files that bound code holds, a checkout as large as LLVM can answer. But the
code check must then give the session the files of every board's bound code.
It also changes answers: an anchor whose definition is in code that no part
binds then reads as its declaration. And a file that the pass opens adds its
definitions, so the order of the questions matters again for that code.

Limits that the review left:

- A selector part is asked at the first word on its line that a colon
  follows. In `c ? post : 1; [ledger post:2];` that is the `post` of the
  conditional.
- clangd before version 16 has no flag that names the GPU program. The other
  measures still apply, so it runs only a program on the `PATH` or in clang's
  own directory.

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

| Source                 | What the check reads                                                                                                        | Evidence                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terraform and OpenTofu | `.tf` and `.tofu` files, statically: resources, data sources, modules, variables, outputs and the references in expressions | a call, configured path, permission or provisioning by the rules of AWS, Google Cloud, Azure and Kubernetes; a configured path for any other provider |
| Kubernetes             | manifest YAML, and Helm or Kustomize output given as files                                                                  | service selectors, Ingress and Gateway routes, network policies, environment values that name a service                                               |
| docker-compose         | compose files and their override files                                                                                      | `depends_on`, links, networks, environment values that name a service, shared volumes                                                                 |
| Nix                    | `flake.lock` (JSON), `flake.nix` outputs, derivation inputs                                                                 | build dependency                                                                                                                                      |

A part binds to a resource address as it binds to a code symbol. Examples are
`module.checkout.aws_lambda_function.api`, `Deployment/checkout` and
`packages.x86_64-linux.archboard`. The `symbol` field of a binding holds either
(ADR 0046).

A Terraform module is a directory, so a binding's path names a root module and
its symbol an address in that root's address space (TASK-367.17). The check
reads the root module and every local module that it calls. Each call gives
its instance of the module addresses of its own:
`module.checkout.aws_lambda_function.api`. A reference reaches its address
through the variables, module arguments, outputs and local values that pass
the value on. So a function that names `module.queue.url` reaches the queue
that the output `url` of that module names. It never fetches a remote module
and never reads the copy that `terraform init` keeps under `.terraform`. An
address inside a remote module is skipped as `module-not-read`, unless a plan
JSON that an agent names with `--plan` fills that module in. Without a plan,
the call of a remote module reaches what its arguments name. No code of the
module is read to take their values further. The configuration on disk decides
every module that the check reads, so an older plan never brings back a
declaration that the files removed.

Nix says nothing about run time. It shows software dependencies that are not
explicit anywhere else: flake inputs, and the packages that a derivation is
built from.

The check reads a flake without evaluating it (TASK-367.21). `flake.lock` is
JSON. Each input of its root node is build-dependency evidence of the flake,
at the line that names the input. The inputs of an input are not the flake's.
An input reaches code that the check reads only where it is a path in the same
checkout, and then it reaches the part bound to that flake. `flake.nix` is
parsed with the Nix grammar, and a static reading gives each output by its
attribute path. The reading follows attribute sets, `let ... in`, `with`, the
functions that the file writes and applies, `//` and `++`. It also follows the
library functions that flakes use to give outputs for each system: `genAttrs`,
`mapAttrs`, `foldl'`, `recursiveUpdate`, `optionalAttrs`, flake-utils'
`eachSystem` and `eachDefaultSystem`, and flake-parts' `mkFlake`. A list of
systems that it cannot read gives the name `*`, which stands for each system.
flake-utils' default systems are such a list, because a flake can change them
through its `systems` input. Everything else is unknown at its lines: an
outside or unknown import, a builtin, an `if`, the value of an input. A default, `a.b or c` or
a formal's `? c`, stands only where the reading is sure that the name is
absent. Each expression, name or item that the reading reads spends one of
200,000 steps, and it nests at most 400 deep. A name below an unknown
expression, or one that the reading did not reach, is skipped as
`expression-not-followed`, never reported missing. The reading stops
where the flake schema names an output, such as `packages.<system>.<name>` or
`overlays.<name>`, because what a derivation or a module holds is not an
output. Only an overlay goes one name deeper: its packages are outputs
`overlays.<name>.<package>`. Literal local paths given to `import` and
`callPackage` are read through the checkout boundary, including a directory's
`default.nix`; outside paths and outside symlinks remain unknown. Imported
expressions share the flake's 200,000-operation budget. Other `.nix` files
are independently read as text.

The same reading gives the build dependencies between the packages of a flake
(TASK-367.22). A derivation is a call of `mkDerivation`, `buildGoModule`,
`buildPythonPackage`, `buildPythonApplication`, `buildRustPackage` or
`callPackage`. The reading knows each by the last name of the selection, where
the flake does not bind that name itself. The inputs of a
derivation are the items of its `buildInputs`, `nativeBuildInputs` and
`propagatedBuildInputs`. `callPackage` follows its local function with the
caller's package scope and explicit arguments and reads the function's actual
build inputs. If the function cannot be read, explicit arguments remain
candidate inputs and the other inputs remain unknown. An input
whose value is another output of the flake is build-dependency evidence. It
goes from the output that is built to the output that it names, at the line
that names the input. The reading compares values, not spellings. So
`self.packages.${system}.lib` reaches the output whose value it is. A name that
a `let` binds, an `inherit`, a `callPackage` argument and an overlay's
`final.lib` do the same. `self` is the flake's own outputs. An overlay is applied to a
`prev` whose names are unknown, and to a `final` that adds the overlay's own
packages. A derivation that is no output, such as a helper that a `let` builds,
passes on its inputs. The check knows an output by its lines. So a build
dependency is evidence only where no other package shares two sets of lines:
the line that names the input, and the lines of the output that it names. The
same package under another name, or for another system, can share them.
Where another package shares them, as in `inherit core lib app;` on one line,
the dependency is unknown at that line. What the reading cannot follow is
unknown at its lines. That is an input that is a package of nixpkgs or of
`prev`, or a set merged with such a package. It is also an outside or unknown
file that `callPackage` names. A skip quotes the imported expression's own
file and lines while its ownership remains the flake output. If an output is no derivation that the reading knows,
such as a shell that `mkShell` makes, it is unknown too. Such an expression
can hide a build dependency on another output of the same flake. Take a
relationship with no anchor whose kind accepts build dependencies, and that
no evidence supports. If its start holds such an expression and its end
holds an output of the same flake, the check skips it as
`expression-not-followed`. It never reports it unsupported. Each input, each
output that an input names, and each line of each output spends a step.

A Kubernetes manifest is a `.yaml` or `.yml` file with a document that has an
`apiVersion` and a `kind` (TASK-367.19). The check reads other YAML files as
text. Helm gives the names in a template only when it renders it. So a
manifest that does not parse, or that writes a Helm action (`{{ ... }}`) where
YAML expects a value or in a name, is one part whose names are unknown. Its
symbols are skipped as `expression-not-followed` and never missing. A Go
template that a manifest holds as quoted text or in a block scalar, such as a
Prometheus rule's, is no Helm action. Each object is addressed as kind
and name, `Deployment/checkout`, without its namespace: a namespace that
`kubectl -n` or Kustomize gives is in no file. An Ingress backend and a
Gateway API route's `backendRefs` are calls to a Service. These are configured
paths: an environment value whose host is a Service (`cart`, or
`cart.<namespace>.svc` with or without the cluster's domain), and the
ConfigMap, Secret or claim that a pod reads. A name resolves to the nearest
manifest that declares it: the same file, its directory, then the directories
one step further away. Where two manifests at the nearest step declare it,
such as the copies of two environments, it resolves to neither, because the
check cannot tell which one the cluster holds. A selector names no address, so the check joins
objects by labels. A Service is a configured path to each workload whose pod
labels its selector matches. A NetworkPolicy is a permission from each
workload that it lets send to each workload that receives. A reference to a
Service that no part binds reaches the workloads that the Service picks, so a
board can draw only its workloads. Of a Secret, the check reads the names of
its keys and never a value. `envFrom` passes those names, and a ConfigMap's,
on to the workload.

A compose file is one that compose finds by itself in a directory:
`compose.yaml`, `compose.yml`, `docker-compose.yml` or `docker-compose.yaml`,
in that order of preference. Then compose merges the first override file over
it: `compose.override.yml`, `compose.override.yaml`,
`docker-compose.override.yml` or `docker-compose.override.yaml`. The check
merges in the same order (TASK-367.20), and the YAML documents of one file in
their order. An override adds dependencies, links and networks to those of the
base. Its environment value replaces the base's value of that name, its mount
of any kind the base's mount at that target, and its `network_mode` the
base's, and the replaced entry is no evidence. A part bound to a service owns
the service's block in each file and YAML document of the project. A file that
only `-f` names, such as `compose.prod.yaml`, merges as a command says, and no
file records that command. So the check reads such a file as text.

If the host of an environment value is the name, `container_name`, `hostname`
or network alias of a service, the value names that service. The host comes
after a scheme or a user, or before a port. A bare word counts only under a
name that ends in `HOST`, `HOSTS`, `HOSTNAME`, `SERVER`, `SERVERS`, `ADDR` or
`ADDRESS`, such as `REDIS_HOST: redis`. A host with a dot names a machine
outside the project. An interpolation in any value takes the default that the
file writes (`${API_HOST:-api}`). The check never reads the shell or the
project's `.env` for it. Of a compose file's values, the check keeps only the
host that it reads as an address. An env file (`.env`, `<name>.env`) is a
format of its own, which dotenv libraries and Kustomize read too: its adapter
gives the names that it sets and never a value.

The strongest result joins code and infrastructure (TASK-367.23). The code
reads `QUEUE_URL`, and the infrastructure sets `QUEUE_URL` for that code to the
address of a queue. Together they prove a relationship across a network hop,
which no code analysis can prove alone. A read is an environment name in a
file that a language adapter reads. A setting is an environment name in
infrastructure. In compose, it is in a service's `environment`, or in an env
file that the service names. In Kubernetes, it is in a workload's `env`, or in
a ConfigMap or Secret key that `envFrom` passes on. In Terraform, it is in a
resource: a map under `variables` in an `environment` block, an
`environment_variables`, `runtime_environment_variables` or `app_settings`
map, or an `env` block with a literal `name`.

Infrastructure runs code in two ways. First, a compose service runs the code
of the directory that it builds. That is its build context. If the context is
the directory of the compose file, it is the directory of its Dockerfile, as
a monorepo builds each service from its root. The deepest build that holds a
file runs it. Second, a declaration runs the code of a part that the board
draws inside a part bound to it. A Kubernetes workload's image, a Lambda
function's archive or an image built elsewhere names no directory, so the
board must say it. A value reaches the parts whose code the named declaration
runs, by the same two rules. Otherwise it reaches the part that owns that
declaration. In Kubernetes, a Service that no part binds leads to the
workloads that it picks. In Terraform, a value reaches what its references
reach through variables, module arguments, outputs and locals. The
read and the setting are two pieces of configured-path evidence. Both go from
the part that reads to the part reached. They are resolved where the files
leave no choice. They are candidates where the files leave one: the named
declaration runs the code of several parts, so the address does not say which
of them it reaches, or more than one runner runs the code that reads the name
and they do not set it to the same parts, as two services that build one
directory to two targets do. A candidate is never a warning, so the check
never warns a right board about a part that the address may not reach.

Some relationships have a kind that accepts a configured path, and nothing
supports them. For such a relationship, `RELATIONSHIP_UNSUPPORTED` says which
side has no evidence in `missing`. Take a value that the infrastructure sets
to the address of the end, for the code of the start. If that code reads none
of those names, `missing` is `code`. If the code of the start reads names that
nothing sets for it, `missing` is `infrastructure`.

### Safety

The check reads files only. It never reads Terraform state, because state holds
secrets in plain text, and the Archboard server has no authentication. It never
runs `terraform plan`, `kubectl` or `nix eval`, because these need credentials,
reach the network or run code. A plan JSON that CI already produced is an
optional input that an agent names with `--plan`, inside a registered
checkout. The check reads only the addresses and references of its
`configuration`, never a value. The difference between the infrastructure code
and the live cloud stays the job of `terraform plan`.

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
