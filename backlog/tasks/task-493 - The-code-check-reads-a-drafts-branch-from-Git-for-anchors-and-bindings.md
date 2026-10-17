---
id: TASK-493
title: The code check reads a draft's branch from Git for anchors and bindings
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-17 10:53'
updated_date: '2026-10-17 11:12'
labels:
  - code-check
dependencies: []
type: bug
ordinal: 858000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check --code skips every anchor and binding whose binding names a branch that is not checked out (ref-not-checked-out). A pull-request stack binds each layer's parts to its own branch, so on 2026-10-17 a --every-draft run skipped 1796 subjects on Device Trust Control Plane, 367 on Platform Test Cluster and 139 on Endpoint Gateway: the check said nothing about almost every part it was asked about. TASK-488 already reads a branch from Git without a checkout for the dropped-part check (sourceAt in src/runtime/history-lens/lib/source-history.ts). skills/archboard/references/variants.md says 'It reads that branch from Git and does not check it out', which reads as if it covers every check, and it does not. Reported by the agent fixing the device-trust pull-request bodies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Anchors and bindings whose binding names a branch or commit the checkout can resolve are checked against that ref's code read from Git, without a checkout and without changing the working tree
- [ ] #2 ref-not-checked-out is reported only for a ref the checkout cannot resolve, and the skip names the ref
- [ ] #3 A test shows a broken anchor on a branch that is not checked out is reported, and a sound one is not
- [ ] #4 check --code --every-draft on Device Trust Control Plane in Docs-Architecture-Design (read-only) skips no subject whose branch exists in the Platform checkout; the before and after skip counts are recorded
- [ ] #5 The skill text says which checks read a branch from Git, and says it correctly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ref-code.ts: read the code of each ref a binding names that its checkout lacks out, once per pass, with sourceAt (no checkout); a tree with root and files, and its facts. An unresolvable ref stays ref-not-checked-out and the skip names it. 2. The seam: the checkout a claim or part reads (checkoutFor, locate) and the path it resolves (a target in the tree, for boundTarget, judgeAnchor, locateTarget, boundFiles); facts reads route by tree, so anchors, bound paths, bound symbols, evidence, relationships and interfaces read the same code for a part. 3. Language servers run on disk files: a use in a ref tree stays as code facts read it, said once per repo and ref as skip ref-without-language-server. 4. Per-repository groupings key by tree; a relationship whose ends are read from different code is skipped as refs-differ. 5. Tests in tests/ref-code.test.ts. 6. Skill text and generate:skill-artifacts. 7. AC4 on a scratch vault, before and after.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 implementation. Seam: src/runtime/code-check/lib/ref-code.ts. Before judging, readRefCodes reads, once per pass, each (repo, ref) that a binding or anchor names and its checkout lacks out, with sourceAt (no checkout): a tree with its own root (checkout root + ref, no directory on disk) and its own facts pass. The pass's facts are routed by checkout root (routedFacts), targets in a tree come from its file list (targetIn replaces resolveLocalCodeTarget in check.ts, part-code.ts, support.ts), and every per-repository grouping of the evidence passes keys by checkout root, not repo name, so two refs of one repository are never pooled. So anchors, bound paths, bound symbols, evidence, relationships and module interfaces read the same code for a part. Language servers read files on disk: a use in a tree is not asked, stays as code facts read it, and is said once per repo and ref as ref-without-language-server. A relationship whose ends are one repository at different code (two refs, or a ref and the files on disk) is skipped as refs-differ, because evidence cannot join two trees. ref-not-checked-out remains only for a ref the checkout cannot resolve, with ref.named. Limits: sourceAt loads texts only for bound and anchored paths, Terraform files and the like, so a resolver config beside them (a tsconfig in another directory) is not read from a ref; the Swift manifest read in code-facts/swift-exposure.ts still reads Package.swift from disk; environment-join builders are keyed by repo. Footprint (coordinator addition): parts.ts partReading(content, snapshot, pinned) reads a part pinned to a ref its checkout lacks out, with ref on ReadPart; footprint.ts groups by repo and tip (head the caller named, else the part's pin, else HEAD); a pin no checkout resolves is skipped as head-unresolved naming the ref. Behind and locality still skip those parts. Additive in source-history.ts: none (uses commitOf from TASK-492 unchanged). AC4 on scratch copy of Device Trust Control Plane (Docs-Architecture-Design de2b187), worktree server, scratch registry: check --code --every-draft before: ref-not-checked-out 1796, text-only 1; findings ANCHOR_MISMATCH 1, EXPOSED_UNUSED 8, RELATIONSHIP_UNSUPPORTED 22. After: ref-not-checked-out 0, refs-differ 65, exposure-unknown 6 (the Rust library), ref-without-language-server 1, text-only 1; findings ANCHOR_MISMATCH 1, ANCHOR_PATH_MISSING 44 (anchored files that later branches of the stack build), EXPOSED_UNUSED 12, RELATIONSHIP_UNSUPPORTED 31. Footprint (--base origin/develop --against feat/device-trust-authorities --head <variant>) ref-not-checked-out skips before/after: contracts 9/0, enrollment 23/0, identity-lifecycle 32/0; parts changed 0/9, 3/26, 2/34. Tests: src/runtime/code-check/tests/ref-code.test.ts (5), footprint.test.ts (1 added).
<!-- SECTION:NOTES:END -->
