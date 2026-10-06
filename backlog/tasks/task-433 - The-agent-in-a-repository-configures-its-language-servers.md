---
id: TASK-433
title: The agent in a repository configures its language servers
status: To Do
assignee: []
created_date: '2026-10-06 23:17'
labels: []
dependencies: []
documentation:
  - >-
    docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md
priority: high
ordinal: 693000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check (`archboard check --code`, ADR 0046) started pyright and clangd by default in every checkout it read. A checkout can be registered by observation, so nobody had agreed to run its code. Each default therefore carried guards: clangd read a rewritten copy of `compile_commands.json` without `-B`, response files, module caches or GPU helper programs, started without `CLANGD_FLAGS` and `.clangd`, and kept its index in a temporary directory that every pass rebuilt; pyright refused a checkout whose `.venv` interpreter Git tracks. With these guards a server does not behave as it does in the user's editor, the list of dangerous compiler flags can be incomplete, and clangd rebuilds its index on every pass (3.1 s per pass on Redis, a failed pass on LLVM). The owner decided on 2026-10-07, while reviewing TASK-367: a language server that can run code of a checkout runs only where the agent that works in that repository configured it, and then it runs as an editor runs it. TypeScript keeps its built-in server, because it runs Archboard's own `tsc` and no code of the checkout. Nothing was pushed since `language-servers.json` landed, so no existing machine file needs a migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For Python, C, C++, Objective-C, C# and Swift, `check --code` starts no language server in a checkout that has none configured for that language. The answer says `language-server-missing` once for that checkout and language, and names the command that configures one. TypeScript needs no configuration.
- [ ] #2 One CLI command sets or removes the server of one language for one registered checkout. `repo list` shows the servers of each checkout, and `repo forget` removes them with the checkout. The configuration is machine-local and kept with the checkout's registration. The machine-wide `language-servers.json` and `ARCHBOARD_LANGUAGE_SERVERS` are gone.
- [ ] #3 A configured server runs with exactly the command, arguments and environment of its entry and the user's environment. The check adds no flag, environment change or rewritten file that changes what the server does to the checkout: clangd reads the checkout's own `compile_commands.json` and keeps its index where it keeps it under an editor, and pyright uses the checkout's environment without the tracked-interpreter refusal. Only what the protocol needs for an answer stays, such as opening files and waiting for the index.
- [ ] #4 INSTALL.md and the `archboard` skill say when an agent configures a server for the repository it works in, how to do it (install the server, generate `compile_commands.json` where needed, run the command), and that a configured server runs that repository's code as an editor does. `bun run generate:skill-artifacts` ran, and the eval inputs under `evals/` follow the change.
- [ ] #5 ADR 0046 carries an amendment by this task that replaces the default servers of TASK-367.14 and TASK-367.15 and the guards this task removes.
- [ ] #6 A cold and a warm `check --code` pass on Redis with clangd's own index are measured against the 3.1 s per pass before, and TASK-429 is updated or closed from that measurement.
- [ ] #7 Each new behaviour has one test owner, and every test that only held a removed guard is deleted.
<!-- AC:END -->
