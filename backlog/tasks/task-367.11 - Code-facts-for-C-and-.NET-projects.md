---
id: TASK-367.11
title: Code facts for C# and .NET projects
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 16:42'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 619000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In C#, the files of one project see each other without an import, and `using` names a namespace, not a file. File dependencies come from references to names that another file defines, and project dependencies come from the project files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Type and member references resolve by name within a project, including partial classes that span files
- [x] #2 `ProjectReference` and `PackageReference` in `.csproj` files give project-level dependencies
- [x] #3 Definitions carry their visibility: `public`, `internal`, `private`, and `InternalsVisibleTo`
- [x] #4 The anchor, binding, undrawn and backwards checks work for parts bound to C# files or projects
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.11 changes the description of Code facts (the C# adapter: definitions with C# accessibility and InternalsVisibleTo, name resolution through enclosing types, namespaces and using directives to the file of the project or a referenced project that declares it, which the project file passes on; .csproj ProjectReference and PackageReference as build dependencies; build dependency joins call and import as an evidence kind of references). No new part or relationship: the adapter lives inside src/runtime/code-facts. No other board draws code facts.
1. New files: lib/csharp.scm (query against tree-sitter-c-sharp 0.23.5: uses, names bound where written, type positions, using directives, environment names, InternalsVisibleTo friends, ERROR), lib/csharp-adapter.ts (references with call or import and type-only; usings as imports, global using as a re-export; a base class is a use at run time, an interface and every later base entry a type), lib/csharp-definitions.ts (a tree walk: types, members and enum members qualified by namespace and enclosing types; visibility as C# writes it or its default; exposed when public, protected or protected internal in an exposed holder), lib/csharp-project.ts (.csproj facts from the XML with no package: ProjectReference and PackageReference as build-dependency references through imports, InternalsVisibleTo items and assembly attributes as friend names; no MSBuild evaluation, Condition not evaluated), lib/csharp-resolution.ts (the resolver: ProjectReference paths against the project file's directory; a per-pass index of each project's files (the .cs files below its project file, not below a nested project, bin or obj) and what they declare; lookup of a name through the prefixes of its innermost enclosing definition, the file's aliases and usings and the project's global usings, in the project and the projects it references transitively; InternalsVisibleTo per project).
2. Contract extension, the smallest that expresses name resolution within a project: an optional hook on ImportResolver that gets the file's parsed facts and gives the targets of references no import names and the definitions as the project declares them (InternalsVisibleTo); a third resolver argument that reads another file's parsed facts through the cache, one parse at a time; Target.via, the files that pass a name on (the project file of the declaring project), honoured by definitionSite so a part bound to a .csproj holds and owns what its project declares; Reference.kind adds build-dependency; ReferenceVia adds assembly (a friend name InternalsVisibleTo writes as a string). reader.ts awaits the hook. adapters.ts: one entry (csharp: .cs and .csproj); facts.ts: AdapterName csharp.
3. Tests: code-facts/tests/csharp-facts.test.ts over the fixture solution code-facts/tests/fixtures/csharp-shop (two projects, a project reference, a partial class across two files, an internal type with InternalsVisibleTo from an attribute and from the .csproj, a package reference, unparsed code); code-check/tests/csharp-check.test.ts (anchor, binding, undrawn and backwards checks on parts bound to C# files, a project directory and a .csproj).
4. Try it on a real .NET repository from the dotnet organization cloned into the session scratch directory, through a temporary vault with bound parts; record what it finds and the time in docs/design/design-checks.md; authoring.md names the languages the check reads.
5. Close the proposal per archboard-dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (e8f1d0d61 adapter and contract, 2bdc0449d value names and #if, 0aeef3684 friend names, ff125b055 docs): src/runtime/code-facts gains csharp.scm (query against tree-sitter-c-sharp 0.23.5), csharp-adapter.ts (references, usings, base lists, environment and friend strings), csharp-definitions.ts (a walk of the declarations), csharp-project.ts (.csproj facts from the XML), csharp-resolution.ts (the resolver: projects, the per-pass index of what each project declares, C#'s name lookup, InternalsVisibleTo) and csharp-preprocessor.ts (the first branch of each #if). One entry in adapters.ts: csharp reads .cs (readCSharp) and .csproj (projectFacts). Owners: code-facts/tests/csharp-facts.test.ts over the fixture solution code-facts/tests/fixtures/csharp-shop, and code-check/tests/csharp-check.test.ts.

Contract extension (facts.ts, reader.ts, adapters.ts, definition-site.ts), the smallest that expresses name resolution within a project:
- ImportResolver.inModule?(from, parsed) -> Promise<ModuleReading { definitions, targets }>: for a language whose files see their module's names without an import, where each reference no import names leads, and the definitions with the visibility the module gives them. reader.ts awaits it per file.
- The resolver factory gets a third argument ReadParsed (relative) -> Promise<ParsedFacts | undefined>: another file's facts through the cache, one parse at a time. A pass now parses a file once also when a resolver reads it first (parsedOnce in reader.ts).
- Target.via?: the files that pass a name on; definitionSite carries it into the site's via, so evidence and ANCHOR_MISMATCH treat a C# project file as the code check already treats an index.ts.
- Reference.kind adds build-dependency; ReferenceVia adds assembly (a friend name InternalsVisibleTo writes as a string); Reference.asType?: true where the syntax lets only a type stand.

Decisions the ADR left open:
1. Resolved, not candidate. C#'s lookup binds a namespace-qualified name to its declaration over what the project and its referenced projects declare; the namespace and name are the declaration's address, as an import path names a file (ADR 0046's resolved: the code names the file or the address). Uses through a value (_ledger.Post resolves only to the field), members a base class declares, and same-file names stay for the language server (TASK-367.14).
2. Lookup order: the prefixes of the innermost definition around the use (types and namespaces, innermost first, so a member another file of a partial class declares is found), then the file's aliases, then its usings and the project's global usings; a using static reads as a namespace. The longest run of the use's names that is declared wins; the target is that declaration, not the names after it.
3. A name may be a type only where the syntax lets only a type stand (asType: type positions, new, attributes, typeof, base lists). Any other name under a namespace or a using needs the member after the type (Ledger.Create); a bare Ledger used as a value finds no type, because it may be a local or an inherited property. A member of a value the code does not name (a call's result, a cast, an element) is spelled with the lone dot (.Command) and looked up nowhere. A property pattern's member names are no uses; patterns are types.
4. A partial type declared in several files leads to the using file if it declares it, else the file named after the type, else the first in path order.
5. Projects: a .csproj and the .cs files below its directory, not below a nested project file, not in bin or obj (the SDK's default glob); Compile items, Directory.Build.props and imported .props are not read. Loose .cs files below no project form one project. ProjectReferences are followed transitively, as the SDK passes them on.
6. A name another project declares reaches the using file through that project's file (Target.via), so a part bound to a .csproj holds and owns what its project declares for other projects' code. Within a project there is no via: a part bound to a folder of the project owns its code (the first trial gave the .csproj-bound container every piece and dropped them as nested).
7. Visibility: the modifier as written (public, internal, protected, private, protected internal, private protected, file), else C#'s default (internal for a type in a namespace, public in an interface or enum and for a record's positional property, private otherwise). exposed = public with every holder public, as TypeScript's rule. An internal definition (a word containing internal) names its project's friends per pass: "internal, InternalsVisibleTo(A, B)", from [assembly: InternalsVisibleTo("A")] (also "A,PublicKey=" + key) and from InternalsVisibleTo and AssemblyAttribute items in the .csproj.
8. Evidence kinds: a run-time use is call (call, construction, static member, attribute, typeof, the base class); a type position, an interface and a pattern are import. The first base-list entry of a class or record is its base class unless named as .NET names an interface (I and a capital); later entries and every entry of a struct or interface are interfaces.
9. ProjectReference is build-dependency evidence on the referenced project file (resolved). PackageReference is build-dependency evidence on a package outside the checkout: it resolves to no file and joins no parts; an anchor can cite it. Condition attributes are not evaluated; MSBuild never runs.
10. Of each #if, the first branch is read and the other branches and the directives are blanked line by line (tree-sitter reads all branches as code; one #else hid all 133 lines of System.CommandLine's Argument{T}.cs).
11. A .csproj binding stays a file binding (part-code.ts is outside the fence): its code is the project file and what its project passes to other projects, but uses inside its .cs files are owned by a part bound to the project directory or a file, not by the .csproj part. A board that wants the project's own uses as evidence binds the project directory.

Real repositories (scratch clones, temporary vaults, the real checkCode): System.CommandLine (ba7fb9b) 213 files cold 415 to 644 ms, warm 29 to 60 ms; BenchmarkDotNet (34da531) 1,204 files cold 1.5 to 1.8 s, warm 0.2 to 0.3 s. A 12-part board over System.CommandLine: every finding right (planted BINDING_SYMBOL_MISSING and ANCHOR_MISMATCH; RELATIONSHIP_UNDRAWN on Parsing, Invocation, Completions from constructions, static members and base classes; RELATIONSHIP_BACKWARDS on Invocation -> Parse result and on a project reference drawn the wrong way). The first runs gave five wrong pieces (an inherited property passed as a value, a property-pattern member, a cast result's member, two is-patterns) and the misowned container pieces; decisions 3, 6 and 10 fixed them. BenchmarkDotNet board: six undrawn warnings and one backwards finding, each right. Grammar gaps left: C# 14 extension blocks, and an interpolated verbatim string with doubled quotes, which puts a whole file in error. docs/design/design-checks.md records the measurement.

For TASK-367.14 (the C# language server): add a csharp row to language-servers/lib/languages.ts (.cs, languageId csharp, no default server: csharp-ls and Roslyn evaluate MSBuild, so only from language-servers.json); the uses to ask are those with no target: spellings through a value (x.Post, and the lone-dot .Command, whose last name positionOf finds), and value names the lookup refuses (members a base class declares). C# targets from the lookup are resolved and need no server.

Closing: Archboard server@TASK-367.11 branched from w0PeUZWt; TASK-367.09 (and .27, .17, .12, .21) adopted after, so the change was restated on "TASK-367.11 after TASK-367.09" (the Code facts description, at its 2,000-character limit: the C# sentence is short and other sentences were tightened without dropping a fact), TASK-367.11 shelved with that reason, and the restated proposal adopted at v131. check --code with and without --variant: no line differs. Footprint against base 4f2485841 (parent of e8f1d0d61): namedAndChanged Code facts; changedNotNamed Code check (e8f1d0d61 only adds the test csharp-check.test.ts, the board stays true; the other commits are other tasks'), Archboard server, Code check route, Language servers (other tasks' commits); namedNotChanged none. ./bin/dogfood check: no diagnostics.

Independent review (2026-10-06) supersedes decisions 6 and 11: a part bound to a .csproj now binds its project (every file below its directory, as the SDK compiles them), and Target.via is gone (cbe24a2b2). It also fixed a later #if branch's symbols being reported missing (they are now unparsed parts), partial types taking C#'s default accessibility instead of another part's, and global:: names looked up from enclosing namespaces. C#'s exposure rule was added for the interface check (1eaf25d28). Follow-up: the history lens still maps a .csproj binding to that one file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code check now reads C# and .NET projects through tree-sitter: types and members with C#'s accessibility, partial types merged, InternalsVisibleTo read from the attribute or the project file, and names resolved by C#'s lookup over a project and the projects it references, including global:: and using aliases. ProjectReference and PackageReference give build-dependency evidence, MSBuild is never evaluated, and a part bound to a .csproj binds its project. A C# project is also a module for the interface check. Verified by csharp-facts.test.ts and csharp-check.test.ts (pass with --isolate) and on System.CommandLine and eShopOnWeb, where every checked cross-file target and every undrawn warning was right.
<!-- SECTION:FINAL_SUMMARY:END -->
