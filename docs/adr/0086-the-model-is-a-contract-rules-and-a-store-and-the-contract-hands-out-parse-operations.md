---
status: accepted
---

# The model is a contract, rules and a store, and the contract hands out parse operations

Decided for TASK-653.07, candidate 11 of the archboard-deepen run, with owner decision 18
(2026-11-19). It applies [ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md)
and [ADR 0082](0082-the-code-check-judges-module-depth-from-the-code.md) to the model, and keeps
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md)'s one projection.

## Context

`@archboard/model` exported 140 names through 19 subpaths: 133 functions and 7 values. 58 of the
functions only returned a constant zod schema. So callers parsed requests, replies and files with
the model's schemas themselves, and the rules about them lived at every caller: the CLI kept a
refusal that came with an HTTP failure, each server route took the vault off a body in its own
way, and the store built its own record formats out of the contract's shapes. The package served
three groups of callers that barely overlap: every side reads and writes the model's shapes, the
browser and the backend draw and compare it, and only Bun code reads and writes a vault.

## Decision

- **Three packages, one layer each.** `@archboard/model-contract` (layer 4) <
  `@archboard/model-rules` (5) < `@archboard/model-store` (6). The packages above them move up two
  layers. Each exports one entry. The shapes are the bottom of every chain: the legacy board's
  shapes are embedded in the canonical contract, and the rules read the contract's types.
- **The contract hands out operations and derived types, never a schema.**
  `parseDocument(kind, raw)` reads a document of a closed set of kinds: a vault's files, the
  records the store keeps beside them, the readings a pane or a picture is handed, and the single
  values a caller checks. It answers zod's safe-parse shape, so a caller that threw keeps the same
  error by rethrowing it. `parseModelRequest(operation, body)` reads a request and the vault it
  names, the way its route always read it, and carries the `INVALID_REQUEST` refusal a server
  answers. `readModelReply(operation, body, delivery)` reads an answer; an answer that came with
  an HTTP failure is read only as a refusal. `describeModelSchema(name)` prints the eight JSON
  Schemas the skill names. Each is one verb over a closed, typed set of keys that does the work.
- **One keyed getter.** `modelShape(key)` hands out the shapes another contract is built from: a
  command's declared result, a protocol's embedded revision or refusal, an option's vocabulary.
  Under owner decision 18 it counts as one name. Every key has a consumer outside the contract
  that composes it into a schema of its own; nothing reads a value through it.
- **The store's records belong to the contract.** The checkpoint and archive records, the journal,
  the claims state, the publication configuration and the flat step are shapes, so they live in
  the contract and the store reads them through `parseDocument`. The store keeps its paths, its
  failures and everything that touches a file.
- **The rules read types only.** The projections, flow drawing, comparison, inspection and
  subjects take the contract's types and hold no schema. `readFlow`, `nestedSteps` and
  `subjectsOf` stay in the contract because its shapes run them.
- **No package for the legacy board.** Its shapes are embedded in the canonical contract, so a
  package of its own would sit between the contract's own files. Its variant lookups and its
  coherence check are the contract's, and its migration is the store's. A fourth package would
  only move names.
- **Pane keys live in the contract.** `parsePaneKey`, `paneAddressKey`, `statedVariant` and
  `normalizePaneKey` are read by the store's lock and legacy addresses and by workbench's pane
  addressing, which sits above the store. This replaces the interim home in `server-lifecycle`
  that candidate 4 named.
- **A browser build carries no icon names.** A vault's configuration names RemixIcon components,
  and listing them loads every icon. The contract's `#installed-icons` import resolves to an empty
  list under the `browser` condition, because no browser reads a vault's configuration.

Widths (functions and values, ADR 0082): contract 20, rules 18, store 20. The contract and the
store have no headroom: a new operation in either reopens the finding.

The store's 20 rests on two keyed folds, and its honest width is 24. `changeArchitectureClaims`
chooses claim, release or take-back, and `changeArchitecturePublication` chooses configure,
publish or fetch, each by a literal that every caller passes. They are dispatchers, not deeper
operations. No design that reaches 20 is known, and unfolding them needs a ceiling of 24. The
owner decides which; until then the folds stay.

## Considered options

A keyed getter of about 100 shapes, through which the store would build its own formats, only
hides the width (ADR 0058), and the contract can parse its shapes itself. A `modelEndpoint`
lookup of each operation's method and path would hold every path twice, beside the server's
literals. Parts inside one package leave the package's width where it was.

## Consequences

The single-caller helpers moved to their callers. A test that parsed with a schema calls the
contract's operation, and the refusal preservation and the vault envelope are tested once, at the
contract. The printed schemas, the CLI's declared schemas, the HTTP bodies and every persisted byte
are unchanged.
