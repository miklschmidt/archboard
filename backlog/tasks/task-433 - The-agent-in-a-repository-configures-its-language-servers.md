---
id: TASK-433
title: The agent in a repository configures its language servers
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 23:17'
updated_date: '2026-10-07 00:29'
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
The code check (`archboard check --code`, ADR 0046) started pyright and clangd by default in every checkout it read. A checkout can be registered by observation, so nobody had agreed to run its code. Each default therefore carried guards: clangd read a rewritten copy of `compile_commands.json` without `-B`, response files, module caches or GPU helper programs, started without `CLANGD_FLAGS` and `.clangd`, and kept its index in a temporary directory that every pass rebuilt; pyright refused a checkout whose `.venv` interpreter Git tracks. With these guards a server does not behave as it does in the user's editor, the list of dangerous compiler flags can be incomplete, and clangd rebuilds its index on every pass (3.1 s per pass on Redis, a failed pass on LLVM). The owner decided on 2026-10-07, while reviewing TASK-367: a language server that can run code of a checkout runs only where the agent that works in that repository configured it, and then it runs as an editor runs it. TypeScript needs no configuration, but the owner decided that it runs the TypeScript the checkout installs, as an editor does, and Archboard's own only where the checkout has none it can run. Nothing was pushed since `language-servers.json` landed, so no existing machine file needs a migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For Python, C, C++, Objective-C, C# and Swift, `check --code` starts no language server in a checkout that has none configured for that language. The answer says `language-server-missing` once for that checkout and language, and names the command that configures one. TypeScript needs no configuration.
- [x] #2 One CLI command sets or removes the server of one language for one registered checkout. `repo list` shows the servers of each checkout, and `repo forget` removes them with the checkout. The configuration is machine-local and kept with the checkout's registration. The machine-wide `language-servers.json` and `ARCHBOARD_LANGUAGE_SERVERS` are gone.
- [x] #3 A configured server runs with exactly the command, arguments and environment of its entry and the user's environment. The check adds no flag, environment change or rewritten file that changes what the server does to the checkout: clangd reads the checkout's own `compile_commands.json` and keeps its index where it keeps it under an editor, and pyright uses the checkout's environment without the tracked-interpreter refusal. Only what the protocol needs for an answer stays, such as opening files and waiting for the index.
- [x] #4 INSTALL.md and the `archboard` skill say when an agent configures a server for the repository it works in, how to do it (install the server, generate `compile_commands.json` where needed, run the command), and that a configured server runs that repository's code as an editor does. `bun run generate:skill-artifacts` ran, and the eval inputs under `evals/` follow the change.
- [x] #5 ADR 0046 carries an amendment by this task that replaces the default servers of TASK-367.14 and TASK-367.15 and the guards this task removes.
- [x] #6 A cold and a warm `check --code` pass on Redis with clangd's own index are measured against the 3.1 s per pass before, and TASK-429 is updated or closed from that measurement.
- [x] #7 Each new behaviour has one test owner, and every test that only held a removed guard is deleted.
- [x] #8 For TypeScript, the check runs the native `tsc --lsp` of the `typescript` package that the checkout installs, where that package is TypeScript 7 or later and has the native program for this machine. Otherwise it runs Archboard's own. INSTALL.md and the `archboard` skill say which one runs and why a TypeScript older than 7 falls back.
- [x] #9 The archboard skill has a setup reference (skills/archboard/references/setup.md) that says when an agent configures a language server for the repository it works in, how to do it, what a configured server runs, and which TypeScript runs. authoring.md keeps what the code check does with a server and one pointer to it, and SKILL.md links it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Affected boards: `Archboard server` (the Language servers part and the Code check part), `Archboard` (the Repository checkout part), `Command interface` (the Repositories part). Proposals: Archboard server@TASK-433, Archboard@TASK-433, Command interface@TASK-433. I draw them after the code, then correct them, adopt them and run `./bin/dogfood check`.
1. Add the shared module src/shared/language-servers. It holds the configurable languages (python, csharp, swift, c) and the schema of a configured server (command and arguments). The registry, the CLI and the runtime use that one definition.
2. In repo-registry.ts, the registration of a checkout gets an optional `servers` field. It stays when the same root registers again. `repo list` shows it. `repo forget` removes it.
3. Add `archboard repo language-server <language> [command] [--arg=<a>]... [--remove] [--repo <identity>]` to the command contract, next to `repo add`. Without --repo, it uses the registered checkout of the working directory.
4. In src/runtime/language-servers, delete the file reading, the defaults, the own directory, the rewritten compile_commands.json, the dropped flags, the outside-checkout refusal and the tracked-interpreter refusal. The session asks for the server of a language in a checkout. It says `language-server-missing` once for each checkout and language, and the skip names the command that configures a server.
5. TypeScript runs the native tsc of the checkout's own typescript package when it is version 7 or later and has the native program. Otherwise it runs the tsc of Archboard.
6. Tests: one owner for each new behavior. Delete the tests that only held a removed guard. Move tests from ARCHBOARD_LANGUAGE_SERVERS to ARCHBOARD_REPOS.
7. Documents: INSTALL.md, the archboard skill, the ADR 0046 amendment, evals/coverage.json, then `bun run generate:skill-artifacts`. Sweep every removed name.
8. Measure clangd on Redis, cold and warm, against 3.1 s. Measure sourcekit-lsp only if a Swift toolchain is on the machine.
9. Run `bun run check`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commits: 9de716a4a (code and tests), 9597211c7 and f93dcb924 (INSTALL.md, the archboard skill, the ADR 0046 amendment, evals/coverage.json), and the vault commit that adopts the proposals.

What I built
- src/shared/language-servers holds the languages that an agent configures (python, csharp, swift, c) and the schema of a configured server (a command and arguments).
- The registration of a checkout in repo-registry.ts has an optional `servers` field. Registering the same root again keeps it. `repo list` shows it. `repo forget` removes it.
- `archboard repo language-server <language> [command] [--arg=<a>]... [--remove] [--repo <identity>]` is in the command contract, next to `repo add`.
- src/runtime/language-servers/lib/server-command.ts replaces configuration.ts. languageServerOf gives the server of a language in a checkout. The session says `language-server-missing` once for each checkout and language. resolution.ts adds the configure command to the skip detail.
- checkCode lost its servers parameter. The registry snapshot decides. It has an optional last parameter, `serverOf`, that only relationships.test.ts uses, to run a TypeScript checkout with no server.
- Removed: the file reading, `language-servers.json`, ARCHBOARD_LANGUAGE_SERVERS, the false value, the default servers, the own directory, the rewritten compile_commands.json and its drops, the moved compiler, CLANGD_FLAGS removal, own TMPDIR and XDG_CACHE_HOME, --enable-config=false, --clang-tidy=false, --compile-commands-dir, the outside-checkout refusal, the tracked-interpreter refusal of pyright, and the Language servers to Code facts relationship (splitCommand).

Choices beyond the brief
1. Spelling: `repo language-server`, the command as the second positional, repeatable `--arg=<value>`, `--remove`, `--repo <identity>`.
2. Without --repo, the working directory must be the registered root of its repository identity. Otherwise the command refuses with a usage error that names `repo add`.
3. A configured server stays when the same root registers again. It is dropped when the identity registers at another root, because nobody configured a server there.
4. A command is a name on the PATH or an absolute path. A relative path is refused.
5. `check --code` prints the detail of a checkout-level `language-server-missing` skip, so the agent sees the command.
6. TypeScript (#8): the check looks only at <root>/node_modules/typescript. It does not walk up to parent directories. The package must resolve inside the checkout after links. It must declare major version 7 or later (read from package.json). The native program must be beside the package or inside it. Otherwise the check runs the tsc of Archboard. In a monorepo the root decides, because that rule is the simplest to predict. A package with another version than the root uses the version of the root.
7. env: process.env is passed to the server explicitly.
8. sourcekit-lsp keeps backgroundIndexing false and the unready rule for a package configuration that turns it on. No Swift toolchain is on this machine, so I could not measure the default.

Measurements (clangd 21.1.8 from nixpkgs clang-tools, Redis 7f44037 with the bear database, the 8-part 3-relationship board of TASK-367.15, 24 cores, real checkCode in one process, clangd configured on the registration)
- Cold pass (no .cache): 4,627 ms and 4,777 ms.
- Warm passes: 1,920 to 1,993 ms (six passes).
- No server: 146 to 166 ms.
- Each run had 8 findings. Before: 3,080 to 4,207 ms, and 3.1 s per warm pass, because clangd rebuilt its index in every pass.
- clangd keeps its index in .cache/clangd/index in the checkout (7.1 MB). Redis does not ignore it.
- For TASK-429: the premise of the task (the index is rebuilt in every pass) no longer holds. A warm pass takes 1.9 to 2.0 s against 3.1 s. The remaining problem is the first pass over a checkout whose index takes longer than the 30 s bound (LLVM took 54 s in TASK-367.15). I did not measure whether the index shards that clangd writes before the check kills it let a later pass finish, because no LLVM checkout is here. I did not edit TASK-429.

Board proposals: Archboard server@TASK-433, Archboard@TASK-433 and Command interface@TASK-433, adopted. The footprint was read against base c36ed8432 (the commit before the first TASK-433 code commit). Changed but not named, and why they stay as they are: the Archboard server container and Code check route (one line, the call of checkCode lost an argument), Command catalogue in run.ts (registers the new subcommand inside the part that already draws the catalogue), Vault check in vault.ts and Commands (help text only). The check --code run after adoption shows the Skill evaluation board behind: only documentation and evals/coverage.json changed there, and the harness did not change, so the board stays correct. check --code with --variant TASK-433 against the run without it clears one finding and adds none. `./bin/dogfood check` reports no diagnostics.

Independent review (2026-10-07, four reviewers on Sonnet: runtime, registry and CLI, documents and boards, and the registry-runtime boundary). Fixed: a symlinked native tsc could lead outside the checkout and still run (9612b530e); the clangd stand-in now records the whole environment, so an injected TMPDIR fails the test that owns criterion 3 (9909cfad1); parallel repo commands lost updates in repos.json, measured 10 of 12 runs, now a lock directory (55cb9b742); a failed registry write printed success, now exit 1; check --code counted languages as checkouts; the configure command in a language-server-missing skip did not quote an identity with a space (728523bc9, with a test that runs the command from a real skip); a command missing from the PATH of the Archboard server read as not installed; the language list was written twice; dead exports splitCommand and LANGUAGE_KEYS removed. Documents: clangd keeps its index in .cache/clangd/index of the checkout root, not beside a database under build/; clangd with --query-driver runs the compiler, and it runs a helper from a -B directory for a native GPU command; --background-index=false fails the check after 30 s; the server runs with the environment and PATH of the Archboard server. Coordinator: the CLI help says the same (ad86eea41), and a failed server names the command that configures another (d6598ec33). Kept for the owner: sourcekit-lsp backgroundIndexing false and its unready rule, because no Swift toolchain is here to measure the default. Redis measured again by the documents reviewer: cold 4,579 ms, warm 1,954 to 1,992 ms, no server 156 to 163 ms. TASK-429 narrowed to the first run over a checkout whose index takes more than 30 s. Validation: bun run check exit 0, 4,530 tests passed and 0 failed; ./bin/dogfood check reports no diagnostics; repo language-server set, list --text, --remove and a refused relative command run by hand against a scratch ARCHBOARD_REPOS.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Language servers that can run code of a checkout (Python, C, C++, Objective-C, C# and Swift) now run only where the agent that works in that repository configured them with `archboard repo language-server`, stored on the checkout's registration in repos.json. A configured server runs with exactly its command and arguments and the environment of the Archboard server, as an editor runs it: the rewritten compilation database, the dropped flags, the stripped CLANGD_FLAGS, the private temporary directory and pyright's tracked-interpreter refusal are gone. TypeScript needs no configuration and runs the checkout's own TypeScript 7 or later inside the checkout, else Archboard's. clangd keeps its own index, so a later run on Redis takes 1.9 to 2.0 s against 3.1 s. INSTALL.md, the new skill reference setup.md and an ADR 0046 amendment describe it. Verified with bun run check (4,530 passed, 0 failed), ./bin/dogfood check, a manual run of the command, and an independent review in four scopes whose fixes are committed.
<!-- SECTION:FINAL_SUMMARY:END -->
