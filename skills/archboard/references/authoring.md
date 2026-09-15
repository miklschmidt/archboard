# Authoring reference

Everything a node or relationship can say beyond the common recipes, and what
the CLI refuses. Fragments here go into the JSON of `semantic new` or
`semantic edit`.

## Nodes

| Field            | Meaning                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | One line a reader sees; unique enough to name the node in later payloads.                                                                                            |
| `kind`           | A key of `nodeKinds` in `config.yaml`. What the unit IS, whether it is drawn as a card or a container.                                                               |
| `responsibility` | Clear short prose the source supports, usually two or three rendered lines. Newlines are optional; the renderer wraps the complete value without a line-count limit. |
| `description`    | Longer detail, shown on inspection.                                                                                                                                  |
| `parent`         | The containing node, by name or id. At most one; containment is acyclic.                                                                                             |
| `groups`         | The configured group ids the node belongs to. Omit for none.                                                                                                         |
| `binding`        | Where the code is: `{ "repo", "path" }` plus optional `branch`, `commit`, `confirmedAt`.                                                                             |
| `drillDown`      | The board one level down: `{ "board": "<name>", "variant": { "kind": "current" } }` or `{ "kind": "named", "name": "<variant>" }`.                                   |

### Containment and receivers

`parent` says the child is part of the parent, and nothing about calls. A
relationship lands on the part that receives it: `Browser client -> Viewer
entry point -> Fetch semantic reads`, both internal parts parented to `Semantic
viewer`, not `Browser client -> Semantic viewer -> Fetch`. The renderer carries a
line across a container's boundary. A container is the endpoint only when the
source addresses the whole module (a dependency in a higher-level view). Any
part drawn with children is a container, whatever its `kind`: a class node
that holds its methods receives nothing itself, and a call to it lands on the
method whose body runs (`RequestContext.push`, not `Request context`). When
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
	"name": "Dispatch",
	"kind": "function",
	"parent": "Flask app",
	"groups": ["request-lifecycle", "sansio-core"]
}
```

`archboard semantic inspect <board> --group <id> [--variant <v>]` reports the
members, the relationships between them, the relationships crossing the
boundary with their direction, and the immediate neighbours outside, over the
whole variant: a member a view hides is still a member. A configured group
nobody has joined answers empty; an id that is neither configured nor on any
node is refused.

On the canvas, choose a group from the reading bar or from a selected node's
membership. Its drawn members stand out across containers while boundary
neighbours remain readable. Open **Details** for the complete report: every
member including ones the current view hides, internal relationships, directed
incoming and outgoing boundary relationships, and their immediate neighbours.

### Bindings

Register each checkout whose implementation you bind with `archboard repo add
<dir>`; the answer's `repo` is the identity (`github.com/pallets/flask`) and
every binding on every machine uses it with a repo-relative `path`. `branch`,
`commit` and `confirmedAt` record what you actually confirmed; restating the
node keeps them only if you restate them.

A binding names the implementation owner of the node's stated responsibility:
the file whose body does what the responsibility says. It is not the file
that imports the unit, registers it (a blueprint registration, a plugin
table, a CLI group), or calls it. `DefaultJSONProvider` binds to
`src/flask/json/provider.py`, where its class is written, not to
`src/flask/app.py`, which holds it as `app.json`, and not to `json/__init__.py`,
whose helpers call it. A planned part or an implementation unavailable for
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

## Relationships

| Field         | Meaning                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `from`, `to`  | Node names or ids.                                                                                                           |
| `kind`        | A key of `relationshipKinds` in `config.yaml`; it decides dash and arrowhead.                                                |
| `label`       | What crosses, in a few words.                                                                                                |
| `description` | Longer prose.                                                                                                                |
| `emphasis`    | `normal` (default), `hero` for the few central lines, `muted` for context. Line weight only.                                 |
| `traffic`     | `{}` for moving dots at the defaults (speed 40, volume 0.5); `{ "speed", "volume" }` positive finite numbers; omit for none. |

Traffic is authored intent, not measurement: it belongs on the relationships
the source shows a request or event travelling, and a static render cannot
show it moving. Restate an existing relationship with its `id` to add or
change its traffic; restated without the id it is a new relationship.

### Evidence for a relationship

Every relationship is a directional claim that source must support. Before it
goes in a payload, hold one line for it: `from` → `to`, the `kind`, the claim in
words, and the source file and function or symbol where the mechanism appears.
For a call, `from` is the caller whose body makes it and `to` is the receiver
whose body runs. For another kind, make the endpoints follow the stated claim:
A reads from B, publishes to B, or depends on B. A return travelling back is a
flow step, not a second architecture relationship. The record decides three
things a valid payload cannot:

- **Siblings are not a chain.** When `full_dispatch_request` calls
  `preprocess_request` and then `dispatch_request`, the evidence is two lines
  from `full_dispatch_request`. Drawing `preprocess_request → dispatch_request`
  because they run in that order states a call the source does not make.
- **The receiver is the part, not its container**, unless the source addresses
  the whole module. Containment says nothing about calls.
- **The kind follows the mechanism.** A function call is a `call`; a value
  read or handed over is `data`; an HTTP request is `http`; a dependency the
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
| unknown field                        | The payload has a key the schema lacks; check the spelling against [schemas](schemas.md).                                                                                                                                    |
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

A `warnings` list on a successful answer means the board references vocabulary
the configuration no longer defines; `archboard check` names each reference.
