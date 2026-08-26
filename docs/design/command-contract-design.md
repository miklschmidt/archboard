# Command contract proof design

TASK-123.02 completes the schema-defined CLI proven by TASK-123.01. The fixed
compatibility and review base is `6c42fca6c0d5b9ecaa5ad40fde14ede684722d5a`.

## Module and seam

`src/cli/command-contract` is one deep module. Its public interface is
`CommandContract`, the production-only two-argument `runCommand(contract,
argv)`, bootstrap handling, and contract introspection.
`CommandContext`, `CommandExecution`, and `PendingArtifact` are Archboard-owned
parts of the typed handler interface and remain Commander-free, but they are
not emitted by introspection. `src/cli/commands/run.ts` is the production adapter at that seam and
remains the sole registry. Its route tree gives every root and child its own
contract, parser owner, handler owner, and parent. The same tree
derives the current 58-path surface, flattened generated registry, longest-path
dispatch, default aliases, and namespace refusals. All 58 paths use contracts;
there is no legacy dispatcher, raw-argv handler, or second subcommand catalogue.

The private implementation uses one concrete Commander parser, the process and
filesystem host, and the production server/browser prerequisite checks. These
are implementation details, not internal seams. There is no dependency bundle
or optional dependency bag. Introducing an interface for one implementation
would add indirection without adding a behavior that can vary. A future seam
requires a second real adapter. Tests observe stdout, temporary-file writes,
network effects, prerequisite ordering, and held presentation through the
two-argument interface or the package CLI.

## Single semantic owner

Parameter descriptors describe token grammar only:

- spellings and aliases;
- whether an occurrence consumes zero, one required, or one optional token;
- last-wins or append occurrence behavior;
- positional order and repeatability;
- stdin/file routing and intentional pass-through.

Zod owns types, coercion, defaults, enums, field optionality, and cross-field
rules. The Commander adapter does not set defaults, choices, required options,
or semantic argument parsers. Contract construction checks only token spelling,
positional ordering, route/arity coherence, and descriptor-to-Zod-key mapping.

Some compatibility rules run at different times. `CommandInput.stages` records
those Zod checkpoints. The handler invokes them through `CommandContext.parse`
at the declared phase. This keeps Zod as the semantic owner while retaining
server, browser, and local-file refusal precedence.

## Public result and private execution

`CommandContract.result` is the schema for the value or content a successful
caller receives. It is not an execution wrapper. The private execution record
may contain `{ result, pendingArtifact }`. Output policy is separate and picks
JSON, text, raw content, or a file receipt from parsed input.

The runner applies the selected held policy, validates the resulting public
value, validates a pending artifact independently, writes a file only after
both validations pass, and then emits the validated public value. Contract
introspection exposes the public schema and output mode. It removes artifact
schemas and never exposes pending bytes, stdout keys, Commander objects, or
test adapters.

Nonzero structured results are public `CommandOutcomeDeclaration` values. A
declaration owns its id, exit, stream policy, held policy, and ordered
presentation. A handler selects only the id and supplies diagnostic content.
The runner selects the outcome and output case, applies held state, validates
the complete public result, validates and commits an artifact, presents the
declared events, and sets the exit last. `CommandContext.diagnostic` is the
only immediate stream lane. It exists for fixed compatibility where a local
diagnostic precedes a later failure.

Small shared result concepts live in `command-contract/schemas.ts`. Command
families keep named input, stage, and result schemas beside their contracts.
Forwarded server payloads stay loose where the CLI does not own their fields;
command-built result objects stay closed. There is no generic response
envelope.

The proof results are:

- query: a bare `ServerElement[]`;
- update: the existing write object with element, touched elements,
  fingerprint, optional document, and optional held report;
- viewport: the existing success/message object;
- export: a union of exact serialized string content and the existing file
  receipt object.

## Held presentation

Held behavior belongs to each output case:

- query leaves the array unchanged and writes the held message to stderr;
- update adds the public held field and writes the message to stderr;
- viewport declares object JSON behavior explicitly;
- raw export bypasses held presentation;
- file export adds the public held field and writes the message to stderr.

There is no decorate-all rule.

## Ordered execution

Query starts the server before validating bbox and reads elements before
validating client filters. Update reads and validates inline, file, or stdin
JSON before starting the server and performs one PUT. Viewport validates mode
selection before server/browser checks and parses numeric values after the
browser check. Export validates format, reads existing frontmatter, and refuses
an unsafe overwrite before starting the server. Its file branch validates the
public receipt and private artifact before writing UTF-8 bytes.

## Errors and streams

Usage and board-required refusals exit 2. Canvas unreachable exits 3. Browser
required exits 4. Held, revoked-claim, moved-version, and note conflicts exit 5.
Other failures exit 1. Successful structured values use stdout. Diagnostics,
usage, progress, and held notes use stderr. Status declares unavailable and
foreign-service as stdout-only exit 3 results. Board save declares a conflict
as exit 5 and presents the conflict diagnostic, validated structured result,
held note, and continuation in that order.

`check --strict` adds stdout-only computed outcomes. Complete warnings exit 6,
complete errors exit 7, and indeterminate coverage exits 8 even when the report
also contains errors. Non-strict reports always exit 0 after successful
inspection. Usage and policy failures still exit 2 with empty stdout;
vault, note, Drawing, schema, and I/O failures exit 1 with empty stdout.

## CLI-only compatibility

`src/bin.ts` removes one `--url` before importing runtime configuration.
`run.ts` retains existing help, version, globals, error mapping, and the
route tree. The checker compares every flattened route's parent, parser owner,
handler owner, and contract identity to the canonical audit. It requires exactly
58 current contracts, zero legacy routes, no family-owned subcommand catalogue, and no
obsolete parser, stream, or proof-monolith source. Introspection is an in-process generation interface and checked-in
JSON. It is not a public command, REST route, MCP replacement, or second agent
command surface.

The fixed-base compatibility records are executable package-binary cases, not
scenario labels. Each one fixes argv, exact stdout and stderr bytes, any
documented normalization, merged contact and stream order, exit, held state,
prerequisite contacts, REST and local effects, and artifact commits. The CLI
checker replays every record against HEAD. The immutable migration record still covers its original
57 paths. Current metadata covers 58, with `check` marked as introduced by TASK-119. General-help
compatibility removes only the new `check` command line and its check-only exit line before hashing.
Help hashes cover all 57 migration paths; the
ordered records cover the approved status, board-save, immediate-diagnostic,
binding-resolution, and late-validation cases.
