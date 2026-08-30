---
status: superseded by ADR-0019
---

# Push semantic board changes to the coding agent

ADR-0019 supersedes the routing and transport selected by this decision. The
product intent remains: a coding agent working with a board receives compact,
meaningful human changes without polling, and it never receives its own drawing
back as new context.

Board activity alone does not prove which coding agent should receive it.
Recent activity and the number of available agents are observations, not
ownership. Delivery therefore requires a deterministic relationship between
the visible board and its recipient, and ambiguous state results in no
delivery.

## Rejected: maintaining a Codex fork for external world state

A first-class external-state contributor inside Codex could model the board,
but adopting it would require a maintained product fork. Revisit only if Codex
offers a supported extension boundary for third-party world state.

## Consequences

Semantic delivery must remain quiet, attributable, and bound to the visible
relationship between board and agent. Ambiguous ownership fails closed. Any
replacement mechanism must preserve those properties and must not create a
second board snapshot or narrate agent-authored changes back to their author.
