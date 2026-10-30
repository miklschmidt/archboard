# Canonical module delivery

Date: 2026-10-26.

This is the approved ticket breakdown for [TASK-549](../../backlog/tasks/task-549%20-%20Replace-board-documents-with-a-canonical-module-model-and-compact-proposal-history.md).
The owner approved it on 2026-10-26. Backlog now tracks the 24 slices as TASK-549.01 through TASK-549.24.

The parent specification remains unchanged. Its contracts govern every slice, including the testing seams that the owner approved.

## Delivery rules

Each ticket delivers an observable workflow through the shared runtime and the surfaces that expose that workflow. Tests belong to that delivery.

Existing vaults retain their legacy authority until explicit migration. Early deliveries use disposable, authored model vaults. No ticket introduces two live authorities or dual writes.

The existing runtime already exposes the shared read/write interface. No separate prefactoring ticket adds enough value. Each slice extends that owner as needed.

Local archive retention precedes recoverable file changes. Compact proposals then reuse both contracts. Reader interaction can progress alongside proposal work.

The first write slice supports one narrow edit with complete durability. Later operations extend its affected-subject calculation and use the same admission and recovery rules.

Each implementation ticket records its affected architecture descriptions and creates the required proposals before code changes. It updates affected ADRs and consumer instructions with delivery.

Runtime tests use real temporary files and Git repositories through the public architecture interface. Browser tests cover visible behavior through the existing browser seam.

No standalone test, documentation, or renderer rewrite phase substitutes for those responsibilities. Database and hosted deployment work remain outside this breakdown.

## Approved tickets

1. [TASK-549.01: Read one canonical module model](../../backlog/tasks/task-549.01%20-%20Read-one-canonical-module-model.md)

   Blocked by: None.

   Deliver a coherent read of an authored model vault through the public runtime, CLI, and server. Readers can inspect its root modules and relationships.

   Include the manifest, qualified identities, module definitions, source-owned relationships, policy, and strict file discovery. Preserve ordering, groups, evidence, bindings, and document references.

   Names resolve only when unique. Filename changes preserve identity. Duplicate definitions, invalid containment, unsupported formats, and missing local targets produce structured diagnostics.

   The returned revision covers discovered paths and exact bytes. The browser lists root modules and opens their authored details.

2. [TASK-549.02: Retain and reopen exact architecture checkpoints](../../backlog/tasks/task-549.02%20-%20Retain-and-reopen-exact-architecture-checkpoints.md)

   Blocked by: 1.

   An agent retains an architecture reading locally. CLI and browser readers reopen it after current files change. Historical reads never mix in current content.

   Preserve required inputs through Git ancestry or retention refs. Honor configured identity and signing without changing the user index, HEAD, or checkout.

   Concurrent archive appends preserve both checkpoints through marked synchronization commits. Archive order never selects current architecture or merges architectural meaning.

   Linked worktrees share archive objects and refs. Exact reads identify missing architecture or source evidence and provide a recovery action.

3. [TASK-549.03: Edit one module with durable recovery](../../backlog/tasks/task-549.03%20-%20Edit-one-module-with-durable-recovery.md)

   Blocked by: 2.

   An agent changes a module description through the shared operation interface. The CLI and server return the same durable outcome and recovery information.

   Include an explicit target, expected read token, operation ID, writer, doing line, and subject claim. Claim visibility and take-back work in the browser.

   Use the complete journal and installation contract for this narrow edit. Signing failure changes no current files. Interrupted installation resumes or reports preserved foreign content.

   Repeating a completed request returns its recorded result. Reusing its operation ID for another request fails. Readers never receive a mixed installation.

   Stable external edits refresh readers without inventing adoption. Invalid or changing files block writes and mark an old scene stale.

   Journals remain checkout-specific. Branch changes block unsafe recovery. Notifications follow durable completion, and reconnection obtains a fresh coherent read.

4. [TASK-549.04: Author module structure and transfer relationships](../../backlog/tasks/task-549.04%20-%20Author-module-structure-and-transfer-relationships.md)

   Blocked by: 3.

   An agent adds, removes, renames, or reparents modules and edits their relationships through normal commands. The browser reflects the resulting model.

   One operation can transfer a relationship source between files without changing its identity. Deletion repairs references under the existing confirmation rules.

   Extend claims and stale-read coverage to every affected subject and file. Conflicting claims refuse admission, while unrelated subjects remain available.

   Preserve reserved identities, former names, authored order, and containment rules. A one-field edit leaves unrelated files byte-identical.

5. [TASK-549.05: Author and render independent flow collections](../../backlog/tasks/task-549.05%20-%20Author-and-render-independent-flow-collections.md)

   Blocked by: 4.

   An agent creates and edits a flow spanning several modules, then renders it as a sequence or flowchart through an explicit flow selection.

   Preserve participant order, messages, decisions, loops, notes, repeat counts, and evidence. Collection filenames impose no participant ownership.

   Steps retain identity across moves between flows and nested holders. Alternative renames move affected placements together. Missing holders and incompatible ordering fail explicitly.

   Returns remain messages without creating reverse structural relationships. Flow reference repairs participate in the same operation and claim calculation as module edits.

6. [TASK-549.06: Create and compare compact proposals](../../backlog/tasks/task-549.06%20-%20Create-and-compare-compact-proposals.md)

   Blocked by: 5.

   An agent creates a proposal spanning modules and flows. CLI and browser readers materialize and compare it from a retained baseline and identity-based changes.

   Support siblings, named predecessors, and planning-only models without a current state. New draft subjects remain outside current architecture until adoption.

   Preserve stable state identities, names, summaries, and documents. Additions, removals, assignments, explicit clearing, and placements have distinct meanings.

   Comparison defaults follow TASK-549. Unsupported predecessor changes refuse safely until reconciliation is available. Small edits store no unrelated snapshots.

7. [TASK-549.07: Reconcile and settle dependent proposals](../../backlog/tasks/task-549.07%20-%20Reconcile-and-settle-dependent-proposals.md)

   Blocked by: 6.

   An agent changes a predecessor and sees safe inherited changes across following drafts. Conflicts remain visible in both CLI results and browser readings.

   Preserve the baseline that established each conflict. Reconcile parents before children, block unsettled descendants, and publish the complete family result together.

   Settlement handles competing fields, deletion against change, lost references, alternative renames, and structural ordering. Claims cover the affected descendants.

   Reuse the existing semantic reconciliation cases through the public operation seam. No second transport-specific reconciliation path exists.

8. [TASK-549.08: Adopt or shelve a proposal without growing current history files](../../backlog/tasks/task-549.08%20-%20Adopt-or-shelve-a-proposal-without-growing-current-history-files.md)

   Blocked by: 7.

   An agent explicitly adopts a settled proposal or shelves it with a reason. Readers can reopen and compare the retained result afterward.

   Refuse superseded adoption by default. Forced adoption requires comparison and installs the complete resolved proposal. Code commits, merges, and approval never adopt it.

   Preserve ancestry, prior state, documents, reasons, and lifecycle timestamps. Remove active proposal files only within the durable operation.

   Repeated requests create one lifecycle event. The same later edit produces the same current-file delta after zero or many completed proposals.

9. [TASK-549.09: Correct historical architecture with an audit trail](../../backlog/tasks/task-549.09%20-%20Correct-historical-architecture-with-an-audit-trail.md)

   Blocked by: 8.

   An agent explicitly corrects a historical or shelved state with a reason and source references. Readers see the correction through its lasting state identity.

   The original checkpoint remains exact and readable. Ordinary edits to historical states still fail. Comparisons expose the correction and its audit trail.

   Following local drafts reconcile against the correction. Adopted successors and unrelated current states remain unchanged.

10. [TASK-549.10: Navigate recursive module readings and inspect connections](../../backlog/tasks/task-549.10%20-%20Navigate-recursive-module-readings-and-inspect-connections.md)

    Blocked by: 1.

    A reader opens root modules, drills into immediate children, and returns through breadcrumbs or browser Back and Forward.

    Show direct callers and outgoing targets as nearby context. Derive interfaces before filters, and retain whole-module endpoints without inventing internal targets.

    Project and aggregate connections by visible endpoints and kind. Inspection reveals every underlying relationship and distinct label in deterministic order.

    Reuse client rendering. Reject obsolete layout results by reading and revision. Camera changes remain immediate, and missing subjects produce explicit partial readings.

11. [TASK-549.11: Select, focus, and filter a reading](../../backlog/tasks/task-549.11%20-%20Select-focus-and-filter-a-reading.md)

    Blocked by: 10.

    A reader selects by dragging, toggles subjects with Ctrl/Cmd-click, and focuses the result. Keyboard users receive equivalent actions.

    Space-drag and middle-button drag pan. Escape clears selection. Selection and highlighting never wait for layout or flood browser history.

    Focus preserves mixed ancestor and descendant selections. It expands only the required paths and retains necessary endpoint context.

    Visible controls filter relationship kinds and groups. Hidden selections retain an inspector count and reveal action. These actions change no architecture files.

12. [TASK-549.12: Switch between architecture, sequence, and flowchart readings](../../backlog/tasks/task-549.12%20-%20Switch-between-architecture-sequence-and-flowchart-readings.md)

    Blocked by: 5, 11.

    A reader changes diagram grammar and chooses an applicable flow. Multiple matches require a choice, and missing flows remain explicit.

    Behavioral readings include all required participants and steps, including those outside the prior scope. Structural filters do not remove flow messages.

    Returning to architecture restores the prior reading. No selection of structural relationships invents execution order.

13. [TASK-549.13: Explain the captured reading through local agent actions](../../backlog/tasks/task-549.13%20-%20Explain-the-captured-reading-through-local-agent-actions.md)

    Blocked by: 6, 12.

    Toolbar, context-menu, keyboard, and voice actions explain selections, relationships, flows, and proposals through the same local workhorse contract.

    Each request captures its model, revision, identities, reading, and action at invocation. Later navigation never retargets it.

    The interface and voice use one textual answer. Unavailable agents, progress, failure, and retry remain visible. Missing-flow requests can trigger investigation.

    Answers remain temporary until an explicit agent edit records them through normal claims and stale-write protection.

14. [TASK-549.14: Present and record dynamic walkthroughs](../../backlog/tasks/task-549.14%20-%20Present-and-record-dynamic-walkthroughs.md)

    Blocked by: 6, 12.

    An agent authors narrative beats that change scope, selection, filters, grammar, and flow. A reader plays them without saved geometry or architecture copies.

    Playback resolves current, a named proposal, or an exact checkpoint once. The entire presentation retains that revision.

    Changes offer restart against a newer state. Missing subjects or history stop the affected beat with a recovery explanation.

    Recording and shared playback use an exact retained revision. Existing local recording and rendering remain the execution owners.

15. [TASK-549.15: Follow code bindings and cross-model references](../../backlog/tasks/task-549.15%20-%20Follow-code-bindings-and-cross-model-references.md)

    Blocked by: 4, 10.

    Readers open code and follow explicit references into another model without changing architectural ownership. Existing checkout selection still resolves code bindings.

    A cross-model reference names its model, subject, and state. Historical readings pin foreign revisions and never substitute current content.

    CLI and browser readers expose unavailable models or source evidence. No operation silently transfers ownership or writes across two models.

16. [TASK-549.16: Publish archive history and recover missing revisions](../../backlog/tasks/task-549.16%20-%20Publish-archive-history-and-recover-missing-revisions.md)

    Blocked by: 2.

    An owner explicitly publishes history to a configured remote and archive ref. A collaborator fetches a missing reading, including from a shallow clone.

    Distinguish saved-locally, publication-pending, published, and unavailable states. Normal code pushes never count as history publication.

    Stale publication fetches and joins archive ancestry without force-pushing or merging model content. Fetches include the complete referenced history.

    Publication setup establishes remote retention policy or reports its limitation. Network failure never reverses a completed local write.

17. [TASK-549.17: Keep local history for an untracked vault](../../backlog/tasks/task-549.17%20-%20Keep-local-history-for-an-untracked-vault.md)

    Blocked by: 3.

    An owner explicitly initializes a private bare archive for a vault outside a source repository. Existing model operations then retain and reopen its history.

    Initialization never creates or changes a source repository. The vault remains local-only until an explicit publication destination exists.

    The same signing, recovery, and diagnostic contracts apply. Published architecture contains no private machine paths.

18. [TASK-549.18: Export and import a complete portable model](../../backlog/tasks/task-549.18%20-%20Export-and-import-a-complete-portable-model.md)

    Blocked by: 8, 14, 17.

    An owner exports current inputs and required history, then imports them into a fresh location. Modules, proposals, decisions, and walkthroughs remain usable.

    Include every referenced baseline and checkpoint, including private archives. Preserve identities and refuse incomplete bundles before exposing an imported model.

    Import uses the existing installation contract. A restored bundle can supply lost local history without claiming that archive deletion is impossible.

19. [TASK-549.19: Inventory legacy boards and record identity choices](../../backlog/tasks/task-549.19%20-%20Inventory-legacy-boards-and-record-identity-choices.md)

    Blocked by: None.

    An owner requests a read-only inventory of legacy boards, states, reconciliation bases, views, walkthroughs, aliases, and document references.

    The inventory records a source fingerprint and an explicit mapping plan. Matching names, bindings, or drill-down links provide evidence, never automatic identity merges.

    Report conflicts in definitions, parents, order, relationship ownership, and policy. Record deliberate canonical choices while preserving original identity namespaces and aliases.

    This workflow changes no active architecture and needs no completed target writer.

20. [TASK-549.20: Preview the composed current model](../../backlog/tasks/task-549.20%20-%20Preview-the-composed-current-model.md)

    Blocked by: 5, 15, 19.

    An owner previews canonical modules, relationships, and flows from the mapping plan. CLI and browser readers expose the candidate without replacing legacy files.

    Preserve current semantic fields, groups, order, evidence, bindings, documents, and references. Remove level classification without inventing numeric depth.

    Ambiguous mappings and incoherent candidates block progress. Planned-only boards remain outside current architecture and retain explicit proposal mappings for the next slice.

    The preview retains its source fingerprint. Legacy files remain the sole live authority.

21. [TASK-549.21: Preserve legacy proposals and historical coverage](../../backlog/tasks/task-549.21%20-%20Preserve-legacy-proposals-and-historical-coverage.md)

    Blocked by: 9, 20.

    Extend the migration preview with drafts, baselines, standing conflicts, adoption, shelving, corrections, and lifecycle metadata.

    Readers can inspect retained original documents with their original coverage. No legacy reading borrows current surrounding modules or invents a complete historical repository model.

    Convert each draft through an explicit predecessor and baseline mapping. Matching task IDs or proposal names never combine independent proposals automatically.

    Planning-only boards become proposals. An immutable checkpoint retains complete originals, including unresolved data, before any later cutover.

22. [TASK-549.22: Preserve legacy walkthroughs, bookmarks, and addresses](../../backlog/tasks/task-549.22%20-%20Preserve-legacy-walkthroughs-bookmarks-and-addresses.md)

    Blocked by: 14, 21.

    Complete the migration preview with dynamic walkthrough readings, imported bookmarks, former names, and explicit legacy address mappings.

    Expand referenced views into walkthrough beats. Preserve other named views as bookmarks that own no model content.

    Resolve migrated subject and state targets without fallback to similar names or current content. Unpinned external historical references remain explicitly unresolved.

    A reader can play the converted walkthrough and follow a legacy address within the preview. The original vault still remains authoritative.

23. [TASK-549.23: Install and recover an explicit vault migration](../../backlog/tasks/task-549.23%20-%20Install-and-recover-an-explicit-vault-migration.md)

    Blocked by: 17, 22.

    An owner applies a complete migration preview. The operation retains original inputs before replacing the live format and switching every surface to the canonical model.

    Changed source or target inputs require a new preview or explicit recovery. Interrupted cutover resumes through the existing journal without losing either representation.

    A repeated completed migration is a no-op. Only one format remains authoritative. CLI, server, browser, and local agents use the new runtime afterward.

    The same workflow supports Git-backed and untracked vaults. Cache and subscription changes follow durable completion. Ownership transfer controls explain that transfer is unavailable.

24. [TASK-549.24: Make canonical models the default and retire live board paths](../../backlog/tasks/task-549.24%20-%20Make-canonical-models-the-default-and-retire-live-board-paths.md)

    Blocked by: 13, 16, 18, 23.

    New vaults use canonical models. Migrate the repository's architecture vault through the delivered workflow and retire the old live authoring paths.

    Keep legacy decoding only for migration and retained historical readings. Remaining unmigrated vaults receive an explicit migration route, never an automatic rewrite.

    Close the consumer transition across commands, agent context, code inspection, rendering, walkthroughs, and examples. Earlier slices own their functional changes and documentation.

    Remove obsolete board ownership and level instructions. Complete the glossary, ADR, skill, and architecture updates without introducing a second storage abstraction.

    Demonstrate the local workflow from discovery through proposal, adoption, history, and walkthrough. Reuse the focused evidence already owned by each slice.

## Dependency rationale

Tickets 1 and 19 can start immediately. Ticket 19 inventories legacy meaning without depending on a target implementation.

After ticket 1, navigation can progress independently from archive and proposal work. Publication needs local archive behavior, not completed migration or proposal authoring.

Ticket 3 keeps its transaction contract cohesive but limits the first edit to one description. Tickets 4 and 5 expand real operations afterward.

Migration previews develop in three steps: current composition, proposal and history preservation, then walkthroughs and addresses. Installation waits for all three.

Ticket 24 removes the temporary coexistence between separate legacy and canonical vaults. It does not defer essential behavior from earlier slices.

Listed blockers are direct dependencies. Transitive dependencies are omitted. Every ticket reaches ticket 24 through the dependency graph.

## Specification coverage

The following numbers refer to the implementation decisions in TASK-549. Each row names the primary tickets that deliver them.

| Parent decisions | Delivery tickets     | Contract                                                                    |
| ---------------- | -------------------- | --------------------------------------------------------------------------- |
| 1–4, 6–7         | 1, 4                 | Canonical model, identity, discovery, relationships, addressing             |
| 5, 11            | 5, 6, 7              | Independent flows and stable ordered changes                                |
| 8                | 15                   | Code bindings and cross-model readings                                      |
| 9–10             | 6, 8                 | State identity, compact proposals, explicit current designation             |
| 12–14            | 7, 8, 9              | Reconciliation, lifecycle, historical correction                            |
| 15–17            | 2                    | Retained checkpoints, archive ancestry, signing                             |
| 18–22            | 3, 4, 5, 7           | Claims, stale reads, durable installation, recovery, external edits         |
| 23–25            | 2, 3, 16, 17, 18     | Publication, exact reads, worktrees, portability, untracked vaults          |
| 26–31            | 10, 11, 12           | Recursive readings, projection, interaction, rendering                      |
| 32               | 13                   | Shared local explanation actions                                            |
| 33               | 14                   | Dynamic walkthroughs and pinned playback                                    |
| 34–37            | 19, 20, 21, 22, 23   | Explicit migration with preserved meaning and recovery                      |
| 38–40            | All, completed by 24 | Shared ownership, transport, consumer contracts, architecture documentation |

The runtime and browser seams remain the test owners throughout. Ticket 8 measures small-diff behavior independently from archive growth.

## Related tracked work

These existing tasks cover regressions that the new model must preserve or resolve. Their status alone does not block this feature.

| Existing task | Delivery ticket | Shared behavior                                                             |
| ------------- | --------------- | --------------------------------------------------------------------------- |
| TASK-318      | 13              | Voice questions carry the selection that the user meant                     |
| TASK-354      | 2, 10           | Historical rendering uses the selected state without current-state leakage  |
| TASK-479      | 7               | Automatically assigned order does not create avoidable descendant conflicts |

Reuse their regression evidence when implementing these slices. Do not publish duplicate bug tickets or change those tasks during this decomposition.

## Implementation authorization

The owner approved autonomous implementation through implement-spec with gpt-6.1-sol agents in separate worktrees.
The integration branch is `feat/canonical-module-model`.

The owner requested one PR against main when complete. Open it as a draft after the first implementation merge.
Avoid heavy PR stack splitting. Mark the PR ready after the full specification and final review are complete.

Each published ticket starts unassigned with To Do status and the `ready-for-agent` label. Native Backlog dependencies define the available work.

TASK-549.01 and TASK-549.19 are the initial unblocked tickets. Publication preserved the parent specification and its status.
