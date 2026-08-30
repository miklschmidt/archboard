---
id: TASK-143.01.12
title: Ignore derived Codex protocol bindings
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 18:37'
labels: []
dependencies: []
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - .gitignore
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 239000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one ignore rule for derived exact-version Codex protocol bindings in `.gitignore`. Canonical authored inputs and the reviewed schema hash remain tracked; regenerated TypeScript does not.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact src/runtime/codex-protocol/generated/ path is ignored without broad generated, src, runtime, or TypeScript patterns.
- [ ] #2 git check-ignore and git status fixtures prove regenerated bindings stay untracked while module source, authored fixtures/instructions, and schema hash remain trackable.
- [ ] #3 The rule introduces no committed placeholder or generated artifact and is in place before TASK-143.01.03 protocol generation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one root-relative ignore rule for src/runtime/codex-protocol/generated/ beside the existing narrowly scoped generated-artifact rules; do not add broad generated, src, runtime, or TypeScript patterns.
2. Validate the pattern with git check-ignore and status-oriented probes for a generated binding plus representative module, authored fixture/instruction, and schema-hash paths, confirming only the derived subtree is ignored.
3. Record the validation evidence in implementation notes, run git diff --check, and commit only .gitignore plus this leaf task record.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added the exact root-relative src/runtime/codex-protocol/generated/ ignore rule; no broad generated, src, runtime, or TypeScript pattern was added.

Validation: git check-ignore -v --no-index returned exit 0 for generated/protocol.ts and generated/nested/events.ts, and exit 1 for neighboring decoder.ts, fixtures/thread-start.json, instructions.md, schema.sha256, and src/runtime/codex-protocol-generated/protocol.ts. A disposable /tmp Git status fixture returned !! for the generated binding and ?? for decoder.ts, fixtures/thread-start.json, and schema.sha256. git diff --check exited 0. The disposable fixture was removed and no generated artifact or placeholder was added to the checkout.
<!-- SECTION:NOTES:END -->
