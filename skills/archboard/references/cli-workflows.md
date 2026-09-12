# CLI workflow chains

Use `archboard help <command>` first for released syntax and options. For result
shapes, streams, exits and refinements, follow the registry in
`src/cli/commands/run.ts` to that command's `ResultSchema` and inferred type.
Those source Zod contracts are authoritative.

For a searchable view, generate
`docs/design/generated/command-contract-proof.json` on demand with
`bun run generate:cli-contract`. The file is ignored and derived; when it and
the source disagree, the source Zod schema and refinements win.

The examples below extract only values that naturally feed a later command.

## Authoring a board

A configured vault and the server are enough. No browser is involved.

```bash
board=payments
archboard semantic                      # every board in the vault
archboard semantic new "$board" --doing "drawing the payment path" < architecture.json
archboard semantic show "$board"
archboard semantic render "$board" --out payments.svg
```

`--input <file>` is the same as standard input, for when a pipe is inconvenient.

## The version a write reports is the next write's precondition

Every write answers with the version the board is now at. That number is what
the next edit states, and stating it is not optional: an edit that does not say
which board it read is an edit applied to whatever the board says now.

<!-- version-from-a-write -->

```jq
.version
```

```bash
version="$(archboard semantic new "$board" --doing "drawing it" < architecture.json | jq -r .version)"
archboard semantic edit "$board" --expect-version "$version" --doing "adding the queue" < change.json
```

Reading the board again immediately before writing would make the check pass by
construction and hide the change you were meant to notice. Read, decide, write.

## A proposal, and what it is proposing to change

Branching answers with the whole board, so the new variant's id is in the reply.

<!-- the-branched-variant -->

```jq
.board.variants[] | select(.name == "Queued ingest") | .id
```

```bash
variant="$(archboard semantic branch "$board" --as "Queued ingest" \
  --expect-version "$version" --doing "proposing a queue" |
  jq -r '.board.variants[] | select(.name == "Queued ingest") | .id')"

archboard semantic show "$board"        # both variants, and what the draft holds
archboard semantic render "$board" --variant "$variant" --out proposal.svg
```

A variant is addressed as `board@variant`, by its id or by the lasting name it
was given: `payments@"Queued ingest"` and `payments@$variant` name the same
thing. The only character an address refuses in a variant is `@`, which is what
separates the variant from the board — so a proposal called `Proposed: queued
ingest` is addressable by that name. Its id never changes when somebody renames
it, which is the reason to keep the one the branch reply hands you. A write always names the board alone and says which variant it changes
inside the command, because the whole family is one document.

## The subjects on a board

Every node and edge has an id that survives editing, branching and adoption. It
is what a comparison joins on, what a selection names, and what "open the code"
resolves.

<!-- node-ids-of-the-current-variant -->

```jq
[.board.variants[] | select(.lifecycle == "current") | .content.nodes[].id]
```

<!-- what-a-draft-is-holding -->

```jq
[.board.variants[] | select(.reconciliation != null)
 | { variant: .name, against: .reconciliation.against, issues: [.reconciliation.issues[].subject] }]
```

A draft with a standing reconciliation is waiting for somebody to settle it.
Nothing below it is merged until that happens, which is why the empty answer
here is the one to check for before assuming a branch is ready to adopt.

## Putting a proposal beside its source

Only these touch a live session, and none writes a board.

```bash
archboard browser panes --text
archboard browser open
archboard browser show "$board@$variant" --pane right
```

<!-- the-pane-a-board-is-showing -->

```jq
[.panes[] | { pane: .paneId, place: .place, board: .board }]
```

A pane's board may be `null`: a vault with no boards in it yet still has a pane
on screen, and that is the pane a `show` would point at.

## A claim, for a campaign rather than a write

```bash
archboard claim --board "$board" --reason "redrawing the payment path" --for 10m
# ... several writes, each with its own --doing ...
archboard release --board "$board"
```

The claim answers with the version it is holding, so the first write under it
has a precondition without a second read. If a person takes the board back, the
next write is refused once with `CLAIM_REVOKED`, and nothing written is undone.

## Binding a part of the architecture to its code

Register each checkout once; the binding itself is stated on the node.

```bash
archboard repo add /path/to/payments-api
```

```json
{
	"name": "Orders",
	"kind": "service",
	"binding": { "repo": "github.com/acme/payments-api", "path": "src/orders.ts" }
}
```

The board keeps the repository identity and a repo-relative path, so the same
board opens the right file on anybody's machine.
