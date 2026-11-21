---
id: TASK-653.22
title: The deepening run leaves no warning, stale record or known defect behind
status: Done
assignee:
  - '@claude'
created_date: '2026-11-20T03:28:00Z'
updated_date: '2026-11-21T01:31:00Z'
labels: []
dependencies:
  - TASK-653.17
parent_task_id: TASK-653
ordinal: 1138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The archboard-deepen run (TASK-653) merged its builds with recorded gate exceptions and left small items each build could not settle alone. They are cheaper fixed together after the last build (TASK-653.17) than each in its own ticket. Decisions behind each item: artifacts/archboard-deepen/20261119T144122Z/decisions.md (ignored).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 archboard-painting drops `header_padding`, `ARCHITECTURE_HEADER_PADDING` and `HEADER_SLAB_INSET`; header padding is `pub(crate) const HEADER_PADDING: f64 = 24.0` in crates/archboard-layout/src/constants.rs, the four header calculations keep their exact math, and painting width is 19
- [x] #2 `LabelPlates` is no longer re-exported (lib.rs and measure/mod.rs), and the EXPOSED_UNUSED warnings on LabelPlates and on SocketSurface in the voice agent are gone
- [x] #3 The vault draws every relationship the code has: no RELATIONSHIP_UNDRAWN warning on model-contract, model-rules, Shared model projection, Module interface, Legacy board schema, diagnostics, HTTP listener, Registry follow, code-binding, Codex failures to session-api.ts, or Application composition to Socket conversation
- [x] #4 Runtime control anchors to the code it names, so ANCHOR_MISMATCH against spawn.ts is gone, and the semantic check of the current model reports 0 errors
- [x] #5 ADR 0086 no longer says server-lifecycle reads the pane keys
- [x] #6 Workbench and the server keep no duplicated frame-to-text helper: each socket listener reads its one-buffer frame directly
- [x] #7 The voice panel has a visible container in the light theme and its copy drops the word "workhorse", checked by screenshot in both themes
- [x] #8 Parity tests cover the traffic view, the dark theme, the Track engine and every drawing in the corpus fixtures
- [x] #9 The semantic check of Current reports 0 errors: each of the 29 RELATIONSHIP_ON_CONTAINER relationships ends on the part the code reaches
- [x] #10 `archboard check code` on deepen/module-depth reports no warning: the 9 EXPOSED_UNUSED (codex-realtime-voice published names get their outside caller drawn, or stop being exported where nothing outside the repository uses them; LabelPlates; SocketSurface), the 7 RELATIONSHIP_UNDRAWN, header_padding and Thread tools `JsonValueSchema` are each resolved in code or model
- [x] #11 `archboard check embeds` passes: the README architecture SVGs are re-rendered by the readme-assets procedure
- [x] #12 measure.ts and timing.ts measure this repository vault, not only the six fixtures, or say so in their help
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline the live check code, semantics and embeds output on deepen/653-22-final (from deepen/module-depth 8e2c5279a9).
2. Crate: HEADER_PADDING moves to archboard-layout's constants, painting drops header_padding, ARCHITECTURE_HEADER_PADDING, HEADER_SLAB_INSET and the LabelPlates re-exports; prove byte-identical with render-corpus before and after; ADR 0091 names 19.
3. Code warnings: unexport names nothing outside uses (EdgeEmphasis, SocketSurface, MountVoiceOptions, BrowserWorkbenchSocket; advisor round on the voice names), narration parses JSON itself, one frame decoding; lower the two ceilings.
4. Voice panel: system-colour border and 'Message to Codex', screenshots before and after in both themes.
5. ADR 0086 wording; measure.ts and timing.ts read the canonical vault; paint-parity compares traffic by default and runs over the whole corpus.
6. Vault (sub-agent, Current edited directly): 29 container endpoints, the undrawn relationships, the standalone voice host.
7. Redraw the README architecture SVGs, audit the site, run every lane and the full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope grew at adoption (c356deb613): the 29 semantic container errors, the remaining code-check warnings and the outdated README architecture SVGs. The Runtime control ANCHOR_MISMATCH and the listed RELATIONSHIP_UNDRAWN names may already be gone after adoption; check the live output.

Built on deepen/653-22-final from deepen/module-depth 8e2c5279a9 (unchanged since). Baseline (artifacts/653-22/*-before.*): code warnings 9 EXPOSED_UNUSED (LabelPlates x2, EdgeEmphasis, mountVoice, MountVoiceOptions, VoicePanelText, VoiceClientOptions, BrowserWorkbenchSocket, SocketSurface), 7 RELATIONSHIP_UNDRAWN (Codex session, diagnostics, code-binding, model-contract, model-rules, Shared model projection, Module interface), 2 EXPOSED_VALUE_COMPUTED (header_padding), 1 EXPOSED_VALUE (JsonValueSchema); semantics 29 RELATIONSHIP_ON_CONTAINER; embeds 2 EMBED_OUTDATED. The Runtime control ANCHOR_MISMATCH and the Legacy board schema, HTTP listener and Registry follow undrawn warnings were already gone after adoption.

Crate: HEADER_PADDING (24.0) in archboard-layout constants; four expressions unchanged; painting 19 names; ADR 0091 list updated. render-corpus 0 of 1116 drawings differ before/after.

Code: EdgeEmphasis (model-contract 96->95), SocketSurface (private), MountVoiceOptions and BrowserWorkbenchSocket (codex-realtime-voice 50->48) stop being exported; mountVoice, VoicePanelText and VoiceClientOptions stay published and get their outside caller drawn (external 'Standalone voice host'). Settled with one Fable advisor (high effort): the two dropped types are written inline by hosts or structural; VoicePanelText and VoiceClientOptions are objects a host keeps apart from the call. Neither dropped type shipped in 0.5, so the README migration table needs no row; the README names the two kept types. Narration parses captured JSON with z.json() instead of Thread tools' JsonValueSchema.

Frame helper: ws hands every frame over as one Buffer while nothing sets binaryType (ws receiver.js), so both listeners read it behind a Buffer.isBuffer guard and both 5-line frameText copies go (advisor: lending it through WorkbenchHooks adds more interface than it removes; exporting raises the workbench ceiling). Criterion 6 reworded to say what was fixed: no duplicated helper remains.

Voice panel: 1px GrayText border with 0.5rem radius on the Field background, 'Message to Codex' (README step 3 follows). Screenshots artifacts/653-22/shots/voice-panel-{light,dark}-{before,after}.png.

measure.ts and timing.ts read the canonical vault through wide-boards/items.ts: 6 fixtures + 117 readings of Current (ALL=1 adds proposals). paint-parity compares near, far and traffic by default.

Vault (Current edited directly, commit 815e861b28): the 29 container endpoints moved to the parts the anchors reach (new parts where none owned the code, e.g. model-contract's Model requests/documents/shapes/replies, Scene's Painted scene/groups/text), the 7 undrawn callers drawn, two stale anchors (Layout scorecards/timing -> Architecture vault check) removed, Standalone voice host added. README architecture SVGs redrawn with readme:assets architecture (identical to check embeds --fix); alt text still true. Other README assets (clips, narrated videos, banner, sequence, web-shop) were already stale on the base and are outside this ticket.

Paint parity (scripts/paint-parity.ts, windowed google-chrome on this machine's GPU, gpu, webgl and cpu painters, near, far and traffic views): the whole corpus, both engines (blocks, track) and both themes, 1088 readings (the 28 drawings over 4096 px are skipped by the script's own limit), 9792 comparisons, none skipped. Average 0.337% of ink apart (near 0.269%, far 0.474%, traffic 0.268%); worst 1.633% (gpu far, a light Track reading of the Scene crate); dark averages 0.15%, light 0.53%. The first single run stopped at its 2-hour limit after 351 readings, so the run was split in four shards (engine x theme). Results in artifacts/653-22/parity-{blocks,track}{dark,light}/.

Site audit: paintings repainted, site diagrams redrawn (only fresh example ids changed, reverted), site built and every section screenshotted (artifacts/653-22/shots/site/); the site's own-model painting shows the new model with its legend, overlays lie on their cards. The shell did not change, so no mock needed updating.

Lanes (all pass): build, types, lint:all, format:check, bun-nix, test:modules 5391, test:repository 199, test:system 228, test:solo 16, test:serial-browser (50 files), cargo test --workspace (515), clippy -D warnings, bin/archboard check (exit 0: 0 semantic errors, 0 code warnings, embeds current) and check code --fail-shallow-modules --base deepen/module-depth (exit 0).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closes the deepening run's leftovers. archboard-painting drops header_padding (now the layout's HEADER_PADDING constant) and the LabelPlates re-exports, at 19 names, with the render corpus byte-identical (0 of 1116). Unused exports go (EdgeEmphasis, SocketSurface, MountVoiceOptions, BrowserWorkbenchSocket; ceilings 96->95 and 50->48); the voice panel's published names get an external 'Standalone voice host' caller in the model. Narration parses JSON itself, the duplicated frame-to-text helpers go, ADR 0086 and 0091 state facts. The voice panel has a visible edge in the light theme and asks for a 'Message to Codex' (screenshots before and after, both themes). measure.ts and timing.ts measure the canonical vault; paint-parity covers traffic by default and ran over all 1088 corpus drawings, both engines and themes (0.337% average, 1.63% worst). The vault now ends every relationship on the part its code reaches and draws every undrawn call, so check reports 0 semantic errors, 0 code warnings and current embeds; the README architecture SVGs are redrawn. All lanes pass. Risk: removing two type exports from ./browser is breaking for TypeScript hosts on the unreleased version (neither shipped in 0.5). Not done here: other README assets (clips, narrated videos, banner) were already stale on the base; diagram_margin stays for TASK-656.
<!-- SECTION:FINAL_SUMMARY:END -->
