# TASK-150 quarantine and deferred behavior record

BASE: `0d1706d06b21df1c72910a640dadad35cd37234a`. Quarantine is an execution phase, not passing product verification.

The local ignored `legacy/` tree is a byte-preserving reference snapshot. It is never staged, committed, imported, built or served. Another checkout can recover the original files from BASE with `git archive 0d1706d06b21df1c72910a640dadad35cd37234a src/ui frontend/main.tsx frontend/index.html | tar -x -C legacy` after creating the ignored directory. Mixed-owner originals can be recovered from the same BASE by their paths below.

The former `frontend/main.tsx` and `frontend/index.html` are removed. The full build/browser gate intentionally remains unmet until reconstruction; Vite still names the required main entry and will fail while it is missing. No runnable legacy route, substitute UI, no-op product composition or changed browser inventory was introduced. `frontend/renderer.html` and server rendering remain active.

## Retained dependency inventory

- `src/ui/board-preview/index.ts` and its focused test remain for the independently useful Chromium/emulation renderer probes. Its imports reach only `canvas/elements.ts`, `types/index.ts` and vendor types.
- `src/ui/canvas/changes.ts` remains for `tests/system/label-geometry/support/label-cycle.ts` and the existing label-human-round-trip owner.
- `src/ui/canvas/elements.ts` remains for preview conversion/guards, with `src/ui/types/index.ts` as its type-only closure. No hooks, JSX or mounted session composition is retained.
- Official font binaries, licenses, provenance and wordmark remain at `src/ui/shell/assets/`; asset hash and deterministic wordmark owners remain active.
- The two renderer probes, label round-trip owner, backend/runtime/shared source, browser inventory and browser support remain active and strict. There is no early port from the archive.

The coordinator approved these existing mixed-use dependencies in TASK-150.01.01 notes. Every retained file receives the full applicable policy. TASK-150.01.02 repairs it.

## Retired module dispositions

All paths below are original BASE paths. Required logic is restored under strict checks in TASK-150.07; fresh presentation is built in TASK-150.02–05; rendered/accessibility verification belongs to TASK-150.06. No archived test counts as passing. Implementation-only assertions identified below are retired, not rewritten to dictate new markup.

| Module                          | Protected behavior and disposition                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/button`                 | Official accessible button semantics, variants, disabled state and target sizing; old wrapper/selector assertions obsolete.                                                       |
| `src/ui/canvas`                 | Board adoption, delta baselines, held edits, retries, reporting deadlines, pane registration and workbench publication; every synchronization/recovery behavior remains required. |
| `src/ui/code-target`            | Binding-derived target activation and selection; preserve portable binding authority and opening outcomes.                                                                        |
| `src/ui/codex-realtime`         | Media/session lifecycle, mute, adversarial shutdown and neutral host contract; no second realtime backend.                                                                        |
| `src/ui/codex-workbench-media`  | Browser media acquisition, mute, cleanup and session ownership.                                                                                                                   |
| `src/ui/dialog`                 | Focus/keyboard/portal and dismissal behavior; old Modal/control structure obsolete.                                                                                               |
| `src/ui/dom-testing`            | Per-owner DOM registration, accessible mounting/input and cleanup; the old button dependency is obsolete; restore a focused harness owner if the new UI uses this harness.        |
| `src/ui/opener-settings`        | Local opener selection, saving and recovery.                                                                                                                                      |
| `src/ui/path-focus`             | Connected-path projection and noncanonical overlays.                                                                                                                              |
| `src/ui/selection-inspector`    | Selected element metadata/binding projection and actions.                                                                                                                         |
| `src/ui/shell`                  | Independent panes, board navigation/open/new/save/clear/install, fullscreen transfer/stop/recovery, external-change recovery and workbench visibility.                            |
| `src/ui/theme`                  | Approved font/color roles and accessible states remain; legacy token aliases, curated utilities and shell bridge are obsolete.                                                    |
| `src/ui/ui-classnames`          | Official class merging needed by new components; legacy-only merge extensions and old token restrictions are obsolete.                                                            |
| `src/ui/voice-context`          | Exact canonical brief display/copy, history identity, provenance, freshness and truncation.                                                                                       |
| `src/ui/voice-controls`         | Accessible start/mute/unmute/stop/restart and lifecycle states; old input level meter is retired in favor of model-output LiveKit wave.                                           |
| `src/ui/voice-session`          | Availability, source binding, notifications, session/mute lifecycle and recovery.                                                                                                 |
| `src/ui/voice-spoken-approval`  | Ordinary card and spoken approval consistency, unknown outcomes, eligibility and accessible state.                                                                                |
| `src/ui/voice-transcript`       | Identity-preserving transcript projection, accessible live updates, rendered empty/partial/terminal states.                                                                       |
| `src/ui/workbench-approvals`    | Approval families, forms, dispatch, focus, queue/terminal lifecycle and unknown-outcome recovery.                                                                                 |
| `src/ui/workbench-board-status` | Canonical board connection and persistence state.                                                                                                                                 |
| `src/ui/workbench-composer`     | Send/steer and explicit queue intent, drafts, keys, command preparation and mounted behavior; custom composer layout is not authority for assistant-ui.                           |
| `src/ui/workbench-coordinator`  | Separate coordinator settings, authority and disclosure.                                                                                                                          |
| `src/ui/workbench-frame`        | Workbench layout/settings/queue and voice composition; old JSX/selector arrangement is obsolete.                                                                                  |
| `src/ui/workbench-queue`        | Queue order, actions, projection, mounted controls and pending/recovery state.                                                                                                    |
| `src/ui/workbench-runtime`      | External-store adapter, mounted runtime/timeline, transcript identity and one authoritative Codex runtime.                                                                        |
| `src/ui/workbench-thread-link`  | Explicit account/thread selection, candidate/readiness/recovery/controller behavior and transport integration.                                                                    |
| `src/ui/workbench-timeline`     | Timeline normalization, identity, content/details rendering and accessible messages.                                                                                              |
| `src/ui/workbench-transport`    | One socket reducer, capabilities, lease identity, command targeting/preparation, dynamic approvals and publication.                                                               |

## Mixed owners outside UI

| Owner                                                                    | Retained versus deferred                                                                                                                                                                                                                                                                                             | Restoration owner         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `tests/system/canvas-state/codex-workbench-application-sockets.test.ts`  | First two real socket replacement/failed replacement cases remain. Only “the production canvas socket composes one transport reducer with media behavior” and its UI-only adapter are archived: registration-gated attachment, one reducer/media owner, matching readiness and no redundant connect remain required. | TASK-150.07               |
| `tests/system/canvas-state/spoken-approval-terminal-projection.test.ts`  | Broker settlement and server/browser model unknown-outcome assertions remain active. Approval card/spoken UI assertions are archived: unknown stays unknown, resolver_lost remains visible, visual card survives, spoken eligibility is false.                                                                       | TASK-150.07               |
| `tests/system/canvas-state/voice-context-producer-contract.test.ts`      | Entire UI-dependent case archived. Its sole observable contract is fresh semantic bytes staying identical in stored capture, display and copy with all identity/provenance/freshness fields. No independent backend assertion was removed; publisher behavior has its runtime owner.                                 | TASK-150.07               |
| `tests/system/repository-policy/codex-realtime-neutral-contract.test.ts` | Canonical brand owner and forbidden runtime-to-UI dependency assertions remain. Only old UI re-export spelling assertion is deferred; new adapter must derive the neutral host types.                                                                                                                                | TASK-150.07               |
| `tests/system/repository-policy/brand-typography.test.ts`                | Exact font/license/provenance, deterministic path-only mark and Remix checks remain. The shell CSS loading/rendered wordmark assertions are deferred. Exact legacy token/geometry/bridge assertions are obsolete.                                                                                                    | TASK-150.02 / TASK-150.06 |

## Browser decisions

- `fixed-point-document.test.ts`: retained unchanged, including behavioral fixed-point assertions and its current source-text regex. The coordinator approved retaining it; the regex must not constrain strict repairs or new UI and is reassessed case by case in TASK-150.06 if needed. Its dependency is independently retained for renderer probes.
- `codex-live-voice.test.ts`: only hardware wording and `flipDock` → `scaledDock` changed with coordinator approval. 1920×1080/DPR2, source identity, viewport, Stop, target/focus/live-region/reduced-motion/forced-colors behavior remains.
- No browser owner was deleted, excluded, replaced or executed. Existing runSelection execution/cleanup awaits have only the three approved statement-level no-await-in-loop comments; unrelated awaits remain diagnostics.

## Archived UI owner dispositions

Paths are relative to `src/ui/`. Each required owner restores the module contract described above in TASK-150.07; rendered/interaction evidence is executed in TASK-150.06. Old selectors, JSX geometry and token spelling are never restoration requirements. The raw case/import extraction is reproducible from BASE, so it is not tracked; this execution saved it at `/tmp/task-150-work/retired.json` and `/tmp/task-150-work/raw-import-case-inventory.md`.

- `button/tests/button-types.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `button/tests/button.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `canvas/tests/canvas-deadlines.test.ts`: Required contract; restore in TASK-150.07.
- `canvas/tests/change-reporting-acknowledgement.test.ts`: Required contract; restore in TASK-150.07.
- `canvas/tests/change-reporting-holds-and-adoption.test.ts`: Required contract; restore in TASK-150.07.
- `canvas/tests/change-reporting-scheduling.test.ts`: Required contract; restore in TASK-150.07.
- `canvas/tests/change-reporting-state.test.ts`: Required contract; restore in TASK-150.07.
- `canvas/tests/pane-report-sequencing.test.ts`: Required contract; restore in TASK-150.07.
- `canvas/tests/workbench-socket.test.ts`: Required contract; restore in TASK-150.07.
- `canvas/tests/workbench-transport-publication.test.tsx`: Required contract; restore in TASK-150.07.
- `code-target/tests/link-handler.test.ts`: Required contract; restore in TASK-150.07.
- `codex-realtime/tests/contract.test.ts`: Required contract; restore in TASK-150.07.
- `codex-realtime/tests/media-session-adversarial.test.ts`: Required contract; restore in TASK-150.07.
- `codex-realtime/tests/media-session-mute.test.ts`: Required contract; restore in TASK-150.07.
- `codex-realtime/tests/media-session.test.ts`: Required contract; restore in TASK-150.07.
- `codex-realtime/tests/public-api.test.ts`: Required contract; restore in TASK-150.07.
- `codex-workbench-media/tests/media-owner-mute.test.ts`: Required contract; restore in TASK-150.07.
- `codex-workbench-media/tests/media-owner.test.ts`: Required contract; restore in TASK-150.07.
- `dialog/tests/dialog-types.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `dialog/tests/dialog.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `dom-testing/tests/mounted-button.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `opener-settings/tests/opener-settings.test.ts`: Required contract; restore in TASK-150.07.
- `path-focus/tests/projection.test.ts`: Required contract; restore in TASK-150.07.
- `selection-inspector/tests/projection.test.ts`: Required contract; restore in TASK-150.07.
- `shell/tests/board-bar.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `shell/tests/board-dialog.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `shell/tests/codex-voice-presentation.test.tsx`: Required contract; restore in TASK-150.07.
- `shell/tests/codex-workbench-integration.test.tsx`: Required contract; restore in TASK-150.07.
- `shell/tests/fullscreen-presentation.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `theme/tests/zero-spacing.test.ts`: Old token/utility/merge-extension assertions obsolete; approved theme/class-merging checks belong to TASK-150.02 and TASK-150.06.
- `ui-classnames/tests/ui-classnames.test.ts`: Old token/utility/merge-extension assertions obsolete; approved theme/class-merging checks belong to TASK-150.02 and TASK-150.06.
- `voice-context/tests/browser-evidence.test.ts`: Required contract; restore in TASK-150.07.
- `voice-context/tests/history.test.ts`: Required contract; restore in TASK-150.07.
- `voice-context/tests/panel.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `voice-context/tests/projection.test.ts`: Required contract; restore in TASK-150.07.
- `voice-controls/tests/appearance.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `voice-controls/tests/boundaries.test.ts`: Required contract; restore in TASK-150.07.
- `voice-controls/tests/commands.test.ts`: Required contract; restore in TASK-150.07.
- `voice-controls/tests/state-rendering.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `voice-session/tests/adapter-boundaries.test.ts`: Required contract; restore in TASK-150.07.
- `voice-session/tests/availability-mapping.test.ts`: Required contract; restore in TASK-150.07.
- `voice-session/tests/notification-lifecycle.test.ts`: Required contract; restore in TASK-150.07.
- `voice-session/tests/projection-mapping.test.ts`: Required contract; restore in TASK-150.07.
- `voice-session/tests/session-lifecycle.test.ts`: Required contract; restore in TASK-150.07.
- `voice-session/tests/voice-mute.test.ts`: Required contract; restore in TASK-150.07.
- `voice-spoken-approval/tests/boundaries.test.ts`: Required contract; restore in TASK-150.07.
- `voice-spoken-approval/tests/frame-composition.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `voice-spoken-approval/tests/mounted.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `voice-spoken-approval/tests/projection.test.ts`: Required contract; restore in TASK-150.07.
- `voice-spoken-approval/tests/surface.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `voice-transcript/tests/boundaries.test.ts`: Required contract; restore in TASK-150.07.
- `voice-transcript/tests/mounted-transcript.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `voice-transcript/tests/projection.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-approvals/tests/approval-dispatch.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-approvals/tests/approval-forms.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-approvals/tests/approval-lifecycle.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-approvals/tests/approval-surface.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-approvals/tests/mounted-approvals.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-board-status/tests/workbench-board-status.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-composer/tests/controller.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-composer/tests/intent.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-composer/tests/keys.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-composer/tests/mounted-composer.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-coordinator/tests/workbench-coordinator.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-frame/tests/frame-layout.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-frame/tests/frame-settings-and-queue.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-frame/tests/voice-composition.test.tsx`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-queue/tests/actions.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-queue/tests/mounted-queue.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-queue/tests/projection.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-queue/tests/reorder.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-runtime/tests/mounted-runtime.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-runtime/tests/mounted-timeline.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-runtime/tests/runtime.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-thread-link/tests/account.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-thread-link/tests/candidates.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-thread-link/tests/controller.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-thread-link/tests/recovery.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-thread-link/tests/rendered.test.ts`: Required interaction/accessibility contract; restore in TASK-150.07, verify in TASK-150.06.
- `workbench-thread-link/tests/transport-integration.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-timeline/tests/timeline.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-transport/tests/capabilities.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-transport/tests/command-targeting.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-transport/tests/dynamic-approval.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-transport/tests/lease-identity.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-transport/tests/prepared-commands.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-transport/tests/shared-socket.test.ts`: Required contract; restore in TASK-150.07.
- `workbench-transport/tests/stream-reduction.test.ts`: Required contract; restore in TASK-150.07.

## Reading-only evidence

The three `docs/design/vendor` reading copies were byte-preservingly renamed to `.ts.txt` / `.tsx.txt` with coordinator approval. Their upstream provenance remains in the reference documents; they were explicitly never executable, compiled or imported. No active source received an extension disguise.

## Discovery and enforcement

Bun's explicit directory selectors can also suffix-match archived owners. `bunfig.toml` therefore ignores only the inert archive; package test commands that override that setting repeat the exact archive directory exclusion. Normal browser/opt-in lane ownership is unchanged. The inventory checks continue rejecting missing/overlapping active owners. Oxlint checks active source references and Vite denies archive file serving while preserving upstream secret-file denials. TypeScript excludes the archive, and repository policy rejects both committed and staged archive entries.

Dedicated-display setup was withdrawn by the user. FLIP_WHITEBOARD.md and its installation listing were deleted, and current guidance/comments no longer require that hardware. Generic desktop, pointer, accessibility and existing scaled-desktop coverage remain; this does not introduce a replacement hardware gate.
