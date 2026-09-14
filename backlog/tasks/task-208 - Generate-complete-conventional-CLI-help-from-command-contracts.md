---
id: TASK-208
title: Generate complete conventional CLI help from command contracts
status: Done
assignee:
  - '@claude'
created_date: '2026-09-13 22:56'
updated_date: '2026-09-14 02:55'
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
- [x] #1 Root help and every registered descendant use Commander's standard help generation from the authoritative command tree/contracts; duplicate handwritten usage grammars and option tables are removed.
- [x] #2 Each namespace menu lists its immediate public subcommands with summaries, and each command shows its applicable local and shared options with complete descriptions. Irrelevant options and removed commands are absent.
- [x] #3 Every public argument and option, including staged-command inputs and bootstrap/shared flags, has accurate public metadata for aliases, value placeholders/arity, required or conditional status, choices and meaningful defaults wherever applicable. Flag presence requirements are distinguished from a supplied flag requiring a value.
- [x] #4 Parsing and help share authoritative facts wherever possible. Inapplicable flags are rejected with actionable usage errors instead of being silently accepted; existing execution behavior otherwise remains intact.
- [x] #5 Help is concise and conventionally formatted with usage, argument/option sections, child commands where applicable, and practical examples. Essential input/output and stdin behavior remains discoverable; long architecture prose moves to appropriate existing reference docs.
- [x] #6 `help <path>`, `--help` and `-h` resolve through one help path at every registered depth, preserving help flags anywhere in the invocation and taking precedence over ordinary argument validation.
- [x] #7 Help requests succeed on stdout with exit code 0 without starting services, reading command input, executing handlers or changing application state, including when ordinary required arguments are missing or invalid.
- [x] #8 Fast runtime coverage traverses the live registry and verifies our help integration, formatting/structure and side-effect-free routing. It has no matching-text-content assertions, snapshots, hardcoded command/flag inventories, description expectations or full-output equality checks. Flag renames/additions and description edits do not require test changes.
- [x] #9 Focused behavior tests verify applicable versus inapplicable flags and meaningful argument/option validation at the cheapest credible seam, without duplicating upstream Commander tests or testing source-file contents.
- [x] #10 Relevant agent/reference guidance is consistent with the resulting help contract, reproducible derived artifacts remain ignored, and bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend CommandContract metadata (contract.ts): positional required/hidden, option placeholder/required/choices/default/requires/hidden, route "staged" for public parameters delivered through the staged token collection, and a per-command shared-option applicability list (url, board, doing, expect-version, as-session). defineCommand validates the new facts.
2. Define the five shared options once in command-contract/shared-options.ts with complete metadata; routing's global-flag extraction and help both read it. Applicability per command from real request construction: --board on claim/release; --doing and --as-session on semantic new/edit/branch/resolve/adopt; --expect-version on edit/branch/resolve/adopt; --url wherever the canvas is contacted (start/stop/status/check/semantic */browser */claim/release; semantic config conditionally), never on repo * or install-skill. A supplied inapplicable flag is refused with a usage error after routing.
3. One Commander projection (command-contract/commander.ts) builds a contract's arguments and options for both parsing and help; the adapter enforces required presence and choices, keeps hidden legacy tails parsed but unadvertised, and leaves staged parameters to the after-prerequisite stage. pane.ts declares browser show/close/panes/open parameters publicly and derives parseStage specs from them.
4. Replace printHelp/helpFor/route usage tables with command-routing/lib/help.ts: a Commander tree from COMMANDS (root, executable namespaces, leaves) with summaries, descriptions, declared arguments/options, applicable shared options repeated per leaf, immediate children with summaries, bare-namespace notes, examples, and a concise root conventions block (shared options, exit codes, URL/env). Remove contract.usage and the table's summary/usage strings; introspection/proof derive usage from the projection.
5. Resolve help before everything: bin.ts strips --url without mutating the environment for a help invocation; session.ts answers help/--help/-h at any depth through one lookup before global setters, dispatch, stdin, prerequisites or handlers; usage-error reporting prints the generated usage line.
6. Tests: rewrite command-routing/tests/help.test.ts to traverse the live registry across all spellings/depths and check structure (usage line names the route, options section lists each visible declared and applicable shared option, child listing for namespaces), exit 0, stdout only, no state setter effect and no handler call; add focused applicability/required/choices/staged-timing cases at the contract seam; update introspection/runner support for the removed usage field.
7. Guidance: README quick start uses current commands; INSTALL/TESTING pointers unchanged; audit JSON tailGlobals updated. Sync skills, run focused owners and bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: contract metadata (required/placeholder/choices/default/requiredWhen/hidden, route 'staged', per-command shared applicability); shared options defined once in command-contract/shared-options.ts; one Commander projection (command-contract/commander.ts) for parsing and help; help.ts builds the Commander tree from the command table (root conventions, namespaces list children, leaves repeat applicable shared options, bare-namespace note, examples); session resolves help before flags/dispatch/handlers and refuses inapplicable shared flags; bin.ts bootstrap skips the environment mutation for help; contract.usage and table prose removed; browser show/close declare public staged parameters that parseStage derives its flags from; semantic render moved to semantic-render.ts to respect the file limit; audit JSON tailGlobals + render owner updated; README quick start uses current commands. Approved behavior change applied: side-by-side trace no longer passes --doing to browser commands. Validation: help.test.ts (registry traversal, every spelling/depth, structure, no handler/state effects, inapplicable-flag refusal), parameters.test.ts (required/choices/hidden/staged/contradictions/shared), install-targets and side-by-side owners, bun run check EXIT 0 on 2026-09-14.

Review integration gate: bun run check passed after help routing, contract metadata and type-narrowing fixes. TASK-208.01 is included. Tests derive behavior from the runtime contracts rather than freezing full help prose.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CLI help is now generated by Commander from the authoritative contracts and command table: usage, arguments, options with placeholders/defaults/choices/requirements, namespace child listings, per-command shared options, examples and root conventions. Shared option applicability is declared per command and inapplicable flags are refused; help resolves first at every depth without touching services, input or state. Handwritten usage grammars and table prose were removed; staged browser commands carry real public metadata. Verified with registry-driven help tests, focused parameter tests, the CLI/system owners and a passing bun run check.

Review corrected help precedence and topic resolution, positional help values, bare-default options, installer choices and inapplicable shared options. The full normal gate passed.
<!-- SECTION:FINAL_SUMMARY:END -->
