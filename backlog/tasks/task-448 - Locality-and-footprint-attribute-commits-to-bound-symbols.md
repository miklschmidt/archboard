---
id: TASK-448
title: Locality and footprint attribute commits to bound symbols
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 20:16'
updated_date: '2026-10-07 21:37'
labels: []
dependencies: []
type: enhancement
ordinal: 799000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Platform Test Cluster version 20 binds six Terraform resources under infra/iac/azure. Locality assigns each 39 commits and footprint assigns each 41 commits because both use paths alone. Evidence checkout: /home/msc/Work/Docs-Architecture-Design/repos/Platform at af3964727cd52a8d929bab0995ef480aa0e307dd, origin/main d016664420a3b22e801589df6944f5c67bf1e1c3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both commands attribute symbol bindings to declaration changes without counting unrelated resources in shared files or directories.
- [x] #2 Terraform root paths and qualified module addresses resolve nested local modules and shared definitions, including deletions and renames.
- [x] #3 Bindings without symbols retain path attribution; unsupported or unresolved symbols label path-wide fallback.
- [x] #4 Locality coupling and footprint use consistent attribution and retain their existing large-commit policies.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update Archboard server@TASK-448 to show history attribution through code facts.
2. Reuse code-facts adapters over historical Git bytes. Compare bound declarations before and after each non-merge commit, following file renames and local Terraform module addresses.
3. Share attribution between locality and footprint, label fallback, and use declaration overlap for coupling. Preserve existing large-commit filtering.
4. Add focused behavior tests and exercise the supplied Platform checkout. Update ADR 0045 and consumer guidance. Run the complete gate, simplify, commit code, and close the board proposal.

5. Closing inspection also found command responsibilities that need the new precision wording. Command interface@TASK-448 updates Locality and Footprint without changing their interfaces.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The supplied Platform checkout resolves all six Terraform bindings precisely. Locality counts: Application Gateway 3, Platform DNS 2, MSP DNS 1, Portalv2 DNS 1, and both load-balancer rules 0. The shared code-facts source reader also passes declaration-isolation tests for TypeScript, Python, C#, C, and Swift. Git source comparisons preserve deletions, file renames, shared nested modules, and large-commit policies.

Closing evidence: Archboard server@TASK-448 introduces no code-check findings relative to current. Footprint against 2578bbf49 lists History lens and Code facts as namedAndChanged, with no changedNotNamed or namedNotChanged parts. Declaration identity follows Git file renames, not inferred symbol renames. README source checks report existing stale assets; the affected git-history clip is queued for refresh.

The complete bun run check gate passed. Consumer skill and install-target tests passed: 242 tests. Eleven focused symbol-history tests passed. Both requested commands passed through a temporary server and again through the restarted server at 127.0.0.1:3100, against board version 20 and the supplied Platform HEAD. The regenerated README git-history demonstration passed its scenario and its footprint screenshot was inspected. Its local attachment is not published. The simplification pass kept one shared mapper and reused existing adapters and module resolution. Board persistence remains accurate: its History lens part describes historical board decoding, which this task does not change.

Command interface closing: no new code-check findings. Footprint against 2578bbf49 names Locality and Footprint as changed; the Commands container is changedNotNamed because those implementation files sit inside it, while its responsibility and interface stay accurate. Both TASK-448 proposals are adopted. Plain dogfood check reports no diagnostics. Existing code-check findings elsewhere remain unchanged.

Pre-push code review found edge cases in declaration line precision, historical parser context, and mixed attribution after large-commit filtering. Reviewers are fixing these within the original acceptance criteria before push.

Pre-push review fixes are committed through 8125a9c94. They add exact declaration ranges, preserve C/Objective-C/Nix parser context, separate mixed-language directory bindings, follow active filenames through renames, and filter locality precision before coupling. Unsupported directory text must contain the complete requested symbol before it can trigger fallback. An isolated checkout pinned to af396472 reproduces counts 3/2/1/1/0/0, all with symbol attribution. The user checkout advanced independently and remains unchanged. Existing architecture relationships remain accurate because these fixes stay inside history attribution and code facts.

Final pre-push validation: the startup-signal owner passes in isolation and the complete bun run check gate passes on rerun. Skill and install-target tests pass: 242 tests. The README history demonstration regenerated successfully. Standards review fixed a duplicated clipboard protocol type and failure cleanup in the pending export test. Spec review fixes cover attribution precision, parser context, rename traversal, mixed-language roots, size filtering, and output wording. No unresolved review findings remain.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Locality and footprint now share declaration attribution across the existing language adapters, with Terraform module resolution and explicit fallback. The supplied six resources now receive distinct histories. Full gate, focused tests, skill installation tests, and live server commands pass.
<!-- SECTION:FINAL_SUMMARY:END -->
