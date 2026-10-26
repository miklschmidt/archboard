---
id: TASK-530.03
title: The voice package builds, licenses and documents itself for npm
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T06:01:00Z'
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
- [x] #1 A pack command builds ESM and type declarations with a publishable manifest, MIT LICENSE and README
- [x] #2 The bundled workspace code is MIT and carries no Archboard checkout coupling
- [x] #3 A test installs the packed tarball into a project outside the repository and type-checks and starts it
- [x] #4 The README explains concepts, quickstart, configuration, security and troubleshooting
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pack: bun run pack:voice (Vite+ task voice-package, scripts/pack-codex-realtime-voice.ts) writes dist/codex-realtime-voice/ with a generated package.json (0.1.0, MIT, types and import per entry, imports #* to ./src/*, zod and ws dependencies, peer @openai/codex 0.160.0, optional peers react and express, engines.bun), LICENSE, bundled ESM and declarations under dist/, and the run-time manifests and instruction texts under src/. MIT packages: codex-realtime-voice, codex-app-server, process, timing, diagnostics. resolveCodexExecutable replaces resolveProjectCodexExecutable and verifyCodexExecutable; Archboard passes installedIn SOURCE_CHECKOUT. Client identity codex-realtime-voice, owner lock .codex-process.lock. The wire prefix stays archboard because voice record regexes match it. tests/system/process-contracts/voice-package.test.ts installs the tarball outside the repository. README (AC 4) is left to the README agent.

Consumer fixes on branch voice/consumer-fixes, commits 5fba76403 to 15dfda011. One: start() already rejected with startup_failed, and its TSDoc, the README quickstart and the example now treat that rejection as the contract. Two: the example disposes its client on every pagehide and makes a new one on a persisted pageshow, and the README quickstart matches. Three: workbenchStorage resolves the links above the host-given state and owner directories once at creation, and still refuses the directory itself or anything below it when it is a link. Four: the instructions TSDoc names the non-empty rule and its TypeError.

Security review of 96ff7bc38: following every link above the state directory let a link planted in a shared ancestor (for example /tmp/app -> a directory of the user's) move the private Codex home anywhere in the user's tree, where start then accepted it. Fixed in 669ae33ee: only links that the user or root own, reached through directories no other user can change (or sticky ones such as /tmp), are followed; any other link stays in the path and the private-directory check refuses it at start. macOS /tmp and os.tmpdir() still resolve. Test: voice-agent.test.ts 'a link above the state directory in a directory other users can write is not followed'. Untested: the 'you or root own the link' rule needs a link owned by another uid, which a test cannot make without root. Follow-up: createCodexWorkbench runs mkdirSync recursive on the owner and coordinator directories before the storage check (owner/workbench.ts:112-113), so it can create empty 0700 directories where a link points; start still refuses such a path.

README review (review/voice-readme): quickstart run from the packed tarball outside the repository; @types/bun is an optional type peer (b7af5a60f); Requirements name Node.js or bun run for the codex.js shebang, recordPrefix row, React ^19.2.8, start() concurrency, neutral entry rows (c77752f2f, 3d5ba38bd). Left: start() and a second start() reject with internal wording ('The production Codex workbench did not become ready', 'already installed' with no code); VoiceAgentOptions.context TSDoc says nothing beyond the conversation but the default lists the admitted checkouts.

AC #1 evidence: scripts/pack-codex-realtime-voice.ts (bun run pack:voice) builds ESM and bundled declarations for every public entry, with files dist, src, LICENSE and README.md and a manifest of pinned dependencies and peers; voice-package.test.ts packs it, installs the tarball outside the repository and type-checks with skipLibCheck false. AC #4 evidence: packages/codex-realtime-voice/README.md has Requirements, Install, Quickstart, Concepts, Configuration, Security, Advanced hosting, Troubleshooting (nine cases) and License; its checked blocks are type-checked by the same test.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
bun run pack:voice (scripts/pack-codex-realtime-voice.ts) builds ESM and bundled declarations for every public entry into a publishable package: MIT LICENSE, README, pinned dependencies, peers (react and @types/bun optional), and only MIT workspace code bundled; it refuses a bundle of any other license. The README covers requirements, install, a quickstart on Bun.serve (attach for a node:http server is under configuration), concepts, configuration, security, advanced hosting and nine troubleshooting cases. voice-package.test.ts packs it, installs the tarball in a project outside the repository, type-checks every public entry and the README's checked blocks under bun init's compiler options with skipLibCheck false, and imports the server entry. Follow-up: no test runs a voice agent, which needs a Codex executable and a sign-in.
<!-- SECTION:FINAL_SUMMARY:END -->
