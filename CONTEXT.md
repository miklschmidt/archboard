# Domain language

Archboard lets agents author architecture that people read and compare.
One local vault holds one canonical model.
The browser renders meaning and keeps presentation state.
Local agents read source and submit explicit architecture operations.

## Canonical model

A vault is the `.archboard/vault` directory of a checkout or an explicitly registered local directory.
Every request names its vault.
The CLI discovers it from the working directory or `-C`.
The registry identifies repositories and their chosen checkouts.
It owns no architecture content.

The manifest is `model.json`.
It gives the model its stable identity, name, and optional current designation.
A new model has no current state.
That empty planning state differs from an unavailable or unmigrated model.

A module is one architectural responsibility with a stable qualified identity.
Its definition lives in one `.module.json` file.
A module can name a parent in the same model.
Parents form a containment forest without fixed levels or a depth limit.
Containment states ownership, not a relationship between independent descriptions.

A qualified identity includes its model namespace and local identity.
Imported identities can also retain an original board namespace.
Names and former names support discovery when they resolve uniquely.
They never establish shared identity.
A binding, responsibility, or matching name does not merge two subjects.

A relationship states a directed architectural connection.
Its source module owns it in `outgoing`.
The reader derives incoming connections and a complete relationship list.
Continuing relationships keep their identities through edits and endpoint changes.
An explicit removal and addition declare a replacement.

Authored order controls sibling modules, relationships, and ordered collections.
Stable identities resolve equal positions deterministically.
The renderer chooses geometry.
A caller never stores hand-adjusted layout as architecture.

## Behavior and reading

A flow collection is one `.flows.json` input with independent behavioral exchanges.
A flow names its participants and ordered steps.
Steps can describe exchanges, decisions, and loops.
A complete behavioral reading keeps all participants and steps.
A structural scope never truncates that exchange.

A reading is a content-free presentation selection.
It selects module scope, focused identities, hidden kinds or groups, diagram grammar, and optional flow.
The grammars are architecture, sequence, and flowchart.
Sequence and flowchart require an explicit authored flow.
A reading also identifies its architectural state or retained checkpoint.
It owns no duplicate architecture definitions.

The shared projection converts a coherent canonical reading into the existing semantic renderer's content.
The browser and backend use the same projection rules.
The browser keeps its camera, selection, reading controls, and walkthrough position locally.
The server does not host remote rendering or remote agent work.

A walkthrough is an authored sequence of explanatory beats.
Each beat selects its complete reading and stable subjects.
Pinned narrative targets name exact retained architecture.
Narration preserves the captured source revision and refuses unavailable beats.
An original saved talk remains exact retained history.
Replaying it does not recreate a live board writer.

A render recipe records an artifact's exact model identity and reading selectors.
It also records its input revision and picture digest.
SVG and PNG metadata use the existing recipe owner.
Git-tracked recipes let `check embeds` find reproducible artifacts.
Explicit repair redraws a local source through the existing renderer and rasterizer.
It does not choose another model by a matching name.

## Architectural states

Current is the model's optional designation of implemented architecture.
Adoption changes that designation through an explicit proposal operation.
A checkpoint alone never selects current.

A proposal is one independently identified draft architectural state.
Its compact record stores identity changes against an exact predecessor.
The reader materializes complete meaning through the existing proposal machinery.
Independent proposals can share a name and remain independent identities.
A child proposal follows its own predecessor, not another proposal with a similar name.

Reconciliation resolves a proposal's inherited changes after its predecessor changes.
The existing family operation installs all affected descendants together.
Blocked or superseded proposals retain their identities and explicit recovery routes.
A comparison records the selected state, comparison source, and separate source revision.
A stale comparison cannot authorize a new adoption or code inspection.

A checkpoint retains exact authored inputs and selection metadata in Git.
The history archive uses the existing independent ref or explicit private archive.
It does not alter a source checkout's branch, HEAD, or index.
Configured Git signing remains in force.
Publication transfers retained architecture through the existing explicit Git route.
It introduces no source-history archive or hosting service.

A correction records an explicit change to retained historical meaning with immutable source evidence.
It preserves the original retained history and its association with the corrected state.
Reading exact history never silently substitutes current architecture.

## Authoring and recovery

An intent is one complete authorized architecture operation.
It names its operation identity, writer, doing line, exact target, and complete expected revision.
The operation identity makes an exact retry safe after a lost response.
Reusing it for different meaning refuses the operation.

A claim is an explicit writer's ownership of affected subjects, state, and structure scopes.
Claims remain visible while the agent works.
They do not prevent reading.
The existing short installation lease serializes durable writes.
A human can revoke a claim through its existing control.
The former writer receives the revocation on its next write.

The complete revision fingerprints every authored input that establishes the selected model.
The writer must use a fresh complete revision rather than a selected file's version.
The runtime resolves names and checks the complete candidate before installation.
One accepted intent installs through the existing atomic journal and archive mechanisms.

A pending transaction refuses ordinary reads with `RECOVERY_REQUIRED`.
Explicit recovery uses the original operation, checkout, and retained input images.
It preserves foreign edits and refuses a conflicting recovery context.
The initializer, migration installer, portable importer, and normal editor share these mechanisms.

## Source and local agents

A code binding belongs to a module's meaning.
It names the implementing repository, path, optional symbol, and optional source ref.
The existing resolver selects a registered local checkout or exact local Git content.
It never treats a display name as a repository identity.

Code inspection compares canonical semantic claims with actual source evidence.
The existing language and infrastructure algorithms remain the analysis owners.
Findings name their model, selected state, stable subject, authored file, and complete revision.
The server remembers completed findings for that revision.
A pane never starts a code pass by reading those findings.

Locality reports which bound modules change often and which change together.
Branch footprint reports which bound modules a local source range changes.
Both operations read canonical content through the existing Git algorithms.
They preserve source refs and do not fetch or retain another source history.

A tab session owns one local coordinator and one workhorse for each checkout it uses.
A pane report carries the exact canonical capture in `architecture`.
It includes the actual vault, model, selected identities, reading intent, and observed revisions.
An explanation keeps that capture and returns temporary text.
It authors no architecture.

Agent navigation uses the existing pane router and checkout selection.
The `pane_model` message carries an addressed reading for client-local rendering.
Only the browser's activation action changes the tab's shown conversation.
Opening another model from an agent cannot activate another workhorse implicitly.
Canonical changes flow through the existing agent context feed.

## Explicit legacy migration

Legacy board documents remain decodable for migration and exact retained history.
A legacy board's level, views, variants, and document version describe that original format.
They are not a second live authoring model.
Ordinary live operations refuse unmigrated authority with `LEGACY_AUTHORITY`.

Inventory records each original identity and exact source fingerprint.
An explicit mapping plan records the owner's identity decisions and reasons.
Preview resolves that plan without rewriting original files.
Installation requires explicit authorization and the exact expected source and plan revisions.
The existing migration journal retains the original history and supports recovery.
The runtime never infers full-vault identity mappings from names or bindings.

See [ADR 0060](docs/adr/0060-canonical-model-reads-keep-legacy-authority-explicit.md),
[ADR 0061](docs/adr/0061-active-proposals-store-identity-changes.md), and
[the canonical consumer reference](skills/archboard/references/canonical-models.md).
