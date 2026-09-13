---
name: archboard
description: >-
  Author architecture boards, propose changes as variants, link system, service
  and module detail, bind nodes to code, or render diagrams with the archboard CLI.
---

# Archboard

Write a board's architecture as JSON: its parts, relationships and explanations.
Archboard renders it. Use `archboard help <command>` for command syntax; inside
this checkout, use `./bin/canvas` in place of `archboard`.

## Write a board

Choose one diagram or architectural question and level of detail. Give the board
a short semantic name describing its subject, such as `Payment processing`,
`Board persistence` or `Renderer layout`. Board names are human navigation labels,
not repository paths or directory hierarchies. Put code paths in node bindings.
Every board requires a `level` chosen from the consumer's configured vocabulary.
Read the listing's `levels` with `archboard semantic` before creating boards.
The usual values are `system` (collaborating services), `service` (modules within
one service), and `module` (functions within a module). The level belongs to the
board, is shared by every variant, and appears beside its name in navigation.
Use separate linked boards when exploring deeper.

The consumer owns the enum in `<vault>/.archboard/config.json`, for example
`{ "levels": ["system", "service", "module"] }`. Use a configured value; do not
invent one, omit the field, or change the vocabulary merely to make a write pass.

```bash
archboard semantic new payments --doing "describing payment processing" <<'JSON'
{
  "level": "system",
  "nodes": [
    { "name": "Gateway", "kind": "service", "responsibility": "Routes incoming requests" },
    { "name": "Orders", "kind": "service", "responsibility": "Accepts and tracks orders", "group": "Fulfillment" },
    { "name": "Orders DB", "kind": "datastore", "group": "Fulfillment" }
  ],
  "edges": [
    { "from": "Gateway", "to": "Orders", "kind": "http", "label": "place order" },
    { "from": "Orders", "to": "Orders DB", "kind": "data", "label": "persist order" }
  ]
}
JSON
archboard semantic show payments
archboard semantic render payments --out payments.svg
```

## Choose the meaning

- **Nodes:** give each part a `name`, `kind` and short `responsibility`. Use
  `description` for detail. Kinds are `service`, `app`, `module`, `function`,
  `route`, `job`, `queue`, `datastore`, `cache`, `external`, `ui`, `config`,
  `test`, `package`, `other`.
- **Containment:** `parent` names the containing node, such as a module's
  service. Each node has at most one parent; containment is acyclic.
- **Boundaries and entry points:** when a caller reaches an internal function,
  route or component, connect to that subject inside its `parent`. The renderer
  carries the edge across the boundary. Do not split one interaction into
  caller → container and container → child: containment does not make the
  container a caller. For example, model Browser client → Viewer entry point
  → Fetch semantic reads, with both internal subjects parented to Semantic
  viewer. Reuse an existing entry-point subject, or add the actual code-backed
  responsibility; never invent a relay node just to steer a line. A container
  endpoint is appropriate for a relationship to the whole module (such as a
  dependency in a higher-level view). Before presenting, trace each incoming
  call to its actual receiver and check that each container endpoint has that
  whole-module meaning. This requires semantic judgment; valid containment
  and endpoint IDs alone cannot verify it.
- **Groups:** `group` labels a shared domain or concern, such as `Fulfillment`.
  It can span containers. Each node has one optional group, set explicitly;
  children do not inherit it.
- **Code:** `binding: { "repo": "github.com/acme/payments", "path": "src/orders" }`
  points to the code implementing that node. Register the checkout with
  `archboard repo add /path/to/payments`; use its repository identity and a
  repo-relative path in the binding.
- **Edges:** name `from`, `to` and the relationship `kind`: `call`, `http`, `rpc`,
  `event`, `queue`, `data`, `dependency`, `render`, `other`. Add a short `label`
  for what crosses. Use `emphasis: "hero"` for the few relationships central
  to the explanation.
- **Flows:** name the exchange, list its `participants`, then ordered `steps`
  with `from`, `to`, `label` and message `kind`: `sync`, `async`, `return`, `self`.
- **Views:** the board owns one shared set of named readings. Give each a `name`,
  a `grammar` (`architecture` or `data-flow`) and a `scope`. An architecture view
  selects nodes or edges; a data-flow view selects a flow. Every variant uses
  these same views. A comparison includes selected subjects removed from its
  predecessor; a view is empty when neither state contains its selected subjects.
- **Walkthroughs:** explain the board through ordered `beats`, each with a
  `heading`, `body`, relevant `subjects` and optional `view`.

For JSON examples of containment, links, flows, views and walkthroughs, see
[authoring examples](references/architecture-workflow.md).

## Edit and propose

Read with `semantic show <board>`. Make one requested change in one
`semantic edit` batch, naming the target `variant` in its JSON. Omit it to edit
current. Include `--expect-version` with the version you read and a short
`--doing` description on each write.

Before editing, map the intended changes to the subjects you read:

- **Continuation:** retain the ID when the same module, relationship, exchange or
  action evolves. A renamed module or reordered call keeps its identity.
- **Replacement:** remove the old subject and create its replacement without an
  ID. Similar names, positions or source paths do not make two implementations
  the same architectural unit. Keep bindings only when they implement that unit;
  a planned replacement can have no binding yet.
- **Untouched:** leave its definition alone. Rewording every responsibility makes
  every card appear changed and hides the actual architectural delta.

For connections, count changed authored properties against the direct predecessor:
`from`, `to`, `kind`, `label`, `description` and `emphasis`. The CLI enforces this
after resolving node references and defaults, including changes spread across
separate edits:

- **One change:** the connection can retain its ID. A label clarification between
  the same nodes, or the same labelled connection targeting a new node, can be a
  continuation.
- **Two or more changes:** treat it as a replacement. Put the old edge ID in
  `removeEdges` and add the new edge without an ID in the same batch.

For example, Render driver → Grid placement (“place grid”) becoming Render
driver → Compound layout (“graph and measured sizes”) changes both destination
and label: show one removed edge and one added edge. Compare endpoint IDs, not
display names; renaming the same node does not count as changing the connection.

For an evolving sequence, retain the flow ID for the same request or exchange.
Match its steps by the action each represents, preserving IDs for continuing
calls and returns even when their order or payload changes. Add genuinely new
actions and remove obsolete ones. Recreating a flow or all its steps produces a
wholesale deletion and addition, not a comparison of the exchange's evolution.

References accept existing IDs or names. Each supplied subject replaces its
previous definition, so retain its fields. Unmentioned subjects stay; use the
matching `removeNodes`, `removeEdges`, `removeFlows`, `removeViews` or
`removeWalkthroughs` list to delete them.

Variants describe the evolution of the same diagram. Branch from the state being
discussed, then edit that successor; competing successors form branches in the
board's tree. A view edit changes the board's shared reading, even when
the batch targets a particular variant. Use linked boards for different subjects
or questions, rather than variants with unrelated diagrams.

For the example board at version 1:

```bash
archboard semantic branch payments --from current --as "Read cache" \
  --expect-version 1 --doing "proposing an order cache"
archboard semantic edit payments --expect-version 2 --doing "adding the read cache" <<'JSON'
{
  "variant": "Read cache",
  "nodes": [{ "name": "Orders Cache", "kind": "cache" }],
  "edges": [{ "from": "Orders", "to": "Orders Cache", "kind": "data", "label": "cache order reads" }]
}
JSON
archboard semantic render payments --variant "Read cache" --out proposal.svg
```

Before presenting a proposal, read the saved family and render the predecessor
and proposal through the **same board view**. Verify both the IDs and the picture:

- Added, removed, changed and untouched subjects match your intended change map.
- Selected deleted flows, calls and participants remain visibly marked as removed.
  A subject absent from the picture is not evidence that its deletion is shown.
- A continuing exchange has a meaningful step comparison. An entirely green
  sequence or entirely changed cast needs an explanation grounded in the intended
  change, not merely a successful render.

Repair authoring errors before presenting. If the saved comparison is correct
but the picture omits a change, report the renderer bug; keep the architecture
truthful instead of adding fake subjects or changing IDs to force a visual result.

Adopt when asked with `semantic adopt`: the proposal becomes current and the
previous current variant becomes historical. For substantial work across
multiple writes, `claim` the board first and `release` it when finished.
