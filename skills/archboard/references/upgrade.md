# Upgrade an old vault

A vault in the old format reads, and every write refuses with `UPGRADE_REQUIRED`: its relationships state no effect, or still have the retired kind `call`.
The upgrade gives each relationship a kind and an effect read from the code, and keeps every id and every effect already stated.

## Write the inventory

```bash
archboard upgrade inventory --out upgrade/
```

It writes one file per root module into an empty directory. Each entry is a relationship of the current state, or one a draft adds or gives another kind (`proposal` names the draft).
It carries `oldKind`, both ends with their bindings, the label, the description and the anchor.
`kind` starts as the old kind, except a retired one. A former `call` starts as the code facts say its anchored call runs: `async` where the call is awaited or started, `sync` for a plain call of a function that is not async, and empty where the code does not tell. A former `data` starts empty.
`effect` starts as the effect the relationship states, if any, and `gap` starts empty.
The inventory needs a running server, which reads the code facts.
A draft that does not read blocks the inventory; the refusal names it.

## Fill each entry from the code

The files are disjoint, so give each one to its own agent. Fill every entry. Each one is done when it names a kind and an effect you read in the code.
Open the anchor, or the bindings of both ends, and read the operation the source asks the target to do. Follow delegated work to the code that does it, and read a library's contract when the target is one.

Set `kind` and `effect` as [choose the kind and the effect](authoring.md#choose-the-kind-and-the-effect) says.
Read every empty `kind` of a former `call` in the code and choose `sync` or `async` as [sync or async](authoring.md#sync-or-async) says. Check a sample of the seeded ones against their call sites too.
Correct the old kind where the code says otherwise. A former `data` relationship takes the kind that carries it: `storage` only for direct store access. A former `other` relationship takes the kind that says how it travels, or a kind that the vault adds.
When you cannot rule a side effect out, write `mutation` and say why in `gap`.

## Review and install

Have a second agent or the user review each file before you install it: the entries with a `gap`, every `query` and `compute`, and every kind you changed.

```bash
archboard upgrade install --inventory upgrade/ --writer agent --doing 'Upgrade the vault to kinds and effects'
```

It installs every file as one change, or refuses with `INVENTORY_INCOMPLETE` and one diagnostic per unclassified relationship, and changes nothing.
`STALE_REVISION` means the vault changed since the inventory: write it again into a new directory and carry your entries over.
Report the answer's `gaps` to the user. Keep the filled inventory as the record of the review.
Then run `archboard check code`. `CALL_TIMING_MISMATCH` is information: read each one, and correct the kind where the call says otherwise.
The configuration drops an entry that restated the old default of `call`, and refuses `relationshipKinds.call`. Move a real override of `call` to `sync` or `async`.
