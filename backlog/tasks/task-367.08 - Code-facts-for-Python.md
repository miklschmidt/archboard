---
id: TASK-367.08
title: Code facts for Python
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 15:17'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 616000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The second adapter makes the seam between the check and the languages real, and the skill evaluations run on Flask checkouts, which are Python.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Imports resolve for absolute, relative and package imports, including `__init__.py`
- [ ] #2 Definitions carry their visibility: listed in `__all__`, or not starting with `_`
- [ ] #3 The anchor, binding, undrawn and backwards checks work for parts bound to Python files
- [ ] #4 A small fixture package owns the behaviour in tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.08 changes the Code facts part's description (the adapter table, the Python adapter and how it resolves imports). No new part or relationship: the adapters live inside src/runtime/code-facts, which the board draws as one module. No other board draws code facts.
1. New files first (no shared edits): python.scm (query against tree-sitter-python 0.25.0), python-adapter.ts / python-definitions.ts / python-imports.ts (definitions with Python's visibility: __all__ when the module lists it, else not starting with _; references with call or import evidence and type-only, annotations and if TYPE_CHECKING: are types; environment names through os.environ / os.getenv; imports one per name), python-resolution.ts (absolute, relative and package imports; __init__.py; a name that is a submodule resolves to the submodule; roots: the importing file's own root, the nearest directory without __init__.py, then the source roots of the nearest pyproject.toml or setup.cfg, then src and the project directory). Tests: python-facts.test.ts over a small on-disk fixture package under src/runtime/code-facts/tests/fixtures/.
2. Adapter table: adapters.ts holds one entry per adapter (name, extensions with their grammar file, query, facts function, import resolver). grammars.ts loads a grammar file and its query once, on first use. reader.ts looks the extension up in the table; resolution goes through the entry's resolver, which resolves an Import (so Python can say a name is a submodule), and the reader computes each reference's target from the resolved import. SyntaxFacts.adapter names the adapter. definition-site and code-check/support.ts test for the text reading instead of naming TypeScript. Wait for the TASK-367.07 reviewer's uncommitted hunks before editing shared files.
3. code-check: python-check.test.ts proves the anchor, binding, undrawn and backwards checks on parts bound to a Python package.
4. Try the check on the evaluation's Flask 3.0.0 checkout through a temporary vault with bound parts; record what it finds, and measure parse time if it matters (design-checks.md). authoring.md names the languages the check reads.
5. Close the proposal per archboard-dev (check --code with and without --variant, footprint, adopt).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (a665606e1 code, 712be81ca docs, a7d9b7302 opener test): src/runtime/code-facts gains python.scm, python-adapter.ts, python-definitions.ts, python-imports.ts, python-resolution.ts and unparsed.ts (shared by both adapters), and adapters.ts, the table of adapters. grammars.ts loads one grammar file and its query on first use. reader.ts looks the extension up in the table, keeps one resolver per checkout and adapter, and computes each reference's target from the resolved import. facts.ts: AdapterName, ResolvedImport, ImportResolver, ReadText; ReferenceThroughImport is now { import, local }. definition-site.ts and code-check/lib/support.ts test for the text reading instead of naming TypeScript. Owners: code-facts/tests/python-facts.test.ts over the fixture package code-facts/tests/fixtures/python-shop, and code-check/tests/python-check.test.ts.

What a later language adds: its query file (lib/<lang>.scm), its facts function (tree, grammar) -> ParsedFacts, its import resolver (checkout, read) -> ImportResolver whose resolve(from, import) returns the import with resolved set (and its names rewritten where the file names them otherwise), its name in AdapterName (facts.ts), and one entry in ADAPTERS (adapters.ts): name, extensions with their .wasm, query, facts, resolver. Nothing else changes.

Decisions the ADR left open:
1. Definitions: module-level functions, classes, type aliases and assigned names (also under if/try/with at module level), and the members of a class there (methods, class attributes, nested classes), qualified by their classes (Ledger.post). Locals of a function and self.x attributes are not definitions. A decorated definition spans its decorators.
2. Visibility words: a module that sets __all__ gives `__all__` (listed) or `not in __all__`; a module without one gives `public` or `non-public` (_name), as from module import * reads it. A member is `public`, `non-public` (_name) or `name-mangled` (__name); a special method (__init__) is public. exposed: __all__ or public, and a member also needs an exposed class. __all__ is read from list or tuple literals assigned, added with += or passed to extend/append. Exposure means outside the file: what a package passes on through __init__.py is not decided here (see Left open).
3. References: a use at run time is call evidence; a use in an annotation, in a string annotation ("Flask") or in the body of if TYPE_CHECKING: is import evidence and type-only; an import under TYPE_CHECKING is type-only. A name after `.` is spelled with its chain (os.environ), as in TypeScript. Keyword argument names, parameters, loop and `as` targets, global/nonlocal names are not uses.
4. Strings that count: environment names through os.environ["N"], os.environ.get/setdefault/pop("N"), "N" in os.environ, os.getenv("N") and getenv("N"). A bare environ["N"] is not read, because in a WSGI application environ is the request's. Events: the first string argument of signal, on, once or emit (blinker names Flask's signals this way, python-socketio and pyee use on/emit).
5. Imports: `import a.b` brings in the local name a.b (the file spells its uses a.b.x), `import a.b as m` the local m; a `from` statement gives one import per name, because one name can be a submodule and the next a name the module defines. `from m import *` is a re-export (it passes every public name on); no reference resolves through it. importlib.import_module("x") and __import__("x") are loads of the whole module. An unused import is neither a use nor a load: in an __init__.py it is how a package passes names on, and TASK-367.07 counts no re-export as a use.
6. Resolution, in order: relative imports against the importing file's package (dots walk up; above the checkout root resolves nowhere). Absolute imports against (a) the file's own root, the nearest directory above it without __init__.py; (b) the source roots the nearest pyproject.toml or setup.cfg names (setuptools package-dir "" and packages.find.where, Poetry packages from, the parent directories of Hatch wheel packages; setup.cfg options.package_dir "=dir" and options.packages.find where); (c) that project's src and the project directory (the checkout root with no project file). A module is x.py, x/__init__.py or their .pyi stubs, .py first. `from p import n` resolves to the submodule p/n.py when one exists, and to p otherwise. A namespace package directory resolves to no file. A module that resolves to no checkout file is a package of the environment.
7. .pyi stubs are read as Python too.
8. The TypeScript resolver keeps its interface and the table wraps it, so module-resolution.ts did not change (TASK-368.10's exposure files import CheckoutFiles from it).

Flask 3.0.0 (735a4701, the evaluation's checkout, cloned to a scratch directory): 82 .py files read cold in 168 to 171 ms, grammar load included, 5 ms warm; no unparsed line; 1,096 definitions, 4,601 references, 621 imports, 281 resolved. Every import of Flask's own code in src and tests resolves; the open ones are the standard library, installed packages and the examples, which are projects of their own that install flask. A temporary vault with one board of 13 parts bound to src/flask and 9 relationships through the real checkCode: 189 ms cold, 102 ms warm, nothing read as text. Findings, each right: BINDING_SYMBOL_MISSING on Config (bound to Config.from_missing, planted); ANCHOR_SYMBOL_MISSING on Flask app -> Wrappers (NoSuchName, planted) and on Flask app -> JSON (anchored at json.provider.DefaultJSONProvider in app.py, which only sansio/app.py names: my anchor was wrong); RELATIONSHIP_UNDRAWN warnings, every piece resolved: Contexts <- Sansio app (sansio/app.py:184 _AppCtxGlobals through from ..ctx); Globals <- Flask app, Blueprints, CLI, Contexts, JSON, Templating, Wrappers (current_app, _cv_app); Signals <- Flask app (got_request_exception), Helpers (message_flashed); Helpers <- Flask app, Blueprints, CLI, Sansio app, Templating, Wrappers; JSON <- Sansio app (DefaultJSONProvider), Sessions (TaggedJSONSerializer), Wrappers (wrappers.py:30 json, a submodule import); Templating <- Sansio app (Environment); Wrappers <- Helpers (Response). RELATIONSHIP_BACKWARDS: Signals -> Templating (templating.py:130 sends before_render_template). The anchored relationships Flask app -> Sansio app (App), Flask app -> Contexts (RequestContext), Contexts -> Signals (appcontext_pushed) hold and support; CLI -> Flask app, Flask app -> Sessions and Helpers -> Globals have supporting evidence.

Outside the fence: src/server/code-opener/tests/symbol-line.test.ts used a .py file as its example of a file read as text; Python is now read, so the example is a Ruby file (a7d9b7302).

Closing: Archboard server@TASK-367.08 branched from CcqLAdE6; TASK-368.10 adopted after, so the change (the Code facts description) was restated on "TASK-367.08 after TASK-368.10", keeping TASK-368.10's responsibility and exposure sentence; TASK-367.08 was shelved with that reason, and the restated proposal adopted. check --code with and without --variant: no line differs; no finding is about Code facts; skipped text-only lists .json, .md, .scm. Footprint against base 8a3fd4def (parent of a665606e1): namedAndChanged Code facts (a665606e1); changedNotNamed Code opener (a7d9b7302 swaps a test fixture, the board stays true) and Code check (a665606e1 changes one line of support.ts to test for the text reading and adds a test; the board's description is language-neutral and stays true; 71a4b3c0a and c7dc840c7 belong to TASK-367.13 and TASK-367.07); namedNotChanged none; 5 drill-down parts skipped, no other board has a proposal. ./bin/dogfood check: no diagnostics. Behind names none of this task's commits.

Left open: (1) module-exposure.ts (TASK-368.10) says Python adds its exposure rule with this adapter. It is not added: it needs the module's __all__ list in the facts and a rule for what __init__.py passes on (from .app import Flask as Flask); a follow-up decides it. (2) code-facts/index.ts's header still says only TypeScript and TSX have an adapter; TASK-368.10 had an uncommitted hunk on those lines, so it was left. (3) skills/archboard-dev/SKILL.md step 1 says only TypeScript and TSX have an adapter (TASK-367.26's file).

Correction to Left open (2): code-facts/index.ts was clean again later, so its header now names Python and the adapter table.

Gate (lanes one at a time, after a665606e1): lint exit 1 only on evidence.ts reachedBy complexity, an uncommitted hunk of another agent (TASK-367.13); fmt:check exit 1 only on INSTALL.md, another agent's uncommitted edit; type-check 0; build:frontend 0; test:modules 4133 pass 0 fail, exit 1 from one unhandled React teardown error (window is not defined) in a UI test; test:system 195/0; test:repository 20/0; test:serial-browser exit 0. code-facts and code-check owners 43/0 with --isolate; eval:skill check: suite ok.

Review (4d782f721), the table's contract changed: an entry is { name, reads, resolver }. reads maps each extension (.py) or whole file name (flake.lock, compose.yaml; a whole name wins) to a ParseFacts (facts.ts): (text) => ParsedFacts | Promise<ParsedFacts>. A tree-sitter language builds it with treeSitter(wasm, query file, facts(tree, grammar)) from grammars.ts; a YAML, JSON or TOML adapter writes its own over Bun's parsers, with no grammar. Two entries that read the same name throw when adapters.ts loads. What a later language adds is otherwise unchanged: its files, its name in AdapterName (facts.ts), one entry in ADAPTERS.

Review, Python semantics (43e8e8262): (1) The Flask finding Wrappers <- Helpers (helpers.py:253 Response) was wrong: that Response is the parameter of redirect(), and helpers.py imports wrappers.Response only under TYPE_CHECKING. A name that a function, a lambda or a comprehension binds for itself (parameter, local, loop or as target, nested def) now hides an import of the same name inside it (python-scopes.ts); a name the scope imports itself still reaches its import (app.py test_client imports FlaskClient as cls). On Flask the rerun gives the other findings unchanged and drops that one. (2) Decision 2: __all__.extend([...]) was never read (the adapter looked for strings directly in the arguments); it is now, and a module that builds __all__ any other way (base.__all__ + [...], a comprehension) is read by the leading underscore instead of hiding every name. (3) Decision 3: a string in an annotation is a forward reference only where a type stands; Literal's values, Annotated's metadata and strings in a call inside an annotation named words as types. (4) Decision 6: Python finds a package before a module of the same name, so a/b/__init__.py now wins over a/b.py. (5) Decision 1: a name assigned under a module-level for, while or match is a module-level definition too. Facts of Flask's 82 files: about 8 ms more (60 to 68 ms, minimum of 12 rounds). skills/archboard-dev step 1 now points at the table of adapters (38784a4a6).
<!-- SECTION:NOTES:END -->
