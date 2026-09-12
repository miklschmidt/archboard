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

Choose one subject and level of detail. A system board shows collaborating
services; a service board shows modules within one service; a module board can
show its functions. Use separate linked boards when exploring deeper.

```bash
archboard semantic new payments --doing "describing payment processing" <<'JSON'
{
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
- **Views:** give a reading a `name`, a `grammar` (`architecture` or `data-flow`)
  and a `scope`. An architecture view selects nodes or edges; a data-flow view
  selects a flow.
- **Walkthroughs:** explain the board through ordered `beats`, each with a
  `heading`, `body`, relevant `subjects` and optional `view`.

For JSON examples of containment, links, flows, views and walkthroughs, see
[authoring examples](references/architecture-workflow.md).

## Edit and propose

Read with `semantic show <board>`. Make one requested change in one
`semantic edit` batch, naming the target `variant` in its JSON. Omit it to edit
current. Include `--expect-version` with the version you read and a short
`--doing` description on each write.

Keep existing subject IDs, including when renaming. Omit IDs on new subjects;
references accept existing IDs or names. Each supplied subject replaces its
previous definition, so retain its fields. Unmentioned subjects stay; use the
matching `removeNodes`, `removeEdges`, `removeFlows`, `removeViews` or
`removeWalkthroughs` list to delete them.

Branch a proposal from the variant being discussed, then edit that proposal.
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

Adopt when asked with `semantic adopt`: the proposal becomes current and the
previous current variant becomes historical. For substantial work across
multiple writes, `claim` the board first and `release` it when finished.
