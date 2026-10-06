---
id: TASK-367.12
title: Code facts for Swift
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 15:48'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 620000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In Swift, `import` names a module, and the files of one module see each other without an import. File dependencies come from references to names that another file defines, and module dependencies come from `Package.swift`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Type and function references resolve by name within a module, including extensions that span files
- [ ] #2 `Package.swift` targets and their dependencies give module-level dependencies
- [ ] #3 Definitions carry their access level: `open`, `public`, `package`, `internal`, `fileprivate` or `private`
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to Swift files or targets
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: no Archboard server proposal unless the Code facts description must change; it names the adapter table and the module reading (inModule) generically, so a Swift entry is one more row.
1. New files in src/runtime/code-facts/lib: swift.scm (query against @lumis-sh/wasm-swift 0.26.3, grammar 0.7.3: declarations, names in code and in types, imports, ProcessInfo environment names, ERROR); swift-adapter.ts (references with call or import evidence and type-only; each import of a module also a build-dependency reference of the module name); swift-definitions.ts (types, extensions' members qualified by the extended type, functions, properties, initializers, enum cases, protocol requirements, typealiases; access level in Swift's word, the default internal, inherited from an extension or a protocol; exposed = open, public or package, and for a member also an exposed holder); swift-package.ts (Package.swift read statically through the same grammar: targets with their kind, directory (path:, else Sources/Source/src/srcs, Tests for test targets, Plugins for plugins) and dependencies; library products; its facts: a definition per target, a build-dependency reference per dependency); swift-resolution.ts (resolver: the package and target of a file; inModule (TASK-367.11's contract) gives a use a target where one other file of its module defines the name, else one exposed definition of a local module the file imports; an import of a local target that the importing target depends on leads to the target's directory).
2. Shared: one entry in ADAPTERS (.swift and the whole name Package.swift), swift in AdapterName. Contract: a Target path ending in / names a directory (the module an import names), so the evidence of a build dependency reaches the part bound to the target directory with no change to the code check.
3. Tests: code-facts/tests/swift-facts.test.ts over fixtures/swift-shop (two targets, App depends on Core, an extension in another file, every access level, a test target); code-check/tests/swift-check.test.ts (anchor, binding, undrawn, backwards on parts bound to target directories and files).
4. Try it on apple/swift-argument-parser cloned into scratch, through a temporary vault with bound parts; record the result in design-checks.md; authoring.md names Swift.
5. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (uncommitted yet): src/runtime/code-facts/lib/swift.scm, swift-adapter.ts (facts), swift-definitions.ts (definitions and access levels), swift-package.ts (Package.swift read statically), swift-resolution.ts (resolver with inModule). One entry in ADAPTERS (.swift, and the whole name Package.swift read by the manifest reading), swift in AdapterName. Owners: code-facts/tests/swift-facts.test.ts over fixtures/swift-shop, code-check/tests/swift-check.test.ts.

Contract: reuses TASK-367.11's inModule and ReadParsed for same-module names, no second mechanism. One extension, documentation only: a Target path that ends with / names a directory (the module an import names). The code check's ownersOfFile falls back to the deepest bound directory, and Sources/Core/ starts with Sources/Core/, so a build dependency reaches the part bound to the target directory with no change to the code check. facts.ts: Definition.exposed says what exposed means in Swift.

Decisions the ADR left open:
1. Access level (criterion 3): the word as written (open, public, package, internal, fileprivate, private; private(set) is a setter's level and ignored), else Swift's default: internal; the level an extension writes for its members (private extension gives fileprivate); fileprivate for a member of a private or file-private type; an enum's cases and a protocol's requirements take their holder's level. exposed = open, public or package, and for a member also an exposed holder. package counts as exposed because the modules of one package see it, and a target is a module.
2. Definitions: file-level declarations and the members of types, extensions and protocols, qualified by their types (Ledger.post, Ledger.Kind.debit, Ledger.init). An extension is no definition: its members are members of the extended type (Ledger.refund in Ledger+Refund.swift). Locals, subscripts, deinit and operator functions are not definitions.
3. References: a name in a type, a generic constraint or an inheritance clause is type-only import evidence (the syntax cannot tell a superclass from a protocol); every other use is a call, a type name in an attribute too (a property wrapper runs). A name after . is spelled with its chain from a name, else bare, as TypeScript and Python do. The member a leading . names (.shared, case .debit) is no use. Strings: ProcessInfo.processInfo.environment["N"] and getenv("N") are environment names; Notification.Name("N") is an event.
4. Imports: one Import per import declaration naming the module, names [], reexport for @_exported; it resolves to no file (a module is not a file). Each import is also a reference to the module name of kind build-dependency: it leads to the target's directory when the importing target depends on that local target in Package.swift. So the evidence of a target dependency sits at the import, where the bound sources name the module; the manifest makes it resolved. A declared dependency no file imports gives no evidence.
5. Same-module names (criterion 1), through inModule: a use leads to the one other file of its module that declares its spelling, the longest prefix first (Ledger.refund before Ledger), else to the one file of an imported local module that exposes it; Core.Ledger looks only in Core. A name the file declares itself stays the file's (the code check's same-file reading). Two files declaring it: unresolved. A bare name matches file-level declarations only, never a member. private/fileprivate definitions are seen by no other file; another module sees only exposed ones (@testable is not read). The first name of a spelling must be declared in the module, an imported module or the file: String.init in a file that extends String stays unresolved, because String's own members are not read (found on swift-argument-parser). Such uses are resolved, as C#'s same-project names are (TASK-367.11), because the manifest and the module name the files and Swift forbids two declarations of a type name in a module; sourcekit-lsp (TASK-367.16) resolves uses through a value and overloads.
6. Package.swift (criterion 2): read from its tree, never run. A target is a factory call (.target, .executableTarget, .testTarget, .macro, .plugin, .systemLibrary, .binaryTarget, also Target.target) with a literal name: and not inside a dependencies: or products: argument (.plugin in products is a product). path: is read when literal; else Sources/<name> (then Source, src, srcs, the first that holds a file), Tests/<name> for a test target, Plugins/<name> for a plugin. Dependencies: string literals, .target(name:), .byName(name:), .product(name:package:). A computed name or path is not read. Manifest facts are the file's Swift facts plus a definition per target (visibility = its kind, exposed = a library product names it) and a build-dependency reference per dependency, which leads to the target's directory. The resolver reads the package through ReadParsed (the manifest's facts carry the package).
7. Modules: the nearest Package.swift above a file is its package; the target with the deepest directory above the file is its module. A file no target holds (an Xcode project) is in no module and its uses lead nowhere: no .pbxproj reading.
8. Unparsed: ERROR nodes, as every adapter.

Commits: 7fc390ecf feat(code-facts) (adapter, resolver, manifest reading, owners, fixture; adapters.ts and facts.ts hunks cut against HEAD), 63978c58b docs(check) (authoring.md, design-checks.md), 67161df69 docs(vault). Simplified after building: a product of another package never shares a name with a local target (SwiftPM refuses the module clash), so the per-line dependency map and the product flag went away.

swift-argument-parser (efd239f, scratch clone): 170 .swift files, cold 435 to 562 ms (grammar load included), warm 27 to 30 ms; 3,958 definitions, 7,929 references, 265 imports; 1,180 uses lead to a file or module (540 call, 461 import, 179 build-dependency). Package.swift: 21 targets and 26 dependencies read statically. 2,085 lines in 13 files unparsed, nearly all tests: Swift Testing #expect/#require, #_sourceLocation, if let x { shorthand put the rest of a file in one ERROR; the library lost 3 lines. A temporary vault of 13 parts (the library directory with 7 subdirectories as children, tool info, the math example, generate-manual, a part bound to the extension member ParsableCommand.main, a planted binding) through the real checkCode: 435 to 612 ms cold, 161 ms warm. Findings, each right: BINDING_SYMBOL_MISSING (planted); ANCHOR_SYMBOL_MISSING (planted); ANCHOR_MISMATCH on math -> ArgumentParser (call anchored at ParsableCommand, which Math.swift only conforms to: import evidence; my anchor was wrong); RELATIONSHIP_UNDRAWN on ArgumentParser from generate-manual (build-dependency, AuthorArgument.swift:12 import ArgumentParser); RELATIONSHIP_UNDRAWN on six library subdirectories, every piece a resolved same-module name (CommandParser, MessageInfo, CompletionsGenerator, OptionGroup, @Argument, configurationFailure, Platform, Tree, JSONEncoder, which the module declares and so shadows Foundation's); RELATIONSHIP_BACKWARDS on Tool info -> ArgumentParser. The first run resolved String.init in Platform.swift to an extension of String in the library, a false resolution: fixed (a spelling resolves only where its first name is declared in the module, an imported module or the file), owner in swift-facts.test.ts. Skips: exposure-unknown on the library part, because module-exposure.ts has no Swift rule (left open), and text-only for .md/.png/.txt.

Closing: Archboard server@TASK-367.12 branched from dGcizQWR (v116), Code facts description gains a Swift clause; the description is capped at 2,000 characters, so the adapter-table sentence and the definition-search sentence were shortened. check --code with and without --variant TASK-367.12: no line differs (39 findings, none about Code facts). Footprint against base 2a86f00d3: namedAndChanged Code facts (7fc390ecf); changedNotNamed Code check (7fc390ecf adds only tests/swift-check.test.ts, the board stays true); namedNotChanged none; 5 drill-down parts skipped. current was the proposal's parent; adopted at v122 after other tasks' drafts moved the version; summary set to the board's scope. ./bin/dogfood check: no diagnostics. behind: no part bound to code this task changed is behind.

Gate (lanes one at a time, working tree with other agents' edits): lint exit 1 only on zz-debug-11.test.ts (lint:tests, another agent's scratch file); lint:policy exit 1 only on evidence.ts max-lines and csharp-adapter/csharp-resolution (other agents); fmt:check exit 1 only on zz-debug-11.test.ts; type-check 0; build:frontend 0; test:modules 4192 pass 1 fail (semantic-renderer wide-boards Archboard server (track) over its 3,000 ms budget at 4,793 ms under load average 12 to 15; fails alone too, renderer untouched); test:system 195/0; test:repository 20/0; test:serial-browser 0. HEAD+patch in an exported copy: code-facts and code-check owners 105/0, my files lint clean.

Left open: (1) module-exposure.ts has no Swift rule, so a container bound to a Swift target directory is skipped as exposure-unknown (TASK-368.10 territory: module = target directory, root files = its .swift files, exposed = open/public/package). (2) Xcode projects (.pbxproj) are not read: files outside a Package.swift target belong to no module. (3) @testable import is not read, so a test file sees only exposed names of the module it tests. (4) A declared dependency no file imports gives no evidence; exclude:/sources: of a target are not read. (5) ANCHOR_MISMATCH for a Swift anchor follows a resolved same-module target like any import. For TASK-367.16: candidates left unresolved are uses through a value (ledger.post), bare member names (implicit self), overloads declared in two files, and members of types from outside the checkout; sourcekit-lsp must start from an entry in language-servers.json, read an existing index (.build/index or the IndexStoreDB of a built package) and never build; the languages.ts table needs a swift row with languageId swift for .swift.
<!-- SECTION:NOTES:END -->
