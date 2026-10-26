---
id: TASK-530
title: Ship @archboard/codex-realtime-voice as a public MIT package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T05:47:00Z'
labels: []
dependencies: []
priority: high
type: feature
ordinal: 938000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants any developer to add a realtime Codex voice agent to a project. TASK-517 extracted packages/agent-workbench but left publication out: it has no README, is private and unbuilt, declares no dependencies, depends on BUSL workspace packages, hard-codes Archboard identity on the wire and in prompts, and exports 230 names while a host needs about 12. Archboard's host still assembles its internals. Decisions (owner, 2026-10-25): name @archboard/codex-realtime-voice, MIT, relicense and bundle the code it needs, a framework-agnostic browser client plus React hooks, npm-ready in this repository with the owner running the publish, Bun only for now.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An outside Bun project installs the packed tarball and runs a voice agent from the README quickstart with no Archboard code
- [x] #2 The package and every bundled source are MIT, and the published manifest declares its dependencies and peers
- [ ] #3 Archboard and the example use only the public entries that an outside developer uses
- [x] #4 No Archboard name reaches Codex, the browser or a prompt unless the host supplies it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vault closing (branch vault/close-529-530-532, from f667552b2):

- Rename: the board Agent workbench is now Codex realtime voice (72290d12e), because the package it describes is now packages/codex-realtime-voice. Its former name stays in formerNames. The vault README and docs/design/navigator-structure.md name the new board (1162de288, c18dddbcd).
- Proposals named TASK-530, footprint base 6032096a9:
  - Codex session (28d730b84): Workhorse start and Generation hooks rebound to the voice package. The client refuses token refresh by policy.
  - Voice coordinator (23a5d37a9): new Host toolset part (runtime/rules/host/toolset.ts) between the role instructions, the tool contract, Tell coordinator and the coordinator tools. Anchors on COORDINATOR_DOMAIN_INSTRUCTIONS, subscribeSettledChange and the voice callbacks enqueue. Two steps that the code no longer takes are removed.
  - Codex workhorse (14a0970ac): the callback namespace is rendered by the shared instruction policy. Operation validation reads the tool role from it. Anchors on WORKHORSE_DOMAIN_INSTRUCTIONS and enqueue.
  - Codex realtime voice (d58283485, c18dddbcd): new Voice agent (createVoiceAgent), Voice client (createVoiceClient) and Example host parts. Application policy reaches the package through createVoiceAgent. A Hosts container and a Public entries container keep the overview at 8 parts and 24 lines.
  - Archboard (e5104facf, c18dddbcd): the package node is codex-realtime-voice, bound to packages/codex-realtime-voice, with its MIT bundle (codex-app-server, process, timing, diagnostics). Two false edges are removed: Workbench example to codex-app-server, and codex-app-server to board. New edges: codex-app-server to timing and to diagnostics, and codex-realtime-voice to timing. The package node opens no board, because its kind is package and the board is at service level.
- Other proposals that hold TASK-530 changes:
  - TASK-532 on Browser application: the transport and media owner are rebound, Conversation controllers is new, and Workbench client drills to Codex realtime voice.
  - TASK-532 on Archboard server, Archboard server routes and Live panes: every drill-down that named Agent workbench now names Codex realtime voice.
  - The CLI boards draw no TASK-530 change. Commit 884c8c2cd changed only an inner check in spawn.ts.
- Footprint parts left undrawn: Codex transport and the Codex session parts changed only by wording, relicensing or timing sweeps (682713dd0, 884c8c2cd, bf475e4da). Thread tools changed by timing (bf475e4da). Thread tool calls changed by type derivation (b35ace9e4). Archboard tab adapter changed by a type import (f13270a0a). Codex home changed by wording. namedNotChanged was empty.
- Explained, not drawn: on Archboard, Codex home reaches codex-app-server, and board, code-intel, Codex home, server-lifecycle, workbench and workspace reach diagnostics. Both were in the base run.
- Code findings (no source changed):
  - EXPOSED_UNUSED: the voice package exposes names that no file outside their module uses: gateway (createBrowserConnections, createCommandExecutor, createSessionLeases and their types), workhorse-start (compensateAfterBindFailure), coordinator-callbacks (11 names) and rules/host (9 names).
  - apps/workbench-example/tests/ui/support/snapshot.ts imports @archboard/codex-app-server/identity. That is not a public entry of the voice package, and the example package.json does not list codex-app-server. The final code check does not report it, because it is test code.
- Renderer (waived): after the Voice coordinator adoption, wide-boards.test.ts passes for Voice coordinator (track and blocks). Codex workhorse (blocks) fails "labels off their own route" for edge XkZUEZcj, which TASK-530 did not change. Codex realtime voice (blocks) timed out at 20 s on a loaded machine. The boards are not reshaped for the renderer.

AC #2 evidence: package.json and LICENSE are MIT; the pack script bundles only workspace packages whose license is MIT and refuses a bundle of any other license (ef6ba8ece); the packed manifest declares dependencies, peerDependencies and peerDependenciesMeta (react and @types/bun optional). AC #4 evidence: unnamed-host.test.ts serializes the toolset, both thread profiles and starts, both realtime starts, the classifier prompt and minted records of a host with no identity and finds no Archboard name; git grep finds no Archboard name in the package sources except package import names and one code comment. AC #1 stays open: voice-package.test.ts installs the packed tarball, type-checks every public entry and the README's server.ts and page.tsx, and imports createVoiceAgent, but it does not run a voice agent, which needs a Codex executable and a sign-in. AC #3 stays open: Archboard's UI still uses ./controllers instead of createVoiceClient (TASK-530.02 #3).
<!-- SECTION:NOTES:END -->
