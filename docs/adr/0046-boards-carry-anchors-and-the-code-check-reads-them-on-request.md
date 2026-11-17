---
status: accepted
---

# Boards carry anchors, and the code check reads them on request

Canonical modules and source-owned relationships supersede board-owned claims below. Existing code inspection algorithms retain binding and anchor evidence.
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Accepted on 2026-10-06 for TASK-367.02 after an independent review.

Amended by TASK-433 (2026-10-07): a language server that can run code of a
checkout runs only where the agent that works in that repository configured it.
Then it runs as an editor runs it. This replaces the default servers of
TASK-367.14 and TASK-367.15. It also replaces the guards that made those
servers safe to run in a checkout that nobody agreed to run.

The old design had two problems:

- Every guard changed what the server did. So a server did not behave as it does
  in the user's editor, and the list of dangerous compiler flags was never
  certain to be complete.
- clangd rebuilt its index on every pass. That took 3.1 s per pass on Redis, and
  the pass failed on LLVM.

The decision has these parts:

- Python, C, C++, Objective-C, C# and Swift have no default server. pyright is
  no safer than the others, because it runs the interpreter of the checkout's
  `.venv`.
- Rust (TASK-540) has no default server either. rust-analyzer runs
  `cargo metadata`, the build scripts and the procedural macros of the
  workspace, and `cargo check` after it loads, so it runs the code of the
  repository.
- Go (TASK-575) has no default server either. gopls runs the go command, which
  can download modules and the toolchain that a `go.mod` names, and runs the C
  compiler for a package that uses cgo.
- A configured server runs with exactly its command, its arguments and the
  environment of the Archboard server, in the directory of its project. The check
  no longer changes what clangd reads or writes.
- TypeScript needs no configuration. The check runs the native
  `tsc --lsp --stdio` of the `typescript` package that the checkout installs.
- This replaces the rule that no TypeScript of the checkout runs. The program is
  code of the checkout. The owner decided that it runs without configuration,
  because the checkout installed it for its own editor (TASK-433 #8).

Amended by TASK-579.12 (2026-11-05): TypeScript is a language a checkout can
configure (`archboard repo language-server typescript <command>`), and a
configured server wins. A release ships no TypeScript (ADR 0076), so it
looks for none, and the check says `language-server-missing` with the command
that configures a server.

Amended by TASK-579.13 (2026-11-05): a checkout on TypeScript before 7 runs
`typescript-language-server` without configuration. The default for a checkout
with no configured server is now, in order:

1. The checkout's own native `tsc --lsp --stdio` of TypeScript 7 or later.
2. For the checkout's own TypeScript before 7 whose `lib/tsserver.js` is inside
   the checkout: `typescript-language-server --stdio`. The check takes it from
   the checkout's `node_modules/.bin` when its links resolve inside the
   checkout. Otherwise it takes it from the `PATH` of the Archboard server.
   The initialization option `tsserver.path` names the checkout's
   `tsserver.js`, so the server never runs a TypeScript that it finds itself.
3. Only in a checkout of Archboard: Archboard's own `tsc`.

The decision has these reasons:

- It runs no other class of code than the rule of TASK-433 #8. The code of
  the checkout that runs is its own TypeScript, which the checkout installed
  for its own editor. `typescript-language-server` itself is a program of the
  checkout, under the same rule, or a program that the user installed on the
  machine.
- `tsserver` loads each plugin that `tsconfig.json` names from the checkout's
  `node_modules`. This was measured with TypeScript 5.9.3 and
  typescript-language-server 6.0.3. `tsc --lsp` of TypeScript 7.0.2 loads
  none. This adds no power to the checkout: whoever can put a plugin in
  `node_modules` can also change `tsserver.js`.
- The check sends `disableAutomaticTypingAcquisition: true` to the server that
  it chose. Otherwise `tsserver` runs npm to download type packages for a file
  that no `tsconfig.json` holds. That reaches the network, and no answer of
  the check needs it.
- The repository's own compiler answers. Archboard's TypeScript 7 can resolve
  modules and types differently from TypeScript 5, and a release has none.

Amended by TASK-599 (2026-11-08): a repository names its language servers in a
committed file, `.archboard/language-servers.json` at the root of its checkout,
and the check reads it with no trust step. This replaces the machine-local,
per-checkout configuration in `repos.json` of the TASK-433 amendment. It also
replaces the rejected alternative "Language server commands in the vault
configuration or in a checkout" for the checkout. It replaces the safety
sentence that a server runs only where the agent that works in that repository
configured it.

The decision has these parts:

- The file maps a language (`typescript`, `python`, `csharp`, `swift`, `c`,
  `rust` or `go`) to a `command` and optional `args`. The check reads the file
  in every checkout that it reads, registered or not.
- A relative command in the repository file, a path with a `/` that is not
  absolute, is a path from the checkout root. So a repository can commit a
  wrapper script. Every machine reads the repository file, so a path that leaves
  the checkout, absolute or relative, makes the file invalid.
- A global file, `language-servers.json` in the state directory beside
  `repos.json`, names a server for each language that the repository file leaves
  out. The repository file wins for each language. `ARCHBOARD_REPOS` moves both
  files. The command in the global file is a name on the `PATH` or an absolute
  path, because the file has no checkout to read a path from.
- The registry holds no servers.
- A server still runs with exactly its command, its arguments and the
  environment and `PATH` of the Archboard server, and it runs code of the
  repository as an editor does.

The decision has these reasons:

- The owner decided on 2026-11-08 that a repository already comes with commands
  to run, such as its build and its tests. A server command that the repository
  commits is the same kind of command, so it needs no trust step. The
  TASK-433 reason for the opt-in, that a repository did not choose to run the
  server, does not hold for a command that the repository itself names.
- Setup for each machine and for CI was the cost. A repository that installs its
  servers through nix, devenv or devbox has them on every machine and in CI, yet
  every machine and every worktree still needed `repo language-server`. This
  repository worked around that with a `bun install` hook (TASK-584). A committed
  file makes the check the same everywhere.
- The registration of a machine and the file of a repository must not be two
  separate things. With the file in the checkout, an unregistered checkout needs
  no registration to get its servers.
- The vault configuration stays rejected. A vault spans repositories, and a
  server belongs to one repository.
- The machine keeps a place for a command that no repository names: the global
  file.

Amended by TASK-526.01 (2026-10-24): `archboard check code` runs the code check,
and `archboard check` and `archboard check all` run it after the semantics
check. The option that once asked for the code check is removed, with no alias,
and what this ADR calls the plain check is now `archboard check semantics`.
The route that the panes poll stays the semantics check, so a pane never starts
a pass. The other decisions of this ADR hold.
[ADR 0057](0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md)
decides the split.

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

## Decision

### The anchor

A relationship and a flow step each accept one optional `anchor`. It has three
fields. Each one is required, in the input as in the board, as on a binding.

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
anchor never marks a relationship or a step as changed. An anchor has no id of
its own. It belongs to its relationship or step.

### The binding symbol

A binding accepts one more optional field, `symbol`.

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

### How relationship kinds accept evidence kinds

Each relationship kind in the vault configuration can name the evidence kinds
that it accepts, under a new key `evidence` (ADR 0024).

A kind without the key accepts every evidence kind. The check then never judges
the evidence kind of its relationships. An unknown evidence kind makes the
configuration invalid, and the plain check reports it as it reports every
invalid configuration (ADR 0026).

The default vocabulary carries the key for its kinds.

### What the check judges

Three things make a finding a warning:

- The code contradicts what the board states.
- The check is sure of it. The check is sure of a name that is absent from a
  file, and of resolved evidence.
- A right change to the board or the code clears it.

Every other finding is information. Information means here what it means in
ADR 0045: it changes no exit status.

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

Each board owns its content (ADR 0023), so the check never joins parts on two
boards.

### Which variants the check reads

The check reads the current variant of every board. A board with no current
variant has nothing built, and the check skips it (ADR 0031).

`--variant <name>` names a draft. Every board that has a draft of that name is
read at that draft, and every other board at its current variant.

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

The check skips what it cannot read, and the answer names the reason.

A skipped subject gets no finding and changes no exit status. A subject that the
check did not read must never look like a subject with no findings. So the
answer lists everything that the pass skipped, with the reason.

### The command, the route and the answer

The CLI asks the plain check's route and then `GET /api/vault/code-check`, a
route of its own. A pass changes nothing, so the route is a `GET`. The pass runs
in the Archboard server as checkout work
(`src/server/archboard/lib/checkout-work.ts`), the admission that the code
opener already uses. A caller that disconnects cancels the pass. A stop cancels
it and waits for it to settle, so a stop never waits on a long pass and never
refuses because of one. Before a pass settles, it stops every language server
that it started. `/api/vault/check`, which every open canvas polls, never runs
a pass.

A pane never starts a pass (TASK-367.24). For the pane, the server keeps the
findings of the last pass in its memory, and never in a file.

### The shape of a finding

A finding has the shape of a vault diagnostic. It reuses the diagnostic's
`code`, `file`, `path`, `board`, `variant`, `subject` and `message`. `file` and
`path` say where in the board the subject is, as on every diagnostic. Its
`severity` is `warning` or `information`, never `error`. One more field,
`evidence`, lists what the finding rests on.

A finding quotes a symbol, a path and a line. It never quotes other text from a
file. A file can hold a secret, and the Archboard server answers any request
from this machine with no authentication.

The amendment of 2026-11-07 makes one exception: the source excerpt of a
remembered piece of evidence.

### Exit status

The exit status follows `archboard check`. If the plain check has a diagnostic
or the code pass has a warning, the command exits 1. Otherwise it exits 0.
Information never changes it.

### The cache

Code facts are cached by file content. The Archboard server keeps one entry in
memory for each file that a pass read: the hash of the bytes that it read, and
their facts. Each pass reads and hashes every file again. If the hash matches,
the pass takes the facts from the entry. Otherwise it parses the file and
replaces the entry. So a pass always sees an edit, an uncommitted one too, and
the cache never holds more than one entry for a file.

The answers of a language server are not cached from one pass to the next.

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
parsed, and need no grammar.

A part of a file that did not parse holds no facts. The check skips a symbol
that it finds only there, and never reports it as missing. Tree-sitter recovers
from an error and parses the rest of the file.

### The packages

Each grammar is the upstream release of a tagged grammar, so a query is written
against a known tree. Swift and Nix come from `@lumis-sh`, because no upstream
publishes them on npm. Both are built from the exact upstream tag (TASK-367.01).

They are runtime dependencies, pinned to exact versions. A grammar
release can rename the nodes that a query names, so an upgrade is a task of its
own that runs the adapter tests. The set puts 248 MB into `node_modules`, of
which 23 MB is `.wasm`. The check loads only the `.wasm` files. None of the
packages joins `trustedDependencies`, so Bun keeps blocking their `node-gyp`
install scripts. Nothing is built at install or at run time (ADR 0014).

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
  a checkout, and the language servers that the rules above allow.

The difference between the infrastructure code and the live cloud stays the job
of `terraform plan`.

## Considered and rejected

### The anchor

- **Call the field `evidence`.** Evidence is what the check finds in the code.
  The anchor is what the author cites. One word for both gives "the evidence of
  this relationship" two meanings.
- **Call it `source`.** The start of a relationship is its source, and "source"
  also means source code.
- **Call it a binding.** A binding is the one primary code location of a node,
  and "open the code" opens it. A relationship has nothing to open.
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

### The command and the answer

- **Run the code pass inside the plain check.** Every open canvas polls it every
  5 seconds, and the skill runs it after every board write.
- **Run the pass in the CLI process.** The pane then cannot read its findings,
  and two processes each keep a cache.
- **A `POST` route under `asyncEndpoint`.** Every request other than a read
  takes a write admission until it answers
  (`src/server/archboard/lib/mutation-work.ts`). A stop waits only
  `SERVER_MUTATION_DRAIN_TIMEOUT_MS`, one second, for that admission, and then
  refuses. A pass reads and runs for seconds, so it is checkout work.
- **A finding type of its own.** It repeats the site and subject fields, and it
  needs a second line formatter. The inspector then lists two shapes for one
  subject. A finding is a diagnostic with evidence.
- **Put code findings among the plain diagnostics.** The poll then shows the
  findings of a pass from an hour ago as current, and the bell lights for them.
- **`--variant` for one board, as `<board>@<variant>`.** A task proposes on
  several boards under one name, and closes all of them at once (archboard-dev).
- **Read HEAD, not the files on disk.** An agent runs the check before it
  commits, and "open the code" opens the files on disk.

### The cache

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
- **Language server commands in the vault configuration or in a checkout.** A
  command and its place on disk are facts about one machine, and the vault and
  the checkout are shared. Archboard writes nothing into a checkout. (The
  TASK-599 amendment replaces the checkout part. The vault configuration stays
  rejected.)

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

## Amendment of 2026-10-31: a relationship between two sides stands for their calls

TASK-559.33 changes two findings.

`RELATIONSHIP_ON_CONTAINER` leaves the code check. It is now an error of the
semantic check, because a code finding cannot be an error
([ADR 0044](0044-a-containers-interface-is-what-relationships-from-outside-reach.md)).

`RELATIONSHIP_UNDRAWN` keeps its evidence, but its severity changes in one case.
Two parts meet at the children of their nearest holder, and those two children
are the sides. If a relationship or a flow step joins the two sides, the finding
is information, and it says that the relationship stands for the call. Otherwise
the severity rule above holds.

A frame end is now an error, and a relationship is not copied to give each call
its own line, so those calls have no relationship of their own. A warning for
each one asks for an import map. Removing the finding hides what the model leaves
out. Information keeps the fact and stays out of the exit status.

## Amendment of 2026-11-07: the source excerpt of remembered evidence

TASK-590.06 makes one exception to the rule that a finding quotes no other text
of a file. The owner asked for it on 2026-11-07.

A path and a line alone do not show a reader what the code does at that place.
So `GET /api/code/source-lines` answers the source excerpt of one piece of
evidence: the evidence line, with up to 3 lines before it and 3 lines after it.

A file can still hold a secret, and the server still has no authentication.
So the route keeps these limits:

- It answers only a place that a piece of evidence of the vault's remembered
  findings names, by its repository, path and line. It never starts a pass.
  So it reads only a file that a code pass of that vault read. After a
  restart, the server reads no file until somebody runs the code check again.
- It reads only a file inside a registered checkout that Git does not ignore.
  It resolves the path through `packages/code-binding/src/runtime`, as the
  code check and the code opener do. So the path stays inside its checkout
  before and after symbolic links resolve. Git must list the file where its
  links lead.
- It never quotes a file whose values the check does not read: Terraform
  state, variable files, the `.terraform` directory, an env file and a file
  that holds a Kubernetes Secret. An env file is `.env`, `.env.<name>`,
  `.envrc` or `<name>.env`. The check reads only the names in an env file and
  in a Secret, so their values stay unquoted.
- Only a page of the server's own origin reads it. The route uses the
  `settings-read` kind of the browser origin guard (`createBrowserOriginGuard`
  of `@archboard/code-opener/browser-origin`), as `GET /api/repositories`
  does. The guard refuses a request without the browser headers that prove
  that origin. It protects against a foreign page in a browser. It does not
  authenticate a local process, which can read the file without the server.

The route quotes the other text near the evidence line, also a key that
somebody wrote into the code. These limits do not prevent that.

## Amendment of 2026-11-08: the code view of Measures starts a pass

TASK-590.13 narrows the rule of TASK-367.24 that a pane never starts a pass.
The owner asked for it on 2026-11-08, after the code view of Measures said only
that no code check had read the reading.

When the code view of Measures opens on a reading, and no remembered pass read
that version of the reading, the page asks `GET /api/vault/code-check` for one
pass.

The limits of TASK-367.24 still hold everywhere else:

- Only the open code view starts a pass. The panes, the warning count and the
  inspector read the remembered findings, and the route they read on a timer
  never starts one.
- A page starts one pass for one version of one reading.
