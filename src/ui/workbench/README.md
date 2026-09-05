# Agent workbench

The product composition of the dock: the official assistant-ui thread as the
primary area, a lifecycle strip above it, Archboard's intent controls beneath
it, and a dense side panel with voice, queue, approvals, captured context and
transcript. Every value shown comes in through `WorkbenchView`, grounded in
`src/shared/codex-browser-model`; every gesture goes out through
`WorkbenchActions`. The module keeps no session state, opens no socket and
runs no timer: the runtime adapter (`src/ui/workbench-runtime`, TASK-150.07)
owns the wire and must wrap `Workbench` in the assistant-ui runtime provider.

## Roots

- `index.tsx` — `Workbench`; re-exports the contract types.
- `header-controls.tsx` — `WorkbenchHeaderControls`: compact voice controls,
  the small output wave and the waiting-approval count, for the collapsed dock
  header and the fullscreen slot.
- `contracts.ts` — `WorkbenchView`, `WorkbenchActions`, `ApprovalChoice`,
  `ComposerIntent`, `DynamicApprovalVerdict` and the nested view/action shapes.
- `session-projection.ts`, `queue-projection.ts`, `approval-projection.ts` —
  pure projections of the snapshot, owned by the tests under `tests/`.

## Composer intent

The official composer's Send and Stop submit through the assistant-ui
runtime. `WorkbenchComposerView.intent` (`send` or `steer`, the latter only
while a turn is active) and `queueInstead` tell that runtime how to deliver
the text; the runtime reads them when `onNew` fires. The explicit Stop button
calls `actions.stopTurn` for the active turn read from the timeline.

## Approvals

`projectApproval` turns each `BrowserApproval` into a card: family, request
details in mono, the decisions the model defines (`availableDecisions` for
commands and file changes, one button per option for questions, approve and
decline for permissions, patches and exec, decline only for elicitations),
and a phase: pending, busy (its key is in `busyApprovals`), settled, outcome
unknown, or closed (expired, cancelled, stale). Dynamic coordination
approvals project the same way with approve/decline verdicts. The spoken
approval renders as one line above the cards; resolver-lost and stale states
are warnings.

## Voice

`WorkbenchVoiceView` carries the `VoiceControlsView` for
`src/ui/voice-controls` and the `{ state, level }` inputs for
`src/ui/voice-wave`. `copyVoiceContext` receives the canonical brief exactly
as stored; the panel never reformats it.
