// What a TypeScript or TSX file imports: each `import`, each `export ... from`,
// each `import()` and each `require()`, and the names each one brings in.
// Whether only types use a name is decided once the file's references are
// read (typescript-adapter.ts).
//
// A declaration that takes names from an `import()` or a `require()`,
// `const { run } = await import("./cli")`, imports them as `import { run }`
// does, and declares no name of the file. An `export { name }` or `export
// default name` of a name an import brought in passes it on as `export
// { name } from` does, so it is one more import, a re-export, beside the
// import that brings the name in.

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
 * Whether a node is there and of one type.
 * @param node The node, if any.
 * @param type The type.
 * @returns True when it is.
 */
function isOf(node: Node | null, type: string): node is Node {
	return node?.type === type;
}

/**
 * One name a destructuring pattern takes: `name`, or `name: alias`.
 * @param property A property of an object pattern.
 * @returns The name and the node that declares it, or undefined for a default or a rest.
 */
function takenName(property: Node): readonly [ImportedName, Node] | undefined {
	if (property.type === "shorthand_property_identifier_pattern") {
		return [{ imported: property.text, local: property.text, typeOnly: false }, property];
	}
	if (property.type !== "pair_pattern") return undefined;
	const key = property.childForFieldName("key");
	const value = property.childForFieldName("value");
	return isOf(key, "property_identifier") && isOf(value, "identifier")
		? [{ imported: key.text, local: value.text, typeOnly: false }, value]
		: undefined;
}

/**
 * The declaration whose value an expression is, as an `import()` is the value
 * of `const m = await import("x")`.
 * @param value The expression: a call, or the `await` of one.
 * @returns The declaration, or undefined when the expression stands elsewhere.
 */
function declaring(value: Node): Node | undefined {
	const declarator = value.parent;
	if (!isOf(declarator, "variable_declarator")) return undefined;
	return declarator.childForFieldName("value")?.id === value.id ? declarator : undefined;
}

/**
 * What an `import()` or a `require()` stands as in its statement: the call,
 * or the `await` of it.
 * @param specifier The string the call names.
 * @returns The expression.
 */
function callValue(specifier: Node): Node | undefined {
	const call = specifier.parent?.parent?.parent;
	if (call === null || call === undefined) return undefined;
	return isOf(call.parent, "await_expression") ? call.parent : call;
}

/**
 * The pattern a declaration binds to what an `import()` or a `require()` gives.
 * @param specifier The string the call names.
 * @returns The pattern, or undefined when no declaration takes the call's value.
 */
function patternOf(specifier: Node): Node | undefined {
	const value = callValue(specifier);
	const declarator = value === undefined ? undefined : declaring(value);
	return declarator?.childForFieldName("name") ?? undefined;
}

/**
 * The names a declaration takes from an `import()` or a `require()` it is the
 * value of: the whole module as `m`, or `{ a, b: c }`. A pattern with a
 * default or a rest takes none, so the call stays a load of the whole file.
 * @param specifier The string the call names.
 * @returns Each name and the node that declares it.
 */
function takenNames(specifier: Node): (readonly [ImportedName, Node])[] {
	const pattern = patternOf(specifier);
	if (pattern?.type === "identifier") {
		return [[{ imported: "*", local: pattern.text, typeOnly: false }, pattern]];
	}
	if (pattern?.type !== "object_pattern") return [];
	const taken = pattern.namedChildren.map(takenName);
	return taken.every((each) => each !== undefined) ? taken : [];
}

/**
 * One `import()` or `require()`, by the string it names.
 * @param specifier The string's text node.
 * @returns The import: of the names a declaration takes from it, else a load of the whole module at run time.
 */
function dynamicImport(specifier: Node): Import {
	return {
		specifier: specifier.text,
		line: specifier.startPosition.row + 1,
		names: takenNames(specifier).map(([name]) => name),
		typeOnly: false,
		reexport: false,
	};
}

/**
 * Whether an export specifier says `type`: `export { type a }`, `export type { a }`.
 * @param specifier The specifier.
 * @returns True when it does.
 */
function exportsType(specifier: Node): boolean {
	const statement = specifier.parent?.parent;
	return (
		declaredType(specifier) ||
		(statement !== null && statement !== undefined && declaredType(statement))
	);
}

/**
 * The name an export gives what it exports: its alias, its own name, or
 * `default` for `export default name`.
 * @param node The exported name.
 * @param specifier Its export specifier; none for `export default`.
 * @returns The name.
 */
function exportedAs(node: Node, specifier: Node | undefined): string {
	if (specifier === undefined) return "default";
	return specifier.childForFieldName("alias")?.text ?? node.text;
}

/**
 * The re-export an `export { name as alias }` or an `export default name` of
 * an imported name makes: from where the import leads, under the name the
 * export gives.
 * @param node The exported name.
 * @param found The import that brings the name in.
 * @param name What the import names.
 * @returns The re-export.
 */
function passedOnAs(node: Node, found: Import, name: ImportedName): Import {
	const specifier = isOf(node.parent, "export_specifier") ? node.parent : undefined;
	const local = exportedAs(node, specifier);
	const typeOnly = name.typeOnly || (specifier !== undefined && exportsType(specifier));
	return {
		specifier: found.specifier,
		line: node.startPosition.row + 1,
		names: [{ imported: name.imported, local, typeOnly }],
		typeOnly,
		reexport: true,
	};
}

/**
 * The names a file exports that an import brought in, each a re-export from
 * where that import leads: `export { a as b }` and `export default a`.
 * @param exported The names of `export { ... }` without a source, and of `export default <name>`.
 * @param imports The file's imports.
 * @returns One re-export for each.
 */
function exportedImports(exported: readonly Node[], imports: readonly Import[]): Import[] {
	const brought = new Map(
		imports.flatMap((found) =>
			found.reexport ? [] : found.names.map((name) => [name.local, { found, name }] as const),
		),
	);
	return exported.flatMap((node) => {
		const source = brought.get(node.text);
		return source === undefined ? [] : [passedOnAs(node, source.found, source.name)];
	});
}

export { dynamicImport, exportedImports, staticImport, takenNames };
