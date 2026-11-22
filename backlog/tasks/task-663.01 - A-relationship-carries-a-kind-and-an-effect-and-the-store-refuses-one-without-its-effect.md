---
id: TASK-663.01
title: >-
  A relationship carries a kind and an effect, and the store refuses one without
  its effect
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T03:46:00Z'
labels: []
dependencies: []
parent_task_id: TASK-663
ordinal: 1145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The vocabulary and the store side of TASK-663. Kinds (how it travels): call (in-process), http, rpc, event, queue, stream, spawn, render, storage (direct store access, replacing data), dependency, other (labelled). Effect (what it does): mutation, query, compute; only dependency may omit it, and an omitted effect means a declared requirement only. Built-in kinds sit under a vault's own, and a vault's own kind must name its color. Lines' dash leaves the kind policy (it follows the effect). Lenses are configured in the vault: a defaultLens and lenses with one show or hide list of selectors naming a kind, an effect, or both. Module files move to a new format; a live vault in the old format opens read-only with one diagnostic naming the upgrade; retained history stays exact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A relationship without an effect is refused on write, except a dependency, with an error naming the relationship and the field
- [ ] #2 The built-in kinds are the eleven listed, data is gone, and a vault kind without a color is refused at its configuration path
- [ ] #3 A live vault in the old format opens read-only with one diagnostic naming the upgrade, and every write to it is refused
- [ ] #4 Retained checkpoints read exactly as stored, with their own policy
- [ ] #5 Lens configuration (defaultLens, lenses with show or hide selectors) validates, and a selector naming an unknown kind or effect is reported at its path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Vocabulary: an effect enum (mutation, query, compute); the eleven built-in kinds (data becomes storage) as defaults a vault's own entries sit over by id; a kind the vault adds must name its color; dash leaves the authored kind policy (the resolved look keeps it only for the old format).
2. Lenses in the vault policy: defaultLens and lenses with one show or hide list of selectors (kind, effect or both); built-in lenses as data; validated against the effective kinds, each refusal at its path; all is reserved.
3. Formats: module files move to schemaVersion 2, whose relationships state an effect unless the kind is dependency; schemaVersion 1 and the old config decode exactly as before (legacy decoder).
4. Store: decodeModel reads either format; a live old-format vault reads with one UPGRADE_REQUIRED diagnostic (readOnly) and every edit intent is refused with it; retained checkpoints decode with their own policy and modules; writers write schemaVersion 2; init writes only what a vault owns.
5. Comparison counts an effect as changed only when both sides state one.
6. Fixtures: tests that write get new-format fixtures; examples and this repository's vault stay old; exact historical fixtures stay exact.
7. Gates: types, lint:all, format, test:modules, test:repository, test:system, test:solo.
<!-- SECTION:PLAN:END -->
