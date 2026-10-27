# Authored canonical model fixture

Copy this directory to a temporary directory before using it.
Commands inside this repository discover its authoritative legacy vault.

For proposal completion, use the existing `model edit` request with an active draft target and its complete revision.
An adoption adds `proposal:{type:"adopt",reason:"The change is implemented."}` and `changes:[]`.
A shelving adds `proposal:{type:"shelve",reason:"The team chose another design."}` and `changes:[]`.
Both actions require the existing claim, writer, operation identity, and doing line.
Read the returned state ID to reopen its retained architecture.
Use `model compare --state <draft-id> --against current` before any forced adoption.
Copy its complete comparison into `proposal.comparison` and set `proposal.force` to true.
The consumer guide explains the complete [lifecycle contract](../../skills/archboard/references/canonical-models.md#complete-a-proposal).

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

## Private local history

Run this example from this Archboard checkout.
The temporary vault stays outside a source repository.
The setup result supplies the private bare archive directory.
Configure that archive with your Git author identity and required signer before retention.

```bash
private_fixture_dir=$(mktemp -d)
cp -R examples/canonical-model/.archboard "$private_fixture_dir/.archboard"
archboard model archive-init -C "$private_fixture_dir" > "$private_fixture_dir/archive.json"
private_archive_dir=$(bun -e '
const result = await Bun.file(process.argv[1]).json();
if (!result.success) process.exit(1);
console.log(result.archive);
' "$private_fixture_dir/archive.json")
git -C "$private_archive_dir" config user.name "Architecture Author"
git -C "$private_archive_dir" config user.email "author@example.test"
archboard model read -C "$private_fixture_dir" > "$private_fixture_dir/reading.json"
private_revision=$(bun -e '
const result = await Bun.file(process.argv[1]).json();
if (!result.success) process.exit(1);
console.log(result.revision.digest);
' "$private_fixture_dir/reading.json")
archboard model retain -C "$private_fixture_dir" \
  --operation-id private-first --writer fixture-agent \
  --expect-revision "$private_revision" --doing "retaining local architecture" \
  > "$private_fixture_dir/retained.json"
private_checkpoint=$(bun -e '
const result = await Bun.file(process.argv[1]).json();
if (!result.success) process.exit(1);
console.log(result.checkpoint.id);
' "$private_fixture_dir/retained.json")
archboard model read -C "$private_fixture_dir" --checkpoint "$private_checkpoint"
archboard model checkpoints -C "$private_fixture_dir"
```

No command creates a source `.git` directory.
Retention reports `saved-locally` and an empty source-association list.
The existing claim, edit, and recover workflow also uses this private archive.
Repeated initialization preserves its directory and history.
The owner must back up both the authored vault and its private archive.
Preserve the original vault location while an interrupted edit needs recovery.

For publication, add the intended named remote in `private_archive_dir` first.
Then configure that remote and an independent archive ref through `model publication-configure`.
Only an explicit `model publish` sends history.
The runtime publication test uses a temporary local bare remote and proves that published objects contain no generated machine paths.
Portable export remains a separate delivery slice.

## Module rename and relationship transfer

Run this workflow from this Archboard checkout with a configured Git identity and signer.
Start this checkout's server with `archboard start` before the first model command.
The authored `structure-changes.json` supplies one batch, which holds every change for one intent.
This batch renames Gateway and transfers Dispatch to Worker without changing either identity.

```bash
structure_fixture_dir=$(mktemp -d)
cp -R examples/canonical-model/.archboard "$structure_fixture_dir/.archboard"
git -C "$structure_fixture_dir" init --quiet --initial-branch=main
git -C "$structure_fixture_dir" add .archboard
git -C "$structure_fixture_dir" commit -m 'test: seed canonical structure fixture'
archboard model read -C "$structure_fixture_dir" > "$structure_fixture_dir/reading.json"
bun -e '
const reading = await Bun.file(process.argv[1]).json();
if (!reading.success || reading.manifest.current === null) process.exit(1);
console.log(JSON.stringify({
  target: { model: reading.manifest.id, state: reading.manifest.current.id },
  writer: "fixture-agent", reason: "changing structure",
  subjects: ["Shop#Gateway", "Shop#Worker", "Shop#Dispatch"]
}));
' "$structure_fixture_dir/reading.json" > "$structure_fixture_dir/claim.json"
archboard model claim -C "$structure_fixture_dir" --input "$structure_fixture_dir/claim.json" > "$structure_fixture_dir/claimed.json"
bun -e '
const reading = await Bun.file(process.argv[1]).json();
const claimed = await Bun.file(process.argv[2]).json();
const changes = await Bun.file(process.argv[3]).json();
if (!claimed.success) process.exit(1);
console.log(JSON.stringify({
  target: claimed.claim.target, expectedRevision: reading.revision,
  operationId: "fixture-structure-1", writer: "fixture-agent", claim: claimed.claim.id,
  ...changes
}));
' "$structure_fixture_dir/reading.json" "$structure_fixture_dir/claimed.json" \
  examples/canonical-model/structure-changes.json > "$structure_fixture_dir/edit.json"
archboard model edit -C "$structure_fixture_dir" --input "$structure_fixture_dir/edit.json" \
  --doing "renaming the gateway and transferring dispatch" > "$structure_fixture_dir/edited.json"
archboard model edit -C "$structure_fixture_dir" --input "$structure_fixture_dir/edit.json" \
  --doing "renaming the gateway and transferring dispatch" > "$structure_fixture_dir/retried.json"
archboard model read 'Shop#Gateway' -C "$structure_fixture_dir"
git -C "$structure_fixture_dir" diff --name-only
bun -e '
const claimed = await Bun.file(process.argv[1]).json();
console.log(JSON.stringify({ claim: claimed.claim.id, writer: "fixture-agent" }));
' "$structure_fixture_dir/claimed.json" > "$structure_fixture_dir/release.json"
archboard model release -C "$structure_fixture_dir" --input "$structure_fixture_dir/release.json"
```

The changed tracked files are `gateway.module.json` and `worker.module.json` inside the fixture vault.
The Gateway keeps its ID, filename, and former names, including the newly retained name `Gateway`.
Dispatch keeps its ID, metadata, and evidence anchor.
Its new source is Worker and its new target is Gateway.
The retry returns the same checkpoint and complete affected subject set.
The child module file and manifest remain byte-identical.
Use the canonical model reference for module additions, removals, reparenting, and relationship field clearing.

If the browser already shows Gateway, its details update to API after the operation.
The incoming connection now names Worker, while the outgoing Dispatch connection is absent.
A reparented module keeps its selection and identifies its parent in the details.
Removing the selected module shows an unavailable selection instead of opening another module.
A retained reading still shows the original Gateway and Dispatch connection.

Open Gateway to read its immediate Handler module.
Worker stays nearby because Gateway calls it.
The breadcrumb returns to the repository roots without changing either module file.
Select Gateway → Worker through the Connections list.
Its details identify the Dispatch request relationship and its original endpoints.
The address records the model, scope, and saved reading for each pane.
Reload preserves that reading.

## Initialize and export a planning model

Use a disposable Git checkout for this recipe.
Keep the checkout's configured signing policy.

```bash
example_dir=$(mktemp -d)
git init --quiet "$example_dir"
bun scripts/build-pipeline-example.ts "$example_dir/.archboard/vault"
archboard model read --state 'Initial pipeline' -C "$example_dir"
archboard model render --state 'Initial pipeline' --out "$example_dir/pipeline.svg" -C "$example_dir"
archboard model rasterize --state 'Initial pipeline' --out "$example_dir/pipeline.png" -C "$example_dir"
bun scripts/engine-gallery.ts "$example_dir/.archboard/vault" "$example_dir/gallery" track 'Initial pipeline'
```

The builder calls public canonical initialization, claims, and edit operations.
It creates an unadopted proposal and releases its claim.
An exact retry preserves the existing model and proposal identities.
An unrelated occupied vault refuses initialization.
For an untracked vault, initialize its private archive explicitly before the recipe.

## Read local source history

The existing code and Git algorithms read canonical modules and their bindings.
Use a source repository whose local refs and bound paths exist.
The commands do not fetch source refs or retain another source history.

```bash
archboard check code --state '<state-id>' -C '<checkout>'
archboard model locality --state '<state-id>' --since 2026-01-01 -C '<checkout>'
archboard model footprint --state '<proposal-id>' --base main --head feature -C '<checkout>'
```

Results name the actual model, selected state, complete revision, and source evidence.
The footprint compares a proposal with its exact architectural comparison base.
`--against` selects an explicit comparison source.
A missing source ref appears in the existing skipped or unresolved evidence.
A missing architecture state returns a structured refusal.

## Address an agent pane

Use the pane identifier that `browser panes` reports.
The existing pane router resolves this request before changing a pane or chosen checkout.

```bash
archboard browser show --pane '<pane>' --module 'Shop#Gateway' -C '<checkout>'
archboard browser show --pane '<pane>' --walkthrough '<walkthrough-id>' --beat 1 -C '<checkout>'
archboard browser panes
```

The exact capture appears in `panes[].architecture` beside its tab session identity.
Agent navigation never activates another shown conversation.
The browser's existing activation action focuses the workhorse.
Rendering and agent execution remain local.
