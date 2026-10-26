---
status: accepted
---

# Canonical model reads keep legacy authority explicit

Overlapping boards can give one module several definitions.
TASK-549 replaces that ownership with one canonical model per vault.
Readers need the new model without losing legacy proposals, decisions, or history.

Automatic conversion during a read is rejected.
Independent boards require deliberate identity and history choices before they can form one model.
Legacy boards remain authoritative until explicit migration.
A canonical read refuses a vault that still contains legacy boards.

Agents and readers use one coherent model contract.
A manifest identifies the model and its current state.
Each module owns its definition and outgoing relationships.
Incoming relationships derive from those definitions.
Containment forms a forest, while dependencies can cycle.

Subject identities include their original namespace and short local identity.
Imported board provenance establishes identity, without owning navigation or architecture.
Names and file locations never establish identity.
A current or former name resolves only when it identifies one subject.

The reader preserves authored order, responsibilities, descriptions, groups, bindings, evidence, traffic, and document references.
It refuses duplicate definitions, missing local targets, unsupported formats, and invalid policy.
It never returns a partial model as a coherent reading.

A read token identifies the observed inputs.
It covers recognized paths and exact bytes, including policy.
Archboard refuses inputs that change while it reads them.
This detection does not promise atomic visibility to arbitrary filesystem readers.
Reads create no history, timestamps, counters, or derived authority.

[ADR 0059](0059-checkpoints-retain-architecture-without-selecting-current.md) extends this contract with immutable local checkpoints.
Their historical inputs remain independent of current files.

A pane lists root modules and opens their authored details.
The browser keeps the selected identity as presentation state.
One cached server reading supplies both the list and those details.
Model events, Refresh, returning to the tab, and reconnecting obtain a fresh reading.
Invalid inputs expose their diagnostic and recovery action.
The last coherent current reading can remain visible only with an explicit stale indication.
An empty model remains readable.
A removed selection never silently selects another subject.

For canonical models, this replaces the board ownership in ADR 0015 and ADR 0023.
It replaces the fixed board-level navigation in ADR 0029.
Those earlier contracts still govern legacy vaults.
Agents author meaning, browsers own presentation, and every request names its vault.

## Legacy migration planning

TASK-549.19 introduces an inventory without requiring a canonical writer.
The architecture runtime captures exact legacy bytes and authored policy.
It uses the existing in-memory decoder and never saves its schema normalization.
Complete originals retain independent state coverage, lifecycle records, reconciliation bases, addresses, and references.

The owner selects an import namespace through the existing short-ID contract.
Each original board ID extends that namespace.
The original local subject ID remains unchanged.
Matching names, bindings, and drill-down links supply evidence, without establishing identity.
Only explicit mappings combine subjects.
Mappings name existing identities of the same kind and retain original provenance.

A separate authored `.archboard/migration-plan.json` stores mapping choices and conflict decisions.
Its exact-byte revision protects concurrent planning edits.
The source fingerprint covers recognized inputs and policy but excludes this separate record.
The existing lease and durable atomic writer serialize plan replacement under a reserved non-board key.
Plan replacement changes no board version, current designation, or architecture announcement.
Canonical architecture transactions and archive retention remain separate, later contracts.

Conflicts distinguish definitions, parents, sibling order, relationship ownership, and vocabulary.
Current definitions are compared within their original designated states.
No historical state borrows surrounding current architecture.
Conflict keys include the source fingerprint, so changed sources invalidate old choices.
An explicit replacement value records intent without claiming that a coherent target exists.
Later composition and installation must validate the complete candidate before any cutover.

CLI and server adapters share these schemas and runtime operations.
The public runtime tests use temporary files and disposable Git repositories.
Inventory does not retain external source code or referenced document contents.

## Canonical structure authoring

TASK-549.04 extends the existing edit operation with a batch of module and relationship changes.
A batch holds every change for one intent.
The shared runtime validates the whole candidate before the existing durable transaction installs its affected files.
The CLI and HTTP adapters use the same schema and operation.
The earlier description request remains supported.

New subjects use the model namespace and the existing identity authority.
Callers cannot choose a new subject ID or replace a continuing ID.
New module files use the allocated local ID as their filename.
Renames preserve former names, identities, containment, and file locations.
Field omission preserves the existing value, and an explicit clear list removes optional fields.
Null never requests deletion.
Authored order remains a semantic field with stable identity as its tie breaker.

Each relationship belongs to its source module file.
Changing its source transfers the continuing relationship between files in one transaction.
The transfer preserves all fields that the caller leaves unstated.
Incoming relationships remain derived.
Removal cascades incident relationships unless the same batch explicitly rescues them through valid endpoints.
A removed container cannot leave children behind.
The caller must reparent or remove those children in the same batch.
Removed module and relationship IDs remain reserved in the manifest.
Existing proposal inheritance and restoration confirmations still belong to proposal operations.
Current-state edits create no proposal ancestry and bypass no confirmation requirement.

Claims cover explicit modules, relationships, and the model ID as a structure scope.
That structure scope protects identity allocation and retirement without claiming every module.
A transfer requires its old and new sources and endpoints, plus the relationship identity.
Containment changes include former and new ancestor paths and moved descendants.
One claim must cover the affected existing subjects and any required structure scope.
A competing claim refuses admission, while unrelated subjects remain available.
The complete read token continues to cover all recognized paths, exact bytes, and policy.

Each signed operation retains its affected identities beside the original request.
Recovery details, results, and completion events derive their subjects from that retained record.
Old description records retain their original single-subject interpretation.
A recovered transfer never allocates another identity or repeats the accepted operation.

The existing event stream refreshes current browser readings after the complete structural operation.
Module selection follows identity through a rename or containment change.
The details show the selected module's parent.
Removing the selected module leaves an explicit missing state without selecting a replacement.
Pinned historical readings remain unchanged by those current events.
Unrelated files remain byte-identical.

## Recursive browser readings

A canonical pane reads its model identity, scope, and exact checkpoint from the existing workspace router.
Opening a module changes the reading and adds a browser history entry.
Selecting a subject does not add history.
Reload, Back, and Forward preserve each pane independently, including unavailable readings.
The reader refuses a model identity that differs from the model in the addressed vault.

A scope shows its immediate children and directly connected outside modules.
Outside connections remain context without expanding their dependency graph.
Connections aggregate by directed visible endpoints and relationship kind.
Inspection retains every authored relationship and distinct label in deterministic order.
A connection to the scoped module stays on its boundary.
An authored self-connection remains visible when that module is open.

The renderer prepares a scene key from projected meaning, policy, and complete interface classification.
The query cache accepts only the scene key for the current reading revision.
A late result for another key cannot replace that reading.
File paths, formatting, evidence, and hidden descriptions do not require a new scene.
The existing camera and selection owners remain independent of layout.

## Selection, focus, and filters

Selection holds canonical subject identities outside the reading address.
Pointer modifiers and Ctrl/Cmd+Enter toggle the same identities.
Dragging from empty canvas selects through the renderer bounds.
Space-drag and middle-button drag pan, and Escape clears selection.
Selection updates the mounted scene without requesting layout or adding browser history.

Focus captures those identities in the pane address.
It preserves selected ancestors and descendants, expands their required paths, and adds direct endpoint context.
Hidden internal relationships never become invented self-connections on a visible ancestor.
Missing focused identities remain explicit, including when every target is unavailable.
Clearing focus restores the underlying scope.

Relationship filters hide lines and group filters hide visual group regions.
The model keeps every relationship and group membership.
The inspector derives interfaces before filters and retains hidden selections.
Reveal selection opens the required paths and removes filters that hide selected relationships.
Focus and filters survive reload, Back, and Forward independently for each pane.

## Independent flow authoring

TASK-549.05 adds independent `.flows.json` collections to the complete canonical reading.
A collection identity names an authoring group and differs from qualified flow and step identities.
Its filename restricts no participant or module reference.
Flows preserve authored participant order, nested step order, summaries, notes, repeat counts, and anchors.
Return messages add no structural relationships.

The existing edit batch adds, edits, transfers, or removes collections, flows, and steps.
The existing identity authority allocates new subjects.
A continuing step keeps its identity across flows, loops, and decision alternatives.
A placement names its holder and optional following sibling by stable identity.
A decision holder also names the exact alternative label.
Changing alternative labels requires every affected direct child placement in the same operation.
Missing holders, conflicting moves, cycles, and incompatible order refuse the entire candidate.
The legacy tree assembler runs only after these placements pass validation, so its orphan fallback is unreachable.

Claims cover former and new participants, affected flows, steps, subtrees, and holder paths.
Collection metadata and identity allocation or retirement also require the model structure scope.
Module removal repairs flow references in the same candidate and durable transaction as structural references.
Messages with removed endpoints disappear unless explicit field repairs preserve them.
Repairs remove the empty control steps and flows that they leave behind.
Retired flow and step identities remain reserved.
Unrelated module and collection files remain byte-identical.
Exact retry, signing, recovery, source preservation, private archives, and publication keep their existing owners.

Current and retained reads can explicitly select a flow identity or unique current or former name.
Sequence and flowchart renders require an explicit selection, including when only one flow exists.
The existing renderer operation accepts a grammar choice and keeps the same public export count.
CLI and HTTP adapters preserve the complete behavioral reading without copying architecture into a board.
The CLI installs an output artifact only for a successful command outcome.
A refused render preserves any existing output file and returns structured diagnostics.
The browser reads these same independent flows through explicit diagram modes.

## Code and foreign model references

TASK-549.15 keeps architectural ownership separate from source location and foreign navigation.
A module can hold explicit references that name repository, model, subject identity, and state.
Foreign subjects retain their module, relationship, collection, flow, or step identity and kind.
`current` follows the current designation explicitly.
A non-current reference names a complete immutable checkpoint beside its stable state identity.
Neither a reference nor a code binding establishes containment or transfers ownership.

The existing architecture reader resolves references through the existing checkout resolver and canonical readers.
The source vault uses its own checkout for its repository and chosen checkouts for other repositories.
Derived reference results report an exact target address or actionable unavailable diagnostics.
The CLI and HTTP adapters share this operation, including explicit reference following and code resolution.
No navigation operation writes either model.

Local checkpoint preparation records exact foreign revision pins.
It requires an existing coherent foreign checkpoint that matches the selected target.
Preparation refuses an unretained target before changing current files.
It never creates foreign history or writes across models.
Historical readers resolve only the retained pins or an explicitly authored exact checkpoint.
Missing foreign models, subjects, states, or archive objects remain unavailable without a current substitute.
Legacy checkpoints without following-reference pins expose that missing coverage explicitly.

Bound foreign repositories add source associations through the existing checkout resolver.
Source availability stays separate from architecture availability.
The existing code opener accepts canonical model and module addresses, including an exact architecture checkpoint.
Historical code resolution requires the retained source commit and unchanged bound working files.
Missing source, uncommitted evidence, and another checked-out revision refuse opening while architecture remains readable.
The opener never switches a checkout or copies source code into architecture history.

## Behavioral browser readings

Each pane stores its diagram grammar and explicit flow identity in the existing address.
Architecture scope, focus, and filters remain present while a behavioral diagram is open.
Returning to architecture restores those values.
A grammar change does not derive execution order from structural relationships.

The flow selector offers authored exchanges that involve the current subjects or their contained modules.
A reader always chooses a flow explicitly, including when only one matches.
A selected flow remains explicit when its relevance changes or its definition becomes unavailable.
The reader never substitutes a different flow.
Sequence and flowchart use the complete selected flow, including participants outside the prior architecture scope.
Structural relationship filters never remove messages or control steps.

Selection keeps stable identities across diagram modes.
A hidden flow step remains a known subject with an explicit action to open its authored flow.
Several selected flows remain separate choices, because one behavioral diagram explains one flow.
Structural Focus applies to modules and relationships.
The existing renderer, camera, bounds, and keyboard controls remain the implementation owners.
