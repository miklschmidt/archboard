---
status: accepted
---

# Active proposals store identity changes

A small proposal must not repeat unchanged modules and flows in a code review.
TASK-549.06 stores each active canonical proposal in one `.proposal.json` file.
Legacy board families retain their authority until explicit migration.
This decision replaces complete draft snapshots for canonical models in ADR 0023.
It extends the canonical reader in ADR 0060 and the retained archive in ADR 0059.

The proposal records a stable state identity, lasting name, former names, summary, documents, predecessor identity, immutable baseline, and normalized changes.
Its lifecycle is explicitly `draft`.
A planning model can have no current state.
A new planning root retains an empty coherent baseline and introduces its subjects through additions.
A child names its predecessor by stable state identity.
Agents resolve unique names through the reader before writing that identity.
Sibling proposals share no mutable copy of their predecessor.

Changes distinguish additions, removals, field assignments, explicit clearing, and structural placement.
Each change addresses a stable subject identity.
Assignments replace composite fields atomically.
Omitted fields preserve their values, and null never means deletion.
Module placement names its parent or the model root.
Relationship placement names its source module.
Flow placement names its collection and relative sibling.
Step placement names its flow, loop, or exact decision alternative and relative sibling.
No change addresses a text line or an array index.
The existing flow rules retain alternative labels, subtree identities, and explicit child placements.

The runtime applies the existing module and flow batch to one complete candidate.
It derives compact changes against the original baseline.
Before signing, it materializes those changes and requires exact agreement with the intended candidate.
The canonical decoder validates the complete result.
A small edit stores changed fields and placements, without copying unchanged subjects into the active proposal.
Only its proposal file changes.
Draft additions remain outside current module and flow files.
The existing identity authority reserves additions and removals across active proposals.

Baseline snapshots live in the existing signed archive.
Actual Git parents retain every required baseline, including a predecessor draft's baseline.
The same archive engine supports source repositories, private archives, publication, and missing-history recovery.
Proposal writes use the existing claim, complete stale token, durable journal, file installation, exact retry, and completion notification.
They introduce no second writer, recovery log, or history store.
Signing failure refuses installation before authored inputs change.

Claim admission validates live state identity and known subject scopes from the coherent authored catalog.
The writer materializes selected architecture after it validates the exact token and writable standing.
Exact input revisions and complete claims remain mandatory before installation.

A current read exposes the active proposal catalogue and explicit selected state metadata.
A selected draft always reports lifecycle `draft`, even when its retained manifest still names an implemented state.
Its read token covers the addressed vault's exact input paths and bytes, including active proposals.
An exact checkpoint instead uses its retained inputs and token.
An exact read of a previously current state reports lifecycle `historical`.
It never changes the checkout's designation.

Non-current readings compare against current by default.
Without current, a dependent draft compares against its retained predecessor.
A planning root has no predecessor comparison.
An explicit comparison can select two coherent named states or exact checkpoints.
The existing semantic comparison rules report changes by subject identity.
The response includes the comparison base revision independently of the selected revision.
A renderer that reads base definitions separately requires that exact revision before composing removed subjects.
This also applies when a retained draft compares against live current architecture.
Canonical metadata and collection ownership extend those rules without interpreting geometry as architecture.

A predecessor fingerprint identifies complete meaning, metadata, policy, and identity reservations independently of sibling proposal files.
If that predecessor changes, ordinary draft reads and edits return `PREDECESSOR_CHANGED`.
Exact retained proposal revisions remain readable against their own retained catalogue.
This refusal prevents an unreconciled draft from appearing settled.
TASK-549.07 adds family reconciliation and explicit settlement through the same operation.
TASK-549.08 completes adoption and shelving through that same writer.

CLI and HTTP adapt the existing architecture operations.
The public package interface gains no names.
The browser uses explicit selected state metadata when it labels a draft.
State and comparison selectors belong to each pane address.
The state picker lists active proposals and exact saved readings.
The comparison picker supports the runtime default and explicit bases.
Unavailable selections remain in the address and controls.

Mutable draft queries follow the existing architecture change feed.
Current snapshots update only the default current query.
Other mutable readings refresh through their own state and comparison selectors.
Exact checkpoint queries remain separate.

The browser compares complete semantic contents through the existing comparison operation.
Removed subjects come from a separately read base with the same model, state, checkpoint, and comparison revision.
An unavailable or changed base supplies no removed definitions.
The diagram explains its incomplete comparison and offers a refresh action.
The inspector uses the runtime's changed fields rather than inferring changes from placement.
Scope, focus, and filters affect depiction without changing the selected architecture or its complete interfaces.

TASK-549.07 publishes a predecessor edit, safe inherited changes, and durable standing through one existing journal.
The existing semantic reconciliation engine applies the canonical decoder as its coherence authority.
Canonical module metadata, collection ownership, qualified identities, and reference rules remain part of that complete result.
Serialization refuses an unowned relationship or flow before it can disappear.
Automatically assigned arrival positions use the existing semantic rule.
Step identity spans flows before each flow receives its reconciled order.
A step placement keeps its flow and nested holder together, so competing moves cannot compose an unwritten location.

Reconciliation visits parents before children.
An unsettled parent blocks its descendants while their last coherent content stays readable.
A conflict retains the original proposal baseline and keeps its side of disputed subjects.
Further predecessor edits preserve that baseline and refresh the issues against the new predecessor.
Ordinary edits preserve standing.
Claims include every changed descendant state and its existing affected subjects.
Inherited additions require the existing structure scope rather than a claim on an identity that does not exist yet.

Settlement supplies one explicit choice for every standing issue in the same intent.
Choices accept the proposal side, the predecessor side, or the accompanying ordinary batch as a third answer.
Incomplete and overlapping choices refuse before installation.
A complete settlement retains the new predecessor baseline and reconciles following drafts in the same transaction.
A deleted subject that the chosen answer keeps requires proof of its original identity from an exact retained checkpoint.
The proposal records that proof, and actual archive dependencies retain it.
The reader requires the original subject before it permits that continuing identity beside retired reservations.
No new identity authority or history store exists.

Shared readers expose standing on proposal catalogue entries and selected state metadata.
The browser uses that standing for state choices, unresolved values, and blocked ancestry.
Comparison differences never establish whether a proposal needs settlement.
Readers can open the live blocking ancestor. Exact retained readings keep their original standing after a live settlement.
Agents author settlements through the shared writer, and the browser reflects the durable family result.
Write and recovery receipts report unsettled family states from the same signed record.
CLI and HTTP interpret neither conflicts nor recovery progress.
An explicit reconcile intent follows deliberate external predecessor edits.
Until then, the existing predecessor refusal preserves the requested draft and its retained history.

Adoption requires a coherent settled proposal and settled ancestry.
A superseded current predecessor refuses adoption by default.
Forced adoption requires the complete explicit comparison against the observed current revision.
The runtime compares that captured result before it installs the proposal's complete materialized architecture.
It never applies a compact patch blindly to another baseline.

The current designation retains the adopted state's stable identity, names, documents, predecessor, baseline, reason, and lifecycle time.
The signed checkpoint retains the final compact proposal and the exact prior current reading.
Shelving retains the same proposal evidence without changing current architecture.
Both intents remove the active proposal through the existing recoverable installation.
Following drafts retain their predecessor identities and reconcile against the completed reading in that same transaction.
An exact retry returns one retained event.

Completed history never enters current model files or active proposal files.
The shared reader derives completed state metadata from explicit lifecycle records in the existing archive.
Displacement records identify the final reading of a former current state.
Archive append order supplies no architecture ancestry or current designation.
Ambiguous retained identities require an exact checkpoint.
Logical and exact historical readings preserve source associations, foreign pins, and comparison behavior.

TASK-549.09 adds explicit factual corrections to completed logical states through the same writer.
The request names the latest exact checkpoint, a reason, and immutable source revisions.
The live input token and complete affected claims remain mandatory.
Current and draft states refuse correction intents, and ordinary historical edits still refuse.
The runtime requires available source commits for every referenced repository.
The author remains responsible for the factual interpretation of that evidence.

The retained correction stores normalized identity changes and an explicit link to the prior checkpoint.
Actual Git parents retain that checkpoint and all required proposal baselines.
The existing subject engine materializes the corrected reading and the existing comparison engine describes its differences.
Logical lookup follows correction links and exposes the audit chain.
Exact checkpoint lookup preserves the original record.
Concurrent correction tips remain ambiguous instead of selecting by archive append order.
Fetched publication refs participate in the same derived logical catalogue.

The existing family operation reconciles local following drafts against corrected facts.
It preserves conflict baselines and blocks descendants of unsettled drafts.
Propagation stops at adopted, historical, and shelved successors.
The correction changes no current designation or unrelated current content.
Current authored files gain no correction ledger or copied history.

Archive-only writes still use the durable journal, configured signer, exact retry, and completion feed.
The observer reads newly retained operations after the archive ref changes.
Idle observations read the loose ref and packed-ref metadata without starting Git.
Only records for the addressed vault produce completion events.
