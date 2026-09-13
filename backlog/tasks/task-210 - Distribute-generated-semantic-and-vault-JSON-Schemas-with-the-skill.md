---
id: TASK-210
title: Distribute generated semantic and vault JSON Schemas with the skill
status: To Do
assignee: []
created_date: '2026-09-13 23:14'
updated_date: '2026-09-13 23:33'
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
- [ ] #1 The full semantic board document JSON Schema and actual vault configuration JSON Schema are reproducibly generated from their canonical Zod schemas, including the configured validator icon contract, with no handwritten duplicate schema definitions.
- [ ] #2 Both schemas have stable, directly linkable locations accessible to an agent using the installed skill as well as the source checkout. Normal installation/distribution supplies current generated artifacts without requiring consumers to discover a generation command.
- [ ] #3 Schema references identify their format/version and purpose, distinguish persisted semantic documents from CLI authoring inputs, and clearly identify runtime semantic validation that JSON Schema cannot express.
- [ ] #4 Vault guidance points to the config schema and INSTALL.md as authoritative installation/setup documentation; document links remain usable after the skill is installed outside the source checkout.
- [ ] #5 Runtime validation exercises representative valid and invalid inputs at the schema boundary, with no static file-content or policy tests. Generated artifacts are ignored, generation is documented, and relevant normal checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Start gate: TASK-207 and TASK-208 must both be Done before implementation begins. TASK-210 may then run in parallel with TASK-209; TASK-211 waits for this distribution contract and the evaluation harness. Do not add a new CLI command or schema authoring API.

1. Re-read the final SemanticBoardSchema exported by src/shared/semantic-board/index.ts, SemanticBoardConfigurationSchema exported by src/runtime/semantic-board-store/index.ts, semantic config --schema in src/cli/commands/vault.ts, and skill install/sync paths. Use the actual runtime configuration schema: it specializes createSemanticPolicySchema with an enum derived from installed RemixIcon exports; the looser transport policy schema is not the validator contract. Include TASK-207's final groups representation and current board schema version.
2. Add one reproducible generator using the existing Zod z.toJSONSchema facility through public module entrypoints. Emit the complete persisted board-family and vault configuration schemas with explicit JSON Schema dialect, stable document identity and format/version/purpose metadata. Keep validation definitions in Zod; avoid handwritten schema copies, permissive conversion fallbacks or a second icon list. Identify refinements/integrity checks that cannot be expressed in JSON Schema and document them as runtime obligations.
3. Reserve portable relative artifact paths within the skill package, proposed as references/generated/semantic-board.schema.json and references/generated/vault-config.schema.json. Generate them for source-checkout use and install/sync output through the same preparation function. Add focused ignore rules; track only generation code and authored metadata. Generation is deterministic and leaves no tracked output drift; imported generator modules must have no startup/file-write side effects.
4. Wire preparation into the existing install-skill staging flow and scripts/sync-skills.ts, and the normal build/setup path used by a clean checkout, so normal distribution supplies current schemas without a consumer generation step. Reuse one artifact preparation owner behind a module interface; do not make scripts import private implementation or tests. Generate/validate staged assets before replacing a working install, and keep --print-source and help read-only. Do not introduce product CLI behavior beyond supplying installation artifacts.
5. Provide a generated portable copy of canonical INSTALL.md alongside the schemas (proposed references/generated/INSTALL.md), preserving or resolving any relative links to the corresponding canonical material. Source and installed skill links use the same relative paths; the copy is derived, ignored and carries source revision information rather than becoming a second authored installation manual. Add concise schema guidance distinguishing persisted documents from semantic new/edit authoring payloads, explaining runtime reference/cycle checks, and pointing vault setup to INSTALL.md and the actual config schema.
6. Verify generated schemas at runtime using representative valid and invalid board/config objects, including groups and real versus nonexistent RemixIcon names, defaults, strict unknown fields and nested variants/views/flows/walkthroughs. Validate the expressible boundary against canonical Zod behavior; explicitly retain existing runtime owners for non-expressible semantic integrity. Inspect existing validator dependencies before choosing a validator; if an additional maintained JSON Schema validator is needed, request the dependency rather than hand-writing one.
7. Extend the existing install-target product owner in tests/system/cli/install-targets.test.ts with an outside-checkout installation that consumes the generated schemas to validate actual inputs. Exercise a clean install/update and a preparation failure preserving the previous usable install. Manually follow installed documentation/schema links from the isolated destination. Do not assert file prose, snapshots, schema text or repository policy; test delivered runtime contracts.
8. Update minimal canonical skill links/setup guidance and document the developer generation command; leave the broad workflow rewrite to TASK-211. Coordinate output paths and package revision with TASK-209 so both comparison arms use the same supporting CLI/schema distribution. Run skill sync, focused runtime/install checks and bun run check; reassess whether any separate generation paths or copied schema metadata can be removed.
<!-- SECTION:PLAN:END -->
