---
id: TASK-367.14
title: Language servers resolve Python and C# candidates
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 19:59'
labels:
  - code-check
dependencies:
  - TASK-367.13
  - TASK-367.08
  - TASK-367.11
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 622000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Python and C# have mature language servers, but each needs its project found first: the environment of a Python project, and the solution or project file of a .NET one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Python candidate resolves through pyright or basedpyright with the project's environment
- [ ] #2 A C# candidate resolves through csharp-ls or the Roslyn language server with the solution or project file
- [ ] #3 A missing server or project file is reported once, and the candidates stay
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: no change expected. Language servers already draws src/runtime/language-servers; the Python and C# rows sit inside it. A proposal is branched only if its description must change.
1. Tests first (the review's warning): languageServersFile() honours ARCHBOARD_LANGUAGE_SERVERS, as ADR 0046 lets a test add, beside ARCHBOARD_REPOS. The code-check tests pass a test table (code-check/tests/servers.ts: Archboard's own tsc for TypeScript, every other language off). The route test points ARCHBOARD_LANGUAGE_SERVERS at a scratch file that turns every language but TypeScript off. The CLI test uses a stand-in Archboard server and runs no pass.
2. Build on TASK-367.16's row seam (project(root, file) -> { root, unready? }, settle, initializationOptions), committed by that task first: a project also carries settings, the answer to workspace/configuration by section, and notifications sent after initialized. The client declares workspace.configuration.
3. Python row (.py, .pyi): default pyright-langserver --stdio, else basedpyright-langserver --stdio, from the PATH. Project: the checkout; settings python.pythonPath = the interpreter of .venv or venv in the checkout root (pyvenv.cfg present) only when Git lists no file under it, so no interpreter that a checkout commits runs. pyrightconfig.json and [tool.pyright] are read by pyright itself; a venv they name wins over pythonPath in pyright.
4. C# row (.cs): no default (csharp-ls and Roslyn evaluate MSBuild). Project: the checkout; the solution (.sln, .slnx) Git lists nearest the root, else every .csproj Git lists; settings csharp.solutionPathOverride for csharp-ls, notification solution/open or project/open for Roslyn. None: unready, said once for the checkout.
5. Tests: stand-in server records the configuration answer and notifications; owners in language-servers/tests for each discovery and the missing project; code-check owner that a Python and a C# use resolve through the row's server and a missing server or project keeps the candidates.
6. Manual: nix pyright on Flask, nix csharp-ls on a small .NET solution; measure the added time on Flask; record in design-checks.md. Docs: INSTALL.md, authoring.md, generate:skill-artifacts, check --code help.

Revised in the build: Roslyn is not supported (see the notes), so a project carries settings only and no notifications; pyright also opens each file; the outline rule finds a declaration above the parameters pyright lists on its line.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (e1a21b7a2 test table, 6db69b426 Python and C# rows, ba6c3ef88 docs, the vault adoption commit): src/runtime/language-servers gains python-environment.ts, dotnet-solution.ts and listed-files.ts; languages.ts has the python and csharp rows; Project (TASK-367.16's seam) carries settings, which the connection answers workspace/configuration with by section; the client declares workspace.configuration. Owners: language-servers/tests/python-csharp.test.ts against the stand-in, which now records the configuration answer and answers outlines. The code-check owners pass ownServers() (code-check/tests/servers.ts: Archboard's tsc, every other language off), and the route owner sets ARCHBOARD_LANGUAGE_SERVERS to a scratch path. The CLI owner runs no pass (a stand-in Archboard server), so it needed nothing.

Decisions the ADR left open:
1. Tests: ARCHBOARD_LANGUAGE_SERVERS moves language-servers.json (ADR 0046 lets a test add it). In-process owners pass a table instead, because Bun.which reads the PATH the process started with, so no owner can change the PATH in-process; the default-command owner reads the table in a child process with its own PATH.
2. Python default: the first of pyright-langserver and basedpyright-langserver on the PATH, with --stdio; neither installed is language-server-missing saying so.
3. Python environment: the check names python.pythonPath (workspace/configuration) only for a virtual environment in the checkout root, .venv then venv, with pyvenv.cfg and an interpreter, and only when Git tracks no file under it: pyright runs that interpreter once to list its search paths, so a committed .venv/bin/python would be code the checkout ships. pyrightconfig.json and [tool.pyright] are read by pyright itself (a venvPath and venv there win over pythonPath, read in pyright's findPythonSearchPaths). No venv: pyright uses the python on the PATH, as by default. Environments outside the checkout (Poetry, Hatch) need a venvPath/venv in the pyright configuration; finding them would mean running those tools. One server per checkout, at its root; a monorepo with several Python projects is read with the root's environment.
4. pyright needs each file opened (opensFiles): before it has listed the project's files it answers null about an unopened file (measured: the first question on Flask, about 60 ms after the start, got null; opened, it answered after its configuration came).
5. Outline: pyright lists a function's parameters under it on the line of its name, so the innermost symbol on that line was a parameter and the function read as unknown. declarationAt now takes the deepest symbol whose name starts at the definition, and only holders above it decide a type. outline.ts is in language-servers.
6. C#: csharp-ls only, from an entry. It waits for its solution before the first answer, answers about unopened files, and resolves inherited members, members through a value and extension methods. The client names the solution (csharp.solutionPathOverride): of the .sln/.slnx Git does not ignore, the one nearest the root, then by name (csharp-ls alone takes the one with most projects, ignored directories included). With no solution it loads the .csproj files itself. With none of them the project is unready (language-server-unready, once per checkout) and no server starts: TASK-367.16's reason, so no new skip reason and no coverage row change.
7. The Roslyn language server is not supported: it loads nothing until a solution/open notification, answers null until workspace/projectInitializationComplete, and restores packages over the network by default (projects.dotnet_enable_automatic_restore). Supporting it needs a server-specific wait that csharp-ls would never satisfy. Recorded in INSTALL.md and the design note.
8. Git listing for discovery: git ls-files with pathspecs, GIT_OPTIONAL_LOCKS=0 and CODE_CHECK_GIT_TIMEOUT_MS; a checkout Git cannot list lists nothing.

Manual runs (scratch, nixpkgs, nothing added to the repository): pyright 1.1.412 and basedpyright 1.39.8 on Flask 3.0.0 (735a470) with a .venv of its dependencies, a nine-part board through the real checkCode: no server 181 ms cold, 81 to 94 ms warm, two RELATIONSHIP_UNDRAWN information (candidate) and language-server-missing once; pyright 506 ms cold, 427 to 443 ms warm, the same two as warnings (resolved); basedpyright 537 ms cold, 450 to 654 ms warm, same findings. About 350 ms added per pass, load average about 7. BadRequestKeyError resolved into .venv/.../werkzeug/exceptions.py with the venv, to nothing without. csharp-ls 0.28.0 with dotnet-sdk 10.0.400 on a two-project solution: 2,659 to 2,808 ms per pass (the solution load), ANCHOR_MISMATCH resolved on an anchor at an inherited Post; with .csproj only, the same; with no project file, language-server-unready once and no server; with .NET 8, language-server-failed (exited with code 150). csharp-ls wrote design-time files under obj; no build, no restore. No server process was left after any run.

Close: Archboard server@TASK-367.14 branched from xLa4QqhH (TASK-367.16) at v159, Language servers description only, adopted at v162, summary set to the board's scope at v163. check --code with and without --variant: no line differs (44 findings each). Footprint against base 7509307ec: namedAndChanged Language servers; changedNotNamed Archboard server (e1a21b7a2 changes only the route test, the board stays true), Code check (e1a21b7a2 changes only its tests' server table; the other commits are other tasks'), Code facts (other tasks' commits). check: no diagnostics. Behind: Command interface lists ba6c3ef88, which changes only the check --code help text in vault.ts; the board stays true.

Gate, one lane at a time after 227407e27: lint exit 1 and fmt:check exit 1, each only on other agents' uncommitted files (objc-*.ts of TASK-367.10; terraform-modules.ts and module-reading.ts of TASK-368.11); type-check 0; build:frontend 0; test:modules 4,261 pass, 2 fail, both in src/runtime/code-check/tests/terraform-modules.test.ts, which TASK-368.11 is editing (still failing on a rerun); test:system 195 pass; test:repository 21 pass; test:serial-browser 24 pass. No language server or stand-in process was left after any lane.

Independent review (2026-10-06): NOT CLEAN before its fixes eb48927b1, 2221db4ae, d8bba899f, d1549f511 and 3fedfb0f4.

Safety probes (pyright 1.1.412, basedpyright 1.39.8, csharp-ls 0.28.0, roslyn-ls 5.11.0 from the nix store, run through the check's own session in scratch checkouts; a probe interpreter wrote a mark when it ran):
1. basedpyright runs <root>/.venv/bin/python by itself when the client names no pythonPath, venvPath or venv (its config code; measured). A checkout that committed .venv had that interpreter run 3 times although the check refused to name it. pyright has no such fallback (it runs python3 on the PATH). Must fix.
2. An untracked .venv link to a tracked tools/env: the check named the tracked interpreter; both servers ran it. Must fix.
3. A committed .Venv on a disk that ignores case: git ls-files -- .venv lists nothing with core.ignorecase set, while stat finds .venv/pyvenv.cfg, so the check would name the committed interpreter (Git part measured; macOS disk part by reasoning). Must fix.
4. A checkout Git cannot list: listedFiles answered [] and the check named the .venv interpreter (both ran it). Fail-open. Must fix.
5. pyrightconfig.json and [tool.pyright] cannot name an interpreter: only venvPath and venv, whose site-packages pyright reads as files (pyright source). Both servers remove the working directory from sys.path before their script imports json; -I only for the version. No finding.
6. pyvenv.cfg home pointing into the checkout, and the startup hooks (.pth, sitecustomize) of what is installed in an environment this machine made: left to the user, because only the user (or a script the user ran) writes them; recorded in python-environment.ts and INSTALL.md.
7. csharp-ls ran an Exec target hooked BeforeTargets=CoreCompile (touch ran); a property function that writes a file fails evaluation (MSBuild allows only reading System.IO.File members); a PackageReference with no assets file was not restored and made no connection; a project with Sdk=Microsoft.Build.NoTargets/3.7.56 made MSBuild try api.nuget.org over HTTPS 24 times (no-route network namespace, 13.6 s); design-time files under obj. Judgement: the C# row is safe only because it already needs an entry the user writes for a trusted checkout (ADR 0046's trust rule, and the 367.16 review's amendment covers files in ignored build output). INSTALL.md now says all three.
8. roslyn-ls named in the csharp entry answers an empty list: uses stay candidates, no skip says why. INSTALL.md now says so. Criterion #2 reads "csharp-ls or the Roslyn language server", so csharp-ls alone meets it; the gap is stated plainly.

Findings and fixes:
- python-environment.ts (eb48927b1): the interpreter of .venv or venv is named only when Git tracks neither the directory nor the interpreter where each really is (realpath), with :(icase,literal) pathspecs, and never when Git cannot answer; pyvenv.cfg no longer decides (a conda environment in .venv is named, as basedpyright would run it). A checkout whose .venv holds an interpreter that is not named starts no Python server: language-server-unready once. Probes 1-4 rerun: no server started, no mark; only an ignored .venv made on the machine ran.
- listed-files.ts: undefined when Git cannot list (also a failed spawn or timeout); dotnet-solution.ts says "Git cannot list the checkout's files" instead of "no project file".
- Boundary: the Python and C# looks now go through the row's once (keyed by checkout), so a pass runs them once per checkout rather than once per directory; the .NET look walks the untracked tree (0.09 s on an 8,670-file checkout).
- session.ts (2221db4ae): a question still looking at its project when close() ran started a server after close that was never stopped (reproduced with the stand-in). A new start now needs the pass open; owner in session.test.ts (red before, green after).
- nix-build-check.test.ts (d1549f511, TASK-367.22's file, my hunk only): the one code-check owner that still read this machine's language-servers.json now passes ownServers().
- evals/coverage.json, INSTALL.md, design-checks.md, authoring.md, the skip reason comment (d8bba899f); timing comment for the reused Git bound (3fedfb0f4).

Checked without a finding: the outline rule on real tsc --lsp (decorator, export, export default, a type alias member, an interface member, an arrow const): same choice as before; a one-line class (class OneLine { run() {} }) at its name now reads code where it read unknown, which is what the rule means. Swift not run (no sourcekit-lsp offline); by the rule's structure only one-line nests and a type holder below the named symbol change. ARCHBOARD_LANGUAGE_SERVERS is read like ARCHBOARD_OPENER_CONFIG and ARCHBOARD_REPOS (empty falls back), has no former name to refuse, and is test-facing like ARCHBOARD_OPENER_CONFIG, so it is not in INSTALL.md. No test needs a real pyright, basedpyright, csharp-ls or dotnet. Discovery: a solution in a submodule is not listed, and the code check does not read submodule files either.

Row contract (boundary with TASK-367.16): languageIds, defaultServer, initializationOptions, opensFiles, settle and project(root, file, once) -> { root, unready?, settings? } are each used by a row and honoured on every path (definition, outline, the failed-checkout rule of 7c49d2997, the per-pass once, one server per language and project root). Unready agrees for all three rows: a missing server decides first, an unready project is said once with its checkout and starts nothing. Board: Language servers stays true (it names examples of unready projects), so the vault is unchanged.

Gate after the fixes, one lane at a time: lint 0, fmt:check 0, type-check 0, build:frontend 0, test:modules 4,268 pass 0 fail, test:system 195 pass 0 fail (a first run had 44 failures from another agent's half-written code-facts edit, Export named 'distinct' not found in c-adapter.ts; the rerun passed), test:repository 21 pass, test:serial-browser 24 pass. No pyright, csharp-ls, roslyn-ls, stand-in or tsc --lsp process left.
<!-- SECTION:NOTES:END -->
