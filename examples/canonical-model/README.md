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

The initial walkthrough exercises a read-only path.
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

If the browser shows this model, open the reading menu.
Select the retained checkpoint.
Select Current to return to current files.
Each reading shows its own architecture and source evidence.

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
The browser shows the selected checkpoint with its sharing status.
Select Set sharing destination to enter the configured remote and archive ref.
Select Publish history to send the archive explicitly.
After a network failure, select Retry publication when the remote returns.
For missing history, select Fetch this reading.
The reading stays selected while the archive restores its exact content.
The browser keeps the remote retention limitation visible beside these controls.

## Durable description edit

Run these commands from this Archboard checkout with a configured Git identity and signer.
The temporary repository contains one canonical fixture.
Every Archboard command addresses it explicitly.

```bash
edit_fixture_dir=$(mktemp -d)
cp -R examples/canonical-model/.archboard "$edit_fixture_dir/.archboard"
git -C "$edit_fixture_dir" init --quiet --initial-branch=main
git -C "$edit_fixture_dir" add .archboard
git -C "$edit_fixture_dir" commit -m 'test: seed canonical edit fixture'
archboard model read -C "$edit_fixture_dir" > "$edit_fixture_dir/reading.json"
bun -e '
const reading = await Bun.file(process.argv[1]).json();
if (!reading.success || reading.manifest.current === null) process.exit(1);
console.log(JSON.stringify({
  target: { model: reading.manifest.id, state: reading.manifest.current.id },
  writer: "fixture-agent", reason: "explaining the gateway", subjects: ["Shop#Gateway"]
}));
' "$edit_fixture_dir/reading.json" > "$edit_fixture_dir/claim.json"
archboard model claim -C "$edit_fixture_dir" --input "$edit_fixture_dir/claim.json" > "$edit_fixture_dir/claimed.json"
bun -e '
const reading = await Bun.file(process.argv[1]).json();
const claimed = await Bun.file(process.argv[2]).json();
if (!claimed.success) process.exit(1);
console.log(JSON.stringify({
  target: claimed.claim.target, subject: "Shop#Gateway", expectedRevision: reading.revision,
  operationId: "fixture-explanation-1", writer: "fixture-agent", claim: claimed.claim.id,
  description: "Authenticates callers before dispatching accepted requests."
}));
' "$edit_fixture_dir/reading.json" "$edit_fixture_dir/claimed.json" > "$edit_fixture_dir/edit.json"
archboard model edit -C "$edit_fixture_dir" --input "$edit_fixture_dir/edit.json" \
  --doing "explaining gateway authentication" > "$edit_fixture_dir/edited.json"
archboard model edit -C "$edit_fixture_dir" --input "$edit_fixture_dir/edit.json" \
  --doing "explaining gateway authentication" > "$edit_fixture_dir/retried.json"
git -C "$edit_fixture_dir" diff --name-only
archboard model read 'Shop#Gateway' -C "$edit_fixture_dir"
archboard model checkpoints -C "$edit_fixture_dir"
bun -e '
const claimed = await Bun.file(process.argv[1]).json();
console.log(JSON.stringify({ claim: claimed.claim.id, writer: "fixture-agent" }));
' "$edit_fixture_dir/claimed.json" > "$edit_fixture_dir/release.json"
archboard model release -C "$edit_fixture_dir" --input "$edit_fixture_dir/release.json"
```

The changed tracked path is `.archboard/vault/gateway.module.json`.
The edit and retry return the same retained checkpoint and before/after revisions.
Private journals, claims, and leases remain inside this checkout's Git administrative directory.
A linked worktree uses its own private records and shares retained Git objects.
The journal records branch and HEAD context, so a branch switch blocks unsafe replay.

If installation stops, run `archboard model recover -C "$edit_fixture_dir"`.
A coherent current read refuses unfinished installation with recovery instructions.
Its `recovery` object identifies the original branch, HEAD, operation, retained checkpoint, progress, and fingerprints.
Use `model read --checkpoint <recovery.checkpoint>` to inspect that candidate independently of the blocked current inputs.
Foreign inputs remain untouched until the owner restores a permitted image.
A completed result with pending cleanup remains applied and readable.
A retry finishes cleanup without another checkpoint.

The backend event stream is `/api/architecture/events?vault=<absolute-vault-path>`.
It sends a fresh current reading and claim list on every connection.
The current browser reading shows the agent claim and offers Take back control.
Stable external edits refresh the reading automatically.
Invalid input or disconnected updates leave the last coherent reading visible with a stale notice.
Repairing the files or reconnecting restores a fresh reading without changing the selected subject.
Exact checkpoint readings remain independent of current updates.
