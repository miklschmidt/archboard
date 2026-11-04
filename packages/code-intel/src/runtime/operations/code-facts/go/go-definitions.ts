// The definitions of a Go file (ADR 0046, TASK-575): its declarations at file
// level, and the members of the types it declares.
//
// A method is spelled with the type its receiver names, wherever the type is
// declared (`Ledger.Post` for `func (l *Ledger) Post()`), a field of a struct
// and a method of an interface with their type (`Ledger.Name`). An embedded
// field is named by its type's last name, as Go names it. A declaration inside
// a function body is a local, and is no definition.
//
// Go has no word for visibility: a name that starts with an upper-case letter
// is exported from its package, any other is not. So the visibility reads
// `exported` or `unexported`. A definition is exposed when code of another
// package can name it: an exported name, and for a member also an exported
// type. A method of an unexported type can still be reached through an
// interface, but no other package can name it.

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/operations/code-facts/facts.ts";
import { sourceRange } from "#runtime/operations/code-facts/spans.ts";

/**
 * Whether Go exports a name: its first letter is upper case.
 * @param name The name.
 * @returns True when it does.
 */
function exportedName(name: string): boolean {
	const first = name.codePointAt(0);
	if (first === undefined) return false;
	const letter = String.fromCodePoint(first);
	return letter !== letter.toLowerCase() && letter === letter.toUpperCase();
}

/**
 * One definition.
 * @param node Its declaration.
 * @param symbol Its spelled name.
 * @param kind Its kind.
 * @param exposed Whether another package can name it.
 * @returns The definition.
 */
function definition(
	node: Node,
	symbol: string,
	kind: Definition["kind"],
	exposed: boolean,
): Definition {
	const last = symbol.slice(symbol.lastIndexOf(".") + 1);
	return {
		symbol,
		kind,
		start: node.startPosition.row + 1,
		end: node.endPosition.row + 1,
		source: sourceRange(node),
		visibility: exportedName(last) ? "exported" : "unexported",
		exposed,
	};
}

/** The field that holds the type a generic or a qualified type names. */
const INNER_FIELD: Readonly<Record<string, string>> = {
	generic_type: "type",
	qualified_type: "name",
};

/** One member of a type: its declaration, its name and its kind. */
interface Member {
	readonly node: Node;
	readonly name: string;
	readonly kind: Definition["kind"];
}

/**
 * The first named child of a node.
 * @param node The node.
 * @returns The child, or null.
 */
function firstChild(node: Node): Node | null {
	return node.namedChildren[0] ?? null;
}

/**
 * The name of the type a receiver or an embedded field names: its last name,
 * without a pointer or generic arguments.
 * @param type The type.
 * @returns The name, or undefined for a type that has none.
 */
function typeName(type: Node | null): string | undefined {
	if (type === null) return undefined;
	if (type.type === "type_identifier") return type.text;
	const inner = innerType(type);
	return inner === undefined ? undefined : typeName(inner);
}

/**
 * The type a pointer, a generic type or a qualified type names.
 * @param type The type.
 * @returns The type inside it, or undefined for any other type.
 */
function innerType(type: Node): Node | null | undefined {
	if (type.type === "pointer_type") return firstChild(type);
	const field = INNER_FIELD[type.type];
	return field === undefined ? undefined : type.childForFieldName(field);
}

/**
 * The names a field declaration gives: its names, or its type's last name
 * for an embedded field.
 * @param field The declaration.
 * @returns The names.
 */
function fieldNames(field: Node): string[] {
	const names = field.childrenForFieldName("name").map((name) => name.text);
	const embedded = names.length === 0 ? typeName(field.childForFieldName("type")) : undefined;
	return embedded === undefined ? names : [embedded];
}

/**
 * The fields and methods of a struct or an interface type.
 * @param type The type's body.
 * @returns The members.
 */
function membersIn(type: Node): Member[] {
	if (type.type === "interface_type") {
		return type.namedChildren.flatMap((node): Member[] => {
			const name = node.type === "method_elem" ? node.childForFieldName("name") : null;
			return name === null ? [] : [{ node, name: name.text, kind: "function" }];
		});
	}
	const list = type.type === "struct_type" ? firstChild(type) : null;
	const fields = list?.namedChildren.filter((child) => child.type === "field_declaration") ?? [];
	return fields.flatMap((node) =>
		fieldNames(node).map((name): Member => ({ node, name, kind: "value" })),
	);
}

/**
 * The definitions of one type declaration: each type it declares, and their members.
 * @param declaration The declaration.
 * @returns Them.
 */
function typesOf(declaration: Node): Definition[] {
	return declaration.namedChildren.flatMap((spec) => {
		const name = spec.childForFieldName("name")?.text;
		if (name === undefined) return [];
		const type = spec.type === "type_spec" ? spec.childForFieldName("type") : null;
		const members = (type === null ? [] : membersIn(type)).map((member) =>
			definition(
				member.node,
				`${name}.${member.name}`,
				member.kind,
				exportedName(name) && exportedName(member.name),
			),
		);
		return [definition(spec, name, "class", exportedName(name)), ...members];
	});
}

/**
 * The definitions of one `const` or `var` declaration: a function literal
 * assigned to a name is a function, any other value a value.
 * @param declaration The declaration.
 * @returns Them.
 */
function valuesOf(declaration: Node): Definition[] {
	const specs = declaration.namedChildren.flatMap((node) =>
		node.type === "var_spec_list" ? node.namedChildren : [node],
	);
	return specs.flatMap((spec) => {
		const values = spec.childForFieldName("value")?.namedChildren ?? [];
		return spec.childrenForFieldName("name").map((name, index) => {
			const kind = values[index]?.type === "func_literal" ? "function" : "value";
			return definition(spec, name.text, kind, exportedName(name.text));
		});
	});
}

/**
 * The definition of a function.
 * @param node The function declaration.
 * @returns It.
 */
function functionOf(node: Node): Definition[] {
	const name = node.childForFieldName("name")?.text;
	return name === undefined ? [] : [definition(node, name, "function", exportedName(name))];
}

/**
 * The definition of a method, spelled with its receiver's type.
 * @param method The method declaration.
 * @returns It, or none for a receiver whose type has no name.
 */
function methodOf(method: Node): Definition[] {
	const holder = receiverType(method);
	const name = method.childForFieldName("name")?.text;
	if (holder === undefined || name === undefined) return [];
	const exposed = exportedName(holder) && exportedName(name);
	return [definition(method, `${holder}.${name}`, "function", exposed)];
}

/**
 * The name of the type a method's receiver names.
 * @param method The method declaration.
 * @returns The name, or undefined for a receiver whose type has none.
 */
function receiverType(method: Node): string | undefined {
	const receiver = method.childForFieldName("receiver")?.namedChildren[0];
	return receiver === undefined ? undefined : typeName(receiver.childForFieldName("type"));
}

/** The definitions each declaration at file level gives, by its node. */
const DECLARATIONS: Readonly<Record<string, (node: Node) => Definition[]>> = {
	function_declaration: functionOf,
	method_declaration: methodOf,
	type_declaration: typesOf,
	const_declaration: valuesOf,
	var_declaration: valuesOf,
};

/**
 * The definitions of a Go file.
 * @param root The file's syntax tree.
 * @returns Its definitions.
 */
function definitionsOf(root: Node): Definition[] {
	return root.namedChildren.flatMap((node) => DECLARATIONS[node.type]?.(node) ?? []);
}

export { definitionsOf };
