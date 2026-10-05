# Agent workbench

The agent's surfaces in the shell. They all read one `AgentView` and act through one
`AgentActions` (`contracts.ts`). The application composes both from the workbench owners.
The owners are `src/ui/workbench-runtime`, `-thread`, `-composer`, `-queue`, `-approvals`
and `-transport`, and `src/ui/voice-session`. This module draws them.

- `components/AgentDock.tsx`: the dock at the foot of the navigator. While voice is off it
  is calm: what the agent is on, its plan under it, and at the foot a key to talk and a key
  to the conversation. While voice is on, the voice circle is the head of the dock, with the
  state, the voice's own line, mute and subtitles. When the layout turns,
  `hooks/use-dock-motion.ts` plays every part from its old place to its new one.
- `components/AgentPanel.tsx`: the conversation beside the navigator. It opens on request
  only. It holds the assistant-ui thread (`src/ui/workbench-thread`). Before anybody signs
  in, it holds the sign-in instead. On request it shows the session's details. At its foot
  are `PendingWork`, which shows what the conversation does not hold yet, and `ApprovalCard`,
  which shows the decisions the agent waits on. `VoiceLines` shows what was said aloud, and
  `AgentComposer` is the composer.
- `components/VoiceBox.tsx`: the voice over a pane's picture. While the person wants
  subtitles, the voice has no circle in the dock. The box carries the orb, the words, mute
  and the subtitles control.
- `components/TalkControl.tsx`: the one key of a fullscreen presentation's bar, Talk and then
  End voice.

`index.tsx` exports `AgentDock`, `AgentPanel`, `TalkControl`, `VoiceBox`,
`VoiceSurfaceProvider`, `useVoiceSurface`, `agentStatus` and `createDraftStore`.

Type roles come from the theme's `text-technical`, `text-body`, `text-control` and
`text-title` utilities. The registry's `cn` treats an unknown `text-*` utility as a colour.
So never put a role and a text colour in one `cn` call, or in one `className` handed to a
shared component. Put both on a plain `className` string, or put the role on an inner element.

## Roots

- `index.tsx`: the exports above.
- `contracts.ts`: `AgentView`, `AgentActions`, `AgentContext`, `AgentVoiceView`, `VoiceStage`,
  `VoiceLevel`, `ApprovalChoice`, `DynamicApprovalVerdict` and `WorkbenchQueueActions`.
- `approval-projection.ts`: a pure projection of approvals into cards, owned by the tests
  under `tests/`.
- `lib/agent-status.ts`: the agent's state in one line, from the first rule that applies.
- `lib/plan-steps.ts`: the steps of the plan the dock lists, each done, now or next.
- `lib/draft-store.ts`: the composer's draft, kept outside the composer so that it survives
  the dock or the panel drawing again, and so that a suggestion can be put in it.

## Composer intent

The composer sends with Enter. While a turn runs, Enter steers it and Ctrl or Cmd with Enter
queues the message to run after it. Shift with Enter starts a new line. The logic is in
`src/ui/workbench-composer`. The composer says which board the agent will read, from
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
is a source, not a value. The voice orb (`src/ui/voice-orb`) reads it on every frame, and
`hooks/use-audible.ts` reads only whether it is over the speaking level.

`components/VoiceControl.tsx` is the one button for the voice in the dock. While voice is
off, it is a key that says Talk. While the orb is at home, it is the voice circle. While the
voice box has the orb, it is a key that says End voice. It is one element in every form, so
the keyboard keeps its place on it. `TalkControl` does the same for the presentation bar. A
key that cannot act says so with `aria-disabled` and stays focusable. A disabled button drops
the keyboard's place.

The voice box is drawn deep inside a pane. So the application offers the voice and its
actions through `VoiceSurfaceProvider`. The box reads them with `useVoiceSurface` where it
is drawn.
