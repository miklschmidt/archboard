# Authoring reference

Everything a node or relationship can say beyond the common recipes, and what
the CLI refuses. Fragments here go into the JSON of `semantic new` or
`semantic edit`.

## Nodes

- `order`: Layout priority among this variant's nodes. Omit it for automatic
  positions 1000, 2000, 3000, ... in the order the nodes are added. Restating
  a node by id keeps its position unless you state a new number. Lower numbers
  come first; use a number between existing values to change layout.
- `name`: One line a reader sees; unique enough to name the node in later
  payloads.
- `kind`: A key of `nodeKinds` in `config.yaml`. What the unit IS, whether it is
  drawn as a card or a container.
- `responsibility`: Clear short prose the source supports, usually two or three
  rendered lines. Newlines are optional; the renderer wraps the complete value
  without a line-count limit.
- `description`: Longer detail, shown on inspection.
- `parent`: The containing node, by name or id. At most one; containment is
  acyclic.
- `groups`: The configured group ids the node belongs to. Omit for none.
- `binding`: Where the code is: `{ "repo", "path" }` plus optional `symbol`,
  `branch`, `commit`, `confirmedAt`.
- `drillDown`: The board this part opens:
  `{ "board": "<name>", "variant": { "kind": "current" } }` or
  `{ "kind": "named", "name": "<variant>" }`. Add `"repo": "<identity>"` when
  the board is in another repository
  ([Drill-down](#drill-down)).

### Containment and receivers

`parent` says the child is defined inside the parent, and nothing about calls or
about who holds an instance of it: holding one is a relationship. Where a
relationship lands is [evidence rule 3](../SKILL.md#evidence-before-a-write). A
call from outside a container lands on the entry point that the caller names.
A call inside it lands on the part whose body runs. A handler calls the
exported `apply()` of a module, and `apply()` calls the private `validate()`.
The board says `handler -> apply -> validate`, with both functions parented to
the module. It does not say `handler -> module` or `handler -> validate`. Trace
each incoming call to the entry point that it names before you present the
board. Valid ids cannot tell you this.

### Groups

A group crosses containment: modules in different services can share one, and
one module can be in two. Membership is explicit on each member, never inherited
by or from a container, and the ids come from `groups` in `config.yaml`
(`{ "<id>": { "name": "<display name>", "color": "<palette color>" } }`);
renaming a group changes no board. Before every write that adds parts, ask of
each new part which configured concerns it serves: a group the source places a
part in and the part does not list is a membership the board lacks.

Groups carry the color of the cards. Every configured group has a required
`color` from the curated palette. A card is placed with its first group, in
`config.yaml` order; the cards placed with one group in one container (or at the
board level) are gathered into a region drawn in that group's color, one
region per container even round a single card, but none inside a container
the same group places, and each takes its body color from it. A card placed with no group is neutral. A container takes the
color of the group that places it on its header, as a card does, and is
neutral when no group places it; it colors nothing inside it. Each node's icon
chip says its own kind in the kind's color (`nodeKinds.<kind>.color`). Color is configuration, never on a board or a
node: a board drawn neutral is the vault owner's configuration question, not a
reason to touch `config.yaml` while authoring a board.

```json
{
	"name": "Submit order",
	"kind": "function",
	"parent": "Checkout",
	"groups": ["payments", "audit"]
}
```

`archboard semantic inspect <board> --group <id> [--variant <v>]` reports the
members, the relationships between them, the relationships crossing the
boundary with their direction, and the immediate neighbours outside, over the
whole variant: a member a view hides is still a member. A configured group
nobody has joined answers empty; an id that is neither configured nor on any
node is refused.

On the canvas, choosing a group in the sidebar's Board tab, where every group
is listed with its colour, or a selected node's membership selects every drawn
member across containers. The complete report (every member, including those
the view hides, internal relationships, directed incoming and outgoing
boundary relationships, and their immediate neighbours) is the answer of
`archboard semantic inspect`.

### Bindings

Register each checkout whose implementation you bind with
`archboard repo add <dir>`; the answer's `repo` is the identity (such as
`github.com/<owner>/<name>`, or the directory name of the main checkout when
the repository has no `origin` remote) and every binding on every machine uses
it with a repo-relative `path`. Every worktree has the identity of its main
checkout. A repository with several known checkouts, such as a worktree,
resolves in its chosen checkout, except that a binding or anchor into the
repository whose checkout holds the vault resolves in that checkout, so a board
in a worktree is read against the worktree. `repo add` never changes the choice,
and `archboard repo use <dir>` does, on the user's request only. `browser show`
from your checkout also makes it the chosen one, as the Essentials say. `branch`, `commit` and `confirmedAt` record what you
actually confirmed; restating the node keeps them only if you restate them.

`symbol` names the one definition at `path` that the node stands for, spelled
as its language or tool spells a qualified name: `postPayment`, `Ledger.post`.
In infrastructure it is the address of the declaration:
`module.checkout.aws_lambda_function.api` under a Terraform root module,
`Deployment/checkout` in a Kubernetes manifest, `services.checkout` in a
compose file. With a symbol, two parts can bind one file and stay told apart;
without one, the part owns the whole file or directory. A changed symbol is a
changed binding in a comparison. `archboard check semantics` tests the path only;
`archboard check code` warns with `BINDING_SYMBOL_MISSING` when the bound
file or directory does not define the symbol. Code facts read TypeScript and
TSX, Python, C and C++, Objective-C, C# and .NET project files, Swift,
Terraform and OpenTofu, Kubernetes manifests, docker-compose files, env files
and Nix flakes. Any other file, such as Objective-C++ (`.mm`), is read only as
text: it must hold the symbol's last name, and nothing that needs references is
judged in it. `check code` names the kinds of file that it read as text in
its `text-only` skip. A C, C++ or Objective-C part bound to a source file also
owns its header, and one bound to a header owns its source file: the file of
the other kind with the same name beside it, or the only one of that name in
the checkout. So `symbol` can name what either file defines, and a C++ name is
spelled with `::` or `.`: `shop::Ledger::post`, `Ledger.post`, `post`. An
Objective-C method is named by its class and selector: `Ledger.post:by:`,
`post:by:`.
Includes resolve through the nearest `compile_commands.json` that Git lists;
without one, against the including file's directory, the checkout root and
each directory named `include`. A use of a name that a header declares reaches
its code in the header's source file. Where that file does not define it, the
code is somewhere the include does not name: the use matches by name only, and
its finding is information.
Code facts also read C# files (`.cs`) and .NET project files (`.csproj`). A
C# `symbol` may leave out its namespace: `Shop.Core.Ledger.Post`,
`Ledger.Post` and `Post` all find the method. A part bound to a `.csproj`
binds its project: every file below the project's directory, as a part bound
to that directory does. The files of a project see each other without an
import, so the check finds the name a file uses by C#'s own lookup in its
project and in the projects its `ProjectReference` items name, and that
evidence is resolved. A name used as a value, not as a type, is found only as
a member of the type around it, because it may be a local or a member that a
base class declares. A `ProjectReference` is `build-dependency` evidence on
the project it names, and a `PackageReference` on a package outside the
checkout. The check runs no build and evaluates no MSBuild. Of each `#if`, it
reads the first branch. It skips a symbol that only another branch holds, as
`symbol-unparsed`. For the interface check, a project exposes the public types
of all its files and their public members. `InternalsVisibleTo` lets the
projects it names use internal code, and exposes nothing more.
"View in code" opens a bound file in a local checkout at the line where the
file defines the symbol, so code facts must read the file and find that
definition. The opener must take a line: Visual Studio Code, Cursor, Zed, or
a custom command with `{line}`. Otherwise it opens the file or directory. The
inspector shows the symbol under the path.

Bind a Terraform or OpenTofu declaration to its root module: the directory of
`.tf` or `.tofu` files that Terraform runs in. Its address is the `symbol`,
written as the configuration writes it, without an instance key.
`aws_lambda_function.api` is a declaration of the root module itself.
`module.checkout.aws_lambda_function.api` is one inside the module that the
call `checkout` makes, and `module.checkout` is that whole module instance.
`check code` reads the root module and every local module that it calls, a
`source` that starts with `./` or `../`. When the configuration no longer
declares the address, it warns with `BINDING_SYMBOL_MISSING`. It never reads
state, a `.tfvars` file or `.terraform`, and never runs `terraform` or `tofu`.
So it skips an address inside a remote module (the registry, Git) as
`module-not-read`. To read that module, name a plan JSON with
`check code --plan <file>`: what `terraform show -json` or `tofu show -json`
wrote into the root module's directory. A reference that joins two such parts
is evidence. The reference can go through the variables and outputs of a
module, and the call of a remote module reaches what its arguments name. The
check cannot see what that module does with an argument, so the reach is
`provisioning` evidence, unless the argument is an environment value or a named
plan shows the resource that it flows into. What the reference proves depends on the provider of the declaration that writes it
and on the argument that holds it. For AWS (`aws_`), Google Cloud
(`google_`), Azure (`azurerm_`) and Kubernetes (`kubernetes_`, `helm_`):

- A trigger, a subscription and an event mapping are `call` evidence. Some
  declarations join two others: `aws_lambda_event_source_mapping`,
  `aws_sns_topic_subscription`, `google_pubsub_subscription` and
  `azurerm_eventgrid_event_subscription` are examples. Such a declaration is
  evidence from the part that sends to the part whose work it starts. It is
  never evidence to or from the joining declaration itself. A Cloud Function's
  `event_trigger` runs from its topic to the function.
- A listener, a target group, a network rule, a Service selector and an
  environment value (`environment { variables }`, `app_settings`,
  `environment_variables`, an `env` block's `value`) are `configured-path`
  evidence.
- A grant is `permission` evidence: `aws_lambda_permission`, an IAM policy or
  its attachment, a `google_*_iam_member`, `azurerm_role_assignment`, a
  NetworkPolicy.
- Every other reference is `provisioning` evidence and is never reported as an
  undrawn relationship: the role a function runs as, its log group, its
  subnets, `depends_on`, `count` and `for_each`.

A reference of any other provider is `configured-path` evidence. `call`
accepts only call evidence, and `http`, `event`, `queue` and `data` accept call
and configured-path evidence. To anchor a relationship that a joining
declaration makes, cite its `.tf` file and its address, such as
`aws_lambda_event_source_mapping.jobs`: it need not be in the code of either
end. The check judges it by the kind of its join, so a grant such as
`aws_lambda_permission.jobs` does not support a `call` (`ANCHOR_MISMATCH`).
Otherwise cite the `.tf` file and the address that the referring
declaration names. Some modules take their event sources through a map that
`for_each` reads (`each.value`), as terraform-aws-modules' Lambda module
does. Such a module names no source that the check can follow. Anchor such a relationship
at the `.tf` file of the module call and the address that its argument names,
such as `aws_sqs_queue.jobs`.

Bind a docker-compose service with the symbol `services.<name>`. The path is
the file that compose reads in that directory: `compose.yaml`, `compose.yml`,
`docker-compose.yml` or `docker-compose.yaml`. A network is
`networks.<name>`, and a named volume is `volumes.<name>`. Compose merges the
override file (such as `compose.override.yml`) over the base, so the part also
owns the service's block there. Code facts read these files and env files
(`.env`, `<name>.env`). A file that only `-f` names, such as
`compose.prod.yaml`, is read as text. These entries are configured-path
evidence:

- `depends_on`, `links`, `volumes_from` and `network_mode: service:<name>`.
- A network or a named volume that a service uses.
- An environment value whose host is another service, such as
  `postgres://app@db:5432/app` or `REDIS_HOST: redis`. A `container_name`,
  `hostname` or network alias names its service too.
- A named volume that one service writes and another mounts.

An override's environment value replaces the base's value of that name, and
its mount replaces the base's mount at that target.
`http`, `data` and `dependency` accept configured-path evidence by default,
and `call` does not. To anchor a
relationship between two services, cite the compose file and the address of
the service it reaches: `services.db` in the file where `api` depends on `db`.
An env file gives the check the names it sets, never their values.

Bind a Kubernetes object to its manifest, or to a directory of manifests, with
its kind and name as `symbol`: `Deployment/checkout`, `Service/checkout`,
`Ingress/shop`. Write the kind as the manifest writes it, and leave the
namespace out. Code facts read a `.yaml` or `.yml` file as a manifest when one
of its documents has an `apiVersion` and a `kind`, also the items of a `List`
and Helm or Kustomize output that somebody rendered to files. Any other YAML
file is read as text. Until Helm renders a chart's templates, the names in
them are unknown. So the check skips a symbol in a Helm template as
`expression-not-followed`, and never reports it missing. To have it checked,
bind the output that Helm rendered. The check never runs `kubectl`, `helm` or
`kustomize`, and it reads only the names of a Secret's keys, never a value.
This is evidence:

- A call: an Ingress backend, and an HTTPRoute or GRPCRoute `backendRefs`
  entry, each to the Service it routes to.
- A configured path: a Service's selector, to each workload that it picks.
  An environment value whose host is a Service, such as `cart:7070`,
  `http://cart.shop.svc.cluster.local` or `CART_HOST: cart`. The ConfigMap,
  Secret or claim that a workload's `env`, `envFrom` or volumes read.
- A permission: a NetworkPolicy, from the workload that it lets send to the
  one that receives. No default kind accepts it.

A name resolves to the nearest manifest that declares it: the same file, then
its directory, then the directories further out. Where two manifests at the
same distance declare it, such as two environments' copies, it resolves to
neither and gives no evidence. A reference to a Service that
no part binds reaches the workloads that the Service picks, so a board can
bind only its workloads. To anchor a relationship between two workloads, cite
the caller's manifest and the Service that it names: `Service/cart` in
`k8s/web.yaml`.

Bind a Nix flake output to `flake.nix`, with its attribute path as `symbol`,
written whole from the output's name: `packages.x86_64-linux.archboard`,
`devShells.aarch64-darwin.default`, `nixosConfigurations.host`,
`overlays.default`. `check code` reads the outputs from the file without
evaluating it, and never runs `nix`. It follows an attribute set, `let ... in`,
the file's own functions such as `forAllSystems`, `genAttrs`, flake-utils'
`eachSystem` and `eachDefaultSystem`, and flake-parts' `mkFlake` with
`perSystem` and `flake`. Where the systems come from a place it does not read,
such as `nixpkgs.lib.systems.flakeExposed`, `import systems` or flake-utils'
default systems, every system holds the outputs that the function gives. An
output that it cannot follow, such as one from an outside import or a
flake-parts module, is skipped as `expression-not-followed` and never
reported missing; `BINDING_SYMBOL_MISSING` means the flake gives no such
output. The inputs are in `flake.lock`: each input of
the flake is build-dependency evidence, which `dependency` accepts and `call`
does not. Anchor a relationship to an input at `flake.lock` with
`inputs.<name>` as `symbol`. A part bound to `flake.lock`, or to a directory
that holds it, owns that evidence, and an input that is a path in the same
checkout (`path:./tools`) reaches the part bound to that flake.

A package of the flake that is built from another is build-dependency evidence
too. The check reads `buildInputs`, `nativeBuildInputs` and
`propagatedBuildInputs` of `mkDerivation`, `buildGoModule`,
`buildPythonPackage`, `buildPythonApplication` and `buildRustPackage`, and the
local functions that `import` or `callPackage` reads. A literal path inside
the checkout is followed, including a directory with `default.nix`.
`callPackage` passes the caller's package scope and its explicit arguments;
only the function's actual build inputs count. All imported files share the
flake's limit of 200,000 reading operations. An input that is another output of the flake
reaches that output, however the flake names it: `self.packages.${system}.lib`,
a name that a `let` binds, or an overlay's `final.lib`. Bind an overlay's
package as `overlays.<name>.<package>`. Anchor a build dependency at `flake.nix`
with the output it is built from as `symbol`. An outside or unknown path,
a package of nixpkgs or `prev`, `mkShell`, and `overrideAttrs` remain unknown.
A skip names the file and lines of the expression, including an imported file. Where two packages share a line, as `inherit core lib app;`
does, the check cannot tell whose inputs the line names, so they are unknown
there too. Take a relationship with no anchor that no evidence supports, from
such an output to another output of the same flake. The check skips it as
`expression-not-followed`, and never reports it unsupported.

Code facts also read Swift (`.swift`), and `Package.swift` without running it.
Bind a Swift module to its target's directory, such as `Sources/Core`, and a
type or a member by its qualified name: `Ledger`, `Ledger.post`, and
`Ledger.refund` for a member that an extension in another file adds. A Swift
file sees the names of its module with no import, so a use of a name that one
other file of the module declares reaches that file, and so does a use of a
name that an imported module exposes (`open`, `public` or `package`). A use of
a name that the file also binds, as a parameter, a local or a member, reaches
nothing, and neither does a member reached through `self` or another value:
only a language server can tell what such a use means. After a place where
the grammar cannot read a Swift file, such as an `unsafe` expression, a name
that the check does not find is skipped as `symbol-unparsed`, never reported
missing. An `import` of a local module that `Package.swift` makes a dependency
of the importing target is build-dependency evidence, which `dependency`
accepts and `call` does not: anchor a `call` at a name the code uses, such as
the type it constructs. `Package.swift` defines each target by its name, so a
part can also bind `Package.swift` with a target's name as `symbol`. A name or
a path that the manifest computes is not read, and a Swift file that no target
of a `Package.swift` holds, as in an Xcode project, belongs to no module, so
its uses of other files' names give no evidence.

A binding names the implementation owner: the file whose body does what the
node's responsibility says, not a file that imports the unit, registers it (a
command table, a plugin table, a route mount) or calls it. A command's handler
binds where the handler is written, not to the table registering the command or
the dispatcher calling it. An implementation unavailable for inspection stays
unbound, and a planned part binds only to a path the request states for it; one
in another checkout and one spread across files
follow [evidence rule 2](../SKILL.md#evidence-before-a-write): never bind to a
file that does only part of the responsibility; narrow it to what one file owns,
or split the node. `archboard check`
reports `BINDING_PATH_MISSING` for a node on the current variant whose binding
names a path the repository does not have, naming the node, the path, the repo
and the checkout; a repository this machine has not registered draws no
warning, because that is a local fact rather than a fault in the board. A
binding on a draft is not reported: a proposal may name where code will live
before it does, and the check applies once the draft is adopted.

### Drill-down

Give a service's internals their own board and link the node to it. `current`
follows the target board's designation; `named` opens that variant and never
falls back to current when the name is gone. Reuse an existing detail board
([`drillDown` row](../SKILL.md#everything-the-code-shows)): check
`archboard semantic` before a write that adds a part at the service or system
level.

**The kind is the linked board's level.** A node standing for what another
board describes takes that board's level as its kind (`system`, `service`,
`module`), so a reader sees where one level joins the next without opening
anything. `external` is not that kind: it means code this codebase does not own
(a library, a framework, a runtime, a shell, a hosted service, a caller outside
the checkout), and saying it of one of our own parts tells the reader the
opposite of what is true.

**The link sits on a part that is really there.** A drill-down is a property of
a part the board draws for its own sake, never a node added to carry it ([keep
it true](../SKILL.md#keep-it-true)). Draw the actual caller; when the callers
abstract to one system, that abstraction is the node, with its own
relationships. Which way the link points says where it sits:

- **Up**, to the board this board is a part of, goes on the container the board
  describes — never on a card standing beside the parts. A board that describes
  a module draws that module as a container, so the link goes there. A board
  whose parts stand side by side with no container around them has no upward
  link, which is the right board.
- **Down or sideways** goes on a card: a module board that shows
  `calls this module` draws an edge to a node of kind `module` whose drill-down
  opens it.

**A board of another repository.** Without `repo`, the target is a board of the
vault that holds this board. A meta project's board reaches a product
repository's board by naming the repository identity, the one a `binding` names
(`github.com/acme/payments`), and never a directory: the note is read on other
machines. The target is then looked up in the vault of the identity's chosen
checkout (`archboard repo list`), by the same rules as in this vault: the name
the board had before a rename and a name in other letters open it too, and the
kind is the level that board declares. An identity that names this vault's own
repository stays in this vault. A vault in no repository has no identity, so
nothing can link into one. List the boards of that repository's own vault
before you write the link
(`archboard -C <checkout> semantic`, with the chosen checkout that
`archboard repo list` shows), and write the name the board
goes by there.

A reader who follows the link moves the pane into that repository, as a choice
in the navigator does: the pane, its address and `archboard browser panes` then
name the other repository. The breadcrumb names the repository where the trail
crosses into one, and its crumbs lead back. A link into a repository that this
machine does not list opens nothing, and the inspector says to register a
checkout with `archboard repo add <directory>`.

```json
{
	"name": "Payments",
	"kind": "service",
	"drillDown": {
		"board": "Payments",
		"variant": { "kind": "current" },
		"repo": "github.com/acme/payments"
	}
}
```

`archboard check` warns on these mistakes, naming the node:
`DRILL_DOWN_ONLY_NODE` (nothing but the link: no relationship, no children, no
part in a flow), `DRILL_DOWN_UNKNOWN_BOARD` (no such board, in this vault or,
when `repo` is named, in the chosen checkout's vault, so the link opens
nothing), `DRILL_DOWN_LEVEL_MISMATCH` (the kind disagrees with the level of
the board it opens) and `DRILL_DOWN_UNKNOWN_REPOSITORY` (`repo` names a
repository with no chosen checkout on this machine, a chosen checkout that is
gone, or one with no vault; a binding into such a repository draws no warning,
but a link that opens nothing does. `archboard repo add <directory>` or
`archboard repo use <directory>` clears it).

Those check a variant's content, so they run only over current and draft
variants, as `NODE_UNCONNECTED` does. An ordinary write cannot change a
historical or shelved variant, and a historical correction answers the Git
commits that the variant describes, not these warnings. `BINDING_PATH_MISSING` runs only over the current variant: a binding to
a file that existed then is a correct record, not drift, and one on a draft is
ahead of the code rather than behind it. `UNKNOWN_VOCABULARY` is not one of them: its cause
is the vault configuration, so defining the kind again clears it wherever it
sits.

A check diagnostic about one node or one relationship carries a `subject`,
`{ "kind": "node" | "edge" | "step", "id", "name" }`, next to its `board` and
`variant`. `archboard check` prints the subject's name before the message. A
relationship's name is its ends, `From -> To`; a step's is its flow, its ends
and its label, `Flow: From -> To: label`, and only `check code` names one. A diagnostic about the board or
the configuration has none, and nor has a `RELATIONSHIP_*` write warning: that
one names its relationship in its `path`.

## Relationships

- `order`: Layout priority among this variant's relationships. Omit it for
  automatic 1000-step positions; restating an existing id keeps its position.
  Set a number between two existing values to try a different route/layout.
- `from`, `to`: Node names or ids.
- `kind`: A key of `relationshipKinds` in `config.yaml`; it decides dash and
  arrowhead.
- `label`: What crosses, in a few words.
- `description`: Longer prose.
- `emphasis`: `normal` (default), `hero` for the board's spine, `muted` for
  context. A hero line is drawn heavier, and a muted line paler.
- `traffic`: `{}` for moving marks at the defaults (speed 80, volume 1);
  `{ "speed", "volume" }` positive finite numbers; omit for none.
- `anchor`: The code that proves it: `{ "repo", "path", "symbol" }`, all three
  required, no line ([evidence for a relationship](#evidence-for-a-relationship)).
  A step takes one too.

Emphasis answers "what am I looking at": `hero` marks the spine, the path or
backbone the board exists to show. On a board of how one request is saved,
that is the client's call into the service, the service's write through its
store and the store's write to disk. Authentication, validation and the notice
to other clients are the context that path runs through. Keep `hero` to about
a third of the relationships and never past half: weight is a contrast and spends
itself, and ten hero lines out of twelve make a heavier board, not an emphasised
one, sending the reader back to every label to find the line that matters.

The commoner mistake is the opposite: a board whose question has an answer
path, left all `normal`, hands the reader a flat picture and the work you
already did. If one sentence can say the board's answer, the relationships it
rests on (take one away and the sentence is false) are `hero`, and saying it is
the check; a board with no such
sentence (a catalogue of parts, a dependency map) has no spine and correctly
marks nothing.

`muted` is an instruction of its own, not a leftover: it goes on relationships
the board needs to be honest but that are not the answer (a registration made
once at startup, a configuration read, a dependency explaining where a part
comes from, a teardown path), so the unmarked majority reads as ordinary and the
spine as the subject.

Traffic goes where the [catalogue's `traffic`
row](../SKILL.md#everything-the-code-shows) says: the forward path of every
pass, so a reader sees the hot path against everything else; stamping it on
every relationship says nothing. The call that hands a request to its handler
carries it, and so does every call between the entry point and that handler;
never on the paths the row excludes (teardown there includes closing a
connection or a cleanup hook); a call a normal pass always makes stays on even
when an error or short-circuit could skip it. `speed`/`volume` above the
defaults mark the hotter of two runtime paths, not a busier-looking picture. To
add or change it on an existing relationship, restate that relationship with its
`id` ([References](../SKILL.md#essentials)).

### A step is not a relationship

`emphasis` and `traffic` belong to a relationship; a flow step has neither. A
step takes `from`, `to`, `label`, `kind`, `note`, `repeat` and `anchor` (with
`id` or `as` to identify it) and nothing else, and `repeat` and `note` exist only there,
never on a relationship. A node carries none of the four: emphasis is a property
of a line, not of a part.

A step carrying `emphasis` is refused with `Unrecognized key: "emphasis"` over a
second line locating it, `→ at flows[0].steps[0]`: the refusal is about those
steps, not the payload, so move the key onto the relationships between the same
parts ([the catalogue](../SKILL.md#everything-the-code-shows)) rather than
dropping it everywhere.

### Evidence for a relationship

Every relationship is a directional claim the source must support: hold the
one-line record of [evidence rule 3](../SKILL.md#evidence-before-a-write)
before it goes in a payload, and write its file and symbol into the payload as
the relationship's or step's `anchor`:

```json
{
	"from": "Submit order",
	"to": "Payment client",
	"kind": "call",
	"anchor": {
		"repo": "github.com/<owner>/<name>",
		"path": "src/checkout/submit.ts",
		"symbol": "chargeCard"
	}
}
```

For a call, `path` is the file whose body makes it and `symbol` is what it
calls ([the worked example](create-architecture.md) anchors every relationship).

`repo` is spelled as on a binding and is never taken from a binding at an end:
an end can be unbound or external, and the proof can live in another
repository. The anchor stores no line, because a line moves with every edit
above it. It is bookkeeping: a comparison never reads a new or better anchor
as a change, and a proposal merges it like `emphasis`. `archboard check code`
warns with `ANCHOR_PATH_MISSING` when its file is not in the checkout, with
`ANCHOR_SYMBOL_MISSING` when the file neither defines nor uses the symbol (a
name in a comment or a string does not count, except the name of an
environment value or an event), and with `ANCHOR_MISMATCH` when the symbol is
defined in the checkout outside the bound code of both ends and of every part
inside them: cite what the code of an end defines or calls. Where one of those
parts has no binding, the check cannot tell where its code is and does not
judge this. It is also `ANCHOR_MISMATCH` when the file uses the symbol only in
a way the relationship's kind does not accept: a name used only as a type is
`import` evidence, which a `call` does not accept. The `evidence` list of each
kind under `relationshipKinds` in `config.yaml` says what it accepts; a kind
without one accepts everything.

Between the bound parts of a board, `check code` reads the evidence in their
code. A part whose code runs another bound part's code (calls or constructs
it, renders it, sends it a message), with no relationship or step between them
or between parts that hold them, is `RELATIONSHIP_UNDRAWN` on the part it
reaches, which lists every part that reaches it: draw the relationship the
board's question needs. A use only as a type is never undrawn, and nor is a use
as a value (a constant read, a name passed on, an `instanceof` test or a
catch), which still supports a relationship and its anchor. A relationship with no anchor whose accepted evidence
runs only the other way is `RELATIONSHIP_BACKWARDS`, and one that no accepted
evidence joins is `RELATIONSHIP_UNSUPPORTED`. Both are information: a
subscription runs in code from the handler to the part that sends the event,
and a call across a network or through a value a part receives shows nothing in
code. Its anchor makes the relationship a claim the check holds to the code.
Evidence is `resolved` where the import names the file it reaches, or where
the language server of the file names the definition. It is a `candidate`
where the check matched it by name only. A finding that rests only on
candidates is information. A call through a value, such as `ledger.post()`,
is no evidence by itself. Anchor the relationship at that call: the language
server then names the code that the call reaches.

If a checkout has no configured server for a language, the answer says
`language-server-missing` once for the checkout and the language, and the
candidates stay. A server that did not start or stopped is
`language-server-failed`. A project that the server cannot answer about yet is
`language-server-unready` once, and the candidates stay. These are the cases:

- A Swift file with no `Package.swift` that holds it. SourceKit-LSP builds a
  package itself on the first run and owns its background index.
- A C# checkout with no `.sln`, `.slnx` or `.csproj` file.
- A C, C++ or Objective-C file with no `compile_commands.json`. The check never
  generates it.

With a server, clangd names the definition of a function that a header only
declares. Redis declares such a function in `server.h` and defines it in
`evict.c`.

TypeScript needs no setup. If the check says `language-server-missing` for a
repository that you work in, read [setup](setup.md). It says what to install and
run. A configured server runs the code of that repository.

A relationship across a network hop shows no evidence in code alone. An
example is an `http` call to another service. So `check code` joins two
halves. The code of the start reads an environment value, such as
`process.env.ORDERS_URL` or `os.environ["DATABASE_URL"]`. The infrastructure
that runs that code sets the value to the address of the end. In compose, that
is a service's `environment` or `env_file`. In Kubernetes, it is a workload's
`env` or `envFrom`. In Terraform, it is a resource's
`environment { variables = { ... } }`, `environment_variables`, `app_settings`
or `env` block. Together the halves are configured-path evidence. By default,
`http`, `rpc`, `event`, `queue`, `data` and `dependency` accept it. The check
knows which infrastructure runs which code in two ways:

- A compose service runs the code of the directory that it builds, such as
  `build: ./orders`. If the build context is the directory of the compose
  file, the directory of its Dockerfile counts, such as
  `dockerfile: orders/Dockerfile`. The deepest build that holds a file runs it.
- Code inside a part bound to a service, a workload or a resource runs there.
  Use this for an image built elsewhere, a Kubernetes workload or a Lambda
  function: draw the code inside the part bound to `services.worker`,
  `Deployment/worker` or `aws_lambda_function.worker`.

The value reaches the part whose code the named service runs, by the same two
rules. Otherwise it reaches the part bound to the service or resource that it
names. A Kubernetes Service that no part binds leads to the workloads that it
picks. With both halves, the relationship needs no anchor. Where the
infrastructure leaves a choice, the halves are a candidate, never a warning.
The named service runs the code of several parts, so the address does not say
which of them it reaches. Or more than one service runs the code that reads
the value, and they do not set it to the same address, as two services that
build one directory to two targets do. Draw a relationship that such a
finding names only where it is true.
With one half, `RELATIONSHIP_UNSUPPORTED` names the side with no evidence in
`missing`. If the infrastructure sets a value to the address of the end, and
the code of the start reads none of those names, it is `code`. If the code of
the start reads names that nothing sets for it, it is `infrastructure`. Then
anchor the relationship at the file that reads the value, with the
name of the value as `symbol`, such as `DATABASE_URL`. If the code reads no
value, anchor the line that makes the call. A library can read the value, or
the code can hold the address.

For a container bound to a module, `check code` also holds the interface
that the board derives against what the module exposes. The module is a bound
directory, or the `index.ts`, `__init__.py` or `.csproj` that stands for one. In
TypeScript, the module exposes what its root files export, also the names that
they import and export again. The root files are the files that its
`package.json` `exports` names, or else the files directly in its directory. A
file of tests is not a root file. In Python, the root file is the `__init__.py`
of the package. It exposes the names that its `__all__` lists. Without
`__all__`, it exposes every name that it defines or imports and that does not
start with `_`. In Swift, the module is the directory of a target that
`Package.swift` declares. It exposes the `open`, `public` and `package`
declarations of all its files. In C, C++ and Objective-C, the module is a
bound directory. Its public headers are the headers below its `include` directory, or else the
headers directly in it whose source file is in it too. It exposes what they
declare. In Terraform and OpenTofu, the module is a directory of `.tf` or
`.tofu` files, and a module in a directory below it is another module. It
exposes its variables and outputs. A call of the module uses the variables that
its arguments set and the outputs that its own module reads, such as
`module.queue.url`. A reference to the whole call, such as
`value = module.queue`, reads every output, except in `depends_on`.
Configuration outside a Terraform module reaches it only
through its outputs, so the check gives no `ENTRY_POINT_UNEXPOSED` for one.
A Nix flake exposes its output attribute paths from `flake.nix`. A Helm
chart exposes its key paths from `values.yaml`, with dots between nested
keys; `Chart.yaml` identifies the chart. Its templates remain private.
The container can bind to the directory or to one of these entry files.
The check gives these findings:

- `ENTRY_POINT_UNEXPOSED`, a warning: an entry point owns nothing that the
  module exposes, and the code of a caller drawn to it reaches it from outside
  the module. Make the callers use what the module exposes, or expose it.
- `CALLER_UNDRAWN`, a warning: a file outside the module runs the exposed code
  of a hidden part, and no part on the board binds that file. Draw
  the caller that the board's question needs. The check judges this only where
  the board draws a caller of the container.
- `EXPOSED_UNUSED`, information on the container: the exposed names that no
  file outside the module uses. A test is not a caller.
- `TEST_IMPORT_UNEXPOSED`, a warning on the container: a test outside the
  module imports a private file. Use a public entry file, or put the test
  inside the module. A test inside a module can exercise any of its files.
- `VARIABLE_PASSED_THROUGH`, information on a container bound to a Terraform
  module: the variables that the module uses only once, as the whole value of
  one argument of a resource that it manages, such as `bucket = var.bucket`.
  Each is a pass-through variable: the caller decides what the module could
  decide.
- `MODULE_SHALLOW`, information on such a container: the module manages
  exactly one resource, calls no module, and passes every variable through,
  except a variable that only sets the `count` of that resource. The resource
  reads nothing else, such as a local or a data source. Its interface is the
  interface of the resource. This finding names each
  variable that the module passes through, so the module gets no
  `VARIABLE_PASSED_THROUGH`.

The check skips a container whose module has no root file that it reads, as
`exposure-unknown`. A compose file and a plain Kubernetes manifest keep this
skip: neither declares an interface the check can read.

To see what a module exposes, and who uses each name, add `--exposed`:
`archboard check --code --exposed`. It needs `--code`, and without it the
answer stays small. The JSON answer then carries `codeCheck.exposures`, one
entry for each container the check judged against a module: its `board`,
`variant`, `container`, `module` and `rootFiles`; `exposed`, the exact count of
names the module exposes; `usedOutside`, the exact count of them that a file
outside the module uses; and `names`, with the most used first. Each name gives
its `path` and `line`, `via` (the files that pass it on, root file first, empty
when a root file declares it), `users` (the exact count of files outside the
module) and `usedBy` (those files, each with the first `line` of its use and
the ids of the `parts` of the board that hold that line). `names` and `usedBy`
are capped, so compare `users` and `exposed` with the length of the list. The
text output adds one `exposed:` line for each container with its counts. Use it
where you decide what a module's entry points are or what a change would
reach, in place of reading the module's code for its callers.

That record decides what a valid payload cannot:

- **Siblings are not a chain** (rule 3).
- **The receiver is the part, not its container**
  ([containment and receivers](#containment-and-receivers)).
- **A return travelling back is a flow step**, not a second architecture
  relationship.
- **The kind follows the mechanism**: a function call is a `call`; a value read
  or handed over is `data`; a component drawing another is `render`; an emitted
  event or a subscription is `event`; a message put on a queue is `queue`; an
  HTTP request is `http`; a dependency the source imports but never calls at
  this level is a `dependency`. Use the configured kind that names what the
  source does; its `evidence` list says what `check code` accepts as proof.

After the write, read the saved `edges` against the record: every relationship
has a line, every line has a relationship, and no relationship exists without
one.

## Handles and removals

`as` on a new node, relationship, flow or step gives it a name for this one
write, so a view can select the relationship or a beat can name the step in the
same payload. Handles are never stored.

`removeNodes`, `removeFlows`, `removeViews` and `removeWalkthroughs` take names
or ids; `removeEdges` takes an id because a relationship has no name. Removing
a node removes its relationships; a step or a beat is removed by restating its
flow or walkthrough without it.

## What the CLI refuses, and what to do

Every refusal names the rule and the subject; repair the payload from that
reason as [the CLI essential](../SKILL.md#essentials) says. New evidence for a
second attempt is a different id you read, a field the refusal named, a
version you re-read: the same payload sent again is refused again. A request
the commands cannot satisfy (an operation the CLI does not offer, an id nothing
on the board can name) is reported as unresolved, with why, rather than
approximated another way.

- **unknown field**: The payload has a key the schema lacks, and the line under
  it locates the subject. Check the spelling against [schemas](schemas.md), and
  check the key belongs on that subject: a step is not a relationship.
- **unknown kind, level or group**: Not a key of `config.yaml`. Use a configured
  one ([Vocabulary](../SKILL.md#essentials)).
- **ambiguous name**: Two nodes share the name; use the id from the family you
  read.
- **unknown id**: A stated `id` names nothing on that variant; new subjects
  leave `id` out. The exception is a restore: a node, relationship or flow the
  variant lacks comes back under its id when its predecessor or reconciliation
  base holds it, and with `--confirm RESTORE_UNCONFIRMED` when only another
  variant does (`RESTORE_UNCONFIRMED`; [variants](variants.md#disagreements)).
- **part re-created or inheritance dropped**: On a draft, a node added without
  an id repeats one an ancestor holds (`PART_RECREATED`), or the edit removes
  most of what the draft inherited (`INHERITANCE_DROPPED`). State the original
  id, keep the parts, or confirm the code ([variants](variants.md#branching)).
- **dangling reference**: An edge end, participant, step end, view selection or
  beat subject names nothing; fix the reference.
- **containment cycle**: A `parent` chain loops.
- **self step**: `kind: "self"` exactly when `from` and `to` are the same node.
- **empty selection or empty walkthrough**: A selection view names nothing; a
  walkthrough has no beats.
- **invalid traffic or repeat**: `speed`/`volume` are positive finite; `repeat`
  is an integer of 2 or more.
- **too long**: Names, labels and handles are single-line and bounded;
  responsibilities are bounded prose and may contain line breaks; descriptions
  are bounded.
- **version moved (exit 5)**: Somebody wrote since you read; `semantic show`
  again and redo the change on what is there.
- **held or claim revoked (exit 5)**: Another writer holds the board, or a
  user released your claim; stop and say so.

A `warnings` list on a successful answer says what the write did that you
should know: `UNKNOWN_VOCABULARY` means the board references vocabulary the
configuration no longer defines (`archboard check` names each reference), and
`RELATIONSHIP_REPLACED` means a relationship was implicitly removed with its
endpoint and a close restatement received a new id, or one was removed while a
close restatement from an earlier write still stands. If it was meant to
continue, remove the copy and restate the original `id` with its full
properties in one edit (a restore, [variants](variants.md#disagreements)). An
explicit `removeEdges` plus idless addition declares a replacement without this
warning.
`RELATIONSHIP_DUPLICATED` means the batch stated an existing relationship again
without its `id`, so both now stand; do not remove the original to tidy up, but
remove the copy and restate the original with its `id`.
`ANCHOR_DROPPED` means the batch restated a relationship or a step without the
`anchor` it had, so the anchor is gone; the message spells the anchor out, and
restating the subject with it puts it back.
`RESTORED_FROM_OTHER_VARIANT` means `--confirm RESTORE_UNCONFIRMED` brought
back an id that only another variant held; the message names it and that
variant. `PART_RECREATED` and `INHERITANCE_DROPPED` say what a `--confirm` of
that code let the write do.
