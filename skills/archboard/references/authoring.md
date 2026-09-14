# Authoring reference

Everything a node or relationship can say beyond the common recipes, and what
the CLI refuses. Fragments here go into the JSON of `semantic new` or
`semantic edit`.

## Nodes

| Field            | Meaning                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | One line a reader sees; unique enough to name the node in later payloads.                                                          |
| `kind`           | A key of `nodeKinds` in `config.yaml`. What the unit IS, whether it is drawn as a card or a container.                             |
| `responsibility` | One line the source supports.                                                                                                      |
| `description`    | Longer prose, shown on inspection.                                                                                                 |
| `parent`         | The containing node, by name or id. At most one; containment is acyclic.                                                           |
| `groups`         | The configured group ids the node belongs to. Omit for none.                                                                       |
| `binding`        | Where the code is: `{ "repo", "path" }` plus optional `branch`, `commit`, `confirmedAt`.                                           |
| `drillDown`      | The board one level down: `{ "board": "<name>", "variant": { "kind": "current" } }` or `{ "kind": "named", "name": "<variant>" }`. |

### Containment and receivers

`parent` says the child is part of the parent, and nothing about calls. A
relationship lands on the part that receives it: `Browser client -> Viewer
entry point -> Fetch semantic reads`, both internal parts parented to `Semantic
viewer`, not `Browser client -> Semantic viewer -> Fetch`. The renderer carries a
line across a container's boundary. A container is the endpoint only when the
source addresses the whole module (a dependency in a higher-level view). Before
presenting, trace each incoming call to its actual receiver; valid ids alone
cannot tell you this.

### Groups

A group crosses containment: two modules in different services can be part of
one effort, and one module of two. Membership is explicit on each member,
never inherited by or from a container, and the ids come from `groups` in
`config.yaml` (`{ "<id>": { "name": "<display name>" } }`). Renaming a group
changes no board. Groups assign no color: a container gives its contents their
body color, and each node's icon chip says its own kind.

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

Register the checkout once with `archboard repo add <dir>`; the answer's `repo`
is the identity (`github.com/pallets/flask`) and every binding on every machine
uses it with a repo-relative `path`. A planned part has no binding. `branch`,
`commit` and `confirmedAt` record what you actually confirmed; restating the
node keeps them only if you restate them.

### Drill-down

Give a service's internals their own board and link the node to it. `current`
follows the target board's designation; `named` opens that variant and never
falls back to current when the name is gone. Reuse an existing detail board
rather than creating a second one for the same subject.

## Relationships

| Field         | Meaning                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `from`, `to`  | Node names or ids.                                                                                                           |
| `kind`        | A key of `relationshipKinds` in `config.yaml`; it decides dash and arrowhead.                                                |
| `label`       | What crosses, in a few words.                                                                                                |
| `description` | Longer prose.                                                                                                                |
| `emphasis`    | `normal` (default), `hero` for the few central lines, `muted` for context. Line weight only.                                 |
| `traffic`     | `{}` for moving dots at the defaults (speed 40, volume 0.5); `{ "speed", "volume" }` positive finite numbers; omit for none. |

Traffic illustrates flow. It is authored intent, not measurement, and a static
render cannot show it moving: when you report it, say it illustrates.

## Handles and removals

`as` on a new node, relationship, flow or step gives it a name for this one
write, so a view can select the relationship or a beat can name the step in the
same payload. Handles are never stored.

`removeNodes`, `removeFlows`, `removeViews` and `removeWalkthroughs` take names
or ids; `removeEdges` takes an id because a relationship has no name. Removing
a node removes its relationships; a step or a beat is removed by restating its
flow or walkthrough without it.

## What the CLI refuses, and what to do

Every refusal names the rule and the subject. Repair the payload; do not change
the vocabulary or invent an id to get past it.

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
| too long                             | Names, responsibilities, labels and handles are one line and bounded; descriptions are bounded.                                                                                                                              |
| version moved (exit 5)               | Somebody wrote since you read; `semantic show` again and redo the change on what is there.                                                                                                                                   |
| held or claim revoked (exit 5)       | Another writer holds the board, or a person released your claim; stop and say so.                                                                                                                                            |

A `warnings` list on a successful answer means the board references vocabulary
the configuration no longer defines; `archboard check` names each reference.
