---
id: TASK-203
title: Plan consumer semantic vocabulary and visual grammar
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 12:13'
updated_date: '2026-09-13 14:50'
labels: []
dependencies: []
references:
  - CONTEXT.md
  - src/runtime/semantic-renderer/lib/group-palette.ts
  - src/runtime/semantic-renderer/lib/svg/styles.ts
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/adr/0024-vault-configuration-owns-vocabulary-and-presentation.md
  - docs/adr/0025-containment-and-type-own-distinct-visual-channels.md
  - docs/adr/0026-vault-diagnostics-drive-cli-and-agent-repair.md
  - docs/adr/0027-explicit-traffic-controls-distance-based-animation.md
ordinal: 362000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The level badge request exposed missing schema metadata and expanded into required consumer-defined levels and declarative semantic presentation. Readers cannot explain current hashed kind/group colors, hero emphasis, dashes or arrowheads. User explicitly requested a grilling/design round and a Backlog plan before further implementation. TASK-202 contains partial unvalidated level work and is paused.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The consumer configuration scope, required vocabularies, semantic membership model and ownership boundaries are explicitly agreed.
- [x] #2 Color, line and arrowhead rules, precedence, comparison/selection behavior, legend and inspection explanations have a deterministic agreed contract.
- [x] #3 Configuration editing, validation, freshness, historical rendering and migration behavior are decided with concrete examples.
- [x] #4 A bounded implementation plan with runtime acceptance evidence is recorded and the user confirms shared understanding before implementation resumes.
- [x] #5 The plan covers a hideable browser-only legend, vault diagnostics bell, CLI checker and Fix with Codex dispatch and revalidation behavior, including missing/busy workhorses and configuration fallback.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design record: CONTEXT.md owns definitions; accepted ADR0024–0027 own decisions and rationale. Q1–Q32 are settled. The consolidated plan below awaits the user's final shared-understanding confirmation before production work resumes.

1. Establish the vault configuration and vocabulary contract.
Replace the partial JSON configuration in TASK-202 with version-controlled YAML, a canonical validation schema and generated editor schema. Require consumer-defined board levels and configure node/relationship kinds; keep palette values centrally curated with named references only. Use one interpreted policy and validation result across store, server, renderer and CLI. Valid policy rejects newly authored unknown references while existing removed definitions warn and remain readable; invalid policy uses coherent bundled defaults and permits structurally valid edits with warnings. Preserve required-metadata validation regardless of policy health.
Evidence: focused runtime cases for a valid custom vocabulary, unknown new/existing references, missing required metadata, invalid YAML/schema and recovery. Finish existing level badge/fixture work against this contract instead of maintaining the interim JSON path.

2. Resolve appearance once from meaning and current policy.
Replace kind/group hashes with mandatory containment scopes, separate type-colored icon chips on cards and containers, and neutral fallback. Preserve automatic card/container depiction from final visible children, including removed comparison children. Apply relationship color/dash/head by configured kind and line weight only by emphasis. Preserve comparison borders/line color and separate outer selection treatment. Restyle every variant on config changes without changing board content, comparison status, selected view, camera or selection.
Evidence: Azure/Kubernetes/API examples including collapsed Kubernetes, expanded Kubernetes, nested uncolored container and AWS host; current/proposed/history, light/dark, selected changed subjects, and a config edit/recovery in open panes.

3. Add explicit traffic and remove inferred motion.
Optional traffic object only; presence enables defaults of speed40 diagram units/s and volume0.5 dots/s. Supplied values positive finite, omission the only off state. Compute travel timing from the final routed path including curves and place dots at consistent entry intervals with pre-populated traffic. Remove emphasis/kind-triggered dots. Suppress dots on removed edges and reduced-motion; keep supported SVG export animation. Do not expose animation numbers in the inspector or add telemetry fields. Include normalized traffic in comparison, count the whole object once in identity validation, and compare structured values by value rather than object identity.
Evidence: short/long routes with equal speed/entry rate; defaults versus explicit equivalent values; positive-value validation; traffic-only versus traffic-plus-destination identity behavior; removed edges, reduced motion and exported SVG. Include no new file-content tests.

4. Deliver shared vault diagnostics and CLI check.
Build one checker for config and all board families with actionable locations and honest reporting of unreadable content; the browser and CLI use the same diagnostics. Add the top-right bell/dot and Fix with Codex action, use existing workhorse delivery (start idle, queue busy, link/create when absent), and recheck after attempted repair. Clear resolved issues based on check results rather than agent completion. Keep ordinary claims/version checks on all repairs.
Evidence: mixed healthy/broken vault, configuration failure/recovery, existing unknown kind, diagnostic repair, idle/busy/missing workhorse and failed repair that leaves the issue present.

5. Explain the policy and repair the dogfood inputs.
Render an aesthetically spacious browser legend, visible by default and hideable; inspect applied semantic/standing/emphasis appearance but not numeric traffic. No export legends. Update the tracked archboard skill to discover configured vocabulary and run CLI check after board work, then sync derived skills. Update installation/configuration instructions and repair the authored dogfood vault and affected fixtures for the intentionally breaking format. Preserve board names, subject IDs, ancestry/views and adopted states during these repairs.
Evidence: browser legend visibility and theme cases, CLI checker clean on repaired dogfood boards, and accurate skill/installation examples for the implemented CLI.

6. Complete integration and visual polish.
Run targeted behavior checks at the steps above, then bun run check. Restart the source-loaded server only once the integrated source is coherent, and verify the real dogfood boards in the browser at the desktop target size. Inspect whitespace, labels, icon chips, selection/comparison legibility and animation across representative routes. Simplify redundant resolver/validation/compatibility paths before accepting the implementation.

Planning gate: TASK-203 stays In Progress and TASK-202 stays paused until final confirmation. These steps describe intended work and evidence; none is a claim of implementation or completed verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Established facts: current colors are ten curated light/dark pairs, hash-assigned to group or kind glyphs; fills are neutral. Green/amber/red standing and cobalt selection are distinct fixed channels. Edge kind determines dash/head; hero emphasis determines line weight/lightness/head size/motion. Sequence messages have their own sync/async/return/self grammar. There is no legend or appearance explanation. Current nodes have kind, one explicit non-inherited group, and one structural parent; no platform/system-membership attribute. Required level and consumer-defined enum are user requirements; vault-wide config location and all styling details remain design proposals, not approved contracts.

Round 1 answers: One vault-wide vocabulary and visual policy, no board overrides. Kubernetes membership is structural containment via parent, not an orthogonal platform tag: concrete migration is Azure legacy IIS VMs to Kubernetes services; Kubernetes can itself be contained by Azure or AWS. A nearer Kubernetes color scope must beat a more distant cloud-provider scope for its contents. Consumers configure node types with a name, optional color, and RemixIcon icon. Semantic color affects card border and restrained background tint; comparison added/changed/deleted overrides border. Semantic emphasis remains author intent and policy controls appearance. Browser legends must be hideable and aesthetically spacious; no legends in exported diagrams for now. Configuration is still under interview, implementation remains paused.

Round 2 answers: Node type and depiction need separation: user suggests containers render as cards when no contained nodes are rendered; exact semantic type identification remains open. Card border/background follow containment color, while icon and icon-tile border/tint follow the node type color and RemixIcon. Named curated colors only, with an explicit requirement that maintainers can easily retune and add palette entries. Consumer-defined relationship types and configurable line/head styles agreed. Current configuration applies to all variants as presentation, not semantic board data. Removing a configured node type must leave existing nodes readable in neutral/gray with warnings when touched via CLI. Add a top-right notification bell beside theme/settings, with a dot for vault warnings/errors and Fix with Codex targeting the workhorse to run the CLI checker, repair clear errors, or ask when ambiguous. Configuration must be version-controlled YAML with a validation schema and CLI validation, no UI editor. Parse failure uses current rendering defaults until corrected, with problems in the notification bell. Browser legend visible by default and hideable; no export legend. Dependent decisions now include stable type vs render shape, container own color vs descendant color, definition-removal/new-write handling, config validation failure policy, and diagnostic/Fix with Codex lifecycle.

Round 2 fact checks: Existing renderer already chooses container vs card from children present in the final rendered content, not node kind. A scoped view selecting a parent alone does not pull in descendants, so it renders as a card; selected/removed comparison children can cause container rendering. Container headers currently lack type icons. Current semantic CLI has per-read integrity validation but no registered checker/all-vault check; notification/Fix with Codex requires a real shared diagnostic contract. Existing workhorse composer auto delivery steers busy turns; explicit queue exists. Missing workhorse is refused rather than implicitly created. Notification UI currently has dismissible inline notices, no bell. These are facts to incorporate into the plan, not authorization to implement.

Round 3 answers: Semantic node type remains stable across levels; visible children determine container versus card, including deleted children shown in comparisons. Color propagation is mandatory for containers, not opt-in. A Kubernetes leaf inside Azure has Azure-blue body border/tint and Kubernetes-green icon/chip border/tint. Kubernetes with visible children has a green container border/tint and establishes green for its contents; container headers must render type icon chips too. Consumers may only reference curated named colors, not define arbitrary values in YAML. Expand the centrally maintained palette to at least red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink and rose; maintainers must easily edit/add palette entries. Unknown newly authored type/level/relationship values are rejected with valid configuration, while existing removed definitions warn and remain readable with neutral fallback; missing required metadata is an error. Any invalid configuration uses coherent bundled defaults, reports diagnostics and permits structurally valid board writes with explicit warnings until vocabulary validation can resume. Implement a real CLI check command and emphasize running it after board work in the archboard skill. Fix with Codex queues behind a busy workhorse, uses existing link/create flow when absent, and reruns diagnostics after repair; successful turn completion alone does not clear issues. Remaining frontier: uncolored type inheritance, relationship color/emphasis channels, selection versus standing, and config refresh behavior. No implementation resumed.

Round 4 answers: Containers with no configured type color inherit the nearest enclosing color scope without interrupting it; their own icon chip stays neutral, as does a body with no enclosing scope. Relationship type owns optional curated color, dash and arrowhead shape; emphasis owns line weight only, with proportionate arrowheads and no emphasis-driven whitening or motion. Selection is a separate outer highlight preserving comparison border, semantic tint and type icon styling (same principle for edges). Saving valid configuration automatically restyles all variants and open panes while preserving camera and selection; invalid config activates coherent defaults and diagnostics, recovery restores configured styling, and config-only changes never produce semantic comparison changes. User adds explicit optional per-connection traffic data for animated dots: absent traffic means no traffic rendering; volume is dots per second with default 0.5, speed is units per second with default 10, both optional within traffic. User suggests traffic.enabled/speed/volume; exact minimal shape, coordinate units and display contexts remain to settle. Long routes must not make dots faster than short routes. Implementation stays paused.

User requested ADRs. Created accepted ADR0024 (vault vocabulary/configuration/palette), ADR0025 (containment/type visual channels, comparison/selection/explanation), and ADR0026 (diagnostics/checker/fallback/Codex repair), plus proposed ADR0027 for explicit traffic with settled defaults and open questions. Linked from ADR0023 and updated glossary without implementation details. Traffic factual lookup: fixed trip duration causes length-dependent speed; units are diagram coordinates; removed edges and reduced-motion readers already suppress dots; SVG exports currently animate. Traffic comparison and identity handling also need a deliberate contract: comparison excludes emphasis today, identity validation enumerates all non-ID fields and needs semantic equality for structured traffic. Implementation and TASK-202 remain paused.

User invoked grill-with-docs, combining grilling and domain-modeling, and clarified glossary versus ADR ownership. Added the explicit Vault vocabulary and Color palette definitions to CONTEXT.md alongside existing Kind, Relationship kind, Level and Visual policy entries. ADR0024 now links the glossary and records why allowed values and presentation mappings are consumer-owned and vault-wide rather than duplicating terminology definitions. Configuration schema details remain outside the glossary. Q25–Q30 remain unanswered; this documentation correction does not settle any traffic decision or resume implementation.

Vocabulary audit of the other TASK-203 ADRs: CONTEXT.md now owns Card, Container, Icon chip, Emphasis, Comparison status, Traffic volume and Traffic speed; Color scope definition no longer embeds the nearest-container resolution algorithm. ADR0025 references the glossary and retains depiction selection, inheritance, comparison/selection and rationale. ADR0027 references traffic definitions and retains defaults, mathematics and open questions. No answer to Q25–Q30 has been inferred; no production code or boards changed.

Independent terminology audit of ADR0026/0027 completed: no additional terms needed in ADR0026; checker, diagnostics and repair prose are behavior rather than missing domain definitions. Confirmed volume/speed/emphasis additions and preserved all open traffic decisions. Documentation whitespace check passed.

Q25–Q30 answers: presence enables traffic (no enabled flag); diagram-coordinate speed agreed but increase default from10 remains open. User questions any useful distinction between volume0 and absent traffic; recommendation now positive finite speed/volume and omission as single off state. Traffic changes count in comparison and whole normalized traffic object counts as one identity field. Preserve no dots on removed edges/reduced-motion and animated SVG exports, but numeric animation values must NOT appear in inspector; these illustrate flow, not measured real-world traffic, which can be conveyed by a connection label. Start traffic prepopulated even with faster default. Updated glossary definition and proposed ADR0027 immediately. Remaining recommendations to settle: speed40 diagram units/s and no volume0 state. No implementation resumed.

Q31/Q32 accepted: default speed40 diagram units/s, volume0.5 dots/s; supplied values positive finite, absent traffic only off state. ADR0027 is now accepted and has no open product decisions. Consolidated six-step implementation plan and runtime evidence recorded for final shared-understanding confirmation. Production changes, server restart and TASK-202 remain paused.

User explicitly confirmed the consolidated design and authorized implementation, but prioritized diagnosing/fixing the live Semantic renderer proposal routing first. No further design approval is needed; configuration implementation remains queued behind that fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the Q1–Q32 design interview, recorded accepted ADR0024–0027 and glossary definitions, audited glossary/ADR ownership, and captured a bounded six-step implementation plan with runtime evidence. User explicitly confirmed shared understanding and implementation authorization; delivery is deferred behind the newly reported routing issue.
<!-- SECTION:FINAL_SUMMARY:END -->
