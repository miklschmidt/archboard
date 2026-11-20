---
status: accepted
---

# The agent's browser surfaces are a package above workbench

Decided for TASK-653.13, candidate 10b of the archboard-deepen run. It applies
[ADR 0055](0055-packages-own-behavior-and-apps-compose-it.md) and amends nothing in it, and it
follows [ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md) for the assembly
it moves.

## Context

`@archboard/workbench` held two jobs. Its server half integrates Codex with Archboard: vault
admission, the pane registry and routes, the registry follow, narration and the workbench's place
in the server's start and stop. Its browser half drew the agent: the dock, the conversation panel,
the voice box and the orb. The web app assembled that browser half from about 19 parts in about
1,850 lines of its own: a publication of each pane's transport, the owners over the focused pane,
a voice store with its pin, the agent setup and its ports, the actions, the view, the panel's state
and its unread mark. ADR 0058 moves an assembly that callers make into the package that owns its
parts. Moved into workbench, the browser half added 11 names to its 10, past the 20 a package may
have.

The two halves share almost nothing. The browser half imports nothing from the server or runtime
areas; its one shared import is a type, what a page asks voice to narrate. Their callers are
disjoint (apps/server takes only server names, apps/web only browser names), and so are their
dependencies.

## Decision

- **Two behaviors, two packages.** `@archboard/workbench` keeps the server's side of the agent,
  with `./server` (seven operations) and `./browser-contract` (three values). The agent of a page
  over its panes is `@archboard/agent-surfaces`, one entry with eleven names, at the layer above
  workbench; the apps move up one layer. The new package reads its one shared type from
  workbench's browser contract.
- **One root holds the agent.** `AgentRoot` takes only the shell's facts: the focused pane, how a
  file an answer names opens, and how a conversation is shown. The dock, the panel, the voice box
  over a pane, the Talk key and the Narrate key read it below. The shell reads the voice and the
  panel through `useAgentVoice` and `useAgentPanel`, whose fast-changing values are reading
  functions, so a reply never draws the shell again.
- **The pane owns its socket.** The pane session keeps the socket and its conversation, and holds
  the conversation of its current socket in React state. `AgentPane` registers that conversation
  with the agent as it mounts, withdraws that same registration when a newer socket replaces it or
  the pane goes, and stays mounted whatever the pane's stage shows, so a pane whose model failed
  to load still has its agent. It hands the stage the voice to lay over the picture.

## Considered options

- **One package of about 21 names.** It keeps one owner, but past the width a package may have,
  and with two sets of callers that never meet.
- **The browser half in apps/web.** An app has no interface, but that moves about 12,000 lines and
  their tests into the app to avoid one, which moves width rather than removing it.
- **A blanket rule that splits browser and server.** ADR 0055 rejects it, and this decision does
  not adopt it: a behavior whose two halves share their state keeps its areas in one package, as
  the voice package does. These halves share no state; each is one behavior with one set of callers.

## Counter-evidence

The two halves still change together sometimes: of the seven recent commits that touched
`packages/workbench/src/ui`, three also touched `packages/workbench/src/server`. A change that
crosses them now lands in two packages, and the browser half takes its shared type through
workbench's browser contract. If such changes become the rule, merge the two again.

## Consequences

- Workbench's interface falls from 52 names to 16, types counted, and the new package has 18.
- The web app keeps the panes, their sessions and sockets, narration's meeting of walkthroughs and
  voice, recording's pacing, the replay page and where each surface is placed.
- A future run that finds the browser half wide narrows `@archboard/agent-surfaces`; it does not
  move the surfaces back into workbench.
