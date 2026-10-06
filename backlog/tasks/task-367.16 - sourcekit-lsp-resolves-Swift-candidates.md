---
id: TASK-367.16
title: sourcekit-lsp resolves Swift candidates
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 19:44'
labels:
  - code-check
dependencies:
  - TASK-367.13
  - TASK-367.12
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 624000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sourcekit-lsp reads the index of a built Swift package. A package that has never been built has no index, and the check must say so instead of reporting false misses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Swift candidate in a Swift package resolves through sourcekit-lsp
- [x] #2 A package without an index is reported once, and the candidates stay
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: no Archboard server proposal unless the Language servers description must change (it names the languages table generically).
1. Measure the real server first (manual, scratch only): nixpkgs has only swift 5.10.1, whose sourcekitd fails to load (undefined symbol OStream_write), so the manual run uses the official swift:6.2 image through podman, wrapped as an absolute command in a scratch language-servers.json; nothing joins the repository.
2. languages.ts: a swift row (.swift as swift; no default, the string says sourcekit-lsp runs only from an entry); row fields for what a server needs: initializationOptions ({backgroundIndexing: false}), opensFiles (didOpen before a definition or an outline), settle (workspace/synchronize {index: true} once after start; an error answer is ignored), project (the directory a server starts in for a file, and why it cannot answer there yet).
3. New swift-package.ts in language-servers: the nearest Package.swift between the file and the checkout root is the package; unready when no package holds the file, when <package>/.sourcekit-lsp/config.json turns backgroundIndexing on (it overrides the client's option), or when <package>/.build/debug/index/store has no unit.
4. server.ts sends initializationOptions, opens files once, settles; session.ts asks the row's project once per directory per pass, notes an unready package once (reason unready, keyed by package), starts one server per language and project root, starts nothing for an unready package.
5. Shared skip reason language-server-unready; resolution.ts maps it (one line outside the stated write scope: a skip reason cannot reach the answer otherwise).
6. Tests: the stand-in server records initializationOptions and didOpen, answers unknown requests with method-not-found, and can refuse a definition in a file that is not open; session owner for Swift: asked at the package root after didOpen and synchronize, with backgroundIndexing false; no index, no package and a config that turns indexing on are each said once per package with nothing started.
7. Docs: INSTALL.md (naming sourcekit-lsp, building the index once, what the check turns off), authoring.md, design-checks.md (the manual run), the check --code help and its coverage row; generate:skill-artifacts.
8. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (831a21f54 code, 6f231b4a1 docs): a swift row in src/runtime/language-servers/lib/languages.ts; new swift-package.ts; server.ts and session.ts take what a row needs; skip reason language-server-unready in src/shared/code-check; one mapping line in src/runtime/code-check/lib/resolution.ts (outside the stated write scope: a new skip reason cannot reach the answer without it); stand-in server and fixture extended; owner swift-server.test.ts. Docs: INSTALL.md, authoring.md, design-checks.md (Resolving Swift candidates with sourcekit-lsp), check --code help, coverage row; generate:skill-artifacts run.

Measured (manual, scratch only): nixpkgs has only swift/sourcekit-lsp 5.10.1. Its sourcekit-lsp reports cannotDetermineHostToolchain, and with SOURCEKIT_TOOLCHAIN_PATH its libsourcekitdInProc.so fails to load (undefined symbol OStream_write), so it answers nothing. The run used the official docker.io/library/swift:6.2 image (Swift 6.2.4) through podman: a scratch script runs podman run --rm -i --network=none -v $PWD:$PWD -w $PWD swift:6.2 sourcekit-lsp, and a scratch language-servers.json names it. Findings: (a) a closed file gets error -32001 No language service, so the row opens files (didOpen); (b) background indexing is on by default and ran swift build (Preparing App/Core) and wrote .build/index-build; initializationOptions {backgroundIndexing: false} stops it and the server reads .build/<triple>/debug/index/store and writes its db to .build/debug/index/db; (c) the client's option wins over ~/.sourcekit-lsp/config.json, but <package>/.sourcekit-lsp/config.json wins over the client (it built again), so such a package is not asked; (d) the index loads after initialize: a cross-module question right away answers null; workspace/synchronize {index: true} answers when it is loaded (about 100 ms); (e) a server started at the checkout root did not resolve across modules in a package one directory down, so one server starts per package; (f) swift build 6.2 writes the index on Linux by default; 5.10 only with --enable-index-store; (g) an edit after the build still answered at the right line (it re-reads the file), so the docs only say the index holds what the last build saw.

checkCode manual run (scratch vault, parts Ledger.post, normalize, Sources/App; e2 call App -> normalize anchored at ledger.post): built + sourcekit-lsp 777 ms: RELATIONSHIP_UNDRAWN warning on normalize, resolved; ANCHOR_MISMATCH warning on e2, resolved. Built + no swift entry 221 ms: the same undrawn as information, candidate; skipped language-server-missing. Never built + sourcekit-lsp 257 ms: undrawn information, candidate; skipped language-server-unready once (repo named); no server started, nothing written into the package. No .build/index-build and no container left after any run.

Decisions the ADR left open:
1. The options that keep sourcekit-lsp from building are protocol options the check sends whatever command the user names: initializationOptions {backgroundIndexing: false}. No command-line flag: 6.2 has no --index-store-path or background-indexing flag (they moved to the config), and the user's args stay theirs. With it off, sourcekit-lsp neither prepares (no swift build) nor writes index-build.
2. A package's own .sourcekit-lsp/config.json overrides the client's option, so a package whose file sets backgroundIndexing true is not asked (language-server-unready). Its other options are left alone: the ADR lets a server the user names run project code for trusted checkouts; only building is refused.
3. Index detection: the package is the nearest directory holding Package.swift between the file and the checkout root; it has an index when any version directory under <package>/.build/debug/index/store has a unit (.build/debug is the symlink swift build makes to <triple>/debug, and the place sourcekit-lsp reads with background indexing off). A Swift file that no Package.swift holds has no index the check can find, so it is unready too.
4. One server per language and project, started in the package (rootUri and working directory), because a root-level server did not resolve across modules in a nested package (measured). Failures stay once per checkout; unready is once per package.
5. Skip reason: a new language-server-unready (once per project, with the checkout's repo; detail names the language, the package and why), in the family of language-server-missing and -failed, rather than reusing missing (the server is installed) or failed (it never started). One word covers no index and a config that would build, since both mean the server cannot answer there without a build.
6. No server is started for a package that is not ready, so the check never evaluates Package.swift of a package it cannot ask.
7. The swift entry decides first: with no entry, only language-server-missing is said, and no package is inspected.
8. workspace/synchronize is asked once after initialized, within the request bound; a server that refuses it (an older version without the request) is asked anyway, and a timeout is a failed server.
9. Network: sourcekit-lsp's SwiftPM reads Package.resolved; a package with an index was built, so its dependencies are already checked out. The check does not otherwise stop a server from reaching the network.
10. swift-check.test.ts (TASK-367.12) still runs checkCode with this machine's language-servers.json; Swift has no default, so it changes only if the user adds a swift entry. Not changed (outside the write scope).

Board: the Language servers description said one server per checkout and named only missing or failed servers, so Archboard server@TASK-367.16 was branched from v155 (parent BXgFELXz, the current variant), restated Language servers' description (one server per project, the package for Swift; sourcekit-lsp with backgroundIndexing false, workspace/synchronize, didOpen; a Swift package with no index said once, no server started), kept the board's scope as summary, and adopted at v159 (ae29f9a82). compare: only that description changed. check --code with and without --variant TASK-367.16: 44 findings each, no line differs. Footprint against base e3394b7c1: namedAndChanged Language servers (831a21f54); changedNotNamed Code check (831a21f54 adds one mapping line in resolution.ts for the new skip reason; its description names no server skip, so the board stays true); namedNotChanged none; 5 drill-down parts skipped. ./bin/dogfood check: no diagnostics. Behind after adoption: Command interface (Vault check, Commands) and Skill evaluation (Evaluation inputs) read 6f231b4a1, which only adds language-server-unready to the check --code help and its coverage row; both boards stay true.

Gate (lanes one at a time, shared working tree): lint exit 0; fmt:check exit 1 only on t367-22-dbg.ts (another agent's scratch file at the root), my files pass oxfmt; type-check exit 0; build:frontend exit 0; test:modules 4,244 pass 0 fail (wide-boards passed this run); test:system 195/0; test:repository 20/0; test:serial-browser 24/0. No sourcekit-lsp, stand-in or tsc --lsp process and no podman container left afterwards. Acceptance evidence: #1 src/runtime/language-servers/tests/swift-server.test.ts 'sourcekit-lsp is asked in the package that holds the file, with background indexing off, after it loaded its index, about the file it opened', plus the manual checkCode run (RELATIONSHIP_UNDRAWN resolved, ANCHOR_MISMATCH resolved through sourcekit-lsp 6.2.4); #2 swift-server.test.ts 'a package that no build has indexed is said once, keeps its questions unasked, and starts no server, while an indexed one is asked' and 'a package whose own configuration turns background indexing on, and a file no package holds, are each said once and start no server', plus the manual never-built run (one language-server-unready skip, candidate kept).

Independent review (2026-10-06): NOT CLEAN before its fixes 7c49d2997, 0446ccd68, 3dd5f8fd9 and 4e1d96530. The reviewer ran sourcekit-lsp 6.2.4 in the official swift:6.2 image through podman with --network=none. The runs used the check's own session on a scratch package with the targets Core, App and CoreTests. The reviewer read the 6.2.4 sources (SourceKitLSPOptions.swift, SwiftPMBuildSystem.swift, Workspace.swift, SourceKitLSPServer.swift, DetermineBuildSystem.swift) and Documentation/Configuration File.md, which is the same at the 6.2 and 6.2.4 tags.

Findings and fixes:
1. swift-package.ts looked at a package once for each directory that the pass asked about. Each look read the package's sourcekit-lsp configuration file and listed every unit of the index store. So while a build ran, two directories of one package got different answers in one pass. Then the check said that a package was unready and also started a server for it. On 150 directories with 5,000 index units, one pass took 25 to 45 ms. Fix 7c49d2997: a row's project gets a third argument, once, a look that the session does once in a pass for a key. The package look goes through it, so a pass looks at each package once, in 2 to 3 ms. The argument is optional for a row, and the Python and C# rows ignore it.
2. One server for each package broke a promise of the session: "a pass waits for a hung server at most once". The failure was said once for the checkout. Then the next package of that checkout started the server again and waited again. The evidence pass asks file by file, so a pass waited up to the start bound and the request bound for each package. Fix 7c49d2997: after a server fails in a checkout, no server of that language starts there again in the pass. The contract of language-server-failed already said this: "its uses there stay as code facts read them". Owner: swift-server.test.ts, "a server that failed in one package is not started in another package of that checkout".
3. code-check-lines.ts: the check says language-server-unready once for each package, each with the repository of its checkout. So three packages of one checkout printed "skipped 3 checkouts", with the repository three times. Fix 0446ccd68: a line names each checkout once and counts the checkouts that it names. Owner: check-code.test.ts.
4. resolution.ts maps an unready project to the language-server-unready skip, and that mapping had no owner. Owner 3dd5f8fd9 is in swift-check.test.ts. The pass names sourcekit-lsp by a path that no machine has, and anchors e4 at ledger.balance, a use through a value. The answer has one language-server-unready skip with the checkout's repository, and the findings stay the adapter's. A mutation that maps unready to failed fails it.
5. Writes into the checkout. With background indexing off, the real server wrote its index database (.build/<triple>/debug/index/db) and a module cache for the standard library's Clang modules (.build/<triple>/debug/ModuleCache). Nothing else in the package changed, and no index-build directory or object file appeared. In 6.2 the database path is buildPath/index/db (SwiftPMBuildSystem.swift:473). The index options are only indexPrefixMap and updateIndexStoreTimeout, so no option moves the files out of .build. swiftPM.scratchPath also moves the index store. Fix 4e1d96530 amends ADR 0046: the check writes nothing. A server that the user names for a trusted checkout can keep its own files in the build output that Git ignores. An editor that runs the server gets the same files. The readiness check reads only the package's sourcekit-lsp configuration file and the names in the index store. INSTALL.md says where sourcekit-lsp keeps its files. design-checks.md records the runs.

Configuration that can make the server build (checked against the 6.2.4 source):
- backgroundIndexing. Precedence is the user-level files (~/.sourcekit-lsp, XDG_CONFIG_HOME), then initializationOptions, then the workspace .sourcekit-lsp/config.json. The client's false wins over both user-level files: measured with both files set to true, the log showed backgroundIndexing 0 and nothing was built. The package's own file wins over the client, so the check refuses such a package (unready), as built.
- backgroundPreparationMode, including build. Only the SemanticIndexManager uses it. When background indexing is off, Workspace.swift:162-182 creates no such manager. Measured with build in the package's file: nothing was built. No action needed.
- workspace/synchronize {index: true} waits for the build graph, which evaluates Package.swift without a build, and polls the store for new units. semanticIndexManager is nil, so the request starts no indexing and no preparation (Workspace.swift:512-520).
- The trust rule of ADR 0046 leaves these to the user: a buildServer.json or .bsp in the package (measured: sourcekit-lsp ran the program that the file names in place of SwiftPM, every answer was empty, and the candidates stayed), defaultWorkspaceType, compile_commands.json (only used with defaultWorkspaceType or with no Package.swift), sourcekitd.servicePlugin or clientPlugin (loads a library that the package names), swiftPM flags and disableSandbox, generatedFilesPath (default is the temporary directory), and logging mirror directories (global only). Each of these runs or writes what a trusted checkout or the user configured, and none of them builds while background indexing is off.
- Network: with background indexing off, SwiftPM loads the graph with forceResolvedVersions and skipDependenciesUpdates (SwiftPMBuildSystem.swift:247 and 400). A package that has an index was built, so its checkouts are present. Every run used --network=none.

Probes:
- Built package, use through a value: answered at Ledger.swift:3, declaration code, 378 to 687 ms through podman.
- A file in Tests/ after swift build, which skips the tests (no test units): resolved a name of another test file through the server's own reading of the target, and ledger.post in Core through the index.
- Nested package: the nearest Package.swift wins, which is how SwiftPM and sourcekit-lsp see it.
- --scratch-path or release-only build: there is no .build/debug store, so the package is unready. This is right, because the server reads .build/<triple>/debug by default.
- .build as a symbolic link: readdir follows it, and the server reads the same place.
- Xcode project with no Package.swift: unready once for each checkout.
- Leftover processes: no podman container and no sourcekit-lsp process after any run.

Known gaps, recorded and not fixed (no false finding in any of them, because an empty answer keeps the candidate): with a buildServer.json, the package is judged by the SwiftPM index, and its empty answers say no reason. A package or user configuration that sets swiftPM.scratchPath, configuration or triple moves the store that the server reads, while the readiness check looks at .build/debug. A file that no target holds can open an implicit workspace in a directory between the file and the package. The check does not read the configuration file of that directory. A Package.swift without PackageDescription is a package to the check and not to sourcekit-lsp. An index store from another toolchain counts as an index. sourcekit-lsp pushes diagnostics for each opened file after 1 s. The reviewer did not measure that cost.

Row fields: initializationOptions, opensFiles, settle and project each rest on a measured need. They apply on every path that asks a server. A definition and an outline both open the file first. No path restarts a failed server in a pass, and the per-pass answer cache is unchanged. The board's Language servers description stays true, so the vault is unchanged.

Tests follow the test policy. They assert machine-readable facts: where a server started, its options, the order of the methods, the unavailable entries, the skip, and how often a line names a repository. They assert no wording. No test needs a real sourcekit-lsp.

Acceptance evidence: #1 swift-server.test.ts (started in the package with background indexing off, after workspace/synchronize, about an opened file), and the real run through the session (ledger.post answered at Ledger.swift:3). #2 swift-server.test.ts (an unindexed package is said once for two of its directories, and no server starts), swift-check.test.ts (one language-server-unready skip with the repository through checkCode, and the findings stay the adapter's), and check-code.test.ts (the line names the checkout once).

Gate of the review, lanes one at a time: lint exit 0. fmt:check exit 0. type-check exit 0. build:frontend exit 0. test:modules 4,265 pass, 0 fail. test:system 195 pass, 0 fail. test:repository 21 pass, 0 fail. test:serial-browser 24 pass, 0 fail. After the lanes, no sourcekit-lsp, stand-in or tsc --lsp process ran, and no podman container was left.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A Swift candidate resolves through sourcekit-lsp when language-servers.json names it (Swift has no default). The check starts one server per Swift package, the nearest Package.swift, with background indexing off, waits for it to load the index with workspace/synchronize, and opens each file before it asks. A package that no build indexed, that its own .sourcekit-lsp/config.json would make build, or a Swift file that no package holds, is said once per package as language-server-unready, starts no server, and keeps its candidates. The review made the package look once per pass, stopped a failed server from being started again per package, fixed the human skip count, gave the reason mapping an owner, and amended ADR 0046: the check writes nothing into a checkout, while a server the user names keeps its index database under the package's ignored .build. Verified by swift-server.test.ts, swift-check.test.ts and check-code.test.ts, and by sourcekit-lsp 6.2.4 in the swift:6.2 image on a built and an unbuilt package.
<!-- SECTION:FINAL_SUMMARY:END -->
