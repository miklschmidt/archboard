# Plan legacy identities

This example copies two immutable original board fixtures and inventories their overlapping descriptions.
Use a temporary directory outside another Git checkout.
The commands require Archboard on PATH and Bun.

```bash
example_dir=$(mktemp -d)
git init --quiet "$example_dir"
mkdir -p "$example_dir/.archboard/vault"
cp examples/legacy-migration/originals/*.semantic.json "$example_dir/.archboard/vault/"
archboard model inventory --origin Shop -C "$example_dir" > "$example_dir/inventory.json"
```

Read the inventory before selecting a canonical identity.
The same name and binding supply evidence, while the different responsibilities produce a definition conflict.
The two API identities retain their original board namespaces.

Create an editable request from that exact inventory:

```bash
bun -e 'const r=await Bun.file(process.argv[1]).json(); if(!r.success) throw new Error(JSON.stringify(r)); await Bun.write(process.argv[2], JSON.stringify({plan:r.plan,expectedPlan:r.planRevision},null,2));' "$example_dir/inventory.json" "$example_dir/choices.json"
```

Add the owner's explicit mapping and reason to `plan.mappings` in `choices.json`.
Use the returned identities instead of inventing replacement IDs.
Follow the [consumer recipe](../../skills/archboard/references/legacy-migration.md) for choice syntax and stale-source recovery.

```bash
archboard model plan --input "$example_dir/choices.json" --doing "Record the owner identity choices" -C "$example_dir"
archboard model inventory --origin Shop -C "$example_dir"
```

The saved plan remains separate from the original bytes.
After every conflict has an explicit choice, read the candidate:

```bash
archboard model read --preview Shop -C "$example_dir"
```

The preview preserves source fingerprints, semantic details, and explicit identity choices.
It installs no canonical files and changes no original input.
An unresolved choice returns a structured refusal.
A source change requires a fresh inventory and revised plan.
The [consumer recipe](../../skills/archboard/references/legacy-migration.md#preview-the-current-model) describes reference and policy choices.
