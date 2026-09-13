---
id: TASK-208
title: Generate complete conventional CLI help from command contracts
status: To Do
assignee: []
created_date: '2026-09-13 22:56'
updated_date: '2026-09-13 23:35'
labels: []
dependencies: []
references:
  - src/cli/commands/run.ts
  - src/cli/command-routing
  - src/cli/command-contract
  - src/cli/command-routing/tests/help.test.ts
  - src/cli/commands/pane.ts
  - docs/adr/0008-cli-is-the-default-surface.md
  - TASK-123
priority: high
type: bug
ordinal: 367000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
People and agents cannot discover the actual CLI contract from help: root help contains stale command references, namespace menus omit child listings and options, and flag applicability, requirements and defaults are scattered across handwritten usage strings, schemas, global extraction and handlers. Enabling help flags everywhere exposed this wider problem. TASK-123 intended generated, self-describing help but the current implementation does not deliver it.

Agreed design from the user interview:
- Commander owns conventional help generation and layout, projected from authoritative command contracts and the command tree. Remove duplicate handwritten usage and flag tables; retain the existing execution architecture.
- Namespace help lists immediate children with summaries and options applicable at that level. Each command repeats its applicable shared options in full so its help stands alone.
- Keep usage, arguments, options, subcommands where relevant, and concise runnable examples. Move long architecture explanations to existing reference documentation; retain operational facts such as stdin behavior, conditional requirements and meaningful defaults.
- Shared option applicability is part of the real contract: reject flags where they do nothing. This is an explicitly approved behavior change; preserve other execution semantics.
- Complete public metadata for staged commands as well as ordinary commands. Share validation and help facts wherever possible; do not infer user-facing defaults from incidental parser plumbing.

Strict user testing constraint: do not test matching help text content. No golden output, snapshots, literal command/flag/description assertions, or full-output equivalence assertions between help spellings. Editing a description or adding/renaming a flag must not require editing test expectations. Formatting/structure checks and runtime behavior tests are allowed. Derive traversal and structural expectations from live metadata; test our integration rather than Commander's own formatter. Replace the recent help-alias test's full-output equality assertion accordingly.

This is planned future work, not authorization to begin implementation in this planning session. Deliver as one coherent CLI change because command metadata, help rendering and applicability validation must agree. Reinspect the current source when picking up the task; it may change after this audit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root help and every registered descendant use Commander's standard help generation from the authoritative command tree/contracts; duplicate handwritten usage grammars and option tables are removed.
- [ ] #2 Each namespace menu lists its immediate public subcommands with summaries, and each command shows its applicable local and shared options with complete descriptions. Irrelevant options and removed commands are absent.
- [ ] #3 Every public argument and option, including staged-command inputs and bootstrap/shared flags, has accurate public metadata for aliases, value placeholders/arity, required or conditional status, choices and meaningful defaults wherever applicable. Flag presence requirements are distinguished from a supplied flag requiring a value.
- [ ] #4 Parsing and help share authoritative facts wherever possible. Inapplicable flags are rejected with actionable usage errors instead of being silently accepted; existing execution behavior otherwise remains intact.
- [ ] #5 Help is concise and conventionally formatted with usage, argument/option sections, child commands where applicable, and practical examples. Essential input/output and stdin behavior remains discoverable; long architecture prose moves to appropriate existing reference docs.
- [ ] #6 `help <path>`, `--help` and `-h` resolve through one help path at every registered depth, preserving help flags anywhere in the invocation and taking precedence over ordinary argument validation.
- [ ] #7 Help requests succeed on stdout with exit code 0 without starting services, reading command input, executing handlers or changing application state, including when ordinary required arguments are missing or invalid.
- [ ] #8 Fast runtime coverage traverses the live registry and verifies our help integration, formatting/structure and side-effect-free routing. It has no matching-text-content assertions, snapshots, hardcoded command/flag inventories, description expectations or full-output equality checks. Flag renames/additions and description edits do not require test changes.
- [ ] #9 Focused behavior tests verify applicable versus inapplicable flags and meaningful argument/option validation at the cheapest credible seam, without duplicating upstream Commander tests or testing source-file contents.
- [ ] #10 Relevant agent/reference guidance is consistent with the resulting help contract, reproducible derived artifacts remain ignored, and bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execution ordering: TASK-207 and TASK-208 form the first implementation stage; coordinate overlapping semantic CLI metadata without imposing an unnecessary dependency between them. BOTH must be Done before TASK-209, TASK-210 or TASK-211 begins. Include TASK-207's final group-inspection command in the completed help surface. Planning leaves this task To Do.

1. Re-read src/cli/command-contract, command-routing, commands/run.ts, pane.ts, src/bin.ts and ADR 0008 against the current working tree. Commander 15 is already installed; reuse it. Preserve the recent help-anywhere routing fix and unrelated installation/session work. Audit every public registry route, including executable namespaces, staged commands and bootstrap options, before removing old usage tables.
2. Extend authoritative CommandContract parameter metadata with positional requiredness/repeatability, option value arity and placeholder, option presence requirement (distinct from a present option requiring a value), choices, meaningful defaults and concise conditional requirements. Project the same facts into parsing/help/introspection, deriving types from existing schema/vendor types. Do not infer user-facing defaults from incidental Zod defaults; declare actual operational defaults and check consistency with execution.
3. Give staged browser commands real public metadata while preserving validation timing. Replace opaque public show-token/close-token descriptions with declared parameters reused by parseStage and help projection, retaining only the hidden internal collection needed to validate after the existing prerequisites. Cover browser show/close positional and pane conditions without moving errors earlier merely to satisfy Commander's normal parser.
4. Define the shared --url, --board, --doing, --expect-version and --as-session contracts once, with complete metadata and explicit applicability selected by each executable route. Audit actual request construction: board selection affects claims/releases; author/session/version flags affect their respective semantic writes; endpoint applicability includes server/conditional paths and excludes local-only operations where it has no effect. Settle start/stop and semantic config --schema applicability from real behavior rather than a guessed global list. Reject supplied flags where they do nothing with actionable usage errors, keeping flags usable anywhere and preserving other execution semantics.
5. Reuse the Commander parameter projection in command-contract/lib/commander-adapter.ts through a small public module entrypoint for both parsing and help. Build the full Commander tree from COMMANDS, including root, executable namespaces and leaves, with summaries, descriptions, declared arguments/options and concise runnable examples. Each leaf repeats its applicable shared options in full; namespace options describe what applies at that level, not the union of unrelated child flags. Keep legacy ignored pass-through tails internal rather than advertising them as useful public arguments.
6. Use Commander's standard help generation/layout. Remove printHelp, handwritten helpFor, duplicated route/contract usage grammars and namespace flag tables from commands/run.ts once authoritative metadata covers them. Preserve operational input/output, stdin behavior, meaningful defaults and conditional requirements in concise metadata/examples; move long setup/architecture explanations to the appropriate existing INSTALL.md, TESTING.md or reference documentation. Preserve bare namespace behavior such as semantic, defaulted repo and browser refusals during actual execution.
7. Resolve help before ordinary argument validation, bootstrap, global setters, stdin reads, prerequisites, handler execution and application-state changes. Route help <path>, --help and -h through one lookup/rendering path at every registered depth, preserving help flags anywhere even when required ordinary inputs are missing/invalid. Audit src/bin.ts specifically: it currently applies --url before loading import-time runtime configuration. Help must bypass this mutation while real commands still configure the endpoint before those imports. Leave runCommand/output validation/staged execution/exit mapping/signal behavior intact.
8. Replace the current help-alias test's full-output equality assertion. Traverse live registry metadata to exercise all help spellings/depths and derive structural expectations from the resulting Commander command model: route resolution, immediate children and parameter projection. Check conventional output structure without matching command names, option spellings, descriptions, golden text, snapshots or equality between spellings. Prove stdout success/exit 0 and absence of prerequisite/handler/stdin/state-setter calls at the cheapest routing seam; a description edit or flag addition/rename must not require rewriting expected content.
9. Add only focused runtime behavior coverage for option presence versus missing values, choices/meaningful defaults, shared applicability, staged validation timing and help precedence. Reuse command-contract/routing owners and the existing shipped-binary seam for bootstrap side effects; avoid retesting Commander's formatter or source-file contents. Update existing introspection/parser expectations through live metadata rather than a parallel hand-maintained public inventory. Keep lint/type rules intact.
10. Update affected agent/reference guidance and canonical authored command audit inputs where the public contract changed; leave reproducible generated views ignored. Coordinate TASK-207's new inspection metadata and pass the stable resulting CLI contract to TASK-209/210/211. Run focused routing/contract checks and bun run check. Finish by simplifying duplicate metadata, projection and help paths so a future command is declared once and receives correct parsing, applicability and discoverable help.
<!-- SECTION:PLAN:END -->
