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
| `sync`   | A call that waits (the default), an awaited promise included.             |
| `return` | The answer travelling back.                                               |
| `async`  | Sent and not waited for: an event, a queue put, a promise nobody awaits.  |
| `self`   | A participant's own step. Exactly when `from` and `to` are the same node. |

- `repeat` (an integer of 2 or more) says one step happens exactly that many
  times in a run, and only when the source fixes the count: a retry limit
  written as a number, a batch of a stated size, a literal list of candidates
  tried in turn (a loop over two fixed file names is `repeat: 2`, and its
  early exit on the first that exists is the `note`). A loop over a list whose
  length depends on data, or a retry until success, is one step with a `note`
  saying so; a count the source does not state is a count you invented.
- `note` is a caveat on one step, shown beside it: a condition under which the
  step happens (a branch), a loop whose count is not fixed, a detail the label
  cannot carry.
- Before writing, record each step's evidence (caller, receiver, the function
  that makes the call) and check three things against the source: the order
  the steps run in, which steps come back as a `return` to their caller, and
  which steps happen only on a branch. After the write, read the saved steps
  in order against that record.
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

`scope` is either `{ "kind": "all" }` or a selection, and a selection means
one of two different things. Decide which the request asks for before writing
the view, and check the saved `scope` afterwards:

- **Node-region inclusion**: `{ "kind": "selection", "nodes": [...] }` with no
  `edges`. Every relationship among the kept nodes is drawn, whatever
  connects them now or later. Use it when the request says "these parts and
  how they are wired".
- **Explicit-edge isolation**: name relationships in `edges`, by id or
  same-write handle. Only those relationships are drawn; another relationship
  between the same parts stays out. Use it when the request says "only this
  call" or "not that one". Listing `nodes` as well does not add their other
  relationships back.
- **A sequence**: `{ "kind": "selection", "flows": ["<flow>"] }` with the
  `data-flow` grammar. A sequence drawn without its view is the architecture
  picture, not the exchange.

Both ends of a shown relationship, every participant of a shown flow, and every
container they sit inside come with the selection. A selection that names
nothing that exists on a variant draws nothing; it never falls back to the whole
board. A comparison keeps a selected subject the proposal removed, drawn as
removed. Draw a view with `semantic rasterize <board> --view <name> --out
<file.png>` (or `semantic render` for SVG); without `--view` the whole variant
is drawn, never the first view. When the request asks for a picture of a
view, look at that view's picture, not the whole board's.

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
