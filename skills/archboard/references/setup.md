# Set up a language server for a repository

Read this file when `archboard check --code` says `language-server-missing`
for a repository that you work in, or when you want the check to resolve the
uses that only a language server can place. The check matches a name by its
spelling. A language server (a program that knows where code defines a name)
resolves the name to its definition.

## What runs without configuration

TypeScript needs no configuration. The check runs the native `tsc --lsp
--stdio` of the `typescript` package in `node_modules/typescript` at the root of
the checkout, when that package is version 7 or later and has the native program
for the machine (`@typescript/typescript-<platform>-<arch>`). TypeScript 7 is the
first version that is a language server. For an older version, for a checkout
with no TypeScript, or for a package of a monorepo, the check runs the `tsc` that
archboard installs. In a monorepo, the check reads the root only. A package that
installs another version than the root uses the version at the root.

## What a configured server runs

Python, C, C++, Objective-C, C# and Swift have no default server. A language
server reads a project the way an editor does, and that runs code of the
repository:

- pyright runs the interpreter of the `.venv`, and the startup hooks of the
  packages in it.
- clangd runs the compilers and plugins that `compile_commands.json` names.
- csharp-ls evaluates the MSBuild files of the solution.
- sourcekit-lsp evaluates `Package.swift`.

A configured server runs the code of the repository. The check starts it with the
command, the arguments and the environment that you give it, and adds nothing.
Configure a server only for a repository that you work in. Never configure one
for a repository that you only read. Tell the user when you configure one.

## Steps

1. Install the server: `pyright-langserver` for Python, `clangd` for C, C++ and
   Objective-C, `csharp-ls` for C#, or `sourcekit-lsp` for Swift.
2. For C, C++ and Objective-C, generate a `compile_commands.json`. For CMake, run
   `cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, which builds nothing.
   Other build tools need `bear -- make`, which builds. Without the file, clangd
   guesses its flags, and the check says `language-server-unready`.
3. For Swift, run `swift build` once, because sourcekit-lsp reads the index that
   a build writes. The check never builds.
4. If the checkout is not registered, run `archboard repo add <dir>`.
5. Run `archboard repo language-server <python|csharp|swift|c> <command>`. Add
   `--arg=<argument>` for each argument. The language `c` covers C, C++ and
   Objective-C.

Examples:

```bash
archboard repo language-server python pyright-langserver --arg=--stdio
archboard repo language-server c clangd
archboard repo language-server csharp csharp-ls
archboard repo language-server swift sourcekit-lsp
```

`--remove` removes the server of a language. `--repo <identity>` names another
registered checkout, and without it the command uses the checkout of the working
directory. `archboard repo list` shows the configured servers of each checkout.
The configuration stays on this machine, and `archboard repo forget` removes it
with the checkout.

clangd keeps its index in `.cache/clangd/index` in the directory that holds
`compile_commands.json`. Add `.cache/` to the `.gitignore` of the repository.

## What the answer says

If a checkout has no configured server for a language, the answer says
`language-server-missing` once for the checkout and the language, and it names the
command that configures one. The uses stay candidates. A project that the server
cannot answer about yet is `language-server-unready`. A server that did not start
or did not answer is `language-server-failed`. The installation guide has the
details for each server: [generated/INSTALL.md](generated/INSTALL.md).
