# Agent workbench

The agent's surfaces in the shell. They all read one `AgentView` and act through one
`AgentActions` (`state/surfaces/contracts.ts`). The application composes both from the workbench
owners. The thread link, composer, queue, approvals and transport come from
`@archboard/codex-realtime-voice/controllers`. The runtime and the voice session
(`state/voice-session`) are in `packages/workbench/src/ui`. The components under
`components/dock`, `components/panel` and `components/voice` draw them.

- `components/dock/AgentDock.tsx`: the dock at the foot of the navigator. While voice is off it
  is calm: what the agent is on, its plan under it, and at the foot a key to talk and a key
  to the conversation. While voice is on, the voice circle is the head of the dock, with the
  state, the voice's own line, mute and subtitles. When the layout turns,
  `hooks/dock/use-dock-motion.ts` plays every part from its old place to its new one.
- `components/panel/AgentPanel.tsx`: the conversation beside the navigator. It opens on request
  only. It holds the assistant-ui thread (`packages/workbench/src/ui/components/thread`), which shows the
  workhorse's turns and, marked as its own, the voice coordinator's. Before anybody signs
  in, it holds the sign-in instead. On request it shows the session's details. At its foot
  are `PendingWork`, which shows what the conversation does not hold yet, and `ApprovalCard`,
  which shows the decisions the agent waits on. `VoiceLines` shows what was said aloud, and
  `AgentComposer` is the composer.
- `components/voice/VoiceBox.tsx`: the voice over a pane's picture. While the person wants
  subtitles, the voice has no circle in the dock. The box carries the orb, the words, mute
  and the subtitles control. A rendered recording draws the same box at the foot of its
  walkthrough box (`src/ui/walkthrough-replay`).
- `components/voice/TalkControl.tsx`: the one key of a fullscreen presentation's bar, Talk and then
  End voice.

The application reaches them through `@archboard/workbench/agent` (`AgentDock`, `AgentPanel`,
the view and the actions, and `createDraftStore`) and `@archboard/workbench/voice` (`VoiceBox`,
`TalkControl`, `VoiceSurfaceProvider`, `useVoiceSurface`, `useCircleState` and the voice view).

Type roles come from the theme's `text-technical`, `text-body`, `text-control` and
`text-title` utilities. The registry's `cn` treats an unknown `text-*` utility as a colour.
So never put a role and a text colour in one `cn` call, or in one `className` handed to a
shared component. Put both on a plain `className` string, or put the role on an inner element.

## Roots

- `state/surfaces/contracts.ts`: `AgentView`, `AgentActions`, `AgentVoiceView`, `VoiceStage`,
  `VoiceLevel`, `ApprovalChoice`, `DynamicApprovalVerdict` and `WorkbenchQueueActions`.
- `rules/dock/approval-projection.ts`: a pure projection of approvals into cards, owned by
  its tests.
- `rules/dock/agent-status.ts`: the agent's state in one line, from the first rule that applies.
- `rules/dock/plan-steps.ts`: the steps of the plan the dock lists, each done, now or next.
- `state/surfaces/draft-store.ts`: the composer's draft, kept outside the composer so that it survives
  the conversation drawing again, and so that a suggestion can be put in it.

## Composer intent

The composer sends with Enter. While a turn runs, Enter steers it and Ctrl or Cmd with Enter
queues the message to run after it. Shift with Enter starts a new line. The logic is in
`packages/workbench/src/ui/rules/composer`. The composer says which board the agent will read, from
`AgentView.context`.

## Approvals

`projectApproval` turns each approval into a card: its family, its request details (mono for
commands, paths and identifiers), the decisions the model defines, and a phase. The phases
are pending, busy (the approval's key is in `AgentView.busyApprovals`), settled, outcome
unknown, and closed (expired, cancelled or stale). The words for the phase come with it.
`spokenApprovalLine` is the one line the conversation shows for an approval the voice can
answer.

## Voice

`AgentVoiceView` carries four things: the voice's stage, the reason voice cannot start or
failed, whether a control is on the wire, and the model's measured output `level`. The level
is a source, not a value. The voice orb (`components/orb`, `state/orb`) reads it on every frame, and
`hooks/voice/use-audible.ts` reads only whether it is over the speaking level.

`components/voice/VoiceControl.tsx` is the one button for the voice in the dock. While voice is
off, it is a key that says Talk. While the orb is at home, it is the voice circle. While the
voice box has the orb, it is a key that says End voice. It is one element in every form, so
the keyboard keeps its place on it. `TalkControl` does the same for the presentation bar. A
key that cannot act says so with `aria-disabled` and stays focusable. A disabled button drops
the keyboard's place.

The voice box is drawn deep inside a pane. So the application offers the voice and its
actions through `VoiceSurfaceProvider`. The box reads them with `useVoiceSurface` where it
is drawn.
