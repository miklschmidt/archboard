---
id: TASK-530.03
title: The voice package builds, licenses and documents itself for npm
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T04:19:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 941000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The package exports raw TypeScript, declares no dependencies, depends on BUSL workspace code, refuses a Codex executable outside the Archboard checkout, and has no README.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pack command builds ESM and type declarations with a publishable manifest, MIT LICENSE and README
- [x] #2 The bundled workspace code is MIT and carries no Archboard checkout coupling
- [x] #3 A test installs the packed tarball into a project outside the repository and type-checks and starts it
- [ ] #4 The README explains concepts, quickstart, configuration, security and troubleshooting
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pack: bun run pack:voice (Vite+ task voice-package, scripts/pack-codex-realtime-voice.ts) writes dist/codex-realtime-voice/ with a generated package.json (0.1.0, MIT, types and import per entry, imports #* to ./src/*, zod and ws dependencies, peer @openai/codex 0.160.0, optional peers react and express, engines.bun), LICENSE, bundled ESM and declarations under dist/, and the run-time manifests and instruction texts under src/. MIT packages: codex-realtime-voice, codex-app-server, process, timing, diagnostics. resolveCodexExecutable replaces resolveProjectCodexExecutable and verifyCodexExecutable; Archboard passes installedIn SOURCE_CHECKOUT. Client identity codex-realtime-voice, owner lock .codex-process.lock. The wire prefix stays archboard because voice record regexes match it. tests/system/process-contracts/voice-package.test.ts installs the tarball outside the repository. README (AC 4) is left to the README agent.

Consumer fixes on branch voice/consumer-fixes, commits 5fba76403 to 15dfda011. One: start() already rejected with startup_failed, and its TSDoc, the README quickstart and the example now treat that rejection as the contract. Two: the example disposes its client on every pagehide and makes a new one on a persisted pageshow, and the README quickstart matches. Three: workbenchStorage resolves the links above the host-given state and owner directories once at creation, and still refuses the directory itself or anything below it when it is a link. Four: the instructions TSDoc names the non-empty rule and its TypeError.
<!-- SECTION:NOTES:END -->
