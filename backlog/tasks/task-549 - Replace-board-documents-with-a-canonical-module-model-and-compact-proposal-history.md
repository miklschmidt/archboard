---
id: TASK-549
title: >-
  Replace board documents with a canonical module model and compact proposal
  history
status: In Progress
assignee:
  - '@codex-orchestrator'
created_date: '2026-10-26T04:11:00Z'
updated_date: '2026-10-26T16:49:00Z'
labels:
  - ready-for-agent
dependencies: []
documentation:
  - docs/design/architecture-discovery-and-interaction.md
  - docs/design/proposal-history-churn.md
  - docs/design/git-architecture-history-experiment.md
priority: high
type: feature
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem Statement

Readers cannot explore one system consistently when overlapping boards own separate descriptions of the same parts. Opening another board can change identities, scope, and architectural state. Agents must maintain duplicated definitions and authored views before readers can navigate the system.

The board document also retains complete variant snapshots. A small architectural change can add thousands of unchanged lines to a pull request. The measured workbench branch changes 84,181 architecture-file lines. A current-content projection changes 6,068 lines, but loses history and proposals. The replacement must reduce duplication while preserving those capabilities.

The user wants repository JSON to remain the immediate storage format. Database selection and hosted deployment are deferred. The full application, agents, repository access, and rendering stay local or on the client.

## Solution

Represent one repository model through canonical module definitions, source-owned relationships, independent flows, and walkthroughs. Readers open modules recursively, focus selections, and change diagram grammar without creating another architectural document.

Store the current architecture once. Store active proposals as changes against retained baselines. Preserve completed states and decisions in an independent Git archive. The normal code review shows changed architecture and active proposals without embedding every past architecture in the current files.

Provide one read/write interface for the CLI, server, and local agents. That interface owns identity, validation, reconciliation, durable installation, history, and recovery. The browser owns presentation and sends explanation requests to the same local agent actions used by voice.

The implementation must work end to end locally before any hosted rollout. This spec selects the contracts below. It does not implement them or change the meaning of the shipped format today.

## User Stories

1. As a reader, I want repository root modules, so that I can understand the system without choosing a board.
2. As a reader, I want to open any module, so that I can inspect its immediate implementation parts.
3. As a reader, I want repeated drilldown, so that I can explore decomposition without fixed levels.
4. As a reader, I want breadcrumbs and Back navigation, so that I can return to my previous scope.
5. As a reader, I want one module identity across readings, so that its explanation stays consistent.
6. As an agent, I want one canonical module definition, so that an edit reaches every relevant reading.
7. As an agent, I want source-owned outgoing relationships, so that each connection has one clear editing location.
8. As a reader, I want derived incoming relationships, so that callers remain discoverable without duplicate records.
9. As a reader, I want aggregated connections to collapsed modules, so that hidden detail does not overwhelm the overview.
10. As a reader, I want to inspect an aggregated connection, so that I can identify every underlying relationship.
11. As a reader, I want whole-module dependencies to remain imprecise, so that drilldown does not invent an internal endpoint.
12. As a reader, I want nearby callers and dependencies as context, so that a module remains understandable in isolation.
13. As a reader, I want drag selection, so that I can focus several visible elements together.
14. As a reader, I want Ctrl/Cmd-click selection, so that I can add or remove individual elements.
15. As a keyboard user, I want equivalent selection and focus actions, so that exploration does not require dragging.
16. As a reader, I want to focus a selection, so that I can ask a narrower architectural question.
17. As a reader, I want visible filters for groups and relationship kinds, so that hidden information remains apparent.
18. As a reader, I want architecture, sequence, and flowchart readings, so that I can inspect structure and behavior.
19. As a reader, I want missing flows identified, so that the application never invents execution order.
20. As an agent, I want independent flow collections, so that one flow can span several modules.
21. As an agent, I want stable step identities, so that nested decisions and loops survive edits and comparison.
22. As a reader, I want immediate selection feedback, so that interaction does not wait for layout.
23. As a reader, I want obsolete render results discarded, so that rapid navigation shows my latest request.
24. As a reader, I want explanation actions for my selection, so that I can understand the subjects on screen.
25. As a voice user, I want the same explanation actions, so that spoken and written explanations describe the same result.
26. As a reader, I want answers tied to their original reading, so that later navigation does not retarget an existing request.
27. As an agent, I want a proposal spanning modules and flows, so that one intended change remains one proposal.
28. As an agent, I want compact proposal changes, so that unrelated architecture does not appear in a pull request.
29. As an agent, I want sibling and dependent proposals, so that I can compare alternatives and staged designs.
30. As an agent, I want safe inherited changes, so that a proposal follows its predecessor without losing its own work.
31. As a reader, I want visible conflicts and blocked descendants, so that an unresolved decision cannot appear settled.
32. As an agent, I want atomic relationship transfers, so that changing a source preserves the relationship identity.
33. As an agent, I want stale-write refusal, so that another writer's changes cannot disappear silently.
34. As a reader, I want visible claims and take-back, so that I can understand and stop ongoing agent ownership.
35. As an agent, I want durable recovery after interruption, so that one command cannot leave a mixed architecture visible.
36. As an agent, I want safe retries after lost responses, so that adoption and edits happen only once.
37. As a repository owner, I want explicit adoption, so that approval or a Git merge does not declare an architecture implemented.
38. As a repository owner, I want superseded proposals identified, so that adoption cannot silently discard newer architecture.
39. As a reader, I want shelved proposals preserved, so that rejected alternatives remain understandable.
40. As a reader, I want historical comparisons, so that I can inspect what changed without switching my checkout.
41. As an agent, I want audited historical corrections, so that factual mistakes can be repaired without deleting the original record.
42. As a repository owner, I want local and published history distinguished, so that collaborators never depend on an unpublished revision unknowingly.
43. As a collaborator, I want missing history fetched explicitly, so that a shallow clone can recover the requested reading.
44. As a collaborator, I want concurrent archive appends preserved, so that publishing history cannot overwrite another writer's checkpoints.
45. As a repository owner, I want configured commit signing respected, so that archive writes meet the same identity requirements as other commits.
46. As a worktree user, I want separate current models, so that an archive update cannot switch another checkout's architecture.
47. As an untracked-vault user, I want local history and export, so that repository-independent work remains supported.
48. As a presenter, I want walkthrough beats to select readings, so that a presentation can move through scopes and diagram grammars.
49. As a presenter, I want one pinned state per playback, so that the explanation cannot change halfway through a presentation.
50. As a repository owner, I want migration conflicts explained, so that duplicated subjects are resolved deliberately.
51. As a repository owner, I want existing IDs preserved, so that migration does not turn identity into deletion and recreation.
52. As a reader, I want legacy history to state its coverage, so that incomplete old boards do not imply a complete historical system.
53. As a repository owner, I want resumable migration, so that interruption cannot destroy the old or new representation.
54. As an agent, I want code and document references preserved, so that architectural meaning remains connected to its evidence.
55. As a maintainer, I want behavior-focused tests, so that the new model remains reliable without expanding redundant test coverage.
56. As a maintainer, I want small current-file diffs, so that architecture review effort follows the actual change.

## Implementation Decisions

1. One model per vault. Preserve explicit vault addressing and checkout selection. A small manifest holds schema version, stable model identity, and current-state metadata. It contains no copied module inventory or historical snapshot arrays. Current authored files remain the authority. Any assembled graph, reverse index, history catalogue, or scene cache is derived and replaceable.

2. Canonical identities. A subject identity consists of a stable origin namespace and the existing short local ID. Imported namespaces include the original model and board-family identity. They carry identity provenance only. They own no diagram, containment, editing claim, or variant tree. Fresh subjects use the model's default namespace through the existing ID authority. Reserve retired IDs. Names, filenames, code paths, and ownership transfers never mint replacement subject identities.

3. Module files. A `.module.json` file contains one module definition and its outgoing relationships. Preserve kind, responsibility, description, authored order, groups, and code binding. A module has at most one parent in its own model. Validate containment as a forest. Dependencies can cycle. All module definitions belong to the selected architectural state, independently of the current reading.

4. Relationship ownership. The containing module supplies each outgoing relationship's source. Preserve relationship identity, target, kind, label, description, order, emphasis, traffic, and evidence anchor. Derive incoming relationships. Changing the source is one identity-preserving transfer between files. Deletion and reference repair occur within one checked operation, using the existing removal rules and explicit confirmation contracts.

5. Flows and collections. A `.flows.json` file groups one or more independently identified flows. Its filename does not restrict participants or require a matching module. Preserve participant order, summaries, messages, decisions, loops, notes, repeat counts, and evidence. A message and a structural relationship remain different facts. Return messages never automatically create reverse dependencies.

6. Schema and file discovery. Reuse the existing Zod-based contract authority and derive types from schemas. Each persisted document declares its supported format version. Discover recognized files within the addressed vault, with normalized relative paths. Duplicate definitions, unknown required formats, dangling local references, and malformed content refuse a new coherent read. Renaming a file changes location only. Canonical serialization changes only affected files and preserves authored ordering. Do not persist routine read timestamps or increment every file's counter after one edit.

7. Names and addressing. CLI writes address qualified stable IDs. Human-readable names remain accepted only when they resolve uniquely in the explicit model and state. Ambiguity reports the matching identities. Retain former names for imported addresses and named states. Legacy board addresses resolve through an explicit migration map. No lookup silently substitutes current, another proposal, or a similarly named module.

8. Cross-repository meaning. Keep code-binding repository identity separate from architecture ownership. Bindings can describe other repositories through the existing checkout resolver. Cross-model architectural references identify the target model, subject, and state selector explicitly. They provide read navigation, not a multi-model write transaction. Historical cross-model readings pin every referenced model revision. Missing models or source revisions remain unavailable rather than resolving against unrelated current content.

9. State and proposal identity. Preserve the distinction between current, draft, historical, and shelved states. State IDs and lasting names remain stable. Current is a designation in the addressed checkout, never the archive branch tip. A planning-only model can have no current state. New subjects in a draft remain proposal additions until adoption. Git branch names, commits, code merges, and approval never imply adoption. Non-current readings compare against current by default. Without current, they compare against their retained predecessor. Explicit comparison can name any two coherent state references.

10. Compact proposals. A `.proposal.json` document holds identity, name, former names, summary, document references, predecessor identity, immutable baseline reference, and normalized changes. Changes address subjects and fields by stable identity. Support addition, removal, field assignment, explicit field clearing, and structural placement. Omission means no operation. Null never means implicit deletion. Do not use text-line or array-index patches. Bindings and other composite fields remain atomic unless the existing semantic rules already provide finer behavior.

11. Ordered structures. Steps retain their IDs when they move between flows, loops, or decision alternatives. Placement identifies the holder and relative ordering through stable subjects. Existing decision alternatives are identified by their decision and exact label. Edits to the alternative list are atomic. A label rename includes affected child placements in the same operation. Missing holders, conflicting moves, and incompatible order produce explicit conflicts. Never promote an orphaned step to the root automatically.

12. Reconciliation. Materialize the retained baseline, the proposal, and its updated predecessor through the same model reader. Reuse the existing three-way semantic rules. Independent changes merge and equal changes agree. Competing fields, deletion against modification, lost references, empty holders, and order conflicts remain explicit. Preserve the baseline that established a standing conflict until settlement. Keep a coherent proposal result with its side of disputed subjects. Reconcile parent before child, and block descendants of unsettled ancestors. Publish parent edits, safe descendant changes, and durable standing together.

13. Adoption and shelving. Adoption requires a coherent, settled proposal. A proposal based on a superseded current state is refused by default. Explicit forced adoption requires a comparison against current and installs the proposal's complete resolved state. It does not blindly apply the patch to a different baseline. Adoption preserves ancestry, changes the current designation, and records the prior state, reason, and timestamp. Shelving preserves the final patch, baseline, ancestry, documents, and reason. Remove an active proposal file only through the durable lifecycle transaction.

14. Historical corrections. Ordinary edits to historical and shelved states remain refused. An explicit correction retains the logical state ID and name, creates a new immutable checkpoint, and records reason and source revisions. The original checkpoint remains readable. A logical historical-state lookup exposes the latest correction and its audit trail. An exact checkpoint lookup remains exact. Propagate a correction to local following drafts through reconciliation without changing adopted successors or unrelated current states.

15. Archive representation. Select an independent, append-only `archboard-history` branch for Git-backed vault history. Checkpoints contain only architecture inputs, required proposal artifacts, lifecycle metadata, schema information, and source associations. They never include repository checkouts, credentials, or unrelated working files. Create Git objects without changing the user's index, HEAD, or checkout. Every baseline and dependent revision must remain reachable through actual Git parents or retention refs. JSON hashes alone do not establish retention.

16. Archive order is not architecture ancestry. Keep checkpoint append order, proposal predecessor links, and adoption records separate. A checkpoint identifies one coherent state or proposal revision. Archive synchronization commits retain divergent tips as parents and identify themselves as synchronization records. They are not states, adoptions, or semantic merges. Never merge two worktrees' current architecture merely because their archive histories diverge. Preserve every accepted checkpoint identity.

17. Signing and source evidence. Honor configured Git identity, signing format, and signing requirements for checkpoint and synchronization commits. A signing failure refuses installation before any current file changes. Never disable signing to continue. Record source repository revisions and whether evidence came from uncommitted code. Retaining architecture does not retain source-code commits automatically. Missing source evidence is reported honestly, including after source history rewrites.

18. Write contract and claims. Evolve the existing public read/write interface into the model operation interface. Every mutation names its vault, target state, operation ID, writer, doing line, and expected read token. Tokens cover relevant discovered paths and exact bytes, including validation policy and affected descendants. A repeated operation ID with the same request returns its recorded outcome. Reusing it for another request is refused. Claims cover explicit subject or proposal scopes. The affected closure cannot interfere with another claim. Take-back invalidates the next attempted write. Long agent work never holds the installation lock.

19. One recoverable installation. Use one short cross-process transaction lock per vault and a private durable write-ahead log. The log records operation and checkout identity, before and after bytes, affected paths, fingerprints, checkpoint identity, and progress. All Archboard readers and writers pass this recovery boundary. Validate the complete candidate before installation. Prepare the checkpoint under the configured signing policy. Durably record the log and retain the checkpoint through a temporary transaction ref. Installation starts only after both records exist. The ref is recovery machinery, not a proposal branch.

20. Commit ordering. Recheck source fingerprints, install each affected file through durable atomic replacement or durable removal, and verify the final fingerprints. Durably mark installation complete. Append the retained checkpoint to the archive through a conditional ref update. Join concurrent archive tips without rewriting checkpoints. Durably record completion, then remove recovery state and notify readers. The response states whether the write applied and whether reconciliation remains. No remote network operation occurs while the local installation lock is held.

21. Interrupted writes. If every path matches its before image, recovery can resume or explicitly cancel before application. If paths match a mixture of before and after images, recovery finishes the logged installation. If all paths match after images, recovery completes the archive append and cleanup. If the checkpoint already appears in archive ancestry, recovery does not create another lifecycle event. An unexpected file value or changed checkout context blocks replay and preserves the journal plus foreign content. Return recovery-required after installation starts but before durable completion. Once completion is durable, cleanup failure remains applied with pending cleanup. Retries then finish cleanup without repeating the operation.

22. External writers. Git checkout and external editors do not honor Archboard's lock. Require external architecture writes to remain quiescent during installation. Fingerprints detect interference but do not provide an atomic filesystem compare-and-replace guarantee. Never promise atomic visibility to arbitrary filesystem readers. Stable valid external file sets invalidate caches and become observed current content without inventing adoption. Incoherent or changing sets block mutations and expose diagnostics. A previously rendered scene can remain visible only with an explicit stale indication.

23. History publication. Local durability succeeds independently of network availability. Report saved-locally, publication-pending, published, and unavailable states separately. Publication explicitly names the remote and archive ref, and includes every referenced baseline. A normal code push does not count as archive publication. A stale push fetches and joins archive ancestry, then retries without force-pushing. Enforce no rewrite or deletion through remote policy during publication setup. If that policy cannot be established, report the limitation and do not claim protected retention.

24. History reads and portability. Read complete pinned checkpoints directly from Git objects, without checking out or mixing current files. Explicitly fetch the named archive branch when required history is missing. Fetch enough ancestry to resolve all dependencies, even from a shallow clone. Offline missing history returns unavailable with a recovery action. A portable export contains current inputs, referenced checkpoints and baselines, and lifecycle metadata in a verified bundle. Import preserves identities and refuses missing dependency closure. Archive deletion remains a backup-and-restore concern, not an impossible event.

25. Worktrees and untracked vaults. Runtime addresses and recovery state remain checkout-specific. Linked worktrees share archive objects and refs through Git's common repository directory. Record checkout context privately to refuse replay after a branch switch. Do not publish machine paths. Preserve untracked vaults through the same archive engine in an explicitly initialized private bare repository. Do not initialize or alter a source-code repository silently. Such vaults remain local-only until an explicit publication destination is configured, and their export includes the private archive.

26. Derived repository readings. The initial architecture reading shows modules without a parent. Opening a module shows immediate children with internals closed. Include direct callers and outgoing targets as context, projected to the nearest relevant outside module. Do not traverse their whole dependency graph automatically. A relationship to the scoped module itself remains attached to that scope's interface representation. It never acquires an invented child endpoint. Derive interface facts from the complete architectural state, before reading filters.

27. Connection projection. Project each relationship endpoint onto the visible module that contains it. Suppress internal connections whose endpoints project to the same closed module. Aggregate by directed visible endpoints and relationship kind. Retain every underlying identity and distinct label in deterministic authored order. Inspecting or selecting an aggregate resolves its underlying relationships. Derived lines have no independently authored identity or metadata that can drift from those relationships.

28. Selection and focus. Primary-button dragging from empty canvas selects visible subjects intersecting the rectangle. Space-drag and middle-button drag pan the canvas. Ctrl/Cmd-click toggles individual subjects. Provide keyboard selection and a visible Focus action. Normal selection replaces the prior set, while the modifier adds or removes. Selection updates without layout. Focusing preserves all selected identities, including an ancestor and descendant, and expands only paths needed to show them. Required endpoints remain available as context. Escape clears selection. Focus never changes containment or creates a module.

29. Reading state and navigation. A reading contains model, architectural state selector, scope or selection, visible relationship kinds, group visibility, grammar, and optional flow. The camera remains separate presentation state. Deliberate scope navigation creates browser history. Back and Forward restore the reading. Routine selection changes do not flood browser history. Filters remain visible. Hidden selections remain in the inspector with an explicit hidden count and a reveal action. Missing subjects produce partial or empty readings without silently selecting replacements. No named views are required.

30. Grammar switching. Architecture draws structure. Sequence and flowchart draw one explicitly selected flow. Switching to a behavioral grammar offers relevant flows by participants and requires a choice when several match. A missing flow offers an agent investigation action. Show all participants and steps needed by the selected flow, even when some lie outside the prior architecture scope. Architecture relationship filters do not silently remove flow messages. Preserve the prior architecture reading when returning to it.

31. Client rendering. Keep layout, sizing, routing, scene generation, and interaction on the local machine or client. Reuse the renderer's existing semantic scene interface. Compute a new scene only when the projected content changes. Selection, highlighting, and camera motion remain immediate frontend work. Associate layout requests with their reading and revision, and discard obsolete results. Preserve the reader's position when valid. This work does not require a new renderer runtime or hosted renderer.

32. Explanation actions. Expose Explain selection, Explain relationship, Trace flow, and Explain proposal through a visible toolbar action and context menu. Give keyboard users the same actions. Resolve model, revision, subject IDs, reading, and action ID when the request starts. Typed requests and the voice coordinator invoke that same local action contract. The workhorse returns one textual result used by the interface and voice. Later navigation cannot retarget it. Answers remain temporary until an explicit agent edit records them in a module description or walkthrough. That edit uses normal claims and stale-write checks. Agent unavailability, progress, failure, and retry remain visible without changing architectural content.

33. Dynamic walkthroughs. A `.walkthrough.json` file stores narrative beats and reading instructions with stable subject references. Each beat can change scope, selection, filters, grammar, and flow. No beat stores layout coordinates or architecture snapshots. A walkthrough can target current, a named proposal, or an exact checkpoint. Playback resolves that selector once and pins the resulting revision for the whole presentation. Changes during playback offer restart against the newer state. Recorded or shared playback uses an exact retained revision. Missing subjects or history stop the affected beat with an explicit explanation.

34. Migration inventory and identity decisions. Inventory every original board, variant, adoption, shelving, reconciliation base, view, walkthrough, alias, and document reference. Generate a source fingerprint and an explicit mapping plan. Equal names, bindings, or drill-down links are evidence for a shared subject, never proof. Conflicting definitions, parents, sibling order, relationship ownership, or policy vocabulary block cutover until the plan records a choice. Preserve original IDs through namespaces and aliases. Combining duplicate subjects requires an explicit canonical identity and retained legacy references.

35. Migration history coverage. Independent old boards do not establish a historical repository-wide state. Start coherent model history at the explicitly composed migration baseline. Retain complete original documents in an immutable migration checkpoint, including active conflicts. Legacy historical reads retain their original coverage and clearly identify it. They never borrow present-day surrounding modules. Unpinned external history remains explicitly unresolved. Draft conversion records each original predecessor and exact baseline. Matching names or task IDs do not automatically combine independent proposals. Planned-only boards become proposals, not implemented current modules.

36. Migration of remaining meaning. Convert drill-downs into explicit subject and state references. Preserve kinds, groups, ordering, evidence, former names, summaries, documents, correction records, and lifecycle reasons. Expand referenced named views into walkthrough readings. Preserve other named views as imported bookmarks until explicitly removed. They own no model content. Retire the level classification without replacing it with numeric depth. A bookmark is a named reading only, and basic navigation never depends on one.

37. Migration installation and compatibility. Preview the mapping and complete candidate before writing. Apply cutover through the same transaction and recovery mechanism under the original source fingerprint. Archive original inputs before removing their active copies. A repeated completed migration is a no-op. Changed source or target files require a new preview or explicit recovery. Never treat mixed old and new formats as two live authorities. Keep legacy decoding and addressing only for migration and archived readings. The new live writer must not maintain both formats.

38. Transport and refresh. Every request and subscription continues to name its vault. Within that vault, caches and notifications identify model, state, revision, and affected subjects. Announce changes only after durable completion. Reconnection obtains a fresh coherent read. CLI and browser adapters report structured error codes, affected identities, and recovery actions. Retired board addressing is confined to explicit migration aliases.

39. Ownership and existing modules. Keep model validation, file installation, proposal reconciliation, and archive operations behind the existing architecture runtime owner. Extend the existing shared semantic contracts and public read/write interfaces. Reuse the current Git process, code-binding, comparison, flow, and renderer owners. Server and CLI modules translate requests and outcomes, without independently interpreting patches or reconstructing history. Browser state owns readings and interaction. Keep storage adapters private until a second storage implementation is actually required.

40. Delivery and existing decisions. This is one feature specification spanning several delivery units, not one giant implementation PR. Before implementation, create the required task-named architecture proposals for affected current boards. Replace the board ownership, fixed-level navigation, and complete-variant-document decisions explicitly. Preserve agents-author/users-read, measured rendering, explicit vault addressing, stable identities, and client interaction ownership. Update the consumer skill, CLI contract, domain glossary, and affected ADRs with the delivered behavior.

## Testing Decisions

1. The user confirmed the primary seam: the public architecture read/write interface shared by the CLI and server. Use real temporary files and disposable Git repositories. Observe returned states, persisted outcomes, notifications, and recovery. Do not assert private helper order or snapshot human-readable wording.
2. Reuse the existing one-write, aggregate-write, propagation, settlement, and historical-correction fixtures. Cover one intent spanning several modules, a relationship source transfer, a move within containment, and deletion with reference repair.
3. Preserve three-way reconciliation cases for independent fields, equal edits, competing values, deletion against change, nested flow moves, alternative renames, and blocked descendants. Use the public operation seam as the regression owner. Keep isolated pure tests only for otherwise hidden ordering rules.
4. Add deterministic interruption points around durable journal creation, retention-ref installation, each file operation, archive append, and completion. Restart through the public reader and verify one coherent result or an explicit recovery block. Retry the same operation ID and verify no duplicate adoption.
5. Cover foreign edits with real files. Include stale fingerprints, added and removed files, invalid intermediate content, and values that match neither recovery image. Use a focused process test only for cross-process exclusion. Do not duplicate every persistence case through HTTP and browser layers.
6. Extend the disposable Git fixture for retained baselines, shelved proposals, configured signing failure, dirty-index preservation, shallow fetches, archive loss, export/import, and linked worktrees. Concurrent archive tests use distinct coherent model checkpoints, not only disjoint event files. Verify both histories survive without a semantic merge or rewritten checkpoint.
7. Test migration with a small authored fixture containing ID collisions, conflicting duplicates, independent historical coverage, planned-only boards, views, walkthroughs, corrections, and unresolved drafts. Verify explicit conflict resolution, changed-source refusal, interrupted cutover, and idempotent resume.
8. Use the existing browser seam for visible behavior only. Cover overview, drilldown, Back/Forward, selection, keyboard focus, filters, aggregate inspection, grammar switching, stale scenes, explanations, and walkthrough playback. Reuse current exploration, picking, comparison, and presentation fixtures.
9. Keep rendering algorithm coverage with its current owner. Add no screenshot snapshots or timing assertions that duplicate existing renderer tests. A fake layout response can prove latest-request behavior at the existing browser seam.
10. Measure changed authored bytes and lines on fixed fixtures. A one-field edit with the same active proposal must have the same tracked-file delta after zero or many completed archived proposals. Unrelated current module and flow files remain byte-identical. Archival object growth is measured separately and is not claimed eliminated.
11. Use the measured workbench fixture as an optional comparison workload, not a normal test dependency on historical branch hashes. Preserve its semantic content in an authored fixture only if needed. Normal tests remain small and fast. Do not enforce the exploratory 93 percent reduction as a universal threshold.
12. Validate types, schemas, and lint for structural rules. Run focused behavioral owners for changed contracts. Broader checks follow the actual implementation scope. No blanket full-gate requirement applies to writing or updating this spec.

## Out of Scope

Database adoption, Fluree or DoltgreSQL integration, managed PostgreSQL, Scaleway provisioning, billing, identity providers, hosted sharing, and hosted deployment are deferred. Their earlier research remains available.

This work does not host agents or repository checkouts. It does not infer the complete architecture from code, create automatic semantic flows from dependencies, or add a renderer service.

Phone layouts, manual geometry editing, a new renderer algorithm, generic distributed collaboration, and offline synchronization between independently edited databases are excluded.

Cross-model atomic writes and ownership transfers are excluded from this first model migration. Cross-repository code bindings and explicit read navigation remain supported. The old board-move control retires with board ownership. The interface must explain that transfer is unavailable rather than performing a partial move.

Arbitrary pruning of retained architecture history, automatic source-code history retention, and automatic rewriting of the user's commits are excluded. Git history publication requires explicit configuration and authorization. The archive is not an access-control boundary within a Git repository.

Implementation and ticket decomposition are not performed by publishing this spec. No existing board proposal is adopted as part of specification work.

## Further Notes

The confirmed seams use one shared runtime contract for domain behavior and the existing browser contract for interaction. This confirmation came from the owner during specification work.

This spec intentionally replaces or amends ADR 0015, ADR 0016, ADR 0022, ADR 0023, ADR 0029, ADR 0036, ADR 0049, ADR 0051, and ADR 0052. It preserves or adapts the semantic contracts in ADR 0037, the container-interface ADR 0044, ADR 0045, ADR 0053, and ADR 0054. The other ADR numbered 0044 concerns visual slabs and is not the container-interface decision.

Affected architecture descriptions include Archboard, Board persistence, Archboard server, Archboard server routes, Command interface, Command dispatch, Browser application, Board viewer, Live panes, and Semantic renderer. Code-intel, walkthrough recording, and workbench context must be assessed during implementation for affected contracts. Specification work leaves current architecture boards accurate and needs no board mutation. Required proposals belong to the implementation tasks before code changes.

The original history experiment proves local Git mechanics, not application crash recovery, semantic concurrent merging, or production retention. This spec supplies those missing contracts as implementation requirements. Migration creates a one-time format replacement diff. The small-diff contract applies to subsequent architecture edits, not that replacement. Source-commit hashes in earlier research are historical provenance because the owner later signed and rewrote repository history. Resolve present source from current signed refs.

Evidence and design context: [architecture discovery and interaction](../../docs/design/architecture-discovery-and-interaction.md), [proposal history churn](../../docs/design/proposal-history-churn.md), and [Git archive experiment](../../docs/design/git-architecture-history-experiment.md). TASK-543 records the deferred database investigation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Repository and module readings derive from canonical module files and source-owned relationships without boards, copied definitions, or stored levels.
- [ ] #2 Flow collections and dynamic walkthroughs preserve stable identities, ordered behavior, reading selections, and exact playback revisions.
- [ ] #3 Active proposals store ID-based changes and retain sibling, ancestry, reconciliation, adoption, shelving, and correction behavior.
- [ ] #4 One-field edits leave unrelated authored files unchanged, independently of completed archive history length.
- [ ] #5 Every public mutation validates stale-read tokens and claims, and retries cannot duplicate a completed operation.
- [ ] #6 Interrupted multi-file writes recover coherently or report a recoverable conflict without overwriting foreign content.
- [ ] #7 Git checkpoints retain required baselines, respect signing policy, preserve the user index, and never select current architecture by archive order.
- [ ] #8 Archive publication distinguishes local and shared state, handles divergent histories without rewriting, and restores missing dependencies in shallow clones.
- [ ] #9 Linked worktrees keep independent current models and recovery state while sharing retained archive objects.
- [ ] #10 Untracked vaults retain local operation and portable history through explicit private-archive initialization.
- [ ] #11 Migration preserves legacy IDs and all lifecycle data, blocks ambiguous overlaps, resumes safely, and does not invent repository-wide historical states.
- [ ] #12 Root navigation, recursive drilldown, multi-selection, focus, filters, grammar switching, and explanation actions satisfy the specified visible contracts.
- [ ] #13 Existing public read/write and browser seams own behavior coverage without redundant wording tests or arbitrary timing gates.
- [ ] #14 Domain language, affected ADRs, consumer skill, CLI contracts, and architecture proposals reflect the delivered model before implementation is accepted.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep all delivery work on feat/canonical-module-model, based on current main and the signed specification commits.
2. Dispatch unblocked TASK-549 children to gpt-6.1-sol implementers in separate worktrees. Follow implement-spec and tdd at the approved seams.
3. Keep frontend implementation with the parent under AGENTS.md. Complete each mixed ticket before closing it.
4. Merge completed ticket branches through merger subagents. Recompute the available work from native Backlog dependencies.
5. Open one draft PR against main after the first implementation merge. Keep review evidence tied to exact commits.
6. Run the final code-review phase against main and TASK-549. Resolve findings and complete the remaining acceptance evidence.
7. Mark the integration PR ready, close proven Backlog work, and remove implementation worktrees. Do not merge the PR into main.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The owner approved all 24 delivery tickets and autonomous implementation on 2026-10-26. The owner requested one PR against main, without heavy stack splitting.

The primary seam is the shared architecture read/write interface with real temporary files and Git repositories. The existing browser seam owns visible behavior. These seams already have owner approval.

All 36 native dependency edges match the approved graph. The integration branch contains current origin/main. Main also added tracked render recipes and embeds, which existing workflows must retain through migration.

Transient orchestration records live outside the repository at /home/msc/.local/state/archboard-implementation/task-549. Each ticket owns its detailed plan and evidence. The parent handles frontend work under AGENTS.md.

Merged completed TASK-549.01 from feat/canonical-module-runtime at 730f3ebcc43a91202a233927ca829a4fecf54484 through signed no-ff merge 74839dd9e92ca0f91b166584001b137858ee46c5. The merge has no conflicts and its complete tree matches the validated ticket tip exactly. Reused the recorded runtime, transport, browser, type, lint, formatting, and architecture evidence without rerunning unchanged tests. TASK-549.01 remains Done with all four acceptance criteria and both completion items satisfied. TASK-549 remains In Progress. Backlog reports the next ready tickets as TASK-549.02, TASK-549.10, and TASK-549.19. The first draft integration PR can now be prepared, with the required review before any push. No push or PR occurred during this merge.

Integrated TASK-549.02 from signed source 8f2a9f98efdb1e23ce3794d5ca49d8627cec2668 through signed no-ff merge 1ddb18c86de6a943640725ec4473aa9f309080d1. The merge has no conflicts and its complete tree equals the validated source. Reused 40 focused backend tests, 604 regression tests, four browser cases, the final browser simplification case, both TypeScript projects, accepted lint, formatting, skill inputs, and architecture evidence. No unchanged tests or reviews ran again. TASK-549 remains In Progress and TASK-549.02 remains Done. Ready implementation tickets are TASK-549.03, TASK-549.10, and TASK-549.16. TASK-549.19 is already complete at signed e1aa6590c7178e140144ca9253d7db362f72b9c1 and awaits its separate merge before the parent recomputes the frontier. Do not dispatch another implementer for TASK-549.19. Review coverage ends at f1b91c9a98537a29238ac1575f45d2fcfd5d3259. No push or PR edit occurred. PR 19 remains draft.

Integrated completed TASK-549.19 from signed source e1aa6590c7178e140144ca9253d7db362f72b9c1 through signed no-ff merge 3c5c97f9c80fd2fd756004b86e7642acbd78c5bb. The merge preserves the complete TASK-549.02 implementation and every signed planning, specification, and ticket commit. Shared contracts retain exact checkpoint reads and legacy inventory/planning. Both adopted architecture histories remain intact. New CLI-authored integration readings combine them without forced adoption or replacement IDs. Browser application@TASK-549.02, all frontend source, and browser tests match the pre-merge integration exactly, so their evidence is reused. Focused integration evidence passes 62 tests across 12 files, both TypeScript projects, lint with zero warnings, and formatting. Semantics have zero diagnostics. Current code checks retain the same 12 known warnings outside affected boards and informational exposure findings. Claims are released and the integration server is stopped. TASK-549 remains In Progress. TASK-549.02 and TASK-549.19 remain Done. The recomputed ready frontier is TASK-549.03, TASK-549.10, and TASK-549.16. The parent owns frontend work and dispatch. No implementer launched. Review coverage remains f1b91c9a98537a29238ac1575f45d2fcfd5d3259. New work needs parent review before the next push. No push, PR edit, watch, or PR merge occurred. PR 19 remains draft at its published f1b91c9a9 head. Complete merge evidence and provenance are in /home/msc/.local/state/archboard-implementation/task-549/task-549.19-merged.md.

Owner requested an immediate update onto origin/main after the large refactor. Rebased the integration history onto 6cae688bbaa2b6c9862054258e89f28c605cfc46 with signed commits and merge topology retained. Original integration and browser histories remain on local backup branches. Adapted CLI clients, shared Git access, composite UI controls, pane header ownership, and refresh invalidation to the new interfaces. Runtime and CLI process tests pass. Reconciliation proposals: Board persistence, Command interface, Archboard server routes, and Browser application at TASK-549-main-refactor. Browser validation and proposal adoption remain in progress.

The new main branch owns ADR 0058 for interface width. The canonical-read decision moves to ADR 0060, and its live references follow that path. The temporary board interface-width overage remains explicit on TASK-549.24. Its final cutover must remove superseded legacy exports without raising ceilings or hiding names behind objects.

The rebased integration passes source/browser types, lint, 44 focused tests, three CLI/server process tests, seven request/refresh tests, and the four canonical/legacy browser cases. All four reconciliation proposals pass their affected code checks and are adopted. All original variant meanings remain intact. RequestFailure stays private, so server-requests meets its interface ceiling. Board currently has 209 public names against 188 during the dual-model transition; TASK-549.24 explicitly owns removal of superseded legacy APIs before completion. Parent UI checkpoint rebased cleanly to 097d2b1fc and passes types. Final current-vault validation and child branch synchronization remain.

Main-refactor final evidence: current vault semantics pass with zero diagnostics. Current code checks report zero warnings on the four reconciled boards and 10 warnings elsewhere. Formatting passes. Provenance assertions retain every variant meaning, adoption, and shelving from both sources. Four shared views use upstream summaries or expanded selections. Their effective selections remain identical on every original historical variant. The parent recursive-viewer branch is rebased and synchronized; the backend delegate received the new base and transplant instructions. The draft PR remains unpublished at its previous head pending review of changed code. The interface-width ceiling is unchanged and remains a final-cutover gate.

Integrated TASK-549.03 from signed source 68e4d914fbd993673d592a314a68a4df5ac33883 through signed no-ff merge af919ac17a107a9f111024c15e62b84740d6a5f2. The conflict-free merge tree equals source tree f26e3ee04d36629c67422b39b34f2126fc18e4de, preserving all architecture proposals, history, and Backlog state. Reused recorded evidence: 90 backend tests, six browser cases with 43 assertions, 15 skill tests, source/browser types, lint, formatting, and semantics. Four affected boards have zero code warnings. Ten unrelated warnings remain. TASK-549.24 retains the unchanged board interface-width gate of 234/188 for final cutover. TASK-549 remains In Progress and TASK-549.03 remains Done. The dependency-ready frontier is TASK-549.04, TASK-549.10, TASK-549.16, and TASK-549.17. Newly dispatchable work is .04 and .17. The parent retains .10 in feat/recursive-module-readings and .16 frontend in t3-94639c42. The old .16 backend delegate is finished, and no delegate runs. No implementation, fresh review, push, PR update, or delegation occurred. Exact merge evidence is in /home/msc/.local/state/archboard-implementation/task-549/task-549.03-merged.md.

Integrated TASK-549.16 from signed source bfd6da3b0c18012816f3aaa7b31aa470f4c2d7e0 through signed no-ff merge 2ba83ae6ea19eb7c1dc15c00f035165fd5929027. The conflict-free merge tree exactly equals source tree 099be6d9738e0871911314ac288c67488e4520b9. Architecture histories, the checkpoint view expansion, decisions, and task records remain exact. Reused recorded evidence: nine browser cases with 53 assertions, 23 runtime cases, four adapter cases, 15 consumer cases, types, lint, formatting, and semantics. Four affected boards have zero code warnings. Ten unrelated warnings remain. TASK-549.24 retains the unchanged board interface-width gate of 241/188. TASK-549 remains In Progress and TASK-549.16 remains Done. The dependency-ready frontier is TASK-549.04, TASK-549.10, and TASK-549.17. Integration task records for .04 and .10 still say To Do because their active work remains on separate branches. TASK-549.04 backend is complete at 58341192f5c1126aa5055d962efef5900c0f1733 in t3-b9e0963e and remains In Progress for parent browser work. It was not merged. Parent-owned TASK-549.10 remains incomplete at 6c9cdd8cc1890b0d90fb9cb95bde0b3c874fd26c on feat/recursive-module-readings. Only .17 is unassigned ready work. The parent owns frontend work and orchestration. No T3 delegate runs. No tests, review, implementation, push, PR action, or agents ran during this merge. The full specification remains incomplete. Exact evidence is in /home/msc/.local/state/archboard-implementation/task-549/task-549.16-merged.md.

TASK-549 orchestration exposed a blocking registry failure on this repository with198worktrees. Each unknown checkout launched every sibling inspection concurrently and exhausted the unchanged Git deadlines. A public vault-registration probe with an isolated registry failed after22.5s. Bounding private inspections to8 and settling each group before refusal registers all197siblings in20.6s without skipping identities, changing the chosen checkout, or increasing timeouts. A real12-worktree case protects complete registration; existing registry owners and static checks are running. The architecture and public registry interface remain unchanged, so existing architecture descriptions remain accurate.

Registry follow-up:22real-Git tests with71assertions pass, and both type projects pass. The batching loop uses a scoped no-await-in-loop exception because awaiting each batch is the mechanism that bounds concurrent process ownership. This follows existing deliberate serial-process patterns. The actual198-worktree red/green probe proves why parallelizing that loop is incorrect; no global lint rule or product duration changes.

Integrated TASK-549.04 from signed source 642d447ba509e9e91370cb253fc33d1a184151d0 through signed no-ff merge b53c9e7732e67ed712d5a33117dcc1b808245301. The merge parents are integration b5be713977e7829f16b404314af9fd8f653f70be and the exact source. The conflict-free merge tree equals validated source tree b90a68de51a10d83a41a02e8bf95436d7567bbde. All architecture records, ADRs, and Backlog state remain exact at the merge. This later parent note is the only content change after that merge.

Reused the recorded source evidence without repeating unchanged tests or review. Evidence includes 60 backend runtime cases, nine combined structure cases, four publication runtime cases, four adapter cases, and ten browser cases with 63 assertions. The registry repair passes 22 cases with 71 assertions and restores the real 198-worktree scan. Types, lint, formatting, 15 consumer cases with 97 assertions, and evaluation inputs pass. Current semantics has zero diagnostics. Four affected boards have zero code warnings. Ten unrelated code warnings remain. No model evaluation ran. The unchanged interface-width gate remains 241/188 under TASK-549.24. The full gate does not pass.

TASK-549 remains In Progress and TASK-549.04 remains Done with four acceptance criteria and two completion items satisfied. The dependency-ready frontier is TASK-549.05, TASK-549.10, and TASK-549.17. TASK-549.05 is newly ready for implementation. TASK-549.17 is already complete at signed a8837de0efc6cdfb9dde4ba078f1969721006328 and awaits its separate merger next. Do not dispatch another implementer for .17. Parent-owned TASK-549.10 remains incomplete at 6c9cdd8cc1890b0d90fb9cb95bde0b3c874fd26c on feat/recursive-module-readings. Its integration record remains To Do until the parent merges that work.

No frontend edits, fresh review, repeated tests, implementation dispatch, push, PR edit, or .17 merge occurred. The parent retains orchestration and frontend ownership. Detailed merge evidence is external at /home/msc/.local/state/archboard-implementation/task-549/task-549.04-merged.md.

TASK-549.17 required merge is complete through signed no-fast-forward 05d8a688d07022f8f9883cf64d9e363fc0794d86 from validated signed source b48867e4a1b81809bc9ec39606d45d83bcdf9d96. The merge tree exactly equals source tree d063131a612505e8a49be5e5b3e98bc9c47863fb. Source synchronization e75ac98913f6dd3316da701b013646df5ba51c30 first incorporates integration 1dba8fd12 while preserving both original architecture histories, structural request alternatives, complete affected subjects, publication, and durable private recovery. Both original variant meanings, identities, documents, decisions, and view expansions remain intact. Combined TASK-549.17 integration proposals are compared, checked, and adopted on all three affected boards. The .04 registry bounded scan and S20 metadata repair remain byte-identical. Frontend files and browser tests remain byte-identical to integration. Focused evidence covers 28 runtime cases, five adapter cases, and 14 consumer/contract cases. Types, lint, formatting, evaluation inputs, and current semantics pass. Affected code has zero warnings; ten unrelated baseline warnings remain. The inherited shallow-fetch timeout is resolved by settling independent Git probes and removing an unused tip query, with final passes at 13418ms and 12534ms under the original 15000ms limit. No deadline or assertion is weakened. All nine structural cases also pass in the final run. The width gate remains 243/188 under TASK-549.24, so no full-gate success is claimed. TASK-549.04 and TASK-549.17 remain Done; TASK-549 remains In Progress. The dependency-ready incomplete frontier is TASK-549.05 and TASK-549.10. Parent-owned .10 stays dirty in its separate checkout and is not consumed. Claims are released and the source server is stopped. Evidence and exact provenance are recorded in task-549.17-merged.md beside the external task handoffs. No child agent, frontend edit, browser run, fresh review, push, PR update, or unrelated ticket work occurs.
<!-- SECTION:NOTES:END -->
