// What a TypeScript or TSX file imports: each `import`, each `export ... from`,
// each `import()` and each `require()`, and the names each one brings in.
// Whether only types use a name is decided once the file's references are
// read (typescript-adapter.ts).

import type { Node } from "web-tree-sitter";
import type { Import, ImportedName } from "@/runtime/code-facts/lib/facts";

/**
 * Whether a statement or a specifier carries the keyword `type`.
 * @param node The node.
 * @returns True for `import type`, `export type` or `type Name`.
 */
function declaredType(node: Node): boolean {
	return node.children.some((child) => child.type === "type");
}

/**
 * The text of a string literal, without its quotes.
 * @param node The string.
 * @returns Its text; the empty string has none.
 */
function stringText(node: Node | null): string {
	return node?.namedChildren.find((child) => child.type === "string_fragment")?.text ?? "";
}

/**
 * The names one specifier brings in: `name`, `name as alias`, `type name`.
 * @param specifier An import or export specifier.
 * @param typeOnly Whether the whole statement is type-only.
 * @returns The name.
 */
function specified(specifier: Node, typeOnly: boolean): ImportedName {
	const imported = specifier.childForFieldName("name")?.text ?? "";
	const local = specifier.childForFieldName("alias")?.text ?? imported;
	return { imported, local, typeOnly: typeOnly || declaredType(specifier) };
}

/**
 * The names one part of an `import` clause brings in: the default, `* as name`,
 * or `{ ... }`.
 * @param part The part.
 * @param typeOnly Whether the statement is `import type`.
 * @returns Each name.
 */
function partNames(part: Node, typeOnly: boolean): ImportedName[] {
	if (part.type === "identifier") return [{ imported: "default", local: part.text, typeOnly }];
	if (part.type === "namespace_import") {
		return [{ imported: "*", local: part.namedChildren[0]?.text ?? "", typeOnly }];
	}
	return part.namedChildren
		.filter((specifier) => specifier.type === "import_specifier")
		.map((specifier) => specified(specifier, typeOnly));
}

/**
 * The names an `import` clause brings in.
 * @param clause The clause, if the statement has one.
 * @param typeOnly Whether the statement is `import type`.
 * @returns Each name; a side-effect import brings in none.
 */
function clauseNames(clause: Node | undefined, typeOnly: boolean): ImportedName[] {
	return clause?.namedChildren.flatMap((part) => partNames(part, typeOnly)) ?? [];
}

/**
 * The names an `export ... from` passes on: named, `* as name`, or all.
 * @param statement The statement.
 * @param typeOnly Whether it is `export type`.
 * @returns Each name.
 */
function reexportedNames(statement: Node, typeOnly: boolean): ImportedName[] {
	const clause = statement.namedChildren.find((child) => child.type === "export_clause");
	if (clause !== undefined) {
		return clause.namedChildren
			.filter((specifier) => specifier.type === "export_specifier")
			.map((specifier) => specified(specifier, typeOnly));
	}
	const namespace = statement.namedChildren.find((child) => child.type === "namespace_export");
	const local = namespace?.namedChildren[0]?.text ?? "*";
	return [{ imported: "*", local, typeOnly }];
}

/**
 * One `import` or `export ... from` statement.
 * @param statement The statement.
 * @returns The import.
 */
function staticImport(statement: Node): Import {
	const typeOnly = declaredType(statement);
	const reexport = statement.type === "export_statement";
	const names = reexport
		? reexportedNames(statement, typeOnly)
		: clauseNames(
				statement.namedChildren.find((child) => child.type === "import_clause"),
				typeOnly,
			);
	return {
		specifier: stringText(statement.childForFieldName("source")),
		line: statement.startPosition.row + 1,
		names,
		typeOnly,
		reexport,
	};
}

/**
 * One `import()` or `require()`, by the string it names.
 * @param specifier The string's text node.
 * @returns The import, which brings in the whole module at run time.
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

export { dynamicImport, staticImport };
