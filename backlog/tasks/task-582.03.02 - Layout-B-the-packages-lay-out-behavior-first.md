---
id: TASK-582.03.02
title: 'Layout B: the packages lay out behavior first'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T19:06:00Z'
updated_date: '2026-11-06T20:22:00Z'
labels: []
dependencies:
  - TASK-582.03.01
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1030000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The packages hold 50 of the 83 containment warnings: codex-app-server, walkthrough, workbench, skills, model, renderer and codex-realtime-voice, and the Rust crates. Plan: doc-003, steps B1 to B7, with the owner decisions at its top (voice: cut the model; crates: one root module per crate beside the packages).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check reports no containment warning for any module of those packages or crates
- [ ] #2 Each Rust crate is a root module bound to its crate directory, with no container around the crates
- [ ] #3 Each step is its own commit that leaves bun run check green and archboard check at the warning count the plan names
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
B1 to B4 (this run), one commit each, in doc-003 section 3 order:
1. Manifest: scripts/move-source.ts plan <package> --overrides <the doc-003 section 2 overrides>, reviewed against the verdicts and the import graph. Tests mirror their source.
2. Model corrections that the verdicts name, as their own claimed model edit intent before the move.
3. apply the manifest (git mv, rewrites, restart, one claimed rebind intent). Then one claimed intent binds each container to its behavior folder where the codemod does not.
4. Remove the package's trees from ROLE_FIRST_TREES.
5. Verify: bunx vp run types; archboard check warnings 81/78/73/68 with only CONTAINER_UNBOUND/CONTAINER_PARTS_OUTSIDE; git grep for the old prefixes outside backlog, docs/design, docs/adr and proposals; bun run check (remaining lanes one by one when it stops early); git show -M40% --stat.
B5 to B7 follow in a later run.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
B1 codex-app-server (2d131626b). Manifest: doc-003's file overrides (codex-app-server is flat, so the default move changes nothing): 6 session services, 3 response-identity operations, storage-proof and 2 session schemas -> runtime/session/<role>/; runtime/clients (10) and 8 operations -> runtime/transport/<role>/. Tests mirror their source (file-level override keys do not mirror .test.ts names, so 7 test files are named explicitly). Import scan matched the verdict: the 8 transport operations are reached only from clients/transport.ts and each other; the response-identity operations and storage-proof only from services/session.ts. 46 moves, 52 rewritten files, 0 layout problems. No model correction named for this package. Vault: codemod rebind (86 statements) then one claimed intent binds Codex session to runtime/session and Codex transport to runtime/transport. vite.config.ts test:macos named tests/runtime/store, whose files part: added tests/runtime/session/store beside it. crates/archboard-scene/tests/fixtures/codex-session.paint.json (a recorded paint request of this vault's Codex session) named the old binding paths: rewritten through the manifest; cargo test -p archboard-scene -p archboard-paint pass, core rebuilt. Ratchet: no codex-app-server tree was listed (flat trees already conform). Evidence: archboard check 81 warnings (38 CONTAINER_PARTS_OUTSIDE, 43 CONTAINER_UNBOUND, no other warning code); git grep for the old prefixes outside backlog, docs/design, docs/adr and proposals: nothing; bunx vp run types pass; bun run check 21/21 (repository 170/16 files, modules 4909/742, system 234/64, solo 15/2, browser 49/49).

B2 walkthrough (e9fd94622). Manifest: prefix overrides runtime/{operations,clients,store} and services/recording-tools.ts -> runtime/recorder/<role>/; runtime/processes and services/ffmpeg.ts -> runtime/video-encoding/<role>/; tests mirror (ffmpeg.test.ts named explicitly). Import scan: video-encoder and ffmpeg are reached from render-talk and recording-tools; everything else of the recorder from record-walkthrough, render-talk and api/recorder. 16 moves, 13 rewritten files (test-suite.md names the new test folders). No model correction named. Vault: codemod rebind (51 statements: 10 edit-module, 27 edit-relationship, 14 edit-step), then one claimed intent binds Walkthrough video to runtime, both Walkthrough recorder modules (XppR9owz#XAJYaUnv and SMjRfwN3#ZAj4RMzN) to runtime/recorder, Video encoding and Video encoder to runtime/video-encoding. Ratchet: no walkthrough tree was listed. Evidence: archboard check 78 warnings (37 CONTAINER_PARTS_OUTSIDE, 41 CONTAINER_UNBOUND, no other warning code); git grep for the old prefixes: nothing; types pass; bun run check 21/21 (repository 170/16, modules 4909/742, system 234/64, solo 15/2, browser 49/49).
Found, not changed (the plan rebinds both, and a merge is outside this step): two pairs of modules describe the same code. Walkthrough recorder XppR9owz#XAJYaUnv (a root part of walkthrough, a leaf with three incoming relationships, one from Recording entry inside the other recorder) and Walkthrough recorder SMjRfwN3#ZAj4RMzN (the container under Walkthrough video) both bound src/runtime and now runtime/recorder. Recorded talks vKEsyHFk#VgzgNAGW (datastore) and Talk files SMjRfwN3#XtzfRQkG (function) both bind recorder/store/talk-files.ts. Merging them retargets relationships off a leaf onto parts, because ZAj4RMzN has parts (RELATIONSHIP_ON_CONTAINER otherwise).

B3 workbench (488fcb466). Manifest: default move over the package plus doc-003's overrides (keys are paths after the default move): ui {dock,orb,panel,subtitles,thread,voice,surfaces} -> ui/workbench-client/<b>, ui runtime -> ui/workbench-client/assistant-runtime; server owner/services -> server/workbench-host/services; archboard-presentation.ts -> workbench-host/narration/services; walkthrough-narration.ts -> workbench-host/narration/projections; dynamic-tools/{mutation,projection} -> dynamic-tools/dispatch/<b>; wait.ts -> dynamic-tools/settlements/services; quarantine -> dynamic-tools/settlements/quarantine. Accepted the one proposal: rules/dynamic-tools/wait-validation.ts -> dynamic-tools/settlements/rules (its only importer is wait.ts). Tests mirror: the settlement tests and classification.test.ts (it tests authority/classification) named explicitly. 240 moves; the plan proposed the three split bindings doc-003 names (ui/components -> ui/workbench-client, operations/dynamic-tools -> dynamic-tools/dispatch, services/dynamic-tools -> dynamic-tools/settlements). Vault: the restart inside apply failed because two template-literal # specifiers of the instruction .txt files (instructions/rules/authored.ts and its profiles test) stayed on the old folder; after fixing them by hand, restart and rebind wrote 147 statements (30 edit-module, 78 edit-relationship, 39 edit-step); then one claimed intent binds Voice session to ui/voice-session, Archboard workbench host to server/workbench-host, Narration host to server/workbench-host/narration and Thread tool calls to runtime/dynamic-tools. Hand path rewrites the codemod reported or missed: site/src/scripts/voice-orb.ts relative imports, .github/workflows/site.yml path filters, site/README.md, site/DESIGN.md, apps/web app.css comment, the two moved READMEs (dock and thread), two renderer fixtures (rewritten through the manifest). .oxlintrc.jsonc: the codemod turned the four role-first subtitles globs into duplicates of workbench-client/subtitles/**; they are removed with the four role-first workbench fixtures of ui-lint-policy.test.ts, since doc-003 keeps both forms only until a package has moved. Ratchet: the six workbench trees removed. Left as found: mentions of ui/clients/output-level (walkthrough talk.ts) and ui/rules/composer (dock README) name folders that no layout holds. Codemod fix 2a0..., see TASK-582.03.01 note: template-literal aliases and relative imports outside a workspace now follow. Evidence: archboard check 73 warnings (34 CONTAINER_PARTS_OUTSIDE, 39 CONTAINER_UNBOUND, no other warning code); git grep for the old prefixes: nothing outside the exclusions except stale workbench paths in crates codex-session.paint.json that name no current file; types pass; bun run check 21/21 (repository 170/16, modules 4909/742, system 234/64, solo 15/2, browser 49/49). The first gate run failed ui-lint-policy.test.ts on the frame clock globs, fixed as above.

Correction to the B3 note: the codemod fix is 341d3c461.

B4 skills (0c617c351). Manifest: doc-003's placements (keys after the default move): batch/{operations batch,pin-versions; schemas suite; services citations}, run-world/{operations author,vault,install; processes archboard,server,flask,isolation}, run-checks/{operations captures,reaudit; audit; outcomes}, grading/{clients; operations; store grading-images}, reporting/{rules (the reports); store records}, all under runtime/evaluation; command.ts lands in evaluation/operations by the default move; operations/distribution and projections/schemas.ts -> runtime/distribution. Every other file goes to evaluation/<role>/ (doc-003: all code moves into evaluation); the plan then proposed four deeper places, accepted because each file's only source importers sit in one sub-behavior: protocol/claude-events.ts and protocol/grader-usage.ts -> grading/protocol, store/grading-session.ts -> grading/store, services/leakage.ts -> batch/services. Tests mirror (eight named explicitly). 84 moves, 82 rewritten files, 185 vault statements (24 edit-module, 57 edit-relationship, 104 edit-step). One claimed intent binds Skill evaluation to runtime/evaluation (doc-003's rebind, after the move because the folder did not exist before) and Batch and inputs, One run's world, Run checks, Grading and Reporting to their folders. Behavior kept: classify.ts DISTRIBUTION_PATH_RE exempted the distribution's code by its old folders; it now also names runtime/distribution, keeping the old folders for batches recorded before the move, and exposure-paths.test.ts covers both. boundaries.md: the skills section, and the package-relative mentions of codex-app-server, walkthrough and workbench that B1 to B3 left (no rewrite reaches a package-relative path), name the new folders. Ratchet: the two skills trees removed. Evidence: archboard check 68 warnings (34 CONTAINER_PARTS_OUTSIDE, 34 CONTAINER_UNBOUND, no other warning code); git grep for the old prefixes: nothing; types pass; bun run check 21/21 (repository 170/16, modules 4909/742, system 234/64, solo 15/2, browser 49/49). B5 to B7 follow.
<!-- SECTION:NOTES:END -->
