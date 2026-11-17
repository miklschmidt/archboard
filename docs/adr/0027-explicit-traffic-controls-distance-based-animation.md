---
status: accepted
---

# Explicit traffic controls distance-based animation

Current moving dots use a fixed traversal duration, so long connections animate
faster than short connections. TASK-203 separates traffic from emphasis and
makes volume and speed independent, so agents can communicate traffic
deliberately. The requirements below were accepted through Q32 of the TASK-203
interview on 2026-09-13.

Traffic, traffic volume and traffic speed are defined in
[CONTEXT.md](../../CONTEXT.md#meaning).

## Settled requirements

- Traffic is optional connection data. If the traffic field is absent, the
  renderer does not draw traffic animation. Presence enables it, and that
  includes an empty object that uses defaults. There is no separate enabled
  field.
- Speed is expressed in diagram coordinate units per second, independently of
  zoom.
- Supplied speed and volume must be positive and finite. Omission of traffic is
  the single off state. Zero volume, zero speed and a separate enabled flag are
  unnecessary states for this illustration-only contract.
- Route length must not change the configured speed. Emphasis does not supply
  traffic, volume or speed implicitly.
- These are animation properties, not measured real-world traffic. Do not expose
  their numeric values in the browser inspector. Do not add a parallel telemetry
  schema. A connection label can communicate meaningful real-world traffic
  information.
- A traffic change marks the connection as changed. The entire traffic object
  counts as one property for connection identity validation. Changing speed and
  volume together retains identity. Changing traffic and destination counts as
  two changes. Compare effective values by value, and include defaults. An empty
  traffic object and explicitly supplied defaults are equivalent. Omission and
  an empty object are different. This is an explicit comparison treatment of
  authored animation intent, not a claim that its numbers measure the
  architecture.

This extends the separation of visual channels in
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md).
