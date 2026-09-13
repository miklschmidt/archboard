---
status: accepted
---

# Explicit traffic controls distance-based animation

Current moving dots use a fixed traversal duration, so long connections animate
faster than short connections. TASK-203 separates traffic from emphasis and makes
volume and speed independent, so agents can communicate traffic deliberately.
The requirements below were accepted through Q32 of the TASK-203 interview on
2026-09-13. Implementation remains pending the final review of the consolidated plan.

Traffic, traffic volume and traffic speed are defined in
[CONTEXT.md](../../CONTEXT.md#meaning). The rates and rendering decisions belong here.

## Settled requirements

- Traffic is optional connection data. When the traffic field is absent, the
  renderer does not draw traffic animation. Presence enables it, including an empty
  object using defaults; there is no separate enabled field.
- Omitted traffic volume defaults to 0.5 dots per second within traffic.
- Speed is expressed in diagram coordinate units per second, independently of zoom.
  Omitted traffic speed defaults to 40 diagram units per second within traffic.
- Supplied speed and volume must be positive and finite. Omission of traffic is
  the single off state; zero volume, zero speed and a separate enabled flag are
  unnecessary states for this illustration-only contract.
- Route length must not change the configured speed. Emphasis does not supply
  traffic, volume or speed implicitly.
- Traffic starts distributed along the route, illustrating ongoing flow without
  waiting for the route to fill from its source.
- Removed comparison edges and reduced-motion readers show no moving dots.
  SVG exports retain animation where supported, without adding an export legend.
- These are animation properties, not measured real-world traffic. Do not expose
  their numeric values in the browser inspector or add a parallel telemetry schema;
  a connection label can communicate meaningful real-world traffic information.
- A traffic change marks the connection as changed. The entire traffic object
  counts as one property for connection identity validation: changing speed and
  volume together retains identity, while changing traffic and destination counts
  as two changes. Compare effective values by value, including defaults; an empty
  traffic object and explicitly supplied defaults are equivalent, while omission
  and an empty object are different. This is an explicit comparison treatment of
  authored animation intent, not a claim that its numbers measure the architecture.

For a routed path of length L, speed S and volume V, a complete traversal takes
L/S seconds and dots enter at intervals of 1/V seconds for positive S and V.
The agreed volume default means one dot every two seconds. Steady-state spacing
is S/V diagram units. Longer paths hold more dots rather than accelerating them;
the exact animation machinery remains an implementation choice.

At the defaults, a 300-unit connection takes 7.5 seconds to traverse, and dots are
spaced 80 units apart along the path. Pre-population makes ongoing flow visible
immediately. These defaults are the agreed starting point for visual QA.

This extends the separation of visual channels in
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md). The final
implementation must demonstrate equal distance per second and equal dot-entry
rates on short and long paths with the same traffic values.
