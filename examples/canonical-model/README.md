# Authored canonical model fixture

Copy this directory to a temporary directory before using it.
Commands inside this repository discover its authoritative legacy vault.

```bash
fixture_dir=$(mktemp -d)
cp -R examples/canonical-model/.archboard "$fixture_dir/.archboard"
archboard model read -C "$fixture_dir"
archboard model read 'Shop#Gateway' -C "$fixture_dir"
```

The fixture contains two root services and one child module.
The Gateway calls the Worker and carries authored metadata for the details view.
The public result identifies the roots as `Shop#Worker` and `Shop#Gateway`, in that order.

The fixture exercises a read-only path.
It requires no migration, history archive, or model writer.

## Exact checkpoint workflow

The following commands use your configured Git identity and signing.
Run them from this Archboard checkout.
The temporary repository keeps this example separate from the authoritative legacy vault.

```bash
checkpoint_fixture=$(mktemp -d)
cp -R examples/canonical-model/.archboard "$checkpoint_fixture/.archboard"
git -C "$checkpoint_fixture" init --quiet --initial-branch=main
git -C "$checkpoint_fixture" add .archboard
git -C "$checkpoint_fixture" commit -m 'test: seed canonical architecture'
archboard model read -C "$checkpoint_fixture" > "$checkpoint_fixture/reading.json"
checkpoint_revision=$(bun -e 'const reading = await Bun.file(process.argv[1]).json(); if (!reading.success) process.exit(1); process.stdout.write(reading.revision.digest);' "$checkpoint_fixture/reading.json")
archboard model retain -C "$checkpoint_fixture" \
  --operation-id fixture-before-change --writer fixture-agent \
  --expect-revision "$checkpoint_revision" \
  --doing "retaining the original fixture" > "$checkpoint_fixture/retained.json"
checkpoint_id=$(bun -e 'const receipt = await Bun.file(process.argv[1]).json(); if (!receipt.success) process.exit(1); process.stdout.write(receipt.checkpoint.id);' "$checkpoint_fixture/retained.json")
bun -e 'const path = `${process.argv[1]}/.archboard/vault/gateway.module.json`; const module = await Bun.file(path).json(); module.responsibility = "Changed after the checkpoint"; await Bun.write(path, JSON.stringify(module));' "$checkpoint_fixture"
archboard model read 'Shop#Gateway' -C "$checkpoint_fixture"
archboard model read 'Shop#Gateway' -C "$checkpoint_fixture" --checkpoint "$checkpoint_id"
archboard model checkpoints -C "$checkpoint_fixture"
```

The current reading shows `Changed after the checkpoint`.
The retained reading shows `Accepts shopping requests` and its original revision.
Its `checkpoint.id` remains exact.
Its `sourceEvidence` reports source availability independently of the architecture.
The metadata files above remain outside the vault and never enter the retained architecture.

For the browser handoff, keep the temporary directory and the retained receipt.
Address its vault explicitly and use `checkpoint.id` with the shared model-read endpoint.
The browser uses the common result schema and one read-only architecture query snapshot.
TASK-549.02 leaves its visible checkpoint selector and browser evidence to the parent.

## Publish and recover a local example

Complete the exact checkpoint workflow above first.
These commands use its temporary repository and checkpoint identity.
The bare remote below is disposable and receives only that example's history.

```bash
archive_fixture=$(mktemp -d)
git init --bare --quiet --initial-branch=main "$archive_fixture/history.git"
git -C "$checkpoint_fixture" remote add archive "file://$archive_fixture/history.git"
archboard model publication-configure -C "$checkpoint_fixture" \
  --remote archive --ref refs/heads/archboard-history
archboard model publication "$checkpoint_id" -C "$checkpoint_fixture"
git -C "$checkpoint_fixture" push archive main:main
archboard model publication "$checkpoint_id" -C "$checkpoint_fixture"
archboard model publish "$checkpoint_id" -C "$checkpoint_fixture" \
  --remote archive --ref refs/heads/archboard-history
archive_reader="$archive_fixture/reader"
git clone --quiet --depth=1 --single-branch --branch=main \
  "file://$archive_fixture/history.git" "$archive_reader"
git -C "$archive_reader" remote add archive "file://$archive_fixture/history.git"
archboard model publication-configure -C "$archive_reader" \
  --remote archive --ref refs/heads/archboard-history
archboard model read -C "$archive_reader" --checkpoint "$checkpoint_id"
archboard model fetch "$checkpoint_id" -C "$archive_reader" \
  --remote archive --ref refs/heads/archboard-history
archboard model read -C "$archive_reader" --checkpoint "$checkpoint_id"
archboard model checkpoints -C "$archive_reader"
```

Both status reads before explicit publication return `saved-locally`.
The ordinary code push does not publish the archive.
The initial exact read in the shallow reader returns `ARCHITECTURE_UNAVAILABLE` and exits 2.
The explicit fetch restores the exact checkpoint and its referenced baselines.
The final reading preserves the checkpoint identity and reports `published`.
The source checkout stays on its original HEAD.

The result reports the remote retention limitation through `retention`.
This example installs no rewrite or deletion protection on the disposable remote.
For a shared remote, its owner must establish those controls and maintain backups.
The focused runtime owners also cover network loss, signed stale-publication joins, shallow archive recovery, and independent current models.
The parent owns the visible browser publication and recovery workflow.
