# Set up source inspection

A language server resolves code names to their definitions.
Without one, `archboard check code` matches names by spelling and leaves uses as candidates.
Configure the servers of a repository when you set up Archboard in it.
Configure them also for `language-server-missing` or when the task needs more precise evidence.

A repository names its servers in `.archboard/language-servers.json` at the root of its checkout.
Archboard reads that file in every checkout that it reads, with no trust step.
Writing the file changes the repository, so write it only in repositories that you work in.
In a repository that you only read, use the file that it has and write none.
Servers can run repository code, as an editor does.
Tell the user when you configure one.
TypeScript has a default server. Other languages start no server until a file names one.

## TypeScript selection

A server that a file names, for example with `archboard repo language-server typescript <command>`, wins.
Without one, Archboard reads `node_modules/typescript` at the checkout root.
The package must resolve inside the checkout, including through links.
Then Archboard uses the first of these that applies:

1. TypeScript 7 or later, with the native `@typescript/typescript-<platform>-<arch>` program beside or inside that package:
   Archboard runs `tsc --lsp --stdio`.
2. A TypeScript before version 7, which has no `--lsp`: Archboard runs `typescript-language-server --stdio`
   from `node_modules/.bin` of the checkout, else from the `PATH` of the Archboard server.
   That server runs the `tsserver` of the checkout's TypeScript.
3. When Archboard runs from a clone: the `tsc` of the TypeScript package installed with Archboard.
   An Archboard release ships no TypeScript.

If none applies, inspection reports `language-server-missing` for TypeScript.
For a TypeScript before version 7, tell the user to install `typescript-language-server` in the repository or on the machine.
Do not install it yourself unless the user asks.
Monorepos use the root version, regardless of versions in their packages.

Each `time: language server typescript` line names the program that answered.
For a server that Archboard chose, it also names the TypeScript version and whose it is.
If inspection and the repository's compiler disagree, read that line first.

## Server prerequisites

Python, C, C++, Objective-C, C#, Swift, Rust, and Go have no default server.
Install the server for each language that the repository uses:

| Language            | Program and installation                                                                                                | Requirements and code it can run                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Python              | `pyright-langserver`: `npm install -g pyright`. Alternative: `pipx install basedpyright` for `basedpyright-langserver`. | Pyright runs the `.venv` interpreter and package startup hooks.                                                                     |
| C, C++, Objective-C | `clangd`: `apt install clangd`, `brew install llvm`, or `nix profile install nixpkgs#clang-tools`.                      | Compile commands can run helpers for a `native` GPU. `--query-driver` also runs the compiler.                                       |
| C#                  | `csharp-ls`: `dotnet tool install --global csharp-ls`.                                                                  | The Archboard server needs the .NET SDK on `PATH`. csharp-ls evaluates solution MSBuild files.                                      |
| Swift               | `sourcekit-lsp` from the Swift toolchain.                                                                               | It evaluates `Package.swift`. Use Swift 6.1 or later for automatic initial builds and indexing.                                     |
| Rust                | `rust-analyzer`: `rustup component add rust-analyzer rust-src` or `nix profile install nixpkgs#rust-analyzer`.          | The Archboard server needs `cargo` on `PATH` and standard-library source through `rust-src` or Nix's `RUST_SRC_PATH`.               |
| Go                  | `gopls`: `go install golang.org/x/tools/gopls@latest` or `nix profile install nixpkgs#gopls`.                           | The Archboard server needs `go` on `PATH`. gopls can download modules and the toolchain from `go.mod`, and run C compilers for cgo. |

Rust-analyzer runs `cargo metadata`, build scripts, procedural macros, and `cargo check` after loading.
The Archboard server uses the named commands and arguments with its own environment and startup `PATH`.
It adds no flags, variables, or rewritten files.
Its `PATH` can differ from your shell's.

For C, C++, and Objective-C, generate `compile_commands.json`.
With CMake, run `cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, which builds nothing.
For other build tools, `bear -- make` builds the project once.
Without the file, clangd guesses flags and reports `language-server-unready`.

Keep clangd background indexing enabled. Do not pass `--background-index=false`.
Inspection waits for both clangd and Swift indexes to become ready.

## Name the servers

If the repository has no vault, make it with `archboard model init` first, as [the skill](../SKILL.md#make-the-vault) says.
The file needs no registration of the checkout.

When you set up Archboard in a repository, find the languages that it uses.
Install a server for each language that has no default.
A repository on TypeScript 7 or later needs no entry for TypeScript.
Then name each server in the checkout, in the working directory of the repository:
`archboard repo language-server <language> <command>`.
Use one `--arg=<argument>` per argument.
Supported languages are `python`, `csharp`, `swift`, `c`, `rust`, `go`, and `typescript`.
`c` covers C, C++, and Objective-C:

```bash
archboard repo language-server python pyright-langserver --arg=--stdio
archboard repo language-server c clangd
archboard repo language-server csharp csharp-ls
archboard repo language-server swift sourcekit-lsp
archboard repo language-server rust rust-analyzer
archboard repo language-server go gopls
archboard repo language-server typescript typescript-language-server --arg=--stdio
```

For basedpyright, replace `pyright-langserver` with `basedpyright-langserver`.
The command writes `.archboard/language-servers.json`, which maps a language to a `command` and optional `args`.
Tell the user to commit that file with the vault, so that every machine and CI run uses the same servers.
`--repo <identity>` writes the file of another repository's chosen checkout.
Without it, the command writes the file of the checkout that holds the working directory.
`--remove` removes that language's server. The command deletes a file that is left with no server.
A command that you type as a path is read from the working directory.
The file keeps a path inside the checkout as a path from the checkout root, and any other path as an absolute path.

In the repository file, a command with a `/` that is not absolute is a path from the checkout root.
So a repository can commit a wrapper script that starts its server through its own tools, such as `nix develop`, `devenv shell` or `devbox run`.
For example, `archboard repo language-server rust scripts/rust-analyzer` names a script of the repository.
The same works with a program and arguments: `archboard repo language-server rust nix --arg=develop --arg=--command --arg=rust-analyzer`.

For a server for every repository on this machine, add `--global`.
That writes `language-servers.json` in the Archboard state directory, beside `repos.json`.
It works outside a checkout and takes no `--repo`.
It names a server for each language that the repository file leaves out, and the repository file wins for each language.
Its command is a name on the `PATH` or an absolute path.

Run `archboard repo language-server` with no language to see both files and the servers that each names.
The answer is JSON with `repo`, `root`, `repository` and `global`.
Each of the last two has `file`, `servers` and, when the file cannot be read, `problem`.
`archboard repo list` shows no servers, because the registry holds none.
The command refuses to change an invalid file and exits with 1.
Fix or delete the file, and run it again.

Run `archboard check code` after you name servers. No Archboard restart is needed.
A check reads the global file once, and each checkout's file once at its start.
If using clangd, add `.cache/` to the repository's `.gitignore` when absent.
Its index lives in `.cache/clangd/index` beside `compile_commands.json`, or beside `build` when the compilation file is there.

## Read diagnostics

`language-server-missing` means that no file names a server, that a file cannot be read, or that the program is missing.
When no file names a server, the detail says that neither the checkout's `.archboard/language-servers.json` nor the global `language-servers.json` names one, and gives the command that names it.
An invalid file decides every language that it could name, so the detail gives the path of the file and the problem.
An invalid repository file blocks every language of that checkout, TypeScript included.
Fix or delete that file.
If the program is absent from the Archboard server's `PATH`, run `command -v <program>` in your shell.
Name that absolute path as the command, or a wrapper script of the repository.

`language-server-unready` means that the project lacks required input:

| Language            | Input that must contain or cover the file |
| ------------------- | ----------------------------------------- |
| C, C++, Objective-C | `compile_commands.json`                   |
| Swift               | `Package.swift`                           |
| Rust                | `Cargo.toml`                              |
| Go                  | `go.mod`                                  |
| C#                  | A solution or project file                |

The detail names the project.
Inspection has no time limit. Cancel the command to stop waiting.
Output starts with step durations, also available as JSON `code.timings`.

`language-server-failed` means that the server failed to start or stopped.
Archboard keeps no server output. Run its named command in the repository to read the failure.
In every failure case, uses remain candidates.
For installation details, read [the installation guide](https://github.com/miklschmidt/archboard/blob/main/INSTALL.md).
