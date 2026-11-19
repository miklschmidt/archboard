---
id: TASK-650
title: A repository sets the level of each module-depth rule
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T13:43:00Z'
updated_date: '2026-11-19T13:46:00Z'
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
- [ ] #1 The vault policy accepts `codeCheck.rules` with the seven depth codes as keys and `information` or `off` as values, and refuses any other key or value with a diagnostic that names it
- [ ] #2 A rule set to `information` makes that code information in the code-check answer, with a message that says the vault policy set it; a rule set to `off` removes it, and the answer names the codes that are off
- [ ] #3 MODULE_SHALLOW is derived before rules apply: turning an export rule off does not change which modules are shallow
- [ ] #4 The CLI, the remembered findings that Measures reads, and the check Action report the same severities for the same pass, and the CLI prints one line naming the codes that are off
- [ ] #5 `rules.MODULE_SHALLOW` together with `failShallowModules: true` is an invalid configuration, and together with `--fail-shallow-modules` a refusal, each naming the conflict
- [ ] #6 The site gate page and pull-request page, the check help and schema descriptions, the archboard skill, CONTEXT.md and ADR 0082 describe the rules, with the YAML example, and say that upgrading without rules adopts the new default warnings
- [ ] #7 Tests: the policy schema cases, the pure rule application (lower, off, untouched, roll-up unchanged), and one CLI exit case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Policy: codeCheck.rules (partial record of the seven depth codes to information|off) beside failShallowModules (now optional) in semantic-policy.ts; a refinement makes rules.MODULE_SHALLOW with failShallowModules: true invalid, so the existing INVALID_CONFIG diagnostic names the entry. Test: readVaultConfiguration cases.
2. Pure rule application in code-intel module-depth (depth-rules.ts): information caps and says the vault policy set it, off removes, other codes untouched. Unit test.
3. run.ts answerOf applies each reading's rules to its findings after the pass (MODULE_SHALLOW already derived), and models[] carries the reading's rules. Integration test in module-depth.test.ts: off EXPOSED_VALUE keeps Timing shallow.
4. CLI: codeCheckLines prints 'code check: off by vault policy: ...'; gateShallowModules refuses --fail-shallow-modules beside rules.MODULE_SHALLOW (new refusal). CLI exit test.
5. Docs: gate.mdx, pull-requests.mdx, check help, schema meta, archboard skill + design-lens, CONTEXT.md, ADR 0082 entry. Run the gate commands.
<!-- SECTION:PLAN:END -->
