# The CLI is the default surface; MCP stays for harnesses without a shell

Archboard exposes the same capabilities twice, through a CLI and through an
MCP server. The CLI is the primary one. Agents should reach for it first, new
capabilities land there first, and the skill teaches it.

MCP stays because it is the only way into archboard from a client that cannot
run a shell, such as Claude Desktop or ChatGPT. Both consumers today, Codex and
Claude Code, have a shell, so nothing currently needs MCP. Keeping it is a bet
on someone wanting a board without a checkout.

## What it costs

The MCP files run to about 1,618 lines against the CLI's 1,500, for the same
behaviour over the same core modules. Every capability built during this
session cost twice: a tool schema, a dispatch arm, a command, a registration.

MCP does one thing the CLI cannot. It returns screenshots as image content
straight into the model's context, where the CLI writes a PNG and the agent
reads it back. That gap matters less here than it looks, because the voice
model never sees tool results anyway, so screenshots only ever serve the
thread's own checking.

## Considered and rejected

Deleting MCP. Tempting on the numbers, and nothing would have been lost this
week. Rejected because it shuts the only door for a shell-less client, and
reopening it later means rebuilding 35 tools.

Generating the MCP surface from the CLI command table. One source of truth
would remove the duplication, but 35 tools against 23 commands is not a
mechanical mapping, so the generator would cost more than it saves.

## Consequences

The skill has to change. Its Step 0 currently tells an agent to prefer MCP
tools when they are present, which is upstream's framing and now the opposite
of ours.

A secondary surface rots. If MCP silently lags the CLI, it will be broken on
the day someone finally opens archboard in Claude Desktop, which defeats the
reason for keeping it. Something has to catch the drift rather than trusting
that we will remember.

A check in the test run is that something. It pairs every tool with the
command that does the same job and fails on anything unpaired. What stays
unpaired on purpose carries a written reason, printed on every run, so an
asymmetry has to keep justifying itself rather than being noticed once and
forgotten.
