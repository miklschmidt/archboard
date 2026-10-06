---
id: TASK-367.11
title: Code facts for C# and .NET projects
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 15:08'
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
- [ ] #1 Type and member references resolve by name within a project, including partial classes that span files
- [ ] #2 `ProjectReference` and `PackageReference` in `.csproj` files give project-level dependencies
- [ ] #3 Definitions carry their visibility: `public`, `internal`, `private`, and `InternalsVisibleTo`
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to C# files or projects
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
