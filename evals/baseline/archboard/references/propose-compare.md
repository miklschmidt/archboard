# Propose and compare a change

The recipe for a proposed evolution of the same diagram: branch a draft, edit
only the draft, compare both through one view, adopt only when asked.

1. `semantic show` the board; note `version` and the variant to derive from.
   The checks: every edit names the proposal in `variant`, so the current
   architecture is byte-for-byte what it was; the ids the proposal keeps; the
   view both pictures will go through.
2. Branch, then edit the proposal:

```bash
archboard semantic branch "Board lease" --as "Lease table" --summary "Hold leases in one table instead of one file per board" --expect-version 2 --doing "proposing a lease table"
archboard semantic edit "Board lease" --expect-version 3 --doing "moving the lease records into a table" <<'JSON'
{
  "variant": "Lease table",
  "nodes": [{ "name": "Lease table", "kind": "datastore", "responsibility": "One row per held board, written in a transaction" }],
  "edges": [
    { "from": "holdBoard", "to": "Lease table", "kind": "data", "label": "insert or take over" },
    { "from": "releaseHold", "to": "Lease table", "kind": "data", "label": "delete" }
  ],
  "removeNodes": ["Lock files", "Lock watcher"]
}
JSON
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

3. Check the answer's comparison against your change map: the added, removed,
   changed and unchanged subjects are the ones you intended, the current
   variant is untouched, and a continuing exchange compares step by step.
   Open both pictures: the removal is drawn as removed in the proposal's, and
   the current one shows what it showed before. Report what changed in those
   terms: the parts removed, the parts added, and for every relationship the
   proposal keeps or adds, where it now lands (here, the relationships from
   `holdBoard` and `releaseHold` land on `Lease table`). A relationship whose
   endpoint moved is the change the comparison exists to show, so name it.
4. Only when asked, adopt with the version returned by the proposal edit:
   `archboard semantic adopt "Board lease" --variant "Lease table" --reason "Leases moved into a table the canvas can be notified from" --expect-version 4 --doing "adopting the lease table"`.
   The proposal becomes current, the previous current becomes historical, and
   nothing is renamed.

Read [variants](references/variants.md) for what the comparison counts, for a
proposal that holds disagreements after its predecessor moved (`semantic
resolve`), and for adoption rules.
