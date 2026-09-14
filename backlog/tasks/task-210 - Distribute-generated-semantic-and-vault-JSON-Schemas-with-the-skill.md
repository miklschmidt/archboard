---
id: TASK-210
title: Distribute generated semantic and vault JSON Schemas with the skill
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 23:14'
updated_date: '2026-09-14 02:55'
labels: []
dependencies:
  - TASK-207
  - TASK-208
references:
  - src/shared/semantic-board/lib/aggregate.ts
  - src/runtime/semantic-board-store/lib/configuration.ts
  - src/cli/commands/vault.ts
  - src/cli/commands/install-skill.ts
  - INSTALL.md
type: feature
ordinal: 369000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents need directly accessible full JSON Schemas when authoring or configuring boards, without inspecting Zod source or discovering a schema command. The vault configuration already supports on-demand JSON Schema through semantic config --schema, but the full SemanticBoardSchema has no generated JSON Schema distribution. The installed skill is copied outside the checkout, so checkout-relative links alone are insufficient.

Zod remains canonical. The semantic document schema describes persisted board families; CLI authoring payloads are different contracts and documentation must distinguish them. JSON Schema does not replace semantic runtime checks such as reference integrity and acyclic relationships.

Deliver generation and portable access for the skill overhaul without expanding CLI behavior. Generated outputs are reproducible derived artifacts and should remain ignored; authored generation inputs and distribution wiring are tracked. Do not create a separate hosted documentation service. Reinspect current generation/install mechanisms when implementing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The full semantic board document JSON Schema and actual vault configuration JSON Schema are reproducibly generated from their canonical Zod schemas, including the configured validator icon contract, with no handwritten duplicate schema definitions.
- [x] #2 Both schemas have stable, directly linkable locations accessible to an agent using the installed skill as well as the source checkout. Normal installation/distribution supplies current generated artifacts without requiring consumers to discover a generation command.
- [x] #3 Schema references identify their format/version and purpose, distinguish persisted semantic documents from CLI authoring inputs, and clearly identify runtime semantic validation that JSON Schema cannot express.
- [x] #4 Vault guidance points to the config schema and INSTALL.md as authoritative installation/setup documentation; document links remain usable after the skill is installed outside the source checkout.
- [x] #5 Runtime validation exercises representative valid and invalid inputs at the schema boundary, with no static file-content or policy tests. Generated artifacts are ignored, generation is documented, and relevant normal checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make generated JSON Schema preserve canonical Zod constraints wherever Zod has an exportable built-in, deriving semantic-id validation from the shared ids authority.
2. Enumerate every remaining runtime-only/refinement obligation accurately for boards, configuration, and authoring payloads.
3. Strengthen focused artifact validation, including timestamp format support, mismatch regressions, and installed artifact usability.
4. Run only TASK-210 module/install tests and the relevant type/lint checks; do not run skill evals or the grader.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as src/runtime/skill-distribution: generatedSchemas() renders four draft 2020-12 documents from the Zod authorities (persisted board in output mode; vault config, semantic new payload without the name positional, semantic edit payload in input mode), each stamped with $id, title, description and x-archboard {semanticBoardSchemaVersion, runtimeObligations}. prepareSkillArtifacts() writes them plus a revision-stamped copy of INSTALL.md (relative links rewritten to absolute checkout paths) into <skill>/references/generated/, which is gitignored. scripts/sync-skills.ts prepares before copying; bun run generate:skill-artifacts writes them on demand; install-skill prepares the staging copy before the rename swap, so a preparation failure leaves the previously installed skill in place (guaranteed by ordering in installSkillFiles, not induced at the process boundary by a test). skills/archboard/references/schemas.md (tracked) documents the files, the authoring-versus-persisted distinction and the runtime obligations; SKILL.md and the archboard-dev skill link to it. ajv@8 added as a devDependency for schema validation in tests. Owners: src/runtime/skill-distribution/tests/artifacts.test.ts (Zod/JSON Schema agreement on accepted and refused payloads, metadata, determinism, INSTALL link rewrite) and tests/system/cli/install-targets.test.ts (an install carries and validates the generated files). bun run check EXIT 0.

Review fixes: generated schemas now retain block-id, nonblank/single-line text, unique-level, nonempty-kind-map and unique persisted-group constraints from their canonical Zod authorities. Runtime obligations now accurately allow inherited subject ids across variants and enumerate family ancestry, designation, reconciliation, per-variant reference and cross-field checks. Ajv tests register Zod's canonical date-time validator, cover valid cross-variant identity reuse and runtime-only cyclic ancestry, and keep schema semantics in the module owner while the install test owns compiled presence and link resolution. Generated INSTALL links use angle-bracket destinations for paths with spaces/parentheses and provenance labels a dirty source checkout. Focused artifact/install tests: 17 pass; targeted lint and diff checks pass. Full typecheck remains blocked by unrelated concurrent CLI/evaluation errors.

Review integration gate: bun run check passed with generated-schema constraints, accurate runtime obligations, installed-manual link/provenance corrections and warning-free schema validators. Canonical skills were formatted and synchronized before the final gate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Generated JSON Schemas for the persisted board, the vault configuration and the two authoring payloads, plus a portable INSTALL.md copy, are produced from the Zod authorities on every sync and install into the skill's references/generated/ directory, documented by references/schemas.md, with fast tests holding the schemas to what Zod accepts and refuses and a system owner checking an install carries them.

Review repaired expressible schema constraints, inherited identity and runtime-obligation guidance, and installed-manual links and provenance; the full normal gate passed.
<!-- SECTION:FINAL_SUMMARY:END -->
