---
status: superseded by ADR-0019
---

# Push to a live Codex thread via app-server injection

ADR-0019 supersedes this decision's control-socket transport, environment-based
task routing, opt-in switch, and loud-injection experiment. Its product intent
remains: a bound Codex task receives compact semantic human changes without
polling, and an agent never receives its own drawing back as context.

When the board changes, archboard reaches the agent through the Codex
app-server control socket: `thread/inject_items` for quiet state updates that do
not start a turn, and `turn/steer` for changes worth interrupting over. CLI
responses are pull-only and cannot report a later human change.

A board does not currently carry an exact Codex task identity. Automatic
injection therefore requires `ARCHBOARD_INJECT_THREAD` to name the target.
Recent activity and the number of loaded tasks are observations, not ownership,
so Archboard declines to inject when no deterministic route is configured.

## Rejected: patching Codex to add a world-state section

`codex-rs/core/src/context/world_state/` is a diff-only external-state engine:
`snapshot()` plus `render_diff()` per turn, full context on turn one and deltas
after. It is a better abstraction for a canvas than an external injector, but
every implementation is in-tree Rust assembled at startup with no config or
plugin registration interface. Using it means maintaining a Codex fork.
Revisit only if Codex exposes contributor registration to plugins.

## Consequences

Injection requires the app-server daemon and an explicit task route. Quiet
injection appends state without starting a turn; loud injection remains an
opt-in experiment because it can make the agent speak over the person at the
board.

The control socket is filesystem-permission-guarded but multi-client, and the
canvas server has no authentication. Anything that can reach the canvas could
drive the coding agent, so injection stays loopback-only and behind
`ARCHBOARD_INJECT=1`. It is never implied by the canvas being up. See
`DESIGN.md`.
