---
id: TASK-650
title: A repository sets the level of each module-depth rule
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T13:43:00Z'
updated_date: '2026-11-19T13:56:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646
priority: high
type: feature
ordinal: 1110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

TASK-646 (#135, #139) makes `archboard check` report seven module-depth findings, and most are warnings, so every Archboard user's CI starts failing on upgrade with no way to opt out except the check Action's `allow-codes`. The owner wants "lint rules" in the same stack, before it merges, so a repository decides which of these findings warn and which fail the check. Two advisors (Astra and Fable) converged on the design below over two rounds (2026-11-19).

## Design

```yaml
# .archboard/vault/.archboard/config.yaml
codeCheck:
  rules:
    EXPOSED_VALUE: information
    CODE_PASS_THROUGH: "off"
```

- `codeCheck.rules` in the vault policy (packages/model/src/shared/schemas/semantic-policy.ts, beside `failShallowModules`). Keys: only the seven depth codes (EXPOSED_VALUE, EXPOSED_VALUE_COMPUTED, CODE_PASS_THROUGH, REEXPORT_PASS_THROUGH, EXPOSED_UNUSED, INTERFACE_UNDECLARED, MODULE_SHALLOW). Values: `information` (caps the severity) or `off` (removes the finding). A code with no entry keeps the built-in, evidence-dependent severity. A rule only lowers: no `warning` value, because an incomplete read lowers a finding to information and must never become a warning (ADR 0082).
- Strict: an unknown code or value is an invalid configuration (a semantic diagnostic that fails the check and names the entry), never a silent pass.
- Applied once per model reading in the code-check answer, after MODULE_SHALLOW is derived from the full export evidence, so turning one rule off never changes which modules are shallow, and the CLI, the server memory, Measures and the Action all agree. Severities still never depend on the caller: the rules belong to the vault.
- `off` removes the finding from findings, counts, Measures and annotations. The answer's `models[]` entry names the codes that are off, and the CLI prints one line, for example `code check: off by vault policy: CODE_PASS_THROUGH`.
- `failShallowModules` stays the only promotion. An explicit `rules.MODULE_SHALLOW` together with `failShallowModules: true` is an invalid configuration, and together with `--fail-shallow-modules` a refusal; both name the conflict.
- The check Action's `fail-on` and `allow-codes` stay unchanged. This repository keeps every default (no `rules`).

## Rejected

Per-path or per-module scope (the model's `external` mark covers code a repository does not own), a `warning` value, wildcards, new CLI flags or Action inputs, and changing defaults.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The vault policy accepts `codeCheck.rules` with the seven depth codes as keys and `information` or `off` as values, and refuses any other key or value with a diagnostic that names it
- [x] #2 A rule set to `information` makes that code information in the code-check answer, with a message that says the vault policy set it; a rule set to `off` removes it, and the answer names the codes that are off
- [x] #3 MODULE_SHALLOW is derived before rules apply: turning an export rule off does not change which modules are shallow
- [x] #4 The CLI, the remembered findings that Measures reads, and the check Action report the same severities for the same pass, and the CLI prints one line naming the codes that are off
- [x] #5 `rules.MODULE_SHALLOW` together with `failShallowModules: true` is an invalid configuration, and together with `--fail-shallow-modules` a refusal, each naming the conflict
- [x] #6 The site gate page and pull-request page, the check help and schema descriptions, the archboard skill, CONTEXT.md and ADR 0082 describe the rules, with the YAML example, and say that upgrading without rules adopts the new default warnings
- [x] #7 Tests: the policy schema cases, the pure rule application (lower, off, untouched, roll-up unchanged), and one CLI exit case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Policy: codeCheck.rules (partial record of the seven depth codes to information|off) beside failShallowModules (now optional) in semantic-policy.ts; a refinement makes rules.MODULE_SHALLOW with failShallowModules: true invalid, so the existing INVALID_CONFIG diagnostic names the entry. Test: readVaultConfiguration cases.
2. Pure rule application in code-intel module-depth (depth-rules.ts): information caps and says the vault policy set it, off removes, other codes untouched. Unit test.
3. run.ts answerOf applies each reading's rules to its findings after the pass (MODULE_SHALLOW already derived), and models[] carries the reading's rules. Integration test in module-depth.test.ts: off EXPOSED_VALUE keeps Timing shallow.
4. CLI: codeCheckLines prints 'code check: off by vault policy: ...'; gateShallowModules refuses --fail-shallow-modules beside rules.MODULE_SHALLOW (new refusal). CLI exit test.
5. Docs: gate.mdx, pull-requests.mdx, check help, schema meta, archboard skill + design-lens, CONTEXT.md, ADR 0082 entry. Run the gate commands.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: packages/model/tests/runtime/store/configuration.test.ts (AC1, AC5 config half: INVALID_CONFIG with path codeCheck.rules.<CODE>; an unknown key now ends the diagnostic path for every strict object). packages/code-intel/tests/runtime/code-check/operations/depth-rules.test.ts (AC2, AC7 pure: lower with policy message, off, untouched). module-depth.test.ts 'the vault's rules lower or remove...' (AC2 models[].rules, AC3: EXPOSED_VALUE off keeps Timing MODULE_SHALLOW); verified it fails with the rules unwired. AC4: rules apply once in run.ts answerOf, which the server memory and the CLI JSON (read by the Action) take as is; check-parts.test.ts prints one off line and refuses the flag beside rules.MODULE_SHALLOW with exit 2 (SHALLOW_RULE_CONFLICT). AC6: gate.mdx, pull-requests.mdx, check code help Rules section, schema meta, SKILL.md, design-lens.md, CONTEXT.md (Module-depth rule), ADR 0082 decision entry. Gates: bun run build, types, lint:all, format:check, test:modules (5307 pass), test:repository (174), test:system (227), check-model exit 0, site reference + build pass. vault.ts was at its 600-line limit, so the code check's refusals moved to commands/vault/protocol/code-check-refusals.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A vault policy now sets the level of each module-depth code: codeCheck.rules maps the seven depth codes to information (caps the level and says the vault policy set it) or off (removes the findings). The schema refuses any other code or level, and a MODULE_SHALLOW rule beside failShallowModules: true, as INVALID_CONFIG naming the entry. The code-check run applies each reading's rules after MODULE_SHALLOW is derived, so roll-ups are unchanged, and models[].rules carries them, so the CLI, Measures memory and the Action see one answer. The CLI prints 'code check: off by vault policy: ...' and refuses --fail-shallow-modules beside a MODULE_SHALLOW rule (SHALLOW_RULE_CONFLICT, exit 2). Docs say upgrading without rules adopts the new warnings and show the YAML. This repository adds no rules. Risk: a rule set to information on a finding already at information leaves its message unchanged (only a lowered finding says the policy set it).
<!-- SECTION:FINAL_SUMMARY:END -->
