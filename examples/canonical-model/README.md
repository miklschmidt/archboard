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
git -C "$checkpoint_fixture" init --quiet
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
Foreign inputs remain untouched until the owner restores a permitted image.
A completed result with pending cleanup remains applied and readable.
A retry finishes cleanup without another checkpoint.

The backend event stream is `/api/architecture/events?vault=<absolute-vault-path>`.
It sends a fresh current reading and claim list on every connection.
The parent owns browser claim controls, stale indications, and reconnect evidence for TASK-549.03.
