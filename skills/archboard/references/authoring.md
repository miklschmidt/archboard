# Authoring reference

Everything a node or relationship can say beyond the common recipes, and what
the CLI refuses. Fragments here go into the JSON of `semantic new` or
`semantic edit`.

## Nodes

| Field            | Meaning                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`           | One line a reader sees; unique enough to name the node in later payloads.                                                                                                |
| `kind`           | A key of `nodeKinds` in `config.yaml`. What the unit IS, whether it is drawn as a card or a container. A node standing for another board takes that board's level.       |
| `responsibility` | Clear short prose the source supports, usually two or three rendered lines. Newlines are optional; the renderer wraps the complete value without a line-count limit.     |
| `description`    | Longer detail, shown on inspection.                                                                                                                                      |
| `parent`         | The containing node, by name or id. At most one; containment is acyclic.                                                                                                 |
| `groups`         | The configured group ids the node belongs to. Omit for none.                                                                                                             |
| `binding`        | Where the code is: `{ "repo", "path" }` plus optional `branch`, `commit`, `confirmedAt`.                                                                                 |
| `drillDown`      | The board this part opens: `{ "board": "<name>", "variant": { "kind": "current" } }` or `{ "kind": "named", "name": "<variant>" }`. Only on a part that is really there. |

### Containment and receivers

`parent` says the child is part of the parent, and nothing about calls. A
relationship lands on the part that receives it: `Browser client -> Viewer
entry point -> Fetch semantic reads`, both internal parts parented to `Semantic
viewer`, not `Browser client -> Semantic viewer -> Fetch`. The renderer carries a
line across a container's boundary. A container is the endpoint only when the
source addresses the whole module (a dependency in a higher-level view). Any
part drawn with children is a container, whatever its `kind`: a module, class
or component node that holds its functions, methods or child components
receives nothing itself, and a call to it lands on the child whose body runs.
When
you give an existing part children, move every relationship that landed on it
to the child that receives it. Before presenting, trace each incoming call to
its actual receiver; valid ids alone cannot tell you this.

### Groups

A group crosses containment: two modules in different services can be part of
one effort, and one module of two. Membership is explicit on each member,
never inherited by or from a container, and the ids come from `groups` in
`config.yaml` (`{ "<id>": { "name": "<display name>" } }`). Renaming a group
changes no board. Before every write that adds parts, read the configured
groups and ask of each new part which of those concerns it serves; a
configured group the source places a part in and the part does not list is a
membership the board lacks. Groups assign no color: color is a property of a
kind in `config.yaml` (`nodeKinds.<kind>.color`, `relationshipKinds.<kind>.color`
from the curated palette), never of a board, a node or a group. A container
with a colored kind tints its contents, and each node's icon chip says its
own kind; a vault whose kinds carry no color draws every board neutral, which
is a configuration question for the vault's owner, not a reason to touch
`config.yaml` while authoring a board.

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

On the canvas, choose a group from the sidebar's Board tab or from a selected node's
membership. Its drawn members stand out across containers while boundary
neighbours remain readable. Open **Details** for the complete report: every
member including ones the current view hides, internal relationships, directed
incoming and outgoing boundary relationships, and their immediate neighbours.

### Bindings

Register each checkout whose implementation you bind with `archboard repo add
<dir>`; the answer's `repo` is the identity (such as `github.com/<owner>/<name>`) and
every binding on every machine uses it with a repo-relative `path`. `branch`,
`commit` and `confirmedAt` record what you actually confirmed; restating the
node keeps them only if you restate them.

A binding names the implementation owner of the node's stated responsibility:
the file whose body does what the responsibility says. It is not the file
that imports the unit, registers it (a command table, a plugin table, a route
mount), or calls it. A command's handler binds to the file where the handler
is written, not to the table that registers the command and not to the
dispatcher that calls it. A planned part or an implementation unavailable for
inspection stays unbound. A part implemented in another checkout may bind
after you inspect its owner and register that repository. When one node's
responsibility is implemented across files, say less (narrow the responsibility
to what one file owns) or say more (split the node) rather than bind to a file
that does only part of it.

### Drill-down

Give a service's internals their own board and link the node to it. `current`
follows the target board's designation; `named` opens that variant and never
falls back to current when the name is gone. Reuse an existing detail board
rather than creating a second one for the same subject: before a write that
adds a part at the service or system level, `archboard semantic` lists the
vault's boards, and a board whose subject is that part's internals is a
`drillDown` on the part, not a reason to draw its internals again.

**The kind is the linked board's level.** A node standing for what another
board describes carries that board's level as its kind: a `system` board is
stood for by a node of kind `system`, a `service` board by `service`, a
`module` board by `module`, so a reader sees where one level joins the next
without opening anything. `external` is not that kind. It means code this
codebase does not own — a library, a framework, a runtime, a shell, a hosted
service, a caller outside the checkout — and saying it about one of our own
parts tells the reader the opposite of what is true.

**The link sits on a part that is really there.** A drill-down is a property of
a part the board draws for its own sake, never a node added to carry it: a node
whose only reason to exist is the link is a button, and a diagram has no
buttons. Draw the actual caller; when the callers abstract to one system, that
abstraction is the node, with its own relationships. Which way the link points
says where it sits:

- **Up**, to the board this board is a part of, goes on the container the board
  describes — never on a card standing beside the parts. Often there is no such
  container and therefore no upward link, which is the right board.
- **Down or sideways** goes on a card: a module board that shows `calls this
module` draws an edge to a node of kind `module` whose drill-down opens it.

`archboard check` reports all three mistakes on a saved board, as warnings
naming the node: `DRILL_DOWN_ONLY_NODE` (nothing but the link — no
relationship, no children, no part in a flow), `DRILL_DOWN_UNKNOWN_BOARD` (the
vault holds no such board, so the link opens nothing) and
`DRILL_DOWN_LEVEL_MISMATCH` (the kind disagrees with the level of the board it
opens).

## Relationships

| Field         | Meaning                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `from`, `to`  | Node names or ids.                                                                                                           |
| `kind`        | A key of `relationshipKinds` in `config.yaml`; it decides dash and arrowhead.                                                |
| `label`       | What crosses, in a few words.                                                                                                |
| `description` | Longer prose.                                                                                                                |
| `emphasis`    | `normal` (default), `hero` for the board's spine, `muted` for context. Line weight only.                                     |
| `traffic`     | `{}` for moving dots at the defaults (speed 40, volume 0.5); `{ "speed", "volume" }` positive finite numbers; omit for none. |

Emphasis is the board's answer to "what am I looking at". Mark the spine: the
path or backbone the board exists to show. On a board of how one write lands,
that is the CLI's call into the canvas, the canvas's write through the board
store and the store's atomic write to the file; the lease, the version check
and the broadcast are the context that path runs through. Keep `hero` to about
a third of the relationships and never past half. Weight is a contrast and
spends itself: ten hero lines out of twelve is not an emphasised board, it is a
heavier one, and the reader is back to reading every label to find the line
that matters.

The commoner mistake is the opposite one. A board whose question has an answer
path, with every relationship left `normal`, hands the reader a flat picture and
the work you already did. If you can say in one sentence which relationships
carry the board's answer, those are the `hero` ones, and saying it is the check:
a board with no such sentence — a catalogue of parts, a dependency map — has no
spine and marks nothing, which is correct for it.

`muted` is an instruction of its own, not a leftover. Put it on the
relationships that have to be on the board for it to be honest but are not part
of the answer: a registration made once at startup, a configuration read, a
dependency that explains where a part comes from, a teardown path. Muting those
is what lets the unmarked majority read as ordinary and the spine read as the
subject.

Traffic is authored intent, not measurement: it belongs on the relationships
the source shows a request or event travelling forward on every pass, so a
reader sees the hot path against everything else, and a static render cannot
show it moving. Stamping it on every relationship says nothing. A call a
normal pass always makes is on that path even when an error or a short-circuit
could skip it: the call that hands a request to its handler carries traffic,
and so does every call between the entry point and that handler. It
never goes on teardown (closing a connection, a cleanup hook), an error or exception
path, an optional hook most passes skip, startup, registration or a one-shot
call;
`speed`/`volume` above the defaults mark the hotter of two runtime paths,
not a busier-looking picture. Restate an existing relationship with its `id`
to add or change its traffic; restated without the id it is a new
relationship.

### A step is not a relationship

`emphasis` and `traffic` are properties of a relationship, and a flow step has
neither. A step takes `from`, `to`, `label`, `kind`, `note` and `repeat` (with
`id` or `as` to identify it) and nothing else; `repeat` and `note` in turn exist
only there, never on a relationship. A node carries none of the four: emphasis
is a property of a line, not of a part.

A step carrying `emphasis` is refused with `Unrecognized key: "emphasis"` over a
second line locating it, `→ at flows[0].steps[0]`. Read that line: the refusal
is about those steps, not about the payload. Take the key off the steps it
names and keep it on the relationships between the same parts, where it is
legal. Removing emphasis from the whole payload is how a write ends up with the
flow repaired and the emphasis lost where it was right.

### Evidence for a relationship

Every relationship is a directional claim that source must support. Before it
goes in a payload, hold one line for it: `from` → `to`, the `kind`, the claim in
words, and the source file and function or symbol where the mechanism appears.
For a call, `from` is the caller whose body makes it and `to` is the receiver
whose body runs. For another kind, make the endpoints follow the stated claim:
A reads from B, renders B, emits an event B handles, publishes to B, or depends
on B. A return travelling back is a
flow step, not a second architecture relationship. The record decides three
things a valid payload cannot:

- **Siblings are not a chain.** When `apply()` calls `validate()` and then
  `persist()`, the evidence is two lines from `apply`. Drawing
  `validate → persist` because they run in that order states a call the source
  does not make.
- **The receiver is the part, not its container**, unless the source addresses
  the whole module. Containment says nothing about calls.
- **The kind follows the mechanism.** A function call is a `call`; a value
  read or handed over is `data`; a component drawing another is `render`; an
  emitted event or a subscription is `event`; a message put on a queue is
  `queue`; an HTTP request is `http`; a dependency the
  source imports but never calls at this level is a `dependency`. Use the
  configured kind that names what the source does.

After the write, read the saved `edges` against the record: every relationship
has a line, every line has a relationship, and no relationship exists without
one. A picture that needs a relationship the source lacks is wrong however
readable it is.

## Handles and removals

`as` on a new node, relationship, flow or step gives it a name for this one
write, so a view can select the relationship or a beat can name the step in the
same payload. Handles are never stored.

`removeNodes`, `removeFlows`, `removeViews` and `removeWalkthroughs` take names
or ids; `removeEdges` takes an id because a relationship has no name. Removing
a node removes its relationships; a step or a beat is removed by restating its
flow or walkthrough without it.

## What the CLI refuses, and what to do

Every refusal names the rule and the subject. Repair the payload from that
reason; do not change the vocabulary or invent an id to get past it, and never
open the board's file in the vault to change ids, `version`, `lifecycle`,
`adoptions` or `reconciliation` by hand: the server owns the file, and a
board patched outside the CLI is a board the product no longer vouches for.
A second attempt at the same write needs new evidence (a different id you
read, a field the refusal named, a version you re-read); the same payload
sent again is refused again. When the supported commands cannot satisfy the
request (an operation the CLI does not offer, an id nothing on the board can
name), stop with the board valid as it stands and report what remains
unresolved and why, rather than approximate it another way.

| Refusal                              | Meaning and repair                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unknown field                        | The payload has a key the schema lacks, and the line under it locates the subject. Check the spelling against [schemas](schemas.md), and check the key belongs on that subject: a step is not a relationship.                |
| unknown kind, level or group         | Not a key of `config.yaml`. Use a configured one; extend the file only when the request is about vocabulary, then `archboard check`.                                                                                         |
| ambiguous name                       | Two nodes share the name; use the id from the family you read.                                                                                                                                                               |
| unknown id                           | A stated `id` names nothing on that variant; new subjects leave `id` out. The one exception: a draft may restate a node it removed under the `subject` id of its open `deleted-and-changed` issue ([variants](variants.md)). |
| dangling reference                   | An edge end, participant, step end, view selection or beat subject names nothing; fix the reference.                                                                                                                         |
| containment cycle                    | A `parent` chain loops.                                                                                                                                                                                                      |
| self step                            | `kind: "self"` exactly when `from` and `to` are the same node.                                                                                                                                                               |
| empty selection or empty walkthrough | A selection view names nothing; a walkthrough has no beats.                                                                                                                                                                  |
| invalid traffic or repeat            | `speed`/`volume` are positive finite; `repeat` is an integer of 2 or more.                                                                                                                                                   |
| too long                             | Names, labels and handles are single-line and bounded; responsibilities are bounded prose and may contain line breaks; descriptions are bounded.                                                                             |
| version moved (exit 5)               | Somebody wrote since you read; `semantic show` again and redo the change on what is there.                                                                                                                                   |
| held or claim revoked (exit 5)       | Another writer holds the board, or a person released your claim; stop and say so.                                                                                                                                            |

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
