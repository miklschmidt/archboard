# Edit an existing board

The recipe for changing what a board already says: read it, map the change
onto its subjects, write one batch at the version you read, check the answer.

1. `archboard semantic show <board>` and note `version`, the target variant's
   ids, and the fields of every subject you will restate. Write the checks:
   which variant the change lands on, which ids must survive, which fields you
   are keeping and which you are changing. Read the source for the region you
   touch: when the board already contradicts it there (a call drawn from the
   wrong part, a membership the code does not support), say so in your
   answer, and change it only when the request covers it; a board you were
   asked to extend is not yours to silently repair or silently repeat.
2. Map the change onto what you read, subject by subject:
   - **Continuing**: the same part, relationship, exchange or step evolves; keep
     its `id` (a rename, a reworded responsibility, a new binding).
   - **Restore**: a removed node, relationship or flow returns; use its
     original `id` and full properties from the direct predecessor or recorded
     reconciliation base. Remove any copy and reconnect edges, flows and view
     selections in the same batch. Do not put the restored id in removals.
     An id only another variant holds needs `--confirm RESTORE_UNCONFIRMED`
     ([variants](variants.md#disagreements)).
   - **Replacement**: a different unit takes its place; remove the old id and
     add the new subject without one. Similar names or paths do not make two
     implementations one unit. On a draft, a new node with the name or the
     exact binding of one an ancestor holds is refused `PART_RECREATED`:
     confirm it only when it is a different part
     ([variants](variants.md#branching)).
   - **Untouched**: leave it out of the payload entirely.
     A continuing relationship keeps its id even when several fields or an
     endpoint change. Explicit `removeEdges` plus an idless edge states that
     the old relationship ended and a new one began. Restate one whose
     endpoint moved with its id, in the same batch.
     Walk the catalogue for what you add; a removed part takes its
     relationships and walkthrough references with it.
3. Write it as one batch. `--variant <id|name>` says which variant it lands on,
   as it does on every variant command; leave it out and the change lands on the
   variant the board's name opens: the current one, or the draft of a board
   nobody has built. The batch's own `variant` field says the same thing, so say
   it once: the command line wins over it, and the write warns naming both.
   A top-level `summary` replaces the one-line summary of the variant the
   batch lands on, in the same write; leave it out to keep the summary. Update
   it when the change makes the old summary wrong (a date or a scope it no
   longer describes). A historical or shelved variant refuses it, as it refuses
   any content change.
   To adjust layout, restate a node or relationship with its id and an `order`
   between its neighbours' values. Omit `order` in ordinary edits to keep the
   existing position. The store assigns new subjects 1000-step positions.

```bash
archboard semantic edit "Board store" --expect-version 3 --doing "routing write warnings through their own module" <<'JSON'
{
  "nodes": [{ "name": "Replaced relationships", "kind": "module",
    "responsibility": "Names every relationship a batch stated again under a new id",
    "binding": { "repo": "github.com/miklschmidt/archboard", "path": "packages/board/src/runtime/operations/edit/replaced-relationships.ts" } }],
  "edges": [
    { "from": "Edit content", "to": "Replaced relationships", "kind": "call", "label": "replacedRelationships",
      "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "packages/board/src/runtime/operations/edit/content.ts", "symbol": "replacedRelationships" } },
    { "from": "applyUnderLease", "to": "persisted", "kind": "call", "label": "notices as warnings",
      "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "packages/board/src/runtime/operations/write/write.ts", "symbol": "persisted" } }
  ],
  "removeEdges": ["e7Kq2mP1"]
}
JSON
```

The same batch lands on a proposal by naming it, with nothing else about the
call changing:

```bash
archboard semantic edit "Board store" --variant "Warnings as their own module" --expect-version 3 --doing "routing write warnings through their own module" < change.json
```

The evidence for the two relationships: `editContent` (`edit-content.ts`)
returns the notices `replacedRelationships` computes, and `applyUnderLease`
(`write.ts`) hands the transition's notices to `persisted`, which turns them
into warnings; the removed `e7Kq2mP1` had drawn `persisted` reading them from
`Edit content` directly. The new module binds to `replaced-relationships.ts`,
where `replacedRelationships` is implemented, not to `edit-content.ts`, which
calls it.

4. Check the answer against your checks: the ids you meant to keep are
   unchanged, removed subjects are gone, restated subjects still carry the
   fields you kept, `version` moved by one, and nothing landed on a variant
   you did not name. Draw and look when the picture matters. After a changed
   anchor or binding symbol, run `archboard check code`.

## Renaming a board or a variant

`archboard semantic rename <board> --to "<name>" --expect-version <n> --doing "..."`
gives the board another name; with `--variant <id|name>` it renames that variant
instead. Only the name changes: every id, each variant's lifecycle and ancestry,
and the records of adoption, shelving and reconciliation stay as they were, and
the board's file is renamed with the board. The old name is kept as a former
name and goes on opening what it named, so a drill-down on another board, a
saved pane address and a later command that use it still reach the board or the
variant: no other board needs an edit, and panes showing it move to the new
name. A change of case alone keeps every address as it is.

```bash
archboard semantic rename "Canvas server" --to "Archboard server" --expect-version 14 --doing "naming the board for the server it describes"
archboard semantic rename "Archboard server" --variant Initial --to "Before the queue" --expect-version 15 --doing "naming the first state for what it was"
```

Refused, with nothing written: a board name another board carries or used to
carry, or one a board name cannot hold (`@` is the variant's); a variant name
another variant of the board answers to; and the name it already has. Each
rename is one write, so take the next `--expect-version` from its answer.

## Moving a board to another repository

A board sometimes lives in the wrong repository, for example a board that a
meta project drew for the product repository it describes.
`archboard semantic move <board> --to <dir> --doing "..."` moves it from the
vault this command finds into the vault found from `<dir>`, as `-C` finds one.
The whole board moves: every variant, every former name and every id stay as
they are, and the board keeps its name. Two kinds of drill-down change their
meaning, and the move rewrites them to name a repository identity: one in the
source vault that opens the board then names the target's repository, and one
on the board that opens a board of the source vault then names the source's
repository. A drill-down in the target vault that opens the board through the
source's repository is rewritten too, to name no repository, as a link within
the vault. The answer's `rewritten` lists every drill-down that it rewrote,
and `to.registered` says when the command registered the target checkout.
`--expect-version` is the version you read, as for every write. The move ends
your claim on the board: claim it again with `-C <dir>` to go on there. When
`<dir>` is a checkout that is not the chosen one of its repository, such as a
worktree, a finished move makes it the chosen one for the whole machine, as
`browser show` does, and the answer's `chose` names the checkout it replaced.
Tell the user. A person can make the same move in the browser, from the Move
board control in the header of the pane that shows the board. Before the move,
the dialog lists the drill-downs that the move rewrites. A move from the browser
writes no doing line.

```bash
archboard -C ~/meta semantic move Payments --to ~/payments --expect-version 14 --doing "moving the board into the repository it describes"
```

Refused, with nothing written: `--to` in the board's own repository, also in
another checkout of it (git carries boards between checkouts); a target vault
with a board or a former name that the board's names answer to; a board that
somebody else holds, or whose name somebody else holds in the target; and a
move that needs a drill-down into an untracked vault, which has no identity.

Two vaults are two files, so the move writes in a fixed order: the board in the
target vault, then each rewritten drill-down, then it deletes the board in the
source vault. If the move stops part way (`MOVE_STOPPED`, exit 5), the board is
in both vaults, and the error lists the drill-downs that it rewrote already.
Run the same command again to finish it: its answer lists only the rest. If
somebody wrote the target's copy since, the second run refuses with
`BOARD_EXISTS` rather than write over it: remove the copy you do not want
first with `archboard semantic delete`. Each repository commits its own half. A drill-down in a third vault into the moved board now
opens nothing, and `archboard check` in that vault names it.

Read [authoring](authoring.md) only when the change needs it: a
removal beyond `removeEdges`, a binding with revision evidence, group
membership, a drill-down link, or a refusal you must repair. A change of one
property on subjects you read needs nothing beyond this recipe.
