# Plan legacy identities

This example creates two independent legacy boards and inventories their overlapping descriptions.
Use a temporary directory outside another Git checkout.
The commands require Archboard on PATH and Bun.

```bash
example_dir=$(mktemp -d)
git init --quiet "$example_dir"
archboard install-skill --agent codex --repo "$example_dir"
archboard semantic new System -C "$example_dir" --doing "Describe the public API" <<'JSON'
{"level":"system","nodes":[{"name":"API","kind":"module","responsibility":"Accepts requests","binding":{"repo":"github.com/acme/shop","path":"src/api.ts"}}]}
JSON
archboard semantic new Detail -C "$example_dir" --doing "Describe request processing" <<'JSON'
{"level":"module","nodes":[{"name":"API","kind":"module","responsibility":"Processes accepted requests","binding":{"repo":"github.com/acme/shop","path":"src/api.ts"}}]}
JSON
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

The saved plan remains separate from the live boards.
This example performs no model composition or installation.
