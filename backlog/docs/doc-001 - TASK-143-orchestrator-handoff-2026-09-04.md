---
id: doc-001
title: TASK-143 orchestrator handoff 2026-09-04
type: other
created_date: '2026-09-04 11:40'
updated_date: '2026-09-04 11:40'
---
# TASK-143 orchestration handoff (2026-09-04)

Written for the next orchestrator taking over the archboard TASK-143 tree. Repo: `/home/msc/Projects/archboard`. Integration branch: `codex/task-143-144-workbench`. Head at handoff: `d947d412`.

## Goal

All of TASK-143 and TASK-144 Done and integrated on `codex/task-143-144-workbench`. TASK-144 was already Done at session start. Every remaining leaf goes through: Opus implementer in its own worktree → independent Opus reviewer (read-only, fixed range) → fix loop until CLEAN → implementer finalizes in Backlog (AC checks, notes, final summary, Done) → orchestrator fast-forwards the branch. Never hand-edit `backlog/`; use the `backlog` CLI in the worktree.

## Done this session (all Done in Backlog and fast-forwarded)

| Task | What changed | Notes for successors |
|---|---|---|
| 143.01.10 gateway | Readiness derived from live owners (was hardcoded to 4/11 arms); queue cache thread-bound; sequenced-delivery owner; bounded reasons | |
| 143.01.14 composition root | Generation-owner leak fixed; vestigial hot-reload retained-state machinery deleted (ADR 0021); dynamic waits aborted on child exit; shutdownEpoch routed through terminal path | "survives reload" AC clauses recorded as vacuous under ADR 0021 |
| 143.01 milestone | Verified against all 21 children; module/repository/system lanes green | |
| 143.03.01 transport | Approval schema used inert-context literals (rejected every snapshot with an approval); stale delta stopped the transport; approval/queue retargeting; envelope moved to `src/shared/codex-browser-gateway`; queueAdd requires a captured target (`link_required`) | |
| DOM test stack | happy-dom 20.14.0 + @testing-library pinned; opt-in via module root `src/ui/dom-testing` (`registerHappyDom`, `await loadRenderedUiTools()`, `afterAll(unregisterHappyDom)`); never import @testing-library/* statically | Documented in `docs/agents/test-suite.md` "Rendered UI owners" |
| 143.03.03 thread-link UI | `src/ui/workbench-thread-link`; plus the four-layer wiring that was missing: `threadCandidates` snapshot field + `threadLinkRefresh` command + `selectionId` on attach/relink (shared model), delta key (gateway envelope), projection with 40-record bound, canvas inventory + bind through `bindCandidate`; fixed `attachRecord` staging `kind:"attached"` vs manifest `"thread_link"` (foreign attach was impossible) via exported `EPOCH_THREAD_ATTACH_OPERATION`; `threadLinkRefresh` added to transport `THREAD_LINK_COMMANDS` | Inventory is gateway-global by design |
| 143.03.06 queue UI | `src/ui/workbench-queue`; gateway now carries per-entry `operationId` (recovered from `clientUserMessageId` through the identity authority) and derives region status; browser `snapshot` request re-reads the queue (coalesced, floored by `CODEX_QUEUE_REREAD_FLOOR_MS`); hand-rolled DOM replaced by the shared stack | |
| 143.03.07 approvals UI | `src/ui/workbench-approvals`; seven ordinary families + three dynamic effects; fixtures parsed through the closed model; mounted owner for focus return; oxlint now accepts `.tsx` test owners under `src/ui/` only | |
| 143.04.01 voice-session adapter | `src/ui/voice-session`; `BrowserWorkbenchMediaOwner` gained `subscribe` (inner realtime publications were being swallowed); level meter split off the status view (`useVoiceLevel`); `captureCommandTarget` removed from the adapter port (it mutated a lease inside a read) | Pane guarantee rests on one voice session per pane; no runtime check remains |
| 143.03.05 composer | `src/ui/workbench-composer`; only assistant-ui import is `ComposerPrimitive` (Root only: 0.15.17's Input/Send cannot steer a running turn and `Queue` is policy-forbidden, so Archboard owns the text buffer, keys, IME, draft, pending, dispatch); server fixes: timeline projection now keeps the NEWEST turns under budget (it was dropping the in-progress turn) and `turn/start` gained the same authoritative in-progress guard as steer | The executable composer requires an `AssistantRuntimeProvider` ancestor (documented on the props); Safari IME compositionend-before-Enter recorded as out of scope |
| 143.04.02 voice controls | `src/ui/voice-controls`; real mute path added as serialized sibling edits: `RealtimeMediaSession.mute()/unmute()` toggle the sender's local audio track `enabled` (no host or protocol change), `BrowserWorkbenchMediaOwner` forwards, `VoiceSession` gains mute/unmute under the busy discipline; `controlFailure` on a live run is tagged with the realtime state and cleared when the run moves | `setMuted` never rejects; the live-run controlFailure is owned by a thrown stop, not a refused mute |

## Remaining scope (all To Do)

Dependency order, from `backlog task view <id> --plain`:

1. **143.03.10** frame (expanded/collapsed workbench, app-global request surface) — depends on 03.03/.04/.05/.06/.07/.08. All Done now. Design-heavy (reference mockup + `docs/design/archboard-ui-aesthetics.md`).
2. **143.03.11** shell integration (`src/ui/shell/Shell.tsx`, PresentationDock text source + Stop) — serialized shell edit.
3. **143.03.13** canonical text browser owner (`tests/system/browser/codex-text-workbench.test.ts`, first serialized browser-inventory edit; exact-version protocol fake so unrelated owners never spawn PATH Codex).
4. **143.04.03** voice-context, **143.04.04** voice-transcript, **143.04.05** voice-spoken-approval — independent of each other, depend on 04.01 (Done); 04.05 also on 03.07 (Done). Can run in parallel lanes.
5. **143.04.06** voice into the frame (extends `src/ui/workbench-frame` only) — after 03.10 and 04.02–.05.
6. **143.04.10** PresentationDock voice source + Stop in fullscreen — after 03.11 and 04.06.
7. **143.04.07** controlled live-voice browser owner (second/last inventory edit) — after 03.13 and 04.06.
8. **143.04.09** clean-process real-audio acceptance procedure doc (`docs/design/codex-workbench-voice-acceptance.md`) — needs a human with mic/speaker; deterministic owners must pass first.
9. Milestones **143.02** (blocked on 04.07 + 04.09 evidence for its AC #3), **143.03**, **143.04**, then root **143**. Finalize each with a verification-only agent like 143.01 was (run `bun run test:modules`, `test:repository`, `test:system`; build the frontend first or system owners fail on missing `dist/frontend`).

## Recorded follow-ups (in task notes; none blocks the tree)

- `manifest.ts` `created` ownership descriptors (create_thread/thread/start, fork_thread/thread/fork) are still literals duplicated in `codex-dynamic-tools/lib/mutations.ts`, `codex-workhorse-start/lib/model.ts`, `codex-workhorse-operations/lib/internal.ts`; export them like `EPOCH_THREAD_ATTACH_OPERATION`.
- Per-entry queue status: shared schema admits eleven values, the producer emits one (`queued`); consider narrowing the shared schema.
- Queue ownership ledger is per host-process lifetime; after a canvas restart prior Archboard entries read as foreign (fails safe).
- Inventory retirement propagates on the next publication, not as a push.
- Pre-existing failure in an opt-in owner: `tests/system/repository-policy/test-wall-clock-preload.test.ts` (excluded from `bun run check`; not touched).

## Mechanics that worked

- Lanes: `/home/msc/.claude-worktrees/archboard/lane-{a,b,c,d}` (node_modules copied from the main checkout; run `bun install` after a rebase that changes package.json) and `/home/msc/.codex/worktrees/04fd/archboard`. Detach or re-branch them from the branch head per task: `git checkout -b codex/task-143-XX-YY codex/task-143-144-workbench`.
- Integration is always `git rebase codex/task-143-144-workbench` in the lane, a quick type-check/lint/focused-test sanity run, then `git merge --ff-only` in `/home/msc/Projects/archboard`.
- Reviewer briefs that worked: fixed range, read-only, "verified findings only", per-AC evidence naming test files, exact command counts, and one or two pointed questions where the implementer's report was thin. Round two exists for a reason — three of the leaves had blockers only visible once the reviewer ran the real producer instead of the fake.
- Milestone AC #3 of 143.03 serializes root-dependency, module, shell, and browser-inventory edits. The pattern this session: leaves own their serialized shared/server edit when a completed task explicitly deferred it to them (143.01.09 → 143.03.03), otherwise the orchestrator lands it separately (DOM stack).
- Rate limit: the session limit killed all running agents twice (resets were 08:30 and 16:20 Copenhagen). Resume each agent with `SendMessage` naming the uncommitted state in its lane; they pick up from their transcripts. `/low-priority` mode let work continue between resets.
- Orphaned Sept-1 attempts at 03.03/.06/.07 are pinned as `codex/orphan-143-03-{approvals,queue,thread-link}-2026-09-01`; they were superseded and can be deleted.
- Untracked `src-DlBR1tzg.js` in the main checkout is a "protected artifact" from an earlier Codex session; leave it.

## Full gate at handoff head d947d412

`bun run check` equivalent, run on 2026-09-04 in lane-d at d947d412: lint, fmt:check, type-check, and frontend build passed; `test:modules` 2376 pass / 0 fail (255 files); `test:system` 324 pass / 0 fail (83 files); `test:repository` 123 pass / 0 fail (18 files); `test:serial-browser` every owner in the inventory passed, 0 fail. Run it again before declaring the tree done; the serial browser lane needs `agent-browser` on PATH and the whole chain takes well over the 10-minute tool timeout, so run it detached (`setsid nohup … &`) and watch the log.
