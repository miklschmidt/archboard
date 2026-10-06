# Propose and compare a change

The recipe for a proposed evolution of the same diagram: branch a draft, edit
only the draft, compare both through one view, adopt only when asked.

1. `semantic show` the board; note `version` and the variant to derive from.
   The checks: every edit names the proposal with `--variant`, so the current
   architecture is byte-for-byte what it was; the ids the proposal keeps; the
   view both pictures will go through.
2. Branch, then edit the proposal. The two calls that landed on the lock files
   are restated by the ids step 1 read, with their new endpoint and the labels
   they already carry: one changed property keeps a relationship's id, so this
   is two relationships that moved rather than two deleted beside two added.
   `--variant` says which variant the change lands on, and a payload `variant`
   says the same thing; where the two differ the command line wins, and the
   write warns naming both.

```bash
archboard semantic branch "Board lease" --as "Lease table" --summary "Hold leases in one table instead of one file per board" --expect-version 2 --doing "proposing a lease table"
archboard semantic edit "Board lease" --variant "Lease table" --expect-version 3 --doing "moving the lease records into a table" <<'JSON'
{
  "nodes": [{ "name": "Lease table", "kind": "datastore", "responsibility": "One row per held board, written in a transaction" }],
  "edges": [
    { "id": "aZ4vK1Rb", "from": "holdBoard", "to": "Lease table", "kind": "data", "label": "create exclusively" },
    { "id": "p8Lm3Wq2", "from": "releaseHold", "to": "Lease table", "kind": "data", "label": "unlink" }
  ],
  "removeNodes": ["Lock files", "Lock watcher"]
}
JSON
archboard semantic compare "Board lease" --variant "Lease table"
archboard semantic rasterize "Board lease" --view Leases --out /tmp/current.png
archboard semantic rasterize "Board lease" --view Leases --variant "Lease table" --out /tmp/proposal.png
```

The proposal carries every subject of its predecessor with the same ids, so the
comparison is exact (kept ids continue, new subjects are added, removed ids are
removed), and views belong to the board, so both pictures go through the same
view and a removed subject stays drawn as removed. The current side comes from
the source: `holdBoard` creates `<vault>/.archboard/locks/<board>.lock`
exclusively (`board-lock-acquisition.ts`), `releaseHold` unlinks it
(`board-lock-state.ts`), and `watchBoardLocks` polls those files because a file
cannot notify another server. The table is a proposal nobody has built, and
nothing states where its code will live, so it stays unbound.

3. Read `semantic compare`'s answer against your change map. Read its
   interface section (`interfaceChanges`) first. The rest reports every part,
   relationship, sequence, step, walkthrough and beat either state has, each as
   `added`, `removed`, `changed` or `unchanged`, and for anything changed the
   fields that moved and what they moved between; relationships and steps carry
   the endpoints they now have, named as well as identified.
   Check that those subjects are the ones you intended, that the current
   variant is untouched, and that a continuing exchange compares step by step.
   Open both pictures: the removal is drawn as removed in the proposal's, and
   the current one shows what it showed before.

   A container is a node with children, such as a module, a package, or a
   class and its members. Its interface is its entry points: the children that
   parts outside it reach, such as the functions that other modules call. The
   other children are hidden parts. The interface section lists under `changed`
   each container whose interface moved. Each entry names:

   - the entry points added and removed (`entryPointsAdded`,
     `entryPointsRemoved`)
   - the children that a caller now reaches (`becameEntryPoints`), and the
     children that no caller reaches any longer (`becameHidden`)
   - the callers gained and lost (`callersGained`, `callersLost`)
   - on which side the node has children (`holdsParts`), so a new or emptied
     container reads as one

   An interface change costs every caller, and an implementation change costs
   one module. So report the interface changes first, and name the callers that
   each one costs. They set no `standing`. The part that a new caller reaches
   stays `unchanged`, and the new relationship reads as `added`. `unchanged`
   lists the containers that did not move, so a reader can check "no interface
   changed". If no node has children on either variant, both lists are empty.
   Then say that the board has no interface to compare, and do not report zero
   entry points. `interfaceMeasures` puts the counts of each container on both
   variants side by side ([design it twice](#design-it-twice)).

   Report from that answer, not from the change you meant to make: the
   interface changes, the parts removed, the parts added, and every
   relationship the answer does not call `unchanged`, with where it now lands.
   Here `Lock files` and `Lock watcher` are `removed`, `Lease table` is
   `added`, and both calls are `changed` in one field (`to` moved from
   `Lock files` to `Lease table`), so the report is "the calls from `holdBoard`
   and `releaseHold` are the same two relationships, now landing on the table",
   not "two relationships went and two arrived": an endpoint that moved is the
   change the comparison exists to show, so name it. No node of the lease board
   has children. So the interface section is empty, and the report starts at
   the removed parts. Suppose the proposal put the table inside a new
   `Lease store`. Then the report starts there: a container only on the
   proposal, with the table as its entry point, and `holdBoard` and
   `releaseHold` as the callers that it gained.

   The command reads a variant against the current one, as its picture is
   drawn, or on a board nobody has built against the one it came from; the
   current variant itself, and a first draft on such a board, are refused.
   When the proposal adds or changes a board view, read [sequences, views and
   walkthroughs](references/sequences-views-walkthroughs.md) for the two
   meanings of a selection scope before writing it.

4. Only when asked, adopt with the version returned by the proposal edit:
   `archboard semantic adopt "Board lease" --variant "Lease table" --reason "Leases moved into a table the server can be notified from" --expect-version 4 --doing "adopting the lease table"`.
   The proposal becomes current, the previous current becomes historical, and
   nothing is renamed.

## Design it twice

The first interface of a module is rarely its best one. When the request asks
for alternatives, or for the interface of a module that does not exist yet,
draft two or more designs and put them side by side:

1. Branch each draft from the same variant, one for each constraint the
   request names or the design leaves open, such as "callers reach one entry
   point" against "each caller reaches the function it uses". Name each draft
   after its constraint. Two drafts under one constraint are one design drawn
   twice.
2. Draw each draft with steps 1 to 3. The parts the drafts share keep their
   ids, so every draft compares with the others by identity.
3. Put the interface measures side by side:
   `archboard semantic compare <board> --variant <first draft> --beside <second draft>`,
   with one more `--beside` for each further draft. In `interfaceMeasures`,
   `variants` lists the variants in the order read: the draft, the variant it
   is read against, then each `--beside`. `containers` lists every container
   that any of them has. Under `byVariant`, each container has five counts on
   each variant: entry points, hidden parts, callers, outgoing relationships
   and pass-through entry points. The entry points and the pass-through entry
   points are also named. A node with no children on a variant says
   `holdsParts: false` there. Run
   `semantic compare --variant <draft>` once for each further draft to read
   that draft's own `interfaceChanges`.
4. Draw every draft through the same board view, and open the pictures beside
   the counts.
5. Report the counts of each variant as the answer gives them, and what each
   draft costs its callers. Never combine the counts into one score, rank the
   drafts, or call a module deep or shallow: a board says which parts callers
   reach, not what the code behind them does. A pass-through entry point is a
   question for the reader, never a fault.
6. When the request asks for a choice, adopt the chosen draft (step 4) or keep
   it as a draft. Then shelve each other draft with the reason it lost:
   `archboard semantic shelve <board> --variant <draft> --reason "<why>" --expect-version <n> --doing "..."`.
   A shelved draft keeps its content, so its measures stay readable beside the
   reason.

Archboard's own board `Board persistence` shows how boards persist. On it,
`Board store` is the module that reads and writes every board. Its callers
reach several of its functions. Here are two drafts of its interface, both
from the current variant:

```bash
archboard semantic branch "Board persistence" --as "One index" --summary "Callers reach the store only through index.ts" --expect-version 28 --doing "drafting a one-index store"
archboard semantic branch "Board persistence" --as "Entry per job" --summary "Each caller reaches the function it uses" --expect-version 29 --doing "drafting a store with an entry per job"
archboard semantic compare "Board persistence" --variant "One index" --beside "Entry per job"
```

The answer has one line for `Board store`, with the five counts of
`One index`, of the current variant and of `Entry per job` in that order.
`One index` has one entry point and every other child hidden. If that index
sends exactly one call on, of the kind it receives, the answer names it as a
pass-through entry point: ask what it hides before you keep it.
`Entry per job` has more entry points and fewer hidden parts. Report each
row and what each draft costs a caller, and let the person choose. When told to keep `One index`, shelve
`Entry per job` with the reason, for example "each caller then depends on how
the store splits its work".

Read [variants](references/variants.md) for what the comparison counts and
what it is read against, for a proposal that holds disagreements after its
predecessor moved
(`semantic resolve`), and for adoption rules.
