# Propose and compare a change

The recipe for a proposed evolution of the same diagram: branch a draft, edit
only the draft, compare both through one view, adopt only when asked.

1. `semantic show` the board; note `version` and the variant to derive from.
   The checks: every edit names the proposal in `variant`, so the current
   architecture is byte-for-byte what it was; the ids the proposal keeps; the
   view both pictures will go through.
2. Branch, then edit the proposal. The two calls that landed on the lock files
   are restated by the ids step 1 read, with their new endpoint and the labels
   they already carry: one changed property keeps a relationship's id, so this
   is two relationships that moved rather than two deleted beside two added.

```bash
archboard semantic branch "Board lease" --as "Lease table" --summary "Hold leases in one table instead of one file per board" --expect-version 2 --doing "proposing a lease table"
archboard semantic edit "Board lease" --expect-version 3 --doing "moving the lease records into a table" <<'JSON'
{
  "variant": "Lease table",
  "nodes": [{ "name": "Lease table", "kind": "datastore", "responsibility": "One row per held board, written in a transaction" }],
  "edges": [
    { "id": "aZ4vK1Rb", "from": "holdBoard", "to": "Lease table", "kind": "data", "label": "create exclusively" },
    { "id": "p8Lm3Wq2", "from": "releaseHold", "to": "Lease table", "kind": "data", "label": "unlink" }
  ],
  "removeNodes": ["Lock files", "Lock watcher"]
}
JSON
archboard semantic compare "Board lease" --variant "Lease table"
archboard semantic rasterize "Board lease" --view Leases --out current.png
archboard semantic rasterize "Board lease" --view Leases --variant "Lease table" --out proposal.png
```

The proposal carries every subject of its predecessor with the same ids, so
the comparison is exact: kept ids read as continuing, new subjects as added,
removed ids as removed. Views belong to the board, so both pictures go through
the same view and a removed subject stays drawn as removed. The current side
comes from the source: `holdBoard` creates `<vault>/.archboard/locks/<board>.lock`
exclusively (`board-lock-acquisition.ts`), `releaseHold` unlinks it
(`board-lock-state.ts`), and `watchBoardLocks` polls those files because a file
cannot notify another canvas. The table is a proposal nobody has built, so it
stays unbound.

3. Read `semantic compare`'s answer against your change map. It reports every
   part, relationship, sequence, step, walkthrough and beat either state has,
   each as `added`, `removed`, `changed` or `unchanged`, and for anything
   changed the fields that moved and what they moved between; relationships
   and steps carry the endpoints they now have, named as well as identified.
   Check that those subjects are the ones you intended, that the current
   variant is untouched, and that a continuing exchange compares step by step.
   Open both pictures: the removal is drawn as removed in the proposal's, and
   the current one shows what it showed before.

   Report from that answer rather than from the change you meant to make: the
   parts removed, the parts added, and every relationship the answer does not
   call `unchanged`, with where it now lands. Here it says `Lock files` and
   `Lock watcher` are `removed`, `Lease table` is `added`, and both calls are
   `changed` with one field each — `to` moved from `Lock files` to
   `Lease table` — so the report is "the calls from `holdBoard` and
   `releaseHold` are the same two relationships, now landing on the table",
   not "two relationships went and two arrived". A relationship whose endpoint
   moved is the change the comparison exists to show, so name it. The command
   reads a variant against the one it came from; a root architecture came from
   nothing and is refused.
   When the proposal adds or changes a board view, read
   [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md)
   for the two meanings of a selection scope before writing it; views belong
   to the board and apply to both pictures.

4. Only when asked, adopt with the version returned by the proposal edit:
   `archboard semantic adopt "Board lease" --variant "Lease table" --reason "Leases moved into a table the canvas can be notified from" --expect-version 4 --doing "adopting the lease table"`.
   The proposal becomes current, the previous current becomes historical, and
   nothing is renamed.

Read [variants](references/variants.md) for what the comparison counts, for a
proposal that holds disagreements after its predecessor moved (`semantic
resolve`), and for adoption rules.
