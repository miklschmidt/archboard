# Sequences, views and walkthroughs

## Flows

A flow is an ordered exchange between nodes of one variant.

- `participants` are the columns, in the order they are drawn: put the caller
  first and read left to right. Participants compare as a set; their order is
  presentation intent.
- `steps` are messages in sequence, each `from` one participant `to` another
  with a `label` and a `kind`:

| Kind     | Use                                                                       |
| -------- | ------------------------------------------------------------------------- |
| `sync`   | A call that waits (the default).                                          |
| `return` | The answer travelling back.                                               |
| `async`  | Sent and not waited for: an event, a queue put, a fire-and-forget task.   |
| `self`   | A participant's own step. Exactly when `from` and `to` are the same node. |

- `repeat` (an integer of 2 or more) says one step happens that many times in a
  run: four batched requests are one step with `repeat: 4`.
- `note` is a caveat on one step, shown beside it.
- A flow may have one participant whose steps are all `self`: a component's own
  sequence is a real explanation.
- A step's position is meaningful; a step keeps its identity by the action it
  represents. Restate a flow to insert, remove or reorder steps, keeping the ids
  of continuing calls and returns even when their order or payload changes; a
  flow written again without its ids reads as a wholesale deletion and
  addition.

## Views

Views belong to the board and apply to every variant; editing one is a change
to the board's shared reading even when the batch names a variant.

| Grammar        | Shows                                                  |
| -------------- | ------------------------------------------------------ |
| `architecture` | Nodes, containment and relationships of the selection. |
| `data-flow`    | The selected flow as a sequence: columns and messages. |

`scope` is either `{ "kind": "all" }` or a selection:

- **A region**: `{ "kind": "selection", "nodes": [...] }` with no `edges` shows
  every relationship among the kept nodes.
- **One relationship isolated**: name it in `edges` by id or same-write handle;
  then only the named relationships are shown.
- **A sequence**: `{ "kind": "selection", "flows": ["<flow>"] }` with the
  `data-flow` grammar.

Both ends of a shown relationship, every participant of a shown flow, and every
container they sit inside come with the selection. A selection that names
nothing that exists on a variant draws nothing; it never falls back to the whole
board. A comparison keeps a selected subject the proposal removed, drawn as
removed. Render a view with `semantic render <board> --view <name>`; without
`--view` the whole variant is drawn, never the first view.

## Walkthroughs

A walkthrough explains one variant in ordered `beats`, each with a `heading`,
a `body`, optional `subjects` and an optional `view`.

- `subjects` are nodes, relationships, flows or steps. Name a node or flow by
  its name or id; name a relationship or step, which has no name, by id. A new
  subject of any of those kinds can use its same-write handle. They are
  highlighted while the beat is read and compare as a set.
- An opening beat may name no subjects: it is about the whole picture.
- `view` switches what the reader looks at for this beat ("now follow one
  request"); a beat without one is told through what is already shown.
- A beat keeps its `id` through rewording and reordering; restate the
  walkthrough with the ids you read. A beat without an id is a new beat, and a
  beat id from another walkthrough is refused. When a subject a beat names is
  removed, point the beat at its successor in the same batch.
