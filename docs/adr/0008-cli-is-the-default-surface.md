---
status: accepted
---

# The CLI is Archboard's only agent command surface

Archboard originally exposed every capability through both a CLI and an MCP
server. Current consumers have a shell. The second transport duplicated schemas,
dispatch, dependencies, documentation, and tests, and it served no real user.
Archboard therefore keeps the CLI as its sole agent command interface. It also
keeps the loopback REST interface for the application, browser, and local
integrations.

## Considered and rejected

One option was to keep MCP for a hypothetical shell-less client. No current
workflow used it. If a concrete client appears later, rebuilding a transport
will cost less than maintaining parity cost on every change.

The other option was to generate MCP tools from the CLI command table. The two
interfaces did not map mechanically. Generation therefore preserved the second
public contract and its exceptions instead of removing them.

## Consequences

Running `archboard` with no command shows CLI help. The package has no stdio
transport, MCP server factory, tool catalogue, dispatcher, compatibility
exports, or Model Context Protocol dependencies.

The CLI owns agent-facing commands. Command handlers reuse domain modules and
the loopback REST interface. REST is an application seam, not a second agent
command catalogue. TASK-123 will generate CLI help, result contracts, and
intentional REST asymmetries from one command registry.

The tracked Archboard skill teaches CLI workflows only. A future shell-less
client must justify a new transport from observed need. It must not revive the
deleted compatibility interface by default.
