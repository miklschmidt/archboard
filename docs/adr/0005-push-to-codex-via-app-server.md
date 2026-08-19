# Push to a live Codex thread via app-server injection, not MCP

When the board changes, archboard reaches the agent through the Codex
app-server control socket — `thread/inject_items` for quiet state updates that
do not start a turn, `turn/steer` for changes worth interrupting over. MCP is
used for pull only.

This is not a preference. Codex's MCP client **discards every standard
server-initiated notification** into tracing logs — progress, logging,
`resources/updated`, `tools/list_changed`, `cancelled` — and never calls
`resources/subscribe` anywhere in the codebase. The one in-protocol push that
works is `elicitation/create`, which prompts the human rather than informing the
model. An MCP server simply cannot tell Codex that external state changed.

## Rejected: patching Codex to add a world-state section

`codex-rs/core/src/context/world_state/` is a diff-only external-state engine —
`snapshot()` plus `render_diff()` per turn, full context on turn one and deltas
after — and is a strictly better abstraction for a canvas than anything above:
in-process, structured, never re-sending unchanged text. Every implementation is
in-tree Rust assembled at startup with no config or plugin registration surface,
so using it means forking and maintaining a 110GB monorepo to avoid keeping a
state file. Not worth it. Revisit only if Codex exposes `TurnInputContributor`
registration to plugins.

## Consequences

Injection requires the app-server daemon to be running. That is satisfied in
practice because voice runs through app-server anyway; a `UserPromptSubmit` hook
that does its own diffing is the fallback when no daemon is present.

**Security.** The control socket is filesystem-permission-guarded but
multi-client, and the canvas server has no authentication. Anything that can
reach the canvas could drive the coding agent, so turn injection stays
loopback-only and behind an explicit switch — never implied by the canvas simply
being up. See `DESIGN.md`.
