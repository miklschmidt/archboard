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
derives the current 60-path surface, flattened registry view, longest-path
dispatch, default aliases, and namespace refusals. All 60 paths use contracts;
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

Schema-v1 reports publish two limits: `inputComplexityUnits` is 1,000,000 and
`broadPhaseComparisons` is 2,000,000. The product report exposes the completed eligible comparison
count, but not the completed input count. Input is snapshotted before decode; attempting input unit
1,000,001 emits `INSPECTION_LIMIT_EXCEEDED/input-complexity-ceiling` and runs no semantic analysis.
Attempting comparison 2,000,001 emits
`INSPECTION_LIMIT_EXCEEDED/broad-phase-comparison-ceiling`, stops the remaining pair passes, and
preserves findings and comparisons from completed earlier work. Both limit findings make coverage
indeterminate.

These are truthful capacity safeguards for input admission and eligible broad-phase comparisons,
not a general runtime, asymptotic, hang, or denial-of-service guarantee. Valid input within both
caps may still induce superlinear semantic work. If an external supervisor terminates inspection,
there is no report to return.

Inspection accepts live JavaScript values only through an inert fixed-field snapshot. Proxies,
accessors, active-path cycles, functions, symbols, bigints, and non-plain objects are never invoked
or stringified; they produce `INVALID_RENDER_GEOMETRY/non-data-input` with a source index and path.
Only arrays and plain or null-prototype objects are followed. Uninspected and symbol-keyed fields
are ignored.

Inspection findings use scene-coordinate boxes. `affectedBBox` preserves finite
local evidence even when an element's stored extent or a multi-element span is
not representable. A normal `focusBBox` expands that box by exactly 16 px on
each side. If IEEE-754 arithmetic cannot represent all four exact deltas,
`affectedBBox` remains present, `focusBBox` is null, and the report includes
`AMBIGUOUS_GEOMETRY/unrepresentable-focus-padding`. That warning affects
coverage, so strict mode exits 8. A null `affectedBBox` still means the record
has no finite x/y location.

Schema-v2 obstacle references derive `id` from `elementIds`; callers cannot choose it. The schema
requires `elementIds` and `groupIds` to be unique and exactly sorted, and requires library entries
to have unique element IDs in the same order. Sort the
constituent IDs by exact ECMAScript UTF-16 code-unit order, replace each backslash with `\\` and
each comma with `\,`, join the encoded IDs with a literal comma, then prefix the result with
`obstacle:`. No other character is escaped. This keeps commas injective while preserving NUL,
other controls, lone surrogates, and ordinary IDs byte for byte. The report schema rejects an
obstacle reference whose `id` is not that exact derivation. It also requires canonical unique
element, group, and library-attribution arrays; every attribution must name a constituent element;
library components must have attribution; and grouped components must have no attribution, at
least two constituent elements, and qualifying group evidence. Every multi-element obstacle,
including a library component, requires qualifying group evidence. An optional library `source`
is a nonempty string.

The schema-v2 report exposes `broadPhaseComparisons`, whose public meaning is
the number of semantically eligible x-overlapping pairs tested before the
y-axis and exact predicates. Heap, event, expiry, compatibility-index, hierarchy-index, and
path-filter work are private implementation mechanics. They do not enter the check contract or its
JSON and text results.

Schema v2 also owns bridge provenance. A valid bridge is exactly one unbound, ungrouped mask line
whose element ID equals `bridgeId` and one redraw line carrying identical eight-field facts except
for `role`. Inspection validates the recorded source IDs, segment indexes, canonical crossing,
derived geometry and style, and z-order before suppressing that one proper crossing. Incomplete and
stale candidates produce the closed `BRIDGE_PROVENANCE_INVALID` finding and suppress nothing.

`bridge` and `bridge remove` each have one REST relationship and enter the ordinary locked write
boundary once. Creation requires an explicit opaque `#RRGGBB` background and plans the two generated
parts inside the mutation; removal resolves the strict provenance pair there and deliberately does
not require its sources to remain present or unchanged.

## CLI-only compatibility

`src/bin.ts` removes one `--url` before importing runtime configuration.
`run.ts` retains existing help, version, globals, error mapping, and the
route tree. The checker compares every flattened route's parent, parser owner,
handler owner, and contract identity to the canonical authored audit at
`docs/design/cli-command-audit.json`. It requires exactly
60 current contracts, zero legacy routes, no family-owned subcommand catalogue, and no
obsolete parser, stream, or proof-monolith source. Introspection is an
in-process generation interface. It is not a public command, REST route, MCP
replacement, or second agent command surface.

## Canonical input and derived views

`docs/design/cli-command-audit.json` is the tracked, human-authored record of
the reviewed surface, workflow decisions, ownership, ordering, and effects. It
cannot be reconstructed from introspection without losing those judgments.

The audit Markdown and the JSON and Markdown contract proofs are reproducible
views, not sources of truth. Run `bun run generate:cli-contract` to render them
under the ignored `docs/design/generated/` directory. The contract gate builds
the same projection in memory, reconciles all 60 paths and the immutable
57-path compatibility subset, validates both renderings, and generates twice
in fresh temporary directories to prove deterministic bytes without changing
the checkout. A fresh clone therefore needs no generated files to run the
gate.

The fixed-base compatibility records are executable package-binary cases, not
scenario labels. Each one fixes argv, exact stdout and stderr bytes, any
documented normalization, merged contact and stream order, exit, held state,
prerequisite contacts, REST and local effects, and artifact commits. The CLI
checker replays every record against HEAD. The immutable migration record still covers its original
57 paths. Current metadata covers 60, with `check` marked as introduced by TASK-119 and both
bridge paths marked as introduced by TASK-120. General-help
compatibility removes the new `check` and `bridge` command lines and the check-only exit line before
hashing.
Help hashes cover all 57 migration paths; the
ordered records cover the approved status, board-save, immediate-diagnostic,
binding-resolution, and late-validation cases.
