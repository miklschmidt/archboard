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
  `{ "kind": "named", "name": "<variant>" }`.

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
board level) are gathered into a region outlined in that group's color, one
region per container even round a single card, but none inside a container
the same group places, and each takes its body color from it. A card placed with no group is neutral. A container's kind colors only
the container, never the cards inside it, and each node's icon chip says its own
kind (`nodeKinds.<kind>.color`). Color is configuration, never on a board or a
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
`github.com/<owner>/<name>`) and every binding on every machine uses it with a
repo-relative `path`. `branch`, `commit` and `confirmedAt` record what you
actually confirmed; restating the node keeps them only if you restate them.

`symbol` names the one definition at `path` that the node stands for, spelled
as its language or tool spells a qualified name: `postPayment`, `Ledger.post`.
In infrastructure it is the address of the declaration:
`module.checkout.aws_lambda_function.api` under a Terraform root module,
`Deployment/checkout` in a Kubernetes manifest, `services.checkout` in a
compose file. With a symbol, two parts can bind one file and stay told apart;
without one, the part owns the whole file or directory. A changed symbol is a
changed binding in a comparison. `archboard check` tests the path only;
`archboard check --code` warns with `BINDING_SYMBOL_MISSING` when the bound
file or directory does not define the symbol; a file it reads only as text must
hold the symbol's last name.
"View in code" opens the file in a local checkout at the line where the symbol is
defined, when code facts find it there (TypeScript and TSX for now), and the
file otherwise. The inspector shows the symbol under the path.

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
  describes — never on a card standing beside the parts. Often there is no such
  container and therefore no upward link, which is the right board.
- **Down or sideways** goes on a card: a module board that shows
  `calls this module` draws an edge to a node of kind `module` whose drill-down
  opens it.

`archboard check` warns on all three mistakes, naming the node:
`DRILL_DOWN_ONLY_NODE` (nothing but the link: no relationship, no children, no
part in a flow), `DRILL_DOWN_UNKNOWN_BOARD` (no such board, so the link opens
nothing) and `DRILL_DOWN_LEVEL_MISMATCH` (the kind disagrees with the level of
the board it opens).

Those three check a variant's content, so they run only over the variants a
write can still change: no accepted write could clear a warning on a frozen
variant. `BINDING_PATH_MISSING` runs only over the current variant: a binding to
a file that existed then is a correct record, not drift, and one on a draft is
ahead of the code rather than behind it. `UNKNOWN_VOCABULARY` is not one of them: its cause
is the vault configuration, so defining the kind again clears it wherever it
sits.

A check diagnostic about one node or one relationship carries a `subject`,
`{ "kind": "node" | "edge" | "step", "id", "name" }`, next to its `board` and
`variant`. `archboard check` prints the subject's name before the message. A
relationship's name is its ends, `From -> To`; a step's is its flow, its ends
and its label, `Flow: From -> To: label`, and only `check --code` names one. A diagnostic about the board or
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
  context. Line weight only.
- `traffic`: `{}` for moving marks at the defaults (speed 80, volume 1);
  `{ "speed", "volume" }` positive finite numbers; omit for none.
- `anchor`: The code that proves it: `{ "repo", "path", "symbol" }`, all three
  required, no line ([evidence for a relationship](#evidence-for-a-relationship)).
  A step takes one too.

Emphasis answers "what am I looking at": `hero` marks the spine, the path or
backbone the board exists to show. On a board of how one write lands, that is
the CLI's call into the Archboard server, the server's write through the board store and
the store's atomic write to the file; the lease, the version check and the
broadcast are the context that path runs through. Keep `hero` to about a third
of the relationships and never past half: weight is a contrast and spends
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
as a change, and a proposal merges it like `emphasis`. `archboard check --code`
warns with `ANCHOR_PATH_MISSING` when its file is not in the checkout, with
`ANCHOR_SYMBOL_MISSING` when the file neither defines nor uses the symbol (a
name in a comment or a string does not count, except the name of an
environment value or an event), and with `ANCHOR_MISMATCH` when the symbol is
defined in the checkout outside the bound code of both ends and of every part
inside them: cite what the code of an end defines or calls.
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
  source does.

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
  leave `id` out. The one exception: a draft may restate a node it removed under
  the `subject` id of its open `deleted-and-changed` issue
  ([variants](variants.md)).
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
continue and its id remains in the direct predecessor or recorded
reconciliation base, remove the copy and restate the original `id` with its
full properties in one edit. An explicit `removeEdges` plus idless addition
declares a replacement without this warning.
`RELATIONSHIP_DUPLICATED` means the batch stated an existing relationship again
without its `id`, so both now stand; do not remove the original to tidy up, but
remove the copy and restate the original with its `id`.
`ANCHOR_DROPPED` means the batch restated a relationship or a step without the
`anchor` it had, so the anchor is gone; the message spells the anchor out, and
restating the subject with it puts it back.
