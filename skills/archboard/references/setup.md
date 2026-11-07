# Set up source inspection

A language server resolves code names to their definitions.
Without one, `archboard check code` matches names by spelling and leaves uses as candidates.
Configure a server for `language-server-missing` or when the task needs more precise evidence.

Configure servers only in repositories that you work in, never repositories that you only read.
Servers can run repository code, as an editor does.
Tell the user when you configure one.
TypeScript needs no configuration. Other languages start no server until configured.

## TypeScript selection

Archboard uses the checkout's `tsc --lsp --stdio` only when all these conditions hold:

- `node_modules/typescript` exists at the checkout root.
- It declares TypeScript 7 or later, which supports `tsc --lsp`.
- The native `@typescript/typescript-<platform>-<arch>` program exists beside or inside that package.
- The package and native program resolve inside the checkout, including through links.

Otherwise, it uses the TypeScript package installed with Archboard.
This fallback covers older or missing packages, missing native programs, and links outside the checkout.
Monorepos use the root version, regardless of versions in their packages.

## Server prerequisites

Python, C, C++, Objective-C, C#, Swift, Rust, and Go have no default server.
Install the server for the language that needs inspection:

| Language            | Program and installation                                                                                                | Requirements and code it can run                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Python              | `pyright-langserver`: `npm install -g pyright`. Alternative: `pipx install basedpyright` for `basedpyright-langserver`. | Pyright runs the `.venv` interpreter and package startup hooks.                                                                     |
| C, C++, Objective-C | `clangd`: `apt install clangd`, `brew install llvm`, or `nix profile install nixpkgs#clang-tools`.                      | Compile commands can run helpers for a `native` GPU. `--query-driver` also runs the compiler.                                       |
| C#                  | `csharp-ls`: `dotnet tool install --global csharp-ls`.                                                                  | The Archboard server needs the .NET SDK on `PATH`. csharp-ls evaluates solution MSBuild files.                                      |
| Swift               | `sourcekit-lsp` from the Swift toolchain.                                                                               | It evaluates `Package.swift`. Use Swift 6.1 or later for automatic initial builds and indexing.                                     |
| Rust                | `rust-analyzer`: `rustup component add rust-analyzer rust-src` or `nix profile install nixpkgs#rust-analyzer`.          | The Archboard server needs `cargo` on `PATH` and standard-library source through `rust-src` or Nix's `RUST_SRC_PATH`.               |
| Go                  | `gopls`: `go install golang.org/x/tools/gopls@latest` or `nix profile install nixpkgs#gopls`.                           | The Archboard server needs `go` on `PATH`. gopls can download modules and the toolchain from `go.mod`, and run C compilers for cgo. |

Rust-analyzer runs `cargo metadata`, build scripts, procedural macros, and `cargo check` after loading.
The Archboard server uses configured commands and arguments with its own environment and startup `PATH`.
It adds no flags, variables, or rewritten files.
Its `PATH` can differ from your shell's.

For C, C++, and Objective-C, generate `compile_commands.json`.
With CMake, run `cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, which builds nothing.
For other build tools, `bear -- make` builds the project once.
Without the file, clangd guesses flags and reports `language-server-unready`.

Keep clangd background indexing enabled. Do not pass `--background-index=false`.
Inspection waits for both clangd and Swift indexes to become ready.

## Register and configure

If the checkout is unregistered, run `archboard repo add <dir>`.
For a repository already registered elsewhere, this adds another known checkout.
Inspection uses the chosen checkout, except that a vault uses its own checkout for its repository.
Tell the user when configuration applies to an unchosen checkout and therefore cannot affect the current inspection.
Run `archboard repo use <dir>` only when requested because it changes what every model on this machine reads.

In the checkout, run `archboard repo language-server <language> <command>`.
Use one `--arg=<argument>` per argument.
Supported languages are `python`, `csharp`, `swift`, `c`, `rust`, and `go`.
`c` covers C, C++, and Objective-C:

```bash
archboard repo language-server python pyright-langserver --arg=--stdio
archboard repo language-server c clangd
archboard repo language-server csharp csharp-ls
archboard repo language-server swift sourcekit-lsp
archboard repo language-server rust rust-analyzer
archboard repo language-server go gopls
```

For basedpyright, replace `pyright-langserver` with `basedpyright-langserver`.
`--repo <identity>` selects another repository's chosen checkout.
Without it, configuration uses the known checkout containing the working directory.
`--remove` removes that language's server.

`archboard repo list` shows each checkout's servers.
Configuration stays on this machine. `repo forget` removes it with the checkout.
Registering the same directory again preserves it.
An unregistered vault checkout has no configured servers.

Run `archboard check code` after configuration. No Archboard restart is needed.
If using clangd, add `.cache/` to the repository's `.gitignore` when absent.
Its index lives in `.cache/clangd/index` beside `compile_commands.json`, or beside `build` when the compilation file is there.

## Read diagnostics

`language-server-missing` means missing configuration or program.
The detail gives the configuration command.
If the program is absent from the Archboard server's `PATH`, run `command -v <program>` in your shell.
Configure that absolute path as the command.

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
Archboard keeps no server output. Run its configured command in the repository to read the failure.
In every failure case, uses remain candidates.
For installation details, read [the installation guide](generated/INSTALL.md).
