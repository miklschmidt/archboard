# Authoring reference

Everything a node or relationship can say beyond the common recipes, and what
the CLI refuses. Fragments here go into the JSON of `semantic new` or
`semantic edit`.

## Nodes

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
- `binding`: Where the code is: `{ "repo", "path" }` plus optional `branch`,
  `commit`, `confirmedAt`.
- `drillDown`: The board this part opens:
  `{ "board": "<name>", "variant": { "kind": "current" } }` or
  `{ "kind": "named", "name": "<variant>" }`.

### Containment and receivers

`parent` says the child is defined inside the parent, and nothing about calls or
about who holds an instance of it: holding one is a relationship. A relationship
lands on the part that receives it:
`Browser client -> Viewer entry point -> Fetch semantic reads`, both internal
parts parented to `Semantic viewer`, not
`Browser client -> Semantic viewer -> Fetch`. The renderer carries a line across
a container's boundary. A container is the endpoint only when the source
addresses the whole module (a dependency in a higher-level view). Any part drawn
with children is a container, whatever its `kind`: a module, class or component
node that defines its functions, methods or components receives nothing itself,
and a call to it lands on the child whose body runs. When you give an existing
part children, move every relationship that landed on it to the child that
receives it. Before presenting, trace each incoming call to its actual receiver;
valid ids alone cannot tell you this.

### Groups

A group crosses containment: modules in different services can share one, and
one module can be in two. Membership is explicit on each member, never inherited
by or from a container, and the ids come from `groups` in `config.yaml`
(`{ "<id>": { "name": "<display name>" } }`); renaming a group changes no board.
Before every write that adds parts, ask of each new part which configured
concerns it serves: a group the source places a part in and the part does not
list is a membership the board lacks. Groups assign no color: color belongs to a
kind (`nodeKinds.<kind>.color`, `relationshipKinds.<kind>.color`, from the
curated palette), never to a board, a node or a group. A container with a
colored kind tints its contents and each node's icon chip says its own kind; a
vault whose kinds carry no color draws every board neutral, which is the vault
owner's configuration question, not a reason to touch `config.yaml` while
authoring a board.

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

On the canvas, pick a group from the sidebar's Board tab or a selected node's
membership: its drawn members stand out across containers, boundary neighbours
stay readable, and **Details** opens the complete report (every member,
including those the view hides, internal relationships, directed incoming and
outgoing boundary relationships, and their immediate neighbours).

### Bindings

Register each checkout whose implementation you bind with
`archboard repo add <dir>`; the answer's `repo` is the identity (such as
`github.com/<owner>/<name>`) and every binding on every machine uses it with a
repo-relative `path`. `branch`, `commit` and `confirmedAt` record what you
actually confirmed; restating the node keeps them only if you restate them.

A binding names the implementation owner: the file whose body does what the
node's responsibility says, not a file that imports the unit, registers it (a
command table, a plugin table, a route mount) or calls it. A command's handler
binds where the handler is written, not to the table registering the command or
the dispatcher calling it. A planned part or an implementation unavailable for
inspection stays unbound; one in another checkout and one spread across files
follow [evidence rule 2](../SKILL.md#evidence-before-a-write). `archboard check`
reports `BINDING_PATH_MISSING` for a node whose binding names a path the
repository does not have, naming the node, the path, the repo and the
checkout; a repository this machine has not registered draws no warning,
because that is a local fact rather than a fault in the board.

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

Those three and `BINDING_PATH_MISSING` check a variant's content, so they run
only over the variants a write can still change: no accepted write could clear a
warning on a frozen variant, and a binding to a file that existed then is a
correct record, not drift. `UNKNOWN_VOCABULARY` is not one of them: its subject
is the vault configuration, so defining the kind again clears it wherever it
sits.

## Relationships

- `from`, `to`: Node names or ids.
- `kind`: A key of `relationshipKinds` in `config.yaml`; it decides dash and
  arrowhead.
- `label`: What crosses, in a few words.
- `description`: Longer prose.
- `emphasis`: `normal` (default), `hero` for the board's spine, `muted` for
  context. Line weight only.
- `traffic`: `{}` for moving dots at the defaults (speed 40, volume 0.5);
  `{ "speed", "volume" }` positive finite numbers; omit for none.

Emphasis answers "what am I looking at": `hero` marks the spine, the path or
backbone the board exists to show. On a board of how one write lands, that is
the CLI's call into the canvas, the canvas's write through the board store and
the store's atomic write to the file; the lease, the version check and the
broadcast are the context that path runs through. Keep `hero` to about a third
of the relationships and never past half: weight is a contrast and spends
itself, and ten hero lines out of twelve make a heavier board, not an emphasised
one, sending the reader back to every label to find the line that matters.

The commoner mistake is the opposite: a board whose question has an answer
path, left all `normal`, hands the reader a flat picture and the work you
already did. If one sentence can say which relationships carry the board's
answer, those are `hero`, and saying it is the check; a board with no such
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
carries it, and so does every call between the entry point and that handler,
even when a short-circuit could skip them; teardown means closing a connection
or a cleanup hook. `speed`/`volume` above the defaults mark the hotter of two
runtime paths, not a busier-looking picture. To add or change it on an existing
relationship, restate that relationship with its `id`
([References](../SKILL.md#essentials)).

### A step is not a relationship

`emphasis` and `traffic` belong to a relationship; a flow step has neither. A
step takes `from`, `to`, `label`, `kind`, `note` and `repeat` (with `id` or `as`
to identify it) and nothing else, and `repeat` and `note` exist only there,
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
before it goes in a payload. That record decides what a valid payload cannot:
siblings are not a chain (rule 3), the receiver is the part and not its
container ([containment and receivers](#containment-and-receivers)), a return
travelling back is a flow step and not a second architecture relationship, and:

**The kind follows the mechanism**: a function call is a `call`; a value read
or handed over is `data`; a component drawing another is `render`; an emitted
event or a subscription is `event`; a message put on a queue is `queue`; an HTTP
request is `http`; a dependency the source imports but never calls at this level
is a `dependency`. Use the configured kind that names what the source does.

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

- unknown field: The payload has a key the schema lacks, and the line under it
  locates the subject. Check the spelling against [schemas](schemas.md), and
  check the key belongs on that subject: a step is not a relationship.
- unknown kind, level or group: Not a key of `config.yaml`. Use a configured
  one ([Vocabulary](../SKILL.md#essentials)).
- ambiguous name: Two nodes share the name; use the id from the family you read.
- unknown id: A stated `id` names nothing on that variant; new subjects leave
  `id` out. The one exception: a draft may restate a node it removed under the
  `subject` id of its open `deleted-and-changed` issue
  ([variants](variants.md)).
- dangling reference: An edge end, participant, step end, view selection or beat
  subject names nothing; fix the reference.
- containment cycle: A `parent` chain loops.
- self step: `kind: "self"` exactly when `from` and `to` are the same node.
- empty selection or empty walkthrough: A selection view names nothing; a
  walkthrough has no beats.
- invalid traffic or repeat: `speed`/`volume` are positive finite; `repeat` is
  an integer of 2 or more.
- too long: Names, labels and handles are single-line and bounded;
  responsibilities are bounded prose and may contain line breaks; descriptions
  are bounded.
- version moved (exit 5): Somebody wrote since you read; `semantic show` again
  and redo the change on what is there.
- held or claim revoked (exit 5): Another writer holds the board, or a person
  released your claim; stop and say so.

A `warnings` list on a successful answer says what the write did that you
should know: `UNKNOWN_VOCABULARY` means the board references vocabulary the
configuration no longer defines (`archboard check` names each reference), and
`RELATIONSHIP_REPLACED` means the batch removed a relationship and stated one
with the same ends and kind and at most one other property changed, or removed
one while such a restatement an earlier write added still stands: either way it
is the same relationship under a new id; restate it with its `id` next time.
`RELATIONSHIP_DUPLICATED` means the batch stated an existing relationship again
without its `id`, so both now stand; do not remove the original to tidy up, but
remove the copy and restate the original with its `id`.
