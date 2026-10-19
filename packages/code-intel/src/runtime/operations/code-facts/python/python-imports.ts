// What a Python file imports: each `import`, each `from ... import`, and each
// `importlib.import_module()` or `__import__()` of a module named in a string.
// Whether only types use a name is decided once the file's references are
// read (python-adapter.ts).
//
// The specifier is the module as Python spells it, leading dots and all:
// `flask.json`, `.app`, `..`. `import a.b` binds `a`, and the file then spells
// its uses `a.b.name`, so the name it brings in is `a.b`. A `from` statement
// gives one import for each name, because one name can be a submodule and the
// next a name the module defines, and only the resolver can tell
// (python-resolution.ts). `from module import *` passes every public name of
// the module on, as `export * from` does.

import type { Node } from "web-tree-sitter";
import type { Import, ImportedName } from "#runtime/operations/code-facts/facts.ts";

/**
 * A dotted name as Python spells it.
 * @param node A dotted name or a name.
 * @returns Its names joined by `.`.
 */
function dotted(node: Node): string {
	return node.type === "dotted_name"
		? node.namedChildren.map((name) => name.text).join(".")
		: node.text;
}

/**
 * The module a `from` statement names, with the dots of a relative import.
 * @param node The statement's module name.
 * @returns The specifier, such as `..pkg.mod` or `.`.
 */
function moduleOf(node: Node | null): string {
	if (node === null) return "";
	if (node.type !== "relative_import") return dotted(node);
	const prefix = node.namedChildren.find((child) => child.type === "import_prefix")?.text ?? "";
	const name = node.namedChildren.find((child) => child.type === "dotted_name");
	return `${prefix.replaceAll(/\s/gu, "")}${name === undefined ? "" : dotted(name)}`;
}

/**
 * What one name of an import statement brings in.
 * @param name A dotted name or an aliased import.
 * @param module Whether the name is a module (`import`) or a name in one (`from`).
 * @param typeOnly Whether the statement only serves types.
 * @returns The module the name names, if it names one, and the name.
 */
function named(
	name: Node,
	module: boolean,
	typeOnly: boolean,
): { readonly path: string; readonly name: ImportedName } {
	const path = dotted(name.childForFieldName("name") ?? name);
	const local = name.childForFieldName("alias")?.text ?? path;
	return { path, name: { imported: module ? "*" : path, local, typeOnly } };
}

/**
 * The imports of one `import` or `from ... import` statement.
 * @param statement The statement.
 * @param typeOnly Whether it sits where only types are named (`if TYPE_CHECKING:`).
 * @returns One import for each module it names.
 */
function staticImports(statement: Node, typeOnly: boolean): Import[] {
	const line = statement.startPosition.row + 1;
	const names = statement.childrenForFieldName("name");
	if (statement.type === "import_statement") {
		return names.map((name) => {
			const found = named(name, true, typeOnly);
			return { specifier: found.path, line, names: [found.name], typeOnly, reexport: false };
		});
	}
	const specifier = moduleOf(statement.childForFieldName("module_name"));
	if (statement.namedChildren.some((child) => child.type === "wildcard_import")) {
		const all = { imported: "*", local: "*", typeOnly };
		return [{ specifier, line, names: [all], typeOnly, reexport: true }];
	}
	return names.map((name) => ({
		specifier,
		line,
		names: [named(name, false, typeOnly).name],
		typeOnly,
		reexport: false,
	}));
}

/**
 * One `import_module()` or `__import__()`, by the module its string names.
 * @param specifier The string's text node.
 * @returns The import, which runs the whole module.
 */
function dynamicImport(specifier: Node): Import {
	return {
		specifier: specifier.text,
		line: specifier.startPosition.row + 1,
		names: [],
		typeOnly: false,
		reexport: false,
	};
}

/**
 * The names a module passes on from its imports, as `from module import *`
 * reads it: each name an import binds that `__all__` lists, or, in a module
 * that sets no `__all__`, each that does not start with `_`. Each is one more
 * import, a re-export, beside the import that binds the name. A package's
 * `__init__.py` passes names on this way (`from .book import Ledger`).
 * @param imports The module's imports.
 * @param listed The names `__all__` lists, or undefined when the module sets none.
 * @returns The re-exports.
 */
function passedOn(imports: readonly Import[], listed: ReadonlySet<string> | undefined): Import[] {
	return imports.flatMap((found): Import[] => {
		if (found.reexport) return [];
		const names = found.names.filter((name) =>
			listed === undefined ? !name.local.startsWith("_") : listed.has(name.local),
		);
		return names.length === 0 ? [] : [{ ...found, names, reexport: true }];
	});
}

export { dynamicImport, passedOn, staticImports };
