---
status: accepted
---

# Boards carry anchors, and the code check reads them on request

Canonical modules and source-owned relationships supersede board-owned claims below. Existing code inspection algorithms retain binding and anchor evidence.
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) records this replacement.

## Context

A board makes claims about code. Evidence rule 3 of the consumer skill makes an
agent keep one line of evidence for every relationship and every flow step: the
file and the symbol that prove the mechanism. The product threw that line away,
because a relationship had no field for it.

The semantics check only tests that a bound path exists. TASK-257 found 9 of 89
bindings dead after 141 commits with no vault update. Every open canvas polls
the semantics check, so no reading of code can go there.

## Decision

`archboard check code` runs the code check, and `archboard check` runs it after
the semantics check. A pass reads code only on request.

### The anchor

A relationship and a flow step each accept one optional `anchor`: a `repo`, a
`path` and a `symbol`, each required. `symbol` is the name in that file that
proves the mechanism.

An anchor **holds** when its file is in the checkout and defines or references
its symbol. An anchor that holds **supports** its relationship or step, unless
code facts show that it proves an evidence kind that the relationship kind does
not accept, or that its symbol names a definition outside the bound code of both
ends. An anchor that supports its relationship is the author's proof. The check
does not argue with it.

The anchor stores no line. A line moves with every edit above it, so a stored
line is wrong after an edit that changes nothing about the relationship. The
check finds the line from the symbol, and never writes it into the board.

The evidence kind of an anchor is not authored. The code facts of the anchored
file decide it. An authored kind is a second answer that only the author keeps
true (ADR 0031).

On a draft, an anchor can name code that is not written yet, as a binding can
(ADR 0031). A sentence that states an intent is not an anchor, because the check
cannot hold a sentence to code.

An anchor is bookkeeping (ADR 0023). Comparison ignores it, so a better citation
never marks a relationship or a step as changed.

### The binding symbol

A binding accepts one more optional field, `symbol`: the definition that the
part stands for, spelled as its language or tool spells a qualified name. The
same field holds the address of a declaration in infrastructure or Nix. A
changed symbol is a changed binding.

### Bound code

With a symbol, the bound code of a part is that definition and nothing else in
the file. Without a symbol, the part owns the whole file or directory. Where the
bound code of two parts overlaps, the code belongs to the part with the narrower
binding.

Evidence from or to a part inside an end of a relationship counts as evidence
of that end (ADR 0044). Two parts meet at the children of their nearest holder.
A relationship or flow step that joins those two children stands for the calls
between the parts below them, so the check reports such a call as information.
Evidence never joins a part to a part inside it, and never joins parts on two
boards.

### Evidence kinds

Evidence has one of six kinds: `call`, `configured-path`, `permission`,
`import`, `build-dependency` and `provisioning`. A call is any use at run time
of a name that another part defines, including the name passed on as a value.
An import that only types use gives import evidence, never a dependency at run
time.

Each relationship kind in the vault configuration can name the evidence kinds
that it accepts, under the key `evidence` (ADR 0024). A kind without the key
accepts every evidence kind. The default vocabulary carries the key for its
kinds.

### What the check judges

[ADR 0082](0082-the-code-check-judges-module-depth-from-the-code.md) adds the verdicts of module
depth, which judge the code itself: `EXPOSED_VALUE` is a warning though the board states nothing
that it contradicts.

Three things make a finding a warning:

- The code contradicts what the board states.
- The check is sure of it. The check is sure of a name that is absent from a
  file, and of resolved evidence.
- A right change to the board or the code clears it.

Every other finding is information, and information changes no exit status
(ADR 0045).

A candidate is never a warning. A name can match an unrelated definition, and
nothing on a board can clear a false match. A warning that right work cannot
clear makes a clean check unreachable (ADR 0031, ADR 0045).

The judgement of a relationship with no anchor is always information. The
direction of a relationship kind is the vault's convention (ADR 0024), and code
does not always run that way: a subscription in code runs from the handler to
the part that sends the event. The absence of evidence proves nothing about a
call across a network, through an event bus or through a value that a part
receives. An anchor turns the relationship into a claim that the check holds to
the code, and the findings about an anchor are warnings.

The command exits 1 if the semantics check has a diagnostic or the code pass has
a warning. Otherwise it exits 0.

### Which variants and which files the check reads

The check reads the current variant of every board. `--variant <name>` reads
every board that has a draft of that name at that draft. To name a draft is to
say that its code is built now, so the check then also reports a bound path that
is missing. The check never reads a historical or a shelved variant. They are
records, and a finding on them pushes somebody to rewrite a record.

The check reads the files of each registered checkout as they are on disk, with
uncommitted edits, and only the files that Git does not ignore. A subject that
the check did not read must never look like a subject with no findings, so the
answer lists everything that the pass skipped, with the reason.

### Where the pass runs

The pass runs in the Archboard server as checkout work, behind its own `GET`
route. The route that the panes poll never runs a pass. The server keeps the
findings of the last pass in memory, and never in a file. Only the code view of
Measures starts a pass for a pane, once for a version of a reading that no
remembered pass read.

A finding has the shape of a vault diagnostic, with the severity `warning` or
`information` and one more field, `evidence`.

A finding quotes a symbol, a path and a line. It never quotes other text from a
file. A file can hold a secret, and the Archboard server answers any request
from this machine with no authentication. The one exception, at the owner's
request, is the source excerpt of a piece of remembered evidence: a few lines
around the evidence line. That route answers only a place that the remembered
findings name, never quotes a file whose values the check does not read, and
answers only a page of the server's own origin. The excerpt can still quote a
key that somebody wrote into the code near the evidence line.

### The cache

Code facts are cached in memory by file content. Each pass reads and hashes
every file again, so it always sees an edit. The answers of a language server
are not cached. Nothing writes code facts or a finding into a board, into the
vault or into any file (ADR 0015).

### The engine

Tree-sitter reads every programming language and Terraform in one way, through a
query file for each grammar. Its grammars load from `.wasm` files published on
npm, with no build step, and this repository parsed in under a second. A name
that matches is a candidate. A language server resolves a candidate to its
definition. With no language server, the check says so once and reports
candidates. Kubernetes manifests, compose files and `flake.lock` are parsed with
Bun's own parsers.

A part of a file that did not parse holds no facts. The check never reports a
symbol that it finds only there as missing.

Each grammar is the upstream release of a tagged grammar, pinned to an exact
version, so a query is written against a known tree. A grammar release can
rename the nodes that a query names, so an upgrade is a task of its own. Swift
and Nix come from `@lumis-sh`, because no upstream publishes them on npm. Both
are built from the exact upstream tag. None of the packages joins
`trustedDependencies`. Nothing is built at install or at run time (ADR 0014).

### Language servers

A repository names its language servers in a committed file,
`.archboard/language-servers.json`, and the check reads it with no trust step. A
global file beside the registry names a server for each language that the
repository file leaves out. The registry holds no servers. A server runs with
exactly its command, its arguments and the environment of the Archboard server,
and it runs code of the repository as an editor does.

A repository already comes with commands to run, such as its build and its
tests. A server command that the repository commits is the same kind of
command, so it needs no trust step. A committed file also makes the check the
same on every machine and in CI with no setup, and an unregistered checkout
needs no registration to get its servers.

Python, C, C++, Objective-C, C#, Swift, Rust and Go have no default server,
because each of their servers runs code of the checkout. TypeScript needs no
configuration. The check runs the checkout's own TypeScript, which the checkout
installed for its own editor: the native `tsc --lsp` of TypeScript 7 or later,
or `typescript-language-server` pinned to the checkout's `tsserver.js` before
that. The repository's own compiler answers, because another TypeScript can
resolve modules and types differently. A release ships no TypeScript (ADR 0076).

### Safety

Apart from `git`, to list the files of a checkout, and the language servers
above, the check reads files and nothing else.

- It reads only files inside a registered checkout that Git does not ignore. It
  tests that a path stays inside its checkout before and after it resolves
  symbolic links, as the code opener does.
- It never reads Terraform state, variable files or the `.terraform` directory,
  even where Git tracks them. They can hold secrets in plain text.
- It never reads a secret value: the data of a Kubernetes Secret, or a value in
  an env file. An env file gives names only.
- It never reaches the network or a cloud API. It turns off the automatic type
  acquisition of `tsserver`, which runs npm.
- It never runs `terraform`, `tofu`, `kubectl`, `helm`, `kustomize` or `nix`.
  These need credentials, reach the network or run code. The difference between
  the infrastructure code and the live cloud stays the job of `terraform plan`.
- It reads only the plan JSON files that an agent names with `--plan`, only
  inside a registered checkout, and from them only addresses and the references
  between them, never an attribute value.

## Considered and rejected

### The anchor

- **Call the field `evidence`.** Evidence is what the check finds in the code.
  The anchor is what the author cites. One word for both gives "the evidence of
  this relationship" two meanings.
- **Take `repo` from a binding at an end.** An end can be unbound or external,
  and evidence in infrastructure often lives in another repository. The anchor
  then moves with every new binding of a part at its end.
- **A list of anchors.** Evidence rule 3 records one line for each relationship.
  A list invites an agent to cite every call site. The check finds the other
  evidence itself.
- **A separate field for infrastructure, such as `address`.** A resource
  address and a code symbol do the same work. Two fields need a rule that says
  which one applies, and every reader must learn both.

### The mapping

- **A default by kind name, with no key.** The product then reads meaning into
  names that the consumer chose (ADR 0024). A vault that calls its event kind
  `publishes` gets nothing, and a vault that means something else by `call`
  gets the wrong rule.
- **Authored evidence kinds on each relationship.** The kind of the relationship
  already says what the author claims. A second authored kind can disagree with
  it.

### The findings

- **Make a candidate a warning.** Nobody can clear a false match. A machine with
  no language server then fails the check for names that it cannot resolve.
- **Resolve only through a language server.** A Terraform address, a compose
  service name and an import path name what they reach exactly. Infrastructure
  has no language server at all, so its findings can never be warnings.
- **Make a backwards or an unsupported relationship a warning.** An event
  relationship that is right reads as backwards in code, and a call across a
  network shows no evidence in code. The code check of every vault without
  anchors then fails on its first run.

### The command and the answer

- **Run the pass in the CLI process.** The pane then cannot read its findings,
  and two processes each keep a cache.
- **A `POST` route.** A request other than a read holds a write admission, and a
  stop waits only briefly for it before it refuses. A pass runs for seconds, so
  it is checkout work.
- **A finding type of its own.** It repeats the site and subject fields and
  needs a second formatter. A finding is a diagnostic with evidence.
- **Put code findings among the semantics diagnostics.** The poll then shows the
  findings of a pass from an hour ago as current.
- **`--variant` for one board, as `<board>@<variant>`.** A task proposes on
  several boards under one name, and closes all of them at once.
- **Read HEAD, not the files on disk.** An agent runs the check before it
  commits, and "open the code" opens the files on disk.

### The cache

- **Keep code facts on disk.** A file on disk outlives the process that wrote
  it, and a new grammar then reads the facts of the old one (ADR 0014).
- **Cache the answers of language servers.** An answer depends on every file of
  the project, not only on the two files that it names.

### The engine

- **Native tree-sitter bindings.** They compile with `node-gyp` at install, which
  is a build step (ADR 0014), and Bun blocks their install scripts.
- **External tools, such as universal-ctags, ast-grep or semgrep.** Each is a
  binary that a machine does not always have, and none covers every kind of file
  with references and visibility.
- **Language server commands in the vault configuration.** A vault spans
  repositories, and a server belongs to one repository.
- **Guards that make a server safe to run without consent.** Every guard changed
  what the server did, so it did not behave as it does in the editor, and no list
  of dangerous compiler flags was certain to be complete.
- **Grammar sets other than the upstream tags.** `tree-sitter-wasms` is built
  for an older tree-sitter that `web-tree-sitter` refuses. The whole
  `@lumis-sh/wasm-*` set builds some grammars from a branch, so a query for the
  release does not compile against it. The npm name `tree-sitter-hcl` is a
  security placeholder.
