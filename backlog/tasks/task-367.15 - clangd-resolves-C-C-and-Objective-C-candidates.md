---
id: TASK-367.15
title: 'clangd resolves C, C++ and Objective-C candidates'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 20:44'
labels:
  - code-check
dependencies:
  - TASK-367.13
  - TASK-367.09
  - TASK-367.10
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 623000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
clangd needs `compile_commands.json` to know the include paths and flags of each file. Without it, clangd guesses, and a guess is no better than a candidate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A C, C++ or Objective-C candidate resolves through clangd when the checkout has `compile_commands.json`
- [ ] #2 Without `compile_commands.json`, the check says so once and reports candidates
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.15 only if the Language servers description must change (it names the languages generically; clangd's background index in a private directory may need a sentence). Restate on a fresh proposal from the current variant (v171 or later).
1. Measure real clangd 21.1.8 (nixpkgs clang-tools) first, scratch only: background index on/off, where it writes, --query-driver, .clangd and user config, plugin flags in compile_commands.json, flags that write files, module cache, readiness of a just-opened file, Objective-C on Linux.
2. languages.ts: a row keyed c for .c .h .cc .cpp .cxx .hpp .hh .hxx .m (.mm stays text); default clangd on the PATH; row fields prepare (arguments after the command's own, given a directory of the server's own that the client makes before the start and removes after the stop) and indexProgress (the work-done progress token the client waits on after its first open); opensFiles.
3. New compile-database.ts in language-servers: the nearest compile_commands.json clangd would find (the file's directory and each above it to the checkout root, then build/ there), inside the checkout after links; unready when none or when it lists no command; at the start a copy in the server's own directory with each command's directory made absolute and its module cache moved into that directory; clangd then runs with --compile-commands-dir=<own>, --background-index, --enable-config=false, --clang-tidy=false.
4. connection.ts notes the end of work-done progress; server.ts declares window.workDoneProgress for such a row, makes and removes the own directory, and waits once for the index after the first open within the request bound.
5. code-check: a server's answer at a line code facts read as a declaration leads to the definition in its pair, or stays as code facts read it; a C-family use whose include leads only to a declaration (a candidate) and joins two parts is asked; an anchor whose code-facts site is a declaration is judged at the server's site when it names one.
6. Tests against the stand-in server and ownServers(); docs (INSTALL.md, authoring.md, design-checks.md, check --code help and coverage row, ADR 0046 amendment); generate:skill-artifacts; manual checkCode runs on libuv (C), leveldb (C++) and an Objective-C sample, with and without a database.
7. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (20571432e code and tests, 3c16e3ff9 docs, 6055cd0dd vault): a row `c` in src/runtime/language-servers/lib/languages.ts for .c .h .cc .cpp .cxx .hh .hpp .hxx .m (.mm stays text); new compile-database.ts (the database clangd would find, readiness, the copy clangd reads); row fields prepare (arguments after the command's own, with a directory of the server's own that server.ts makes before the start and removes after the stop) and indexProgress (the work-done progress token the client waits on after its first open); connection.ts notes the end of a work-done progress; position.ts asks a C++ name through `::` and an Objective-C selector where its last name stands; outline.ts counts clangd's Objective-C method (named at its sign) as code. Code check: resolution.ts maps a server's answer on a code-facts declaration line to the pair's definition or leaves it as code facts read it; evidence.ts asks the server about a C use whose include leads only to a declaration, where a part makes the use; support.ts judges an anchor at the server's site when code facts find only a declaration. code-facts exports splitCommand (c-resolution.ts) and codeSiteOf. Owners: language-servers/tests/clangd-server.test.ts (5), python-csharp.test.ts (+1, the default), code-check/tests/clangd-check.test.ts (4). Docs: INSTALL.md, authoring.md, design-checks.md (Resolving C, C++ and Objective-C candidates with clangd), check --code help and coverage row, ADR 0046 amendment, timing comment; generate:skill-artifacts run.

Decisions:
1. clangd is a default on the PATH (ADR 0046 already says so), because with the check's flags it runs no code of the project: measured, no compiler run without --query-driver, no plugin loaded from -fplugin=, -Xclang -load or -fpass-plugin= (in --check, as a server and while indexing), no file written for -MF, -o, -save-temps, -ftime-trace, --serialize-diagnostics, -fcrash-diagnostics-dir, -fprofile-instr-generate.
2. Background index ON, not off as the brief suggested, in a directory of the server's own. Measured: with it off, the same question named ledger.h's declaration, then ledger.c's definition once ledger.c had been opened, and didClose did not undo it; --index is an obsolete flag. So answers would depend on question order. With --compile-commands-dir=<own> holding a copy of the database, the index went to <own>/.cache/clangd/index; nothing was written in the checkout or ~/.cache/clangd. The client waits for the end of backgroundIndexProgress after its first open (requestMs bounds it; a timeout is language-server-failed once). Index time: Redis 303 commands 1.4-1.6 s, libuv and leveldb ~0.1 s on 24 cores.
3. The copy (not a symlink) makes each command's directory absolute and moves its module cache: clangd wrote the -fmodules-cache-path a command named into the checkout for an @import (measured). Every -fmodules-cache-path, also after -Xclang, is dropped and one in <own>/modules goes before `--`.
4. Readiness: the nearest compile_commands.json clangd would find (the file's directory and each above it to the checkout root, then build/ there), on disk also where Git ignores it, not one whose real path is outside the checkout. Not reused from c-resolution.ts: that finder reads only Git-listed files (CMake's ignored build/ would never count) and is internal to createCResolver; only splitCommand is reused. A database with no command, or invalid, is unready too: clangd then starts no index and reports no progress (measured), so the wait would hang to its bound. Unready is said once per checkout (no database) or per database. compile_flags.txt does not count: clangd builds no index from it.
5. --enable-config=false: a .clangd and ~/.config/clangd/config.yaml are both loaded by default (measured); a .clangd can add flags, load an index file and name a remote index server (network; this nixpkgs build has no remote support, so that part is from clangd's documentation). No flag turns off only the project's file, so the user's config is off too; INSTALL.md says to put flags in compile_commands.json. --clang-tidy=false so no .clang-tidy is read. Never --query-driver. The check's flags come after an entry's args and win (a repeated flag is allowed and the last wins, measured). CLANGD_FLAGS in the server's environment is the user's and is left alone; INSTALL.md says that a --query-driver there runs compilers.
6. No settle request for the parse: a definition request right after didOpen is answered after the parse (Redis db.c answered 80 ms after the open, after the server.h preamble). clangd refuses a question about an unopened file, so opensFiles.
7. languageId: clangd takes the language from the compile command; a .h opened as c, cpp or objective-c gave the same outline and answer (measured), so .h maps to c and no header text is sniffed (the coordinator's note about SyntaxFacts.adapter does not arise: the row never reads it).
8. Objective-C on Linux, -x objective-c -fobjc-runtime=gnustep-2.0, no SDK: superclass method sends, super, an id receiver and [[Ledger alloc] init] each resolved to the @implementation in another .m; a missing <Foundation/Foundation.h> import did not stop the parse.
9. Evidence: a C use whose include leads only to a declaration (TASK-367.09's candidate) is asked whenever a part makes it, not only where the name match joins two parts, because the declaration is usually in the using part's own header pair (Redis server.h), so the match cannot say which part the code is in. Cost on the Redis board: 146 ms -> 3.1 s warm.
10. Language servers now imports Code facts (splitCommand); drawn on the board as Language servers -> Code facts.
11. The stand-in server is run by path from code-check/tests (spawned, never imported), so the code-check owner needs no second stand-in.

Manual runs (clangd 21.1.8 from nixpkgs clang-tools, scratch only, real checkCode, warm passes): libuv 954c1d1 (CMake database in ignored build/) 92 ms -> 555-772 ms: anchor uv__io_start (Stream->Core) now holds; four undrawn warnings and one backwards from candidates or nothing (uv__socket/uv__close/uv__close_nocancel/uv_os_getenv in core.c, uv__write_cancel and uv__read_start in stream.c, uv__tcp_close/uv__tcp_bind in tcp.c, uv__threadpool_cleanup in threadpool.c, uv__loop_configure in loop.c), each read against its source line. libuv with build/ moved away: 93 ms, language-server-unready once, findings identical to no server. leveldb 7ee830d: 93 -> 283-482 ms; the anchor WriteBatchInternal::Append (DBImpl->WriteBatch) now holds (defined write_batch.cc:144); Env::Default (env_posix.cc:924) a new undrawn warning; DB::Open in db_bench.cc stays a candidate because on NixOS clangd finds no standard headers without --query-driver. Redis 7f44037 (bear database): 146 ms -> 3,080-4,207 ms; anchors LFUDecrAndReturn (evict.c) and clusterPromoteSelfToMaster (cluster_legacy.c) now hold; five more undrawn warnings (emptyData/selectDb in db.c, clusterNodeCoversSlot in cluster_legacy.c, pauseActions/addReplyOrErrorObject in networking.c, ...), each checked. Objective-C sample: 98 -> 132-226 ms; the anchor balance sent to an id is judged at Ledger.m (mismatch warning). No clangd process, no archboard-language-server-* directory and nothing new under git status --ignored after any run.

Board: Archboard server@TASK-367.15 branched from ngbL3ryJ (TASK-367.10) at v171, Language servers and Code check descriptions restated, Language servers -> Code facts added (anchored at splitCommand in compile-database.ts), summary set to the board's scope, adopted at v175 (6055cd0dd). check --code with and without --variant: the only line that differs is the RELATIONSHIP_UNDRAWN Code facts warning, which the proposal clears (45 -> 44). Footprint against base d83606372: namedAndChanged Code check, Code facts, Language servers; changedNotNamed none; namedNotChanged none; 5 drill-down parts skipped (Agent CLI holds vault.ts, whose help text 3c16e3ff9 changed). ./bin/dogfood check: no diagnostics. Behind: Command interface (Vault check, Commands) reads 3c16e3ff9, which only adds the clangd case to the check --code help; the board stays true.

Gate, one lane at a time after 3c16e3ff9: lint 0, fmt:check 0, type-check 0, build:frontend 0, test:modules 4,279 pass 0 fail, test:system 195 pass 0 fail, test:repository 21 pass 0 fail, test:serial-browser 24 pass 0 fail. No clangd, stand-in or tsc --lsp process afterwards. Each new owner was shown to catch its bug by a mutation: the index wait, the workDoneProgress capability, the own directory's removal, the module cache move, the :: and selector positions, a database with no command, the Objective-C outline rule, the evidence question, the anchor's server site and the declaration rule.

Acceptance evidence: #1 language-servers/tests/clangd-server.test.ts 'clangd starts in the directory of the file's database, reads a copy whose module cache and index stay in its own directory, and is asked about an opened file once its index ended' and 'a C++ name through its class and an Objective-C selector are asked where their last name stands'; code-check/tests/clangd-check.test.ts 'with a compilation database, clangd places a use whose include leads only to a declaration, and the undrawn dependency it proves is a warning' and the anchor test; the manual runs on libuv (C), leveldb (C++), Redis and the Objective-C sample. #2 clangd-server.test.ts 'a file with no database in its checkout, and a database that lists no command, are each said once and start no server'; clangd-check.test.ts 'without a compilation database, the check says so once for the checkout and keeps what code facts read'; the libuv run with build/ moved away.
<!-- SECTION:NOTES:END -->
