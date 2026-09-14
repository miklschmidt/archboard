# Authoring examples

Use these fragments in the JSON for `semantic new` or `semantic edit`.

## Containment and groups

Here two services each contain a module. Both modules explicitly belong to the
configured `fulfillment` group across their containers; the dispatcher is also
`billing`'s. Neither service is a member: membership is never inherited in either
direction.

```json
{
	"nodes": [
		{ "name": "Orders", "kind": "service" },
		{ "name": "Shipping", "kind": "service" },
		{
			"name": "Order validation",
			"kind": "module",
			"parent": "Orders",
			"responsibility": "Checks whether an order can be accepted",
			"groups": ["fulfillment"],
			"binding": { "repo": "github.com/acme/payments", "path": "src/orders/validation.ts" }
		},
		{
			"name": "Dispatch",
			"kind": "module",
			"parent": "Shipping",
			"groups": ["billing", "fulfillment"]
		}
	]
}
```

The ids must exist under `groups` in `.archboard/config.yaml`; a new unknown id
is refused while the configuration is valid. Then
`archboard semantic inspect payments --group fulfillment` lists the two modules,
the relationships between them, the relationships crossing the group's boundary
with their direction, and the immediate neighbors outside it.

## Link levels

Give a service's internals their own board, then link the service node to it.
Reuse an existing detail board when it already covers the subject. For example,
an Orders node on `payments` can link to a service board named `Order processing`:

```json
{
	"nodes": [
		{
			"name": "Orders",
			"kind": "service",
			"responsibility": "Accepts and tracks orders",
			"groups": ["fulfillment"],
			"drillDown": {
				"board": "Order processing",
				"variant": { "kind": "current" }
			}
		}
	]
}
```

`{"kind":"current"}` follows the target board's current architecture. To link
to a particular proposal or historical state, use
`{"kind":"named","name":"Queued validation"}`.

## Explain an exchange

This fragment extends the payments example. `as` gives a new subject a temporary
handle for references within the same write, useful for edges and flow steps.
The flow belongs to the selected variant; the view belongs to the board. Evolve
the same flow ID in a successor to compare that exchange through the same view.

```json
{
	"flows": [
		{
			"name": "Place order",
			"participants": ["Gateway", "Orders", "Orders DB"],
			"steps": [
				{ "from": "Gateway", "to": "Orders", "label": "Submit order", "kind": "sync" },
				{
					"as": "persist",
					"from": "Orders",
					"to": "Orders DB",
					"label": "Store order",
					"kind": "sync"
				},
				{ "from": "Orders", "to": "Gateway", "label": "Order accepted", "kind": "return" }
			]
		}
	],
	"views": [
		{
			"name": "Order exchange",
			"grammar": "data-flow",
			"scope": { "kind": "selection", "flows": ["Place order"] }
		}
	],
	"walkthroughs": [
		{
			"name": "Accepting an order",
			"beats": [
				{
					"heading": "Persist before acknowledging",
					"body": "Orders stores the order before returning acceptance to the gateway.",
					"subjects": ["Orders", "persist"],
					"view": "Order exchange"
				}
			]
		}
	]
}
```

For an architecture view, use `"grammar": "architecture"` and
`"scope": {"kind":"selection","nodes":["Orders","Orders DB"]}`. To isolate
particular relationships, select their IDs or same-write handles in `edges`.
With no edges selected, the view includes relationships between the selected
nodes. `{"kind":"all"}` includes the whole variant.
