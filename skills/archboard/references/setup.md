# Set up a language server for a repository

If `archboard check code` says `language-server-missing` for a repository that
you work in, read this file. If you want the check to resolve the uses that only
a language server can place, read it too. The check matches a name by its
spelling. A language server (a program that knows where code defines a name)
resolves the name to its definition.

## When to configure a server

Configure a server only for a repository that you work in. A configured server
runs code of the repository, as an editor does. So never configure one for a
repository that you only read. When you configure a server, tell the user.

TypeScript needs no configuration. For every other language, the check starts no
server until you configure one.

## Which TypeScript runs

If all of these are true, the check runs `tsc --lsp --stdio` from the
`typescript` package that the checkout installs:

- The package is `node_modules/typescript` at the root of the checkout.
- The package declares version 7 or later. TypeScript 7 is the first version that
  has `tsc --lsp`.
- The native program for the machine is installed, beside the package or inside
  it: `@typescript/typescript-<platform>-<arch>`.
- The package and the program are inside the checkout once their links resolve.

Otherwise the check runs the `tsc` of the `typescript` package that archboard
installs. This happens for an older TypeScript, for no TypeScript, for no native
program, and for a link that leads out of the checkout. In a monorepo, the check
reads the root only. A package that installs another version than the root
uses the version at the root.

## What a configured server runs

Python, C, C++, Objective-C, C#, Swift and Rust have no default server. A language
server reads a project as an editor does, and that runs code of the repository:

- pyright runs the interpreter of the `.venv`, and the startup hooks of the
  packages in it.
- If a compile command asks for the `native` GPU and names a helper program,
  clangd runs that program. If you pass `--query-driver`, clangd also runs the
  compiler of a command.
- csharp-ls evaluates the MSBuild files of the solution.
- sourcekit-lsp evaluates `Package.swift`.
- rust-analyzer runs `cargo metadata`, the build scripts and the procedural
  macros of the Cargo workspace, and `cargo check` after it loads.

The Archboard server starts the configured server. The check uses the command,
the arguments and the environment of the Archboard server. It adds no flag, no
variable and no rewritten file. The Archboard server looks up a command that is a
name on the `PATH` that it started with. That `PATH` can differ from the `PATH`
of your shell.

## Steps

1. Install the server program.
   - Python: `pyright-langserver` (`npm install -g pyright`), or
     `basedpyright-langserver` (`pipx install basedpyright`).
   - C, C++ and Objective-C: `clangd` (`apt install clangd`, `brew install llvm`
     or `nix profile install nixpkgs#clang-tools`).
   - C#: `csharp-ls` (`dotnet tool install --global csharp-ls`). It needs the
     .NET SDK on the `PATH` of the Archboard server.
   - Swift: `sourcekit-lsp`. It ships with the Swift toolchain.
   - Rust: `rust-analyzer` (`rustup component add rust-analyzer rust-src`, or
     `nix profile install nixpkgs#rust-analyzer`). It needs `cargo` on the
     `PATH` of the Archboard server, and the source of the standard library:
     the `rust-src` component, or `RUST_SRC_PATH` on Nix.
2. For C, C++ and Objective-C, generate `compile_commands.json`. For CMake, run
   `cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`. This builds nothing. For
   other build tools, run `bear -- make`. This builds the project once. Without
   the file, clangd guesses its flags, and the check says `language-server-unready`.
3. For Swift, use Swift 6.1 or later. sourcekit-lsp builds a package itself on
   the first run to prepare its background index. The check waits until the
   index is ready before it asks for definitions.
4. If the repository is not registered, run `archboard repo add <dir>`. If it
   is registered at another directory, `repo add` makes this directory a second
   known checkout, and the check reads only the chosen one, or the one that
   holds the vault for its own repository, so the servers of step 5 take effect
   only if this directory is chosen or holds the vault. Say so to the user. Run `archboard repo use <dir>` only when the user asks, because it
   changes what every board on this machine reads.
5. In the repository, run `archboard repo language-server <language> <command>`.
   Write one `--arg=<argument>` for each argument. The language is `python`,
   `csharp`, `swift`, `c` or `rust`. The language `c` covers C, C++ and Objective-C.
6. Run `archboard check code`. Read the answer for the language, as the next
   section says.
7. If you use clangd and the `.gitignore` of the repository does not list `.cache/`,
   add it. clangd keeps its index in `.cache/clangd/index`. The `.cache`
   directory is next to `compile_commands.json`. If that file is in a `build`
   directory, the `.cache` directory is next to `build`.

Examples for step 5:

```bash
archboard repo language-server python pyright-langserver --arg=--stdio
archboard repo language-server c clangd
archboard repo language-server csharp csharp-ls
archboard repo language-server swift sourcekit-lsp
archboard repo language-server rust rust-analyzer
```

For basedpyright, use `basedpyright-langserver` in place of
`pyright-langserver`. Do not pass `--background-index=false` to clangd. The check
waits for the index of clangd until it finishes.

`--remove` removes the server of a language. `--repo <identity>` names the chosen
checkout of another repository. Without it, the command uses the known checkout
that holds the working directory. `archboard repo list` shows the configured servers
of each checkout. The configuration stays on this machine. `archboard repo forget`
removes it with the checkout. Registering the same directory again keeps it. The check
reads the servers of the checkout it reads: the chosen checkout, or the one that holds
the vault for its own repository, which has servers only if it is registered.

The check reads the configuration each time it runs, so you do not restart the
Archboard server.

## Read the answer

If the answer still says `language-server-missing` for the language, the
configuration or the program is the cause. The detail names the command that
configures a server. If the detail says that the program is not on the `PATH` of
the Archboard server, run `command -v <program>`. Give that absolute path as the
command.

If the answer says `language-server-unready`, the project lacks what the server
reads. For C, C++ and Objective-C, that is a `compile_commands.json`. For Swift, it is a `Package.swift` that holds the file. For Rust, it is a `Cargo.toml` that holds the file. For C#, it is a solution or project file. The detail
names the project.

The check has no time limit. Cancel the command to stop waiting. The output
starts with the time for each step, and JSON carries those times in `code.timings`.

If the answer says `language-server-failed`, the server did not start or stopped. The check keeps no output of the server. Run
the command in the repository to read its output.

In every case, the uses stay candidates. The installation guide has the details
for each server: [generated/INSTALL.md](generated/INSTALL.md).
